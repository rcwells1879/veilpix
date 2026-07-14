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
