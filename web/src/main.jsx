import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SuperAuthProvider } from './context/SuperAuthContext.jsx';
import { CallProvider } from './context/CallContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SuperAuthProvider>
          <CallProvider>
            <App />
          </CallProvider>
        </SuperAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
