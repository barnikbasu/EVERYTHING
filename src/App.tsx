import React, { useState } from 'react';
import { WorkspaceProvider, useWorkspace } from './state/workspaceStore';
import { Header } from './components/Header';
import { StageADiscover } from './components/StageADiscover';
import { StageBPrepare } from './components/StageBPrepare';
import { StageCExecute } from './components/StageCExecute';
import { CommandSearchModal } from './components/CommandSearchModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import type { ToolCategoryId } from './types/workspace';

const EverythingShell: React.FC = () => {
  const { stage } = useWorkspace();
  const [activeCategory, setActiveCategory] = useState<ToolCategoryId | 'all'>('all');

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] text-[#17191D]">
      <Header activeCategory={activeCategory} onSelectCategory={setActiveCategory} />

      <div className="flex-1">
        {stage === 'discover' && (
          <StageADiscover
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
          />
        )}
        {stage === 'prepare' && <StageBPrepare />}
        {stage === 'execute' && <StageCExecute />}
      </div>

      <CommandSearchModal />
      <HistoryDrawer />
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
