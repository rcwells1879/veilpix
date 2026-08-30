/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ClerkWrapper } from './src/clerk';
import { QueryProvider } from './src/queryClient';
import './index.css';

const CHUNK_RECOVERY_KEY = 'veilpix:chunk-recovery-at';
const CHUNK_RECOVERY_WINDOW_MS = 60_000;

// A tab can remain open while Cloudflare publishes a new release. Its old main
// bundle may then request a hashed lazy chunk that no longer exists. Vite emits
// this event before surfacing that failure, so reload once onto the current
// release while guarding against a reload loop during a real network outage.
window.addEventListener('vite:preloadError', (event) => {
  let lastRecovery = Number.NaN;

  try {
    lastRecovery = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY));
  } catch {
    // If storage is unavailable, leave the original error intact rather than
    // risk an unbounded refresh loop.
    return;
  }

  const now = Date.now();
  if (Number.isFinite(lastRecovery) && now - lastRecovery < CHUNK_RECOVERY_WINDOW_MS) return;

  event.preventDefault();
  sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
  window.location.reload();
});

window.setTimeout(() => {
  try {
    sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
  } catch {
    // Storage can be disabled independently of page execution.
  }
}, CHUNK_RECOVERY_WINDOW_MS);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ClerkWrapper>
      <QueryProvider>
        <App />
      </QueryProvider>
    </ClerkWrapper>
  </React.StrictMode>
);
