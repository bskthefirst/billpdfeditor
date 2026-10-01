import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/gaegu/400.css';
import '@fontsource/gaegu/700.css';
import '@fontsource/caveat/700.css';
import './styles.css';
import App from './App';
import { engine } from './engine/instance';
import { useApp } from './state/store';

// Debug handle for devtools and the automated browser checks (dev builds only).
if (import.meta.env.DEV) Object.assign(window, { __lab: { engine, useApp } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
