const KEY = 'remoteInspectorLogs';
const MAX_LOGS = 300;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'REMOTE_EVENT') {
    chrome.storage.local.get([KEY], (result) => {
      const logs = result[KEY] || [];
      logs.unshift(message.payload);
      chrome.storage.local.set({ [KEY]: logs.slice(0, MAX_LOGS) });
    });
  }

  if (message?.type === 'GET_LOGS') {
    chrome.storage.local.get([KEY], (result) => {
      sendResponse({ logs: result[KEY] || [] });
    });
    return true;
  }

  if (message?.type === 'CLEAR_LOGS') {
    chrome.storage.local.set({ [KEY]: [] }, () => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
