const SUPPORTED_PATTERNS = [
  /https:\/\/chat\.openai\.com\//,
  /https:\/\/aistudio\.google\.com\//,
  /https:\/\/gemini\.google\.com\//,
  /https:\/\/claude\.ai\//,
  /https:\/\/chat\.deepseek\.com\//
];

function isSupported(url = '') {
  return SUPPORTED_PATTERNS.some(re => re.test(url));
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url || '';
  if (!url || !isSupported(url)) return;

  if (changeInfo.status === 'complete' || changeInfo.url) {
    chrome.tabs.sendMessage(tabId, 'trackchats_refresh');
  }
});

chrome.runtime.onInstalled.addListener(() => 
  console.log('TrackChats installed (v1.5) – background listener active')
);
