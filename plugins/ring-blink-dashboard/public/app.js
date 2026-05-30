'use strict';

const grid = document.getElementById('grid');
const wsStatus = document.getElementById('ws-status');
const cameraCount = document.getElementById('camera-count');
const emptyMsg = document.getElementById('empty');

const cameras = {};

// 1×1 transparent GIF placeholder while waiting for first frame
const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function createCard(id, name, system) {
  const card = document.createElement('div');
  card.className = `card ${system}`;
  card.innerHTML = `
    <div class="card-header">
      <span class="cam-name">${escapeHtml(name)}</span>
      <span class="badge">${system.toUpperCase()}</span>
    </div>
    <div class="feed-wrap">
      <img class="feed" src="${PLACEHOLDER}" alt="${escapeHtml(name)}" />
      <div class="loading-overlay">
        <div class="spinner"></div>
      </div>
    </div>
    <div class="card-footer">
      <span class="ts">Waiting for feed…</span>
    </div>
  `;
  grid.appendChild(card);

  cameras[id] = {
    imgEl: card.querySelector('.feed'),
    tsEl: card.querySelector('.ts'),
    overlay: card.querySelector('.loading-overlay'),
    firstFrame: false,
  };
}

function updateFrame(id, base64, ts) {
  const cam = cameras[id];
  if (!cam) return;
  cam.imgEl.src = `data:image/jpeg;base64,${base64}`;
  cam.tsEl.textContent = new Date(ts).toLocaleTimeString();
  if (!cam.firstFrame) {
    cam.overlay.style.display = 'none';
    cam.firstFrame = true;
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ─── Load cameras then connect WS ────────────────────────────────────────────

fetch('/api/cameras')
  .then(r => r.json())
  .then(({ cameras: list }) => {
    if (!list.length) {
      emptyMsg.classList.remove('hidden');
      return;
    }
    cameraCount.textContent = `${list.length} camera${list.length !== 1 ? 's' : ''}`;
    list.forEach(cam => createCard(cam.id, cam.name, cam.system));
    connectWS();
  })
  .catch(() => {
    wsStatus.textContent = 'Server error';
    wsStatus.className = 'error';
  });

// ─── WebSocket ────────────────────────────────────────────────────────────────

function connectWS() {
  const ws = new WebSocket(`ws://${location.host}`);

  ws.onopen = () => {
    wsStatus.textContent = 'Live';
    wsStatus.className = 'live';
  };

  ws.onclose = () => {
    wsStatus.textContent = 'Reconnecting…';
    wsStatus.className = 'disconnected';
    setTimeout(connectWS, 3000);
  };

  ws.onerror = () => ws.close();

  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'frame') updateFrame(msg.id, msg.data, msg.ts);
    } catch { /* ignore malformed */ }
  };
}
