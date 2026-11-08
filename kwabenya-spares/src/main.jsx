// The actual entry point of the whole frontend — this is the first
// JavaScript that runs, referenced directly from index.html via
// <script type="module" src="/src/main.jsx">.

import React from 'react';
import ReactDOM from 'react-dom/client'; // React 18's new root API (createRoot)
import App from './App.jsx'; // the single component that contains the entire application
import './index.css'; // Tailwind's base/components/utilities layers — must be imported somewhere for the build to include the generated CSS

// Find the empty <div id="root"> in index.html, turn it into a React root,
// and render <App /> into it. StrictMode is a development-only helper that
// intentionally double-invokes some functions to help catch bugs early —
// it has no effect on the production build's actual behavior.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
