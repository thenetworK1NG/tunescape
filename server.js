const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const URL = require('url');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// avoid noisy 404 for favicon
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// Proxy a direct audio URL and stream it chunked to the client
app.get('/stream', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('missing url');
  console.log('[stream] proxy request for:', url);

  // Forward Range header if provided to enable progressive playback and seeking
  const headers = { 'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0' };
  if (req.headers.range) headers.Range = req.headers.range;

  try {
    const upstream = await axios.get(url, { headers, responseType: 'stream', maxRedirects: 10, timeout: 20000 });
    // Mirror important headers and status (206 for partial content when Range used)
    res.status(upstream.status);
    const allowed = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition'];
    Object.keys(upstream.headers || {}).forEach(h => {
      if (allowed.includes(h.toLowerCase())) res.setHeader(h, upstream.headers[h]);
    });

    upstream.data.on('error', (err) => {
      console.error('[stream] upstream stream error', err);
      try { res.end(); } catch (e) {}
    });
    // If client requested MP3 format, attempt on-the-fly transcode using ffmpeg
    const wantFormat = req.query.format || '';
    if (wantFormat.toLowerCase() === 'mp3') {
      const spawn = require('child_process').spawn;
      const spawnSync = require('child_process').spawnSync;
      // Prefer a local ./ffmpeg binary if present (downloaded into project), else fall back to system ffmpeg
      let ffmpegBin = 'ffmpeg';
      try {
        const localDir = require('path').join(__dirname, 'ffmpeg');
        const fs = require('fs');
        if (fs.existsSync(localDir)) {
          // find a subdirectory that contains bin/ffmpeg(.exe)
          const subs = fs.readdirSync(localDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
          for (const s of subs) {
            const candidate = require('path').join(localDir, s, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
            if (fs.existsSync(candidate)) { ffmpegBin = candidate; break; }
          }
          // also check if user extracted directly into ./ffmpeg/bin
          const direct = require('path').join(localDir, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
          if (fs.existsSync(direct)) ffmpegBin = direct;
        }
      } catch (x) {
        // ignore and use system ffmpeg
      }

      // quick check for ffmpeg binary availability
      try {
        const chk = spawnSync(ffmpegBin, ['-version'], { timeout: 3000 });
        if (chk.error || chk.status !== 0) {
          console.error('[stream] ffmpeg check failed', chk.error || chk.status);
          return res.status(500).send('ffmpeg not available on server. Install ffmpeg to enable MP3 transcoding.');
        }
      } catch (ex) {
        console.error('[stream] ffmpeg check exception', ex && ex.message);
        return res.status(500).send('ffmpeg not available on server. Install ffmpeg to enable MP3 transcoding.');
      }
      // check if ffmpeg is available by attempting to spawn
      let ff;
      try {
        console.log('[stream] preparing ffmpeg transcode; upstream status:', upstream.status, 'headers:', { 'content-type': upstream.headers['content-type'], 'content-length': upstream.headers['content-length'], 'accept-ranges': upstream.headers['accept-ranges'] });
        ff = spawn(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 'mp3', '-codec:a', 'libmp3lame', '-b:a', '128k', '-vn', 'pipe:1']);
        console.log('[stream] spawned ffmpeg pid=', ff.pid);
      } catch (ffErr) {
        console.error('[stream] ffmpeg spawn error', ffErr && ffErr.message);
        return res.status(500).send('ffmpeg not available on server. Install ffmpeg to enable MP3 transcoding.');
      }

      // If ffmpeg process exits immediately with ENOENT, catch it
      ff.on('error', (e) => {
        console.error('[stream] ffmpeg error', e && e.message);
      });

      // For transcoding, request the full upstream (no Range) so ffmpeg can parse MP4 containers
      try {
        // Safer approach: download the remote MP4 fully to a temp file,
        // then run ffmpeg on that file. This avoids demux errors caused by
        // partial/streamed input from some hosts.
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const { v4: uuidv4 } = require('uuid');

        const tmpDir = os.tmpdir();
        const tmpName = `tubidy_${Date.now()}_${uuidv4()}.mp4`;
        const tmpPath = path.join(tmpDir, tmpName);
        console.log('[stream] downloading remote MP4 to temp file for transcode:', tmpPath);

        const dlHeaders = { 'User-Agent': 'Mozilla/5.0' };
        const dlResp = await axios.get(url, { headers: dlHeaders, responseType: 'stream', maxRedirects: 10, timeout: 120000 });
        const writer = fs.createWriteStream(tmpPath);
        let failed = false;
        dlResp.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', (err) => { failed = true; reject(err); });
          dlResp.data.on('error', (err) => { failed = true; reject(err); });
        });

        if (failed) {
          try { fs.unlinkSync(tmpPath); } catch (e) {}
          if (!res.headersSent) res.status(500).send('download failed for transcode');
          return;
        }

        console.log('[stream] download complete, spawning ffmpeg on', tmpPath);
        ff = spawn(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-i', tmpPath, '-f', 'mp3', '-codec:a', 'libmp3lame', '-b:a', '128k', '-vn', 'pipe:1']);
        console.log('[stream] spawned ffmpeg pid=', ff.pid);

        res.setHeader('content-type', 'audio/mpeg');
        res.setHeader('transfer-encoding', 'chunked');

        ff.stdout.once('data', (chunk) => {
          console.log('[stream] ffmpeg started producing output, first chunk size=', chunk.length);
        });
        ff.stderr.on('data', (d) => console.error('[ffmpeg]', d.toString()));
        ff.on('close', (code) => {
          console.log('[stream] ffmpeg exited', code);
          try { fs.unlinkSync(tmpPath); } catch (e) {}
        });

        // Pipe ffmpeg output to client
        ff.stdout.pipe(res);

        // cleanup if client disconnects
        req.on('close', () => {
          try { ff.kill('SIGKILL'); } catch (e) {}
          try { fs.unlinkSync(tmpPath); } catch (e) {}
        });

        return;
      } catch (errDownload) {
        console.error('[stream] transcode download/ffmpeg error', errDownload && errDownload.message);
        if (!res.headersSent) res.status(500).send('transcode error: ' + String(errDownload && errDownload.message));
        try { ff.kill && ff.kill(); } catch (e) {}
        return;
      }
      return;
    }

    upstream.data.pipe(res);
  } catch (e) {
    console.error('[stream] proxy error', e && e.message);
    if (!res.headersSent) res.status(500).send(String(e && e.message));
  }
});

// Use the tubidy-scrape library (if installed) to resolve a downloadable URL and proxy it
// Example: GET /tubidy?q=track+name
app.get('/tubidy', (req, res) => {
  const q = req.query.q || req.query.query;
  if (!q) return res.status(400).send('missing query');

  let tubidyLib;
  try {
    tubidyLib = require('tubidy-scrape');
  } catch (e) {
    const msg = 'tubidy-scrape library not installed. Run in project folder: npm i tubidy-scrape';
    console.error(msg);
    return res.status(500).send(msg);
  }

  (async () => {
    try {
      const results = await tubidyLib.search(q);
      if (!results || !results.length) return res.status(404).send('no results');

      // For backward compatibility keep streaming first result
      const downloadPath = results[0].link;
      const finalUrl = await tubidyLib.download(downloadPath);
      if (!finalUrl) return res.status(500).send('could not resolve download URL');

      const parsed = URL.parse(finalUrl);
      const getter = parsed.protocol === 'https:' ? https : http;
      getter.get(finalUrl, (r) => {
        res.setHeader('content-type', r.headers['content-type'] || 'audio/mpeg');
        res.setHeader('transfer-encoding', 'chunked');
        r.pipe(res);
      }).on('error', (err2) => {
        console.error('stream error', err2);
        res.status(500).send('error fetching final audio URL: ' + String(err2));
      });
    } catch (err) {
      console.error('tubidy library error', err);
      if (!res.headersSent) res.status(500).send('tubidy error: ' + String(err));
    }
  })();
});

// Search endpoint returning JSON list of available tracks
app.get('/tubidy/search', async (req, res) => {
  const q = req.query.q || req.query.query;
  if (!q) return res.status(400).json({ error: 'missing query' });
  try {
    // default behavior: regular non-streaming search (kept for compatibility)
    const results = await fetchTubidySearch(q);
    res.json(results || []);
  } catch (err) {
    console.error('search error', err);
    res.status(500).json({ error: String(err) });
  }
});

// Streaming search with Server-Sent Events: emits progress and final results
app.get('/tubidy/search-stream', async (req, res) => {
  const q = req.query.q || req.query.query;
  if (!q) return res.status(400).send('missing query');

  // set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  // simple SSE helper
  function sseEvent(name, obj) {
    try {
      res.write('event: ' + name + '\n');
      res.write('data: ' + JSON.stringify(obj) + '\n\n');
    } catch (e) {}
  }

  console.log('[search-stream] starting stream for', q);

  // Crawl pages like fetchTubidySearchAll but emit progress events
  const items = [];
  const seenLinks = new Set();
  async function collect(u) {
    try {
      const resp = await axios.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }, timeout: 12000 });
      const data = resp.data || '';
      const $ = cheerio.load(data);
      const foundNext = [];
      $('a[href]').each((i, a) => {
        try {
          const href = $(a).attr('href');
          const title = ($(a).attr('aria-label') || $(a).attr('title') || $(a).text() || '').trim();
          if (href && !seenLinks.has(href)) { seenLinks.add(href); items.push({ title: title || href, link: href }); }
          if (href && /search\.php/i.test(href) && /pn=\d+/.test(href)) {
            let next = href;
            if (next.startsWith('//')) next = 'https:' + next;
            if (next.startsWith('/')) next = 'https://tubidy.cool' + next;
            foundNext.push(next);
          }
        } catch (e) {}
      });
      return { ok: true, next: foundNext };
    } catch (e) { return { ok: false, next: [] }; }
  }

  const base = `https://tubidy.cool/search.php?q=${encodeURIComponent(q)}`;
  const queue = [];
  for (let p = 1; p <= 3; p++) { queue.push(base + `&page=${p}`); queue.push(base + `&p=${p}`); queue.push(base + `&pg=${p}`); }
  queue.push(base);
  const tried = new Set();
  let pagesFetched = 0;
  let lastEmitted = 0;

  function likelyKeep(it) {
    const l = String(it.link || '').trim();
    const t = String(it.title || '').toLowerCase();
    if (!l) return false;
    const low = l.toLowerCase();
    if (low.startsWith('javascript:') || low.startsWith('mailto:') || low.startsWith('whatsapp:') || low.startsWith('#')) return false;
    const navWords = ['login', 'signup', 'register', 'upload', 'top', 'search', 'playlist.php', 'account', 'stats', 'about', 'contact', 'privacy', 'terms', 'help', 'faq', 'report'];
    for (const w of navWords) if (low.includes(w) && !low.includes('/watch')) return false;
    if (/\/watch/i.test(l) || /id=/.test(l) || l.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) return true;
    if (t.match(/ - | ft\.| feat\.|official|audio|remix|visualizer/i)) return true;
    if (t.includes('next')) return true;
    return false;
  }

  while (queue.length && items.length < 1000) {
    const u = queue.shift();
    if (!u || tried.has(u)) continue;
    tried.add(u);
    const r = await collect(u);
    if (!r.ok) continue;
    pagesFetched++;
    // emit progress every page
    const candidates = items.length;
    // apply basic filter count for kept (estimate)
    const kept = items.filter(it => (/\/watch/i.test(it.link) || /id=/.test(it.link) || it.link.match(/\.(mp3|mp4|m4a|webm|ogg)(\?|$)/i))).length;
    sseEvent('progress', { pagesFetched, candidates, kept });
    // emit incremental results discovered since last emit
    try {
      const newItems = items.slice(lastEmitted).map(it => ({ title: it.title, link: it.link && it.link.startsWith('//') ? 'https:' + it.link : it.link }));
      const filtered = newItems.filter(likelyKeep);
      if (filtered.length) {
        sseEvent('result', { results: filtered });
        lastEmitted = items.length;
      }
    } catch (e) {}
    if (r.next && r.next.length) {
      for (const n of r.next) if (!tried.has(n)) queue.push(n);
    }
    // small delay to allow client to update UI smoothly
    await new Promise((res2) => setTimeout(res2, 150));
  }

  // Normalize and filter final items
  const normalized = items.map(it => ({ title: it.title, link: it.link && it.link.startsWith('//') ? 'https:' + it.link : it.link }));
  const unique = [];
  const seen = new Set();
  for (const it of normalized) {
    if (!it.link) continue;
    const key = it.link;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }
  const keep = unique.filter(it => {
    const l = String(it.link || '').trim();
    const t = String(it.title || '').toLowerCase();
    if (!l) return false;
    const low = l.toLowerCase();
    if (low.startsWith('javascript:') || low.startsWith('mailto:') || low.startsWith('whatsapp:') || low.startsWith('#')) return false;
    const navWords = ['login', 'signup', 'register', 'upload', 'top', 'search', 'playlist.php', 'account', 'stats', 'about', 'contact', 'privacy', 'terms', 'help', 'faq', 'report'];
    for (const w of navWords) if (low.includes(w) && !low.includes('/watch')) return false;
    if (/\/watch/i.test(l) || /id=/.test(l) || l.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) return true;
    if (t.match(/ - | ft\.| feat\.|official|audio|remix|visualizer/i)) return true;
    if (t.includes('next')) return true;
    return false;
  });

  // send any remaining results not yet emitted
  try {
    const remaining = unique.filter((it, idx) => idx >= lastEmitted);
    const finalChunk = remaining.filter(likelyKeep);
    if (finalChunk.length) sseEvent('result', { results: finalChunk });
  } catch (e) {}
  // send final results (deduped full list)
  sseEvent('result', { results: keep });
  sseEvent('done', { done: true });
  try { res.end(); } catch (e) {}
});

// Return a fuller/raw set of search candidates (try multiple pages, minimal dedupe)
async function fetchTubidySearchAll(query) {
  const items = [];
  const seenLinks = new Set();

  async function collectFrom(u) {
    try {
      const resp = await axios.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }, timeout: 12000 });
      const data = resp.data || '';
      const $ = cheerio.load(data);
      const foundNext = [];
      $('a[href]').each((i, a) => {
        try {
          const href = $(a).attr('href');
          const title = ($(a).attr('aria-label') || $(a).attr('title') || $(a).text() || '').trim();
          if (href && !seenLinks.has(href)) { seenLinks.add(href); items.push({ title: title || href, link: href }); }
          // detect a pagination/next link pattern and collect it for further crawling
          if (href && /search\.php/i.test(href) && /pn=\d+/.test(href)) {
            // normalize protocol-relative and relative links
            let next = href;
            if (next.startsWith('//')) next = 'https:' + next;
            if (next.startsWith('/')) next = 'https://tubidy.cool' + next;
            foundNext.push(next);
          }
        } catch (e) {}
      });
      return { ok: true, next: foundNext };
    } catch (e) { return false; }
  }

  // prefer tubidy-scrape first if available
  try {
    const tubidyLib = require('tubidy-scrape');
    if (tubidyLib && typeof tubidyLib.search === 'function') {
      // try multiple pages via tubidy-scrape by appending page params to query
      for (let p = 1; p <= 10; p++) {
        try {
          const pageQuery = `${query}&p=${p}`;
          const libResults = await tubidyLib.search(pageQuery).catch(() => []);
          if (!Array.isArray(libResults) || !libResults.length) break;
          for (const r of libResults) {
            if (r && r.link && !seenLinks.has(r.link)) { seenLinks.add(r.link); items.push({ title: r.title || r.name || r.link, link: r.link }); }
          }
        } catch (e) {
          break;
        }
      }
    }
  } catch (e) {}

  const base = `https://tubidy.cool/search.php?q=${encodeURIComponent(query)}`;
  const tried = new Set();
  const queue = [];
  // initial candidates: try common page variants
  for (let p = 1; p <= 3; p++) {
    queue.push(base + `&page=${p}`);
    queue.push(base + `&p=${p}`);
    queue.push(base + `&pg=${p}`);
  }
  // also push base itself
  queue.push(base);

  while (queue.length && items.length < 1000) {
    const u = queue.shift();
    if (!u || tried.has(u)) continue;
    tried.add(u);
    const res = await collectFrom(u);
    if (!res) continue;
    if (res.next && res.next.length) {
      for (const n of res.next) {
        if (!tried.has(n)) queue.push(n);
      }
    }
  }

  // normalize protocol-relative links
  const normalized = items.map(it => ({ title: it.title, link: it.link && it.link.startsWith('//') ? 'https:' + it.link : it.link }));
  // filter out obvious navigation/share links and keep likely media/watch links
  const keep = normalized.filter(it => {
    const l = String(it.link || '').trim();
    const t = String(it.title || '').toLowerCase();
    if (!l) return false;
    const low = l.toLowerCase();
    if (low.startsWith('javascript:') || low.startsWith('mailto:') || low.startsWith('whatsapp:') || low.startsWith('#')) return false;
    const navWords = ['login', 'signup', 'register', 'upload', 'top', 'search', 'playlist.php', 'account', 'stats', 'about', 'contact', 'privacy', 'terms', 'help', 'faq', 'report'];
    for (const w of navWords) if (low.includes(w) && !low.includes('/watch')) return false;
    if (/\/watch/i.test(l) || /id=/.test(l) || l.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) return true;
    if (t.match(/ - | ft\.| feat\.|official|audio|remix|visualizer/i)) return true;
    return false;
  });
  console.log('[fetchTubidySearchAll] candidates=', normalized.length, 'kept=', keep.length, 'for', query);
  return keep;
}

// Stream endpoint: resolve link, inspect content-type and stream actual media (avoid piping HTML)
app.get('/tubidy/stream', (req, res) => {
  const link = req.query.link;
  if (!link) return res.status(400).send('missing link');

  (async () => {
    try {
      let finalUrl = await resolveDownloadLink(link);
      if (!finalUrl) return res.status(500).send('could not resolve download URL');

      console.log('[tubidy/stream] resolved to', finalUrl);

      // Try to HEAD the final URL to inspect content-type
      let headResp;
      try {
        headResp = await axios.head(finalUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5, timeout: 10000 });
      } catch (headErr) {
        // HEAD may fail; fallback to GET headers-only by requesting but not piping
        try {
          headResp = await axios.get(finalUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5, timeout: 10000, responseType: 'stream' });
          headResp.data.destroy();
        } catch (gErr) {
          console.error('[tubidy/stream] head/get error', gErr.message);
          headResp = null;
        }
      }

      const contentType = headResp && headResp.headers && headResp.headers['content-type'] ? headResp.headers['content-type'] : '';
      console.log('[tubidy/stream] final content-type:', contentType);

      // Fetch the resolved page HTML and search for direct media links (cover many patterns)
      let shouldSearchHtml = false;
      if (contentType && contentType.startsWith('text/')) shouldSearchHtml = true;
      // also search HTML for common watch pages or when content-type is unknown
      if (!contentType || contentType === '' || finalUrl.includes('/watch/') || finalUrl.match(/\/watch\//i)) shouldSearchHtml = true;

      if (shouldSearchHtml) {
        console.log('[tubidy/stream] fetching page HTML to search for media links');
        try {
          const pageResp = await axios.get(finalUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }, timeout: 15000, responseType: 'text' });
          const html = pageResp.data || '';
          const $ = cheerio.load(html);
          const mediaCandidates = [];

          // anchors with media extensions
          $('a[href]').each((i, a) => {
            const href = $(a).attr('href');
            if (href && href.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) mediaCandidates.push(href);
          });
          // <source src=> and <video src=>
          $('source[src], video[src]').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) mediaCandidates.push(src);
          });
          // meta tags (og:video)
          $('meta[property^="og:"]').each((i, m) => {
            const prop = $(m).attr('property');
            if (prop && prop.toLowerCase().includes('video')) {
              const content = $(m).attr('content');
              if (content && content.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) mediaCandidates.push(content);
            }
          });
          // look inside scripts for URLs
          const scriptText = $('script').map((i, s) => $(s).html()).get().join('\n');
          const re = /https?:\/\/[^\s"']+\.(mp3|m4a|mp4|webm|ogg)(\?[^"']*)?/ig;
          let m;
          while ((m = re.exec(scriptText)) !== null) {
            mediaCandidates.push(m[0]);
          }

          // normalize and dedupe
          const normalized = mediaCandidates.map(h => (h.startsWith('//') ? 'https:' + h : h.startsWith('/') ? 'https://tubidy.cool' + h : h)).filter(Boolean);
          const unique = [...new Set(normalized)];
          console.log('[tubidy/stream] media candidates found:', unique.slice(0,5));

          if (unique.length) {
            finalUrl = unique[0];
          } else {
            console.warn('[tubidy/stream] no direct media href found in page HTML');
            // Do NOT stream the HTML page into MediaSource; return an error so client can surface it.
            return res.status(500).send('no direct media href found in page');
          }
        } catch (pageErr) {
          console.error('[tubidy/stream] error fetching resolved page', pageErr.message);
          // proceed to attempt streaming finalUrl
        }
      }

      // Stream the final media URL to the client using axios so we can forward Range headers
      try {
        const headers = { 'User-Agent': 'Mozilla/5.0' };
        if (req.headers.range) headers.Range = req.headers.range;
        const upstream = await axios.get(finalUrl, { headers, responseType: 'stream', maxRedirects: 10, timeout: 20000 });
        console.log('[tubidy/stream] upstream responded for media:', upstream.status, upstream.headers['content-type']);
        res.status(upstream.status);
        const allowed = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition'];
        Object.keys(upstream.headers || {}).forEach(h => {
          if (allowed.includes(h.toLowerCase())) res.setHeader(h, upstream.headers[h]);
        });
        upstream.data.on('error', (err) => {
          console.error('[tubidy/stream] upstream stream error', err);
          try { res.end(); } catch (e) {}
        });
        upstream.data.pipe(res);
      } catch (err2) {
        console.error('[tubidy/stream] proxy error', err2 && err2.message);
        if (!res.headersSent) res.status(500).send('error fetching final audio URL: ' + String(err2 && err2.message));
      }
    } catch (err) {
      console.error('tubidy download error', err);
      if (!res.headersSent) res.status(500).send('tubidy error: ' + String(err));
    }
  })();
});

// Helper: fetch tubidy search page with a browser UA and parse candidate results
async function fetchTubidySearch(query) {
  const items = [];
  const seenLinks = new Set();

  // prefer tubidy-scrape results first (if available)
  try {
    const tubidyLib = require('tubidy-scrape');
    if (tubidyLib && typeof tubidyLib.search === 'function') {
      try {
        const libResults = await tubidyLib.search(query);
        if (Array.isArray(libResults) && libResults.length) {
          for (const r of libResults) {
            if (r && r.link && !seenLinks.has(r.link)) { seenLinks.add(r.link); items.push({ title: r.title || r.name || r.link, link: r.link }); }
          }
          console.log('[fetchTubidySearch] tubidy-scrape returned', libResults.length, 'items for', query);
        }
      } catch (e) {
        // ignore tubidy-scrape errors
      }
    }
  } catch (e) {
    // not installed or failed, we'll scrape pages below
  }

  async function fetchAndCollect(u) {
    try {
      const resp = await axios.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }, timeout: 12000 });
      const data = resp.data || '';
      const $ = cheerio.load(data);

      // common tubidy patterns
      const selectors = [
        'div.media-body a',
        'li.list-group-item a',
        'a[aria-label]',
        '.result a',
        '.search-result a',
        '.col a',
        'article a',
        'a[href*="/watch"]',
        'a[href*="/play"]',
        'a[href*="/download"]'
      ];

      for (const sel of selectors) {
        $(sel).each((i, el) => {
          try {
            const href = $(el).attr('href');
            const title = ($(el).attr('aria-label') || $(el).attr('title') || $(el).text() || '').trim();
            if (href && !seenLinks.has(href)) { seenLinks.add(href); items.push({ title: title || href, link: href }); }
          } catch (e) {}
        });
      }

      // permissive anchors: long text or watch/id patterns
      $('a[href]').each((i, a) => {
        try {
          const href = $(a).attr('href');
          const txt = $(a).text() && $(a).text().trim();
          if (!href) return;
          const low = href.toLowerCase();
          if (low.includes('/watch') || low.includes('id=') || low.includes('/download') || low.includes('/play') || (txt && txt.length > 20)) {
            if (!seenLinks.has(href)) { seenLinks.add(href); items.push({ title: txt || href, link: href }); }
          }
        } catch (e) {}
      });

      return true;
    } catch (e) {
      return false;
    }
  }

  // Try more pages (increase from 4 to 10) to collect a larger set of candidate links
  const base = `https://tubidy.cool/search.php?q=${encodeURIComponent(query)}`;
  const tried = new Set();
  let pagesFound = 0;
  for (let p = 1; p <= 10; p++) {
    const candidates = [base + `&page=${p}`, base + `&p=${p}`, base + `&pg=${p}`];
    for (const c of candidates) {
      if (tried.has(c)) continue;
      tried.add(c);
      const ok = await fetchAndCollect(c);
      if (ok) pagesFound++;
      if (items.length >= 200) break; // allow larger pool
    }
    if (items.length >= 200) break;
  }

  // Normalize protocol-relative links and dedupe final list, cap to 200
  const normalized = items.map(it => ({ title: it.title, link: it.link && it.link.startsWith('//') ? 'https:' + it.link : it.link }));
  const unique = [];
  const seenFinal = new Set();
  for (const it of normalized) {
    if (!it.link) continue;
    const key = it.link;
    if (seenFinal.has(key)) continue;
    seenFinal.add(key);
    unique.push(it);
    if (unique.length >= 200) break;
  }
  // filter out obvious navigation/share links and keep likely media/watch links
  const keep = unique.filter(it => {
    const l = String(it.link || '').trim();
    const t = String(it.title || '').toLowerCase();
    if (!l) return false;
    const low = l.toLowerCase();
    if (low.startsWith('javascript:') || low.startsWith('mailto:') || low.startsWith('whatsapp:') || low.startsWith('#')) return false;
    // ignore common site navigation or account links
    const navWords = ['login', 'signup', 'register', 'upload', 'top', 'search', 'playlist.php', 'account', 'stats', 'about', 'contact', 'privacy', 'terms', 'help', 'faq', 'report'];
    for (const w of navWords) if (low.includes(w) && !low.includes('/watch')) return false;
    // prefer explicit watch pages, id= patterns, or direct media files
    if (/\/watch/i.test(l) || /id=/.test(l) || l.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) return true;
    // titles that look like media (contain artist - title) accept
    if (t.match(/ - | ft\.| feat\.|official|audio|remix|visualizer/i)) return true;
    return false;
  });
  console.log('[fetchTubidySearch] pagesFetched=', pagesFound, 'candidates=', items.length, 'unique=', unique.length, 'kept=', keep.length, 'for', query);
  return keep;
}

// Helper: resolve a tubidy result link to the final download URL by scraping the page with UA
async function resolveDownloadLink(link) {
  const base = 'https://tubidy.cool';
  const pageUrl = link.startsWith('http') ? link : (link.startsWith('//') ? 'https:' + link : base + link);
  const resp = await axios.get(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }, timeout: 10000 });
  const $ = cheerio.load(resp.data || '');
  let result = null;
  // The original tubidy-scrape looks for li.list-group-item big -> a
  $('li.list-group-item.big').each((i, e) => {
    const d = $(e);
    if (d.text().includes('Download')) {
      const a = d.find('a').first();
      if (a && a.attr('href')) result = a.attr('href');
    }
  });
  // fallback: any anchor inside .list-group-item
  if (!result) {
    // prefer anchors that explicitly mention play/download or point to known redirect hosts
    const prefer = [];
    $('li.list-group-item a').each((i, a) => {
      try {
        const href = $(a).attr('href') || '';
        const txt = ($(a).text() || '').toLowerCase();
        if (href.match(/\.(mp3|mp4|m4a|webm|ogg)(\?|$)/i) || /play|download|mp4|download mp4/i.test(txt) || /d2mefast\.net|d500\.|ey43\.|ey43com/i.test(href)) {
          prefer.push(href);
        }
      } catch (e) {}
    });
    if (prefer.length) result = prefer[0];
    else {
      // fallback to any non-navigation href (ignore whatsapp/mailto/javascript)
      $('li.list-group-item a').each((i, a) => {
        try {
          const href = $(a).attr('href') || '';
          if (!href || href.startsWith('javascript:') || href.startsWith('whatsapp:') || href.startsWith('mailto:')) return;
          if (!result) result = href;
        } catch (e) {}
      });
    }
  }
  // If still no result, try to extract JS-generated window.open(...) URLs or small inline scripts that contain the direct target
  if (!result) {
    try {
      const text = String(resp.data || '');
      // window.open("https://...")
      const m = text.match(/window\.open\(['"]([^'"\)]+)['"]/i);
      if (m && m[1]) result = m[1];
      if (!result) {
        // find simple function like function dlink(){ window.open('...') }
        const funcMatch = text.match(/function\s+([a-zA-Z0-9_]+)\s*\([^\)]*\)\s*\{([\s\S]{0,2000}?)\}/i);
        if (funcMatch && funcMatch[2]) {
          const inner = funcMatch[2];
          const mm = inner.match(/window\.open\(['"]([^'"\)]+)['"]/i);
          if (mm && mm[1]) result = mm[1];
        }
      }
    } catch (e) { /* ignore */ }
  }
  if (!result) return null;
  if (result.startsWith('//')) result = 'https:' + result;
  if (result.startsWith('/')) result = base + result;
  return result;
}

// Debug: resolve and return final URL without streaming (JSON)
app.get('/tubidy/resolve', async (req, res) => {
  const link = req.query.link;
  if (!link) return res.status(400).json({ error: 'missing link' });
  try {
    const final = await resolveDownloadLink(link);
    if (!final) return res.status(404).json({ error: 'could not resolve' });
    res.json({ finalUrl: final });
  } catch (err) {
    console.error('/tubidy/resolve error', err);
    res.status(500).json({ error: String(err) });
  }
});

// Debug: fetch the resolved page (or final URL) and extract direct media hrefs
app.get('/tubidy/checkmedia', async (req, res) => {
  const link = req.query.link;
  if (!link) return res.status(400).json({ error: 'missing link' });
  try {
    const final = await resolveDownloadLink(link);
    if (!final) return res.status(404).json({ error: 'could not resolve' });

    // Fetch the final page or URL with UA
    const resp = await axios.get(final, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }, timeout: 15000, responseType: 'text' });
    const body = resp.data || '';
    const $ = cheerio.load(body);
    const matches = [];
    // look for anchors with media extensions
    $('a[href]').each((i, a) => {
      const href = $(a).attr('href');
      if (href && href.match(/\.(mp3|mp4|m4a|webm|ogg)(\?|$)/i)) {
        matches.push(href.startsWith('//') ? 'https:' + href : href);
      }
    });
    // also check source tags
    $('source[src]').each((i, s) => {
      const src = $(s).attr('src');
      if (src && src.match(/\.(mp3|mp4|m4a|webm|ogg)(\?|$)/i)) matches.push(src.startsWith('//') ? 'https:' + src : src);
    });
    // If no direct media links, look for download/play links (affiliate redirects) and follow them briefly
    if (!matches.length) {
      const candidates = [];
      // anchor with play button or title within download list
      $('li.list-group-item a, a.title').each((i, a) => {
        const href = $(a).attr('href');
        if (href) candidates.push(href.startsWith('//') ? 'https:' + href : (href.startsWith('/') ? 'https://tubidy.cool' + href : href));
      });
      // follow each candidate and see if it redirects to a media resource
      for (const c of candidates) {
        try {
          const r = await axios.get(c, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': final }, maxRedirects: 10, responseType: 'stream', timeout: 15000 });
          // grab final URL from the request
          const finalUrl = (r.request && r.request.res && r.request.res.responseUrl) ? r.request.res.responseUrl : c;
          const ct = r.headers && r.headers['content-type'] ? r.headers['content-type'] : '';
          r.data.destroy();
          if (ct && /(audio|video)\//i.test(ct)) {
            matches.push(finalUrl);
            break;
          }
        } catch (e) {
          // ignore follow errors
        }
      }
    }
    // If still no matches, attempt to extract JS-generated links like window.open(...) or onclick handlers that call dlink()
    if (!matches.length) {
      try {
        const jsText = body;
        const winOpenRe = /window\.open\(['\"]([^'\"\)]+)['\"]/ig;
        let m;
        while ((m = winOpenRe.exec(jsText)) !== null) {
          const u = m[1];
          if (u && !matches.includes(u)) matches.push(u.startsWith('//') ? 'https:' + u : (u.startsWith('/') ? 'https://tubidy.cool' + u : u));
        }
        // also look for simple onclick handlers like onClick="dlink()" where dlink() is defined on the page
        const funcRe = /function\s+([a-zA-Z0-9_]+)\s*\([^\)]*\)\s*\{([\s\S]{0,2000}?)\}/ig;
        const funcs = {};
        while ((m = funcRe.exec(jsText)) !== null) {
          const name = m[1];
          const bodyText = m[2];
          funcs[name] = bodyText;
        }
        // For each known function body, try to find window.open inside it
        for (const f in funcs) {
          const bodyText = funcs[f];
          let mm;
          while ((mm = winOpenRe.exec(bodyText)) !== null) {
            const u = mm[1];
            if (u && !matches.includes(u)) matches.push(u.startsWith('//') ? 'https:' + u : (u.startsWith('/') ? 'https://tubidy.cool' + u : u));
          }
        }
      } catch (err) { /* ignore */ }
      // dedupe
      if (matches.length) matches = [...new Set(matches)];
    }
    // dedupe
    const unique = [...new Set(matches)];
    res.json({ final, media: unique });
  } catch (err) {
    console.error('/tubidy/checkmedia error', err);
    res.status(500).json({ error: String(err) });
  }
});

// Fetch and parse a specific tubidy page URL and return cleaned candidate items
app.get('/tubidy/page', async (req, res) => {
  const pageUrl = req.query.url;
  if (!pageUrl) return res.status(400).json({ error: 'missing url' });
  try {
    const resp = await axios.get(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }, timeout: 15000 });
    const $ = cheerio.load(resp.data || '');
    const items = [];
    $('a[href]').each((i, a) => {
      try {
        const href = $(a).attr('href');
        const title = ($(a).attr('aria-label') || $(a).attr('title') || $(a).text() || '').trim();
        if (href) items.push({ title: title || href, link: href });
      } catch (e) {}
    });

    // normalize and filter similar to search functions
    const normalized = items.map(it => ({ title: it.title, link: it.link && it.link.startsWith('//') ? 'https:' + it.link : it.link }));
    const keep = normalized.filter(it => {
      const l = String(it.link || '').trim();
      const t = String(it.title || '').toLowerCase();
      if (!l) return false;
      const low = l.toLowerCase();
      if (low.startsWith('javascript:') || low.startsWith('mailto:') || low.startsWith('whatsapp:') || low.startsWith('#')) return false;
      const navWords = ['login', 'signup', 'register', 'upload', 'top', 'search', 'playlist.php', 'account', 'stats', 'about', 'contact', 'privacy', 'terms', 'help', 'faq', 'report'];
      for (const w of navWords) if (low.includes(w) && !low.includes('/watch')) return false;
      if (/\/watch/i.test(l) || /id=/.test(l) || l.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) return true;
      if (t.match(/ - | ft\.| feat\.|official|audio|remix|visualizer/i)) return true;
      // keep explicit Next links too (so client can detect and request them)
      if (t.includes('next')) return true;
      return false;
    });

    // also try to detect a 'next' link and return it separately if present
    let nextLink = null;
    $('a[href]').each((i, a) => {
      try {
        const href = $(a).attr('href');
        const txt = ($(a).text() || '').trim().toLowerCase();
        if (txt.includes('next') || /pn=\d+/.test(href)) {
          if (href.startsWith('//')) nextLink = 'https:' + href;
          else if (href.startsWith('/')) nextLink = 'https://tubidy.cool' + href;
          else nextLink = href;
          return false;
        }
      } catch (e) {}
    });

    console.log('[tubidy/page] parsed', keep.length, 'items; next=', nextLink);
    res.json({ items: keep, next: nextLink });
  } catch (err) {
    console.error('/tubidy/page error', err && err.message);
    res.status(500).json({ error: String(err && err.message) });
  }
});

// In-memory download/transcode jobs map to share status between SSE and stream endpoints
const downloadJobs = {}; // id -> { url, status, downloaded, total, inputPath, outputPath, ready }

function makeJobId(url) {
  return crypto.randomBytes(8).toString('hex');
}

// Simple persistent cache directory for playlist/prefetch
const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) try { fs.mkdirSync(cacheDir); } catch (e) {}
// cacheIndex: key -> { key, url, path, ready, status }
const cacheIndex = {};
// mapping of final media URL -> key (helps lookup when client checks with direct media URL)
const cacheByUrl = {};

function cacheKeyFor(link, format) {
  try { return crypto.createHash('sha1').update(String(link || '') + '::' + String(format || '')).digest('hex'); } catch (e) { return makeJobId(link); }
}

// At startup populate cacheIndex from existing files in cache dir
try {
  const files = fs.readdirSync(cacheDir || '.');
  for (const f of files) {
    const m = f.match(/^([a-f0-9]{40})\.(mp3|m4a|mp4)$/i);
    if (m) {
      const key = m[1];
      const p = path.join(cacheDir, f);
      cacheIndex[key] = { key, url: null, path: p, ready: true, status: 'ready' };
    }
  }
} catch (e) {}


// SSE endpoint to report download/transcode progress for a given upstream URL
app.get('/stream-status', async (req, res) => {
  const url = req.query.url;
  const wantFormat = (req.query.format || '').toLowerCase();
  if (!url) return res.status(400).send('missing url');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  function sseEvent(name, obj) {
    try {
      res.write('event: ' + name + '\n');
      res.write('data: ' + JSON.stringify(obj) + '\n\n');
    } catch (e) {}
  }

  // If a job for this URL already exists, reuse its id
  let job = Object.values(downloadJobs).find(j => j && j.url === url && j.format === wantFormat);
  if (!job) {
    const id = makeJobId(url);
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `tubidy_in_${id}`);
    const outputPath = path.join(tmpDir, `tubidy_out_${id}.mp3`);
    job = { id, url, format: wantFormat, status: 'queued', downloaded: 0, total: 0, inputPath, outputPath, ready: false, error: null };
    downloadJobs[id] = job;

    // start background download/transcode
    (async () => {
      try {
        job.status = 'head';
        // try HEAD to get content-length
        try {
          const h = await axios.head(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 10, timeout: 10000 });
          job.total = parseInt(h.headers['content-length'] || '0') || 0;
        } catch (he) {
          job.total = 0;
        }

        job.status = 'downloading';
        const dl = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, responseType: 'stream', maxRedirects: 10, timeout: 120000 });
        const writer = fs.createWriteStream(job.inputPath);
        dl.data.on('data', (chunk) => {
          job.downloaded += chunk.length;
        });
        dl.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
          dl.data.on('error', reject);
        });

        // emit a final progress update (100%) if total known
        job.status = 'downloaded';

        // If user requested mp3 or input is not already mp3, run ffmpeg to transcode
        const inputIsMp3 = String(dl.headers['content-type'] || '').toLowerCase().includes('audio/mpeg') || job.inputPath.match(/\.mp3(\?|$)/i);
        if (wantFormat === 'mp3' && !inputIsMp3) {
          job.status = 'transcoding';
          // find ffmpeg (re-use logic from /stream route)
          let ffmpegBin = 'ffmpeg';
          try {
            const localDir = require('path').join(__dirname, 'ffmpeg');
            if (fs.existsSync(localDir)) {
              const subs = fs.readdirSync(localDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
              for (const s of subs) {
                const candidate = require('path').join(localDir, s, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
                if (fs.existsSync(candidate)) { ffmpegBin = candidate; break; }
              }
              const direct = require('path').join(localDir, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
              if (fs.existsSync(direct)) ffmpegBin = direct;
            }
          } catch (x) {}

          try {
            const ff = spawn(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-i', job.inputPath, '-f', 'mp3', '-codec:a', 'libmp3lame', '-b:a', '128k', '-vn', job.outputPath]);
            ff.stderr.on('data', (d) => {
              // could parse progress here; for now just forward some lines
              // no-op
            });
            await new Promise((resolve, reject) => {
              ff.on('close', (code) => {
                if (code === 0) resolve(); else reject(new Error('ffmpeg exited ' + code));
              });
              ff.on('error', reject);
            });
            job.status = 'ready';
            job.ready = true;
          } catch (fferr) {
            job.status = 'error';
            job.error = String(fferr && fferr.message);
          }
        } else {
          // no transcode needed, treat input as ready
          job.status = 'ready';
          job.ready = true;
          // ensure outputPath points to input for streaming convenience
          job.outputPath = job.inputPath;
        }
      } catch (e) {
        job.status = 'error';
        job.error = String(e && e.message);
      }
      // schedule cleanup after 10 minutes
      setTimeout(() => {
        try {
          if (job.inputPath && fs.existsSync(job.inputPath) && job.inputPath !== job.outputPath) fs.unlinkSync(job.inputPath);
          if (job.outputPath && fs.existsSync(job.outputPath)) fs.unlinkSync(job.outputPath);
        } catch (ex) {}
        delete downloadJobs[job.id];
      }, 10 * 60 * 1000);
    })();
  }

  // Send updates periodically until job.ready or error
  const sendInterval = setInterval(() => {
    try {
      sseEvent('progress', { id: job.id, status: job.status, downloaded: job.downloaded, total: job.total, percent: job.total ? Math.round((job.downloaded / job.total) * 100) : null });
    } catch (e) {}
  }, 700);

  // initial immediate event
  sseEvent('progress', { id: job.id, status: job.status, downloaded: job.downloaded, total: job.total, percent: job.total ? Math.round((job.downloaded / job.total) * 100) : null });

  const checker = setInterval(() => {
    if (job.ready || job.status === 'error') {
      clearInterval(sendInterval);
      clearInterval(checker);
      sseEvent('progress', { id: job.id, status: job.status, downloaded: job.downloaded, total: job.total, percent: job.total ? Math.round((job.downloaded / job.total) * 100) : null });
      if (job.ready) sseEvent('done', { id: job.id, url: job.url, outputPathAvailable: !!job.outputPath });
      if (job.status === 'error') sseEvent('error', { id: job.id, error: job.error });
      try { res.end(); } catch (e) {}
    }
  }, 500);

  // client disconnect cleanup
  req.on('close', () => {
    try { clearInterval(sendInterval); clearInterval(checker); } catch (e) {}
  });
});

// Serve prepared local file (with Range support) using job id
app.get('/local-stream', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('missing id');
  const job = downloadJobs[id];
  if (!job || !job.outputPath) return res.status(404).send('not found');
  const file = job.outputPath;
  if (!fs.existsSync(file)) return res.status(404).send('not found');

  const stat = fs.statSync(file);
  const total = stat.size;
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    const chunkSize = (end - start) + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'audio/mpeg'
    });
    const stream = fs.createReadStream(file, { start, end });
    stream.pipe(res);
    stream.on('error', () => { try { res.end(); } catch (e) {} });
  } else {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': 'audio/mpeg' });
    fs.createReadStream(file).pipe(res);
  }
});

// =====================
// Cache endpoints
// =====================

// Start or reuse a persistent cache prefetch job for a given tubidy link or direct media URL
// Supports both GET (query) and POST (JSON body with { link, format })
app.all('/cache/prefetch', async (req, res) => {
  const link = (req.method === 'GET') ? req.query.link : (req.body && req.body.link) || req.query.link;
  const format = (req.method === 'GET') ? req.query.format : (req.body && req.body.format) || req.query.format || '';
  if (!link) return res.status(400).json({ error: 'missing link' });
  try {
    // compute deterministic key
    const key = cacheKeyFor(link, format || '');
    // choose output extension later after resolving final URL; for now detect any existing cached file
    const supportedExts = ['mp3','m4a','mp4','webm','ogg'];
    for (const e of supportedExts) {
      const existing = path.join(cacheDir, `${key}.${e}`);
      if (fs.existsSync(existing)) {
        cacheIndex[key] = { key, url: link, path: existing, ready: true, status: 'ready' };
        return res.json({ cached: true, key });
      }
    }

    // placeholder; outPath will be decided later once we know final URL
    const outExt = (format && format.toLowerCase() === 'mp3') ? 'mp3' : null;
    const outName = outExt ? `${key}.${outExt}` : null;
    const outPath = outName ? path.join(cacheDir, outName) : null;

    // If a cache job already exists, return key and current status
    if (cacheIndex[key] && cacheIndex[key].status && cacheIndex[key].status !== 'error') {
      return res.json({ cached: false, key, status: cacheIndex[key].status });
    }

    // create a placeholder entry
    cacheIndex[key] = { key, url: link, path: outPath, ready: false, status: 'queued', error: null };

    // run background job to resolve and download/transcode into cache (robust)
    (async () => {
      try {
        console.log('[cache/prefetch] job created key=', key, 'link=', link, 'format=', format);
        cacheIndex[key].status = 'resolving';
        // If user supplied a tubidy page link, try to resolve to final media URL
        let final = link;
        try {
          if (!/^https?:\/\/.+\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i.test(link)) {
            console.log('[cache/prefetch] resolving link...', link);
            const resolved = await resolveDownloadLink(link).catch((e) => { console.error('[cache/prefetch] resolve error', e && e.message); return null; });
            if (resolved) { final = resolved; console.log('[cache/prefetch] resolved to', final); }
            else console.log('[cache/prefetch] resolve returned no final URL; using original link');
          }
        } catch (e) {}

        cacheIndex[key].status = 'downloading';
        console.log('[cache/prefetch] preparing to download from', final);
        // If final URL looks like a page (or returns HTML), try to fetch the page and extract direct media links
        try {
          let safeFinal = final;
          try {
            const headResp = await axios.head(final, { headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 10, timeout: 10000 }).catch(() => null);
            const ct = headResp && headResp.headers && headResp.headers['content-type'] ? String(headResp.headers['content-type']) : '';
            if (!ct || ct.startsWith('text/') || ct.includes('html')) {
              console.log('[cache/prefetch] head indicates HTML or no content-type; fetching page to search for media links');
              const pageResp = await axios.get(final, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }, timeout: 15000, responseType: 'text' }).catch(() => null);
              const body = pageResp && pageResp.data ? pageResp.data : '';
              if (body) {
                try {
                  const $ = cheerio.load(body);
                  const mediaCandidates = [];
                  $('a[href]').each((i, a) => { try { const href = $(a).attr('href'); if (href && href.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) mediaCandidates.push(href); } catch(e){} });
                  $('source[src], video[src], audio[src]').each((i, el) => { try { const src = $(el).attr('src'); if (src && src.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) mediaCandidates.push(src); } catch(e){} });
                  const scriptText = $('script').map((i, s) => $(s).html()).get().join('\n');
                  const re = /https?:\/\/[^\s"']+\.(mp3|m4a|mp4|webm|ogg)(\?[^"']*)?/ig;
                  let m; while ((m = re.exec(scriptText)) !== null) mediaCandidates.push(m[0]);
                  const normalized = mediaCandidates.map(h => (h && h.startsWith('//') ? 'https:' + h : (h && h.startsWith('/') ? 'https://tubidy.cool' + h : h))).filter(Boolean);
                  if (normalized.length) {
                    safeFinal = normalized[0];
                    console.log('[cache/prefetch] found media candidate on page, using', safeFinal);
                  } else {
                    console.log('[cache/prefetch] no media candidates found on page; attempting to follow play/download anchors and JS links');
                    // collect candidate anchors (play/download buttons, download links) and JS-generated links
                    const candidates = [];
                    $('li.list-group-item a, a.title').each((i, a) => {
                      try {
                        const href = $(a).attr('href');
                        if (href) candidates.push(href.startsWith('//') ? 'https:' + href : (href.startsWith('/') ? 'https://tubidy.cool' + href : href));
                      } catch (e) {}
                    });
                    // extract window.open URLs from scripts
                    try {
                      const scripts = $('script').map((i, s) => $(s).html()).get().join('\n');
                      const winRe = /window\.open\(['\"]([^'\"\)]+)['\"]/ig;
                      let mm;
                      while ((mm = winRe.exec(scripts)) !== null) {
                        const u = mm[1];
                        if (u) candidates.push(u.startsWith('//') ? 'https:' + u : (u.startsWith('/') ? 'https://tubidy.cool' + u : u));
                      }
                    } catch (e) {}
                    // Try following each candidate to see if it redirects to a media resource
                    for (const c of candidates) {
                      try {
                        const r2 = await axios.get(c, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': final }, maxRedirects: 10, responseType: 'stream', timeout: 15000 });
                        const finalUrl2 = (r2.request && r2.request.res && r2.request.res.responseUrl) ? r2.request.res.responseUrl : c;
                        const ct2 = r2.headers && r2.headers['content-type'] ? r2.headers['content-type'] : '';
                        r2.data.destroy();
                        if (ct2 && /(audio|video)\//i.test(ct2)) {
                          safeFinal = finalUrl2;
                          console.log('[cache/prefetch] candidate redirected to media:', safeFinal, 'content-type:', ct2);
                          break;
                        }
                        // also accept direct file extension in final URL
                        if (finalUrl2 && finalUrl2.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) {
                          safeFinal = finalUrl2;
                          console.log('[cache/prefetch] candidate final URL looks like media:', safeFinal);
                          break;
                        }
                      } catch (e) {
                        // ignore per-candidate errors
                      }
                    }
                    if (safeFinal && safeFinal !== final) console.log('[cache/prefetch] using candidate-resolved URL', safeFinal); else console.log('[cache/prefetch] no candidate redirects produced media; will attempt to download original URL');
                  }
                } catch (e) { console.error('[cache/prefetch] page parse error', e && e.message); }
              }
            }
          } catch (e) { console.error('[cache/prefetch] head/fetch check error', e && e.message); }
          final = safeFinal;
        } catch (e) { console.error('[cache/prefetch] resolve-to-media check failed', e && e.message); }

        // decide output extension now that we know the final URL
        let chosenExt = outExt;
        // Try a HEAD request to get content-type and pick extension from that
        let headFinal = null;
        try {
          try {
            headFinal = await axios.head(final, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://tubidy.cool' }, maxRedirects: 10, timeout: 8000 }).catch(() => null);
          } catch (e) { headFinal = null; }
          const ct2 = headFinal && headFinal.headers && headFinal.headers['content-type'] ? String(headFinal.headers['content-type']).toLowerCase() : '';
          if (!chosenExt) {
            if (ct2.includes('mpeg') || ct2.includes('audio/mpeg')) chosenExt = 'mp3';
            else if (ct2.includes('audio/mp4') || ct2.includes('video/mp4') || final.match(/\/mp4(\/|$)|\.mp4(\?|$)/i)) chosenExt = 'mp4';
            else if (ct2.includes('webm') || final.match(/\.webm(\?|$)/i)) chosenExt = 'webm';
            else if (ct2.includes('ogg') || final.match(/\.ogg(\?|$)/i)) chosenExt = 'ogg';
            else if (ct2.includes('mpeg') || final.match(/\.m4a(\?|$)/i)) chosenExt = 'm4a';
            else {
              // fallback: if URL contains 'mp4' hint, prefer mp4; otherwise mp3
              if (String(final).toLowerCase().includes('/mp4') || String(final).toLowerCase().includes('.mp4')) chosenExt = 'mp4';
              else chosenExt = 'mp3';
            }
          }
        } catch (e) { chosenExt = chosenExt || 'mp3'; headFinal = headFinal || null; }
        const finalOutName = `${key}.${chosenExt}`;
        const finalOutPath = path.join(cacheDir, finalOutName);

        console.log('[cache/prefetch] downloading from', final, '-> will cache as', finalOutName, 'content-type-hint=', (headFinal && headFinal.headers && headFinal.headers['content-type']) || 'none');
        // download final URL to a temp input file
        const tmpIn = path.join(os.tmpdir(), `tubidy_cache_in_${key}`);
        const dl = await axios.get(final, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://tubidy.cool' }, responseType: 'stream', maxRedirects: 10, timeout: 120000 });
        const writer = fs.createWriteStream(tmpIn);
        // track bytes downloaded
        cacheIndex[key].downloaded = 0;
        dl.data.on('data', (chunk) => { cacheIndex[key].downloaded += chunk.length; });
        dl.data.on('error', (e) => { console.error('[cache/prefetch] download stream error', e && e.message); });
        dl.data.pipe(writer);
        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); dl.data.on('error', reject); });
        console.log('[cache/prefetch] download finished, tmpIn=', tmpIn, 'bytes=', cacheIndex[key].downloaded || 'unknown');

        // transcode to mp3 if requested or if input not mp3
        // First, detect if the downloaded input is actually an HTML page (some tubidy links return HTML wrappers).
        try {
          const firstChunk = (() => {
            try {
              const b = fs.readFileSync(tmpIn, { encoding: 'utf8' });
              return b && b.slice(0, 4096);
            } catch (e) { return null; }
          })();
          const contentTypeHint = String(dl.headers['content-type'] || '').toLowerCase();
          if (contentTypeHint.startsWith('text/') || (firstChunk && /<html|<!doctype|<meta|<script/i.test(firstChunk))) {
            // ensure debug dir exists and save the fetched page for inspection
            try {
              const debugDir = path.join(cacheDir, 'debug');
              if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
              const dbgPath = path.join(debugDir, `${key}.html`);
              // write the full downloaded body if possible, otherwise write the head
              try {
                const full = fs.readFileSync(tmpIn, { encoding: 'utf8' });
                fs.writeFileSync(dbgPath, full, { encoding: 'utf8' });
              } catch (we) {
                fs.writeFileSync(dbgPath, firstChunk || 'no-data', { encoding: 'utf8' });
              }
              console.log('[cache/prefetch] downloaded input looks like HTML; saved to', dbgPath);
            } catch (e) { console.error('[cache/prefetch] could not save debug HTML', e && e.message); }

            cacheIndex[key].status = 'error';
            cacheIndex[key].error = 'downloaded HTML page; no direct media URL found. Saved page to cache/debug/' + key + '.html';
            // Do not attempt to run ffmpeg on HTML input. Leave tmpIn for manual inspection and exit job.
            return;
          }
        } catch (e) {
          console.error('[cache/prefetch] html-detection error', e && e.message);
        }

        cacheIndex[key].status = 'transcoding';

        // Attempt to locate an ffmpeg binary (prefer ./ffmpeg/*/bin or ./ffmpeg/bin)
        let ffmpegBin = 'ffmpeg';
        try {
          const localDir = path.join(__dirname, 'ffmpeg');
          if (fs.existsSync(localDir)) {
            const subs = fs.readdirSync(localDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
            for (const s of subs) {
              const candidate = path.join(localDir, s, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
              if (fs.existsSync(candidate)) { ffmpegBin = candidate; break; }
            }
            const direct = path.join(localDir, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
            if (fs.existsSync(direct)) ffmpegBin = direct;
          }
        } catch (x) {}

        // quick check for ffmpeg availability
        let haveFfmpeg = false;
        try {
          const spawnSync = require('child_process').spawnSync;
          const chk = spawnSync(ffmpegBin, ['-version'], { timeout: 3000 });
          if (!chk.error && (chk.status === 0 || chk.stdout)) haveFfmpeg = true;
        } catch (ex) { haveFfmpeg = false; }
        console.log('[cache/prefetch] ffmpeg check: haveFfmpeg=', haveFfmpeg, 'ffmpegBin=', ffmpegBin);

        const ct = dl.headers && dl.headers['content-type'] ? dl.headers['content-type'] : '';
        const inputLooksMp3 = ct.toLowerCase().includes('mpeg') || (final && final.match(/\.mp3(\?|$)/i));
        const inputExtMatch = final && final.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i);
        const inputExt = inputExtMatch ? inputExtMatch[1].toLowerCase() : null;

        if (haveFfmpeg) {
          try {
            console.log('[cache/prefetch] starting ffmpeg transcode to', finalOutPath);
            await new Promise((resolve, reject) => {
              const ff = spawn(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-i', tmpIn, '-f', 'mp3', '-codec:a', 'libmp3lame', '-b:a', '128k', '-vn', finalOutPath]);
              ff.stderr.on('data', (d) => { try { console.log('[cache/prefetch][ffmpeg]', d.toString().slice(0,200)); } catch(e){} });
              ff.on('close', (c) => c === 0 ? resolve() : reject(new Error('ffmpeg exited ' + c)));
              ff.on('error', (err) => { console.error('[cache/prefetch] ffmpeg error', err && err.message); reject(err); });
            });
            cacheIndex[key].status = 'ready'; cacheIndex[key].ready = true; cacheIndex[key].url = final; cacheIndex[key].path = finalOutPath; try { cacheByUrl[final] = key; } catch (e) {}
            console.log('[cache/prefetch] transcode complete, cached at', finalOutPath);
          } catch (fferr) {
            cacheIndex[key].status = 'error'; cacheIndex[key].error = 'ffmpeg failed: ' + String(fferr && fferr.message);
            console.error('[cache/prefetch] ffmpeg transcode failed for key=', key, 'error=', cacheIndex[key].error);
          }
        } else {
          // No ffmpeg available: if input is MP3 copy it into cache, otherwise fail with helpful message
          try {
            if (inputLooksMp3 || inputExt) {
              // prefer preserving input extension when possible
              const destPath = finalOutPath;
              fs.copyFileSync(tmpIn, destPath);
              cacheIndex[key].status = 'ready'; cacheIndex[key].ready = true; cacheIndex[key].url = final; cacheIndex[key].path = destPath; try { cacheByUrl[final] = key; } catch (e) {}
              console.log('[cache/prefetch] ffmpeg not available; copied input to', destPath);
            } else {
              cacheIndex[key].status = 'error'; cacheIndex[key].error = 'ffmpeg not available on server and input is not a recognized audio container. Install ffmpeg or provide an MP3/MP4 source.';
              console.error('[cache/prefetch] cannot cache: no ffmpeg and unknown input for key=', key);
            }
          } catch (e2) { cacheIndex[key].status = 'error'; cacheIndex[key].error = String(e2 && e2.message); }
        }

        // cleanup temp input
        try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch (e) {}
      } catch (e) {
        cacheIndex[key].status = 'error'; cacheIndex[key].error = String(e && e.message);
      }
    })();

    return res.json({ cached: false, key });
  } catch (err) {
    console.error('/cache/prefetch error', err);
    return res.status(500).json({ error: String(err) });
  }
});

// Check cache status by link or key
app.get('/cache/status', (req, res) => {
  const link = req.query.link; const keyQ = req.query.key; const format = req.query.format || '';
  (async () => {
    try {
      let key = keyQ;
      if (!key && link) key = cacheKeyFor(link, format);
      if (!key) return res.status(400).json({ error: 'missing link or key' });
      const entry = cacheIndex[key];
      if (entry && entry.ready && entry.path && fs.existsSync(entry.path)) return res.json({ cached: true, key, path: entry.path, ready: true, status: entry.status, error: entry.error || null, downloaded: entry.downloaded || null });
      // if file exists on disk but not in index, try common extensions and add it
      const supportedExts = ['mp3','m4a','mp4','webm','ogg'];
      for (const e of supportedExts) {
        const expected = path.join(cacheDir, key + '.' + e);
        if (fs.existsSync(expected)) { cacheIndex[key] = { key, url: link || null, path: expected, ready: true, status: 'ready' }; return res.json({ cached: true, key, ready: true }); }
      }

      // Try to resolve the link to a final media URL and check cacheByUrl mapping
      try {
        const resolved = await resolveDownloadLink(link).catch(() => null);
        if (resolved) {
            if (cacheByUrl[resolved]) {
            const k2 = cacheByUrl[resolved];
            const e2 = cacheIndex[k2];
              if (e2 && e2.ready && e2.path && fs.existsSync(e2.path)) return res.json({ cached: true, key: k2, path: e2.path, ready: true });
            const supportedExts2 = ['mp3','m4a','mp4','webm','ogg'];
            for (const ex of supportedExts2) {
              const expected2 = path.join(cacheDir, k2 + '.' + ex);
              if (fs.existsSync(expected2)) { cacheIndex[k2] = { key: k2, url: resolved, path: expected2, ready: true, status: 'ready' }; return res.json({ cached: true, key: k2, ready: true }); }
            }
          } else {
            // also compute key based on resolved final URL and see if file exists
            const k3 = cacheKeyFor(resolved, format);
            const supportedExts3 = ['mp3','m4a','mp4','webm','ogg'];
            for (const ex3 of supportedExts3) {
              const expected3 = path.join(cacheDir, k3 + '.' + ex3);
              if (fs.existsSync(expected3)) { cacheIndex[k3] = { key: k3, url: resolved, path: expected3, ready: true, status: 'ready' }; cacheByUrl[resolved] = k3; return res.json({ cached: true, key: k3, ready: true }); }
            }
          }
        }
      } catch (e) {}

      if (entry) return res.json({ cached: false, key, status: entry.status || 'queued', error: entry.error || null, downloaded: entry.downloaded || null });
      return res.json({ cached: false, key });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  })();
});

// Stream cached file by key with Range support
app.get('/cache/stream', (req, res) => {
  const key = req.query.key;
  if (!key) return res.status(400).send('missing key');
  const entry = cacheIndex[key];
  const file = entry && entry.path ? entry.path : path.join(cacheDir, key + '.mp3');
  if (!fs.existsSync(file)) return res.status(404).send('not found');
  try {
    const stat = fs.statSync(file); const total = stat.size; const range = req.headers.range;
    // determine content-type from file extension
    const ext = (file.match(/\.([a-z0-9]+)$/i) || [null, 'mp3'])[1].toLowerCase();
    const mimeMap = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', webm: 'audio/webm', ogg: 'audio/ogg' };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-'); const start = parseInt(parts[0], 10); const end = parts[1] ? parseInt(parts[1], 10) : total - 1; const chunkSize = (end - start) + 1;
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${total}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunkSize, 'Content-Type': contentType });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': total, 'Content-Type': contentType }); fs.createReadStream(file).pipe(res);
    }
  } catch (e) { console.error('/cache/stream error', e); res.status(500).send('stream error'); }
});

// Debug: list cache index (keys, status, small summary)
app.get('/cache/list', (req, res) => {
  try {
    const out = Object.keys(cacheIndex).map(k => {
      const e = cacheIndex[k] || {};
      return { key: k, status: e.status || null, ready: !!e.ready, url: e.url || null, path: e.path || null, error: e.error || null };
    });
    return res.json({ count: out.length, items: out, byUrlCount: Object.keys(cacheByUrl || {}).length });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
});

// Streaming search with Server-Sent Events: emits progress and final results
app.get('/tubidy/search-stream', async (req, res) => {
  const q = req.query.q || req.query.query;
  if (!q) return res.status(400).send('missing query');

  // set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  function sseEvent(name, obj) {
    try {
      res.write('event: ' + name + '\n');
      res.write('data: ' + JSON.stringify(obj) + '\n\n');
    } catch (e) {}
  }

  console.log('[search-stream] starting stream for', q);

  const items = [];
  const seenLinks = new Set();

  async function collect(u) {
    try {
      const resp = await axios.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }, timeout: 12000 });
      const data = resp.data || '';
      const $ = cheerio.load(data);
      const foundNext = [];
      $('a[href]').each((i, a) => {
        try {
          const href = $(a).attr('href');
          const title = ($(a).attr('aria-label') || $(a).attr('title') || $(a).text() || '').trim();
          if (href && !seenLinks.has(href)) { seenLinks.add(href); items.push({ title: title || href, link: href }); }
          if (href && /search\.php/i.test(href) && /pn=\d+/.test(href)) {
            let next = href;
            if (next.startsWith('//')) next = 'https:' + next;
            if (next.startsWith('/')) next = 'https://tubidy.cool' + next;
            foundNext.push(next);
          }
        } catch (e) {}
      });
      return { ok: true, next: foundNext };
    } catch (e) { return { ok: false, next: [] }; }
  }

  const base = `https://tubidy.cool/search.php?q=${encodeURIComponent(q)}`;
  const queue = [];
  for (let p = 1; p <= 3; p++) { queue.push(base + `&page=${p}`); queue.push(base + `&p=${p}`); queue.push(base + `&pg=${p}`); }
  queue.push(base);
  const tried = new Set();
  let pagesFetched = 0;

  while (queue.length && items.length < 1000) {
    const u = queue.shift();
    if (!u || tried.has(u)) continue;
    tried.add(u);
    const r = await collect(u);
    if (!r.ok) continue;
    pagesFetched++;
    const candidates = items.length;
    const kept = items.filter(it => (/\/watch/i.test(it.link) || /id=/.test(it.link) || it.link.match(/\.(mp3|mp4|m4a|webm|ogg)(\?|$)/i))).length;
    sseEvent('progress', { pagesFetched, candidates, kept });
    if (r.next && r.next.length) {
      for (const n of r.next) if (!tried.has(n)) queue.push(n);
    }
    await new Promise((res2) => setTimeout(res2, 150));
  }

  const normalized = items.map(it => ({ title: it.title, link: it.link && it.link.startsWith('//') ? 'https:' + it.link : it.link }));
  const unique = [];
  const seen = new Set();
  for (const it of normalized) {
    if (!it.link) continue;
    const key = it.link;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }
  const keep = unique.filter(it => {
    const l = String(it.link || '').trim();
    const t = String(it.title || '').toLowerCase();
    if (!l) return false;
    const low = l.toLowerCase();
    if (low.startsWith('javascript:') || low.startsWith('mailto:') || low.startsWith('whatsapp:') || low.startsWith('#')) return false;
    const navWords = ['login', 'signup', 'register', 'upload', 'top', 'search', 'playlist.php', 'account', 'stats', 'about', 'contact', 'privacy', 'terms', 'help', 'faq', 'report'];
    for (const w of navWords) if (low.includes(w) && !low.includes('/watch')) return false;
    if (/\/watch/i.test(l) || /id=/.test(l) || l.match(/\.(mp3|m4a|mp4|webm|ogg)(\?|$)/i)) return true;
    if (t.match(/ - | ft\.| feat\.|official|audio|remix|visualizer/i)) return true;
    if (t.includes('next')) return true;
    return false;
  });

  sseEvent('result', { results: keep });
  sseEvent('done', { done: true });
  try { res.end(); } catch (e) {}
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));

// Endpoint to receive playback events from client for debugging
app.post('/events', (req, res) => {
  try {
    const body = req.body || {};
    console.log('[playback-event]', JSON.stringify(body));
  } catch (e) {
    console.error('[playback-event] parse error', e && e.message);
  }
  res.sendStatus(204);
});
