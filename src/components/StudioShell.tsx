import React, { useState } from 'react';
import {
  ArrowLeft,
  Download,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Undo2,
  ZoomIn,
  ZoomOut,
  Menu,
  X,
} from 'lucide-react';
import { useWorkspace } from '../state/workspaceStore';
import { CATEGORY_META, WORKSPACE_STUDIOS } from '../registry/toolRegistry';
import { ToolIcon } from './ToolIcon';

export interface StudioRailTab {
  id: string;
  label: string;
  icon: string;
}

interface StudioShellProps {
  filename: string;
  onFilenameChange?: (name: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onReset?: () => void;
  zoom?: number;
  onZoomChange?: (z: number) => void;
  showBeforeAfterToggle?: boolean;
  beforeAfterActive?: boolean;
  onToggleBeforeAfter?: () => void;
  outputLabel?: string;
  isProcessing?: boolean;
  onExport?: () => void;
  exportLabel?: string;
  exportDisabled?: boolean;
  railTabs?: StudioRailTab[];
  activeRailTab?: string;
  onSelectRailTab?: (id: string) => void;
  settingsPanel?: React.ReactNode;
  bottomMetaLeft?: string;
  bottomMetaRight?: string;
  children: React.ReactNode;
}

export const StudioShell: React.FC<StudioShellProps> = ({
  filename,
  onFilenameChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onReset,
  zoom,
  onZoomChange,
  showBeforeAfterToggle = false,
  beforeAfterActive = false,
  onToggleBeforeAfter,
  outputLabel,
  isProcessing = false,
  onExport,
  exportLabel = 'Export & Download',
  exportDisabled = false,
  railTabs = [],
  activeRailTab,
  onSelectRailTab,
  settingsPanel,
  bottomMetaLeft,
  bottomMetaRight,
  children,
}) => {
  const { selectedTool, goHome, openToolExecute } = useWorkspace();
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [mobileStudiosOpen, setMobileStudiosOpen] = useState(false);

  const cat = selectedTool ? CATEGORY_META[selectedTool.category] : CATEGORY_META.image;

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] min-h-[540px] bg-[#F6F7F9]">
      {/* 52px Contextual Action Bar */}
      <div className="h-[52px] shrink-0 bg-white border-b border-[#E2E5EC] px-3 sm:px-4 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={goHome}
            title="Back to All Tools"
            className="h-8 px-2.5 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-md text-xs font-medium text-[#17191D] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Hub</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileStudiosOpen(true)}
            className="xl:hidden h-8 px-2.5 bg-white hover:bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs font-medium text-[#17191D] inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
          >
            <Menu className="w-3.5 h-3.5" />
            <span>Studios</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span
              className="hidden md:inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: cat.primaryColor }}
            />
            {onFilenameChange ? (
              <input
                type="text"
                value={filename}
                onChange={(e) => onFilenameChange(e.target.value)}
                aria-label="Output filename"
                className="h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] focus:border-[#1D4ED8] focus:bg-white rounded-md text-xs font-mono text-[#17191D] w-36 sm:w-52 truncate focus:outline-none"
              />
            ) : (
              <span className="text-xs font-semibold text-[#17191D] truncate max-w-[180px]">
                {filename}
              </span>
            )}
          </div>

          {(onUndo || onRedo) && (
            <div className="flex items-center gap-1 border-l border-[#E2E5EC] pl-2 shrink-0">
              <button
                type="button"
                disabled={!canUndo}
                onClick={onUndo}
                title="Undo"
                aria-label="Undo"
                className="w-8 h-8 flex items-center justify-center rounded-md border border-[#E2E5EC] bg-white text-[#17191D] disabled:opacity-35 hover:bg-[#F6F7F9] cursor-pointer disabled:cursor-not-allowed"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={onRedo}
                title="Redo"
                aria-label="Redo"
                className="w-8 h-8 flex items-center justify-center rounded-md border border-[#E2E5EC] bg-white text-[#17191D] disabled:opacity-35 hover:bg-[#F6F7F9] cursor-pointer disabled:cursor-not-allowed"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {typeof zoom === 'number' && onZoomChange && (
            <div className="hidden md:flex items-center gap-1 border-l border-[#E2E5EC] pl-2 shrink-0">
              <button
                type="button"
                onClick={() => onZoomChange(Math.max(25, zoom - 25))}
                aria-label="Zoom out"
                className="w-7 h-8 flex items-center justify-center rounded-md hover:bg-[#F6F7F9] text-[#717782] hover:text-[#17191D] cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-xs text-[#17191D] w-11 text-center tabular-nums">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => onZoomChange(Math.min(300, zoom + 25))}
                aria-label="Zoom in"
                className="w-7 h-8 flex items-center justify-center rounded-md hover:bg-[#F6F7F9] text-[#717782] hover:text-[#17191D] cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onZoomChange(100)}
                className="px-2 h-7 text-[11px] font-mono text-[#717782] hover:text-[#17191D] border border-[#E2E5EC] rounded bg-[#F6F7F9] cursor-pointer"
              >
                Fit
              </button>
            </div>
          )}

          {showBeforeAfterToggle && onToggleBeforeAfter && (
            <button
              type="button"
              onClick={onToggleBeforeAfter}
              className={`h-8 px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                beforeAfterActive
                  ? 'bg-[#EFF6FF] border-[#1D4ED8] text-[#1D4ED8]'
                  : 'bg-white border-[#E2E5EC] text-[#17191D] hover:bg-[#F6F7F9]'
              }`}
            >
              <SplitSquareHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Before / After</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {settingsPanel && (
            <button
              type="button"
              onClick={() => setMobileSettingsOpen(true)}
              className="lg:hidden h-8 px-2.5 bg-white hover:bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs font-medium text-[#17191D] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          )}

          {outputLabel && (
            <span className="hidden sm:inline-flex items-center h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-[11px] font-mono text-[#17191D] tabular-nums">
              {outputLabel}
            </span>
          )}

          {onReset && (
            <button
              type="button"
              onClick={onReset}
              title="Reset adjustments"
              className="h-8 px-2.5 bg-white hover:bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs font-medium text-[#717782] hover:text-[#17191D] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Reset</span>
            </button>
          )}

          {onExport && (
            <button
              type="button"
              onClick={onExport}
              disabled={isProcessing || exportDisabled}
              className="h-8 px-3.5 bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'Processing…' : exportLabel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Quick Studio Switcher (xl desktop) */}
        <aside className="hidden xl:flex w-[196px] shrink-0 bg-white border-r border-[#E2E5EC] flex-col justify-between p-3 overflow-y-auto">
          <div className="space-y-1">
            <p className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-[#717782]">
              Workspaces
            </p>
            {WORKSPACE_STUDIOS.map((st) => {
              const active =
                selectedTool?.id === st.id ||
                selectedTool?.workspaceType === st.workspaceType;

              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => openToolExecute(st.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#F6F7F9] text-[#17191D] font-semibold'
                      : 'text-[#717782] hover:bg-[#F6F7F9] hover:text-[#17191D]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: st.color }}
                  />
                  <span className="truncate">{st.label}</span>
                </button>
              );
            })}
          </div>

          <div className="p-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-[11px] text-[#717782]">
            Processed locally in browser memory
          </div>
        </aside>

        {/* 56px/64px Slim Tool Navigation Rail */}
        {railTabs.length > 0 && (
          <nav
            aria-label="Studio tools"
            className="w-[56px] sm:w-[64px] shrink-0 bg-white border-r border-[#E2E5EC] py-2 flex flex-col items-center gap-1 overflow-y-auto"
          >
            {railTabs.map((tab) => {
              const active = activeRailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectRailTab?.(tab.id)}
                  className={`w-11 sm:w-12 py-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                      : 'text-[#717782] hover:bg-[#F6F7F9] hover:text-[#17191D]'
                  }`}
                >
                  <ToolIcon name={tab.icon} className="w-4 h-4" />
                  <span className="text-[10px] font-medium leading-tight text-center px-0.5 truncate max-w-full">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {/* ~268px Contextual Settings Drawer (Desktop) */}
        {settingsPanel && (
          <aside className="hidden lg:block w-[268px] shrink-0 bg-white border-r border-[#E2E5EC] overflow-y-auto p-4">
            {settingsPanel}
          </aside>
        )}

        {/* Central Working Canvas */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          <div className="flex-1 overflow-auto">{children}</div>

          {/* Bottom Metadata Bar */}
          {(bottomMetaLeft || bottomMetaRight) && (
            <div className="h-8 shrink-0 bg-white border-t border-[#E2E5EC] px-4 flex items-center justify-between text-[11px] font-mono text-[#717782] tabular-nums">
              <span className="truncate">{bottomMetaLeft}</span>
              <span className="truncate ml-4">{bottomMetaRight}</span>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Settings Sheet */}
      {mobileSettingsOpen && settingsPanel && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-[#17191D]/40 flex items-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileSettingsOpen(false);
          }}
        >
          <div className="w-full max-h-[82vh] bg-white rounded-t-2xl border-t border-[#E2E5EC] flex flex-col">
            <div className="px-4 py-3 border-b border-[#E2E5EC] flex items-center justify-between">
              <span className="text-sm font-semibold text-[#17191D]">Tool Settings</span>
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => setMobileSettingsOpen(false)}
                className="p-1.5 rounded-md border border-[#E2E5EC] hover:bg-[#F6F7F9] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{settingsPanel}</div>
          </div>
        </div>
      )}

      {/* Mobile Studios Drawer */}
      {mobileStudiosOpen && (
        <div className="fixed inset-0 z-50 xl:hidden bg-[#17191D]/40 flex">
          <div className="w-64 bg-white h-full border-r border-[#E2E5EC] p-4 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E5EC]">
              <span className="text-sm font-bold text-[#17191D]">Switch Studio</span>
              <button
                type="button"
                aria-label="Close studio switcher"
                onClick={() => setMobileStudiosOpen(false)}
                className="p-1.5 rounded-md border border-[#E2E5EC] hover:bg-[#F6F7F9] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 space-y-1 overflow-y-auto">
              {WORKSPACE_STUDIOS.map((st) => {
                const active =
                  selectedTool?.id === st.id ||
                  selectedTool?.workspaceType === st.workspaceType;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setMobileStudiosOpen(false);
                      openToolExecute(st.id);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#F6F7F9] text-[#17191D] font-semibold'
                        : 'text-[#717782] hover:bg-[#F6F7F9] hover:text-[#17191D] font-medium'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: st.color }}
                    />
                    <span className="truncate">{st.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileStudiosOpen(false)} />
        </div>
      )}
    </div>
  );
};
