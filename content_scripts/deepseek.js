// ===================== content_scripts/deepseek.js (major patch) =====================
(() => {
  const STORAGE_KEY  = 'trackChats_deepseek';
  const MAX_ATTEMPTS = 6;
  const anchorSelector  = 'a[href*="/chat/"], a[href*="/c/"], a[href*="conversation"], a[href*="session"], a[href*="thread"]';
  const buttonSelector  = 'div[data-conversation-id], div[role="button"][data-testid="conversation"], div[role="button"][data-id]';

  const uniq  = arr => [...new Map(arr.map(i => [i.url, i])).values()];
  const save  = c   => chrome.storage.local.set({ [STORAGE_KEY]: c });
  const normalise = href => !href ? null : (href.startsWith('http') ? href : `${location.origin}${href.startsWith('/') ? '' : '/'}${href}`);

  const collect = (root, sel) => {
    const els = Array.from(root.querySelectorAll(sel));
    [...root.querySelectorAll('*')].forEach(el => { if (el.shadowRoot) els.push(...collect(el.shadowRoot, sel)); });
    return els;
  };

  // ---------- Strategy 1 – visible <div role="button"> list ----------
  function fromButtons() {
    const buttons = collect(document, buttonSelector);
    const map = new Map();
    buttons.forEach(b => {
      const id = b.dataset.conversationId || b.dataset.id || b.getAttribute('data-id') || b.getAttribute('data-conversation-id');
      if (!id) return;
      const basePath = location.pathname.includes('/c/') ? '/c/' : '/chat/';
      const url = `${location.origin}${basePath}${id}`;
      const titleNode = b.querySelector('span, div');
      const title = (titleNode ? titleNode.textContent : b.textContent || '').trim() || 'Untitled Chat';
      map.set(url, { title, url });
    });
    return [...map.values()];
  }

  // ---------- Strategy 2 – legacy <a> links ----------
  function fromAnchors() {
    const anchors = collect(document, anchorSelector);
    const map = new Map();
    anchors.forEach(a => {
      const url = normalise(a.getAttribute('href'))?.split('?')[0];
      if (!url || url.includes('#')) return;
      const titleNode = a.querySelector('span, div');
      const title = (titleNode ? titleNode.textContent : a.textContent || '').trim() || 'Untitled Chat';
      map.set(url, { title, url });
    });
    return [...map.values()];
  }

  // ---------- Strategy 3 – __NEXT_DATA__ JSON blob ----------
  function fromJSON() {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return [];
    try {
      const data = JSON.parse(el.textContent);
      const list = data?.props?.pageProps?.conversationList || data?.props?.pageProps?.conversationInfoList || data?.props?.pageProps?.conversations || [];
      return list.map(c => {
        const id = c.id || c.conversationId || c.conversation_id || c.conversationUID;
        return id ? { title: c.title || 'Untitled Chat', url: `${location.origin}/chat/${id}` } : null;
      }).filter(Boolean);
    } catch { return []; }
  }

  // ---------- Strategy 4 – backend REST API fallbacks ----------
  const endpoints = [
    '/api/chat/conversation/list',
    '/api/conversation/list',
    '/api/v1/chat/conversation/list',
    '/llm/chat/conversation/list',
    '/conversation/list',
    '/api/chat/history',
    '/api/chat/conversation/history'
  ];

  async function fromAPI() {
    for (const ep of endpoints) {
      try {
        const res = await fetch(`${location.origin}${ep}?offset=0&limit=100`, { credentials: 'include' });
        if (!res.ok) continue;
        const json = await res.json();
        const list = json?.data || json?.conversations || json?.results || [];
        if (list && list.length) {
          return list.map(c => {
            const id = c.id || c.conversationId || c.conversationUID || c.cid;
            return id ? { title: c.title || 'Untitled Chat', url: `${location.origin}/chat/${id}` } : null;
          }).filter(Boolean);
        }
      } catch { /* try next */ }
    }
    return [];
  }

  async function extract() {
    const first = fromButtons();
    if (first.length) return uniq(first);
    const second = fromAnchors();
    if (second.length) return uniq(second);
    const api = await fromAPI();
    if (api.length) return uniq(api);
    return uniq(fromJSON());
  }

  const run = () => extract().then(save);
  const backoff = (n=0) => run().then(c => { if (c.length || n>=MAX_ATTEMPTS) return; setTimeout(() => backoff(n+1), 600 * 2 ** n); });

  backoff();
  new MutationObserver(run).observe(document.body, { childList:true, subtree:true });
  let tid; document.addEventListener('scroll', () => { clearTimeout(tid); tid = setTimeout(run, 250); }, true);
  chrome.runtime.onMessage.addListener((m,_s,r) => { if (m==='trackchats_refresh'){ backoff(); r({ok:true}); } });
})();
