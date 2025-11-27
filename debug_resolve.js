const axios = require('axios');
const cheerio = require('cheerio');

const link = process.argv[2];
if (!link) {
  console.error('Usage: node debug_resolve.js <link>');
  process.exit(1);
}

async function resolve(link) {
  const base = 'https://tubidy.cool';
  const pageUrl = link.startsWith('http') ? link : (link.startsWith('//') ? 'https:' + link : base + link);
  console.log('Fetching page:', pageUrl);
  const resp = await axios.get(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }, timeout: 10000 });
  const $ = cheerio.load(resp.data || '');
  let result = null;
  $('li.list-group-item.big').each((i, e) => {
    const d = $(e);
    if (d.text().includes('Download')) {
      const a = d.find('a').first();
      if (a && a.attr('href')) result = a.attr('href');
    }
  });
  if (!result) {
    $('li.list-group-item a').each((i, a) => {
      if (!result) result = $(a).attr('href');
    });
  }
  console.log('Found href:', result);
  if (!result) return null;
  if (result.startsWith('//')) result = 'https:' + result;
  if (result.startsWith('/')) result = base + result;
  return result;
}

resolve(link).then(r => console.log('Resolved URL:', r)).catch(e => console.error('Error', e.message));
