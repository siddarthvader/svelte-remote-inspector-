# Remote Function Inspector (Browser Extension POC)

This repository now includes a minimal Chromium extension that records request/response payloads for remote function calls.

## What problem it solves

If your app calls remote functions from browser code and those requests become encrypted before they leave the page, a normal network inspector may only show encrypted bytes. This extension instruments browser APIs **inside the page context** to capture payloads at call time.

## Important limitations

- If payloads are already encrypted before `fetch`/`XMLHttpRequest`, this extension will still see the encrypted payload unless you also hook your app's encryption layer.
- Do this only in environments where you have authorization (dev/test/staging).
- Response bodies are captured as text for inspection; binary data is truncated/ignored.

## Quick start

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Open your app tab and refresh it after loading the extension.
5. Open DevTools and use the **Remote Inspector** panel.
6. The popup can still show raw stored logs, but the DevTools panel is the main UI.

## How it works

- `content.js` injects `page-hook.js` into the page's JS world.
- `page-hook.js` hooks browser requests and only captures `/_app/remote/` calls.
- `service_worker.js` stores captured events.
- `devtools.html` / `devtools-panel.html` add a **Remote Inspector** DevTools panel.
- The DevTools panel also listens to DevTools network events for `/_app/remote/` requests.
- Payload/result parsing is aligned with SvelteKit remote function encoding from `../kit/packages/kit/src/runtime/shared.js` and server response handling from `../kit/packages/kit/src/runtime/server/remote.js`.

## Next enhancements

- Add filtering by domain/path.
- Add a "redact sensitive fields" map before storage.
- Hook app-specific crypto wrapper if needed (e.g. `encryptPayload`).
