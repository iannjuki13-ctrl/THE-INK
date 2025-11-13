// server.js — THE INK backend (category-aware, cached, async summaries)
const express = require('express');
const Parser = require('rss-parser');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json({ limit: '2mb' }));

const parser = new Parser({ timeout: 15000 });
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// --- Configuration ---
// Total number of hidden feeds across categories: 50
// Each feed is assigned to exactly one category (to power category pages).
const CATEGORY_FEEDS = {
  "world": [
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://feeds.reuters.com/reuters/worldNews",
    "https://www.theguardian.com/world/rss"
  ],
  "politics": [
    "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
    "https://feeds.a.dj.com/rss/RSSWSJD.xml",
    "https://feeds.reuters.com/Reuters/PoliticsNews",
    "https://www.washingtonpost.com/rss/politics",
    "https://www.politico.com/rss/politics08.xml"
  ],
  "technology": [
    "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
    "https://www.theverge.com/rss/index.xml",
    "https://feeds.feedburner.com/TechCrunch/",
    "https://www.wired.com/feed/rss",
    "https://feeds.arstechnica.com/arstechnica/index"
  ],
  "business": [
    "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
    "https://feeds.reuters.com/reuters/businessNews",
    "https://www.ft.com/?format=rss",
    "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    "https://www.bloomberg.com/feed/podcast/etf-report.xml"
  ],
  "sports": [
    "https://www.espn.com/espn/rss/news",
    "https://feeds.bbci.co.uk/sport/rss.xml?edition=uk",
    "https://www.nytimes.com/services/xml/rss/nyt/Sports.xml",
    "https://feeds.reuters.com/reuters/sportsNews",
    "https://www.skysports.com/rss/12040"
  ],
  "culture": [
    "https://www.theguardian.com/culture/rss",
    "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",
    "https://www.vox.com/rss/index.xml",
    "https://www.npr.org/rss/rss.php?id=1035",
    "https://www.nationalgeographic.com/content/nationalgeographic/en_us/rss/index.rss"
  ],
  "food": [
    "https://www.bonappetit.com/feed/rss",
    "https://www.foodandwine.com/rss",
    "https://www.seriouseats.com/rss",
    "https://www.epicurious.com/services/rss",
    "https://www.delish.com/rss/all.xml"
  ],
  "opinion": [
    "https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml",
    "https://www.theguardian.com/commentisfree/rss",
    "https://www.washingtonpost.com/rss/opinions",
    "https://www.ft.com/?edition=international&format=rss",
    "https://www.npr.org/rss/rss.php?id=1019"
  ],
  "science": [
    "https://www.sciencemag.org/rss/news_current.xml",
    "https://www.sciencedaily.com/rss/top/science.xml",
    "https://www.nature.com/subjects/science.rss",
    "https://www.newscientist.com/feed/home/",
    "https://www.scientificamerican.com/feed/rss/"
  ],
  "entertainment": [
    "https://rss.nytimes.com/services/xml/rss/nyt/Movies.xml",
    "https://feeds.gawker.com/gizmodo/full",
    "https://www.rollingstone.com/tv/tv-news/feed/",
    "https://www.billboard.com/feed/",
    "https://www.hollywoodreporter.com/t/feeds/"
  ]
};

// flatten to count and ensure ~50 feeds (we included 10 categories * 5 each = 50)
const ALL_HIDDEN_FEEDS = Object.values(CATEGORY_FEEDS).flat();

// --- Cache: per-category cache object ---
const cache = {}; // { category: { items: [...], lastUpdated: timestamp } }
const CACHE_TTL = 30 * 1000; // 30 seconds TTL (fast and snappy). Increase if you want less frequent updates.

// --- Utilities ---
function now() { return Date.now(); }

function pickImageFromItem(item, index) {
  if (!item) return null;
  if (item.image && typeof item.image === 'string') return item.image;
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  const html = item['content:encoded'] || item.content || item.summary || '';
  const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && m[1]) return m[1];
  // tasteful placeholders
  const placeholders = [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1509099836639-18ba67b8f2d0?auto=format&fit=crop&w=1400&q=80'
  ];
  return placeholders[index % placeholders.length];
}

// OpenAI summarization (optional). When no API key, we'll use placeholder brief snippet text.
async function summarizeWithOpenAI(prompt) {
  if (!OPENAI_API_KEY) return '(Summary unavailable — API key not set)';
  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a professional news editor. Write a concise (60-110 word) original summary, paraphrasing; end with one "Why it matters" sentence; add a byline with source and link.' },
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
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('OpenAI error: ' + (txt || res.status));
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

// concurrency helper
async function batchMap(array, mapper, batchSize = 3, delayMs = 200) {
  const out = [];
  for (let i = 0; i < array.length; i += batchSize) {
    const batch = array.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(mapper));
    out.push(...results);
    if (i + batchSize < array.length) await new Promise(r => setTimeout(r, delayMs));
  }
  return out;
}

// Fetch feed items (no summarization) for a list of feed URLs:
async function fetchFeedItemsForFeeds(feeds, limitPerFeed = 6) {
  const feedPromises = feeds.map(async (url) => {
    try {
      const feed = await parser.parseURL(url);
      const sourceTitle = feed.title || new URL(url).hostname;
      return (feed.items || []).slice(0, limitPerFeed).map(it => ({
        title: it.title || 'No title',
        link: it.link || it.guid || '',
        pubDate: it.pubDate || it.isoDate || '',
        snippet: (it.contentSnippet || it.summary || it.content || '').toString(),
        raw: it,
        source: sourceTitle
      }));
    } catch (err) {
      console.warn('Feed fetch failed for', url, err && err.message);
      return [];
    }
  });

  const arrays = await Promise.all(feedPromises);
  return arrays.flat();
}

// Core: get (cached) items for a category (or for 'all')
async function getItemsForCategory(category = 'all') {
  // normalize
  category = (category || 'all').toString().toLowerCase();

  // if valid category and cached and fresh, return it
  if (cache[category] && (now() - cache[category].lastUpdated < CACHE_TTL) && cache[category].items?.length) {
    return cache[category].items;
  }

  // determine feeds to fetch
  let feedsToFetch;
  if (category === 'all') feedsToFetch = ALL_HIDDEN_FEEDS;
  else if (CATEGORY_FEEDS[category]) feedsToFetch = CATEGORY_FEEDS[category];
  else {
    // unknown category -> return empty
    return [];
  }

  // fetch feed items (fast)
  const rawItems = await fetchFeedItemsForFeeds(feedsToFetch, 6);

  // dedupe by link+title
  const seen = new Set();
  const items = rawItems.filter(it => {
    const key = (it.link || '') + '||' + (it.title || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // sort newest first
  items.sort((a, b) => (new Date(b.pubDate).getTime() || 0) - (new Date(a.pubDate).getTime() || 0));

  // limit total items returned
  const limited = items.slice(0, 50);

  // Prepare response objects — include a placeholder summary; update summaries async
  const prepared = limited.map((it, idx) => ({
    title: it.title,
    link: it.link,
    pubDate: it.pubDate,
    source: it.source,
    summary: it.snippet ? (it.snippet.length > 300 ? it.snippet.slice(0, 300) + '...' : it.snippet) : '(No summary yet)',
    image: pickImageFromItem(it.raw, idx)
  }));

  // store in cache immediately (so GET returns fast)
  cache[category] = { items: prepared, lastUpdated: now() };

  // async: request improved summaries in background and update cache when done
  (async () => {
    try {
      const summaryTasks = prepared.map((it, idx) => async () => {
        // If OpenAI key missing, skip heavy summary and keep snippet-based summary
        if (!OPENAI_API_KEY) return it;
        const prompt = `Article title: ${it.title}\nSource: ${it.source}\nURL: ${it.link}\nSnippet: ${it.summary}\n\nWrite a short (60-110 word) original summary in neutral tone. End with one "Why it matters" sentence. Append a single-line byline: "Source: ${it.source} — Read full article here: ${it.link}"`;
        try {
          const s = await summarizeWithOpenAI(prompt);
          it.summary = s.trim();
        } catch (e) {
          // keep existing snippet fallback
          console.warn('OpenAI summary failed for', it.link, e && e.message);
        }
        return it;
      });

      // run in batches to avoid bursts
      const updated = await batchMap(summaryTasks, async f => f(), 3, 400);
      // write back to cache if still fresh-ish
      if (cache[category] && (now() - cache[category].lastUpdated < CACHE_TTL * 4)) {
        cache[category].items = updated;
        cache[category].lastUpdated = now();
      }
    } catch (e) {
      console.error('Background summarization error', e && e.message);
    }
  })();

  return prepared;
}

// --- Routes ---
// Serve frontend static files from /public
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// GET /api/fetchSummaries?category=politics
app.get('/api/fetchSummaries', async (req, res) => {
  try {
    const category = (req.query.category || 'all').toString().toLowerCase();
    const items = await getItemsForCategory(category);
    return res.json({ items, category, lastUpdated: cache[category]?.lastUpdated || null });
  } catch (e) {
    console.error('API error', e && e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/fetchSummaries with body: { feeds: ["https://...","..."] }
// This will fetch and return only those feeds for this request (no persistent override).
app.post('/api/fetchSummaries', async (req, res) => {
  try {
    const feeds = Array.isArray(req.body.feeds) ? req.body.feeds.slice(0, 50) : [];
    if (!feeds.length) return res.status(400).json({ error: 'No feeds provided' });

    const raw = await fetchFeedItemsForFeeds(feeds, 6);
    const seen = new Set();
    const items = raw.filter(it => {
      const key = (it.link || '') + '||' + (it.title || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 50).map((it, idx) => ({
      title: it.title,
      link: it.link,
      pubDate: it.pubDate,
      source: it.source,
      summary: (it.snippet && it.snippet.length > 300) ? it.snippet.slice(0, 300) + '...' : it.snippet || '(No summary yet)',
      image: pickImageFromItem(it.raw, idx)
    }));

    // async summarize in background for this dataset too
    (async () => {
      if (!OPENAI_API_KEY) return;
      try {
        const summaryTasks = items.map((it) => async () => {
          try {
            const s = await summarizeWithOpenAI(`Title: ${it.title}\nSource: ${it.source}\nURL: ${it.link}\nSnippet: ${it.summary}\nWrite a short summary.`);
            it.summary = s.trim();
          } catch (err) {}
          return it;
        });
        await batchMap(summaryTasks, async f => f(), 3, 300);
      } catch (err) { /* ignore */ }
    })();

    return res.json({ items, feedsProvided: feeds.length });
  } catch (err) {
    console.error('POST fetch error', err && err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// simple health
app.get('/health', (req, res) => res.send('ok'));

// start
app.listen(PORT, () => console.log(`THE INK server listening on port ${PORT}`));
