// server.js — THE INK complete server

const express = require('express');
const path = require('path');
const Parser = require('rss-parser');
const fetch = require('node-fetch');

const app = express();
const parser = new Parser({ timeout: 15000 });
app.use(express.json({ limit: '1mb' }));

// === Environment Variables ===
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
if (!OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY not set. Summaries will fail until you set it.');
}

// === Serve front-end static files ===
app.use(express.static(path.join(__dirname, 'public')));

// === API: POST /api/fetchSummaries ===
async function summarizeWithOpenAI(prompt) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `
You are a professional news editor writing compliant, original summaries for a curated news site.
Rules:
- Produce a concise, original summary (60-120 words).
- Do NOT copy the article text verbatim; paraphrase.
- End with one short "Why it matters" sentence.
- Add a byline: "Source: <SOURCE> — Read full article here: <LINK>"
- Neutral tone, avoid graphic details.
Return only the summary text.`
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
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => `status ${res.status}`);
    throw new Error('OpenAI error: ' + txt);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

function pickImageFromItem(item, index) {
  if (!item) return null;
  if (item.image) return typeof item.image === 'string' ? item.image : item.image.url;
  if (item.enclosure?.url) return item.enclosure.url;
  if (item['media:content']?.url) return item['media:content'].url;
  if (item['media:thumbnail']?.url) return item['media:thumbnail'].url;
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

app.post('/api/fetchSummaries', async (req, res) => {
  try {
    const feeds = Array.isArray(req.body.feeds) ? req.body.feeds.slice(0, 12) : [];
    if (!feeds.length) return res.status(400).json({ error: 'No feeds provided' });

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
        console.warn('Feed fetch failed for', url, err.message || err);
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

    items.sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });

    items = items.slice(0, 30);

    const tasks = items.map((it, idx) => async () => {
      const prompt = `Article title: ${it.title}
Source: ${it.source}
URL: ${it.link}
Snippet: ${it.snippet || '(no snippet available)'}
Task: Write a short, original news summary (60-120 words). End with one "Why it matters" sentence. Append byline: "Source: ${it.source} — Read full article here: ${it.link}".`;

      try {
        const aiSummary = await summarizeWithOpenAI(prompt);
        const image = pickImageFromItem(it.raw, idx);
        return { ...it, summary: aiSummary.trim(), image };
      } catch {
        return { ...it, summary: '(Summary unavailable)', image: pickImageFromItem(it.raw, idx) };
      }
    });

    const results = await batchMap(tasks, async fn => fn(), 3, 300);
    return res.json({ items: results });
  } catch (err) {
    console.error('Server error', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
});

// Health check
app.get('/health', (req, res) => res.send('ok'));

// Catch-all to serve front-end
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`THE INK server listening on port ${PORT}`);
});
