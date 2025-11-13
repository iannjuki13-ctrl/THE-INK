/* app.js — frontend logic for THE INK
   - category-aware
   - cached-backend friendly
   - auto-refresh every 10s, only update UI on changes
   - smooth rendering, minimal flicker
*/

(() => {
  // Elements
  const articlesEl = document.getElementById('articles');
  const tickerEl = document.getElementById('liveTicker');
  const carouselEl = document.getElementById('topCarousel');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const categoryButtons = Array.from(document.querySelectorAll('.cat-btn'));
  const sectionTitle = document.getElementById('sectionTitle');
  const heroTitle = document.getElementById('heroTitle');
  const lastUpdatedEl = document.getElementById('lastUpdated');
  const trendingList = document.getElementById('trendingList');
  const yearEl = document.getElementById('year');

  yearEl.textContent = new Date().getFullYear();

  let activeCategory = 'all';
  let currentItemsHash = '';
  let carouselIndex = 0;
  let carouselTimer = null;
  let fetchTimer = null;

  // Helpers
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

  function itemsHash(items) {
    return items.map(i => (i.link || '') + '||' + (i.title || '')).join('|');
  }

  // Renderers
  function renderTicker(items) {
    if (!tickerEl) return;
    const texts = (items || []).slice(0, 20).map(it => it.title || '').filter(Boolean);
    if (!texts.length) {
      tickerEl.innerHTML = '<span>No headlines</span>';
      return;
    }
    tickerEl.innerHTML = '';
    texts.forEach(t => {
      const s = mk('span', { style: 'margin-right:3rem; display:inline-block' }, t);
      tickerEl.appendChild(s);
    });
  }

  function renderCarousel(items) {
    carouselEl.innerHTML = '';
    const top = (items || []).slice(0, 5);
    top.forEach((it, idx) => {
      const card = mk('div', { class: 'carousel-item fade-in' });
      const img = mk('img', { src: it.image || '', alt: it.title || 'Top story' });
      const caption = mk('div', { class: 'carousel-caption' });
      caption.appendChild(mk('h3', {}, it.title || ''));
      card.appendChild(img);
      card.appendChild(caption);
      card.addEventListener('click', () => window.open(it.link || '#', '_blank'));
      carouselEl.appendChild(card);
    });
    carouselIndex = 0;
    updateCarouselScroll();
    startCarouselAuto();
  }

  function updateCarouselScroll() {
    if (!carouselEl || !carouselEl.children.length) return;
    const childWidth = carouselEl.children[0].getBoundingClientRect().width + 12;
    carouselEl.scrollTo({ left: carouselIndex * childWidth, behavior: 'smooth' });
  }

  function startCarouselAuto() {
    stopCarouselAuto();
    carouselTimer = setInterval(() => {
      const len = carouselEl.children.length || 1;
      carouselIndex = (carouselIndex + 1) % len;
      updateCarouselScroll();
    }, 4500);
  }

  function stopCarouselAuto() {
    if (carouselTimer) {
      clearInterval(carouselTimer);
      carouselTimer = null;
    }
  }

  function renderArticles(items) {
    if (!articlesEl) return;
    articlesEl.innerHTML = '';
    if (!items || !items.length) {
      articlesEl.innerHTML = '<p style="text-align:center;color:#ccc;padding:2rem">No articles yet.</p>';
      return;
    }
    items.forEach((it, idx) => {
      const card = mk('article', { class: 'article-card fade-in' });
      const img = mk('img', { src: it.image || '', alt: it.title || 'article image' });
      card.appendChild(img);

      const info = mk('div', { class: 'info' });
      info.appendChild(mk('h3', {}, it.title || '(no title)'));
      const meta = mk('div', { class: 'meta' }, `${it.source || ''} ${it.pubDate ? ' • ' + niceDate(it.pubDate) : ''}`);
      info.appendChild(meta);
      info.appendChild(mk('p', {}, it.summary || '(No summary)'));
      const row = mk('div', { style: 'margin-top:10px; display:flex; gap:8px; align-items:center' });
      const open = mk('a', { href: it.link || '#', target: '_blank', rel: 'noopener', style: 'background:#ffd700;color:#000;padding:6px 10px;border-radius:6px;text-decoration:none;font-weight:700' }, 'Read original');
      row.appendChild(open);
      info.appendChild(row);

      card.appendChild(info);
      articlesEl.appendChild(card);
    });
  }

  function renderTrending(items) {
    if (!trendingList) return;
    trendingList.innerHTML = '';
    const top = (items || []).slice(0, 6);
    top.forEach(it => {
      const li = mk('li');
      li.appendChild(mk('a', { href: it.link || '#', target: '_blank', rel: 'noopener' }, it.title || ''));
      trendingList.appendChild(li);
    });
  }

  // Fetching
  async function fetchForCategory(cat = 'all', force = false) {
    try {
      const url = `/api/fetchSummaries?category=${encodeURIComponent(cat)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Bad response');
      const json = await res.json();
      const items = json.items || [];
      const newHash = itemsHash(items);
      if (force || !currentItemsHash || newHash !== currentItemsHash) {
        currentItemsHash = newHash;
        // update titles / UI
        sectionTitle.textContent = (cat === 'all') ? 'Latest Articles' : `${cat.charAt(0).toUpperCase()+cat.slice(1)} — Latest`;
        heroTitle.textContent = (cat === 'all') ? 'Top Stories' : `${cat.charAt(0).toUpperCase()+cat.slice(1)}`;
        renderTicker(items);
        renderCarousel(items);
        renderArticles(items);
        renderTrending(items);
      }
      if (json.lastUpdated) {
        const d = new Date(json.lastUpdated);
        lastUpdatedEl.textContent = `Updated ${d.toLocaleTimeString()}`;
      } else {
        lastUpdatedEl.textContent = '';
      }
    } catch (err) {
      console.error('Fetch failed', err);
    }
  }

  // Category interactions
  categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat || 'all';
      currentItemsHash = ''; // force update
      fetchForCategory(activeCategory, true);
    });
  });

  // Manual controls
  document.getElementById('refreshNow').addEventListener('click', () => {
    currentItemsHash = ''; fetchForCategory(activeCategory, true);
  });

  prevBtn?.addEventListener('click', () => {
    carouselIndex = Math.max(0, carouselIndex - 1);
    updateCarouselScroll();
    stopCarouselAuto();
  });
  nextBtn?.addEventListener('click', () => {
    carouselIndex = Math.min(Math.max(0, carouselEl.children.length - 1), carouselIndex + 1);
    updateCarouselScroll();
    stopCarouselAuto();
  });

  // Auto refresh loop (10s). We don't re-render if nothing changed.
  async function startAutoRefresh() {
    await fetchForCategory(activeCategory, false);
    fetchTimer = setInterval(() => fetchForCategory(activeCategory, false), 10000);
  }

  // Kick off
  startAutoRefresh();

  // Expose for debugging (optional)
  window.__THE_INK = { fetchForCategory, startAutoRefresh };

})();
