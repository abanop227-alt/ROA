import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { avviaSyncAutomatica } from './lib/autosync';
import { richiediArchivioPersistente } from './lib/db';
import './styles.css';

richiediArchivioPersistente();
avviaSyncAutomatica();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
