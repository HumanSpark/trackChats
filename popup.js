const PLATFORMS = [
  { key: 'trackChats_chatgpt',  name: 'ChatGPT'   },
  { key: 'trackChats_aistudio', name: 'AI Studio' },
  { key: 'trackChats_gemini',   name: 'Gemini'    },
  { key: 'trackChats_claude',   name: 'Claude'    },
  { key: 'trackChats_deepseek', name: 'DeepSeek'  }
];

function render() {
  chrome.storage.local.get(PLATFORMS.map(p => p.key), (data) => {
    const container = document.getElementById('lists');
    container.innerHTML = '';
    PLATFORMS.forEach(p => {
      const items = data[p.key] || [];
      const section = document.createElement('div');
      section.className = 'platform';
      const header = document.createElement('h2');
      header.textContent = p.name;
      section.appendChild(header);
      if (!items.length) {
        const none = document.createElement('div');
        none.textContent = 'No chats found.';
        none.style.fontSize = '12px';
        section.appendChild(none);
      } else {
        items.forEach(item => {
          const link = document.createElement('a');
          link.href = item.url;
          link.target = '_blank';
          link.textContent = item.title;
          section.appendChild(link);
        });
      }
      container.appendChild(section);
    });
  });
}

function downloadCSV() {
  chrome.storage.local.get(PLATFORMS.map(p => p.key), (data) => {
    const rows = [['Platform','Title','URL']];
    PLATFORMS.forEach(p => {
      (data[p.key] || []).forEach(item => {
        const safe = item.title.replace(/"/g,'""');
        rows.push([p.name, safe, item.url]);
      });
    });
    const csv = rows.map(r => r.map(f=>`"${f}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trackchats_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

document.getElementById('refresh').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length) {
      chrome.tabs.sendMessage(tabs[0].id, 'trackchats_refresh', () => {
        render();
      });
    }
  });
});

document.getElementById('downloadCSV').addEventListener('click', downloadCSV);
render();
