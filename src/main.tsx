import React from 'react';
import ReactDOM from 'react-dom/client';
import './app/styles/globals.css';
import { AppProvider } from './app/store';
import { App } from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
