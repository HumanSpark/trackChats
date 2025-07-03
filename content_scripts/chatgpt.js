(() => {
  const STORAGE_KEY = 'trackChats_chatgpt';
  const MAX_ATTEMPTS = 5;

  function extractChats() {
    const nextDataEl = document.getElementById('__NEXT_DATA__');
    if (!nextDataEl) return [];
    let payload;
    try { payload = JSON.parse(nextDataEl.textContent); } catch { return []; }
    const conversations = payload?.props?.pageProps?.initialConversations || [];
    return conversations.map(c => {
      const id = c.id || c.conversationId;
      const title = c.title || 'Untitled Chat';
      const g = c.groupId || c.gptId;
      const slug = c.slug;
      const url = (g && slug)
        ? `https://chat.openai.com/g/g-${g}-${slug}/c/${id}`
        : `https://chat.openai.com/c/${id}`;
      return { title, url };
    });
  }

  function save(chats) { chrome.storage.local.set({ [STORAGE_KEY]: chats }); }
  const runExtraction = () => save(extractChats());

  function runWithBackoff(at=0) {
    const data = extractChats();
    if (data.length || at >= MAX_ATTEMPTS) { save(data); return; }
    const delay = Math.min(8000, 500 * 2 ** at);
    setTimeout(() => runWithBackoff(at + 1), delay);
  }

  runWithBackoff();
  new MutationObserver(runExtraction).observe(document.documentElement, { childList: true, subtree: true });

  let t; document.addEventListener('scroll', () => { clearTimeout(t); t=setTimeout(runExtraction,300); }, true);

  chrome.runtime.onMessage.addListener((msg,_s,res)=>{ if(msg==='trackchats_refresh'){ runWithBackoff(); res({ok:true}); }});
})();
