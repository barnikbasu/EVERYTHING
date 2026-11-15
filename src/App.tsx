import React, { Suspense, lazy, useState } from 'react';
import { WorkspaceProvider, useWorkspace } from './state/workspaceStore';
import { Header } from './components/Header';
import { StageADiscover } from './components/StageADiscover';
import type { ToolCategoryId } from './types/workspace';

const StageBPrepare = lazy(() =>
  import('./components/StageBPrepare').then((m) => ({ default: m.StageBPrepare }))
);
const StageCExecute = lazy(() =>
  import('./components/StageCExecute').then((m) => ({ default: m.StageCExecute }))
);
const CommandSearchModal = lazy(() =>
  import('./components/CommandSearchModal').then((m) => ({ default: m.CommandSearchModal }))
);
const HistoryDrawer = lazy(() =>
  import('./components/HistoryDrawer').then((m) => ({ default: m.HistoryDrawer }))
);

const StageLoadingFallback: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center bg-[#F6F7F9]">
    <div className="bg-white border border-[#E2E5EC] rounded-xl px-5 py-3 text-xs font-mono text-[#717782]">
      Loading workspace…
    </div>
  </div>
);

const EverythingShell: React.FC = () => {
  const { stage, searchOpen, historyOpen } = useWorkspace();
  const [activeCategory, setActiveCategory] = useState<ToolCategoryId | 'all'>('all');

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] text-[#17191D]">
      <Header activeCategory={activeCategory} onSelectCategory={setActiveCategory} />

      <main className="flex-1">
        {stage === 'discover' && (
          <StageADiscover
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
          />
        )}
        {stage === 'prepare' && (
          <Suspense fallback={<StageLoadingFallback />}>
            <StageBPrepare />
          </Suspense>
        )}
        {stage === 'execute' && (
          <Suspense fallback={<StageLoadingFallback />}>
            <StageCExecute />
          </Suspense>
        )}
      </main>

      {searchOpen && (
        <Suspense fallback={null}>
          <CommandSearchModal />
        </Suspense>
      )}
      {historyOpen && (
        <Suspense fallback={null}>
          <HistoryDrawer />
        </Suspense>
      )}
    </div>
  );
};

export default function App() {
  return (
    <WorkspaceProvider>
      <EverythingShell />
    </WorkspaceProvider>
  );
}
