const feedListEl = document.getElementById('feedList');
const loadBtn = document.getElementById('loadBtn');
const clearBtn = document.getElementById('clearBtn');
const postList = document.getElementById('postList');

function renderSavedFeeds() {
  const saved = JSON.parse(localStorage.getItem('pulse_feeds') || '[]');
  if (saved.length) feedListEl.value = saved.join('\n');
}
renderSavedFeeds();

async function loadFeeds() {
  postList.innerHTML = '<p>Loading…</p>';
  const feeds = feedListEl.value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!feeds.length) {
    postList.innerHTML = '<p>Add feed URLs first</p>';
    return;
  }
  localStorage.setItem('pulse_feeds', JSON.stringify(feeds));
  try {
    const res = await fetch('/.netlify/functions/fetchSummaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feeds })
    });
    if (!res.ok) throw new Error('Server error');
    const json = await res.json();
    postList.innerHTML = '';
    (json.items || []).forEach(it => postList.appendChild(createEditableCard(it)));
  } catch (err) {
    postList.innerHTML = '<p>Failed to fetch: ' + err.message + '</p>';
  }
}

function createEditableCard(it) {
  const div = document.createElement('div');
  div.className = 'post';
  const h = document.createElement('h3'); h.textContent = it.title; div.appendChild(h);
  const meta = document.createElement('div');
  meta.textContent = it.source + (it.pubDate ? ' • ' + new Date(it.pubDate).toLocaleString() : '');
  div.appendChild(meta);
  const ta = document.createElement('textarea'); ta.value = it.summary || ''; div.appendChild(ta);
  const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '8px'; row.style.marginTop = '8px';
  const open = document.createElement('a'); open.href = it.link; open.target = '_blank'; open.rel = 'noopener'; open.textContent = 'Open original'; row.appendChild(open);
  const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save locally'; saveBtn.onclick = () => saveLocalDraft({ title: it.title, source: it.source, link: it.link, summary: ta.value }); row.appendChild(saveBtn);
  div.appendChild(row);
  return div;
}

function saveLocalDraft(obj) {
  const drafts = JSON.parse(localStorage.getItem('pulse_drafts') || '[]');
  drafts.unshift({ ...obj, savedAt: new Date().toISOString() });
  localStorage.setItem('pulse_drafts', JSON.stringify(drafts));
  alert('Saved locally');
}

loadBtn.addEventListener('click', loadFeeds);
clearBtn.addEventListener('click', () => { feedListEl.value = ''; localStorage.removeItem('pulse_feeds'); postList.innerHTML = ''; });
