// ===================== content_scripts/gemini.js (major patch) =====================
(() => {
  const STORAGE_KEY  = 'trackChats_gemini';
  const MAX_ATTEMPTS = 6;
  const anchorSelector = 'a[href*="/p/"], a[href*="/app/"], a[href*="/chat/"], a[href*="/c/"]';
  const buttonSelector = 'div[role="button"][data-test-id="conversation"], div.conversation[role="button"], div[role="button"][data-conversation-id]';

  // ---------- helpers ----------
  const uniq = arr => [...new Map(arr.map(i => [i.url, i])).values()];
  const save = c   => chrome.storage.local.set({ [STORAGE_KEY]: c });
  const normalise = href => !href ? null : (href.startsWith('http') ? href : `${location.origin}${href.startsWith('/') ? '' : '/'}${href}`);

  // ---------- shadow‑DOM aware collector ----------
  const collect = (root, sel) => {
    const els = Array.from(root.querySelectorAll(sel));
    [...root.querySelectorAll('*')].forEach(el => { if (el.shadowRoot) els.push(...collect(el.shadowRoot, sel)); });
    return els;
  };

  // ---------- id extraction ----------
  function extractIdFromJslog(jslog='') {
    const decoded = jslog.replace(/&quot;/g, '"');
    const m = decoded.match(/"c_([a-z0-9]{8,})"/i) || decoded.match(/c_([a-z0-9]{8,})/i);
    return m ? m[1] : null;
  }

  // ---------- Strategy 1 – new <div role="button"> entries ----------
  function fromButtons() {
    const buttons = collect(document, buttonSelector);
    const map = new Map();
    buttons.forEach(btn => {
      const id = btn.dataset.conversationId || extractIdFromJslog(btn.getAttribute('jslog') || '');
      if (!id) return;
      const url = `${location.origin}/app/${id}`;
      const titleNode = btn.querySelector('.conversation-title, span, div');
      const title = (titleNode ? titleNode.textContent : btn.textContent || '').trim() || 'Untitled Chat';
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
      if (!url) return;
      const titleNode = a.querySelector('div, span');
      const title = (titleNode ? titleNode.textContent : a.textContent || '').trim() || 'Untitled Chat';
      map.set(url, { title, url });
    });
    return [...map.values()];
  }

  // ---------- Strategy 3 – embedded JSON blobs ----------
  function fromJSON() {
    const script = Array.from(document.querySelectorAll('script[type="application/json"], script:not([src])'))
      .find(s => /conversation(State|s)\s*"?[:=]/.test(s.textContent));
    if (!script) return [];
    try {
      const data = JSON.parse(script.textContent);
      const list = data?.conversationStates || data?.conversationState || data?.conversations || [];
      return (Array.isArray(list) ? list : Object.values(list)).map(c => ({
        title: c.title || 'Untitled Chat',
        url  : `${location.origin}/app/${c.conversationId || c.id || c.conversationID || c.cid}`
      }));
    } catch { return []; }
  }

  async function extract() {
    const first = fromButtons();
    if (first.length) return uniq(first);
    const second = fromAnchors();
    if (second.length) return uniq(second);
    return uniq(fromJSON());
  }

  const run = () => extract().then(save);
  const backoff = (n=0) => run().then(c => { if (c.length || n>=MAX_ATTEMPTS) return; setTimeout(() => backoff(n+1), 600 * 2 ** n); });

  backoff();
  new MutationObserver(run).observe(document.documentElement, { childList:true, subtree:true });
  let tid; document.addEventListener('scroll', () => { clearTimeout(tid); tid = setTimeout(run, 250); }, true);
  chrome.runtime.onMessage.addListener((m,_s,r) => { if (m==='trackchats_refresh'){ backoff(); r({ok:true}); } });
})();
