/**
 * THE INK server.js
 * Fully integrated: serves front-end + API
 */

const express = require('express');
const Parser = require('rss-parser');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const parser = new Parser({ timeout: 15000 });
app.use(express.json({ limit: '1mb' }));

// --- Step 2: Serve frontend from public folder ---
app.use(express.static(path.join(__dirname, 'public'))); 
// Now visiting "/" will serve public/index.html automatically

// --- 50 hidden RSS feeds ---
const RSS_FEEDS = [
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Culture.xml',
  'https://rss.cnn.com/rss/edition.rss',
  'https://rss.cnn.com/rss/edition_world.rss',
  'https://rss.cnn.com/rss/edition_technology.rss',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'https://feeds.bbci.co.uk/news/business/rss.xml',
  'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  'https://www.theverge.com/rss/index.xml',
  'https://www.engadget.com/rss.xml',
  'https://www.wired.com/feed/rss',
  'https://www.reutersagency.com/feed/?best-topics=business',
  'https://www.reutersagency.com/feed/?best-topics=technology',
  'https://www.reutersagency.com/feed/?best-topics=world',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://www.npr.org/rss/rss.php?id=1001',
  'https://www.npr.org/rss/rss.php?id=1019',
  'https://www.npr.org/rss/rss.php?id=1007',
  'https://www.npr.org/rss/rss.php?id=1014',
  'https://www.npr.org/rss/rss.php?id=1006',
  'https://feeds.arstechnica.com/arstechnica/index',
  'https://feeds.feedburner.com/TechCrunch/',
  'https://feeds.feedburner.com/venturebeat/SZYF',
  'https://feeds.feedburner.com/ign/all',
  'https://www.gamespot.com/feeds/news/',
  'https://www.espn.com/espn/rss/news',
  'https://www.espn.com/espn/rss/ncf/news',
  'https://www.espn.com/espn/rss/nba/news',
  'https://www.espn.com/espn/rss/nfl/news',
  'https://www.sciencedaily.com/rss/all.xml',
  'https://www.sciencemag.org/rss/news_current.xml',
  'https://feeds.npr.org/510289/podcast.xml',
  'https://feeds.npr.org/510312/podcast.xml',
  'https://feeds.npr.org/510298/podcast.xml',
  'https://feeds.npr.org/510296/podcast.xml',
  'https://feeds.npr.org/510298/podcast.xml',
  'https://feeds.npr.org/510289/podcast.xml',
  'https://www.ft.com/?format=rss',
  'https://www.economist.com/latest/rss.xml',
  'https://www.economist.com/business/rss.xml',
  'https://www.economist.com/technology/rss.xml',
  'https://www.economist.com/science/rss.xml',
  'https://www.economist.com/world/rss.xml',
  'https://feeds.feedburner.com/time/topstories',
  'https://feeds.feedburner.com/time/business'
];

// --- OpenAI key ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
if(!OPENAI_API_KEY) console.warn('Warning: OPENAI_API_KEY not set. Summaries will fail.');

const PORT = process.env.PORT || 3000;

// --- Helpers ---
function placeholderFor(i){
  const PLACEHOLDERS = [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1509099836639-18ba67b8f2d0?auto=format&fit=crop&w=1400&q=80'
  ];
  return PLACEHOLDERS[i % PLACEHOLDERS.length];
}

function pickImageFromItem(item, index){
  if(!item) return placeholderFor(index);
  if(item.image) return typeof item.image==='string'?item.image:item.image.url;
  if(item.enclosure && item.enclosure.url) return item.enclosure.url;
  const html = item['content:encoded'] || item.content || item.summary || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m && m[1]? m[1]: placeholderFor(index);
}

async function summarizeWithOpenAI(prompt){
  if(!OPENAI_API_KEY) return '(Summary unavailable — no API key)';
  const payload = {
    model:'gpt-4o-mini',
    messages:[
      { role:'system', content:'You are a professional news editor creating concise summaries (60-120 words). End with "Why it matters" and add a byline.' },
      { role:'user', content:prompt }
    ],
    temperature:0.2,
    max_tokens:350
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{'Authorization':`Bearer ${OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  if(!res.ok) throw new Error('OpenAI API error');
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

// concurrency helper
async function batchMap(items, fn, batchSize=3, delayMs=200){
  const out = [];
  for(let i=0;i<items.length;i+=batchSize){
    const batch = items.slice(i,i+batchSize);
    const results = await Promise.all(batch.map(fn));
    out.push(...results);
    if(i+batchSize<items.length) await new Promise(r=>setTimeout(r,delayMs));
  }
  return out;
}

// --- API Route ---
app.get('/api/fetchSummaries', async (req,res)=>{
  try{
    const feedPromises = RSS_FEEDS.map(async url=>{
      try{
        const feed = await parser.parseURL(url);
        const sourceTitle = feed.title || new URL(url).hostname;
        return (feed.items||[]).slice(0,8).map(it=>({
          title: it.title||'No title',
          link: it.link||it.guid||'',
          pubDate: it.pubDate||it.isoDate||'',
          snippet: (it.contentSnippet||it.summary||it.content||'').toString(),
          raw: it,
          source: sourceTitle
        }));
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

    items.sort((a,b)=> (b.pubDate?new Date(b.pubDate).getTime():0) - (a.pubDate?new Date(a.pubDate).getTime():0));
    items = items.slice(0,50);

    const tasks = items.map((it,idx)=>async()=>{
      const prompt = `Article title: ${it.title}\nSource: ${it.source}\nURL: ${it.link}\nSnippet: ${it.snippet||'(no snippet)'}\nTask: Write a short, original news summary (60-120 words). End with "Why it matters". Add byline: "Source: ${it.source} — Read full article: ${it.link}"`;
      try{
        const summary = await summarizeWithOpenAI(prompt);
        return {
          title: it.title,
          link: it.link,
          pubDate: it.pubDate,
          source: it.source,
          summary: summary.trim(),
          image: pickImageFromItem(it.raw, idx)
        };
      }catch(err){
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

    const results = await batchMap(tasks, async fn=>fn(), 3, 300);
    res.json({items: results});

  }catch(err){
    console.error('Server error', err);
    res.status(500).json({error: err.message||'server error'});
  }
});

// Health check
app.get('/health',(req,res)=>res.send('ok'));

app.listen(PORT,()=>console.log(`THE INK server listening on port ${PORT}`));
