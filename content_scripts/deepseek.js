// ===================== content_scripts/deepseek.js =====================
(() => {
  const STORAGE_KEY = 'trackChats_deepseek';
  const MAX_ATTEMPTS = 6;
  const selector = 'a[href*="/chat/"], a[href*="conversation"], a[href*="/session/"]';

  const normalise = href => {
    if (!href) return null;
    return href.startsWith('http') ? href : `${location.origin}${href.startsWith('/') ? '' : '/'}${href}`;
  };

  // ---------- Strategy 1 – pierce shadow DOM & scrape anchors ----------
  function collectAnchors(root) {
    const anchors = Array.from(root.querySelectorAll(selector));
    [...root.querySelectorAll('*')].forEach(el => { if (el.shadowRoot) anchors.push(...collectAnchors(el.shadowRoot)); });
    return anchors;
  }

  function fromAnchors() {
    const anchors = collectAnchors(document);
    const map = new Map();
    anchors.forEach(a => {
      const url = normalise(a.getAttribute('href'));
      if (!url || url.includes('#')) return;
      const titleNode = a.querySelector('span, div');
      const title = (titleNode ? titleNode.textContent : a.textContent || '').trim() || 'Untitled Chat';
      map.set(url, { title, url });
    });
    return [...map.values()];
  }

  // ---------- Strategy 2 – __NEXT_DATA__ JSON ----------
  function fromJSON() {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return [];
    try {
      const data = JSON.parse(el.textContent);
      const list = data?.props?.pageProps?.conversationList || data?.props?.pageProps?.conversationInfoList || [];
      return list.map(c => ({ title: c.title || 'Untitled Chat', url: `${location.origin}/chat/${c.id}` }));
    } catch { return []; }
  }

  async function extract() {
    const dom = fromAnchors();
    if (dom.length) return dom;
    return fromJSON();
  }

  const save = c => chrome.storage.local.set({ [STORAGE_KEY]: c });
  const run  = () => extract().then(save);
  const backoff = (n = 0) => run().then(c => { if (c.length || n >= MAX_ATTEMPTS) return; setTimeout(() => backoff(n + 1), 600 * 2 ** n); });

  backoff();
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  let tid; document.addEventListener('scroll', () => { clearTimeout(tid); tid = setTimeout(run, 250); }, true);
  chrome.runtime.onMessage.addListener((m, _s, r) => { if (m === 'trackchats_refresh') { backoff(); r({ ok: true }); } });
})();
