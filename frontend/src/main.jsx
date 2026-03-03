import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#0d0d0d', color: '#e8e8e8', border: '1px solid #2a2a2a' },
          duration: 3000,
        }}
      />
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
