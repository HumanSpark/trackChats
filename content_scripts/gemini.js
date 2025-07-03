// ===================== content_scripts/gemini.js =====================
(() => {
  const STORAGE_KEY = 'trackChats_gemini';
  const MAX_ATTEMPTS = 6;
  const selector = 'a[href*="/p/"], a[href*="/app/"]'; // /p/{id} (old) or /app/{id} (new)

  const normalise = href => {
    if (!href) return null;
    return href.startsWith('http') ? href : `https://gemini.google.com${href.startsWith('/') ? '' : '/'}${href}`;
  };

  function extract() {
    const anchors = Array.from(document.querySelectorAll(selector));
    const map = new Map();
    anchors.forEach(a => {
      const url = normalise(a.getAttribute('href'));
      if (!url) return;
      const titleNode = a.querySelector('span, div');
      const title = (titleNode ? titleNode.textContent : a.textContent || '').trim() || 'Untitled Chat';
      map.set(url, { title, url });
    });
    return [...map.values()];
  }

  const save = c => chrome.storage.local.set({ [STORAGE_KEY]: c });
  const run  = () => save(extract());
  const backoff = (n = 0) => { const c = extract(); if (c.length || n >= MAX_ATTEMPTS) save(c); else setTimeout(() => backoff(n + 1), 600 * 2 ** n); };

  backoff();
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  let tid; document.addEventListener('scroll', () => { clearTimeout(tid); tid = setTimeout(run, 250); }, true);
  chrome.runtime.onMessage.addListener((m, _s, r) => { if (m === 'trackchats_refresh') { backoff(); r({ ok: true }); } });
})();