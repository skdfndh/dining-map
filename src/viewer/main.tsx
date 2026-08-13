import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ViewerApp } from './ViewerApp';
import '../styles/tokens.css';
import './viewer.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ViewerApp />
  </StrictMode>,
);
