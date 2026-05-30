import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { RingApi } from 'ring-client-api';
import axios from 'axios';
import { createInterface } from 'readline';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let config;
try {
  config = JSON.parse(readFileSync('./config.json', 'utf8'));
} catch {
  console.error('config.json not found. Copy config.example.json to config.json and add your credentials.');
  process.exit(1);
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const ringCameras = new Map();
const blink = { token: null, accountId: null, clientId: null, baseUrl: null, cameras: [] };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function prompt(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(data);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Ring ─────────────────────────────────────────────────────────────────────

async function initRing() {
  const opts = config.ring.refreshToken
    ? { refreshToken: config.ring.refreshToken }
    : { email: config.ring.email, password: config.ring.password };

  const api = new RingApi(opts);

  // Persist refresh token automatically so email/password only needed once
  api.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => {
    config.ring.refreshToken = newRefreshToken;
    writeFileSync('./config.json', JSON.stringify(config, null, 2));
    console.log('[Ring] Token refreshed and saved to config.json');
  });

  const cameras = await api.getCameras();
  cameras.forEach(cam => {
    ringCameras.set(String(cam.id), cam);
    console.log(`[Ring] Found: "${cam.name}" (id: ${cam.id})`);
  });

  console.log(`[Ring] ${cameras.length} camera(s) ready.`);
}

// ─── Blink ────────────────────────────────────────────────────────────────────

async function initBlink() {
  const { email, password } = config.blink;

  const loginRes = await axios.post(
    'https://rest-prod.immedia-semi.com/api/v4/account/login',
    {
      email,
      password,
      unique_id: 'ring-blink-dashboard',
      device_identifier: 'Dashboard-v1',
      app_version: '6.0.0',
      client_type: 'ios',
      reauth: true,
    },
    { headers: { 'Content-Type': 'application/json', 'app-build': '8.0.0.0' } }
  );

  const d = loginRes.data;
  blink.token = d.auth?.token;
  blink.accountId = d.account?.id;
  blink.clientId = d.client?.id;

  const tier = d.account?.tier || 'prod';
  blink.baseUrl = `https://rest-${tier}.immedia-semi.com`;

  if (d.account?.client_verification_required) {
    const pin = await prompt('[Blink] Enter 2FA PIN from your email/SMS: ');
    await axios.post(
      `${blink.baseUrl}/api/v4/account/${blink.accountId}/client/${blink.clientId}/pin/verify`,
      { pin },
      { headers: { 'TOKEN-AUTH': blink.token } }
    );
    console.log('[Blink] 2FA verified.');
  }

  const homeRes = await axios.get(
    `${blink.baseUrl}/api/v3/accounts/${blink.accountId}/homescreen`,
    { headers: { 'TOKEN-AUTH': blink.token } }
  );

  for (const net of homeRes.data?.networks || []) {
    const camRes = await axios.get(
      `${blink.baseUrl}/network/${net.id}/cameras`,
      { headers: { 'TOKEN-AUTH': blink.token } }
    );
    for (const cam of camRes.data?.devicestatus || []) {
      blink.cameras.push({
        id: String(cam.camera_id),
        name: cam.name,
        networkId: String(net.id),
        thumbnailUrl: cam.thumbnail,
      });
      console.log(`[Blink] Found: "${cam.name}" (id: ${cam.camera_id})`);
    }
  }

  console.log(`[Blink] ${blink.cameras.length} camera(s) ready.`);
}

// ─── REST API ─────────────────────────────────────────────────────────────────

app.get('/api/cameras', (_req, res) => {
  const ring = Array.from(ringCameras.values()).map(c => ({
    id: String(c.id), name: c.name, system: 'ring',
  }));
  const blinkCams = blink.cameras.map(c => ({
    id: c.id, name: c.name, system: 'blink',
  }));
  res.json({ cameras: [...ring, ...blinkCams] });
});

app.get('/api/status', (_req, res) => {
  res.json({
    ring: { connected: ringCameras.size > 0, cameras: ringCameras.size },
    blink: { connected: blink.cameras.length > 0, cameras: blink.cameras.length },
  });
});

// ─── Snapshot polling ─────────────────────────────────────────────────────────

async function pollRing(cam) {
  try {
    const snapshot = await cam.getSnapshot();
    broadcast({
      type: 'frame',
      system: 'ring',
      id: String(cam.id),
      name: cam.name,
      data: snapshot.toString('base64'),
      ts: Date.now(),
    });
  } catch {
    // Camera offline or rate-limited; skip this tick
  }
}

async function pollBlink(cam) {
  try {
    // Request camera to capture a fresh thumbnail
    await axios.post(
      `${blink.baseUrl}/network/${cam.networkId}/camera/${cam.id}/thumbnail`,
      {},
      { headers: { 'TOKEN-AUTH': blink.token } }
    ).catch(() => {});

    // Wait for camera to upload the image
    await sleep(2500);

    const url = cam.thumbnailUrl.startsWith('http')
      ? `${cam.thumbnailUrl}.jpg`
      : `${blink.baseUrl}${cam.thumbnailUrl}.jpg`;

    const imgRes = await axios.get(url, {
      headers: { 'TOKEN-AUTH': blink.token },
      responseType: 'arraybuffer',
    });

    broadcast({
      type: 'frame',
      system: 'blink',
      id: cam.id,
      name: cam.name,
      data: Buffer.from(imgRes.data).toString('base64'),
      ts: Date.now(),
    });
  } catch {
    // Camera offline; skip this tick
  }
}

function startPolling() {
  const ringMs = config.server?.snapshotInterval?.ring ?? 1500;
  const blinkMs = config.server?.snapshotInterval?.blink ?? 6000;

  for (const cam of ringCameras.values()) {
    pollRing(cam);
    setInterval(() => pollRing(cam), ringMs);
  }

  for (const cam of blink.cameras) {
    pollBlink(cam);
    setInterval(() => pollBlink(cam), blinkMs);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Ring + Blink Unified Dashboard ===\n');

  const hasRing = config.ring?.email || config.ring?.refreshToken;
  const hasBlink = config.blink?.email;

  if (hasRing) {
    console.log('[Ring] Initializing...');
    await initRing().catch(e => console.error('[Ring] Error:', e.message));
  } else {
    console.log('[Ring] Skipped — no credentials in config.json');
  }

  if (hasBlink) {
    console.log('[Blink] Initializing...');
    await initBlink().catch(e => console.error('[Blink] Error:', e.message));
  } else {
    console.log('[Blink] Skipped — no credentials in config.json');
  }

  startPolling();

  const port = config.server?.port ?? 3000;
  server.listen(port, () => {
    console.log(`\nDashboard → http://localhost:${port}\n`);
  });
}

main();
