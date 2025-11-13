// server.js — THE INK
const express = require('express');
const Parser = require('rss-parser');
const fetch = require('node-fetch');
const path = require('path');

const parser = new Parser({ timeout: 15000 });
const app = express();
app.use(express.json({ limit: '1mb' }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Your hidden RSS feeds
const HIDDEN_FEEDS = [
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://feeds.bbci.co.uk/news/technology/rss.xml",
  "https://feeds.bbci.co.uk/news/business/rss.xml",
  "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
  "https://www.theguardian.com/world/rss",
  "https://www.theguardian.com/technology/rss",
  "https://www.theguardian.com/business/rss",
  "https://www.theguardian.com/sport/rss",
  "https://www.theguardian.com/culture/rss",
  "https://www.reutersagency.com/feed/?best-topics=world",
  "https://www.reutersagency.com/feed/?best-topics=technology",
  "https://www.reutersagency.com/feed/?best-topics=business",
  "https://www.aljazeera.com/xml/rss/all.xml",
  "https://www.aljazeera.com/xml/rss/technology.xml",
  "https://www.aljazeera.com/xml/rss/sports.xml",
  "https://www.aljazeera.com/xml/rss/culture.xml",
  "https://www.cnn.com/rss/edition_world.rss",
  "https://www.cnn.com/rss/edition_technology.rss",
  "https://www.cnn.com/rss/edition_business.rss",
  "https://www.cnn.com/rss/edition_sport.rss",
  "https://www.cnn.com/rss/edition_entertainment.rss",
  "https://feeds.feedburner.com/TechCrunch/",
  "https://feeds.feedburner.com/Engadget",
  "https://www.theverge.com/rss/index.xml",
  "https://www.wired.com/feed/rss",
  "https://www.npr.org/rss/rss.php?id=1001",
  "https://www.npr.org/rss/rss.php?id=1003",
  "https://www.npr.org/rss/rss.php?id=1004",
  "https://www.npr.org/rss/rss.php?id=1007",
  "https://www.vox.com/rss/index.xml",
  "https://www.polygon.com/rss/index.xml",
  "https://www.techradar.com/rss",
  "https://www.engadget.com/rss.xml",
  "https://www.bbcgoodfood.com/feed",
  "https://www.bloomberg.com/feed/podcast",
  "https://feeds.a.dj.com/rss/RSSWorldNews.xml",
  "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
  "https://feeds.a.dj.com/rss/RSSWSJcomUSBusiness.xml",
  "https://feeds.a.dj.com/rss/RSSWSJcomUSPolitics.xml",
  "https://feeds.a.dj.com/rss/RSSWSJcomUSWorld.xml",
  "https://feeds.a.dj.com/rss/RSSWSJcomTechnology.xml",
  "https://feeds.feedburner.com/venturebeat/SZYF",
  "https://feeds.feedburner.com/venturebeat/retro"
];

// Cache for faster responses
let cachedItems = [];
let lastFetch = 0;
const CACHE_DURATION_MS = 15 * 1000; // 15 seconds cache

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
if (!OPENAI_API_KEY) console.warn('OPENAI_API_KEY not set! Summaries will fail.');

const PORT = process.env.PORT || 3000;

// Helpers
async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, timeout: 15000 });
    return res;
  } catch {
    return null;
  }
}

function pickImage(item, index) {
  if (!item) return null;
  if (item.image) return typeof item.image === 'string' ? item.image : item.image.url;
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (item['media:content'] && item['media:content'].url) return item['media:content'].url;
  const html = item['content:encoded'] || item.content || item.summary || '';
  const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && m[1]) return m[1];
  const placeholders = [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1509099836639-18ba67b8f2d0?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1400&q=80'
  ];
  return placeholders[index % placeholders.length];
}

async function summarizeWithOpenAI(prompt) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a professional news editor. Write concise, original summaries (60-120 words) with neutral tone. Add a byline: Source: <SOURCE> — Read full article: <LINK>' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 350
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('OpenAI error');
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

// Fetch feeds
async function fetchFeeds(feeds = HIDDEN_FEEDS) {
  const now = Date.now();
  if (cachedItems.length && now - lastFetch < CACHE_DURATION_MS) return cachedItems;

  const feedPromises = feeds.map(async u => {
    try {
      const feed = await parser.parseURL(u);
      const sourceTitle = feed.title || new URL(u).hostname;
      return (feed.items || []).slice(0, 8).map(it => ({
        title: it.title || 'No title',
        link: it.link || it.guid || '',
        pubDate: it.pubDate || it.isoDate || '',
        snippet: (it.contentSnippet || it.summary || it.content || '').toString(),
        raw: it,
        source: sourceTitle
      }));
    } catch {
      return [];
    }
  });

  let items = (await Promise.all(feedPromises)).flat();

  // dedupe
  const seen = new Set();
  items = items.filter(it => {
    const key = (it.link || '') + '||' + (it.title || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // sort by date desc
  items.sort((a,b) => (new Date(b.pubDate).getTime() || 0) - (new Date(a.pubDate).getTime() || 0));

  // limit
  items = items.slice(0, 30);

  // summarize each
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      const summary = await summarizeWithOpenAI(`Title: ${it.title}\nSource: ${it.source}\nURL: ${it.link}\nSnippet: ${it.snippet || '(no snippet)'}\nWrite a short news summary.`);
      results.push({ title: it.title, link: it.link, pubDate: it.pubDate, source: it.source, summary, image: pickImage(it.raw, i) });
    } catch {
      results.push({ title: it.title, link: it.link, pubDate: it.pubDate, source: it.source, summary: '(Summary unavailable)', image: pickImage(it.raw, i) });
    }
  }

  cachedItems = results;
  lastFetch = now;
  return results;
}

// Routes
app.get('/api/fetchSummaries', async (req, res) => {
  try {
    const items = await fetchFeeds();
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'server error' });
  }
});

app.post('/api/fetchSummaries', async (req, res) => {
  const feeds = Array.isArray(req.body.feeds) ? req.body.feeds : HIDDEN_FEEDS;
  try {
    const items = await fetchFeeds(feeds);
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'server error' });
  }
});

// Health
app.get('/health', (req,res) => res.send('ok'));

// Start server
app.listen(PORT, () => console.log(`THE INK server running on port ${PORT}`));
