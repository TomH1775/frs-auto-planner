import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SyncPage } from './SyncPage';
import './styles.css';

// Opened by the in-game ↻ Sync button: just hand over the saved autos.
const syncTarget = new URLSearchParams(location.search).get('sync');

createRoot(document.getElementById('root')!).render(<StrictMode>{syncTarget ? <SyncPage target={syncTarget} /> : <App />}</StrictMode>);
