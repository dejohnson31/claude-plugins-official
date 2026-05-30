# Ring + Blink Unified Security Dashboard

## Project Overview

A unified web application that displays live camera feeds and snapshots from both Ring and Blink security systems in a single browser-based dashboard.

---

## Goals

- Show all Ring and Blink cameras in one interface
- Support true HLS live streaming for Ring cameras
- Support auto-refreshing snapshots for Blink cameras (3–5 second intervals)
- Flexible camera management — add or remove cameras via config file (no code changes)
- Dark-themed responsive grid layout
- Works on local machine, home server, Raspberry Pi, or cloud hosting

---

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend | Node.js + Express | `ring-client-api` is Node.js only |
| Ring API | `ring-client-api` | WebRTC → FFmpeg → RTSP → HLS live stream |
| Blink API | `node-blink-security` | Node.js Blink library; snapshots + clips |
| Stream relay | FFmpeg or go2rtc | Converts Ring RTSP stream to HLS for browser |
| Frontend | HTML + CSS + HLS.js | Plays HLS streams; auto-refreshes Blink snapshots |
| Config | `config.json` | Credentials + camera list |

---

## Architecture

```
Browser Dashboard
      |
      |--- /api/cameras        → Node.js Express API
      |--- /stream/:id         → HLS stream (Ring cameras via FFmpeg/go2rtc)
      |--- /snapshot/:id       → Latest snapshot image (Blink cameras)
      |
Node.js Server
      |--- ring-client-api     → Ring WebRTC → FFmpeg → RTSP → HLS
      |--- node-blink-security → Blink snapshot polling
      |--- config.json         → Camera list + credentials
```

---

## Live Streaming Notes

- **Ring**: True HLS live video with ~3–5 second latency. Requires FFmpeg or go2rtc installed on the host machine.
- **Blink**: Blink's unofficial API does not support true live streaming. Auto-refreshing snapshots every 3–5 seconds simulates live view.

---

## Camera Config Format (`config.json`)

```json
{
  "ring": {
    "email": "your@email.com",
    "password": "yourpassword"
  },
  "blink": {
    "email": "your@email.com",
    "password": "yourpassword"
  },
  "cameras": [
    { "system": "ring", "id": "front-door", "name": "Front Door" },
    { "system": "ring", "id": "backyard", "name": "Backyard" },
    { "system": "blink", "id": "garage", "name": "Garage" }
  ]
}
```

Cameras can be added or removed by editing this file — no code changes needed.

---

## Dashboard UI Features

- Dark-themed responsive grid (scales to any number of cameras)
- Each camera tile shows:
  - Camera name
  - System badge (Ring / Blink)
  - Live HLS video (Ring) or auto-refreshing snapshot (Blink)
  - Last-updated timestamp
- Per-camera refresh button
- Global refresh all button
- 2FA support for both Ring and Blink login

---

## Authentication

- Both Ring and Blink require email + password
- Both support 2FA (SMS/email) — handled at startup via CLI prompt
- Credentials stored in local `config.json` (not committed to version control)

---

## Preview / Viewing Options

| Method | How |
|---|---|
| Claude Code web (this env) | Start server → use built-in browser preview |
| Local machine | `node server.js` → open `http://localhost:3000` |
| Home server / Raspberry Pi | Run server, access via local IP |
| Cloud | Deploy to Railway, Render, or Replit for a shareable URL |
| Google Antigravity | Build and run inside Antigravity desktop app, preview in browser |

---

## Decisions Made

- [x] Ring streams: **Near-live snapshot push via WebSocket** (1.5s interval) — upgradeable to true HLS with go2rtc
- [x] Blink streams: **Snapshot refresh via WebSocket** (6s interval, limited by Blink API)
- [x] Deployment: **Local home network machine** (accessed via `http://localhost:3000`)

---

## Dependencies to Install

```bash
# Node.js packages
npm install express ring-client-api node-blink-security hls.js

# System dependency for Ring live streaming (one of the following)
# FFmpeg:
sudo apt install ffmpeg          # Linux
brew install ffmpeg              # macOS

# OR go2rtc (optional, more powerful):
# https://github.com/AlexxIT/go2rtc
```

---

## References

- [ring-client-api (npm)](https://www.npmjs.com/package/ring-client-api)
- [node-blink-security (GitHub)](https://github.com/madkodaer/node-blink-security)
- [go2rtc stream relay](https://github.com/AlexxIT/go2rtc)
- [HLS.js browser player](https://github.com/video-dev/hls.js)
- [Google Antigravity (I/O 2026)](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)
