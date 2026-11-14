import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  X,
  ArrowRight,
  Upload,
  FolderOpen,
  Layers,
  Terminal,
  ShieldCheck,
  Code2,
  Calculator,
  Clock,
} from 'lucide-react';
import {
  CATEGORY_META,
  TOOL_REGISTRY,
  WORKSPACE_STUDIOS,
  matchesToolQuery,
} from '../registry/toolRegistry';
import { useWorkspace } from '../state/workspaceStore';
import type { ToolCategoryId, ToolDefinition } from '../types/workspace';
import { ToolIcon } from './ToolIcon';
import { formatBytes, validateFilesForTool } from '../utils/formatters';

export const CommandSearchModal: React.FC = () => {
  const { searchOpen, setSearchOpen, openToolPrepare, openToolExecute, history } = useWorkspace();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ToolCategoryId | 'all'>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setDropError(null);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [searchOpen]);

  const filteredTools = useMemo(() => {
    return TOOL_REGISTRY.filter((tool) => {
      if (categoryFilter !== 'all' && tool.category !== categoryFilter) return false;
      return matchesToolQuery(tool, query);
    });
  }, [query, categoryFilter]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, categoryFilter]);

  const activeTool: ToolDefinition | undefined = filteredTools[activeIndex] || filteredTools[0];

  useEffect(() => {
    if (activeTool?.presets && activeTool.presets.length > 0) {
      setSelectedPreset(activeTool.presets[0].id);
    } else {
      setSelectedPreset(null);
    }
    setDropError(null);
  }, [activeTool?.id]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSearchOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(filteredTools.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && activeTool) {
        e.preventDefault();
        openToolPrepare(activeTool.id, selectedPreset);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, filteredTools.length, activeTool, selectedPreset, openToolPrepare, setSearchOpen]);

  if (!searchOpen) return null;

  const handleQuickFiles = (fileList: FileList | null) => {
    if (!fileList || !activeTool) return;
    const arr = Array.from(fileList);
    const { valid, errors } = validateFilesForTool(arr, activeTool);
    if (errors.length > 0) {
      setDropError(errors[0]);
      return;
    }
    if (valid.length > 0) {
      openToolExecute(activeTool.id, valid, selectedPreset);
    }
  };

  const recentForTool = activeTool
    ? history.filter((h) => h.toolId === activeTool.id).slice(0, 2)
    : [];

  const filterChips: Array<{ id: ToolCategoryId | 'all'; label: string }> = [
    { id: 'all', label: 'All Categories' },
    { id: 'pdf', label: 'PDF & Docs' },
    { id: 'image', label: 'Image & Cutout' },
    { id: 'audio-video', label: 'Audio & Video' },
    { id: 'design', label: 'Design' },
    { id: 'developer', label: 'Dev & Code' },
  ];

  const studioNav = WORKSPACE_STUDIOS.slice(0, 6);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#17191D]/40 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSearchOpen(false);
      }}
    >
      <div
        className="w-full max-w-[1140px] max-h-[88vh] bg-white border border-[#E2E5EC] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-label="Global Command Search"
      >
        <div className="flex flex-1 min-h-0">
          {/* Left Studio Rail (Desktop) */}
          <aside className="hidden md:flex w-[210px] shrink-0 bg-[#F6F7F9] border-r border-[#E2E5EC] flex-col justify-between p-3 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[#717782] mb-1.5">
                  Studios
                </p>
                <div className="space-y-0.5">
                  {studioNav.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openToolPrepare(s.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-[#17191D] hover:bg-white rounded-md transition-colors cursor-pointer text-left"
                    >
                      <ToolIcon name={s.iconName} className="w-3.5 h-3.5 text-[#717782]" />
                      <span className="truncate">{s.shortLabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[#717782] mb-1.5">
                  Utilities
                </p>
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => openToolPrepare('batch-lab')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-[#17191D] hover:bg-white rounded-md cursor-pointer text-left"
                  >
                    <Layers className="w-3.5 h-3.5 text-[#717782]" />
                    <span>Batch Lab</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openToolExecute('dev-formatters')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-[#17191D] hover:bg-white rounded-md cursor-pointer text-left"
                  >
                    <Code2 className="w-3.5 h-3.5 text-[#717782]" />
                    <span>Developer Toolbox</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openToolExecute('util-calculators')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-[#17191D] hover:bg-white rounded-md cursor-pointer text-left"
                  >
                    <Calculator className="w-3.5 h-3.5 text-[#717782]" />
                    <span>Everyday Calculators</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openToolPrepare('privacy-metadata')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-[#17191D] hover:bg-white rounded-md cursor-pointer text-left"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#717782]" />
                    <span>Privacy & Metadata</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openToolExecute('ai-command')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] hover:bg-white rounded-md cursor-pointer text-left"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>AI Command</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-2.5 bg-white border border-[#E2E5EC] rounded-lg text-[11px] font-mono text-[#717782]">
              Local-First Suite
              <br />
              Files remain in browser RAM
            </div>
          </aside>

          {/* Center Search + Matching Tools */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#F6F7F9]/50">
            <div className="p-4 border-b border-[#E2E5EC] bg-white space-y-3">
              <div className="flex items-center gap-2.5 px-3.5 h-11 bg-[#F6F7F9] border border-[#E2E5EC] focus-within:border-[#1D4ED8] focus-within:bg-white rounded-lg transition-colors">
                <Search className="w-4 h-4 text-[#1D4ED8] shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tools, formats, or actions (e.g. pdf compress, remove bg, json, ocr)…"
                  className="flex-1 bg-transparent text-sm text-[#17191D] placeholder:text-[#717782] focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="p-1 text-[#717782] hover:text-[#17191D] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="px-2 py-0.5 text-[11px] font-mono bg-white border border-[#E2E5EC] rounded text-[#717782] hover:text-[#17191D] cursor-pointer"
                >
                  ESC to dismiss
                </button>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {filterChips.map((chip) => {
                  const active = categoryFilter === chip.id;
                  const count =
                    chip.id === 'all'
                      ? TOOL_REGISTRY.length
                      : TOOL_REGISTRY.filter((t) => t.category === chip.id).length;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setCategoryFilter(chip.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#17191D] text-white border-[#17191D]'
                          : 'bg-white text-[#717782] border-[#E2E5EC] hover:text-[#17191D]'
                      }`}
                    >
                      {chip.label} <span className="font-mono opacity-75">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#717782] uppercase tracking-wide px-1">
                <span>Matching Tools ({filteredTools.length})</span>
                <span>Navigate with ↑ ↓</span>
              </div>

              {filteredTools.length === 0 ? (
                <div className="py-12 text-center bg-white border border-[#E2E5EC] rounded-lg">
                  <FolderOpen className="w-8 h-8 text-[#717782]/50 mx-auto mb-2" />
                  <p className="text-sm font-medium text-[#17191D]">No tools matched "{query}"</p>
                  <p className="text-xs text-[#717782] mt-1">
                    Try searching a file extension (PDF, PNG, MP3, CSV) or open AI Command.
                  </p>
                </div>
              ) : (
                filteredTools.map((tool, idx) => {
                  const cat = CATEGORY_META[tool.category];
                  const isSelected = activeTool?.id === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => openToolPrepare(tool.id, selectedPreset)}
                      className={`w-full text-left p-3.5 rounded-lg border transition-colors flex items-start gap-3.5 cursor-pointer ${
                        isSelected
                          ? 'bg-white border-[#1D4ED8] ring-1 ring-[#1D4ED8]/20'
                          : 'bg-white border-[#E2E5EC] hover:border-[#C5CBD6]'
                      }`}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
                        style={{
                          backgroundColor: cat.lightTint,
                          color: cat.primaryColor,
                          borderColor: `${cat.primaryColor}25`,
                        }}
                      >
                        <ToolIcon name={tool.iconName} className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-sm font-semibold text-[#17191D] truncate">
                            {tool.name}
                          </span>
                          <span className="text-[#717782]">·</span>
                          <span className="font-medium" style={{ color: cat.primaryColor }}>
                            {tool.categoryLabel}
                          </span>
                          <span className="text-[#717782]">·</span>
                          <span className="font-mono text-[11px] text-[#717782] truncate">
                            {tool.engineName}
                          </span>
                        </div>
                        <p className="text-xs text-[#717782] mt-0.5 line-clamp-1">
                          {tool.description}
                        </p>
                      </div>
                      <span className="font-mono text-[11px] text-[#717782] shrink-0">
                        {isSelected ? 'Return ↵' : `#${idx + 1}`}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Inspector Panel */}
          {activeTool && (
            <div className="hidden lg:flex w-[320px] shrink-0 bg-white border-l border-[#E2E5EC] flex-col p-4 overflow-y-auto justify-between">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-wider text-[#1D4ED8]">
                    Active Action
                  </p>
                  <div className="flex items-center gap-2.5 mt-1.5">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: CATEGORY_META[activeTool.category].lightTint,
                        color: CATEGORY_META[activeTool.category].primaryColor,
                      }}
                    >
                      <ToolIcon name={activeTool.iconName} className="w-4 h-4" />
                    </div>
                    <h3 className="text-base font-bold text-[#17191D] leading-tight">
                      {activeTool.name}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-mono text-[#717782] mt-2.5">
                    <span>{activeTool.engineName}</span>
                    <span>·</span>
                    <span>
                      {activeTool.processingMode === 'local' ? 'Local Execution' : 'Local + Opt-in AI'}
                    </span>
                  </div>
                </div>

                {activeTool.presets && activeTool.presets.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-[#717782]">
                      Preset Profile
                    </p>
                    {activeTool.presets.map((preset) => (
                      <label
                        key={preset.id}
                        className={`flex items-start justify-between gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selectedPreset === preset.id
                            ? 'bg-[#EFF6FF] border-[#1D4ED8]'
                            : 'bg-[#F6F7F9] border-[#E2E5EC] hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="radio"
                            name="cmd-preset"
                            checked={selectedPreset === preset.id}
                            onChange={() => setSelectedPreset(preset.id)}
                            className="mt-0.5 accent-[#1D4ED8]"
                          />
                          <div>
                            <div className="text-xs font-semibold text-[#17191D]">{preset.label}</div>
                            <div className="text-[11px] text-[#717782]">{preset.detail}</div>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-[#717782] shrink-0">
                          {preset.badge}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {activeTool.requiresFile && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple={activeTool.supportsMultiple}
                      accept={
                        activeTool.acceptedExtensions.includes('*')
                          ? undefined
                          : activeTool.acceptedExtensions.map((e) => `.${e}`).join(',')
                      }
                      className="hidden"
                      onChange={(e) => handleQuickFiles(e.target.files)}
                    />
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleQuickFiles(e.dataTransfer.files);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className="p-4 border border-dashed border-[#C5CBD6] hover:border-[#1D4ED8] bg-[#F6F7F9] rounded-lg text-center cursor-pointer transition-colors"
                    >
                      <Upload className="w-5 h-5 text-[#1D4ED8] mx-auto mb-1.5" />
                      <p className="text-xs font-semibold text-[#17191D]">
                        Drop file here to launch
                      </p>
                      <p className="text-[11px] text-[#717782] mt-0.5 font-mono">
                        {activeTool.acceptedExtensions.includes('*')
                          ? 'Any file type'
                          : activeTool.acceptedExtensions.map((e) => e.toUpperCase()).join(', ')}
                      </p>
                    </div>
                    {dropError && (
                      <p className="text-xs text-[#E5322D] mt-1.5">{dropError}</p>
                    )}
                  </div>
                )}

                {recentForTool.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-[#717782]">
                      Recent Runs
                    </p>
                    {recentForTool.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between px-2.5 py-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-[11px] font-mono"
                      >
                        <span className="truncate text-[#17191D] flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-[#717782] shrink-0" />
                          {h.outputFilename}
                        </span>
                        <span className="text-[#717782] shrink-0 ml-2">
                          {formatBytes(h.outputSize)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => openToolPrepare(activeTool.id, selectedPreset)}
                className="mt-4 w-full py-2.5 px-4 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Open {activeTool.name}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Bottom Keyboard Footer */}
        <div className="h-9 px-4 bg-[#F6F7F9] border-t border-[#E2E5EC] flex items-center justify-between text-[11px] font-mono text-[#717782]">
          <span>
            Showing {filteredTools.length} tool{filteredTools.length === 1 ? '' : 's'}
          </span>
          <div className="hidden sm:flex items-center gap-4">
            <span>↵ Select Tool</span>
            <span>↑↓ Navigate</span>
            <span>ESC Close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
