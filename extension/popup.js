const meta = document.getElementById('meta');
const logsEl = document.getElementById('logs');
const refreshBtn = document.getElementById('refresh');
const clearBtn = document.getElementById('clear');

function render(logs) {
  meta.textContent = `${logs.length} events`;
  logsEl.textContent = JSON.stringify(logs, null, 2);
}

function load() {
  chrome.runtime.sendMessage({ type: 'GET_LOGS' }, (response) => {
    render(response?.logs || []);
  });
}

refreshBtn.addEventListener('click', load);
clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, () => load());
});

load();
