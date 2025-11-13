// =================== THE INK SERVER ===================
const express = require('express');
const Parser = require('rss-parser');
const fetch = require('node-fetch');

const parser = new Parser({ timeout: 15000 });
const app = express();
app.use(express.json({ limit: '2mb' }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
if(!OPENAI_API_KEY){
  console.warn('Warning: OPENAI_API_KEY not set. Summaries will fail until configured.');
}

const PORT = process.env.PORT || 3000;

// ====== Hidden 50 RSS Feeds ======
const HIDDEN_FEEDS = [
  'https://rss.cnn.com/rss/edition.rss',
  'https://feeds.bbci.co.uk/news/rss.xml',
  'https://www.theverge.com/rss/index.xml',
  'https://www.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  'https://www.engadget.com/rss.xml',
  'https://www.reutersagency.com/feed/?best-sectors=general-news',
  'https://www.technologyreview.com/feed/',
  'https://www.wired.com/feed/rss',
  'https://www.npr.org/rss/rss.php?id=1001',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
  'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  'https://www.espn.com/espn/rss/news',
  'https://www.sciencedaily.com/rss/top/science.xml',
  'https://www.sciencemag.org/rss/news_current.xml',
  'https://www.nationalgeographic.com/content/nationalgeographic/en_us/rss.html',
  'https://feeds.feedburner.com/TechCrunch/',
  'https://feeds.arstechnica.com/arstechnica/index',
  'https://rss.slashdot.org/Slashdot/slashdotMain',
  'https://feeds.gawker.com/gizmodo/full',
  'https://www.bbc.co.uk/sport/0/football/rss.xml',
  'https://feeds.skynews.com/feeds/rss/home.xml',
  'https://www.ft.com/?format=rss',
  'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
  'https://www.vox.com/rss/index.xml',
  'https://feeds.feedburner.com/thenextweb',
  'https://feeds.feedburner.com/venturebeat/SZYF',
  'https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Books.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/FashionandStyle.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Food.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Movies.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Music.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Television.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Theater.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Obituaries.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/RealEstate.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Automobiles.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Education.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Environment.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Jobs.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml'
];

// ====== Server-side cache ======
let cachedArticles = [];
let lastFetched = 0;
const CACHE_DURATION_MS = 30 * 1000; // 30 seconds cache

// ====== Helpers ======
async function safeFetch(url, opts = {}) {
  try { return await fetch(url, { ...opts, timeout: 15000 }); } 
  catch(e){ return null; }
}

function pickImageFromItem(item, index){
  if(!item) return '';
  if(item.image && typeof item.image === 'string') return item.image;
  if(item.enclosure && item.enclosure.url) return item.enclosure.url;
  const html = item['content:encoded'] || item.content || item.summary || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if(m && m[1]) return m[1];
  // placeholder fallback
  const placeholders = [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1509099836639-18ba67b8f2d0?auto=format&fit=crop&w=1400&q=80'
  ];
  return placeholders[index % placeholders.length];
}

async function summarizeWithOpenAI(prompt){
  if(!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: `You are a professional news editor writing short, compliant summaries (60-120 words). End with "Why it matters". Add byline: "Source: <SOURCE> — Read full article: <LINK>"` },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 350
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{
      'Authorization':`Bearer ${OPENAI_API_KEY}`,
      'Content-Type':'application/json'
    },
    body: JSON.stringify(payload)
  });
  if(!res.ok){
    const txt = await res.text().catch(()=>`status ${res.status}`);
    throw new Error('OpenAI error: '+txt);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

// concurrency limiter
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

// ====== Endpoints ======
app.get('/api/fetchSummaries', async (req,res)=>{
  try{
    const now = Date.now();
    if(cachedArticles.length && now - lastFetched < CACHE_DURATION_MS){
      return res.json({ items: cachedArticles });
    }

    const feedPromises = HIDDEN_FEEDS.map(async url=>{
      try{
        const feed = await parser.parseURL(url);
        const sourceTitle = feed.title || new URL(url).hostname;
        return (feed.items||[]).slice(0,5).map(it=>({
          title: it.title || 'No title',
          link: it.link || it.guid || '',
          pubDate: it.pubDate || it.isoDate || '',
          snippet: (it.contentSnippet || it.summary || it.content || '').toString(),
          raw: it,
          source: sourceTitle
        }));
      }catch(e){ return []; }
    });

    let arrays = await Promise.all(feedPromises);
    let items = arrays.flat();

    // dedupe by link+title
    const seen = new Set();
    items = items.filter(it=>{
      const key = (it.link||'')+'||'+(it.title||'');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // sort by date desc, cap at 50
    items.sort((a,b)=> new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    items = items.slice(0,50);

    // summarize with OpenAI
    const tasks = items.map((it,idx)=> async ()=>{
      const prompt = `Title: ${it.title}\nSource: ${it.source}\nURL: ${it.link}\nSnippet: ${it.snippet}\nWrite 60-120 words summary, add byline.`;
      try{
        const summary = await summarizeWithOpenAI(prompt);
        return {...it, summary: summary.trim(), image: pickImageFromItem(it.raw, idx)};
      }catch(e){
        return {...it, summary:'(Summary unavailable — read original)', image: pickImageFromItem(it.raw, idx)};
      }
    });

    const results = await batchMap(tasks, async fn=>fn(), 3, 300);
    cachedArticles = results;
    lastFetched = Date.now();
    res.json({ items: results });

  }catch(err){
    console.error('Server error', err);
    res.status(500).json({ error: err.message||'server error' });
  }
});

app.post('/api/fetchSummaries', async (req,res)=>{
  try{
    const feeds = Array.isArray(req.body.feeds)? req.body.feeds.slice(0,12) : [];
    if(!feeds.length) return res.status(400).json({error:'No feeds provided'});
    // fallback: just append manually posted feeds to hidden feeds for this call
    const combinedFeeds = [...HIDDEN_FEEDS, ...feeds];
    req.body.feeds = combinedFeeds;
    // reuse GET logic
    return app._router.handle(req,res);
  }catch(err){ res.status(500).json({error: err.message||'server error'}); }
});

// health check
app.get('/health',(req,res)=> res.send('ok'));

// fallback for / (optional)
app.get('/',(req,res)=> res.send('THE INK server running'));

app.listen(PORT, ()=> console.log(`THE INK server listening on port ${PORT}`));
