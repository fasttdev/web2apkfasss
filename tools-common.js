(() => {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const show = (el) => el && el.classList.remove('hidden');
  const hide = (el) => el && el.classList.add('hidden');

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

  function formatNumber(n) {
    const num = Number(n) || 0;
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(num);
  }
  function formatDuration(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function fixUrl(u) {
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return 'https://www.tikwm.com' + u;
    return u;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeFileName(name, fallback) {
    const base = (name || fallback || 'file').replace(/[\\/:*?"<>|]+/g, '_').trim();
    return (base || 'file').slice(0, 60);
  }
  function parseHtml(html) { return new DOMParser().parseFromString(html, 'text/html'); }

  const PROXIES = [
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
    (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  ];
  async function fetchViaProxy(url, accept) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept || 'text/html' }, redirect: 'follow', mode: 'cors' });
      if (res.ok) { const text = await res.text(); if (text && text.length > 200) return { text, url: res.url || url }; }
    } catch (_) {}
    for (const proxy of PROXIES) {
      try {
        const res = await fetch(proxy(url), { mode: 'cors' });
        if (!res.ok) continue;
        const text = await res.text();
        if (text && text.length > 200) return { text, url };
      } catch (_) {}
    }
    throw new Error('Gagal mengambil halaman. Coba lagi nanti.');
  }

  let toastTimer = null;
  function toast(msg, type) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg;
    el.dataset.type = type || 'info';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  /* ===== TOOL SWITCHING ===== */
  const toolCards = $$('.tool-tab');
  const panels = {};
  ['tiktok', 'pinterest', 'happymod', 'youtube', 'uc', 'google', 'playstore',
   'clone', 'imgbb', 'converter', 'tiktokstalker', 'amfinder', 'deployer', 'chat'].forEach((id) => {
    const p = document.getElementById('panel-' + id);
    if (p) panels[id] = p;
  });

  function setActiveTool(name) {
    let activeTab = null;
    toolCards.forEach((card) => {
      const active = card.dataset.tool === name;
      card.classList.toggle('active', active);
      if (active) activeTab = card;
    });
    let shown = false;
    Object.keys(panels).forEach((key) => {
      const p = panels[key]; if (!p) return;
      if (key === name) { show(p); shown = true; } else hide(p);
    });
    if (!shown && toolCards.length > 0) {
      const first = toolCards[0];
      first.classList.add('active');
      const fp = panels[first.dataset.tool];
      if (fp) show(fp);
      activeTab = first;
    }
    if (activeTab) {
      try { activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (_) {}
    }
    if (window.lucide) window.lucide.createIcons();
  }
  window.setActiveTool = setActiveTool;
  toolCards.forEach((card) => card.addEventListener('click', () => setActiveTool(card.dataset.tool)));

  /* ===== TIKTOK ===== */
  const TIKTOK_API = 'https://www.tikwm.com/api/';
  const TIKTOK_REGEX = /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/i;
  let ttLastReq = 0, ttLoading = false;
  const ttDom = {
    form: $('#tiktokForm'), url: $('#tiktokUrl'), clear: $('#clearUrl'), paste: $('#pasteUrl'),
    submit: $('#tiktokSubmit'), loading: $('#tiktokLoading'), error: $('#tiktokError'), errorText: $('#tiktokErrorText'),
    result: $('#tiktokResult'), cover: $('#ttCover'), avatar: $('#ttAvatar'), nickname: $('#ttNickname'),
    username: $('#ttUsername'), title: $('#ttTitle'), duration: $('#ttDuration'), plays: $('#ttPlays'),
    likes: $('#ttLikes'), comments: $('#ttComments'), shares: $('#ttShares'), dlHd: $('#ttDownloadHd'),
    dlSd: $('#ttDownloadSd'), dlAudio: $('#ttDownloadAudio'), reset: $('#ttReset'),
    historyField: $('#historyField'), historyList: $('#historyList')
  };
  const TT_HISTORY = 'fastdev:tools:history:v1';
  function readHist() { try { return JSON.parse(localStorage.getItem(TT_HISTORY) || '[]'); } catch (_) { return []; } }
  function writeHist(a) { try { localStorage.setItem(TT_HISTORY, JSON.stringify(a.slice(0, 6))); } catch (_) {} }
  function addHist(e) { const l = readHist().filter((x) => x.id !== e.id); l.unshift(e); writeHist(l); renderHist(); }
  function renderHist() {
    if (!ttDom.historyList) return;
    const l = readHist();
    if (l.length === 0) { hide(ttDom.historyField); return; }
    show(ttDom.historyField);
    ttDom.historyList.innerHTML = '';
    l.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'history-item';
      btn.innerHTML = '<img src="' + escapeHtml(item.cover || '') + '" alt="" loading="lazy" referrerpolicy="no-referrer"><div><b>' + escapeHtml(item.title || 'Tanpa judul') + '</b><small>@' + escapeHtml(item.author || 'user') + '</small></div><i data-lucide="chevron-right"></i>';
      btn.addEventListener('click', () => {
        ttDom.url.value = item.url || '';
        ttDom.clear.classList.remove('hidden');
        ttDom.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      ttDom.historyList.appendChild(btn);
    });
    if (window.lucide) window.lucide.createIcons();
  }
  function ttErr(m) { if (ttDom.errorText) ttDom.errorText.textContent = m; show(ttDom.error); hide(ttDom.loading); }
  function setLink(el, url, fn) {
    if (!el) return;
    if (!url) { el.classList.add('hidden'); el.removeAttribute('href'); return; }
    el.href = url; el.setAttribute('download', fn); el.classList.remove('hidden');
  }
  async function handleTT(e) {
    e.preventDefault();
    if (ttLoading) return;
    const raw = ttDom.url.value.trim();
    if (!raw) return ttErr('Tempel link TikTok dulu.');
    if (!TIKTOK_REGEX.test(raw)) return ttErr('Link tidak dikenali.');
    const now = Date.now();
    if (now - ttLastReq < 1100) return toast('Tunggu sebentar.', 'warn');
    ttLastReq = now; ttLoading = true;
    hide(ttDom.error); hide(ttDom.result); show(ttDom.loading);
    ttDom.submit.disabled = true; ttDom.submit.querySelector('span').textContent = 'Memproses…';
    try {
      const res = await fetch(TIKTOK_API + '?url=' + encodeURIComponent(raw) + '&hd=1');
      if (!res.ok) throw new Error('Server ' + res.status);
      const json = await res.json();
      if (!json || json.code !== 0 || !json.data) throw new Error(json?.msg || 'Link tidak valid.');
      const d = json.data;
      if (ttDom.cover) ttDom.cover.src = fixUrl(d.cover || '');
      if (ttDom.avatar) ttDom.avatar.src = fixUrl(d.author?.avatar || '');
      if (ttDom.nickname) ttDom.nickname.textContent = d.author?.nickname || 'Unknown';
      if (ttDom.username) ttDom.username.textContent = '@' + (d.author?.unique_id || 'user');
      if (ttDom.title) ttDom.title.textContent = d.title || 'Tanpa judul';
      if (ttDom.duration) ttDom.duration.textContent = formatDuration(d.duration || 0);
      if (ttDom.plays) ttDom.plays.textContent = formatNumber(d.play_count);
      if (ttDom.likes) ttDom.likes.textContent = formatNumber(d.digg_count);
      if (ttDom.comments) ttDom.comments.textContent = formatNumber(d.comment_count);
      if (ttDom.shares) ttDom.shares.textContent = formatNumber(d.share_count);
      setLink(ttDom.dlHd, fixUrl(d.hdplay || d.play || ''), 'tt-hd-' + (d.id || 'v') + '.mp4');
      setLink(ttDom.dlSd, fixUrl(d.play || ''), 'tt-sd-' + (d.id || 'v') + '.mp4');
      setLink(ttDom.dlAudio, fixUrl(d.music || ''), 'tt-audio-' + (d.id || 'v') + '.mp3');
      show(ttDom.result);
      toast('Berhasil.', 'success');
      addHist({ id: d.id || String(Date.now()), url: raw, title: d.title || '', author: d.author?.unique_id || '', cover: fixUrl(d.cover || '') });
      if (window.lucide) window.lucide.createIcons();
    } catch (err) { ttErr(err.message || 'Gagal.'); }
    finally { ttLoading = false; hide(ttDom.loading); ttDom.submit.disabled = false; ttDom.submit.querySelector('span').textContent = 'Ambil video'; }
  }
  if (ttDom.url) ttDom.url.addEventListener('input', () => { ttDom.clear.classList.toggle('hidden', !ttDom.url.value); hide(ttDom.error); });
  if (ttDom.clear) ttDom.clear.addEventListener('click', () => { ttDom.url.value = ''; ttDom.clear.classList.add('hidden'); hide(ttDom.result); hide(ttDom.error); });
  if (ttDom.paste) ttDom.paste.addEventListener('click', async () => {
    try { const t = await navigator.clipboard.readText(); if (!t) return toast('Clipboard kosong.', 'warn'); ttDom.url.value = t.trim(); ttDom.clear.classList.remove('hidden'); }
    catch (_) { toast('Tidak bisa baca clipboard.', 'warn'); }
  });
  if (ttDom.reset) ttDom.reset.addEventListener('click', () => { hide(ttDom.result); ttDom.url.value = ''; ttDom.clear.classList.add('hidden'); });
  if (ttDom.form) ttDom.form.addEventListener('submit', handleTT);

  /* ===== YOUTUBE ===== */
  const ytDom = {
    segBtns: $$('.yt-seg-btn'), searchForm: $('#ytSearchForm'), query: $('#ytQuery'), queryClear: $('#ytQueryClear'),
    searchSubmit: $('#ytSearchSubmit'), dlForm: $('#ytDownloadForm'), url: $('#ytUrl'), urlClear: $('#ytUrlClear'),
    dlSubmit: $('#ytDownloadSubmit'), loading: $('#ytLoading'), loadingText: $('#ytLoadingText'),
    error: $('#ytError'), errorText: $('#ytErrorText'), results: $('#ytResults'), detailCard: $('#ytDetailCard')
  };
  let ytLoading = false;
  function ytSetMode(mode) {
    if (!ytDom.segBtns || ytDom.segBtns.length === 0) return;
    ytDom.segBtns.forEach((b) => b.classList.toggle('active', b.dataset.ytmode === mode));
    if (mode === 'search') { show(ytDom.searchForm); hide(ytDom.dlForm); }
    else { hide(ytDom.searchForm); show(ytDom.dlForm); }
    hide(ytDom.error); hide(ytDom.results); hide(ytDom.detailCard);
  }
  if (ytDom.segBtns) ytDom.segBtns.forEach((b) => b.addEventListener('click', () => ytSetMode(b.dataset.ytmode)));
  if (ytDom.query) ytDom.query.addEventListener('input', () => { ytDom.queryClear.classList.toggle('hidden', !ytDom.query.value); hide(ytDom.error); });
  if (ytDom.queryClear) ytDom.queryClear.addEventListener('click', () => { ytDom.query.value = ''; ytDom.queryClear.classList.add('hidden'); });
  if (ytDom.url) ytDom.url.addEventListener('input', () => { ytDom.urlClear.classList.toggle('hidden', !ytDom.url.value); hide(ytDom.error); });
  if (ytDom.urlClear) ytDom.urlClear.addEventListener('click', () => { ytDom.url.value = ''; ytDom.urlClear.classList.add('hidden'); });

  function showYtDetail(d) {
    if (!ytDom.detailCard) return;
    hide(ytDom.results);
    ytDom.detailCard.innerHTML =
      '<div class="yt-header" style="background-image: url(\'' + escapeHtml(d.thumbnail) + '\');"></div>' +
      '<div class="yt-head-content"><h3>' + escapeHtml(d.title) + '</h3><small>Video ID: ' + escapeHtml(d.videoId) + '</small></div>' +
      '<div class="yt-detail-body"><div class="hm-section-label"><i data-lucide="video"></i> Video (MP4)</div>' +
      '<div class="yt-downloads">' + d.mp4.map(v => v.url ? '<a class="yt-dl-btn primary" href="' + escapeHtml(v.url) + '" target="_blank"><i data-lucide="download"></i><span>' + v.quality + '</span><small>' + (v.size || '—') + '</small></a>' : '<div class="yt-dl-btn disabled"><i data-lucide="x"></i><span>' + v.quality + '</span><small>N/A</small></div>').join('') + '</div>' +
      '<div class="hm-section-label" style="margin-top:8px;"><i data-lucide="music"></i> Audio (MP3)</div>' +
      '<div class="yt-downloads">' + d.mp3.map(v => v.url ? '<a class="yt-dl-btn secondary" href="' + escapeHtml(v.url) + '" target="_blank"><i data-lucide="music"></i><span>' + v.quality + '</span><small>' + (v.size || '—') + '</small></a>' : '<div class="yt-dl-btn disabled"><i data-lucide="x"></i><span>' + v.quality + '</span><small>N/A</small></div>').join('') + '</div>' +
      '<button class="ghost-btn" id="ytBack"><i data-lucide="arrow-left"></i> Kembali</button></div>';
    show(ytDom.detailCard);
    if (window.lucide) window.lucide.createIcons();
    const back = $('#ytBack');
    if (back) back.addEventListener('click', () => { hide(ytDom.detailCard); show(ytDom.results); });
  }
  async function ytDownload(videoUrl) {
    if (ytLoading) return;
    ytLoading = true;
    hide(ytDom.error); hide(ytDom.results); hide(ytDom.detailCard);
    show(ytDom.loading); ytDom.loadingText.textContent = 'Mengambil link download… (±10 detik)';
    ytDom.dlSubmit.disabled = true;
    try {
      const res = await fetch('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'download', videoId: videoUrl }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal.');
      hide(ytDom.loading); showYtDetail(data);
      toast('Link download siap.', 'success');
    } catch (err) { hide(ytDom.loading); show(ytDom.error); ytDom.errorText.textContent = err.message; }
    finally { ytLoading = false; ytDom.dlSubmit.disabled = false; }
  }
  if (ytDom.searchForm) ytDom.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ytLoading) return;
    const q = ytDom.query.value.trim();
    if (!q) return toast('Kata kunci wajib diisi.', 'error');
    ytLoading = true;
    hide(ytDom.error); hide(ytDom.detailCard); hide(ytDom.results);
    show(ytDom.loading); ytDom.loadingText.textContent = 'Mencari video…';
    ytDom.searchSubmit.disabled = true;
    try {
      const res = await fetch('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'search', query: q }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mencari.');
      hide(ytDom.loading); ytDom.results.innerHTML = '';
      if (!data.results || data.results.length === 0) ytDom.results.innerHTML = '<div class="pin-empty">Video tidak ditemukan.</div>';
      else data.results.forEach(v => {
        const card = document.createElement('div');
        card.className = 'yt-card';
        card.innerHTML = '<div class="yt-thumb"><img src="' + escapeHtml(v.thumbnail) + '" alt="" loading="lazy"><span class="yt-duration">' + escapeHtml(v.duration || '0:00') + '</span></div><div class="yt-info"><b>' + escapeHtml(v.title) + '</b><small>' + escapeHtml(v.channel?.name || '') + '</small><span>' + escapeHtml(v.views || '0') + ' • ' + escapeHtml(v.published || '') + '</span></div>';
        card.addEventListener('click', () => ytDownload(v.url));
        ytDom.results.appendChild(card);
      });
      show(ytDom.results);
      toast(data.results.length + ' video.', 'success');
    } catch (err) { hide(ytDom.loading); show(ytDom.error); ytDom.errorText.textContent = err.message; }
    finally { ytLoading = false; ytDom.searchSubmit.disabled = false; }
  });
  if (ytDom.dlForm) ytDom.dlForm.addEventListener('submit', (e) => { e.preventDefault(); const u = ytDom.url.value.trim(); if (!u) return toast('Link wajib.', 'error'); ytDownload(u); });

  /* ===== UC DRIVE ===== */
  const ucDom = {
    form: $('#ucForm'), url: $('#ucUrl'), urlClear: $('#ucUrlClear'), passcode: $('#ucPasscode'),
    submit: $('#ucSubmit'), loading: $('#ucLoading'), error: $('#ucError'), errorText: $('#ucErrorText'),
    result: $('#ucResult')
  };
  let ucLoading = false;
  function ucFormatDate(ts) {
    if (!ts) return '-';
    try { const d = new Date(Number(ts) * 1000); return isNaN(d) ? '-' : d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (_) { return '-'; }
  }
  function ucRender(data) {
    if (!ucDom.result) return;
    const files = Array.isArray(data.files) ? data.files : [];
    const authorNick = data.author?.nickname || '';
    const authorAvatar = data.author?.avatar || '';
    let filesHtml = '';
    if (files.length === 0) filesHtml = '<div class="uc-empty">Tidak ada file.</div>';
    else filesHtml = files.map(f => {
      const dl = f.download_url || f.stream_url || '';
      const isVideo = !!f.video || /\.(mp4|mkv|mov|avi|flv|webm|m4v|3gp)$/i.test(f.file_name || '');
      const thumb = f.thumbnail ? '<img class="uc-file-thumb" src="' + escapeHtml(f.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'">' : '';
      const thumbFb = '<div class="uc-file-thumb" style="' + (thumb ? 'display:none;' : '') + '"><i data-lucide="' + (isVideo ? 'video' : 'file') + '"></i></div>';
      const btn = dl ? '<a class="uc-file-btn" href="' + escapeHtml(dl) + '" target="_blank" rel="noopener noreferrer"><i data-lucide="download"></i></a>' : '<span class="uc-file-btn disabled"><i data-lucide="lock"></i></span>';
      const meta = [];
      if (f.size_formatted) meta.push(f.size_formatted);
      if (f.format_type) meta.push(f.format_type);
      if (f.video && f.video.resolution) meta.push(f.video.resolution);
      return '<div class="uc-file">' + thumb + thumbFb + '<div class="uc-file-info"><b>' + escapeHtml(f.file_name || 'File') + '</b><small>' + escapeHtml(meta.join(' · ') || '—') + '</small></div>' + btn + '</div>';
    }).join('');
    ucDom.result.innerHTML =
      '<div class="tool-result" style="margin-top:16px;"><div class="uc-summary"><div class="uc-summary-head">' +
      (authorAvatar ? '<img class="uc-summary-avatar" src="' + escapeHtml(authorAvatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">' : '') +
      '<div class="uc-summary-title"><b>' + escapeHtml(data.title || 'UC Share') + '</b>' + (authorNick ? '<small>' + escapeHtml(authorNick) + '</small>' : '') + '</div></div>' +
      '<div class="uc-summary-stats"><div><b>' + (data.total_files || files.length) + '</b><small>Files</small></div><div><b>' + escapeHtml(data.total_size_formatted || '0 B') + '</b><small>Total</small></div><div><b>' + escapeHtml(ucFormatDate(data.expired_at)) + '</b><small>Expires</small></div></div></div>' +
      '<div class="uc-file-list">' + filesHtml + '</div></div>';
    show(ucDom.result);
    if (window.lucide) window.lucide.createIcons();
  }
  if (ucDom.url) ucDom.url.addEventListener('input', () => { ucDom.urlClear.classList.toggle('hidden', !ucDom.url.value); hide(ucDom.error); });
  if (ucDom.urlClear) ucDom.urlClear.addEventListener('click', () => { ucDom.url.value = ''; ucDom.urlClear.classList.add('hidden'); });
  if (ucDom.form) ucDom.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ucLoading) return;
    const url = ucDom.url.value.trim();
    const pc = ucDom.passcode ? ucDom.passcode.value.trim() : '';
    if (!url) return toast('Link wajib.', 'error');
    ucLoading = true;
    ucDom.submit.disabled = true;
    hide(ucDom.error); hide(ucDom.result); show(ucDom.loading);
    try {
      const res = await fetch('/api/uc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, passcode: pc }) });
      const data = await res.json();
      if (!res.ok || data.status === false) throw new Error(data.error || 'Gagal.');
      hide(ucDom.loading); ucRender(data);
      toast(data.total_files + ' file.', 'success');
    } catch (err) { hide(ucDom.loading); ucDom.errorText.textContent = err.message; show(ucDom.error); }
    finally { ucLoading = false; ucDom.submit.disabled = false; }
  });

  /* ===== GOOGLE SEARCH ===== */
  const gsDom = {
    segBtns: $$('.gs-seg-btn'), form: $('#gsForm'), query: $('#gsQuery'), queryClear: $('#gsQueryClear'),
    submit: $('#gsSubmit'), loading: $('#gsLoading'), loadingText: $('#gsLoadingText'),
    error: $('#gsError'), errorText: $('#gsErrorText'), textResults: $('#gsTextResults'), imageResults: $('#gsImageResults')
  };
  let gsMode = 'text', gsLoading = false;
  function gsSetMode(m) {
    gsMode = m;
    if (!gsDom.segBtns || gsDom.segBtns.length === 0) return;
    gsDom.segBtns.forEach((b) => b.classList.toggle('active', b.dataset.gsmode === m));
    hide(gsDom.error); hide(gsDom.textResults); hide(gsDom.imageResults);
  }
  if (gsDom.segBtns) gsDom.segBtns.forEach((b) => b.addEventListener('click', () => gsSetMode(b.dataset.gsmode)));
  if (gsDom.query) gsDom.query.addEventListener('input', () => { gsDom.queryClear.classList.toggle('hidden', !gsDom.query.value); hide(gsDom.error); });
  if (gsDom.queryClear) gsDom.queryClear.addEventListener('click', () => { gsDom.query.value = ''; gsDom.queryClear.classList.add('hidden'); });
  if (gsDom.form) gsDom.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (gsLoading) return;
    const q = gsDom.query.value.trim();
    if (!q) return toast('Kata kunci wajib.', 'error');
    gsLoading = true;
    hide(gsDom.error); hide(gsDom.textResults); hide(gsDom.imageResults);
    show(gsDom.loading); gsDom.loadingText.textContent = 'Mencari…';
    gsDom.submit.disabled = true;
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, type: gsMode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal.');
      hide(gsDom.loading);
      if (gsMode === 'text') {
        gsDom.textResults.innerHTML = '';
        const r = data.results || [];
        if (r.length === 0) gsDom.textResults.innerHTML = '<div class="pin-empty">Tidak ada hasil.</div>';
        else r.forEach(item => {
          const div = document.createElement('div');
          div.className = 'gs-item';
          div.innerHTML = '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(item.title) + '</a><small>' + escapeHtml(item.url) + '</small>' + (item.snippet ? '<p>' + escapeHtml(item.snippet) + '</p>' : '');
          gsDom.textResults.appendChild(div);
        });
        show(gsDom.textResults);
        toast(r.length + ' hasil.', 'success');
      } else {
        gsDom.imageResults.innerHTML = '';
        const imgs = data.results || [];
        if (imgs.length === 0) gsDom.imageResults.innerHTML = '<div class="pin-empty" style="grid-column:1/-1;">Tidak ada gambar.</div>';
        else imgs.forEach(url => {
          const img = document.createElement('img');
          img.className = 'gs-img'; img.src = url; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
          img.onerror = () => img.style.display = 'none';
          img.addEventListener('click', () => window.open(url, '_blank'));
          gsDom.imageResults.appendChild(img);
        });
        show(gsDom.imageResults);
        toast(imgs.length + ' gambar.', 'success');
      }
    } catch (err) { hide(gsDom.loading); gsDom.errorText.textContent = err.message; show(gsDom.error); }
    finally { gsLoading = false; gsDom.submit.disabled = false; }
  });

  /* ===== PINTEREST ===== */
  const PIN_API = 'https://api.siputzx.my.id/api/s/pinterest';
  const PIN_URL_REGEX = /^(https?:\/\/)?([a-z0-9-]+\.)?pinterest\.[a-z.]+\/[^\s]+$|^(https?:\/\/)?pin\.it\/[a-z0-9]+/i;
  const pinDom = {
    modeBtns: $$('.seg-btn[data-pinmode]'), searchForm: $('#pinSearchForm'), dlForm: $('#pinDownloadForm'),
    query: $('#pinQuery'), queryClear: $('#pinQueryClear'), searchSubmit: $('#pinSearchSubmit'),
    url: $('#pinUrl'), urlClear: $('#pinUrlClear'), dlSubmit: $('#pinDownloadSubmit'),
    loading: $('#pinLoading'), loadingText: $('#pinLoadingText'), error: $('#pinError'), errorText: $('#pinErrorText'),
    results: $('#pinResults'), preview: $('#pinPreview'), previewMedia: $('#pinPreviewMedia'),
    previewTitle: $('#pinPreviewTitle'), previewDesc: $('#pinPreviewDesc'), previewMeta: $('#pinPreviewMeta'),
    dlPrimary: $('#pinDownloadPrimary'), dlAlt: $('#pinDownloadAlt'), openSource: $('#pinOpenSource'),
    back: $('#pinBack'), historyField: $('#pinHistoryField'), historyList: $('#pinHistoryList')
  };
  let pinMode = 'search', pinLoading = false, pinLastResults = [];
  const PIN_HIST = 'fastdev:tools:pinterest-history:v1';
  function pinRead() { try { return JSON.parse(localStorage.getItem(PIN_HIST) || '[]'); } catch (_) { return []; } }
  function pinWrite(a) { try { localStorage.setItem(PIN_HIST, JSON.stringify(a.slice(0, 6))); } catch (_) {} }
  function pinAddHist(e) { const l = pinRead().filter((x) => x.id !== e.id); l.unshift(e); pinWrite(l); pinRenderHist(); }
  function pinRenderHist() {
    if (!pinDom.historyList) return;
    const l = pinRead();
    if (l.length === 0) { hide(pinDom.historyField); return; }
    show(pinDom.historyField);
    pinDom.historyList.innerHTML = '';
    l.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'history-item';
      btn.innerHTML = '<img src="' + escapeHtml(item.thumb || item.image || '') + '" alt="" loading="lazy" referrerpolicy="no-referrer"><div><b>' + escapeHtml(item.title || 'Pin') + '</b><small>' + escapeHtml(item.source || 'pin') + '</small></div><i data-lucide="chevron-right"></i>';
      btn.addEventListener('click', () => {
        if (item.pinUrl) { pinDom.url.value = item.pinUrl; pinDom.urlClear.classList.remove('hidden'); pinSetMode('download'); pinPreview({ title: item.title, image: item.image, video: item.video, pinUrl: item.pinUrl }); }
      });
      pinDom.historyList.appendChild(btn);
    });
    if (window.lucide) window.lucide.createIcons();
  }
  function pinSetMode(m) {
    pinMode = m;
    if (!pinDom.modeBtns || pinDom.modeBtns.length === 0) return;
    pinDom.modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.pinmode === m));
    if (m === 'search') { show(pinDom.searchForm); hide(pinDom.dlForm); }
    else { hide(pinDom.searchForm); show(pinDom.dlForm); }
    hide(pinDom.error);
  }
  function pinShowErr(msg) { if (pinDom.errorText) pinDom.errorText.textContent = msg; show(pinDom.error); hide(pinDom.loading); }
  function pinShowLoad(t) { if (pinDom.loadingText) pinDom.loadingText.textContent = t || 'Memproses…'; show(pinDom.loading); hide(pinDom.error); }
  function pinPreview(item) {
    if (!pinDom.preview) return;
    hide(pinDom.results); hide(pinDom.error); show(pinDom.preview);
    pinDom.previewMedia.innerHTML = '';
    const isVideo = !!item.video;
    const media = isVideo ? document.createElement('video') : document.createElement('img');
    if (isVideo) { media.controls = true; media.playsInline = true; media.src = item.video; }
    else { media.loading = 'lazy'; media.referrerPolicy = 'no-referrer'; media.src = item.image; }
    pinDom.previewMedia.appendChild(media);
    const badge = document.createElement('span');
    badge.className = 'pin-preview-badge';
    badge.innerHTML = '<i data-lucide="' + (isVideo ? 'video' : 'image') + '"></i> ' + (isVideo ? 'VIDEO' : 'GAMBAR');
    pinDom.previewMedia.appendChild(badge);
    const title = item.title || 'Pinterest Media';
    pinDom.previewTitle.textContent = title;
    if (item.description) { pinDom.previewDesc.textContent = item.description; show(pinDom.previewDesc); } else hide(pinDom.previewDesc);
    pinDom.previewMeta.innerHTML = '';
    if (item.pinner && item.pinner.username) pinDom.previewMeta.innerHTML += '<span><i data-lucide="user"></i> @' + escapeHtml(item.pinner.username) + '</span>';
    pinDom.previewMeta.innerHTML += '<span><i data-lucide="file-type"></i> ' + (isVideo ? 'Video' : 'Gambar') + '</span>';
    const primary = isVideo ? item.video : item.image;
    if (primary) {
      pinDom.dlPrimary.href = primary;
      pinDom.dlPrimary.setAttribute('download', safeFileName(title, 'pin') + (isVideo ? '.mp4' : '.jpg'));
      pinDom.dlPrimary.classList.remove('hidden');
      pinDom.dlPrimary.innerHTML = '<i data-lucide="download"></i> Unduh ' + (isVideo ? 'video' : 'gambar');
    } else pinDom.dlPrimary.classList.add('hidden');
    if (isVideo && item.image) {
      pinDom.dlAlt.href = item.image;
      pinDom.dlAlt.setAttribute('download', safeFileName(title, 'pin') + '.jpg');
      pinDom.dlAlt.classList.remove('hidden');
    } else pinDom.dlAlt.classList.add('hidden');
    const pinUrl = item.pin || item.pinUrl || '';
    if (pinUrl) { pinDom.openSource.href = pinUrl; pinDom.openSource.classList.remove('hidden'); } else pinDom.openSource.classList.add('hidden');
    if (window.lucide) window.lucide.createIcons();
  }
  function renderPinResults(list) {
    if (!pinDom.results) return;
    pinDom.results.innerHTML = '';
    if (!list || list.length === 0) { pinDom.results.innerHTML = '<div class="pin-empty">Tidak ada hasil.</div>'; show(pinDom.results); return; }
    list.forEach(item => {
      const isVideo = !!item.video;
      const thumb = isVideo ? (item.image || item.video) : item.image;
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'pin-card';
      card.innerHTML = '<div class="pin-card-thumb"><img src="' + escapeHtml(thumb || '') + '" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="pin-card-type"><i data-lucide="' + (isVideo ? 'video' : 'image') + '"></i> ' + (isVideo ? 'VIDEO' : 'IMG') + '</span></div><div class="pin-card-meta"><b>' + escapeHtml(item.title || 'Pin') + '</b><small>' + escapeHtml(item.pinner?.username ? '@' + item.pinner.username : 'Pinterest') + '</small></div>';
      card.addEventListener('click', () => pinPreview(item));
      pinDom.results.appendChild(card);
    });
    show(pinDom.results);
    if (window.lucide) window.lucide.createIcons();
  }
  function parsePinHtml(html, finalUrl) {
    const rawTitle = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || '';
    const title = rawTitle.replace(/\s*\|\s*Pinterest.*$/i, '').trim();
    const vids = [...new Set(html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi) || [])].map(v => v.replace(/&amp;/g, '&')).filter(v => v.includes('pinimg.com'));
    const bestVid = vids.find(v => v.includes('720w')) || vids.find(v => v.includes('540w')) || vids[0] || null;
    const hashes = [...new Set([...html.matchAll(/\/([0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{32}\.(?:jpg|jpeg|png|webp))/gi)].map(m => m[1]))];
    const image = hashes[0] ? 'https://i.pinimg.com/originals/' + hashes[0] : null;
    return { title: title || 'Pinterest', video: bestVid, image, url: finalUrl };
  }
  if (pinDom.modeBtns) pinDom.modeBtns.forEach(b => b.addEventListener('click', () => { pinSetMode(b.dataset.pinmode); hide(pinDom.results); hide(pinDom.preview); }));
  if (pinDom.query) pinDom.query.addEventListener('input', () => { pinDom.queryClear.classList.toggle('hidden', !pinDom.query.value); hide(pinDom.error); });
  if (pinDom.queryClear) pinDom.queryClear.addEventListener('click', () => { pinDom.query.value = ''; pinDom.queryClear.classList.add('hidden'); });
  if (pinDom.url) pinDom.url.addEventListener('input', () => { pinDom.urlClear.classList.toggle('hidden', !pinDom.url.value); hide(pinDom.error); });
  if (pinDom.urlClear) pinDom.urlClear.addEventListener('click', () => { pinDom.url.value = ''; pinDom.urlClear.classList.add('hidden'); });
  if (pinDom.back) pinDom.back.addEventListener('click', () => { hide(pinDom.preview); if (pinMode === 'search' && pinLastResults.length > 0) show(pinDom.results); });
  if (pinDom.searchForm) pinDom.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pinLoading) return;
    const q = pinDom.query.value.trim();
    if (!q) return pinShowErr('Kata kunci kosong.');
    pinLoading = true;
    hide(pinDom.error); hide(pinDom.results); hide(pinDom.preview);
    pinShowLoad('Mencari di Pinterest…');
    pinDom.searchSubmit.disabled = true;
    try {
      const res = await fetch(PIN_API + '?query=' + encodeURIComponent(q));
      if (!res.ok) throw new Error('Server ' + res.status);
      const j = await res.json();
      const list = (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []).slice(0, 12).map(it => {
        const rawImg = it.image_url || it.image || it.images?.orig?.url || '';
        const cleanImg = rawImg.replace(/\/\d+x\d*([_\/])/, '/originals$1').replace(/\/\d+x\//, '/originals/');
        return { id: it.id, title: it.grid_title || it.title || '', pin: it.pin || (it.id ? 'https://www.pinterest.com/pin/' + it.id + '/' : null), image: cleanImg || null, video: it.video_url || null, pinner: { username: it.pinner?.username || '' } };
      });
      pinLastResults = list; hide(pinDom.loading); renderPinResults(list);
      toast(list.length + ' hasil.', 'success');
    } catch (err) { pinLastResults = []; pinShowErr(err.message || 'Gagal.'); }
    finally { pinLoading = false; hide(pinDom.loading); pinDom.searchSubmit.disabled = false; }
  });
  if (pinDom.dlForm) pinDom.dlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pinLoading) return;
    const url = pinDom.url.value.trim();
    if (!url) return pinShowErr('URL kosong.');
    if (!PIN_URL_REGEX.test(url)) return pinShowErr('URL tidak dikenali.');
    pinLoading = true;
    hide(pinDom.error); hide(pinDom.results); hide(pinDom.preview);
    pinShowLoad('Mengambil halaman…');
    pinDom.dlSubmit.disabled = true;
    try {
      const { text, url: finalUrl } = await fetchViaProxy(url);
      const data = parsePinHtml(text, finalUrl);
      hide(pinDom.loading);
      if (!data.video && !data.image) throw new Error('Media tidak ditemukan.');
      pinPreview({ ...data, pinUrl: data.url || url });
      pinAddHist({ id: String(data.url || url), title: data.title, source: data.video ? 'video' : 'image', pinUrl: data.url || url, image: data.image || '', video: data.video || '', thumb: data.image || '' });
      toast('Berhasil.', 'success');
    } catch (err) { pinShowErr(err.message || 'Gagal.'); }
    finally { pinLoading = false; hide(pinDom.loading); pinDom.dlSubmit.disabled = false; }
  });

  /* ===== HAPPYMOD ===== */
  const HM_TO = 'https://happymod.to', HM_NET = 'https://happymod.net';
  const HM_APK = 'https://spdn.poumod.com/HappyMod-3-4-5.apk';
  const HM_REGEX = /^https?:\/\/(www\.)?happymod\.(to|net)\/[^\s]+$/i;
  const HM_HIST = 'fastdev:tools:happymod-history:v1';
  const hmDom = {
    modeBtns: $$('.seg-btn[data-hmmode]'), searchForm: $('#hmSearchForm'), dlForm: $('#hmDownloadForm'),
    query: $('#hmQuery'), queryClear: $('#hmQueryClear'), searchSubmit: $('#hmSearchSubmit'),
    url: $('#hmUrl'), urlClear: $('#hmUrlClear'), dlSubmit: $('#hmDownloadSubmit'),
    loading: $('#hmLoading'), loadingText: $('#hmLoadingText'), error: $('#hmError'), errorText: $('#hmErrorText'),
    results: $('#hmResults'), detail: $('#hmDetail'), historyField: $('#hmHistoryField'), historyList: $('#hmHistoryList')
  };
  let hmMode = 'search', hmLoading = false, hmResults = [];
  function hmRead() { try { return JSON.parse(localStorage.getItem(HM_HIST) || '[]'); } catch (_) { return []; } }
  function hmWrite(a) { try { localStorage.setItem(HM_HIST, JSON.stringify(a.slice(0, 6))); } catch (_) {} }
  function hmAddHist(e) { const l = hmRead().filter(x => x.id !== e.id); l.unshift(e); hmWrite(l); hmRenderHist(); }
  function hmRenderHist() {
    if (!hmDom.historyList) return;
    const l = hmRead();
    if (l.length === 0) { hide(hmDom.historyField); return; }
    show(hmDom.historyField);
    hmDom.historyList.innerHTML = '';
    l.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'history-item';
      btn.innerHTML = '<img src="' + escapeHtml(item.icon || '') + '" alt="" loading="lazy" referrerpolicy="no-referrer"><div><b>' + escapeHtml(item.title || 'App') + '</b><small>' + escapeHtml(item.version || '') + '</small></div><i data-lucide="chevron-right"></i>';
      btn.addEventListener('click', () => { if (item.url) { hmDom.url.value = item.url; hmDom.urlClear.classList.remove('hidden'); hmSetMode('download'); hmDom.dlForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } });
      hmDom.historyList.appendChild(btn);
    });
    if (window.lucide) window.lucide.createIcons();
  }
  function hmSetMode(m) {
    hmMode = m;
    if (!hmDom.modeBtns || hmDom.modeBtns.length === 0) return;
    hmDom.modeBtns.forEach(b => b.classList.toggle('active', b.dataset.hmmode === m));
    if (m === 'search') { show(hmDom.searchForm); hide(hmDom.dlForm); }
    else { hide(hmDom.searchForm); show(hmDom.dlForm); }
    hide(hmDom.error);
  }
  function hmShowErr(msg) { if (hmDom.errorText) hmDom.errorText.textContent = msg; show(hmDom.error); hide(hmDom.loading); }
  function hmShowLoad(t) { if (hmDom.loadingText) hmDom.loadingText.textContent = t || 'Memproses…'; show(hmDom.loading); hide(hmDom.error); }
  async function hmSearch(q, lim) {
    const res = [];
    try {
      const { text } = await fetchViaProxy(HM_TO + '/search.html?q=' + encodeURIComponent(q));
      const doc = parseHtml(text);
      doc.querySelectorAll('.pdt-app-box').forEach(el => {
        const t = el.querySelector('h3 a, .pdt-app-h3 a, a.pdt-app-img');
        const title = ((t?.textContent) || '').trim();
        const link = (t?.getAttribute('href')) || '';
        const img = el.querySelector('img');
        const icon = img ? (img.getAttribute('data-original') || img.getAttribute('data-src') || img.getAttribute('src')) : null;
        const rating = el.querySelector('.a-search-num')?.textContent.trim() || null;
        if (title && link) res.push({ title, rating, icon: icon ? (icon.startsWith('http') ? icon : HM_TO + icon) : null, url: link.startsWith('http') ? link : HM_TO + link });
      });
    } catch (_) {}
    if (res.length === 0) {
      try {
        const { text } = await fetchViaProxy(HM_NET + '/search.html?q=' + encodeURIComponent(q));
        const doc = parseHtml(text);
        doc.querySelectorAll('.list-item, .app-item, .box-item').forEach(el => {
          const t = el.querySelector('.list-info-title, h3, a.title');
          const title = t ? t.textContent.trim() : '';
          const a = el.querySelector('a');
          const link = a ? a.getAttribute('href') : '';
          const img = el.querySelector('img');
          const icon = img ? (img.getAttribute('data-src') || img.getAttribute('src')) : null;
          const rating = el.querySelector('.star, .rate, .score')?.textContent.trim() || null;
          if (title && link && !link.includes('download.html')) res.push({ title, rating, icon: icon ? (icon.startsWith('http') ? icon : HM_NET + icon) : null, url: link.startsWith('http') ? link : HM_NET + link });
        });
      } catch (_) {}
    }
    const seen = new Set(); const out = [];
    for (const it of res) { if (!seen.has(it.url)) { seen.add(it.url); out.push(it); } }
    return out.slice(0, lim || 12);
  }
  function hmRenderResults(list) {
    if (!hmDom.results) return;
    hmDom.results.innerHTML = '';
    if (!list || list.length === 0) { hmDom.results.innerHTML = '<div class="pin-empty">Tidak ada hasil.</div>'; show(hmDom.results); return; }
    list.forEach(item => {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'hm-card';
      card.innerHTML = '<div class="hm-card-icon">' + (item.icon ? '<img src="' + escapeHtml(item.icon) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '</div><div class="hm-card-body"><b>' + escapeHtml(item.title) + '</b><small><i data-lucide="star"></i> ' + escapeHtml(item.rating || 'N/A') + '</small></div>';
      card.addEventListener('click', () => hmDetail(item.url));
      hmDom.results.appendChild(card);
    });
    show(hmDom.results);
    if (window.lucide) window.lucide.createIcons();
  }
  async function hmDetail(url) {
    if (hmLoading) return;
    hmLoading = true;
    hide(hmDom.results); hide(hmDom.detail); hmShowLoad('Mengambil detail…');
    try {
      const { text } = await fetchViaProxy(url);
      const doc = parseHtml(text);
      let title = doc.querySelector('h1')?.textContent.trim() || doc.title.split('|')[0].trim();
      const icon = doc.querySelector('img')?.getAttribute('src') || null;
      hide(hmDom.loading);
      hmDom.detail.innerHTML =
        '<div class="hm-detail-head"><div class="hm-detail-icon">' + (icon ? '<img src="' + escapeHtml(icon.startsWith('http') ? icon : HM_TO + icon) + '" alt="">' : '') + '</div><div class="hm-detail-meta"><h3>' + escapeHtml(title) + '</h3><small><i data-lucide="external-link"></i> ' + escapeHtml(url) + '</small></div></div>' +
        '<div class="hm-detail-body"><div class="hm-downloads"><a class="hm-download-btn secondary" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i> Buka di HappyMod</a><a class="hm-download-btn secondary" href="' + HM_APK + '" target="_blank" rel="noopener noreferrer"><i data-lucide="smartphone"></i> HappyMod Client</a></div>' +
        '<div class="hm-note"><b>Catatan:</b> Unduhan langsung dibatasi oleh server HappyMod. Buka halaman aslinya untuk link download.</div>' +
        '<button class="ghost-btn" id="hmBack"><i data-lucide="arrow-left"></i> Kembali</button></div>';
      show(hmDom.detail);
      if (window.lucide) window.lucide.createIcons();
      const back = $('#hmBack');
      if (back) back.addEventListener('click', () => { hide(hmDom.detail); if (hmResults.length) show(hmDom.results); });
      hmAddHist({ id: url, title, url });
      toast('Detail dimuat.', 'success');
    } catch (err) { hmShowErr(err.message || 'Gagal.'); }
    finally { hmLoading = false; hide(hmDom.loading); }
  }
  if (hmDom.modeBtns) hmDom.modeBtns.forEach(b => b.addEventListener('click', () => { hmSetMode(b.dataset.hmmode); hide(hmDom.results); hide(hmDom.detail); }));
  if (hmDom.query) hmDom.query.addEventListener('input', () => { hmDom.queryClear.classList.toggle('hidden', !hmDom.query.value); hide(hmDom.error); });
  if (hmDom.queryClear) hmDom.queryClear.addEventListener('click', () => { hmDom.query.value = ''; hmDom.queryClear.classList.add('hidden'); });
  if (hmDom.url) hmDom.url.addEventListener('input', () => { hmDom.urlClear.classList.toggle('hidden', !hmDom.url.value); hide(hmDom.error); });
  if (hmDom.urlClear) hmDom.urlClear.addEventListener('click', () => { hmDom.url.value = ''; hmDom.urlClear.classList.add('hidden'); });
  if (hmDom.searchForm) hmDom.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (hmLoading) return;
    const q = hmDom.query.value.trim();
    if (!q) return hmShowErr('Kata kunci kosong.');
    hmLoading = true;
    hide(hmDom.error); hide(hmDom.results); hide(hmDom.detail); hmShowLoad('Mencari…');
    hmDom.searchSubmit.disabled = true;
    try {
      hmResults = await hmSearch(q, 12);
      hide(hmDom.loading); hmRenderResults(hmResults);
      toast(hmResults.length + ' hasil.', 'success');
    } catch (err) { hmResults = []; hmShowErr(err.message || 'Gagal.'); }
    finally { hmLoading = false; hide(hmDom.loading); hmDom.searchSubmit.disabled = false; }
  });
  if (hmDom.dlForm) hmDom.dlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (hmLoading) return;
    const url = hmDom.url.value.trim();
    if (!url) return hmShowErr('URL kosong.');
    if (!HM_REGEX.test(url)) return hmShowErr('URL tidak dikenali.');
    await hmDetail(url);
  });

  /* ===== PLAYSTORE ===== */
  const psDom = {
    segBtns: $$('.ps-seg-btn'), searchForm: $('#psSearchForm'), detailForm: $('#psDetailForm'),
    query: $('#psQuery'), queryClear: $('#psQueryClear'), searchSubmit: $('#psSearchSubmit'),
    appId: $('#psAppId'), appIdClear: $('#psAppIdClear'), detailSubmit: $('#psDetailSubmit'),
    loading: $('#psLoading'), loadingText: $('#psLoadingText'), error: $('#psError'), errorText: $('#psErrorText'),
    results: $('#psResults'), detailCard: $('#psDetailCard')
  };
  let psLoading = false;
  function psSetMode(m) {
    if (!psDom.segBtns || psDom.segBtns.length === 0) return;
    psDom.segBtns.forEach(b => b.classList.toggle('active', b.dataset.psmode === m));
    if (m === 'search') { show(psDom.searchForm); hide(psDom.detailForm); } else { hide(psDom.searchForm); show(psDom.detailForm); }
    hide(psDom.error); hide(psDom.results); hide(psDom.detailCard);
  }
  function showPsDetail(app) {
    if (!psDom.detailCard) return;
    hide(psDom.results);
    psDom.detailCard.innerHTML =
      '<div class="ps-header" style="background-image: url(\'' + escapeHtml(app.headerImage || app.icon) + '\');"></div>' +
      '<div class="ps-head-content"><img class="ps-detail-icon" src="' + escapeHtml(app.icon) + '" alt=""><div class="ps-head-info"><h3>' + escapeHtml(app.title) + '</h3><small>' + escapeHtml(app.developer.name) + '</small></div></div>' +
      '<div class="ps-detail-body"><div class="ps-stats-row"><div class="ps-stat"><b>' + escapeHtml(app.scoreText) + '</b><small>Rating</small></div><div class="ps-stat"><b>' + escapeHtml(app.installs) + '</b><small>Install</small></div><div class="ps-stat"><b>' + escapeHtml(app.size || '-') + '</b><small>Size</small></div></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);"><span><b>Versi:</b> ' + escapeHtml(app.version) + '</span><span><b>Kategori:</b> ' + escapeHtml(app.genre) + '</span></div>' +
      '<p class="ps-desc">' + escapeHtml(app.description) + '</p>' +
      '<div class="ps-links"><a class="primary" href="' + escapeHtml(app.links.playStore) + '" target="_blank" rel="noopener"><i data-lucide="play"></i> Play Store</a><a href="' + escapeHtml(app.links.apkPure) + '" target="_blank" rel="noopener"><i data-lucide="download"></i> APKPure</a><a href="' + escapeHtml(app.links.apkCombo) + '" target="_blank" rel="noopener"><i data-lucide="download"></i> APKCombo</a></div>' +
      '<button class="ghost-btn" id="psBack"><i data-lucide="arrow-left"></i> Kembali</button></div>';
    show(psDom.detailCard);
    if (window.lucide) window.lucide.createIcons();
    const back = $('#psBack');
    if (back) back.addEventListener('click', () => { hide(psDom.detailCard); show(psDom.results); });
  }
  if (psDom.segBtns) psDom.segBtns.forEach(b => b.addEventListener('click', () => psSetMode(b.dataset.psmode)));
  if (psDom.query) psDom.query.addEventListener('input', () => { psDom.queryClear.classList.toggle('hidden', !psDom.query.value); hide(psDom.error); });
  if (psDom.queryClear) psDom.queryClear.addEventListener('click', () => { psDom.query.value = ''; psDom.queryClear.classList.add('hidden'); });
  if (psDom.appId) psDom.appId.addEventListener('input', () => { psDom.appIdClear.classList.toggle('hidden', !psDom.appId.value); hide(psDom.error); });
  if (psDom.appIdClear) psDom.appIdClear.addEventListener('click', () => { psDom.appId.value = ''; psDom.appIdClear.classList.add('hidden'); });
  if (psDom.searchForm) psDom.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (psLoading) return;
    const q = psDom.query.value.trim();
    if (!q) return toast('Kata kunci wajib.', 'error');
    psLoading = true;
    hide(psDom.error); hide(psDom.detailCard); hide(psDom.results);
    show(psDom.loading); psDom.loadingText.textContent = 'Mencari aplikasi…';
    psDom.searchSubmit.disabled = true;
    try {
      const res = await fetch('/api/playstore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'search', query: q }) });
      const data = await res.json();
      if (!res.ok || !data.status) throw new Error(data.error || 'Gagal.');
      hide(psDom.loading); psDom.results.innerHTML = '';
      if (!data.results || data.results.length === 0) psDom.results.innerHTML = '<div class="pin-empty">Tidak ditemukan.</div>';
      else data.results.forEach(app => {
        const card = document.createElement('button');
        card.type = 'button'; card.className = 'ps-card';
        card.innerHTML = '<img class="ps-card-icon" src="' + escapeHtml(app.icon) + '" alt="" loading="lazy"><div class="ps-card-body"><b>' + escapeHtml(app.title) + '</b><small>' + escapeHtml(app.developer.name) + '</small><div class="ps-card-stats"><span><i data-lucide="star" style="fill:#f5b85c;stroke:none;"></i> ' + escapeHtml(app.scoreText) + '</span><span><i data-lucide="download"></i> ' + escapeHtml(app.installs) + '</span></div></div>';
        card.addEventListener('click', () => showPsDetail(app));
        psDom.results.appendChild(card);
      });
      show(psDom.results);
      toast((data.total || 0) + ' hasil.', 'success');
      if (window.lucide) window.lucide.createIcons();
    } catch (err) { hide(psDom.loading); psDom.errorText.textContent = err.message; show(psDom.error); }
    finally { psLoading = false; psDom.searchSubmit.disabled = false; }
  });
  if (psDom.detailForm) psDom.detailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (psLoading) return;
    const id = psDom.appId.value.trim();
    if (!id) return toast('App ID wajib.', 'error');
    psLoading = true;
    hide(psDom.error); hide(psDom.results); hide(psDom.detailCard);
    show(psDom.loading); psDom.loadingText.textContent = 'Mengambil detail…';
    psDom.detailSubmit.disabled = true;
    try {
      const res = await fetch('/api/playstore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'detail', appId: id }) });
      const data = await res.json();
      if (!res.ok || !data.status) throw new Error(data.error || 'Gagal.');
      hide(psDom.loading); showPsDetail(data.data);
      toast('Detail dimuat.', 'success');
    } catch (err) { hide(psDom.loading); psDom.errorText.textContent = err.message; show(psDom.error); }
    finally { psLoading = false; psDom.detailSubmit.disabled = false; }
  });

  /* ===== CLONE ===== */
  const cloneDom = {
    form: $('#cloneForm'), url: $('#cloneUrl'), urlClear: $('#cloneUrlClear'), submit: $('#cloneSubmit'),
    loading: $('#cloneLoading'), error: $('#cloneError'), errorText: $('#cloneErrorText'),
    result: $('#cloneResult'), message: $('#cloneMessage'), fileCount: $('#cloneFileCount'),
    size: $('#cloneSize'), downloadLink: $('#cloneDownloadLink')
  };
  let cloneLoading = false;
  if (cloneDom.url) cloneDom.url.addEventListener('input', () => { cloneDom.urlClear.classList.toggle('hidden', !cloneDom.url.value); hide(cloneDom.error); });
  if (cloneDom.urlClear) cloneDom.urlClear.addEventListener('click', () => { cloneDom.url.value = ''; cloneDom.urlClear.classList.add('hidden'); });
  if (cloneDom.form) cloneDom.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (cloneLoading) return;
    let target = cloneDom.url.value.trim();
    if (!target) return toast('URL target wajib.', 'error');
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
    cloneLoading = true; cloneDom.submit.disabled = true;
    hide(cloneDom.error); hide(cloneDom.result); show(cloneDom.loading);
    try {
      const API_URL = 'https://copywebsitetarget.netlify.app/api/extract';
      const FALLBACK = 'https://copywebsitetarget.netlify.app/.netlify/functions/extract';
      const headers = { 'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': 'https://copywebsitetarget.netlify.app', 'Referer': 'https://copywebsitetarget.netlify.app/' };
      let r = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ url: target }) });
      if (r.status === 404) r = await fetch(FALLBACK, { method: 'POST', headers, body: JSON.stringify({ url: target }) });
      const raw = await r.text();
      let data; try { data = JSON.parse(raw); } catch (_) { throw new Error('Respons tidak valid (' + r.status + ').'); }
      if (!r.ok || !data.success) throw new Error(data.error || 'Gagal.');
      const files = Array.isArray(data.files) ? data.files : [];
      const zip = new JSZip();
      files.forEach(f => {
        const p = f.path || f.name || 'file.bin';
        if (f.isBinary && f.dataUrl) zip.file(p, f.dataUrl.split(',')[1] || '', { base64: true });
        else if (f.content !== undefined) zip.file(p, f.content);
        else zip.file(p, '');
      });
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const dlUrl = URL.createObjectURL(blob);
      const domain = (data.domain || 'website').replace(/[^a-zA-Z0-9.-]/g, '_');
      hide(cloneDom.loading); show(cloneDom.result);
      cloneDom.message.textContent = 'Website ' + domain + ' berhasil dikloning.';
      cloneDom.fileCount.textContent = data.totalFiles || files.length;
      cloneDom.size.textContent = ((data.totalSize || 0) / 1048576).toFixed(2) + ' MB';
      cloneDom.downloadLink.href = dlUrl;
      cloneDom.downloadLink.setAttribute('download', domain + '_dump.zip');
      toast('Clone berhasil.', 'success');
    } catch (err) { hide(cloneDom.loading); cloneDom.errorText.textContent = err.message || 'Gagal.'; show(cloneDom.error); }
    finally { cloneLoading = false; cloneDom.submit.disabled = false; }
  });

  /* ===== IMGBB ===== */
  const ibDom = {
    segBtns: $$('.ib-seg-btn[data-ibmode]'), form: $('#ibForm'), fileField: $('#ibFileField'), fileInput: $('#ibFile'),
    fileName: $('#ibFileName'), urlField: $('#ibUrlField'), urlInput: $('#ibUrl'), urlClear: $('#ibUrlClear'),
    expInput: $('#ibExp'), submit: $('#ibSubmit'), loading: $('#ibLoading'), error: $('#ibError'), errorText: $('#ibErrorText'),
    result: $('#ibResult'), message: $('#ibMessage'), preview: $('#ibPreview'),
    directLink: $('#ibDirectLink'), viewerLink: $('#ibViewerLink'), deleteLink: $('#ibDeleteLink')
  };
  let ibMode = 'file', ibLoading = false;
  function ibSetMode(m) {
    ibMode = m;
    if (!ibDom.segBtns || ibDom.segBtns.length === 0) return;
    ibDom.segBtns.forEach(b => b.classList.toggle('active', b.dataset.ibmode === m));
    if (m === 'file') { show(ibDom.fileField); hide(ibDom.urlField); } else { hide(ibDom.fileField); show(ibDom.urlField); }
    hide(ibDom.error);
  }
  if (ibDom.segBtns) ibDom.segBtns.forEach(b => b.addEventListener('click', () => ibSetMode(b.dataset.ibmode)));
  if (ibDom.urlInput) ibDom.urlInput.addEventListener('input', () => { ibDom.urlClear.classList.toggle('hidden', !ibDom.urlInput.value); hide(ibDom.error); });
  if (ibDom.urlClear) ibDom.urlClear.addEventListener('click', () => { ibDom.urlInput.value = ''; ibDom.urlClear.classList.add('hidden'); });
  if (ibDom.fileInput) ibDom.fileInput.addEventListener('change', () => { const f = ibDom.fileInput.files?.[0]; if (ibDom.fileName) ibDom.fileName.textContent = f ? f.name : 'PNG, JPG, WEBP (Max 3MB)'; });
  if (ibDom.form) ibDom.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ibLoading) return;
    let source = '';
    if (ibMode === 'file') {
      const file = ibDom.fileInput.files?.[0];
      if (!file) return toast('Pilih file.', 'error');
      if (file.size > 3 * 1024 * 1024) return toast('Max 3MB.', 'error');
      source = await new Promise(res => { const rd = new FileReader(); rd.onload = e => res(e.target.result); rd.readAsDataURL(file); });
    } else {
      source = ibDom.urlInput.value.trim();
      if (!source) return toast('URL wajib.', 'error');
    }
    ibLoading = true; ibDom.submit.disabled = true;
    hide(ibDom.error); hide(ibDom.result); show(ibDom.loading);
    try {
      const res = await fetch('/api/imgbb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: ibMode, source, expiration: ibDom.expInput.value }) });
      const data = await res.json();
      if (!res.ok || !data.status) throw new Error(data.error || 'Gagal.');
      hide(ibDom.loading); show(ibDom.result);
      ibDom.message.textContent = 'Berhasil! Expiration: ' + data.expirationCode;
      ibDom.preview.src = data.directUrl;
      ibDom.directLink.href = data.directUrl;
      ibDom.viewerLink.href = data.viewerUrl;
      ibDom.deleteLink.href = data.deleteUrl;
      toast('Upload sukses.', 'success');
    } catch (err) { hide(ibDom.loading); ibDom.errorText.textContent = err.message; show(ibDom.error); }
    finally { ibLoading = false; ibDom.submit.disabled = false; }
  });

  /* ===== CONVERTER ===== */
  const cvDom = {
    segBtns: $$('.ib-seg-btn[data-cvmode]'), form: $('#cvForm'), urlField: $('#cvUrlField'), urlInput: $('#cvUrl'),
    urlClear: $('#cvUrlClear'), fileField: $('#cvFileField'), fileInput: $('#cvFile'), fileName: $('#cvFileName'),
    format: $('#cvFormat'), submit: $('#cvSubmit'), loading: $('#cvLoading'), error: $('#cvError'),
    errorText: $('#cvErrorText'), result: $('#cvResult'), message: $('#cvMessage'),
    metaName: $('#cvMetaName'), metaFormat: $('#cvMetaFormat'), metaSize: $('#cvMetaSize'), downloadLink: $('#cvDownloadLink')
  };
  let cvMode = 'url', cvLoading = false;
  function cvSetMode(m) {
    cvMode = m;
    if (!cvDom.segBtns || cvDom.segBtns.length === 0) return;
    cvDom.segBtns.forEach(b => b.classList.toggle('active', b.dataset.cvmode === m));
    if (m === 'url') { show(cvDom.urlField); hide(cvDom.fileField); } else { hide(cvDom.urlField); show(cvDom.fileField); }
    hide(cvDom.error);
  }
  if (cvDom.segBtns) cvDom.segBtns.forEach(b => b.addEventListener('click', () => cvSetMode(b.dataset.cvmode)));
  if (cvDom.urlInput) cvDom.urlInput.addEventListener('input', () => { cvDom.urlClear.classList.toggle('hidden', !cvDom.urlInput.value); hide(cvDom.error); });
  if (cvDom.urlClear) cvDom.urlClear.addEventListener('click', () => { cvDom.urlInput.value = ''; cvDom.urlClear.classList.add('hidden'); });
  if (cvDom.fileInput) cvDom.fileInput.addEventListener('change', () => { const f = cvDom.fileInput.files?.[0]; if (cvDom.fileName) cvDom.fileName.textContent = f ? f.name : 'Semua format (max 3MB)'; });
  if (cvDom.form) cvDom.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (cvLoading) return;
    let input = '';
    if (cvMode === 'url') { input = cvDom.urlInput.value.trim(); if (!input) return toast('URL wajib.', 'error'); }
    else {
      const f = cvDom.fileInput.files?.[0]; if (!f) return toast('Pilih file.', 'error');
      if (f.size > 3 * 1024 * 1024) return toast('Max 3MB.', 'error');
      input = await new Promise(res => { const rd = new FileReader(); rd.onload = e => res(e.target.result); rd.readAsDataURL(f); });
    }
    cvLoading = true; cvDom.submit.disabled = true;
    hide(cvDom.error); hide(cvDom.result); show(cvDom.loading);
    try {
      const res = await fetch('/api/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input, targetFormat: cvDom.format.value }) });
      const data = await res.json();
      if (!res.ok || !data.status) throw new Error(data.error || 'Gagal.');
      hide(cvDom.loading); show(cvDom.result);
      cvDom.message.textContent = 'File berhasil dikonversi.';
      cvDom.metaName.textContent = data.fileName || '-';
      cvDom.metaFormat.textContent = data.targetFormat || '-';
      cvDom.metaSize.textContent = data.fileSize ? (data.fileSize / 1024).toFixed(1) + ' KB' : '-';
      cvDom.downloadLink.href = data.downloadUrl;
      toast('Konversi berhasil.', 'success');
    } catch (err) { hide(cvDom.loading); cvDom.errorText.textContent = err.message; show(cvDom.error); }
    finally { cvLoading = false; cvDom.submit.disabled = false; }
  });

  /* ===== TIKTOK STALKER ===== */
  const tsDom = {
    form: $('#tsForm'), username: $('#tsUsername'), clear: $('#tsClear'), submit: $('#tsSubmit'),
    loading: $('#tsLoading'), loadingText: $('#tsLoadingText'), error: $('#tsError'), errorText: $('#tsErrorText'), result: $('#tsResult')
  };
  let tsLoading = false;
  function getFlag(c) { if (!c || c.length !== 2) return '🌐'; return String.fromCodePoint(...c.toUpperCase().split('').map(x => 127397 + x.charCodeAt(0))); }
  if (tsDom.username) tsDom.username.addEventListener('input', () => { tsDom.clear.classList.toggle('hidden', !tsDom.username.value); hide(tsDom.error); });
  if (tsDom.clear) tsDom.clear.addEventListener('click', () => { tsDom.username.value = ''; tsDom.clear.classList.add('hidden'); });
  if (tsDom.form) tsDom.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (tsLoading) return;
    const u = tsDom.username.value.trim();
    if (!u) return toast('Username wajib.', 'error');
    tsLoading = true; tsDom.submit.disabled = true;
    hide(tsDom.error); hide(tsDom.result); show(tsDom.loading);
    try {
      const res = await fetch('/api/lookup?tool=tikip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Gagal.');
      hide(tsDom.loading); show(tsDom.result);
      const usr = data.user, region = data.region, stats = data.stats, avatar = data.avatar;
      let likes = stats.likes || 0; if (typeof likes === 'number' && likes < 0) likes = likes >>> 0;
      const date = usr.created_at ? new Date(usr.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }) : '-';
      tsDom.result.innerHTML = '<div class="ts-profile-card"><div class="ts-header"></div><div class="ts-avatar-wrap"><img class="ts-avatar" src="' + escapeHtml(avatar.hd || '') + '" referrerpolicy="no-referrer"></div><div class="ts-body">' +
        '<div><div class="ts-name-row"><h3>' + escapeHtml(usr.nickname || 'Unknown') + '</h3>' + (usr.verified ? '<i data-lucide="badge-check"></i>' : '') + '</div><span class="ts-username">@' + escapeHtml(usr.username || '') + '</span></div>' +
        '<p class="ts-bio">' + escapeHtml(usr.bio || 'Tidak ada bio.') + '</p>' +
        (usr.bio_link ? '<a class="ts-link" href="' + escapeHtml(usr.bio_link) + '" target="_blank" rel="noopener">' + escapeHtml(usr.bio_link) + '</a>' : '') +
        '<div class="ts-region-box"><div class="ts-region-title"><i data-lucide="map-pin"></i> Region</div><div class="ts-region-main"><span class="ts-flag">' + getFlag(region.code) + '</span><div class="ts-country"><b>' + escapeHtml(region.country || 'Unknown') + '</b><small>' + escapeHtml(region.code || '-') + '</small></div></div><div class="ts-region-details"><div class="ts-region-col"><small>Current</small><b>' + getFlag(region.current_region) + ' ' + escapeHtml(region.current_region || '-') + '</b></div><div class="ts-region-col"><small>Registered</small><b>' + getFlag(region.registered_region) + ' ' + escapeHtml(region.registered_region || '-') + '</b></div><div class="ts-region-col"><small>Locked</small><b>' + getFlag(region.locked_region) + ' ' + escapeHtml(region.locked_region || '-') + '</b></div></div></div>' +
        '<div class="ts-stats-grid"><div class="ts-stat"><b>' + formatNumber(stats.followers) + '</b><small>Followers</small></div><div class="ts-stat"><b>' + formatNumber(stats.following) + '</b><small>Following</small></div><div class="ts-stat"><b>' + formatNumber(likes) + '</b><small>Likes</small></div><div class="ts-stat"><b>' + formatNumber(stats.videos) + '</b><small>Videos</small></div></div>' +
        '<div class="ts-meta-grid"><div class="ts-meta-item"><small>Dibuat</small><b>' + date + '</b></div><div class="ts-meta-item"><small>Status</small><b>' + (usr.private ? 'Private' : 'Public') + '</b></div><div class="ts-meta-item"><small>Bahasa</small><b>' + escapeHtml(usr.language || '-') + '</b></div><div class="ts-meta-item"><small>SecUID</small><b style="font-size:9px;">' + escapeHtml(usr.sec_uid || '-') + '</b></div></div>' +
        '<a class="download-btn" href="' + escapeHtml(usr.profile_url) + '" target="_blank" rel="noopener"><i data-lucide="external-link"></i> Buka Profil</a></div></div>';
      if (window.lucide) window.lucide.createIcons();
      toast('Data ditemukan.', 'success');
    } catch (err) { hide(tsDom.loading); tsDom.errorText.textContent = err.message; show(tsDom.error); }
    finally { tsLoading = false; tsDom.submit.disabled = false; }
  });

  /* ===== AM FINDER ===== */
  const amDom = {
    form: $('#amForm'), url: $('#amUrl'), urlClear: $('#amUrlClear'), submit: $('#amSubmit'),
    loading: $('#amLoading'), loadingText: $('#amLoadingText'), error: $('#amError'), errorText: $('#amErrorText'), result: $('#amResult')
  };
  let amLoading = false;
  if (amDom.url) amDom.url.addEventListener('input', () => { amDom.urlClear.classList.toggle('hidden', !amDom.url.value); hide(amDom.error); });
  if (amDom.urlClear) amDom.urlClear.addEventListener('click', () => { amDom.url.value = ''; amDom.urlClear.classList.add('hidden'); });
  if (amDom.form) amDom.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (amLoading) return;
    const url = amDom.url.value.trim();
    if (!url) return toast('URL wajib.', 'error');
    amLoading = true; amDom.submit.disabled = true;
    hide(amDom.error); hide(amDom.result); show(amDom.loading);
    try {
      const res = await fetch('/api/lookup?tool=amfinder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal.');
      hide(amDom.loading); show(amDom.result);
      const { video = {}, author = {}, scanned = {}, presets = [] } = data;
      let presetsHtml = presets.length === 0 ? '<div class="pin-empty">Tidak ada preset ditemukan.</div>' :
        presets.map(p => {
          const t = p.type === '5mb' ? '5MB' : 'XML';
          const bc = p.type === '5mb' ? '' : 'xml';
          const title = p.title || ('Preset ' + t);
          const sz = p.size ? ' • ' + p.size : '';
          return '<div class="am-preset-item"><img class="am-preset-thumb" src="' + escapeHtml(p.thumb || video.cover || '') + '" onerror="this.style.display=\'none\'"><div class="am-preset-info"><b>' + escapeHtml(title) + '</b><small><span class="am-preset-badge ' + bc + '">' + t + '</span>' + escapeHtml(p.source || '') + escapeHtml(sz) + '</small></div><a class="am-preset-btn" href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener"><i data-lucide="external-link"></i></a></div>';
        }).join('');
      amDom.result.innerHTML = '<div class="am-video-card"><img class="am-cover" src="' + escapeHtml(video.cover || '') + '" onerror="this.style.display=\'none\'"><div class="am-video-body"><h3 class="am-video-title">' + escapeHtml(video.title || 'Unknown') + '</h3><p class="am-video-desc">' + escapeHtml(video.description || '') + '</p><div class="am-author-row"><img class="am-author-avatar" src="' + escapeHtml(author.avatar || '') + '" onerror="this.style.display=\'none\'"><div class="am-author-info"><b>' + escapeHtml(author.nickname || 'Unknown') + '</b><small>@' + escapeHtml(author.uniqueId || '') + '</small></div></div><div class="am-stats-row"><div class="am-stat"><b>' + (formatNumber(video.views) || '-') + '</b><small>Views</small></div><div class="am-stat"><b>' + (formatNumber(video.likes) || '-') + '</b><small>Likes</small></div><div class="am-stat"><b>' + (scanned.comments || 0) + '</b><small>Komentar</small></div><div class="am-stat"><b>' + (scanned.replies || 0) + '</b><small>Balasan</small></div></div><div class="hm-section-label" style="margin-top:8px;"><i data-lucide="layers"></i> ' + presets.length + ' Preset</div><div class="am-preset-list">' + presetsHtml + '</div></div></div>';
      if (window.lucide) window.lucide.createIcons();
      toast('Selesai.', 'success');
    } catch (err) { hide(amDom.loading); amDom.errorText.textContent = err.message; show(amDom.error); }
    finally { amLoading = false; amDom.submit.disabled = false; }
  });

  /* ===== DEPLOYER ===== */
  const depDom = {
    form: $('#deployForm'), name: $('#depName'), tabs: $$('.dep-tab'),
    pasteArea: $('#depPasteArea'), fileArea: $('#depFileArea'), htmlCode: $('#depHtmlCode'),
    htmlFile: $('#depHtmlFile'), htmlFileName: $('#depHtmlFileName'), iconFile: $('#depIconFile'),
    iconFileName: $('#depIconFileName'), submit: $('#deploySubmit'), loading: $('#deployLoading'),
    error: $('#deployError'), errorText: $('#deployErrorText'), result: $('#deployResult'), link: $('#deployLink')
  };
  let depMode = 'paste', depLoading = false;
  function setDepMode(m) {
    depMode = m;
    if (!depDom.tabs || depDom.tabs.length === 0) return;
    depDom.tabs.forEach(t => t.classList.toggle('active', t.dataset.deptab === m));
    if (m === 'paste') { show(depDom.pasteArea); hide(depDom.fileArea); } else { hide(depDom.pasteArea); show(depDom.fileArea); }
  }
  if (depDom.tabs) depDom.tabs.forEach(t => t.addEventListener('click', () => setDepMode(t.dataset.deptab)));
  if (depDom.htmlFile) depDom.htmlFile.addEventListener('change', () => { const f = depDom.htmlFile.files?.[0]; if (depDom.htmlFileName) depDom.htmlFileName.textContent = f ? f.name : 'Belum ada'; });
  if (depDom.iconFile) depDom.iconFile.addEventListener('change', () => { const f = depDom.iconFile.files?.[0]; if (depDom.iconFileName) depDom.iconFileName.textContent = f ? f.name : 'PNG atau ICO'; });
  if (depDom.form) depDom.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (depLoading) return;
    const name = depDom.name.value.trim();
    if (!name) return toast('Nama wajib.', 'error');
    let htmlContent = '';
    if (depMode === 'paste') { htmlContent = depDom.htmlCode.value.trim(); if (!htmlContent) return toast('HTML kosong.', 'error'); }
    else { const f = depDom.htmlFile.files?.[0]; if (!f) return toast('Pilih file.', 'error'); htmlContent = await f.text(); }
    let iconBase64 = null;
    const icon = depDom.iconFile.files?.[0];
    if (icon) iconBase64 = await new Promise(res => { const rd = new FileReader(); rd.onload = e => res(e.target.result); rd.readAsDataURL(icon); });
    depLoading = true; depDom.submit.disabled = true;
    hide(depDom.error); hide(depDom.result); show(depDom.loading);
    try {
      const res = await fetch('/api/deploy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName: name, htmlContent, iconBase64 }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal.');
      hide(depDom.loading); show(depDom.result); depDom.link.href = data.url;
      toast('Deploy berhasil.', 'success');
    } catch (err) { hide(depDom.loading); depDom.errorText.textContent = err.message; show(depDom.error); }
    finally { depLoading = false; depDom.submit.disabled = false; }
  });

  /* ===== CHAT ===== */
  const chatDom = {
    form: $('#chatForm'), input: $('#chatInput'), send: $('#chatSend'), clear: $('#chatClear'),
    messages: $('#chatMessages'), empty: $('#chatEmpty'), suggestions: $('#chatSuggestions')
  };
  const chatState = { history: [], loading: false };
  function chatScroll() { if (chatDom.messages) chatDom.messages.scrollTop = chatDom.messages.scrollHeight; }
  function chatResize() { const el = chatDom.input; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
  function chatHideEmpty() { if (chatDom.empty) chatDom.empty.style.display = 'none'; if (chatDom.suggestions) chatDom.suggestions.style.display = 'none'; }
  function chatAppend(role, text) {
    const msg = document.createElement('div'); msg.className = 'chat-msg ' + role;
    msg.innerHTML = '<div class="chat-avatar"><i data-lucide="' + (role === 'user' ? 'user' : 'bot') + '"></i></div><div class="chat-bubble">' + escapeHtml(text || '') + '</div>';
    chatDom.messages.appendChild(msg); if (window.lucide) window.lucide.createIcons(); chatScroll();
    return msg.querySelector('.chat-bubble');
  }
  function chatTyping() { const msg = document.createElement('div'); msg.className = 'chat-msg assistant'; msg.id = 'chat-typing'; msg.innerHTML = '<div class="chat-avatar"><i data-lucide="bot"></i></div><div class="chat-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>'; chatDom.messages.appendChild(msg); if (window.lucide) window.lucide.createIcons(); chatScroll(); }
  function chatRemoveTyping() { document.getElementById('chat-typing')?.remove(); }
  async function chatSend(text) {
    if (!text || chatState.loading) return;
    chatHideEmpty(); chatState.loading = true; if (chatDom.send) chatDom.send.disabled = true;
    chatState.history.push({ role: 'user', content: text }); chatAppend('user', text);
    if (chatDom.input) { chatDom.input.value = ''; chatResize(); }
    chatTyping();
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: chatState.history, stream: true }) });
      if (!res.ok) { let m = 'HTTP ' + res.status; try { const j = await res.json(); if (j.error) m = j.error; } catch (_) {} throw new Error(m); }
      chatRemoveTyping();
      const bubble = chatAppend('assistant', ''); let assistantText = '';
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const j = await res.json(); assistantText = j.choices?.[0]?.message?.content || '';
        bubble.textContent = assistantText || '(kosong)'; chatScroll();
      } else if (res.body) {
        const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || '';
          for (const ln of lines) {
            const l = ln.trim(); if (!l.startsWith('data:')) continue;
            const d = l.slice(5).trim(); if (d === '[DONE]') continue;
            try { const j = JSON.parse(d); const delta = j.choices?.[0]?.delta?.content || ''; if (delta) { assistantText += delta; bubble.textContent = assistantText; chatScroll(); } } catch (_) {}
          }
        }
        if (!assistantText) bubble.textContent = '(kosong)';
      } else throw new Error('Format respons tidak didukung.');
      if (assistantText) chatState.history.push({ role: 'assistant', content: assistantText });
    } catch (err) { chatRemoveTyping(); const b = chatAppend('assistant', ''); b.textContent = '⚠ ' + (err.message || 'Error'); b.style.color = '#ff9e9e'; }
    finally { chatState.loading = false; if (chatDom.send) chatDom.send.disabled = false; if (chatDom.input) chatDom.input.focus(); }
  }
  if (chatDom.form) chatDom.form.addEventListener('submit', (e) => { e.preventDefault(); const t = (chatDom.input?.value || '').trim(); if (t) chatSend(t); });
  if (chatDom.input) { chatDom.input.addEventListener('input', chatResize); chatDom.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatDom.form?.requestSubmit(); } }); }
  if (chatDom.clear) chatDom.clear.addEventListener('click', () => { chatState.history = []; if (chatDom.messages) { chatDom.messages.innerHTML = ''; if (chatDom.empty) { chatDom.messages.appendChild(chatDom.empty); chatDom.empty.style.display = ''; } } if (chatDom.suggestions) chatDom.suggestions.style.display = ''; if (window.lucide) window.lucide.createIcons(); toast('Reset.', 'info'); });
  if (chatDom.suggestions) chatDom.suggestions.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { const t = b.dataset.suggest || b.textContent; if (t) chatSend(t); }));

  /* ===== HELP MODAL ===== */
  const helpModal = $('#helpModal');
  $('#helpBtn')?.addEventListener('click', () => { show(helpModal); document.body.style.overflow = 'hidden'; });
  const closeHelp = () => { hide(helpModal); document.body.style.overflow = ''; };
  $('#closeHelp')?.addEventListener('click', closeHelp);
  $('#closeHelpBottom')?.addEventListener('click', closeHelp);
  helpModal?.addEventListener('click', (e) => { if (e.target === helpModal) closeHelp(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && helpModal && !helpModal.classList.contains('hidden')) closeHelp(); });

  /* ===== INIT ===== */
  function init() {
    if (window.lucide) window.lucide.createIcons();
    renderHist(); pinRenderHist(); hmRenderHist();

    const hashId = (location.hash || '').slice(1);
    let target = null;
    if (hashId && toolCards.find(c => c.dataset.tool === hashId)) target = hashId;
    if (!target && toolCards.length > 0) target = toolCards[0].dataset.tool;
    if (target) setActiveTool(target);

    pinSetMode('search'); hmSetMode('search'); psSetMode('search');
    gsSetMode('text'); ytSetMode('search'); ibSetMode('file'); cvSetMode('url'); setDepMode('paste');
    chatResize();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();