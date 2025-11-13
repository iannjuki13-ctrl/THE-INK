// ===== THE INK FRONT-END APP.JS =====

const feedListEl = document.getElementById('feedList');
const loadBtn = document.getElementById('loadBtn');
const clearBtn = document.getElementById('clearBtn');
const postList = document.getElementById('postList');
const carousel = document.getElementById('topCarousel');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const liveTicker = document.getElementById('liveTicker');

let carouselIndex = 0;
let carouselTimer = null;

const FEED_REFRESH_INTERVAL = 10000; // 10 seconds

// --- 50 Default Feeds ---
const DEFAULT_FEEDS = [
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://feeds.bbci.co.uk/news/technology/rss.xml",
  "https://feeds.bbci.co.uk/news/politics/rss.xml",
  "https://www.theverge.com/rss/index.xml",
  "https://www.washingtonpost.com/rss/world.xml",
  "https://www.washingtonpost.com/rss/politics.xml",
  "https://www.reutersagency.com/feed/?best-topics=world",
  "https://www.reutersagency.com/feed/?best-topics=technology",
  "https://www.aljazeera.com/xml/rss/all.xml",
  "https://www.npr.org/rss/rss.php?id=1004",
  "https://www.npr.org/rss/rss.php?id=1019",
  "https://www.cnn.com/services/rss/",
  "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "https://www.economist.com/international/rss.xml",
  "https://www.forbes.com/world/rss/",
  "https://www.ft.com/?format=rss",
  "https://www.npr.org/rss/rss.php?id=1001",
  "https://www.npr.org/rss/rss.php?id=1002",
  "https://www.npr.org/rss/rss.php?id=1003",
  "https://www.reuters.com/rssFeed/worldNews",
  "https://www.reuters.com/rssFeed/businessNews",
  "https://www.reuters.com/rssFeed/technologyNews",
  "https://www.bloomberg.com/feed/podcast",
  "https://www.bloomberg.com/feed/technology",
  "https://www.bloomberg.com/feed/world",
  "https://www.wsj.com/xml/rss/3_7085.xml",
  "https://www.wsj.com/xml/rss/3_7031.xml",
  "https://www.wsj.com/xml/rss/3_7014.xml",
  "https://www.foxnews.com/about/rss",
  "https://www.foxbusiness.com/about/rss",
  "https://www.foxnews.com/world/rss",
  "https://www.nbcnews.com/id/3032091/device/rss/rss.xml",
  "https://www.nbcnews.com/id/3032507/device/rss/rss.xml",
  "https://www.nbcnews.com/id/3032092/device/rss/rss.xml",
  "https://www.nationalgeographic.com/content/dam/ngdotcom/rss/News.xml",
  "https://www.nationalgeographic.com/content/dam/ngdotcom/rss/Science.xml",
  "https://www.nationalgeographic.com/content/dam/ngdotcom/rss/Environment.xml",
  "https://www.theguardian.com/world/rss",
  "https://www.theguardian.com/technology/rss",
  "https://www.theguardian.com/sport/rss",
  "https://www.theguardian.com/science/rss",
  "https://www.theguardian.com/culture/rss",
  "https://www.theguardian.com/education/rss",
  "https://www.theguardian.com/business/rss",
  "https://www.theguardian.com/environment/rss",
  "https://www.theguardian.com/travel/rss",
  "https://www.theguardian.com/lifeandstyle/rss"
];

// --- Helper Functions ---
function mk(tag, attrs = {}, text = '') {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'html') el.innerHTML = attrs[k];
    else el.setAttribute(k, attrs[k]);
  }
  if (text) el.textContent = text;
  return el;
}

function niceDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString();
}

const PLACEHOLDERS = [
  'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1509099836639-18ba67b8f2d0?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=1400&q=80'
];

function placeholderFor(i){ return PLACEHOLDERS[i % PLACEHOLDERS.length]; }

function getImageFromItem(item, index) {
  if (!item) return placeholderFor(index);
  if (item.image) return typeof item.image === 'string' ? item.image : item.image.url;
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (item['media:content'] && item['media:content']['$'] && item['media:content']['$'].url) return item['media:content']['$'].url;
  if (item['media:thumbnail'] && item['media:thumbnail'].url) return item['media:thumbnail'].url;
  if (item.ogImage) return item.ogImage;
  const html = item.originalSnippet || item.summary || item.content || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && m[1]) return m[1];
  return placeholderFor(index);
}

// --- UI Rendering ---
function clearUI(){
  postList.innerHTML = '';
  carousel.innerHTML = '';
  liveTicker.innerHTML = '<span>Loading latest headlines...</span>';
  stopCarouselAuto();
}

function renderTicker(items){
  if (!liveTicker) return;
  const texts = (items || []).slice(0,20).map(it => it.title || '').filter(Boolean);
  if (!texts.length) {
    liveTicker.innerHTML = '<span>No headlines yet.</span>';
    return;
  }
  liveTicker.innerHTML = '';
  texts.forEach((t, i) => {
    const span = mk('span', { style: 'margin-right:3rem; display:inline-block' }, t);
    liveTicker.appendChild(span);
  });
}

function renderCarousel(items){
  if (!carousel) return;
  carousel.innerHTML = '';
  const top = (items || []).slice(0,5);
  top.forEach((it, i) => {
    const imgUrl = getImageFromItem(it, i);
    const card = mk('div', { class: 'carousel-item' });
    const img = mk('img', { src: imgUrl, alt: it.title || 'Top story' });
    const caption = mk('div', { class: 'carousel-caption' });
    const h3 = mk('h3', {}, it.title || '');
    caption.appendChild(h3);
    card.appendChild(img);
    card.appendChild(caption);
    card.addEventListener('click', ()=> window.open(it.link || '#','_blank'));
    carousel.appendChild(card);
  });
  carouselIndex = 0;
  updateCarouselScroll();
  startCarouselAuto();
}

function updateCarouselScroll(){
  if (!carousel) return;
  const children = carousel.children;
  if (!children.length) return;
  const childWidth = children[0].getBoundingClientRect().width + parseFloat(getComputedStyle(children[0]).marginRight || 16);
  carousel.scrollTo({ left: carouselIndex * childWidth, behavior: 'smooth' });
}

function startCarouselAuto(){
  stopCarouselAuto();
  carouselTimer = setInterval(()=>{
    const len = carousel.children.length || 1;
    carouselIndex = (carouselIndex + 1) % len;
    updateCarouselScroll();
  }, 4500);
}

function stopCarouselAuto(){ if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null; } }

prevBtn?.addEventListener('click', ()=>{
  carouselIndex = Math.max(0, carouselIndex - 1);
  updateCarouselScroll();
  stopCarouselAuto();
});
nextBtn?.addEventListener('click', ()=>{
  carouselIndex = Math.min(Math.max(0, carousel.children.length - 1), carouselIndex + 1);
  updateCarouselScroll();
  stopCarouselAuto();
});

function renderArticles(items){
  postList.innerHTML = '';
  if (!items || !items.length) {
    postList.innerHTML = '<p style="text-align:center;color:#ccc;padding:2rem">No articles found.</p>';
    return;
  }
  items.forEach((it, idx) => {
    const card = mk('article', { class: 'article-card' });
    const imgUrl = getImageFromItem(it, idx);
    const img = mk('img', { src: imgUrl, alt: it.title || 'article image' });
    card.appendChild(img);
    const info = mk('div', { class: 'info' });
    const h3 = mk('h3', {}, it.title || '(no title)');
    info.appendChild(h3);
    const meta = mk('div', {}, `${it.source || ''} ${it.pubDate ? ' • ' + niceDate(it.pubDate) : ''}`);
    meta.style.color = '#bdbdbd';
    meta.style.fontSize = '0.85rem';
    meta.style.marginBottom = '6px';
    info.appendChild(meta);
    const p = mk('p', {}, it.summary ? it.summary.slice(0,350) : '(No summary available — open source link)');
    info.appendChild(p);
    const row = mk('div', { style: 'margin-top:10px; display:flex; gap:8px; align-items:center' });
    const open = mk('a', { href: it.link || '#', target: '_blank', rel: 'noopener', style: 'background:#ffd700;color:#000;padding:6px 10px;border-radius:6px;text-decoration:none;font-weight:700' }, 'Read original');
    row.appendChild(open);
    info.appendChild(row);
    card.appendChild(info);
    postList.appendChild(card);
  });
}

// --- Loading Feeds ---
function showLoading(msg='Loading…') {
  postList.innerHTML = `<p style="text-align:center;color:#ccc;padding:2rem">${msg}</p>`;
}

async function loadFeeds(){
  const feeds = feedListEl.value.split('\n').map(s=>s.trim()).filter(Boolean);
  if (!feeds.length){ showLoading('No feeds available.'); return; }
  localStorage.setItem('ink_feeds', JSON.stringify(feeds));
  showLoading('Fetching feeds…');

  try {
    const res = await fetch('/api/fetchSummaries', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ feeds })
    });
    if (!res.ok) {
      const text = await res.text().catch(()=>null);
      throw new Error(text || `Server returned ${res.status}`);
    }
    const json = await res.json();
    const items = json.items || [];
    items.sort((a,b)=> (b.pubDate ? new Date(b.pubDate) : 0) - (a.pubDate ? new Date(a.pubDate) : 0));
    renderTicker(items);
    renderCarousel(items);
    renderArticles(items);
  } catch(err){
    console.error(err);
    showLoading('Failed to fetch feeds.');
  }
}

// --- Auto-load + refresh ---
document.getElementById('feedPanel').style.display = 'none';
(function autoLoadFeeds() {
  const saved = JSON.parse(localStorage.getItem('ink_feeds') || '[]');
  if (saved.length) feedListEl.value = saved.join('\n');
  else feedListEl.value = DEFAULT_FEEDS.join('\n');

  loadFeeds(); // first load
  setInterval(() => loadFeeds(), FEED_REFRESH_INTERVAL); // refresh every 10s
})();

// --- Buttons (optional for admin) ---
loadBtn.addEventListener('click', loadFeeds);
clearBtn.addEventListener('click', ()=>{
  feedListEl.value = '';
  localStorage.removeItem('ink_feeds');
  clearUI();
});
