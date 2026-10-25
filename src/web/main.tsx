import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function Placeholder() {
  return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#0A231E', color: '#F2F5E4', fontFamily: 'system-ui' }}>Signal Loop · building</main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Placeholder /></StrictMode>);
