// ===================== content_scripts/deepseek.js =====================
(() => {
  const STORAGE_KEY  = 'trackChats_deepseek';
  const MAX_ATTEMPTS = 7;

  // Broadened selectors & smarter ID extraction (July 2025 fix #2).
  const anchorSelector = 'a[href*="/chat/"], a[href*="/conversation/"], a[href*="/c/"], a[href*="session"], a[href*="thread"], a[href^="/"]';
  const buttonSelector = 'div[data-conversation-id], div[data-conversation-uuid], div[role="button"][data-testid="conversation"], div[role="button"][data-id], div[role="option"], div[role="listitem"], li[role="option"], a[role="link"][data-test-id]';

  // ---------- helpers ----------
  const uniq  = arr => [...new Map(arr.map(i => [i.url, i])).values()];
  const save  = c   => chrome.storage.local.set({ [STORAGE_KEY]: c });
  const normalise = href => {
    if (!href) return null;
    if (href.startsWith('http')) return href.split('?')[0];
    if (href.startsWith('/'))   return `${location.origin}${href.split('?')[0]}`;
    return `${location.origin}/${href.split('?')[0]}`;
  };

  // Recursively pierce shadow DOMs – DeepSeek mixes regular + shadow roots.
  const collect = (root, sel) => {
    const els = Array.from(root.querySelectorAll(sel));
    [...root.querySelectorAll('*')].forEach(el => { if (el.shadowRoot) els.push(...collect(el.shadowRoot, sel)); });
    return els;
  };

  const getIdFromHref = href => {
    if (!href) return null;
    const parts = href.split('/').filter(Boolean);
    return parts.length ? parts.pop() : null;
  };

  // ---------- Strategy 1 – visible list elements ----------
  function fromButtons() {
    const buttons = collect(document, buttonSelector);
    const map = new Map();
    buttons.forEach(b => {
      let id = b.dataset.conversationId || b.dataset.conversationUuid || b.dataset.id || b.getAttribute('data-id') || b.getAttribute('data-conversation-id');
      if (!id) {
        const a = b.querySelector('a[href]');
        id = a ? getIdFromHref(normalise(a.getAttribute('href'))) : null;
      }
      if (!id) return;
      const url = `${location.origin}/chat/${id}`;
      const titleNode = b.querySelector('span, div');
      const title = (titleNode ? titleNode.textContent : b.textContent || '').trim() || 'Untitled Chat';
      map.set(url, { title, url });
    });
    return [...map.values()];
  }

  // ---------- Strategy 2 – plain <a> links ----------
  function fromAnchors() {
    const anchors = collect(document, anchorSelector);
    const map = new Map();
    anchors.forEach(a => {
      const href = normalise(a.getAttribute('href'));
      if (!href || !(href.includes('/chat/') || href.includes('/conversation/') || href.includes('/c/'))) return;
      const id = getIdFromHref(href);
      if (!id) return;
      const titleNode = a.querySelector('span, div');
      const title = (titleNode ? titleNode.textContent : a.textContent || '').trim() || 'Untitled Chat';
      map.set(href, { title, url: href });
    });
    return [...map.values()];
  }

  // ---------- Strategy 3 – __NEXT_DATA__ JSON blob ----------
  function fromNextData() {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return [];
    try {
      const data = JSON.parse(el.textContent);
      const list = data?.props?.pageProps?.conversationList || data?.props?.pageProps?.conversationInfoList || data?.props?.pageProps?.conversations || data?.props?.pageProps?.data || [];
      return (list || []).map(c => {
        const id = c.id || c.conversationId || c.conversationUID || c.uuid;
        return id ? { title: c.title || 'Untitled Chat', url: `${location.origin}/chat/${id}` } : null;
      }).filter(Boolean);
    } catch { return []; }
  }

  // ---------- Strategy 4 – localStorage fallback ----------
  function fromLocalStorage() {
    const map = new Map();
    for (const key in localStorage) {
      if (!/conversation/i.test(key)) continue;
      let val;
      try { val = JSON.parse(localStorage[key]); } catch { continue; }
      const list = Array.isArray(val) ? val : (val?.data || val?.conversations || []);
      list.forEach(c => {
        const id = c?.id || c?.conversationId || c?.conversationUID || c?.uuid;
        if (!id) return;
        const url = `${location.origin}/chat/${id}`;
        const title = c?.title || 'Untitled Chat';
        map.set(url, { title, url });
      });
    }
    return [...map.values()];
  }

  // ---------- Strategy 5 – backend REST API ----------
  const endpoints = [
    '/api/chat/conversation/list',
    '/api/chat/conversations',
    '/api/chat/conversation',
    '/api/chat/conversation/query',
    '/api/user/conversation/list',
    '/api/chat/history',
    '/api/chat/conversation/history',
    '/api/v2/chat/conversation/list',
    '/conversation/list',
    '/conversations'
  ];

  async function fromAPI() {
    for (const ep of endpoints) {
      try {
        const res = await fetch(`${location.origin}${ep}?offset=0&limit=100`, { credentials: 'include', method: 'GET' });
        if (!res.ok) continue;
        const json = await res.json();
        const list = json?.data || json?.conversations || json?.results || json?.list || [];
        if (Array.isArray(list) && list.length) {
          return list.map(c => {
            const id = c.id || c.conversationId || c.conversationUID || c.uuid || c.cid;
            return id ? { title: c.title || 'Untitled Chat', url: `${location.origin}/chat/${id}` } : null;
          }).filter(Boolean);
        }
      } catch { /* try next */ }
    }
    return [];
  }

  // ---------- master extractor ----------
  async function extract() {
    const s1 = fromButtons();
    if (s1.length) return uniq(s1);

    const s2 = fromAnchors();
    if (s2.length) return uniq(s2);

    const sLS = fromLocalStorage();
    if (sLS.length) return uniq(sLS);

    const sNext = fromNextData();
    if (sNext.length) return uniq(sNext);

    const sAPI = await fromAPI();
    return uniq(sAPI);
  }

  // ---------- schedule & observers ----------
  const run = () => extract().then(save);
  const backoff = (n = 0) => run().then(c => {
    if (c.length || n >= MAX_ATTEMPTS) return;
    setTimeout(() => backoff(n + 1), 800 * 2 ** n);
  });

  backoff();
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  let st; document.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(run, 300); }, true);
  chrome.runtime.onMessage.addListener((m, _s, r) => { if (m === 'trackchats_refresh') { backoff(); r({ ok: true }); } });
})();