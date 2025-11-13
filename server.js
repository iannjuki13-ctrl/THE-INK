/**
 * server.js
 * Small Express server for THE INK.
 * Endpoint: POST /api/fetchSummaries
 *
 * - Fetches RSS feeds server-side using rss-parser
 * - Extracts items, attempts to find images
 * - Summarizes each item with OpenAI (compliance + byline)
 * - Returns JSON with items array
 *
 * NOTE: Set environment variable OPENAI_API_KEY before deploying.
 */

const express = require('express');
const Parser = require('rss-parser');
const fetch = require('node-fetch');

const parser = new Parser({ timeout: 15000 });
const app = express();
app.use(express.json({ limit: '1mb' }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

if (!OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY not set. Summaries will fail until you set it.');
}

const PORT = process.env.PORT || process.env.VERCEL_PORT || 3000;

// Small utility: safe fetch with timeout
async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, timeout: 15000 });
    return res;
  } catch (err) {
    return null;
  }
}

// Try to get image URL for an RSS item (many feed formats differ)
function pickImageFromItem(item, index) {
  // common rss-parser fields
  if (!item) return null;
  if (item.image && typeof item.image === 'string') return item.image;
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (item['media:content'] && item['media:content'].url) return item['media:content'].url;
  if (item['media:thumbnail'] && item['media:thumbnail'].url) return item['media:thumbnail'].url;
  if (item.itunes && item.itunes.image) return item.itunes.image;
  // sometimes rss-parser exposes 'isoDate' but not images — fallback to common OG extraction (lightweight)
  const html = item['content:encoded'] || item.content || item.summary || '';
  const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && m[1]) return m[1];
  // cycle through tasteful Unsplash placeholders
  const placeholders = [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1509099836639-18ba67b8f2d0?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1400&q=80'
  ];
  return placeholders[index % placeholders.length];
}

// Summarize via OpenAI Chat Completions
async function summarizeWithOpenAI(prompt) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
`You are a professional news editor writing compliant, original summaries for a curated news site.
Rules:
- Produce a concise, original summary (about 60-120 words).
- Do NOT copy the article text verbatim; paraphrase.
- End with one short "Why it matters" sentence.
- Add a byline line at the end: "Source: <SOURCE> — Read full article here: <LINK>"
- Keep neutral tone and avoid graphic details.
Return only the summary text (no JSON wrapper).`
      },
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
    body: JSON.stringify(payload),
    // no-cache by design
  });

  if (!res.ok) {
    const txt = await res.text().catch(()=>`status ${res.status}`);
    throw new Error('OpenAI error: ' + txt);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  return content || '';
}

// Simple concurrency limiter: process items in small batches to avoid bursts
async function batchMap(items, fn, batchSize = 3, delayMs = 200) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    // map concurrently within batch
    const results = await Promise.all(batch.map(fn));
    out.push(...results);
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
  return out;
}

// POST /api/fetchSummaries
app.post('/api/fetchSummaries', async (req, res) => {
  try {
    const feeds = Array.isArray(req.body.feeds) ? req.body.feeds.slice(0, 12) : [];
    if (!feeds.length) return res.status(400).json({ error: 'No feeds provided' });

    // fetch each feed
    const feedPromises = feeds.map(async (u) => {
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
      } catch (err) {
        console.warn('Feed fetch failed for', u, err.message || err);
        return [];
      }
    });

    const arrays = await Promise.all(feedPromises);
    let items = arrays.flat();

    // dedupe by link+title
    const seen = new Set();
    items = items.filter(it => {
      const key = (it.link || '') + '||' + (it.title || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // sort by pubDate desc
    items.sort((a,b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });

    // cap to 30 items to control costs
    items = items.slice(0, 30);

    // prepare summarization tasks
    const tasks = items.map((it, idx) => async () => {
      // build prompt, include snippet for context
      const prompt = `Article title: ${it.title}
Source: ${it.source}
URL: ${it.link}
Snippet: ${it.snippet || '(no snippet available)'}

Task: Write a short, original news summary (60-120 words). Do not copy sentences verbatim from the snippet. End with one "Why it matters" sentence. Also append a single-line byline: "Source: ${it.source} — Read the full article here: ${it.link}".`;

      try {
        const aiSummary = await summarizeWithOpenAI(prompt);
        const image = pickImageFromItem(it.raw, idx);
        return {
          title: it.title,
          link: it.link,
          pubDate: it.pubDate,
          source: it.source,
          summary: (aiSummary || '').trim(),
          image
        };
      } catch (err) {
        // if OpenAI fails for this item, return a safe placeholder summary
        return {
          title: it.title,
          link: it.link,
          pubDate: it.pubDate,
          source: it.source,
          summary: '(Summary unavailable — open original article)',
          image: pickImageFromItem(it.raw, idx)
        };
      }
    });

    // run with small concurrency
    const results = await batchMap(tasks, async (fn) => fn(), 3, 300);

    return res.json({ items: results });
  } catch (err) {
    console.error('Server error', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
});

// Health
app.get('/health', (req,res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`THE INK server listening on port ${PORT}`);
});
