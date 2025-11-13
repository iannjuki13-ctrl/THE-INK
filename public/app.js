// app.js — THE INK frontend
const postList = document.getElementById('postList');
const carousel = document.getElementById('topCarousel');
const liveTicker = document.getElementById('liveTicker');

let carouselIndex = 0;
let carouselTimer = null;

// helper to create elements
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
  return isNaN(d) ? '' : d.toLocaleString();
}

// placeholder images
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
  const html = item.content || item.summary || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && m[1]) return m[1];
  return placeholderFor(index);
}

// render ticker
function renderTicker(items){
  liveTicker.innerHTML = '';
  (items.slice(0,20) || []).forEach((t,i)=>{
    const span = mk('span', { style:'margin-right:3rem;display:inline-block' }, t.title||'');
    liveTicker.appendChild(span);
  });
}

// render carousel
function renderCarousel(items){
  carousel.innerHTML='';
  const top = items.slice(0,5);
  top.forEach((it,i)=>{
    const card = mk('div',{class:'carousel-item'});
    const img = mk('img',{src:getImageFromItem(it,i),alt:it.title||'Top story'});
    const caption = mk('div',{class:'carousel-caption'});
    const h3 = mk('h3',{},it.title||'');
    caption.appendChild(h3);
    card.appendChild(img);
    card.appendChild(caption);
    card.addEventListener('click',()=>window.open(it.link||'#','_blank'));
    carousel.appendChild(card);
  });
  carouselIndex = 0;
  updateCarouselScroll();
  startCarouselAuto();
}

function updateCarouselScroll(){
  const children = carousel.children;
  if(!children.length) return;
  const childWidth = children[0].getBoundingClientRect().width + parseFloat(getComputedStyle(children[0]).marginRight||16);
  carousel.scrollTo({left:carouselIndex*childWidth,behavior:'smooth'});
}

function startCarouselAuto(){
  stopCarouselAuto();
  carouselTimer = setInterval(()=>{
    const len = carousel.children.length || 1;
    carouselIndex = (carouselIndex+1)%len;
    updateCarouselScroll();
  },4500);
}

function stopCarouselAuto(){ if(carouselTimer){clearInterval(carouselTimer);carouselTimer=null;} }

// render articles
function renderArticles(items){
  postList.innerHTML='';
  if(!items.length){
    postList.innerHTML='<p style="text-align:center;color:#ccc;padding:2rem">No articles yet.</p>';
    return;
  }
  items.forEach((it,idx)=>{
    const card = mk('article',{class:'article-card'});
    const img = mk('img',{src:getImageFromItem(it,idx),alt:it.title||'article image'});
    card.appendChild(img);

    const info = mk('div',{class:'info'});
    const h3 = mk('h3',{},it.title||'(no title)');
    info.appendChild(h3);

    const meta = mk('div',{},`${it.source||''} ${it.pubDate? ' • '+niceDate(it.pubDate):''}`);
    meta.style.color='#bdbdbd';
    meta.style.fontSize='0.85rem';
    meta.style.marginBottom='6px';
    info.appendChild(meta);

    const p = mk('p',{},it.summary||'(No summary available)');
    info.appendChild(p);

    const row = mk('div',{style:'margin-top:10px; display:flex; gap:8px; align-items:center'});
    const open = mk('a',{href:it.link,target:'_blank',rel:'noopener',style:'background:#ffd700;color:#000;padding:6px 10px;border-radius:6px;text-decoration:none;font-weight:700'},'Read original');
    row.appendChild(open);
    info.appendChild(row);

    card.appendChild(info);
    postList.appendChild(card);
  });
}

// fetch data
async function fetchNews(){
  try{
    const res = await fetch('/api/fetchSummaries');
    if(!res.ok) throw new Error('Failed fetch');
    const json = await res.json();
    const items = json.items || [];
    renderTicker(items);
    renderCarousel(items);
    renderArticles(items);
  }catch(e){
    console.error(e);
    postList.innerHTML='<p style="text-align:center;color:#ccc;padding:2rem">Failed to load news.</p>';
  }
}

// initial load + refresh every 5 seconds
fetchNews();
setInterval(fetchNews,5000);
