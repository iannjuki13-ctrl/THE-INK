// ====== Elements ======
const postList = document.getElementById('postList');
const carousel = document.getElementById('topCarousel');
const liveTicker = document.getElementById('liveTicker');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

// Hide the RSS feed box completely
const feedPanel = document.querySelector('.feed-panel');
if(feedPanel) feedPanel.style.display = 'none';

// ====== State ======
let carouselIndex = 0;
let carouselTimer = null;
let currentArticles = []; // store current articles to compare for new fetch

// ====== Helpers ======
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

// ====== Rendering Functions ======
function renderTicker(items){
  if (!liveTicker) return;
  const texts = (items || []).slice(0,20).map(it => it.title || '').filter(Boolean);
  if (!texts.length) {
    liveTicker.innerHTML = '<span>No headlines yet.</span>';
    return;
  }
  liveTicker.innerHTML = '';
  texts.forEach((t) => {
    const span = mk('span', { style: 'margin-right:3rem; display:inline-block' }, t);
    liveTicker.appendChild(span);
  });
}

function renderCarousel(items){
  if (!carousel) return;
  carousel.innerHTML = '';
  const top = (items || []).slice(0,5);
  top.forEach((it, i) => {
    const card = mk('div', { class: 'carousel-item' });
    const img = mk('img', { src: it.image || '', alt: it.title || 'Top story' });
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
    if(!carousel) return;
    const len = carousel.children.length || 1;
    carouselIndex = (carouselIndex + 1) % len;
    updateCarouselScroll();
  }, 4500);
}

function stopCarouselAuto(){
  if(carouselTimer){ clearInterval(carouselTimer); carouselTimer = null; }
}

function renderArticles(items){
  if(!postList) return;
  postList.innerHTML = '';
  if(!items || !items.length){
    postList.innerHTML = '<p style="text-align:center;color:#ccc;padding:2rem">No articles found.</p>';
    return;
  }
  items.forEach((it, idx)=>{
    const card = mk('article', { class:'article-card' });
    const img = mk('img', { src: it.image || '', alt: it.title || 'article image' });
    card.appendChild(img);
    const info = mk('div', { class:'info' });
    const h3 = mk('h3', {}, it.title || '');
    info.appendChild(h3);
    const meta = mk('div', {}, `${it.source || ''} ${it.pubDate? ' • '+niceDate(it.pubDate): ''}`);
    meta.style.color = '#bdbdbd';
    meta.style.fontSize = '0.85rem';
    meta.style.marginBottom = '6px';
    info.appendChild(meta);
    const p = mk('p', {}, it.summary || '');
    info.appendChild(p);
    const row = mk('div', { style:'margin-top:10px; display:flex; gap:8px; align-items:center' });
    const open = mk('a', { href: it.link || '#', target:'_blank', rel:'noopener', style:'background:#ffd700;color:#000;padding:6px 10px;border-radius:6px;text-decoration:none;font-weight:700' }, 'Read original');
    row.appendChild(open);
    info.appendChild(row);
    card.appendChild(info);
    postList.appendChild(card);
  });
}

// ====== Fetching ======
async function fetchNews(){
  try{
    const res = await fetch('/api/fetchSummaries');
    if(!res.ok) throw new Error('Fetch failed');
    const json = await res.json();
    const items = json.items || [];

    // Check if new articles
    const newTitles = items.map(it => it.title).join('|');
    const oldTitles = currentArticles.map(it=>it.title).join('|');
    if(newTitles !== oldTitles){
      currentArticles = items;
      renderTicker(items);
      renderCarousel(items);
      renderArticles(items);
    }
  }catch(err){
    console.error('News fetch error:', err);
  }
}

// ====== Initial load + interval ======
fetchNews(); // initial fetch
setInterval(fetchNews, 10000); // every 10 seconds

// ====== Carousel manual buttons ======
prevBtn?.addEventListener('click', ()=>{
  carouselIndex = Math.max(0, carouselIndex - 1);
  updateCarouselScroll();
  stopCarouselAuto();
});

nextBtn?.addEventListener('click', ()=>{
  carouselIndex = Math.min(Math.max(0, carousel.children.length-1), carouselIndex+1);
  updateCarouselScroll();
  stopCarouselAuto();
});
