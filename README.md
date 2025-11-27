# Tubidy Stream Player (demo)

This demo shows how to play audio in the browser while it downloads using the MediaSource API.

What is included
- `server.js` — small Express server exposing two endpoints:
  - `GET /stream?url=<audio-url>` — proxies a direct audio URL and streams it chunked to the client.
  - `GET /tubidy?q=<query>` — attempts to spawn the `tubidy-scrape` CLI and stream its stdout to the client. (Requires `tubidy-scrape` installed and in PATH.)
- `public/index.html` and `public/app.js` — simple UI and MediaSource-based player.

Getting started

1) Install dependencies

```powershell
cd "c:\Users\Designer\Desktop\desktop\tubidy"
npm install
```

2) (Optional) Install `tubidy-scrape` globally if you want the search-based streaming to work:

```powershell
npm i -g tubidy-scrape
```

3) Start the server

```powershell
npm start
# or: node server.js
```

4) Open `http://localhost:3000` in your browser.

Usage notes
- If `tubidy-scrape` is available in your PATH and writes raw audio to stdout, the `/tubidy` endpoint will stream that output directly to the player and playback will begin as chunks arrive.
- If `tubidy-scrape` isn't available, use the *direct audio URL* box and provide a direct MP3 URL; the demo will proxy it and play while downloading.

Security and production
- This demo is intentionally minimal. If you expose such endpoints publicly, add validation, rate-limiting, error handling and security measures.

If you'd like, I can:
- integrate the exact `tubidy-scrape` API if you tell me how you run it locally (CLI args or Node API), or
- add a simple search UI that queries a provider and lists streamable results to click.
