    // Re-attach event listeners for playlist menu popup buttons
    setTimeout(() => {
      const playBtn = document.getElementById('playPlaylistBtn');
      const deleteBtn = document.getElementById('deletePlaylistBtn');
      const exportBtn = document.getElementById('exportPlaylistBtn');
      const importBtn = document.getElementById('importPlaylistBtn');
      const importFile = document.getElementById('importFile');
      if (playBtn) playBtn.onclick = () => { if (!currentPlaylistId) return alert('Select a playlist first'); playPlaylistById(currentPlaylistId); };
      if (deleteBtn) deleteBtn.onclick = () => { if (!currentPlaylistId) return alert('Select a playlist first'); if (!confirm('Delete this playlist?')) return; deletePlaylist(currentPlaylistId); };
      if (exportBtn) exportBtn.onclick = () => { if (!currentPlaylistId) return alert('Select a playlist first'); exportPlaylist(currentPlaylistId); };
      if (importBtn) importBtn.onclick = () => { if (importFile) importFile.click(); };
      if (importFile) importFile.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; importPlaylistFromFile(f); importFile.value = null; };
    }, 0);
  // Re-attach event listeners for playlist menu popup buttons
  setTimeout(() => {
    const playBtn = document.getElementById('playPlaylistBtn');
    const deleteBtn = document.getElementById('deletePlaylistBtn');
    const exportBtn = document.getElementById('exportPlaylistBtn');
    const importBtn = document.getElementById('importPlaylistBtn');
    const importFile = document.getElementById('importFile');
    if (playBtn) playBtn.onclick = () => { if (!currentPlaylistId) return alert('Select a playlist first'); playPlaylistById(currentPlaylistId); };
    if (deleteBtn) deleteBtn.onclick = () => { if (!currentPlaylistId) return alert('Select a playlist first'); if (!confirm('Delete this playlist?')) return; deletePlaylist(currentPlaylistId); };
    if (exportBtn) exportBtn.onclick = () => { if (!currentPlaylistId) return alert('Select a playlist first'); exportPlaylist(currentPlaylistId); };
    if (importBtn) importBtn.onclick = () => { if (importFile) importFile.click(); };
    if (importFile) importFile.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; importPlaylistFromFile(f); importFile.value = null; };
  }, 0);
// Collapse/expand search results card
const toggleResultsCollapseBtn = document.getElementById('toggleResultsCollapse');
const resultsCollapseWrap = document.getElementById('resultsCollapseWrap');
const resultsCollapseIcon = document.getElementById('resultsCollapseIcon');
let resultsCollapsed = false;
if (toggleResultsCollapseBtn && resultsCollapseWrap && resultsCollapseIcon) {
  toggleResultsCollapseBtn.addEventListener('click', () => {
    resultsCollapsed = !resultsCollapsed;
    resultsCollapseWrap.style.display = resultsCollapsed ? 'none' : '';
    // Change icon direction (down for expanded, up for collapsed)
    resultsCollapseIcon.innerHTML = resultsCollapsed
      ? '<path d="M7 14l5-5 5 5" stroke="#32CD32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<path d="M7 10l5 5 5-5" stroke="#32CD32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    toggleResultsCollapseBtn.title = resultsCollapsed ? 'Expand results' : 'Collapse results';
  });
}
const playerSpinner = document.getElementById('playerSpinner');
const playerCard = document.getElementById('playerCard');
const queryEl = document.getElementById('query');
const playTubidyBtn = document.getElementById('searchTubidy');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
// separate search progress elements (search streaming)
const searchProgressWrap = document.getElementById('searchProgressWrap');
const searchProgressBar = document.getElementById('searchProgressBar');
const audio = document.getElementById('player');
const resultsEl = document.getElementById('results');
const debugEl = document.getElementById('debugLog');
const debugPanel = document.getElementById('debugPanel');
const toggleDebugBtn = document.getElementById('toggleDebug');
const nowPlayingEl = document.getElementById('nowPlaying');
const newPlaylistName = document.getElementById('newPlaylistName');
const createPlaylistBtn = document.getElementById('createPlaylistBtn');
const deletePlaylistBtn = document.getElementById('deletePlaylistBtn');
const playPlaylistBtn = document.getElementById('playPlaylistBtn');
const exportPlaylistBtn = document.getElementById('exportPlaylistBtn');
const importPlaylistBtn = document.getElementById('importPlaylistBtn');
const importFile = document.getElementById('importFile');
const playlistItemsEl = document.getElementById('playlistItems');

// Custom player UI elements
const playerToggle = document.getElementById('playerToggle');
const playerProgress = document.getElementById('playerProgress');
const playerProgressBar = document.getElementById('playerProgressBar');
const playerCur = document.getElementById('playerCur');
const playerDur = document.getElementById('playerDur');
const playerTitle = document.getElementById('playerTitle');
const playerSub = document.getElementById('playerSub');
const playerArt = document.getElementById('playerArt');
const playerVolumeBtn = document.getElementById('playerVolumeBtn');
const prevTrackBtn = document.getElementById('prevTrack');
const nextTrackBtn = document.getElementById('nextTrack');

function formatTime(s) { try { if (!s || isNaN(s) || !isFinite(s)) return '0:00'; const m = Math.floor(s/60); const sec = Math.floor(s%60); return m + ':' + (sec<10?('0'+sec):sec); } catch(e){ return '0:00'; } }

// Wire basic player controls
if (playerToggle) {
  playerToggle.addEventListener('click', async () => {
    try {
      if (audio.paused) { await audio.play(); playerToggle.textContent = '❚❚'; }
      else { audio.pause(); playerToggle.textContent = '▶'; }
    } catch (e) { logDebug('playerToggle error', e && e.message); }
  });
}
if (playerProgress && playerProgressBar) {
  // seek on click
  playerProgress.addEventListener('click', (ev) => {
    try {
      const rect = playerProgress.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      if (audio.duration && isFinite(audio.duration)) audio.currentTime = pct * audio.duration;
    } catch (e) { logDebug('progress click', e && e.message); }
  });
}
if (playerVolumeBtn) {
  playerVolumeBtn.addEventListener('click', () => {
    try {
      audio.muted = !audio.muted;
      playerVolumeBtn.textContent = audio.muted ? '🔈' : '🔊';
    } catch (e) {}
  });
}
if (prevTrackBtn) prevTrackBtn.addEventListener('click', () => { try { playPreviousTrack(); } catch(e){} });
if (nextTrackBtn) nextTrackBtn.addEventListener('click', () => { try { playNextTrack(); } catch(e){} });

// update progress UI from audio events
audio.addEventListener('timeupdate', () => {
  try {
    if (audio.duration && isFinite(audio.duration)) {
      const pct = Math.max(0, Math.min(100, Math.round((audio.currentTime / audio.duration) * 100)));
      if (playerProgressBar) playerProgressBar.style.width = pct + '%';
      if (playerCur) playerCur.textContent = formatTime(audio.currentTime);
      if (playerDur) playerDur.textContent = formatTime(audio.duration);
    }
  } catch (e) {}
});

audio.addEventListener('play', () => { try { if (playerToggle) playerToggle.textContent = '❚❚'; } catch(e){} });
audio.addEventListener('pause', () => { try { if (playerToggle) playerToggle.textContent = '▶'; } catch(e){} });

// ensure setNowPlaying updates player UI too
const _origSetNowPlaying = window.setNowPlaying;
window.setNowPlaying = function(info){
  try {
    _origSetNowPlaying(info);
  } catch(e){}
  try {
    if (playerTitle) playerTitle.textContent = (info && info.title) ? info.title : 'Not playing';
    if (playerSub) playerSub.textContent = (info && info.link) ? extractTitleFromUrl(info.link) : '—';
    if (playerArt) {
      // simple placeholder: initials or emoji
      const t = (info && info.title) ? info.title.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() : 'TS';
      playerArt.textContent = t;
    }
  } catch(e) { logDebug('setNowPlaying patch error', e && e.message); }
};

function logDebug(...args) {
  try {
    const txt = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    console.log('[debug]', txt);
    if (debugEl) {
      debugEl.textContent += '[' + new Date().toISOString() + '] ' + txt + '\n';
      debugEl.scrollTop = debugEl.scrollHeight;
    }
  } catch (e) { console.log(e); }
}

// Debug panel toggle behavior (persist in localStorage)
function setDebugVisible(visible) {
  try {
    if (debugPanel) debugPanel.style.display = visible ? 'block' : 'none';
    if (toggleDebugBtn) toggleDebugBtn.textContent = visible ? 'Hide Debug' : 'Show Debug';
    try { localStorage.setItem('showDebug', visible ? '1' : '0'); } catch (e) {}
    // keep settings panel checkbox in sync if present
    try { const cb = document.getElementById('settingsShowDebug'); if (cb) cb.checked = !!visible; } catch (e) {}
  } catch (e) {}
}

if (toggleDebugBtn) {
  toggleDebugBtn.addEventListener('click', () => {
    try {
      const cur = (debugPanel && debugPanel.style.display !== 'none');
      setDebugVisible(!cur);
    } catch (e) {}
  });
}

// initialize debug visibility from localStorage
try {
  const stored = localStorage.getItem('showDebug');
  if (stored === '1') setDebugVisible(true); else setDebugVisible(false);
} catch (e) { setDebugVisible(false); }

// --- Playlist management (localStorage) ---
let playlists = []; // { id, name, items: [{title, link}], created }
let currentPlaylistId = null;

function loadPlaylists() {
  try { const raw = localStorage.getItem('tubidy_playlists') || '[]'; playlists = JSON.parse(raw); } catch (e) { playlists = []; }
  if (!Array.isArray(playlists)) playlists = [];
  // Show/hide playlist UI based on existence of playlists
  const wrap = document.getElementById('playlistCardWrap');
  const card = document.getElementById('playlistCard');
  if (wrap) wrap.style.display = playlists.length ? '' : 'none';
  if (card) card.style.display = playlists.length ? '' : 'none';
}

function savePlaylists() {
  try { localStorage.setItem('tubidy_playlists', JSON.stringify(playlists)); } catch (e) { logDebug('savePlaylists error', e && e.message); }
  // Show/hide playlist UI based on existence of playlists
  const wrap = document.getElementById('playlistCardWrap');
  const card = document.getElementById('playlistCard');
  if (wrap) wrap.style.display = playlists.length ? '' : 'none';
  if (card) card.style.display = playlists.length ? '' : 'none';
}

function makeId() { return Math.random().toString(36).slice(2,10); }

function createPlaylist(name) {
  const id = makeId();
  const p = { id, name: name || 'Playlist ' + (playlists.length + 1), items: [], created: Date.now() };
  playlists.push(p);
  savePlaylists();
  renderPlaylistsUI();
  const wrap = document.getElementById('playlistCardWrap');
  if (wrap) wrap.style.display = '';
  selectPlaylist(id);
}

function deletePlaylist(id) {
  const idx = playlists.findIndex(p => p.id === id);
  if (idx === -1) return;
  playlists.splice(idx, 1);
  savePlaylists();
  renderPlaylistsUI();
  if (playlists.length) selectPlaylist(playlists[0].id); else selectPlaylist(null);
  // Show/hide playlist UI based on existence of playlists
  const wrap = document.getElementById('playlistCardWrap');
  const card = document.getElementById('playlistCard');
  if (wrap) wrap.style.display = playlists.length ? '' : 'none';
  if (card) card.style.display = playlists.length ? '' : 'none';
}

function selectPlaylist(id) {
  currentPlaylistId = id;
  renderPlaylistItems();
}

function addToPlaylist(item) {
  if (!currentPlaylistId) {
    // Show popup to create first playlist
    const popup = document.getElementById('playlistPopup');
    if (popup) {
      popup.style.display = 'flex';
      const nameInput = document.getElementById('popupPlaylistName');
      if (nameInput) nameInput.value = '';
      const createBtn = document.getElementById('popupCreateBtn');
      if (createBtn) {
        createBtn.onclick = () => {
          const name = nameInput && nameInput.value ? nameInput.value.trim() : '';
          if (!name) return nameInput && (nameInput.style.border = '2px solid #f00');
          createPlaylist(name);
          popup.style.display = 'none';
          setTimeout(() => { addToPlaylist(item); }, 100);
        };
      }
    }
    return;
  }
  const p = playlists.find(pl => pl.id === currentPlaylistId);
  if (!p) return alert('Selected playlist not found');
  // avoid duplicates by link
  if (p.items.find(it => it.link === item.link)) return logDebug('item already in playlist');
  p.items.push({ title: item.title || item.link, link: item.link });
  savePlaylists();
  renderPlaylistItems();

  // Kick off background cache/prefetch for playlist items so they play instantly later
  try {
    fetch('/cache/prefetch?link=' + encodeURIComponent(item.link) + '&format=mp3').then(r => r.json()).then(j => {
      logDebug('cache prefetch started', j);
    }).catch(e => logDebug('cache prefetch error', e && e.message));
  } catch (e) { logDebug('cache prefetch exception', e && e.message); }
}

function removeFromPlaylist(index) {
  const p = playlists.find(pl => pl.id === currentPlaylistId);
  if (!p) return;
  if (index < 0 || index >= p.items.length) return;
  p.items.splice(index, 1);
  savePlaylists();
  renderPlaylistItems();
}

function renderPlaylistsUI() {

  // Render playlist switcher cards
  const switcherWrap = document.getElementById('playlistSwitcherWrap');
  if (switcherWrap) {
    switcherWrap.innerHTML = '';
    for (const p of playlists) {
      const card = document.createElement('div');
      card.className = 'playlist-switcher-card';
      card.style.background = 'rgba(255,255,255,0.12)';
      card.style.backdropFilter = 'blur(8px)';
      card.style.webkitBackdropFilter = 'blur(8px)';
      card.style.color = '#fff';
      card.style.border = '2px solid rgba(255,255,255,0.18)';
      card.style.borderRadius = '12px';
      card.style.padding = '10px 18px';
      card.style.display = 'flex';
      card.style.alignItems = 'center';
      card.style.gap = '10px';
      card.style.cursor = 'pointer';
      card.style.fontWeight = '700';
      card.style.boxShadow = '0 2px 8px rgba(50,205,50,0.10)';
      card.style.transition = 'border 0.2s, box-shadow 0.2s';
      if (currentPlaylistId === p.id) {
        card.style.border = '2px solid #32CD32';
        card.style.boxShadow = '0 0 0 2px #32CD32';
      }
      card.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:6px;"><circle cx="12" cy="12" r="10" fill="#32CD32"/><text x="12" y="16" text-anchor="middle" font-size="12" fill="#fff" font-family="Arial" font-weight="bold">${p.name[0] ? p.name[0].toUpperCase() : ''}</text></svg> <span>${p.name}</span> <span style="font-size:0.95em;opacity:0.7;">(${p.items.length})</span>`;
      card.onclick = () => selectPlaylist(p.id);
      switcherWrap.appendChild(card);
    }
  }
}

function renderPlaylistItems() {
  if (!playlistItemsEl) return;
  playlistItemsEl.innerHTML = '';
  const titleEl = document.getElementById('currentPlaylistTitle');
  const p = playlists.find(pl => pl.id === currentPlaylistId);
  if (titleEl) {
    if (p && p.name) {
      titleEl.textContent = p.name;
      titleEl.style.display = '';
    } else {
      titleEl.textContent = '';
      titleEl.style.display = 'none';
    }
  }
  if (!p) {
    playlistItemsEl.innerHTML = '<li style="color:var(--muted)">No playlist selected</li>';
    return;
  }
  if (!p.items.length) {
    playlistItemsEl.innerHTML = '<li style="color:var(--muted)">Playlist is empty</li>';
    return;
  }
  p.items.forEach((it, idx) => {
    const li = document.createElement('li'); li.style.display='flex'; li.style.alignItems='center'; li.style.justifyContent='space-between'; li.style.padding='8px';
    const titleWrap = document.createElement('span'); titleWrap.style.display = 'flex'; titleWrap.style.alignItems = 'center'; titleWrap.style.gap = '6px';
    const checkmark = document.createElement('span'); checkmark.className = 'cache-badge'; checkmark.style.display = 'none';
    const span = document.createElement('span'); span.textContent = it.title;
    titleWrap.appendChild(checkmark);
    titleWrap.appendChild(span);
    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
    const playBtn = document.createElement('button');
    playBtn.className = 'play';
    playBtn.title = 'Play';
    playBtn.style.padding = '4px';
    playBtn.style.background = 'rgba(50,205,50,0.18)';
    playBtn.style.backdropFilter = 'blur(6px)';
    playBtn.style.webkitBackdropFilter = 'blur(6px)';
    playBtn.style.border = '1px solid rgba(50,205,50,0.22)';
    playBtn.style.borderRadius = '6px';
    playBtn.style.display = 'inline-flex';
    playBtn.style.alignItems = 'center';
    playBtn.style.justifyContent = 'center';
    playBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><polygon points="9,7 19,12 9,17" fill="#fff"/></svg>`;
    playBtn.addEventListener('click', () => playPlaylistItem(p, idx));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    removeBtn.title = 'Delete';
    removeBtn.style.padding = '4px';
    removeBtn.style.background = 'rgba(50,205,50,0.18)';
    removeBtn.style.backdropFilter = 'blur(6px)';
    removeBtn.style.webkitBackdropFilter = 'blur(6px)';
    removeBtn.style.border = '1px solid rgba(50,205,50,0.22)';
    removeBtn.style.borderRadius = '6px';
    removeBtn.style.display = 'inline-flex';
    removeBtn.style.alignItems = 'center';
    removeBtn.style.justifyContent = 'center';
    removeBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><path d="M6 6l12 12M6 18L18 6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>`;
    removeBtn.addEventListener('click', () => removeFromPlaylist(idx));
    actions.appendChild(playBtn); actions.appendChild(removeBtn);
    // Highlight currently playing song in playlist
    try {
      if (window._nowPlaying && window._nowPlaying.link && it.link && normalizeLink(window._nowPlaying.link) === normalizeLink(it.link)) {
        li.classList.add('playing');
      }
    } catch (e) {}
    li.appendChild(titleWrap); li.appendChild(actions);
    playlistItemsEl.appendChild(li);
    // update checkmark status asynchronously
    setCacheBadgeForCheckmark(checkmark, it.link);
  });
}

function setCacheBadgeForCheckmark(el, link) {
  if (!el) return;
  el.style.display = 'none';
  fetch('/cache/status?link=' + encodeURIComponent(link) + '&format=mp3')
    .then(res => res.ok ? res.json() : null)
    .then(j => {
      if (j && j.cached) {
        el.className = 'cache-badge ready';
        el.style.display = 'inline-block';
      } else {
        el.className = 'cache-badge';
        el.style.display = 'none';
      }
    })
    .catch(() => { el.className = 'cache-badge'; el.style.display = 'none'; });
}

// play single playlist item by resolving and using existing play flow (non-button UI)
async function playPlaylistItem(playlist, idx) {
  const it = playlist.items[idx];
  if (!it) return;
  try {
    logDebug('Playing playlist item', it.title);
    // set playback context so Next/Previous buttons can act on this playlist
    try { window._currentPlaybackContext = { type: 'playlist', playlistId: playlist.id, index: idx }; } catch (e) {}
    // Try cache first (fast path)
    try {
      const cs = await fetch('/cache/status?link=' + encodeURIComponent(it.link) + '&format=mp3');
      if (cs.ok) {
        const cj = await cs.json();
        if (cj && cj.cached && cj.key) {
          const cacheUrl = '/cache/stream?key=' + encodeURIComponent(cj.key);
          audio.src = cacheUrl; audio.load(); await audio.play(); setNowPlaying({ title: it.title || extractTitleFromUrl(cacheUrl), link: it.link });
          return;
        }
      }
    } catch (e) { logDebug('cache check error', e && e.message); }

    // Reuse playResult flow: resolve checkmedia then prepare and play
    const checkRes = await fetch('/tubidy/checkmedia?link=' + encodeURIComponent(it.link));
    if (!checkRes.ok) { alert('Could not resolve media for ' + it.title); return; }
    const json = await checkRes.json();
    const media = json.media || [];
    if (!media.length) { alert('No direct media found for ' + it.title); return; }
    const upstream = media[0];
    const wantFormat = upstream.match(/\.mp3(\?|$)/i) ? '' : 'mp3';
    const esUrl = '/stream-status?url=' + encodeURIComponent(upstream) + (wantFormat ? '&format=' + wantFormat : '');
    const es = new EventSource(esUrl);
    if (progressWrap) { progressWrap.style.display='block'; }
    es.addEventListener('done', async (ev) => {
        try { const d = JSON.parse(ev.data || '{}'); const id = d.id; const localUrl = '/local-stream?id=' + encodeURIComponent(id); audio.src = localUrl; audio.load(); await audio.play(); setNowPlaying({ title: playlist.items[idx].title || extractTitleFromUrl(localUrl), link: playlist.items[idx].link }); } catch (e) { console.error(e); }
      try { es.close(); } catch (e) {}
      setTimeout(() => { if (progressWrap) progressWrap.style.display='none'; if (progressBar) progressBar.style.width='0%'; }, 800);
    });
    // set now playing when starting playlist item preparation
    // (this will be updated to real title when the item finishes preparing)
    setNowPlaying({ title: it.title || extractTitleFromUrl(upstream), link: upstream });
    es.addEventListener('progress', (ev) => { try { const d = JSON.parse(ev.data||'{}'); if (progressBar) progressBar.style.width = (d.percent || 0) + '%'; } catch(e){} });
    es.addEventListener('error', (ev) => { try { es.close(); alert('Failed to prepare stream for playlist item.'); } catch (e) {} });
  } catch (e) { console.error(e); alert('Error playing playlist item: ' + e && e.message); }
}

// Play entire playlist sequentially
let _playlistQueue = []; let _playlistQueueIdx = 0; let _playlistAutoPlaying = false;
let _currentPlaylistPlayingId = null; // id of playlist currently being auto-played
function playPlaylistById(id) {
  const p = playlists.find(pl => pl.id === id);
  if (!p || !p.items.length) return alert('Playlist empty');
  _playlistQueue = p.items.slice(); _playlistQueueIdx = 0; _playlistAutoPlaying = true;
  _currentPlaylistPlayingId = id;
  try { window._currentPlaybackContext = { type: 'playlist', playlistId: id, index: 0 }; } catch (e) {}
  playNextInQueue();
}

async function playNextInQueue() {
  if (!_playlistAutoPlaying) return;
  if (_playlistQueueIdx >= _playlistQueue.length) { _playlistAutoPlaying = false; return; }
  const it = _playlistQueue[_playlistQueueIdx++];
  try {
    // update playback context for this queued item
    try { window._currentPlaybackContext = { type: 'playlist', playlistId: _currentPlaylistPlayingId, index: Math.max(0, _playlistQueueIdx - 1) }; } catch (e) {}
    // fast path: check cache for this playlist item
    try {
      const cs = await fetch('/cache/status?link=' + encodeURIComponent(it.link) + '&format=mp3');
      if (cs.ok) {
        const cj = await cs.json();
        if (cj && cj.cached && cj.key) {
          const cacheUrl = '/cache/stream?key=' + encodeURIComponent(cj.key);
          audio.src = cacheUrl; audio.load(); await audio.play();
          setNowPlaying({ title: it.title || extractTitleFromUrl(cacheUrl), link: it.link });
          // ensure playback context matches queued playlist
          try { window._currentPlaybackContext = { type: 'playlist', playlistId: _currentPlaylistPlayingId, index: Math.max(0, _playlistQueueIdx - 1) }; } catch (e) {}
          audio.onended = () => { audio.onended = null; playNextInQueue(); };
          return;
        }
      }
    } catch (e) { logDebug('cache status error', e && e.message); }

    const checkRes = await fetch('/tubidy/checkmedia?link=' + encodeURIComponent(it.link));
    if (!checkRes.ok) { logDebug('Playlist item resolve failed', it.title); return playNextInQueue(); }
    const json = await checkRes.json(); const media = json.media || []; if (!media.length) return playNextInQueue();
    const upstream = media[0]; const wantFormat = upstream.match(/\.mp3(\?|$)/i) ? '' : 'mp3';
    const esUrl = '/stream-status?url=' + encodeURIComponent(upstream) + (wantFormat ? '&format=' + wantFormat : '');
    const es = new EventSource(esUrl);
    es.addEventListener('done', async (ev) => {
      try { const d = JSON.parse(ev.data || '{}'); const id = d.id; const localUrl = '/local-stream?id=' + encodeURIComponent(id); audio.src = localUrl; audio.load(); await audio.play(); } catch (e) { console.error(e); }
      try { es.close(); } catch (e) {}
      // when audio ends, continue to next
      audio.onended = () => { audio.onended = null; playNextInQueue(); };
    });
    es.addEventListener('error', (ev) => { try { es.close(); logDebug('stream prepare error for playlist item'); playNextInQueue(); } catch(e){} });
  } catch (e) { console.error(e); playNextInQueue(); }
}

// Export playlist as JSON
function exportPlaylist(id) {
  const p = playlists.find(pl => pl.id === id); if (!p) return alert('Select a playlist to export');
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = (p.name || 'playlist') + '.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function importPlaylistFromFile(file) {
  const reader = new FileReader(); reader.onload = (ev) => {
    try {
      const obj = JSON.parse(ev.target.result);
      if (!obj || !obj.name) return alert('Invalid playlist file');
      const id = makeId(); obj.id = id; playlists.push(obj); savePlaylists(); renderPlaylistsUI(); selectPlaylist(id);
        // Prefetch imported playlist items in background
        try {
          if (Array.isArray(obj.items) && obj.items.length) {
            let d = 0;
            for (const it of obj.items) {
              setTimeout(() => prefetchLinkIfNeeded(it.link), d);
              d += 300;
            }
          }
        } catch (e) { logDebug('import prefetch error', e && e.message); }
    } catch (e) { alert('Failed to import playlist: ' + e && e.message); }
  };
  reader.readAsText(file);
}

// Hook up playlist UI actions

const playlistAddBtn = document.getElementById('playlistAddBtn');
if (playlistAddBtn) {
  playlistAddBtn.addEventListener('click', () => {
    // Show popup for playlist creation
    const popup = document.getElementById('playlistPopup');
    if (popup) {
      popup.style.display = 'flex';
      const nameInput = document.getElementById('popupPlaylistName');
      if (nameInput) nameInput.value = '';
      const createBtn = document.getElementById('popupCreateBtn');
      if (createBtn) {
        createBtn.onclick = () => {
          const name = nameInput && nameInput.value ? nameInput.value.trim() : '';
          if (!name) return nameInput && (nameInput.style.border = '2px solid #f00');
          createPlaylist(name);
          popup.style.display = 'none';
        };
      }
    }
  });
}

// Playlist three-dot menu popup logic
function attachPlaylistMenuListeners() {
  const playBtn = document.getElementById('playlistMenuPlayBtn');
  const deleteBtn = document.getElementById('playlistMenuDeleteBtn');
  const exportBtn = document.getElementById('playlistMenuExportBtn');
  const importBtn = document.getElementById('playlistMenuImportBtn');
  const importFile = document.getElementById('playlistMenuImportFile');
  if (playBtn) playBtn.onclick = () => { if (!currentPlaylistId) return alert('Select a playlist first'); playPlaylistById(currentPlaylistId); };
  if (deleteBtn) deleteBtn.onclick = () => { if (!currentPlaylistId) return alert('Select a playlist first'); if (!confirm('Delete this playlist?')) return; deletePlaylist(currentPlaylistId); };
  if (exportBtn) exportBtn.onclick = () => { if (!currentPlaylistId) return alert('Select a playlist first'); exportPlaylist(currentPlaylistId); };
  if (importBtn) importBtn.onclick = () => { if (importFile) importFile.click(); };
  if (importFile) importFile.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; importPlaylistFromFile(f); importFile.value = null; };
}

const playlistMenuBtn = document.getElementById('playlistMenuBtn');
const playlistMenuPopup = document.getElementById('playlistMenuPopup');
if (playlistMenuBtn && playlistMenuPopup) {
  playlistMenuBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    playlistMenuPopup.style.display = (playlistMenuPopup.style.display === 'none' || !playlistMenuPopup.style.display) ? 'block' : 'none';
    attachPlaylistMenuListeners();
  });
  // Hide popup when clicking outside
  document.addEventListener('click', (ev) => {
    if (!playlistMenuPopup.contains(ev.target) && ev.target !== playlistMenuBtn) {
      playlistMenuPopup.style.display = 'none';
    }
  });
}
// Attach listeners on page load in case popup is already open
attachPlaylistMenuListeners();
deletePlaylistBtn && deletePlaylistBtn.addEventListener('click', () => { if (!currentPlaylistId) return alert('Select a playlist first'); if (!confirm('Delete this playlist?')) return; deletePlaylist(currentPlaylistId); });
playPlaylistBtn && playPlaylistBtn.addEventListener('click', () => { if (!currentPlaylistId) return alert('Select a playlist first'); playPlaylistById(currentPlaylistId); });
exportPlaylistBtn && exportPlaylistBtn.addEventListener('click', () => { if (!currentPlaylistId) return alert('Select a playlist first'); exportPlaylist(currentPlaylistId); });
importPlaylistBtn && importPlaylistBtn.addEventListener('click', () => { if (importFile) importFile.click(); });
importFile && importFile.addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; importPlaylistFromFile(f); importFile.value = null; });

// initialize playlists
loadPlaylists();
renderPlaylistsUI();
const card = document.getElementById('playlistCard');
if (playlists.length) {
  selectPlaylist(playlists[0].id);
  if (card) card.style.display = '';
} else {
  // Hide playlist UI if no playlists exist
  const wrap = document.getElementById('playlistCardWrap');
  if (wrap) wrap.style.display = 'none';
  if (card) card.style.display = 'none';
}

// Prefetch helper: check cache then start prefetch if not cached
async function prefetchLinkIfNeeded(link) {
  try {
    if (!link) return;
    logDebug('prefetchLinkIfNeeded start for', link);
    const statusRes = await fetch('/cache/status?link=' + encodeURIComponent(link) + '&format=mp3').catch(() => null);
    if (statusRes && statusRes.ok) {
      const j = await statusRes.json().catch(() => null);
      logDebug('prefetch status check', j);
      if (j && j.cached) { logDebug('already cached', link); return; } // already cached
    }
    // fire-and-forget prefetch (server will handle dedupe) and log response
    try {
      const r = await fetch('/cache/prefetch?link=' + encodeURIComponent(link) + '&format=mp3').catch(() => null);
      if (r && r.ok) {
        const j2 = await r.json().catch(() => null);
        logDebug('cache prefetch started', j2);
        // if job created but not ready, start polling status for debug visibility
        if (j2 && !j2.cached) {
          startPrefetchStatusPoll(link, j2.key);
        }
      } else {
        logDebug('cache prefetch request failed for', link);
      }
    } catch (e) { logDebug('prefetch request error', e && e.message); }
  } catch (e) { logDebug('prefetch error', e && e.message); }
}

// Track active pollers to avoid duplicates
const _prefetchPollers = {}; 
function startPrefetchStatusPoll(link, key) {
  try {
    const id = key || link;
    if (_prefetchPollers[id]) return; // already polling
    logDebug('startPrefetchStatusPoll for', id);
    let tries = 0;
    const maxTries = 120; // poll up to ~3 minutes
    _prefetchPollers[id] = setInterval(async () => {
      tries++;
      try {
        const s = await fetch('/cache/status?link=' + encodeURIComponent(link) + '&format=mp3').catch(() => null);
        if (!s) return;
        const j = await s.json().catch(() => null);
        logDebug('prefetch status', id, j);
        if (j && j.cached) {
          logDebug('prefetch completed for', id, 'key=', j.key);
          clearInterval(_prefetchPollers[id]); delete _prefetchPollers[id];
        } else if (j && j.status === 'error') {
          logDebug('prefetch error for', id, j);
          clearInterval(_prefetchPollers[id]); delete _prefetchPollers[id];
        } else if (tries > maxTries) {
          logDebug('prefetch poll timeout for', id);
          clearInterval(_prefetchPollers[id]); delete _prefetchPollers[id];
        }
      } catch (e) { logDebug('prefetch poll exception', e && e.message); }
    }, 1500);
  } catch (e) { logDebug('startPrefetchStatusPoll error', e && e.message); }
}

// Prefetch all items in all playlists (throttled)
function prefetchAllPlaylistItems() {
  try {
    if (!Array.isArray(playlists) || !playlists.length) return;
    let delay = 0;
    const gap = 500; // ms between requests to avoid spikes
    for (const p of playlists) {
      if (!p.items) continue;
      for (const it of p.items) {
        setTimeout(() => prefetchLinkIfNeeded(it.link), delay);
        delay += gap;
      }
    }
  } catch (e) { logDebug('prefetchAll error', e && e.message); }
}

// Kick off prefetch for existing playlists on load
prefetchAllPlaylistItems();


// Send playback events to server for logging (non-blocking)
function sendPlaybackEvent(evt, data) {
  try {
    fetch('/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: evt, ts: new Date().toISOString(), data }) }).catch(() => {});
  } catch (e) {}
}

function streamToAudio(url) {
  // First try simple direct playback via audio.src (browsers handle progressive MP3 well)
  try {
    logDebug('Attempting direct audio.src playback for', url);
    audio.src = url;
    audio.load();
    const playPromise = audio.play();
    // If play() is not a promise (older browsers), give it some time
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('play timeout')), 10000));
    return Promise.race([playPromise, timeout]).then(() => {
      logDebug('Direct audio.src play started for', url);
      // set now playing (URL only)
      setNowPlaying({ title: extractTitleFromUrl(url) || 'Playing', link: url });
    }).catch((err) => {
      logDebug('Direct play failed or timed out, falling back to MediaSource:', String(err));
      // fallback to MediaSource approach
      // If it's an MP4 container, avoid MediaSource fallback — many MP4 files are not fragmented
      // However, if the proxied URL requests `format=mp3` (server-side transcode), allow playback.
      const decoded = decodeURIComponent(url || '');
      const isMp4Container = decoded.match(/\.mp4(\?|$)/i);
      const requestsMp3 = decoded.match(/([?&])format=mp3(&|$)/i);
      if (isMp4Container && !requestsMp3) {
        logDebug('Detected MP4 container; skipping MediaSource fallback (fragmented MP4 required).');
        alert('Playback failed — MP4 container detected and proxy must support Range requests for progressive playback.');
        return;
      }

      if (!window.MediaSource) {
        logDebug('MediaSource not available; cannot fallback.');
        alert('Playback failed: cannot use MediaSource fallback.');
        return;
      }

      const mediaSource = new MediaSource();
      audio.src = URL.createObjectURL(mediaSource);

      mediaSource.addEventListener('sourceopen', () => {
        logDebug('MediaSource opened for', url);
        const mime = 'audio/mpeg';
        const sourceBuffer = mediaSource.addSourceBuffer(mime);
            // set now playing with title from search result
            setNowPlaying({ title: it.title || extractTitleFromUrl(upstream), link: upstream });
        sourceBuffer.mode = 'sequence';
        let queue = [];

        fetch(url).then(resp => {
          logDebug('fetch', url, 'status', resp.status, 'content-type', resp.headers.get('content-type'));
          if (!resp.ok) {
            return resp.text().then(t => { throw new Error(t || 'network response not ok'); });
          }
          const reader = resp.body.getReader();

          function read() {
            reader.read().then(({ done, value }) => {
              if (done) {
                const finish = () => {
                  try { mediaSource.endOfStream(); } catch (e) {}
                };
                if (sourceBuffer.updating) sourceBuffer.addEventListener('updateend', finish, { once: true });
                else finish();
                return;
              }

              queue.push(value);
              const tryAppend = () => {
                if (!queue.length) return;
                if (sourceBuffer.updating) return;
                const chunk = queue.shift();
                try {
                  sourceBuffer.appendBuffer(chunk);
                  logDebug('appended chunk, size', chunk.byteLength);
                } catch (e) {
                  console.error('append error', e);
                  logDebug('sourceBuffer.appendBuffer error', String(e));
                }
              };

              sourceBuffer.addEventListener('updateend', tryAppend);
              tryAppend();
              read();
            }).catch(err => console.error(err));
          }
          read();
        }).catch(err => {
          console.error('fetch error', err);
          logDebug('fetch error', String(err));
          alert('Error fetching stream: ' + err.message);
        });
      }, { once: true });

      audio.play().catch(() => {});
    });
  } catch (e) {
    logDebug('Unexpected error when attempting direct play:', String(e));
  }
}

// helper to normalize link strings for comparison
function normalizeLink(l) {
  try { return String(l || '').split('?')[0].replace(/\/\/$/, ''); } catch (e) { return String(l || ''); }
}

function extractTitleFromUrl(u) {
  try {
    const p = decodeURIComponent(u || '').split('/').pop() || u;
    return p.replace(/\?.*$/, '').replace(/[-_]/g, ' ');
  } catch (e) { return u; }
}

// Update a badge element to reflect cache status for a given link
async function setCacheBadge(badgeEl, link) {
  if (!badgeEl) return;
  try {
    badgeEl.textContent = 'Checking';
    badgeEl.className = 'cache-badge';
    const res = await fetch('/cache/status?link=' + encodeURIComponent(link) + '&format=mp3');
    if (!res.ok) { badgeEl.textContent = 'Unknown'; return; }
    const j = await res.json();
    if (j && j.cached) {
      badgeEl.textContent = 'Cached';
      badgeEl.className = 'cache-badge ready';
    } else if (j && j.status) {
      const st = String(j.status).toLowerCase();
      if (st === 'queued' || st === 'resolving' || st === 'downloading' || st === 'transcoding') {
        badgeEl.textContent = 'Preparing';
        badgeEl.className = 'cache-badge preparing';
        // poll until ready or error
        const start = Date.now();
        const maxMs = 5 * 60 * 1000; // 5 minutes
        const poll = async () => {
          await new Promise(r => setTimeout(r, 1500));
          try {
            const r2 = await fetch('/cache/status?link=' + encodeURIComponent(link) + '&format=mp3');
            if (!r2.ok) return;
            const j2 = await r2.json();
            if (j2 && j2.cached) { badgeEl.textContent = 'Cached'; badgeEl.className = 'cache-badge ready'; return; }
            if (j2 && j2.status === 'error') { badgeEl.textContent = 'Error'; badgeEl.className = 'cache-badge error'; return; }
            if (Date.now() - start < maxMs) return poll();
            // timeout
            badgeEl.textContent = 'Pending'; badgeEl.className = 'cache-badge';
          } catch (e) { badgeEl.textContent = 'Error'; badgeEl.className = 'cache-badge error'; }
        };
        poll();
      } else if (st === 'error') {
        badgeEl.textContent = 'Error'; badgeEl.className = 'cache-badge error';
      } else {
        badgeEl.textContent = 'Not cached'; badgeEl.className = 'cache-badge';
      }
    } else {
      badgeEl.textContent = 'Not cached'; badgeEl.className = 'cache-badge';
    }
  } catch (e) {
    try { badgeEl.textContent = 'Error'; badgeEl.className = 'cache-badge error'; } catch (er) {}
  }
}

// current now playing info
window._nowPlaying = null;
function setNowPlaying(info) {
  try {
    window._nowPlaying = info || null;
    if (nowPlayingEl) {
      nowPlayingEl.textContent = info && info.title ? info.title : 'Not playing';
    }
    // Show/hide player card
    if (playerCard) {
      if (info && info.title && info.title !== 'Not playing') {
        playerCard.style.display = '';
      } else {
        playerCard.style.display = 'none';
      }
    }
    // update highlighted item in results
    try {
      const items = resultsEl.querySelectorAll('li');
      items.forEach(li => li.classList.remove('playing'));
      if (info && info.link) {
        const norm = normalizeLink(info.link);
        const found = Array.from(items).find(li => normalizeLink(li.dataset.link || '') === norm);
        if (found) found.classList.add('playing');
      }
    } catch (e) {}
    // update highlighted item in playlist
    try {
      renderPlaylistItems();
    } catch (e) {}
  } catch (e) { console.error('setNowPlaying error', e); }
}

// direct-play removed: use search results or server-side prepare/play flow

// search and render results
let _results = [];
const resultsCard = document.getElementById('resultsCard');
let currentPage = 0;
const PER_PAGE = 20;
const PAGE_BATCH_SIZE = 3;
let _maxPagesLoaded = PAGE_BATCH_SIZE;
const loadMoreWrap = document.getElementById('loadMoreWrap');

function renderResults(reset) {
  if (reset) currentPage = 0;
    if (reset) {
      currentPage = 0;
      _maxPagesLoaded = PAGE_BATCH_SIZE;
    }
  resultsEl.innerHTML = '';
  if (!_results || !_results.length) {
    if (resultsCard) resultsCard.style.display = 'none';
    return (resultsEl.innerHTML = '<li>No results</li>');
  }
  if (resultsCard) resultsCard.style.display = '';
  const total = Math.min(_results.length, _maxPagesLoaded * PER_PAGE);
  const maxPage = Math.max(0, Math.floor((total - 1) / PER_PAGE));
  if (currentPage > maxPage) currentPage = maxPage;
  const start = currentPage * PER_PAGE;
  const end = Math.min(start + PER_PAGE, total);
  // summary line showing counts (range)
  const summary = document.createElement('li');
  summary.style.fontWeight = 'bold';
  summary.textContent = `Showing ${start + 1}-${end} of ${total} results`;
  resultsEl.appendChild(summary);
  for (let idx = start; idx < end; idx++) {
    const it = _results[idx];
    const li = document.createElement('li');
    li.dataset.index = idx;
    li.dataset.link = it.link || '';

    // If this item looks like a Next/pagination entry, render as Next button
    const lowTitle = (it.title || '').toLowerCase();
    const isNext = lowTitle.includes('next') || (it.link && /[?&]pn=\d+/i.test(it.link) || /[?&]page=\d+/i.test(it.link));
    if (isNext) {
      const nextBtn = document.createElement('button');
      nextBtn.textContent = it.title || 'Next';
      nextBtn.addEventListener('click', async () => {
        try {
          nextBtn.disabled = true;
          nextBtn.textContent = 'Loading...';
          // request the server to parse that specific page
          const resp = await fetch('/tubidy/page?url=' + encodeURIComponent(it.link));
          if (!resp.ok) {
            const txt = await resp.text();
            alert('Failed to load next page: ' + txt);
            return;
          }
          const j = await resp.json();
          const items = j.items || [];
          // append new items to results (avoid duplicates)
          const existing = new Set(_results.map(r => r.link));
          let added = 0;
          for (const ni of items) {
            if (!existing.has(ni.link)) { _results.push(ni); existing.add(ni.link); added++; }
          }
          logDebug('appended', added, 'items from next page');
          renderResults(false);
        } catch (e) {
          console.error('next page error', e);
          alert('Error loading next page: ' + (e && e.message));
        } finally {
          try { nextBtn.disabled = false; nextBtn.textContent = it.title || 'Next'; } catch (e) {}
        }
      });
      li.appendChild(nextBtn);
      resultsEl.appendChild(li);
      continue;
    }

    const btn = document.createElement('button');
    btn.className = 'play';
    btn.innerHTML = `<svg width="38" height="38" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><polygon points="9,7 19,12 9,17" fill="#fff"/></svg>`;
    btn.title = 'Play';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.padding = '4px';
    btn.style.background = 'rgba(50,205,50,0.18)';
    btn.style.backdropFilter = 'blur(6px)';
    btn.style.webkitBackdropFilter = 'blur(6px)';
    btn.style.border = '1px solid rgba(50,205,50,0.22)';
    btn.style.borderRadius = '6px';
    btn.addEventListener('click', () => playResult(idx, btn));

    let inPlaylist = false;
    if (currentPlaylistId && playlists && playlists.length) {
      const p = playlists.find(pl => pl.id === currentPlaylistId);
      if (p && p.items.some(item => item.link === it.link)) inPlaylist = true;
    }
    let addBtn = null;
    if (!inPlaylist) {
      addBtn = document.createElement('button');
      addBtn.className = 'add';
      addBtn.title = 'Add to playlist';
      addBtn.style.marginLeft = '8px';
      addBtn.style.display = 'inline-flex';
      addBtn.style.alignItems = 'center';
      addBtn.style.justifyContent = 'center';
      addBtn.style.padding = '4px';
      addBtn.style.background = 'rgba(50,205,50,0.18)';
      addBtn.style.backdropFilter = 'blur(6px)';
      addBtn.style.webkitBackdropFilter = 'blur(6px)';
      addBtn.style.border = '1px solid rgba(50,205,50,0.22)';
      addBtn.style.borderRadius = '6px';
      addBtn.innerHTML = `<svg width="38" height="38" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><path d="M12 8v8M8 12h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>`;
      addBtn.addEventListener('click', () => {
        try {
          addToPlaylist(it);
          addBtn.style.opacity = '0.5';
          addBtn.style.pointerEvents = 'none';
          setTimeout(() => { try { addBtn.style.opacity = '1'; addBtn.style.pointerEvents = 'auto'; } catch(e){} }, 900);
        } catch (e) { console.error('add to playlist error', e); }
      });
    } else {
      li.style.background = 'rgba(50,205,50,0.12)';
      li.style.boxShadow = '0 0 0 2px #32cd32';
    }

    // (Removed 'Remove' button for search results per UI preference)

    const title = document.createElement('span');
    title.textContent = ' ' + (it.title || it.link);
    title.style.fontSize = '1.15em';
    title.style.fontWeight = 'bold';

    // highlight if currently playing
    try {
      if (window._nowPlaying && _nowPlaying.link && it.link && normalizeLink(_nowPlaying.link) === normalizeLink(it.link)) {
        li.classList.add('playing');
        btn.style.background = 'rgba(50,205,50,0.32)';
        btn.style.boxShadow = '0 0 0 2px #32cd32';
      }
    } catch (e) {}

    li.appendChild(btn);
    if (addBtn) li.appendChild(addBtn);
    li.appendChild(title);
    resultsEl.appendChild(li);
  }

  // show Prev/Next buttons below list
  try {
    if (loadMoreWrap) loadMoreWrap.innerHTML = '';
    const controls = document.createElement('div');
    controls.style.display = 'flex'; controls.style.justifyContent = 'center'; controls.style.gap = '8px';
    const prev = document.createElement('button');
    prev.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><path d="M15 6l-6 6 6 6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    prev.title = 'Previous';
    prev.style.padding = '4px';
    prev.style.background = 'rgba(50,205,50,0.18)';
    prev.style.backdropFilter = 'blur(6px)';
    prev.style.webkitBackdropFilter = 'blur(6px)';
    prev.style.border = '1px solid rgba(50,205,50,0.22)';
    prev.style.borderRadius = '6px';
    prev.style.display = 'inline-flex';
    prev.style.alignItems = 'center';
    prev.style.justifyContent = 'center';
    prev.disabled = (currentPage === 0);
    prev.addEventListener('click', () => { if (currentPage > 0) { currentPage--; renderResults(false); } });

    const next = document.createElement('button');
    next.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><path d="M9 6l6 6-6 6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    next.title = 'Next';
    next.style.padding = '4px';
    next.style.background = 'rgba(50,205,50,0.18)';
    next.style.backdropFilter = 'blur(6px)';
    next.style.webkitBackdropFilter = 'blur(6px)';
    next.style.border = '1px solid rgba(50,205,50,0.22)';
    next.style.borderRadius = '6px';
    next.style.display = 'inline-flex';
    next.style.alignItems = 'center';
    next.style.justifyContent = 'center';
    next.disabled = (end >= _results.length);
    next.addEventListener('click', () => {
      if (end < _results.length) {
        currentPage++;
        // If user reaches the last loaded page, load 3 more pages
        if (currentPage + 1 > _maxPagesLoaded) {
          _maxPagesLoaded += PAGE_BATCH_SIZE;
        }
        renderResults(false);
      }
    });
    next.addEventListener('click', () => { if (end < total) { currentPage++; renderResults(false); } });
    controls.appendChild(prev); controls.appendChild(next);
    if (loadMoreWrap) loadMoreWrap.appendChild(controls);
  } catch (e) { console.error('pagination render error', e); }
}

async function playResult(idx, btnEl) {
      // Hide spinner when audio starts playing
      audio.addEventListener('playing', () => {
        if (cornerSpinner) cornerSpinner.style.display = 'none';
        // Restore play icon and highlight immediately after loading
        btnEl.innerHTML = `<svg width="38" height="38" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><polygon points="9,7 19,12 9,17" fill="#fff"/></svg>`;
        btnEl.style.background = 'rgba(50,205,50,0.32)';
        btnEl.style.boxShadow = '0 0 0 2px #32cd32';
      }, { once: true });
  const it = _results[idx];
  if (!it) return;
  try {
    // set playback context for results list
    try { window._currentPlaybackContext = { type: 'results', index: idx }; } catch (e) {}
    btnEl.disabled = true;
    // Show a white spinner while loading
    btnEl.innerHTML = `<span class='play-spinner' style="display:inline-block;width:38px;height:38px;vertical-align:middle;"><svg width='38' height='38' viewBox='0 0 38 38' xmlns='http://www.w3.org/2000/svg' stroke='#fff'><g fill='none' fill-rule='evenodd'><g transform='translate(1 1)' stroke-width='3'><circle stroke-opacity='.2' cx='18' cy='18' r='18'/><path d='M36 18c0-9.94-8.06-18-18-18'><animateTransform attributeName='transform' type='rotate' from='0 18 18' to='360 18 18' dur='0.9s' repeatCount='indefinite'/></path></g></g></svg></span>`;
    if (playerCard) playerCard.style.display = '';
    if (cornerSpinner) cornerSpinner.style.display = '';
    if (playerTitle) playerTitle.textContent = '';
    if (playerSub) playerSub.textContent = '';
    const checkRes = await fetch('/tubidy/checkmedia?link=' + encodeURIComponent(it.link));
    let json;
    if (checkRes.ok) json = await checkRes.json(); else {
      const txt = await checkRes.text();
      logDebug('checkmedia failed:', checkRes.status, txt);
      alert('Could not resolve media: ' + txt);
      return;
    }
    logDebug('checkmedia result', json);
    const media = json.media || [];
    if (media.length) {
      const upstream = media[0];
      // Check cache first (playlist or previous prefetch may have cached this item)
      try {
        const cs = await fetch('/cache/status?link=' + encodeURIComponent(it.link) + '&format=mp3');
        if (cs.ok) {
          const cj = await cs.json();
          if (cj && cj.cached && cj.key) {
            // play directly from cache
            const cacheUrl = '/cache/stream?key=' + encodeURIComponent(cj.key);
            try {
              btnEl.innerHTML = `<svg width="38" height="38" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><polygon points="9,7 19,12 9,17" fill="#fff"/></svg>`;
              audio.src = cacheUrl;
              audio.load();
              await audio.play();
              setNowPlaying({ title: it.title || extractTitleFromUrl(cacheUrl), link: it.link });
              if (progressWrap) { progressWrap.style.display = 'none'; progressBar.style.width = '0%'; }
            } catch (playErr) {
              logDebug('Playback from cache failed', playErr && playErr.message);
            }
            return;
          }
        }
      } catch (e) { logDebug('cache status check failed', e && e.message); }
      // show prepare progress UI
      if (progressWrap) { progressWrap.style.display = 'block'; progressBar.style.width = '0%'; }
      btnEl.textContent = 'Preparing...';

      const wantFormat = upstream.match(/\.mp3(\?|$)/i) ? '' : 'mp3';
      const esUrl = '/stream-status?url=' + encodeURIComponent(upstream) + (wantFormat ? '&format=' + wantFormat : '');
      const es = new EventSource(esUrl);

      es.addEventListener('progress', (ev) => {
        try {
          const d = JSON.parse(ev.data || '{}');
          const pct = d.percent != null ? d.percent : (d.downloaded ? Math.min(98, Math.round((d.downloaded / (d.total || d.downloaded)) * 100)) : 0);
          if (progressBar) progressBar.style.width = (pct || 0) + '%';
          logDebug('[stream-status progress]', d);
        } catch (e) { console.error(e); }
      });

      es.addEventListener('done', async (ev) => {
        try {
          const d = JSON.parse(ev.data || '{}');
          const id = d.id;
          logDebug('[stream-status] ready id=', id, d);
          // stop SSE
          try { es.close(); } catch (e) {}
          // set audio src to the prepared local stream
          const localUrl = '/local-stream?id=' + encodeURIComponent(id);
          btnEl.textContent = 'Playing';
          if (progressBar) progressBar.style.width = '100%';
          // start playback
          try {
            audio.src = localUrl;
            audio.load();
            await audio.play();
            sendPlaybackEvent('started', { url: upstream });
            // set now playing with title from search result
            setNowPlaying({ title: it.title || extractTitleFromUrl(upstream), link: upstream });
          } catch (playErr) {
            logDebug('Playback start error', String(playErr));
            alert('Playback failed to start: ' + (playErr && playErr.message));
          }
        } catch (e) { console.error(e); }
        // hide spinner and restore title after a short delay
        setTimeout(() => {
          if (cornerSpinner) cornerSpinner.style.display = 'none';
          if (playerTitle) playerTitle.textContent = d && d.title ? d.title : (it.title || extractTitleFromUrl(upstream));
          if (playerSub) playerSub.textContent = it.link || '';
        }, 800);
      });

      es.addEventListener('error', (ev) => {
        try {
          // Try to parse any error payload sent by the server
          let info = null;
          try { info = ev && ev.data ? JSON.parse(ev.data) : null; } catch (pe) {}
          logDebug('[stream-status] error', ev, info);
          es.close();
          const msg = (info && info.error) ? info.error : 'Failed to prepare stream (unknown error). Check server logs.';
          alert('Failed to prepare stream: ' + msg);
        } catch (e) {}
        if (cornerSpinner) cornerSpinner.style.display = 'none';
        btnEl.textContent = 'Play';
      });
    } else {
      alert('No direct media found for this item; playback is not possible.');
    }
  } catch (err) {
    console.error('play error', err);
    alert('Failed to start playback: ' + String(err));
  } finally {
    try { btnEl.textContent = 'Play'; btnEl.disabled = false; } catch (e) {}
  }
}

playTubidyBtn.addEventListener('click', () => {
  const q = queryEl.value.trim();
  if (!q) return alert('enter query');

  // reset results and paging for a new search
  _results = [];
  currentPage = 0;
  renderResults(true);

  if (searchProgressWrap) { searchProgressWrap.style.display = 'block'; searchProgressBar.style.width = '0%'; }
  logDebug('Starting streaming search for', q);

  const esUrl = '/tubidy/search-stream?q=' + encodeURIComponent(q);
  const es = new EventSource(esUrl);

  es.addEventListener('progress', (ev) => {
    try {
      const d = JSON.parse(ev.data || '{}');
      const pages = d.pagesFetched || 0;
      const kept = d.kept || 0;
      const candidates = d.candidates || 0;
      const pct = Math.min(95, Math.round((pages / 20) * 100));
      if (searchProgressBar) searchProgressBar.style.width = pct + '%';
      logDebug('[search progress]', d);
    } catch (e) { console.error(e); }
  });

  es.addEventListener('result', (ev) => {
    try {
      const d = JSON.parse(ev.data || '{}');
      const results = d.results || [];
      // Append incremental results, avoiding duplicates by link
      const existing = new Set(_results.map(r => normalizeLink(r.link)));
      let added = 0;
      for (const r of results) {
        const link = r && r.link ? normalizeLink(r.link) : null;
        if (!link) continue;
        if (existing.has(link)) continue;
        existing.add(link);
        _results.push({ title: r.title, link: r.link });
        added++;
      }
      if (added) logDebug('[search] appended', added, 'results (total)', _results.length);
      renderResults(false);
    } catch (e) { console.error(e); }
  });

  es.addEventListener('done', (ev) => {
    try { if (searchProgressBar) searchProgressBar.style.width = '100%'; logDebug('[search] done'); } catch (e) {}
    try { es.close(); } catch (e) {}
    setTimeout(() => { if (searchProgressWrap) searchProgressWrap.style.display = 'none'; if (searchProgressBar) searchProgressBar.style.width = '0%'; }, 800);
  });

  es.addEventListener('error', (err) => {
    logDebug('search stream error', err);
    try { es.close(); } catch (e) {}
    if (searchProgressWrap) searchProgressWrap.style.display = 'none';
    alert('Search failed or was interrupted. Check server logs.');
  });
});

// (Show All removed - Search now streams all results by default)

// audio element events for debugging
// Next/Previous controls and playback context helpers
function playPlaylistFrom(id, startIndex) {
  const p = playlists.find(pl => pl.id === id);
  if (!p || !p.items.length) return;
  _playlistQueue = p.items.slice();
  _playlistQueueIdx = startIndex >= 0 ? startIndex : 0;
  _playlistAutoPlaying = true;
  try { window._currentPlaybackContext = { type: 'playlist', playlistId: id, index: _playlistQueueIdx }; } catch (e) {}
  playNextInQueue();
}

async function playNextTrack() {
  try {
    const ctx = window._currentPlaybackContext || null;
    if (!ctx) { logDebug('No playback context for Next'); return; }
    if (ctx.type === 'playlist') {
      const p = playlists.find(pl => pl.id === ctx.playlistId);
      if (!p) return;
      const nextIdx = ctx.index + 1;
      if (nextIdx < p.items.length) {
        try { audio.pause(); } catch (e) {}
        await playPlaylistItem(p, nextIdx);
        try { window._currentPlaybackContext = { type: 'playlist', playlistId: ctx.playlistId, index: nextIdx }; } catch (e) {}
        // ensure playback starts (some browsers require explicit user gesture)
        try { audio.play().catch(() => {}); } catch (e) {}
      } else {
        logDebug('End of playlist');
      }
    } else if (ctx.type === 'results') {
      const nextIdx = ctx.index + 1;
      if (nextIdx < _results.length) {
        try { audio.pause(); } catch (e) {}
        const li = resultsEl.querySelector('li[data-index="' + nextIdx + '"]');
        const btn = li ? li.querySelector('button.play') : null;
        await playResult(nextIdx, btn || { disabled: false, textContent: 'Play' });
        try { window._currentPlaybackContext = { type: 'results', index: nextIdx }; } catch (e) {}
        try { audio.play().catch(() => {}); } catch (e) {}
      }
    } else if (_playlistAutoPlaying) {
      // if the automatic queue is playing, trigger end to advance
      try { audio.onended && audio.onended(); } catch (e) { playNextInQueue(); }
    }
  } catch (e) { logDebug('playNextTrack error', e && e.message); }
}

async function playPreviousTrack() {
  try {
    const ctx = window._currentPlaybackContext || null;
    if (!ctx) { logDebug('No playback context for Previous'); return; }
    if (ctx.type === 'playlist') {
      const p = playlists.find(pl => pl.id === ctx.playlistId);
      if (!p) return;
      const prevIdx = Math.max(0, ctx.index - 1);
      try { audio.pause(); } catch (e) {}
      await playPlaylistItem(p, prevIdx);
      try { window._currentPlaybackContext = { type: 'playlist', playlistId: ctx.playlistId, index: prevIdx }; } catch (e) {}
      try { audio.play().catch(() => {}); } catch (e) {}
    } else if (ctx.type === 'results') {
      const prevIdx = Math.max(0, ctx.index - 1);
      if (prevIdx >= 0 && prevIdx < _results.length) {
        try { audio.pause(); } catch (e) {}
        const li = resultsEl.querySelector('li[data-index="' + prevIdx + '"]');
        const btn = li ? li.querySelector('button.play') : null;
        await playResult(prevIdx, btn || { disabled: false, textContent: 'Play' });
        try { window._currentPlaybackContext = { type: 'results', index: prevIdx }; } catch (e) {}
        try { audio.play().catch(() => {}); } catch (e) {}
      }
    }
  } catch (e) { logDebug('playPreviousTrack error', e && e.message); }
}

// wire next/prev buttons if present
try {
  const prevBtn = document.getElementById('prevTrack');
  const nextBtn = document.getElementById('nextTrack');
  if (prevBtn) prevBtn.addEventListener('click', playPreviousTrack);
  if (nextBtn) nextBtn.addEventListener('click', playNextTrack);
} catch (e) { logDebug('wire next/prev error', e && e.message); }

// Settings panel toggle
// Settings import playlist logic
const settingsImportBtn = document.getElementById('settingsImportPlaylistBtn');
const settingsImportFile = document.getElementById('settingsImportFile');
if (settingsImportBtn && settingsImportFile) {
  settingsImportBtn.addEventListener('click', () => {
    settingsImportFile.click();
  });
  settingsImportFile.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    importPlaylistFromFile(f);
    settingsImportFile.value = null;
  });
}
try {
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const closeSettings = document.getElementById('closeSettings');
  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      try { settingsPanel.style.display = (settingsPanel.style.display === 'none' || !settingsPanel.style.display) ? 'block' : 'none'; } catch (e) {}
    });
  }
  // wire show/hide debug checkbox inside settings
  try {
    const settingsShowDebug = document.getElementById('settingsShowDebug');
    if (settingsShowDebug) {
      // initialize checkbox state from localStorage
      try { settingsShowDebug.checked = (localStorage.getItem('showDebug') === '1'); } catch (e) {}
      settingsShowDebug.addEventListener('change', (ev) => {
        try { setDebugVisible(!!ev.target.checked); } catch (e) {}
      });
    }
  } catch (e) { logDebug('settings checkbox wiring error', e && e.message); }
  if (closeSettings && settingsPanel) closeSettings.addEventListener('click', () => { settingsPanel.style.display = 'none'; });
  // close when clicking outside
  document.addEventListener('click', (ev) => {
    try {
      if (!settingsPanel) return;
      const panelRect = settingsPanel.getBoundingClientRect();
      if (settingsPanel.style.display === 'block') {
        const x = ev.clientX, y = ev.clientY;
        if (x < panelRect.left || x > panelRect.right || y < panelRect.top || y > panelRect.bottom) {
          settingsPanel.style.display = 'none';
        }
      }
    } catch (e) {}
  });
} catch (e) { logDebug('settings wiring error', e && e.message); }

audio.addEventListener('error', (e) => { logDebug('audio error', audio.error && audio.error.code, audio.error && audio.error.message); sendPlaybackEvent('error', { code: audio.error && audio.error.code, message: audio.error && audio.error.message }); });
audio.addEventListener('stalled', () => { logDebug('audio stalled'); sendPlaybackEvent('stalled'); });
audio.addEventListener('waiting', () => { logDebug('audio waiting (buffering)'); sendPlaybackEvent('waiting'); });
audio.addEventListener('playing', () => { logDebug('audio playing'); sendPlaybackEvent('playing'); });
audio.addEventListener('ended', () => {
  logDebug('audio ended');
  sendPlaybackEvent('ended');
  if (!_playlistAutoPlaying) setNowPlaying(null);
});

// throttle timeupdate to once every 5s
let _lastTimeSent = 0;
audio.addEventListener('timeupdate', () => {
  const now = Date.now();
  if (now - _lastTimeSent > 5000) {
    _lastTimeSent = now;
    sendPlaybackEvent('timeupdate', { currentTime: audio.currentTime, duration: audio.duration });
  }
});
