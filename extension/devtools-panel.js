const meta = document.getElementById('meta');
const listEl = document.getElementById('list');
const listEmptyEl = document.getElementById('list-empty');
const detailsEl = document.getElementById('details');
const detailsEmptyEl = document.getElementById('details-empty');
const refreshBtn = document.getElementById('refresh');
const clearBtn = document.getElementById('clear');

const detailTitleEl = document.getElementById('detail-title');
const detailSubtitleEl = document.getElementById('detail-subtitle');
const detailMethodEl = document.getElementById('detail-method');
const detailStatusEl = document.getElementById('detail-status');
const detailDurationEl = document.getElementById('detail-duration');
const detailTsEl = document.getElementById('detail-ts');
const detailUrlEl = document.getElementById('detail-url');
const detailPayloadEl = document.getElementById('detail-payload');
const detailRequestEl = document.getElementById('detail-request');
const detailResponseEl = document.getElementById('detail-response');
const detailRawEl = document.getElementById('detail-raw');

const toggleUrlEl = document.getElementById('toggle-url');
const toggleRequestEl = document.getElementById('toggle-request');
const toggleResponseEl = document.getElementById('toggle-response');
const toggleRawEl = document.getElementById('toggle-raw');

const sectionUrlEl = document.getElementById('section-url');
const sectionRequestEl = document.getElementById('section-request');
const sectionResponseEl = document.getElementById('section-response');
const sectionRawEl = document.getElementById('section-raw');

const REMOTE_PATH = '/_app/remote/';
const PREFS_KEY = 'remoteInspectorDevtoolsPrefs';
const UNDEFINED = -1;
const HOLE = -2;
const NAN = -3;
const POSITIVE_INFINITY = -4;
const NEGATIVE_INFINITY = -5;
const NEGATIVE_ZERO = -6;
const REMOTE_OBJECT = '__skrao';
const REMOTE_MAP = '__skram';
const REMOTE_SET = '__skras';

const prefs = {
  showUrl: false,
  showRequest: false,
  showResponse: false,
  showRaw: false
};

let currentLogs = [];
let selectedIndex = 0;
const logsById = new Map();
let networkListenerAttached = false;

function loadPrefs() {
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
  } catch {}
}

function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function applyPrefs() {
  toggleUrlEl.checked = prefs.showUrl;
  toggleRequestEl.checked = prefs.showRequest;
  toggleResponseEl.checked = prefs.showResponse;
  toggleRawEl.checked = prefs.showRaw;

  sectionUrlEl.classList.toggle('hidden', !prefs.showUrl);
  sectionRequestEl.classList.toggle('hidden', !prefs.showRequest);
  sectionResponseEl.classList.toggle('hidden', !prefs.showResponse);
  sectionRawEl.classList.toggle('hidden', !prefs.showRaw);
}

function bindToggle(toggleEl, key) {
  toggleEl.addEventListener('change', () => {
    prefs[key] = toggleEl.checked;
    savePrefs();
    applyPrefs();
  });
}

function safeUrl(url) {
  try {
    return new URL(url, window.location.origin);
  } catch {
    return null;
  }
}

function isRemoteUrl(url) {
  return typeof url === 'string' && url.includes(REMOTE_PATH);
}

function extractPath(url) {
  const parsed = safeUrl(url);
  if (!parsed) return url || '[unknown-url]';
  return `${parsed.pathname}${parsed.search}`;
}

function remoteMeta(url) {
  const path = extractPath(url);
  const match = path.match(/^\/_app\/remote\/([^/]+)\/([^?]+)/);
  if (!match) {
    return {
      routeId: null,
      remoteName: path,
      shortPath: path,
      fullPath: path
    };
  }

  const [, routeId, remoteName] = match;
  return {
    routeId,
    remoteName,
    shortPath: `/_app/remote/${routeId}/${remoteName}`,
    fullPath: path
  };
}

function decodeBase64Utf8(value) {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const bytes = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function devalueUnflatten(parsed) {
  if (typeof parsed === 'number') return parsed;
  if (!Array.isArray(parsed) || parsed.length === 0) return parsed;

  const values = parsed;
  const hydrated = Array(values.length);

  function reviveRemoteType(type, revivedValue) {
    switch (type) {
      case REMOTE_OBJECT:
        return revivedValue;
      case REMOTE_MAP: {
        const map = new Map();
        for (const item of revivedValue || []) {
          if (!Array.isArray(item) || item.length !== 2) continue;
          map.set(parseDevalueString(item[0]), parseDevalueString(item[1]));
        }
        return map;
      }
      case REMOTE_SET: {
        const set = new Set();
        for (const item of revivedValue || []) {
          set.add(parseDevalueString(item));
        }
        return set;
      }
      default:
        return null;
    }
  }

  function hydrate(index, standalone = false) {
    if (index === UNDEFINED) return undefined;
    if (index === NAN) return NaN;
    if (index === POSITIVE_INFINITY) return Infinity;
    if (index === NEGATIVE_INFINITY) return -Infinity;
    if (index === NEGATIVE_ZERO) return -0;

    if (standalone || typeof index !== 'number') {
      throw new Error('Invalid input');
    }

    if (index in hydrated) return hydrated[index];

    const value = values[index];

    if (!value || typeof value !== 'object') {
      hydrated[index] = value;
    } else if (Array.isArray(value)) {
      if (typeof value[0] === 'string') {
        const type = value[0];
        const remoteRevived = reviveRemoteType(type, hydrate(value[1]));

        if (remoteRevived !== null) {
          hydrated[index] = remoteRevived;
          return hydrated[index];
        }

        switch (type) {
          case 'Date':
            hydrated[index] = new Date(value[1]);
            break;
          case 'Set': {
            const set = new Set();
            hydrated[index] = set;
            for (let i = 1; i < value.length; i += 1) set.add(hydrate(value[i]));
            break;
          }
          case 'Map': {
            const map = new Map();
            hydrated[index] = map;
            for (let i = 1; i < value.length; i += 2) map.set(hydrate(value[i]), hydrate(value[i + 1]));
            break;
          }
          case 'RegExp':
            hydrated[index] = new RegExp(value[1], value[2]);
            break;
          case 'Object':
            hydrated[index] = Object(value[1]);
            break;
          case 'BigInt':
            hydrated[index] = BigInt(value[1]);
            break;
          case 'null': {
            const obj = Object.create(null);
            hydrated[index] = obj;
            for (let i = 1; i < value.length; i += 2) obj[value[i]] = hydrate(value[i + 1]);
            break;
          }
          case 'URL':
            hydrated[index] = new URL(value[1]);
            break;
          case 'URLSearchParams':
            hydrated[index] = new URLSearchParams(value[1]);
            break;
          default:
            hydrated[index] = value;
            break;
        }
      } else {
        const array = new Array(value.length);
        hydrated[index] = array;
        for (let i = 0; i < value.length; i += 1) {
          const n = value[i];
          if (n === HOLE) continue;
          array[i] = hydrate(n);
        }
      }
    } else {
      const object = {};
      hydrated[index] = object;
      for (const key in value) {
        if (key === '__proto__') throw new Error('Invalid input');
        object[key] = hydrate(value[key]);
      }
    }

    return hydrated[index];
  }

  return hydrate(0);
}

function parseDevalueString(value) {
  if (typeof value !== 'string' || !value) return value;

  try {
    return devalueUnflatten(JSON.parse(value));
  } catch {
    return value;
  }
}

function parseRemoteArgString(payload) {
  if (!payload) return undefined;

  const jsonString = decodeBase64Utf8(payload);
  if (!jsonString) return payload;

  try {
    return devalueUnflatten(JSON.parse(jsonString));
  } catch {
    return jsonString;
  }
}

function parseRemotePayload(url) {
  const parsed = safeUrl(url);
  if (!parsed) return '[unable to parse URL]';

  return parseRemoteArgString(parsed.searchParams.get('payload'));
}

function parseRemoteRequestBody(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  let outer;
  try {
    outer = JSON.parse(trimmed);
  } catch {
    return value;
  }

  if (!outer || typeof outer !== 'object') return outer;

  const result = { ...outer };

  if (typeof outer.payload === 'string') {
    result.payload = parseRemoteArgString(outer.payload);
  }

  if (Array.isArray(outer.refreshes)) {
    result.refreshes = outer.refreshes.map((entry) => {
      if (typeof entry !== 'string') return entry;
      const slash = entry.indexOf('/');
      const payloadSlash = entry.lastIndexOf('/');
      if (slash === -1 || payloadSlash === -1 || payloadSlash <= slash) {
        return entry;
      }

      const id = entry.slice(0, payloadSlash);
      const payload = entry.slice(payloadSlash + 1);
      return {
        key: entry,
        remote: id,
        args: parseRemoteArgString(payload)
      };
    });
  }

  return result;
}

function parseRemoteResponseBody(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  let outer;
  try {
    outer = JSON.parse(trimmed);
  } catch {
    return value;
  }

  if (!outer || typeof outer !== 'object') return outer;

  if (outer.type === 'result' && typeof outer.result === 'string') {
    try {
      return parseDevalueString(outer.result);
    } catch {
      return outer;
    }
  }

  if (outer.type === 'error' && typeof outer.error === 'string') {
    try {
      return {
        ...outer,
        error: JSON.parse(outer.error)
      };
    } catch {
      return outer;
    }
  }

  return outer;
}

function pretty(value) {
  if (value == null) return '[none]';

  if (typeof value !== 'string') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  const trimmed = value.trim();
  if (!trimmed) return '[empty]';

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createJsonNode(value, key = null, depth = 0) {
  const row = document.createElement('div');
  row.className = `json-row${depth === 0 ? ' root' : ''}`;

  const isObject = value && typeof value === 'object';
  const isArray = Array.isArray(value);

  if (!isObject) {
    const keyHtml = key != null ? `<span class="json-key">${escapeHtml(key)}</span>: ` : '';
    let valueHtml;

    if (typeof value === 'string') {
      valueHtml = `<span class="json-string">${escapeHtml(JSON.stringify(value))}</span>`;
    } else if (typeof value === 'number') {
      valueHtml = `<span class="json-number">${escapeHtml(String(value))}</span>`;
    } else if (typeof value === 'boolean') {
      valueHtml = `<span class="json-boolean">${escapeHtml(String(value))}</span>`;
    } else if (value == null) {
      valueHtml = `<span class="json-null">null</span>`;
    } else {
      valueHtml = escapeHtml(String(value));
    }

    row.innerHTML = `${keyHtml}${valueHtml}`;
    return row;
  }

  const wrapper = document.createElement('div');
  const header = document.createElement('div');
  const children = document.createElement('div');
  let expanded = depth < 1;

  const entries = isArray
    ? value.map((item, index) => [index, item])
    : Object.entries(value);

  const summary = isArray
    ? `[${entries.length}]`
    : `{${entries.length}}`;

  function renderHeader() {
    const toggle = `<span class="json-toggle">${expanded ? '▾' : '▸'}</span>`;
    const keyHtml = key != null ? `<span class="json-key">${escapeHtml(key)}</span>: ` : '';
    const bracket = isArray ? '[' : '{';
    header.innerHTML = `${toggle}${keyHtml}<span class="json-summary">${bracket} ${summary}</span>`;
  }

  function renderChildren() {
    children.innerHTML = '';
    children.classList.toggle('hidden', !expanded);
    if (!expanded) return;

    for (const [childKey, childValue] of entries) {
      children.appendChild(createJsonNode(childValue, childKey, depth + 1));
    }
  }

  header.style.cursor = 'pointer';
  header.addEventListener('click', () => {
    expanded = !expanded;
    renderHeader();
    renderChildren();
  });

  renderHeader();
  renderChildren();
  wrapper.appendChild(header);
  wrapper.appendChild(children);
  row.appendChild(wrapper);
  return row;
}

function renderJsonViewer(container, value) {
  container.innerHTML = '';
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {}
  }
  container.appendChild(createJsonNode(value));
}

function normalizeStoredLog(log, index = 0) {
  return {
    id: log.id || `stored:${log.ts || index}:${log.method || 'GET'}:${log.url || ''}`,
    source: log.source || 'hook',
    kind: log.kind || 'fetch',
    ts: log.ts || new Date().toISOString(),
    method: log.method || 'GET',
    url: log.url || '[unknown-url]',
    status: log.status,
    ok: typeof log.ok === 'boolean' ? log.ok : (log.status >= 200 && log.status < 300),
    durationMs: log.durationMs,
    requestBody: log.requestBody ?? null,
    responseBody: log.responseBody ?? null,
    error: log.error,
    raw: log.raw || log
  };
}

function normalizeNetworkRequest(request) {
  const url = request.request?.url;
  if (!isRemoteUrl(url)) return null;

  return {
    id: `network:${request.startedDateTime}:${request.request?.method || 'GET'}:${url}`,
    source: 'network',
    kind: 'network',
    ts: request.startedDateTime || new Date().toISOString(),
    method: request.request?.method || 'GET',
    url,
    status: request.response?.status,
    ok: (request.response?.status || 0) >= 200 && (request.response?.status || 0) < 300,
    durationMs: typeof request.time === 'number' ? Math.round(request.time) : null,
    requestBody: request.request?.postData?.text ?? null,
    responseBody: null,
    error: null,
    raw: request
  };
}

function syncCurrentLogs() {
  currentLogs = [...logsById.values()].sort((a, b) => {
    const at = new Date(a.ts || 0).getTime();
    const bt = new Date(b.ts || 0).getTime();
    return bt - at;
  });

  if (selectedIndex >= currentLogs.length) selectedIndex = 0;
  render(currentLogs);
}

function upsertLog(log) {
  logsById.set(log.id, log);
  syncCurrentLogs();
}

function mergeLogPatch(id, patch) {
  const existing = logsById.get(id);
  if (!existing) return;
  logsById.set(id, { ...existing, ...patch, raw: patch.raw || existing.raw });
  syncCurrentLogs();
}

function renderList(logs) {
  listEl.innerHTML = '';
  listEmptyEl.classList.toggle('hidden', logs.length > 0);

  logs.forEach((log, index) => {
    const button = document.createElement('button');
    button.className = `event-row${index === selectedIndex ? ' selected' : ''}`;
    button.type = 'button';

    const meta = remoteMeta(log.url);
    const ts = log.ts ? new Date(log.ts).toLocaleTimeString() : '-';
    const statusClass = log.ok === false ? 'error' : 'ok';
    const statusText = log.status != null ? `${log.status}` : (log.error ? 'ERR' : '-');

    button.innerHTML = `
      <div class="name-cell">
        <div class="endpoint mono">${escapeHtml(meta.remoteName)}</div>
        <div class="path mono">${escapeHtml(meta.shortPath)}</div>
      </div>
      <div>${escapeHtml(log.method || 'GET')}</div>
      <div class="status ${statusClass}">${escapeHtml(statusText)}</div>
      <div>${escapeHtml(log.durationMs != null ? `${log.durationMs} ms` : '-')}</div>
      <div>${escapeHtml(ts)}</div>
    `;

    button.addEventListener('click', () => {
      selectedIndex = index;
      render(currentLogs);
    });

    listEl.appendChild(button);
  });
}

function renderDetails(log) {
  if (!log) {
    detailsEl.classList.add('hidden');
    detailsEmptyEl.classList.remove('hidden');
    return;
  }

  detailsEl.classList.remove('hidden');
  detailsEmptyEl.classList.add('hidden');

  const meta = remoteMeta(log.url);
  detailTitleEl.textContent = meta.remoteName;
  detailSubtitleEl.textContent = `${meta.shortPath} · ${log.source}`;
  detailMethodEl.textContent = log.method || '[unknown]';
  detailStatusEl.textContent = log.status != null ? `${log.status} (${log.ok ? 'ok' : 'not ok'})` : (log.error ? `error: ${log.error}` : '[unknown]');
  detailDurationEl.textContent = log.durationMs != null ? `${log.durationMs} ms` : '[unknown]';
  detailTsEl.textContent = log.ts || '[unknown]';
  detailUrlEl.textContent = log.url || '[unknown]';
  renderJsonViewer(detailPayloadEl, parseRemotePayload(log.url));
  renderJsonViewer(detailRequestEl, parseRemoteRequestBody(log.requestBody));
  renderJsonViewer(detailResponseEl, parseRemoteResponseBody(log.responseBody));
  detailRawEl.textContent = pretty(log.raw || log);
}

function render(logs) {
  meta.textContent = `${logs.length} remote event${logs.length === 1 ? '' : 's'}`;
  renderList(logs);
  renderDetails(logs[selectedIndex]);
}

function loadStoredLogs() {
  chrome.runtime.sendMessage({ type: 'GET_LOGS' }, (response) => {
    for (const [id, value] of [...logsById.entries()]) {
      if (value.source === 'hook') logsById.delete(id);
    }

    for (const [index, log] of (response?.logs || []).entries()) {
      const normalized = normalizeStoredLog(log, index);
      if (isRemoteUrl(normalized.url)) {
        logsById.set(normalized.id, normalized);
      }
    }

    syncCurrentLogs();
  });
}

function attachNetworkCapture() {
  if (networkListenerAttached) return;
  if (!chrome.devtools?.network) return;
  networkListenerAttached = true;

  const captureRequest = (request) => {
    const normalized = normalizeNetworkRequest(request);
    if (!normalized) return;

    upsertLog(normalized);

    try {
      request.getContent((content) => {
        mergeLogPatch(normalized.id, {
          responseBody: content ?? '[no response body available]',
          raw: request
        });
      });
    } catch {}
  };

  chrome.devtools.network.getHAR((har) => {
    for (const entry of har?.entries || []) captureRequest(entry);
  });

  chrome.devtools.network.onRequestFinished.addListener(captureRequest);
}

refreshBtn.addEventListener('click', () => {
  loadStoredLogs();
});

clearBtn.addEventListener('click', () => {
  selectedIndex = 0;
  logsById.clear();
  syncCurrentLogs();
  chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, () => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!changes.remoteInspectorLogs) return;
  loadStoredLogs();
});

loadPrefs();
applyPrefs();
bindToggle(toggleUrlEl, 'showUrl');
bindToggle(toggleRequestEl, 'showRequest');
bindToggle(toggleResponseEl, 'showResponse');
bindToggle(toggleRawEl, 'showRaw');
loadStoredLogs();
attachNetworkCapture();
