import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { ensureMockApi } from './demo/mockApi';

// GitHub Pages demo: no Electron preload -> use fictional mock data
ensureMockApi();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);