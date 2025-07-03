// TrackChats Chrome Extension – popup.js 
//
// Expects the following minimal markup in popup.html:
//   <body>
//     <div id="status" class="status"></div>
//     <div id="list"   class="list"></div>
//     <button id="refresh">Refresh</button>
//   </body>
// ----------------------------------------------------------

(() => {
  // ------------------------------------------------------------------
  // Configuration – keep these in sync with content scripts
  // ------------------------------------------------------------------
  const PLATFORMS = [
    { key: 'trackChats_chatgpt',  label: 'ChatGPT'  },
    { key: 'trackChats_aistudio', label: 'AI Studio' },
    { key: 'trackChats_gemini',   label: 'Gemini'   },
    { key: 'trackChats_claude',   label: 'Claude'   },
    { key: 'trackChats_deepseek', label: 'DeepSeek' } 
  ];

  // ------------------------------------------------------------------
  // Utility helpers
  // ------------------------------------------------------------------
  const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
  const create = (tag, attrs = {}, text = '') => {
    const node = Object.assign(document.createElement(tag), attrs);
    if (text) node.textContent = text;
    return node;
  };

  /**
   * Renders one platform section.
   * @param {HTMLElement} container
   * @param {string}       title
   * @param {{title:string,url:string,updatedAt?:number}[]} chats
   */
  function renderSection(container, title, chats) {
    const heading = create('h2', { className: 'platform-title' }, title);
    container.appendChild(heading);

    const ul = create('ul', { className: 'chat-list' });
    chats.forEach(c => {
      const li = create('li');
      const a  = create('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.title);
      li.appendChild(a);
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  // ------------------------------------------------------------------
  // Main logic – runs on popup open
  // ------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    const listEl   = $('list');
    const statusEl = $('status');

    chrome.storage.local.get(PLATFORMS.map(p => p.key), /** @param {Record<string, any>} data */ (data) => {
      let somethingRendered = false;

      PLATFORMS.forEach(p => {
        /** @type {{title:string,url:string,updatedAt?:number}[]} */
        const chats = Array.isArray(data[p.key]) ? data[p.key] : [];
        if (!chats.length) return; // skip empty platform

        somethingRendered = true;

        // Sort: newest updatedAt first, else alpha by title
        chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.title.localeCompare(b.title));
        renderSection(listEl, p.label, chats);
      });

      statusEl.textContent = somethingRendered ? '' : 'No chats found – open a chat and hit “Refresh”.';
    });

    // Manual refresh – send message to content‑script in active tab.
    $('refresh').addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs.length) return;
        chrome.tabs.sendMessage(tabs[0].id, 'trackchats_refresh', () => window.close());
      });
    });
  });
})();