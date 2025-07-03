(() => {
  const STORAGE_KEY = 'trackChats_claude';
  const MAX_ATTEMPTS = 5;
  const selector = 'a[href*="/chat/"]';

  function extract() {
    const anchors = Array.from(document.querySelectorAll(selector));
    const map = new Map();
    anchors.forEach(a => {
      let h=a.getAttribute('href'); if(!h) return;
      if(!h.startsWith('http')) h=`https://claude.ai${h.startsWith('/')?'':'/'}${h}`;
      map.set(h,{ title: (a.textContent||'').trim() || 'Untitled Chat', url: h });
    });
    return [...map.values()];
  }

  const save = c => chrome.storage.local.set({ [STORAGE_KEY]: c });
  const run = () => save(extract());
  const backoff = (n=0) => { const c=extract(); if(c.length||n>=MAX_ATTEMPTS) save(c); else setTimeout(()=>backoff(n+1), Math.min(8000,500*2**n)); };

  backoff();
  new MutationObserver(run).observe(document.body,{childList:true,subtree:true});
  let t; document.addEventListener('scroll', ()=>{clearTimeout(t);t=setTimeout(run,300);}, true);
  chrome.runtime.onMessage.addListener((m,_s,r)=>{ if(m==='trackchats_refresh'){ backoff(); r({ok:true}); }});
})();
