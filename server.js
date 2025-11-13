// server.js
const express = require('express');
const Parser = require('rss-parser');
const fetch = require('node-fetch');

const parser = new Parser({ timeout: 15000 });
const app = express();
app.use(express.json({ limit: '1mb' }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
if(!OPENAI_API_KEY){
  console.warn('Warning: OPENAI_API_KEY not set. Summaries will fail.');
}

const PORT = process.env.PORT || 3000;

// --- Hidden 50 RSS feeds ---
const HIDDEN_FEEDS = [
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://feeds.bbci.co.uk/news/technology/rss.xml",
  "https://feeds.bbci.co.uk/news/business/rss.xml",
  "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
  "https://www.theguardian.com/world/rss",
  "https://www.theguardian.com/technology/rss",
  "https://www.theguardian.com/us-news/rss",
  "https://www.theguardian.com/sport/rss",
  "https://www.theguardian.com/science/rss",
  "https://www.aljazeera.com/xml/rss/all.xml",
  "https://www.aljazeera.com/rss/technology.xml",
  "https://www.aljazeera.com/rss/sports.xml",
  "https://www.aljazeera.com/rss/economy.xml",
  "https://www.aljazeera.com/rss/science.xml",
  "https://www.cnn.com/rss/edition_world.rss",
  "https://www.cnn.com/rss/edition_technology.rss",
  "https://www.cnn.com/rss/edition_business.rss",
  "https://www.cnn.com/rss/edition_sport.rss",
  "https://www.cnn.com/rss/edition_health.rss",
  "https://rss.dw.com/xml/rss-en-world",
  "https://rss.dw.com/xml/rss-en-science",
  "https://rss.dw.com/xml/rss-en-technology",
  "https://rss.dw.com/xml/rss-en-economy",
  "https://rss.dw.com/xml/rss-en-sport",
  "https://feeds.reuters.com/reuters/technologyNews",
  "https://feeds.reuters.com/reuters/businessNews",
  "https://feeds.reuters.com/reuters/worldNews",
  "https://feeds.reuters.com/reuters/sportsNews",
  "https://feeds.reuters.com/reuters/scienceNews",
  "https://rss.npr.org/1004/rss.xml",
  "https://rss.npr.org/1019/rss.xml",
  "https://rss.npr.org/1006/rss.xml",
  "https://rss.npr.org/1007/rss.xml",
  "https://rss.npr.org/1001/rss.xml",
  "https://www.engadget.com/rss.xml",
  "https://www.techradar.com/rss",
  "https://www.theverge.com/rss/index.xml",
  "https://www.wired.com/feed/rss",
  "https://feeds.arstechnica.com/arstechnica/index",
  "https://www.sciencemag.org/rss/news_current.xml",
  "https://www.scientificamerican.com/feed/rss/",
  "https://www.space.com/feeds/all",
  "https://www.space.com/news/rss",
  "https://www.nationalgeographic.com/content/nationalgeographic/en_us/news.rss",
  "https://feeds.feedburner.com/time/topstories"
];

// --- Cache ---
let cache = { items: [], lastUpdate: 0 };
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// --- Utilities ---
function pickImageFromItem(item, index){
  if(!item) return null;
  if(item.image) return typeof item.image==='string'?item.image:item.image.url;
  if(item.enclosure && item.enclosure.url) return item.enclosure.url;
  const html = item.content || item.summary || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1] || `https://picsum.photos/seed/${index}/800/450`;
}

async function summarizeWithOpenAI(prompt){
  if(!OPENAI_API_KEY) return '(OpenAI API key not set)';
  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role:'system', content:'You are a professional news editor. Write short, original summaries. End with "Why it matters" and one-line byline.' },
      { role:'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 350
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{ 'Authorization':`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  if(!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function batchMap(items, fn, batchSize=3, delayMs=200){
  const out=[];
  for(let i=0;i<items.length;i+=batchSize){
    const batch = items.slice(i,i+batchSize);
    const results = await Promise.all(batch.map(fn));
    out.push(...results);
    if(i+batchSize<items.length) await new Promise(r=>setTimeout(r, delayMs));
  }
  return out;
}

// --- Function to fetch and summarize feeds ---
async function fetchAndSummarize(feeds){
  const feedPromises = feeds.map(async url=>{
    try{
      const feed = await parser.parseURL(url);
      const source = feed.title || new URL(url).hostname;
      return (feed.items||[]).slice(0,8).map(it=>({
        title: it.title||'No title',
        link: it.link||it.guid||'',
        pubDate: it.pubDate||it.isoDate||'',
        snippet: it.contentSnippet||it.summary||it.content||'',
        raw: it,
        source
      }));
    }catch(err){ return []; }
  });

  let arrays = await Promise.all(feedPromises);
  let items = arrays.flat();

  // dedupe
  const seen = new Set();
  items = items.filter(it=>{
    const key = (it.link||'')+'||'+(it.title||'');
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  items.sort((a,b)=> (new Date(b.pubDate).getTime()||0)-(new Date(a.pubDate).getTime()||0));
  items = items.slice(0,50);

  // summarize
  const tasks = items.map((it,idx)=> async ()=>{
    try{
      const prompt = `Title: ${it.title}\nSource: ${it.source}\nURL: ${it.link}\nSnippet: ${it.snippet || '(none)'}\nTask: Short news summary (60-120 words). End with "Why it matters" and one-line byline.`;
      const summary = await summarizeWithOpenAI(prompt);
      return {
        title: it.title, link: it.link, pubDate: it.pubDate, source: it.source,
        summary: summary||'(Summary unavailable)',
        image: pickImageFromItem(it.raw, idx)
      };
    }catch(err){
      return {
        title: it.title, link: it.link, pubDate: it.pubDate, source: it.source,
        summary:'(Summary unavailable)',
        image: pickImageFromItem(it.raw, idx)
      };
    }
  });

  const results = await batchMap(tasks, async fn=>fn(), 3, 300);
  return results;
}

// --- Background updater ---
async function updateCache(){
  try{
    const items = await fetchAndSummarize(HIDDEN_FEEDS);
    cache = { items, lastUpdate: Date.now() };
    console.log(`Cache updated: ${items.length} items`);
  }catch(err){
    console.error('Cache update failed', err);
  }
}

// Initial fetch
updateCache();
// Update every 5 minutes
setInterval(updateCache, CACHE_DURATION_MS);

// --- API ---
app.get('/api/fetchSummaries', (req,res)=>{
  // Return cached items immediately
  res.json({ items: cache.items, lastUpdate: cache.lastUpdate });
});

app.post('/api/fetchSummaries', async (req,res)=>{
  try{
    const bodyFeeds = Array.isArray(req.body.feeds)?req.body.feeds.slice(0,12):[];
    if(!bodyFeeds.length) return res.status(400).json({ error:'No feeds provided' });
    const items = await fetchAndSummarize(bodyFeeds);
    res.json({ items });
  }catch(err){
    res.status(500).json({ error: err.message||'server error' });
  }
});

// Health
app.get('/health',(req,res)=>res.send('ok'));

// Serve static front-end
app.use(express.static('public'));

app.listen(PORT, ()=>console.log(`THE INK server running on port ${PORT}`));
