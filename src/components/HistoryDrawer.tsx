import React from 'react';
import { X, Trash2, ArrowUpRight, Clock } from 'lucide-react';
import { useWorkspace } from '../state/workspaceStore';
import { formatBytes, formatDurationMs } from '../utils/formatters';
import { CATEGORY_META } from '../registry/toolRegistry';

export const HistoryDrawer: React.FC = () => {
  const { historyOpen, setHistoryOpen, history, clearHistory, openToolPrepare } = useWorkspace();

  React.useEffect(() => {
    if (!historyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setHistoryOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyOpen, setHistoryOpen]);

  if (!historyOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#17191D]/30 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setHistoryOpen(false);
      }}
    >
      <div
        className="w-full max-w-md bg-white h-full border-l border-[#E2E5EC] flex flex-col shadow-xl"
        role="dialog"
        aria-label="Recent Processing History"
      >
        <div className="h-[60px] px-5 border-b border-[#E2E5EC] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#17191D]">Recent Activity</h2>
            <p className="text-xs text-[#717782]">Stored locally in your browser · metadata only</p>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#717782] hover:text-[#E5322D] border border-[#E2E5EC] rounded-md cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close history drawer"
              className="p-1.5 text-[#717782] hover:text-[#17191D] rounded-md border border-[#E2E5EC] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {history.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center px-6">
              <Clock className="w-8 h-8 text-[#717782]/50 mb-3" />
              <p className="text-sm font-medium text-[#17191D]">No completed jobs yet</p>
              <p className="text-xs text-[#717782] mt-1">
                When you process or export a file, a lightweight record (filename, sizes, duration) appears here. File contents are never persisted.
              </p>
            </div>
          ) : (
            history.map((item) => {
              const cat = CATEGORY_META[item.category];
              const savedPct =
                item.inputSize > 0 && item.outputSize < item.inputSize
                  ? Math.round(((item.inputSize - item.outputSize) / item.inputSize) * 100)
                  : null;
              return (
                <div
                  key={item.id}
                  className="p-3.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-[#17191D] truncate">
                          {item.toolName}
                        </span>
                        <span className="text-[#717782]">·</span>
                        <span style={{ color: cat?.primaryColor || '#717782' }}>
                          {cat?.shortLabel}
                        </span>
                      </div>
                      <p className="text-xs text-[#717782] truncate mt-0.5 font-mono">
                        {item.outputFilename}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryOpen(false);
                        openToolPrepare(item.toolId);
                      }}
                      className="shrink-0 p-1.5 bg-white border border-[#E2E5EC] rounded-md text-[#717782] hover:text-[#1D4ED8] cursor-pointer"
                      title={`Open ${item.toolName}`}
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#717782] tabular-nums">
                    <span>
                      {formatBytes(item.inputSize)} → {formatBytes(item.outputSize)}
                      {savedPct !== null && savedPct > 0 ? ` (-${savedPct}%)` : ''}
                    </span>
                    <span>
                      {formatDurationMs(item.durationMs)} ·{' '}
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
