const tubidy = require('tubidy-scrape');
const axios = require('axios');
const cheerio = require('cheerio');

const q = process.argv[2] || 'vintage';

(async () => {
  console.log('Query:', q);
  try {
    const results = await tubidy.search(q);
    console.log('tubidy-scrape.search returned', (results && results.length) || 0, 'items');
    console.dir(results, { depth: 2 });
  } catch (e) {
    console.error('tubidy.search error', e);
  }

  try {
    const url = `https://tubidy.cool/search.php?q=${encodeURIComponent(q)}`;
    // Try normal request
    let resp = await axios.get(url, { timeout: 10000 });
    console.log('\nFetch attempt 1: status=', resp.status, 'len=', (resp.data || '').length);
    // If empty, try with a browser-like User-Agent
    if (!resp.data || !resp.data.length) {
      resp = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }
      });
      console.log('Fetch attempt 2 (with UA): status=', resp.status, 'len=', (resp.data || '').length);
    }
    const data = resp.data || '';
    console.log('\nFetched raw HTML (first 2000 chars):\n');
    console.log(data.slice(0, 2000));

    // Try parsing with cheerio to find links/titles
    try {
      const $ = cheerio.load(data);
      const items = [];
      // common patterns
      $('div.media-body').each((i, el) => {
        const a = $(el).find('a').first();
        if (a && a.attr('href')) items.push({ title: a.attr('aria-label') || a.text().trim(), link: a.attr('href') });
      });
      // fallback: any anchor with aria-label
      if (!items.length) {
        $('a[aria-label]').each((i, a) => {
          items.push({ title: $(a).attr('aria-label'), link: $(a).attr('href') });
        });
      }
      // another fallback: list-group-item a
      if (!items.length) {
        $('li.list-group-item a').each((i, a) => {
          items.push({ title: $(a).text().trim(), link: $(a).attr('href') });
        });
      }

      console.log('\nParsed items count:', items.length);
      console.dir(items.slice(0, 20), { depth: 2 });
    } catch (e) {
      console.error('parse error', e.message);
    }
  } catch (e) {
    console.error('axios fetch error', e.message);
  }
})();
