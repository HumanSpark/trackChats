// ===================== content_scripts/deepseek.js =====================
(() => {
  const STORAGE_KEY = 'trackChats_deepseek';
  const MAX_ATTEMPTS = 5;
  const selector = 'a[href*="/chat/"] , a[href*="/conversation/"]';

  function normalise(href) {
    if (!href) return null;
    return href.startsWith('http') ? href : `https://chat.deepseek.com${href.startsWith('/') ? '' : '/'}${href}`;
  }

  function extract() {
    const anchors = Array.from(document.querySelectorAll(selector));
    const map = new Map();
    anchors.forEach(a => {
      const url = normalise(a.getAttribute('href'));
      if (!url) return;
      if (url.includes('#')) return; // ignore in‑page links
      const title = (a.textContent || '').trim() || 'Untitled Chat';
      map.set(url, { title, url });
    });
    return [...map.values()];
  }

  const save = c => chrome.storage.local.set({ [STORAGE_KEY]: c });
  const run = () => save(extract());
  const backoff = (n = 0) => { const c = extract(); if (c.length || n >= MAX_ATTEMPTS) save(c); else setTimeout(() => backoff(n + 1), Math.min(8000, 500 * 2 ** n)); };

  backoff();
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  let t; document.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(run, 300); }, true);
  chrome.runtime.onMessage.addListener((m, _s, r) => { if (m === 'trackchats_refresh') { backoff(); r({ ok: true }); } });
})();
