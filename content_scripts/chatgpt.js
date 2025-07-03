// ===================== content_scripts/chatgpt.js =====================
(() => {
  const STORAGE_KEY = 'trackChats_chatgpt';
  const MAX_ATTEMPTS = 6;

  // ---------- helpers ----------
  const uniq  = arr => [...new Map(arr.map(i => [i.url, i])).values()];
  const save  = c   => chrome.storage.local.set({ [STORAGE_KEY]: c });

  // ---------- Strategy 1 – robust sidebar scrape (works even when virtualised) ----------
  function fromAnchors() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/c/"], a[href*="/chat/"]'));
    return anchors.map(a => {
      let href = a.getAttribute('href') || '';
      if (!href.startsWith('http')) {
        const origin = location.origin; // supports chat.openai.com OR chatgpt.com
        href = `${origin}${href.startsWith('/') ? '' : '/'}${href}`;
      }
      const title = (a.textContent || '').trim() || 'Untitled Chat';
      return { title, url: href.split('?')[0] };
    });
  }

  // ---------- Strategy 2 – backend‑api ----------
  async function fromAPI() {
    try {
      const res = await fetch('/backend-api/conversations?offset=0&limit=100&order=updated', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.items || []).map(c => ({ title: c.title || 'Untitled Chat', url: `${location.origin}/c/${c.id}` }));
    } catch { return []; }
  }

  async function extract() {
    const primary = fromAnchors();
    if (primary.length) return uniq(primary);
    const api = await fromAPI();
    return uniq(api);
  }

  const run = () => extract().then(save);
  const backoff = (n = 0) => run().then(c => { if (c.length || n >= MAX_ATTEMPTS) return; setTimeout(() => backoff(n + 1), 600 * 2 ** n); });

  backoff();
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  let tid; document.addEventListener('scroll', () => { clearTimeout(tid); tid = setTimeout(run, 250); }, true);
  chrome.runtime.onMessage.addListener((m, _s, r) => { if (m === 'trackchats_refresh') { backoff(); r({ ok: true }); } });
})();
