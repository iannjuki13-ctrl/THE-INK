const express = require('express');
const Parser = require('rss-parser');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '2mb' }));

const parser = new Parser({ timeout: 15000 });
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

if (!OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY not set. Summaries will fail.');
}

// --- Hidden 50 RSS feeds ---
const HIDDEN_FEEDS = [
  'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.theguardian.com/world/rss',
  // ... add up to 50 RSS feed URLs here
];

// --- Cache ---
let cachedItems = [];
let lastUpdated = 0;
const CACHE_DURATION_MS = 5000; // 5 seconds

// --- Utilities ---
async function pickImageFromItem(item, index){
  if(!item) return null;
  if(item.image && typeof item.image === 'string') return item.image;
  if(item.enclosure && item.enclosure.url) return item.enclosure.url;
  if(item['media:content'] && item['media:content'].url) return item['media:content'].url;
  if(item['media:thumbnail'] && item['media:thumbnail'].url) return item['media:thumbnail'].url;
  const html = item['content:encoded'] || item.content || item.summary || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if(m && m[1]) return m[1];
  const placeholders = [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1509099836639-18ba67b8f2d0?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1400&q=80'
  ];
  return placeholders[index % placeholders.length];
}

async function summarizeWithOpenAI(prompt){
  if(!OPENAI_API_KEY) return '(Summary unavailable — API key missing)';
  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: `You are a professional news editor writing original summaries.` },
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
  if(!res.ok) return '(Summary unavailable — OpenAI error)';
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '(No summary)';
}

async function batchMap(items, fn, batchSize=3, delayMs=200){
  const out = [];
  for(let i=0;i<items.length;i+=batchSize){
    const batch = items.slice(i,i+batchSize);
    const results = await Promise.all(batch.map(fn));
    out.push(...results);
    if(i+batchSize < items.length) await new Promise(r=>setTimeout(r, delayMs));
  }
  return out;
}

// --- Fetch & cache feeds ---
async function fetchAndCacheFeeds(feeds){
  try{
    const feedPromises = feeds.map(async url=>{
      try{
        const feed = await parser.parseURL(url);
        const sourceTitle = feed.title || new URL(url).hostname;
        return (feed.items || []).slice(0,8).map(it=>({
          title: it.title || 'No title',
          link: it.link || it.guid || '',
          pubDate: it.pubDate || it.isoDate || '',
          snippet: (it.contentSnippet || it.summary || it.content || '').toString(),
          raw: it,
          source: sourceTitle
        }));
      }catch(err){
        console.warn('Failed feed', url, err.message);
        return [];
      }
    });

    const arrays = await Promise.all(feedPromises);
    let items = arrays.flat();

    // dedupe
    const seen = new Set();
    items = items.filter(it=>{
      const key = (it.link||'')+'||'+(it.title||'');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // sort by date desc
    items.sort((a,b)=>{
      const da = a.pubDate? new Date(a.pubDate).getTime():0;
      const db = b.pubDate? new Date(b.pubDate).getTime():0;
      return db-da;
    });

    // limit 50
    items = items.slice(0,50);

    // summarize + pick image
    const tasks = items.map((it,idx)=> async ()=>{
      const prompt = `Article title: ${it.title}\nSource: ${it.source}\nURL: ${it.link}\nSnippet: ${it.snippet || '(no snippet)'}\n\nWrite a short original summary (60-120 words). End with one "Why it matters" sentence. Append a byline: "Source: ${it.source} — Read full article here: ${it.link}"`;
      try{
        const summary = await summarizeWithOpenAI(prompt);
        return { title: it.title, link: it.link, pubDate: it.pubDate, source: it.source, summary, image: pickImageFromItem(it.raw, idx) };
      }catch(e){
        return { title: it.title, link: it.link, pubDate: it.pubDate, source: it.source, summary: '(Summary unavailable)', image: pickImageFromItem(it.raw, idx) };
      }
    });

    cachedItems = await batchMap(tasks, fn=>fn(), 3, 300);
    lastUpdated = Date.now();
    return cachedItems;
  }catch(err){
    console.error('Error fetching feeds', err);
    return cachedItems || [];
  }
}

// --- Endpoints ---

// GET: auto fetch hidden feeds (fast)
app.get('/api/fetchSummaries', async (req,res)=>{
  const now = Date.now();
  if(now-lastUpdated < CACHE_DURATION_MS && cachedItems.length) return res.json({ items: cachedItems });
  const items = await fetchAndCacheFeeds(HIDDEN_FEEDS);
  res.json({ items });
});

// POST: optional manual feeds
app.post('/api/fetchSummaries', async (req,res)=>{
  const feeds = Array.isArray(req.body.feeds)? req.body.feeds.slice(0,50): [];
  if(!feeds.length) return res.status(400).json({ error:'No feeds provided' });
  const items = await fetchAndCacheFeeds(feeds);
  res.json({ items });
});

// Health check
app.get('/health',(req,res)=> res.send('ok'));

app.listen(PORT, ()=> console.log(`THE INK server listening on port ${PORT}`));
