/* THE INK frontend — premium behavior
   - category-driven
   - polls backend, diffs updates to avoid flicker
   - renders hero + featured + grid
*/

(() => {
  const heroHeadline = document.getElementById('heroHeadline');
  const heroSub = document.getElementById('heroSub');
  const heroCard = document.getElementById('heroCard');
  const liveTicker = document.getElementById('liveTicker');
  const articlesEl = document.getElementById('articles');
  const featuredList = document.getElementById('featuredList');
  const trendingList = document.getElementById('trendingList');
  const sectionTitle = document.getElementById('sectionTitle');
  const lastUpdatedEl = document.getElementById('lastUpdated');
  const cats = Array.from(document.querySelectorAll('.cat'));
  const refreshNow = document.getElementById('refreshNow');
  const yearEl = document.getElementById('year');

  yearEl.textContent = new Date().getFullYear();

  let activeCategory = 'all';
  let currentHash = '';
  let cacheByCategory = {}; // avoid re-rendering same data

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

  function itemsHash(items) {
    return items.map(i => (i.link || '') + '||' + (i.title || '')).join('|');
  }

  function getImage(it, idx) {
    if (!it) return '';
    if (it.image) return it.image;
    return `https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=80`;
  }

  function renderTicker(items) {
    if (!liveTicker) return;
    liveTicker.innerHTML = '';
    const nodes = (items || []).slice(0, 20).map(it => {
      const s = mk('span', { style: 'margin-right:2.6rem;display:inline-block' }, it.title || '');
      return s;
    });
    nodes.forEach(n => liveTicker.appendChild(n));
  }

  function renderHero(items) {
    const hero = (items || [])[0];
    if (!hero) {
      heroHeadline.textContent = 'Top Stories — THE INK';
      heroSub.textContent = 'Curated headlines, carefully summarized.';
      heroCard.innerHTML = '';
      return;
    }
    heroHeadline.textContent = hero.title || 'Top Story';
    heroSub.textContent = hero.source || 'THE INK';
    heroCard.innerHTML = '';
    const kicker = mk('div', { class: 'kicker' }, hero.source || '');
    const h3 = mk('h3', {}, hero.title || '');
    const p = mk('p', {}, hero.summary ? hero.summary.slice(0, 220) + (hero.summary.length > 220 ? '…' : '') : '');
    const btn = mk('a', { href: hero.link || '#', target: '_blank', rel: 'noopener', class: 'readmore' }, 'Read full');
    const wrap = mk('div', {}, '');
    wrap.appendChild(kicker);
    wrap.appendChild(h3);
    wrap.appendChild(p);
    wrap.appendChild(btn);
    heroCard.appendChild(wrap);
  }

  function renderFeatured(items) {
    featuredList.innerHTML = '';
    const top = (items || []).slice(1, 5);
    top.forEach(it => {
      const m = mk('div', { class: 'mini fade-in' });
      m.appendChild(mk('h4', {}, it.title || ''));
      m.appendChild(mk('div', { class: 'small muted' }, it.source || ''));
      featuredList.appendChild(m);
    });
  }

  function renderArticlesGrid(items) {
    articlesEl.innerHTML = '';
    if (!items || !items.length) {
      articlesEl.innerHTML = '<p class="muted">No articles found.</p>';
      return;
    }
    items.forEach(it => {
      const card = mk('article', { class: 'article fade-in' });
      const media = mk('div', { class: 'media' });
      const img = mk('img', { src: getImage(it), alt: it.title || '' });
      media.appendChild(img);
      const meta = mk('div', { class: 'meta' });
      meta.appendChild(mk('h3', {}, it.title || ''));
      meta.appendChild(mk('p', {}, it.summary ? it.summary.slice(0, 200) + (it.summary.length > 200 ? '…' : '') : '(No summary)'));
      meta.appendChild(mk('div', { class: 'byline' }, `${it.source || ''} • ${it.pubDate ? new Date(it.pubDate).toLocaleString() : ''}`));
      card.appendChild(media);
      card.appendChild(meta);
      card.addEventListener('click', () => window.open(it.link || '#', '_blank'));
      articlesEl.appendChild(card);
    });
  }

  function renderTrending(items) {
    trendingList.innerHTML = '';
    (items || []).slice(0, 6).forEach(it => {
      const li = mk('li');
      li.appendChild(mk('a', { href: it.link || '#', target: '_blank' }, it.title || ''));
      trendingList.appendChild(li);
    });
  }

  // Fetch from backend; category param optional
  async function loadCategory(cat = 'all', force = false) {
    try {
      const url = `/api/fetchSummaries?category=${encodeURIComponent(cat)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('bad response');
      const json = await res.json();
      const items = (json.items || []).slice(0, 50);
      const h = itemsHash(items);
      if (!force && cacheByCategory[cat] && cacheByCategory[cat].hash === h) {
        // nothing changed
        if (json.lastUpdated) lastUpdatedEl.textContent = `Updated ${new Date(json.lastUpdated).toLocaleTimeString()}`;
        return;
      }
      cacheByCategory[cat] = { items, hash: h, ts: Date.now() };
      // render blocks
      renderTicker(items);
      renderHero(items);
      renderFeatured(items);
      renderArticlesGrid(items);
      renderTrending(items);
      sectionTitle.textContent = (cat === 'all') ? 'Latest' : cat.charAt(0).toUpperCase() + cat.slice(1);
      if (json.lastUpdated) lastUpdatedEl.textContent = `Updated ${new Date(json.lastUpdated).toLocaleTimeString()}`;
      currentHash = h;
    } catch (err) {
      console.error('Fetch error', err);
    }
  }

  // categories UI
  cats.forEach(btn => {
    btn.addEventListener('click', () => {
      cats.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat || 'all';
      loadCategory(activeCategory, true);
    });
  });

  // refresh now
  refreshNow.addEventListener('click', () => loadCategory(activeCategory, true));

  // auto-refresh every 10s but diff to avoid flicker
  setInterval(() => loadCategory(activeCategory, false), 10000);
  // initial
  loadCategory('all', true);

  // expose for debugging
  window.__THE_INK = { loadCategory };
})();
