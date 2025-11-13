/* THE INK — frontend app.js
   - Loads feed URLs from textarea, posts to /api/fetchSummaries
   - Renders carousel, ticker, and article grid
   - Uses feed-provided image when available, otherwise picks a tasteful placeholder
   - Carousel auto-advances; controls available
*/

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

// --- Small helpers ---
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

// choose placeholder images with tasteful variety
const PLACEHOLDERS = [
  'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1509099836639-18ba67b8f2d0?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=1400&q=80'
];
function placeholderFor(i){ return PLACEHOLDERS[i % PLACEHOLDERS.length]; }

// try to extract an image url from a feed item (feed providers use different fields)
function getImageFromItem(item, index) {
  if (!item) return placeholderFor(index);
  // common fields
  if (item.image) {
    if (typeof item.image === 'string') return item.image;
    if (item.image.url) return item.image.url;
  }
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  // some feeds put media:content or media_thumbnail
  if (item['media:content'] && item['media:content']['$'] && item['media:content']['$'].url) return item['media:content']['$'].url;
  if (item['media:thumbnail'] && item['media:thumbnail'].url) return item['media:thumbnail'].url;
  if (item.ogImage) return item.ogImage;
  // try to parse from content (very rough)
  const html = item.originalSnippet || item.summary || item.content || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && m[1]) return m[1];
  return placeholderFor(index);
}

// --- Render functions ---
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
    // attach metadata on click for quick open
    card.addEventListener('click', ()=> window.open(it.link || '#','_blank'));
    carousel.appendChild(card);
  });
  // reset index and start auto advance
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

// build article grid cards
function renderArticles(items){
  postList.innerHTML = '';
  if (!items || !items.length) {
    postList.innerHTML = '<p style="text-align:center;color:#ccc;padding:2rem">No articles found. Add feeds and click "Load Feeds".</p>';
    return;
  }
  items.forEach((it, idx) => {
    // outer card
    const card = mk('article', { class: 'article-card' });
    // image
    const imgUrl = getImageFromItem(it, idx);
    const img = mk('img', { src: imgUrl, alt: it.title || 'article image' });
    card.appendChild(img);
    // info
    const info = mk('div', { class: 'info' });
    const h3 = mk('h3', {}, it.title || '(no title)');
    info.appendChild(h3);
    const meta = mk('div', {}, `${it.source || ''} ${it.pubDate ? ' • ' + niceDate(it.pubDate) : ''}`);
    meta.style.color = '#bdbdbd';
    meta.style.fontSize = '0.85rem';
    meta.style.marginBottom = '6px';
    info.appendChild(meta);
    // editable excerpt
    const p = mk('p', {}, it.summary ? it.summary.slice(0,350) : '(No summary available — open source link)');
    info.appendChild(p);
    // buttons row
    const row = mk('div', { style: 'margin-top:10px; display:flex; gap:8px; align-items:center' });
    const open = mk('a', { href: it.link || '#', target: '_blank', rel: 'noopener', class: '', style: 'background:#ffd700;color:#000;padding:6px 10px;border-radius:6px;text-decoration:none;font-weight:700' }, 'Read original');
    row.appendChild(open);
    const save = mk('button', { style: 'padding:6px 10px;border-radius:6px;background:#333;color:#fff;border:none;cursor:pointer' }, 'Save draft');
    save.addEventListener('click', ()=> saveLocalDraft({ title: it.title, source: it.source, link: it.link, summary: it.summary || '' }));
    row.appendChild(save);
    info.appendChild(row);
    card.appendChild(info);
    postList.appendChild(card);
  });
}

// Save to local drafts (client-side). We'll add server-side publish next.
function saveLocalDraft(obj){
  const drafts = JSON.parse(localStorage.getItem('ink_drafts') || '[]');
  drafts.unshift({...obj, savedAt: new Date().toISOString()});
  localStorage.setItem('ink_drafts', JSON.stringify(drafts));
  alert('Saved to drafts on this device.');
}

// --- Fetching & orchestration ---
function showLoading(msg='Loading…') {
  postList.innerHTML = `<p style="text-align:center;color:#ccc;padding:2rem">${msg}</p>`;
}

async function loadFeeds(){
  const feeds = feedListEl.value.split('\n').map(s=>s.trim()).filter(Boolean);
  if (!feeds.length){ showLoading('Enter at least one RSS feed URL.'); return; }
  // save feed list locally
  localStorage.setItem('ink_feeds', JSON.stringify(feeds));
  showLoading('Fetching feeds — this may take a few seconds...');
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
    // sort by pubDate if available
    items.sort((a,b)=> {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });
    // render UI parts
    renderTicker(items);
    renderCarousel(items);
    renderArticles(items);
  } catch (err) {
    console.error('Fetch error', err);
    showLoading('Failed to fetch: ' + (err.message || 'server error'));
  }
}

// restore saved feeds if any
(function restoreFeeds(){
  const saved = JSON.parse(localStorage.getItem('ink_feeds') || '[]');
  if (saved.length) feedListEl.value = saved.join('\n');
})();

// wire buttons
loadBtn.addEventListener('click', loadFeeds);
clearBtn.addEventListener('click', ()=>{ feedListEl.value=''; localStorage.removeItem('ink_feeds'); postList.innerHTML=''; carousel.innerHTML=''; liveTicker.innerHTML=''; stopCarouselAuto(); });

/* Optional: auto-load saved feeds on open (commented out)
window.addEventListener('load', ()=> {
  const saved = JSON.parse(localStorage.getItem('ink_feeds')||'[]');
  if (saved.length) loadFeeds();
});
*/
