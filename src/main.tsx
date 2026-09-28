import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { richiediArchivioPersistente } from './lib/db';
import './styles.css';

richiediArchivioPersistente();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
