import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// 移除 StrictMode 以避免 WebRTC PC 双重创建/销毁
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);