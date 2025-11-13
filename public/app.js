const postList = document.getElementById('postList');
const carousel = document.getElementById('topCarousel');
const liveTicker = document.getElementById('liveTicker');

let carouselIndex = 0;
let carouselTimer = null;

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

function placeholderFor(i){ 
  const PLACEHOLDERS = [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1509099836639-18ba67b8f2d0?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1400&q=80'
  ];
  return PLACEHOLDERS[i % PLACEHOLDERS.length]; 
}

function getImageFromItem(item, index) {
  if (!item) return placeholderFor(index);
  if (item.image) return typeof item.image==='string'?item.image:item.image.url;
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  return placeholderFor(index);
}

function clearUI() {
  postList.innerHTML = '';
  carousel.innerHTML = '';
  liveTicker.innerHTML = '<span>Loading latest headlines...</span>';
  stopCarouselAuto();
}

// Render ticker
function renderTicker(items) {
  if (!liveTicker) return;
  const texts = (items || []).slice(0,20).map(it=>it.title||'').filter(Boolean);
  liveTicker.innerHTML = '';
  texts.forEach((t,i)=>{
    const span = mk('span',{style:'margin-right:3rem; display:inline-block'}, t);
    liveTicker.appendChild(span);
  });
}

// Render articles
function renderArticles(items){
  postList.innerHTML='';
  if(!items||!items.length){
    postList.innerHTML='<p style="text-align:center;color:#ccc;padding:2rem">No articles found.</p>';
    return;
  }
  items.forEach((it,idx)=>{
    const card=mk('article',{class:'article-card'});
    const img=mk('img',{src:getImageFromItem(it,idx),alt:it.title||'article'});
    card.appendChild(img);
    const info=mk('div',{class:'info'});
    const h3=mk('h3',{},it.title||'(no title)');
    info.appendChild(h3);
    const meta=mk('div',{},`${it.source||''} ${it.pubDate?'• '+niceDate(it.pubDate):''}`);
    meta.style.color='#bdbdbd';
    meta.style.fontSize='0.85rem';
    meta.style.marginBottom='6px';
    info.appendChild(meta);
    const p=mk('p',{},it.summary||'(No summary)');
    info.appendChild(p);
    card.appendChild(info);
    postList.appendChild(card);
  });
}

// Fetch news every 5 seconds
async function loadNews(){
  try {
    const res=await fetch('/api/fetchSummaries');
    const json=await res.json();
    const items=json.items||[];
    renderTicker(items);
    renderArticles(items);
  } catch(err){
    console.error(err);
  }
}

loadNews();
setInterval(loadNews, 5000);
