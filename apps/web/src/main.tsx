import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './layout/AppShell';
import { IdleMenu } from './layout/IdleMenu';
import { FilterSearchPanel } from './components/FilterSearchPanel';
import { FullListPanel } from './components/FullListPanel';
import { ChatPanel } from './components/ChatPanel';
import './styles/index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<IdleMenu />} />
          <Route path="filter" element={<FilterSearchPanel />} />
          <Route path="list" element={<FullListPanel />} />
          <Route path="chat" element={<ChatPanel />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
