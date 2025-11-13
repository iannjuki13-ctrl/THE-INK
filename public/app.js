const postList = document.getElementById('postList');
const carousel = document.getElementById('topCarousel');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const liveTicker = document.getElementById('liveTicker');

let carouselIndex = 0;
let carouselTimer = null;

// ===== Helpers =====
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
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1400&q=80'
];

function placeholderFor(i){ return PLACEHOLDERS[i % PLACEHOLDERS.length]; }
function getImageFromItem(item, index) {
  if (!item) return placeholderFor(index);
  if (item.image) return typeof item.image==='string'?item.image:item.image.url;
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  const html = item.summary || item.content || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m && m[1] ? m[1] : placeholderFor(index);
}

// ===== Render functions =====
function renderTicker(items){
  liveTicker.innerHTML = '';
  const texts = (items || []).slice(0,20).map(it => it.title || '').filter(Boolean);
  if (!texts.length) liveTicker.innerHTML = '<span>No headlines yet.</span>';
  texts.forEach((t, i) => {
    const span = mk('span', { style: 'margin-right:3rem; display:inline-block' }, t);
    liveTicker.appendChild(span);
  });
}

function renderCarousel(items){
  carousel.innerHTML = '';
  const top = (items || []).slice(0,5);
  top.forEach((it, i)=>{
    const card = mk('div', { class:'carousel-item' });
    const img = mk('img', { src:getImageFromItem(it,i), alt: it.title || 'Top story' });
    const caption = mk('div',{ class:'carousel-caption' });
    caption.appendChild(mk('h3', {}, it.title || ''));
    card.appendChild(img);
    card.appendChild(caption);
    card.addEventListener('click', ()=>window.open(it.link || '#','_blank'));
    carousel.appendChild(card);
  });
  carouselIndex=0;
  updateCarouselScroll();
  startCarouselAuto();
}

function updateCarouselScroll(){
  const children = carousel.children;
  if (!children.length) return;
  const childWidth = children[0].getBoundingClientRect().width + parseFloat(getComputedStyle(children[0]).marginRight||16);
  carousel.scrollTo({ left: carouselIndex*childWidth, behavior:'smooth' });
}

function startCarouselAuto(){
  stopCarouselAuto();
  carouselTimer = setInterval(()=>{
    const len = carousel.children.length || 1;
    carouselIndex = (carouselIndex + 1) % len;
    updateCarouselScroll();
  }, 4500);
}
function stopCarouselAuto(){ if(carouselTimer){ clearInterval(carouselTimer); carouselTimer=null; } }

prevBtn?.addEventListener('click', ()=>{ carouselIndex = Math.max(0, carouselIndex-1); updateCarouselScroll(); stopCarouselAuto(); });
nextBtn?.addEventListener('click', ()=>{ carouselIndex = Math.min(Math.max(0, carousel.children.length-1), carouselIndex+1); updateCarouselScroll(); stopCarouselAuto(); });

// ===== Article Grid =====
function renderArticles(items){
  postList.innerHTML='';
  if(!items||!items.length){ 
    postList.innerHTML='<p style="text-align:center;color:#ccc;padding:2rem">No articles found.</p>';
    return;
  }
  items.forEach((it,idx)=>{
    const card = mk('article',{class:'article-card'});
    const img = mk('img',{src:getImageFromItem(it,idx),alt:it.title||'article image'});
    card.appendChild(img);

    const info = mk('div',{class:'info'});
    info.appendChild(mk('h3',{},it.title||'(no title)'));
    const meta = mk('div',{},`${it.source || ''} ${it.pubDate?' • '+niceDate(it.pubDate):''}`);
    meta.style.color='#bdbdbd';
    meta.style.fontSize='0.85rem';
    meta.style.marginBottom='6px';
    info.appendChild(meta);
    info.appendChild(mk('p',{},it.summary||'(No summary available)'));
    card.appendChild(info);
    postList.appendChild(card);
  });
}

// ===== Fetch & Auto-Refresh =====
async function loadNews(){
  try{
    const res = await fetch('/api/fetchSummaries');
    const json = await res.json();
    const items = json.items || [];
    renderTicker(items);
    renderCarousel(items);
    renderArticles(items);
  }catch(err){
    console.error('Error fetching news',err);
  }
}

// Initial load
loadNews();

// Refresh every 5 seconds
setInterval(loadNews, 5000);
