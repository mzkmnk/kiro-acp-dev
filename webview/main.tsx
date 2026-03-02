import * as React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

const mountNode = document.getElementById('root');
if (!mountNode) {
  throw new Error('Root element (#root) was not found.');
}

createRoot(mountNode).render(<App />);
