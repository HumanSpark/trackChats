(() => {
  const STORAGE_KEY = 'trackChats_aistudio';
  const MAX_ATTEMPTS = 5;

  function extractChats() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/app/prompts/"]'));
    const map = new Map();
    anchors.forEach(a => {
      const href = a.getAttribute('href') || '';
      if (!href || href.includes('new_chat')) return;
      const abs = href.startsWith('http') ? href : `https://aistudio.google.com${href.startsWith('/') ? '' : '/'}${href}`;
      map.set(abs, { title: (a.textContent||'').trim() || 'Untitled Chat', url: abs });
    });
    return [...map.values()];
  }

  const save = c => chrome.storage.local.set({ [STORAGE_KEY]: c });
  const runExtraction = () => save(extractChats());
  const runWithBackoff = (n=0) => {
    const c=extractChats();
    if(c.length||n>=MAX_ATTEMPTS) save(c);
    else setTimeout(()=>runWithBackoff(n+1), Math.min(8000, 500*2**n));
  };

  runWithBackoff();
  new MutationObserver(runExtraction).observe(document.body,{childList:true,subtree:true});
  let t; document.addEventListener('scroll',()=>{clearTimeout(t);t=setTimeout(runExtraction,300);},true);
  chrome.runtime.onMessage.addListener((m,_s,r)=>{if(m==='trackchats_refresh'){runWithBackoff();r({ok:true});}});
})();
