Deployment guide — TuneScape

This guide shows how to run the full TuneScape server (Express + ffmpeg) using Docker, and gives alternative hosting recommendations.

Prerequisites
- Docker installed (Docker Desktop on Windows).
- Port 3000 free (or map to a different port when running container).

Build locally
```powershell
# from project root
docker build -t tunescape:latest .
```

Run locally
```powershell
# run with port mapping and persistent cache
docker run --rm -p 3000:3000 -v "${PWD}/cache:/usr/src/app/cache" -e NODE_ENV=production tunescape:latest
```

Smoke test
- Open http://localhost:3000 to load the static front-end.
- API endpoints:
  - `GET /tubidy/search?q=...`
  - `GET /stream?url=...`

Deploy to Render (recommended simple managed option)
1. Create a new Web Service on Render.
2. Connect your GitHub repo and point the service to this repository.
3. Set the Build Command: `docker build -t service .` (Render will detect Dockerfile automatically if you select Docker).
4. Set the Start Command: `node server.js` (or let Dockerfile CMD run).
5. Set the instance to at least 512MB RAM and enable persistent disk if you want `cache/` persisted.

Deploy to Railway / Fly.io / DigitalOcean App Platform
- These platforms support Docker or native Node. Use the Docker image or standard Node Deploy.
- Ensure the service has outbound network access and enough execution time for downloads/transcodes.

Static front-end on Vercel (optional)
- If you only want the static site deployed to Vercel, deploy the `public/` folder as a static Site on Vercel. The dynamic API must remain hosted on a server (the Docker container above).

Notes on Vercel and serverless
- Vercel Serverless Functions have execution time limits and restricted binaries; running `ffmpeg` or long downloads will likely fail. For full functionality (ffmpeg, long-running downloads, streaming with Range support), a persistent Node host (Docker) is recommended.

Support
- If you want, I can:
  - Build and run the Docker image locally and run a quick smoke test.
  - Create a simple `docker-compose.yml` and a GitHub Actions workflow to build/push the image.
  - Help connect this repo to Render or Railway step-by-step.

