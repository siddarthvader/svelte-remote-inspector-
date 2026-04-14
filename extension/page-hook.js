(() => {
  const MAX_TEXT = 5000;

  function asText(value) {
    if (value == null) return null;
    if (typeof value === 'string') return value.slice(0, MAX_TEXT);
    try {
      return JSON.stringify(value).slice(0, MAX_TEXT);
    } catch {
      return String(value).slice(0, MAX_TEXT);
    }
  }

  function emit(payload) {
    window.postMessage({
      __remoteInspector: true,
      payload: {
        ts: new Date().toISOString(),
        ...payload
      }
    }, '*');
  }

  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const method = init?.method || (typeof input === 'object' && input?.method) || 'GET';
    const requestBody = init?.body;

    const start = performance.now();
    try {
      const response = await originalFetch.apply(this, arguments);
      let responseBody = null;
      try {
        const cloned = response.clone();
        responseBody = await cloned.text();
      } catch {
        responseBody = '[unreadable-response-body]';
      }

      emit({
        kind: 'fetch',
        ok: response.ok,
        status: response.status,
        method,
        url,
        requestBody: asText(requestBody),
        responseBody: asText(responseBody),
        durationMs: Math.round(performance.now() - start)
      });

      return response;
    } catch (error) {
      emit({
        kind: 'fetch',
        ok: false,
        method,
        url,
        requestBody: asText(requestBody),
        error: asText(error?.message || error),
        durationMs: Math.round(performance.now() - start)
      });
      throw error;
    }
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__riMethod = method;
    this.__riUrl = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body) {
    const start = performance.now();
    const method = this.__riMethod || 'GET';
    const url = this.__riUrl;

    this.addEventListener('loadend', () => {
      emit({
        kind: 'xhr',
        ok: this.status >= 200 && this.status < 300,
        status: this.status,
        method,
        url,
        requestBody: asText(body),
        responseBody: asText(this.responseText),
        durationMs: Math.round(performance.now() - start)
      });
    });

    return originalSend.apply(this, arguments);
  };
})();
