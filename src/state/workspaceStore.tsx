import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AIWorkflowPlan, AppStage, HistoryRecord, ToolDefinition, WorkspaceFile } from '../types/workspace';
import { getToolById } from '../registry/toolRegistry';

interface WorkspaceContextValue {
  stage: AppStage;
  selectedTool: ToolDefinition | null;
  files: WorkspaceFile[];
  history: HistoryRecord[];
  searchOpen: boolean;
  historyOpen: boolean;
  initialPreset: string | null;
  initialPlanParams: AIWorkflowPlan['parameters'] | null;
  setSearchOpen: (open: boolean) => void;
  setHistoryOpen: (open: boolean) => void;
  goHome: () => void;
  openToolPrepare: (toolId: string, preset?: string | null) => void;
  openToolExecute: (
    toolId: string,
    overrideFiles?: File[],
    preset?: string | null,
    planParams?: AIWorkflowPlan['parameters'] | null
  ) => void;
  addFiles: (newFiles: File[], replace?: boolean) => WorkspaceFile[];
  removeFile: (id: string) => void;
  clearFiles: () => void;
  recordHistory: (entry: Omit<HistoryRecord, 'id' | 'timestamp'>) => void;
  clearHistory: () => void;
}

const HISTORY_STORAGE_KEY = 'everything_workspace_history_v1';

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function createWorkspaceFile(file: File): WorkspaceFile {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    extension: ext,
    objectUrl: URL.createObjectURL(file),
    addedAt: Date.now(),
  };
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stage, setStage] = useState<AppStage>('discover');
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [initialPreset, setInitialPreset] = useState<string | null>(null);
  const [initialPlanParams, setInitialPlanParams] = useState<AIWorkflowPlan['parameters'] | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 40)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  // Global Cmd/Ctrl + K shortcut for Command Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filesRef = useRef<WorkspaceFile[]>(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      filesRef.current.forEach((f) => URL.revokeObjectURL(f.objectUrl));
    };
  }, []);

  const addFiles = useCallback((newFiles: File[], replace = false): WorkspaceFile[] => {
    const wrapped = newFiles.map(createWorkspaceFile);
    setFiles((prev) => {
      if (replace) {
        prev.forEach((f) => URL.revokeObjectURL(f.objectUrl));
        return wrapped;
      }
      return [...prev, ...wrapped];
    });
    return wrapped;
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.objectUrl));
      return [];
    });
  }, []);

  const goHome = useCallback(() => {
    setStage('discover');
    setSelectedToolId(null);
    setInitialPreset(null);
    setInitialPlanParams(null);
  }, []);

  const openToolPrepare = useCallback((toolId: string, preset: string | null = null) => {
    const tool = getToolById(toolId);
    if (!tool) return;
    setSelectedToolId(tool.id);
    setInitialPreset(preset);
    setInitialPlanParams(null);
    // Tools that don't require an initial file (dev tools, calculators, AI command, recorder) can jump straight to execute or prepare
    if (!tool.requiresFile) {
      setStage('execute');
    } else {
      setStage('prepare');
    }
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const openToolExecute = useCallback(
    (
      toolId: string,
      overrideFiles?: File[],
      preset: string | null = null,
      planParams: AIWorkflowPlan['parameters'] | null = null
    ) => {
      const tool = getToolById(toolId);
      if (!tool) return;
      if (overrideFiles && overrideFiles.length > 0) {
        addFiles(overrideFiles, true);
      }
      setSelectedToolId(tool.id);
      if (preset !== null) {
        setInitialPreset(preset);
      }
      setInitialPlanParams(planParams);
      setStage('execute');
      setSearchOpen(false);
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [addFiles]
  );

  const recordHistory = useCallback((entry: Omit<HistoryRecord, 'id' | 'timestamp'>) => {
    const full: HistoryRecord = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    setHistory((prev) => [full, ...prev].slice(0, 40));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const selectedTool = useMemo(
    () => (selectedToolId ? getToolById(selectedToolId) || null : null),
    [selectedToolId]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        stage,
        selectedTool,
        files,
        history,
        searchOpen,
        historyOpen,
        initialPreset,
        initialPlanParams,
        setSearchOpen,
        setHistoryOpen,
        goHome,
        openToolPrepare,
        openToolExecute,
        addFiles,
        removeFile,
        clearFiles,
        recordHistory,
        clearHistory,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }
  return ctx;
}
