// 应用入口
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.jsx';
// 样式
import './styles/base.css';
import './styles/layout.css';
import './styles/sidebar.css';
import './styles/main.css';
import './styles/markdown.css';
import './styles/modal.css';
import './styles/toast.css';
import './styles/ai-drawer.css';
import './styles/ai-config.css';
import './styles/insert-mode.css';
import './styles/language-toggle.css';
import './styles/dir-tabs.css';
import './styles/image-gallery.css';
import './styles/responsive.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
