const express = require('express');
const Parser = require('rss-parser');
const fetch = require('node-fetch');

const parser = new Parser({ timeout: 15000 });
const app = express();
app.use(express.json({ limit: '1mb' }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const PORT = process.env.PORT || 3000;

// --- Cache setup ---
let cachedItems = [];
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds

// --- Hidden 50 RSS feeds ---
const RSS_FEEDS = [
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Fashion.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://feeds.bbci.co.uk/news/technology/rss.xml",
  "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
  "https://feeds.bbci.co.uk/news/business/rss.xml",
  "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
  "https://feeds.bbci.co.uk/news/health/rss.xml",
  "https://www.theguardian.com/world/rss",
  "https://www.theguardian.com/uk/technology/rss",
  "https://www.theguardian.com/uk/science/rss",
  "https://www.theguardian.com/us/business/rss",
  "https://www.aljazeera.com/xml/rss/all.xml",
  "https://www.reutersagency.com/feed/?best-topics=world",
  "https://www.reutersagency.com/feed/?best-topics=technology",
  "https://www.reutersagency.com/feed/?best-topics=business",
  "https://www.reutersagency.com/feed/?best-topics=science",
  "https://www.cnn.com/rss/edition_world.rss",
  "https://www.cnn.com/rss/edition_technology.rss",
  "https://www.cnn.com/rss/edition_science.rss",
  "https://www.cnn.com/rss/edition_health.rss",
  "https://www.cnn.com/rss/edition_entertainment.rss",
  "https://www.huffpost.com/section/world-news/feed",
  "https://www.huffpost.com/section/technology/feed",
  "https://www.huffpost.com/section/science/feed",
  "https://www.huffpost.com/section/business/feed",
  "https://www.huffpost.com/section/entertainment/feed",
  "https://www.npr.org/rss/rss.php?id=1004",  // world
  "https://www.npr.org/rss/rss.php?id=1019",  // technology
  "https://www.npr.org/rss/rss.php?id=1007",  // health
  "https://www.npr.org/rss/rss.php?id=1008",  // science
  "https://www.npr.org/rss/rss.php?id=1001",  // news
  "https://www.washingtonpost.com/rss/world",
  "https://www.washingtonpost.com/rss/technology",
  "https://www.washingtonpost.com/rss/business",
  "https://www.washingtonpost.com/rss/health",
  "https://www.washingtonpost.com/rss/science",
  "https://www.washingtonpost.com/rss/arts",
  "https://www.nationalgeographic.com/content/nationalgeographic/en_us/rss/index.rss",
  "https://feeds.skynews.com/feeds/rss/world.xml",
  "https://feeds.skynews.com/feeds/rss/technology.xml"
];

// --- Helper functions ---
async function pickImageFromItem(item,index){
  if(!item) return null;
  if(item.image) return item.image;
  if(item.enclosure && item.enclosure.url) return item.enclosure.url;
  const html = item.content || item.summary || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return (m && m[1]) || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80';
}

async function summarizeWithOpenAI(prompt){
  if(!OPENAI_API_KEY) return '(No summary — API key not set)';
  const payload = {
    model:'gpt-4o-mini',
    messages:[
      {role:'system', content:`You are a professional news editor writing compliant, original summaries for a curated news site.
- Produce 60-120 words summary.
- Paraphrase; do not copy.
- Add "Why it matters" sentence.
- Add byline: Source: <SOURCE> — Read full article: <LINK>`},
      {role:'user', content:prompt}
    ],
    temperature:0.2,
    max_tokens:350
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${OPENAI_API_KEY}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify(payload)
  });
  if(!res.ok) return '(Summary unavailable)';
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '(Summary unavailable)';
}

async function batchMap(items, fn, batchSize=3, delayMs=200){
  const out=[];
  for(let i=0;i<items.length;i+=batchSize){
    const batch = items.slice(i,i+batchSize);
    const results = await Promise.all(batch.map(fn));
    out.push(...results);
    if(i+batchSize<items.length) await new Promise(r=>setTimeout(r,delayMs));
  }
  return out;
}

// --- Fetch all feeds & summarize ---
async function fetchAndSummarizeFeeds(){
  const feedPromises = RSS_FEEDS.map(async url=>{
    try{
      const feed = await parser.parseURL(url);
      const source = feed.title || new URL(url).hostname;
      return (feed.items || []).slice(0,8).map(it=>({...it, source}));
    }catch(err){ return []; }
  });
  let items = (await Promise.all(feedPromises)).flat();

  const seen = new Set();
  items = items.filter(it=>{
    const key = (it.link||'')+'||'+(it.title||'');
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  items = items.slice(0,30);

  const tasks = items.map((it,idx)=>async()=>{
    try{
      const prompt = `Title: ${it.title}\nSource: ${it.source}\nURL: ${it.link}\nSnippet: ${it.contentSnippet||it.summary||''}\nTask: Summarize.`;
      const summary = await summarizeWithOpenAI(prompt);
      const image = await pickImageFromItem(it,idx);
      return {title:it.title, link:it.link, pubDate:it.pubDate, source:it.source, summary, image};
    }catch{
      return {title:it.title, link:it.link, pubDate:it.pubDate, source:it.source, summary:'(Summary unavailable)', image:await pickImageFromItem(it,idx)};
    }
  });

  return await batchMap(tasks, async fn=>fn(),3,300);
}

// --- API endpoints ---
app.get('/api/fetchSummaries', async (req,res)=>{
  const now = Date.now();
  if(cachedItems.length && (now-cacheTimestamp)<CACHE_TTL){
    return res.json({items:cachedItems});
  }
  try{
    const items = await fetchAndSummarizeFeeds();
    cachedItems = items;
    cacheTimestamp = Date.now();
    res.json({items});
  }catch(err){
    console.error(err);
    res.status(500).json({error:'Failed to fetch news'});
  }
});

app.post('/api/fetchSummaries', async (req,res)=>{
  const feeds = Array.isArray(req.body.feeds)?req.body.feeds.slice(0,12):[];
  if(!feeds.length) return res.status(400).json({error:'No feeds provided'});
  try{
    const items = await fetchAndSummarizeFeeds();
    res.json({items});
  }catch(err){
    console.error(err);
    res.status(500).json({error:'Failed to fetch news'});
  }
});

app.get('/health',(req,res)=>res.send('ok'));
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
