const express = require('express');
const Parser = require('rss-parser');
const fetch = require('node-fetch');
const path = require('path');

const parser = new Parser({ timeout: 15000 });
const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;

// --- Fixed RSS feeds (hidden from users) ---
const RSS_FEEDS = [
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://www.cnn.com/rss/edition_world.rss",
  "https://www.aljazeera.com/xml/rss/all.xml"
  // Add up to 50 URLs here
];

// Serve frontend files
app.use(express.static(path.join(__dirname, 'public')));

// --- Pick image helper ---
function pickImageFromItem(item, index) {
  if (!item) return null;
  if (item.image) return typeof item.image === 'string' ? item.image : item.image.url;
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (item['media:content'] && item['media:content'].url) return item['media:content'].url;
  if (item['media:thumbnail'] && item['media:thumbnail'].url) return item['media:thumbnail'].url;
  const html = item['content:encoded'] || item.content || item.summary || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && m[1]) return m[1];
  const placeholders = [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1509099836639-18ba67b8f2d0?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1400&q=80'
  ];
  return placeholders[index % placeholders.length];
}

// --- Summarize via OpenAI ---
async function summarizeWithOpenAI(prompt) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a professional news editor writing concise summaries.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 350
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => `status ${res.status}`);
    throw new Error('OpenAI error: ' + txt);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

// --- Concurrency helper ---
async function batchMap(items, fn, batchSize = 3, delayMs = 200) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(fn));
    out.push(...results);
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
  return out;
}

// --- POST /api/fetchSummaries (using hidden RSS_FEEDS) ---
app.get('/api/fetchSummaries', async (req, res) => {
  try {
    const feeds = RSS_FEEDS.slice(0, 50);

    const feedPromises = feeds.map(async (url) => {
      try {
        const feed = await parser.parseURL(url);
        const sourceTitle = feed.title || new URL(url).hostname;
        return (feed.items || []).slice(0, 8).map(it => ({
          title: it.title || 'No title',
          link: it.link || it.guid || '',
          pubDate: it.pubDate || it.isoDate || '',
          snippet: (it.contentSnippet || it.summary || it.content || '').toString(),
          raw: it,
          source: sourceTitle
        }));
      } catch (err) {
        console.warn('Feed failed:', url, err.message || err);
        return [];
      }
    });

    let items = (await Promise.all(feedPromises)).flat();

    const seen = new Set();
    items = items.filter(it => {
      const key = (it.link || '') + '||' + (it.title || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    items.sort((a,b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });

    items = items.slice(0, 50);

    const tasks = items.map((it, idx) => async () => {
      const prompt = `Title: ${it.title}\nSource: ${it.source}\nURL: ${it.link}\nSnippet: ${it.snippet || '(none)'}\nTask: Write a 60-120 word summary with one "Why it matters" sentence. Include a byline.`;
      try {
        const summary = await summarizeWithOpenAI(prompt);
        return { title: it.title, link: it.link, pubDate: it.pubDate, source: it.source, summary: summary.trim(), image: pickImageFromItem(it.raw, idx) };
      } catch {
        return { title: it.title, link: it.link, pubDate: it.pubDate, source: it.source, summary: '(Summary unavailable)', image: pickImageFromItem(it.raw, idx) };
      }
    });

    const results = await batchMap(tasks, async fn => fn(), 3, 300);
    return res.json({ items: results });
  } catch (err) {
    console.error('Server error', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
});

// --- Health ---
app.get('/health', (req, res) => res.send('ok'));

// --- Serve frontend ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`THE INK server listening on port ${PORT}`);
});
