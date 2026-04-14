(() => {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page-hook.js');
  script.type = 'text/javascript';
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.__remoteInspector !== true) return;

    chrome.runtime.sendMessage({
      type: 'REMOTE_EVENT',
      payload: event.data.payload
    });
  });
})();
