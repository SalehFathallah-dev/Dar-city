import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import App from './App';
import { bootstrap } from './lib/api';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

// Android hardware back button: go back in the app, exit on the home screen.
if (Capacitor.isNativePlatform()) {
  void NativeApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.location.pathname !== '/') window.history.back();
    else void NativeApp.exitApp();
  });
}

bootstrap()
  .then(() => {
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    );
  })
  .catch((e: unknown) => {
    root.render(
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <h2>Unable to open the on-device database</h2>
        <p>{e instanceof Error ? e.message : String(e)}</p>
      </div>,
    );
  });
