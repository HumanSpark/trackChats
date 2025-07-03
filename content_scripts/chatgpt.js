// ===================== content_scripts/chatgpt.js =====================
(() => {
  const STORAGE_KEY = 'trackChats_chatgpt';
  const MAX_ATTEMPTS = 5;

  // --- Strategy 1: call the same endpoint the sidebar uses ---
  async function fromAPI() {
    try {
      const res = await fetch('/backend-api/conversations?offset=0&limit=100', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      const list = json?.items || [];
      return list.map(c => ({
        title: c.title || 'Untitled Chat',
        url: `https://chat.openai.com/c/${c.id}`
      }));
    } catch { return []; }
  }

  // --- Strategy 2: reuse __NEXT_DATA__ scrape ---
  function fromJSON() {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return [];
    let data;
    try { data = JSON.parse(el.textContent); } catch { return []; }

    const paths = [
      data?.props?.pageProps?.initialConversations,
      data?.props?.pageProps?.conversations,
      data?.props?.pageProps?.dashboardPageProps?.conversations
    ];
    const list = paths.find(arr => Array.isArray(arr) && arr.length) || [];

    return list.map(c => {
      const id = c.id || c.conversationId;
      const title = c.title || 'Untitled Chat';
      return { title, url: `https://chat.openai.com/c/${id}` };
    });
  }

  // --- Strategy 3: scrape sidebar anchors ---
  function fromAnchors() {
    const anchors = Array.from(document.querySelectorAll('a[href^="/c/"]'));
    return anchors.map(a => ({ title: (a.textContent || '').trim() || 'Untitled Chat', url: `https://chat.openai.com${a.getAttribute('href')}` }));
  }

  async function extract() {
    const apiChats = await fromAPI();
    if (apiChats.length) return apiChats;
    const jsonChats = fromJSON();
    if (jsonChats.length) return jsonChats;
    return fromAnchors();
  }

  const save = chats => chrome.storage.local.set({ [STORAGE_KEY]: chats });
  const run = () => extract().then(save);
  const backoff = (n = 0) => run().then(c => { if (c.length || n >= MAX_ATTEMPTS) return; setTimeout(() => backoff(n + 1), Math.min(8000, 500 * 2 ** n)); });

  backoff();
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  let t; document.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(run, 300); }, true);
  chrome.runtime.onMessage.addListener((m, _s, r) => { if (m === 'trackchats_refresh') { backoff(); r({ ok: true }); } });
})();