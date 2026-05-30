# Installation & Setup Guide

## Requirements

- **Node.js 18+** — https://nodejs.org
- Ring and/or Blink account credentials
- Both Ring and Blink accounts must have 2FA enabled or disabled (2FA is handled at startup)

---

## Step-by-Step Setup

### 1. Copy this folder to your local machine

Download or clone the repo, then navigate into this directory:

```bash
cd ring-blink-dashboard
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Create your config file

```bash
cp config.example.json config.json
```

Open `config.json` and fill in your credentials:

```json
{
  "ring": {
    "email": "your-ring-email@example.com",
    "password": "your-ring-password",
    "refreshToken": ""
  },
  "blink": {
    "email": "your-blink-email@example.com",
    "password": "your-blink-password"
  },
  "server": {
    "port": 3000,
    "snapshotInterval": {
      "ring": 1500,
      "blink": 6000
    }
  }
}
```

> `config.json` is in `.gitignore` — your credentials will never be committed.

### 4. Start the dashboard

```bash
npm start
```

On first run, you will be prompted in the terminal for:
- Ring 2FA code (if enabled on your Ring account)
- Blink 2FA PIN (sent to your email or SMS)

After entering these, the server saves a Ring refresh token to `config.json`.
**You can then remove `ring.email` and `ring.password` from `config.json`** — only the `refreshToken` is needed for future logins.

### 5. Open in your browser

```
http://localhost:3000
```

The dashboard auto-discovers all cameras on both accounts. No manual camera list required.

---

## Refresh Rates

| System | Default | Notes |
|--------|---------|-------|
| Ring   | 1.5 sec | Going below ~1s may hit Ring's rate limit |
| Blink  | 6 sec   | Blink cameras take ~2–3s to capture and upload; 6s is the practical minimum |

Adjust in `config.json` under `server.snapshotInterval`.

---

## Adding or Removing Cameras

The app automatically discovers every camera on your Ring and Blink accounts.
To add a camera: add it to your Ring or Blink account via the official app, then restart this server.
To remove a camera: remove it from the official app, then restart.

---

## Accessing from Other Devices on Your Network

By default the server binds to all interfaces. Find your machine's local IP:

```bash
# macOS / Linux
ip addr show   # or: ifconfig

# Windows
ipconfig
```

Then open `http://<your-local-ip>:3000` on any device on the same network (phone, tablet, TV browser, etc.).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Ring Init Error: Auth failed" | Double-check email/password in config.json |
| "Blink Init Error: 401" | Re-enter credentials; your Blink session may have expired |
| Blank camera tiles (spinner never goes away) | Camera may be offline or rate-limited; wait 30s and reload |
| Blink tiles stuck | Blink cameras must be armed or in active mode to respond to snapshot requests |
| Port 3000 already in use | Change `server.port` in config.json to e.g. `3001` |
