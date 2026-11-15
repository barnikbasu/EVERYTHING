import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Upload,
  ClipboardPaste,
  ShieldCheck,
  Cpu,
  HardDrive,
  ArrowRight,
  X,
  FileCheck,
  Search,
} from 'lucide-react';
import {
  CATEGORY_META,
  TOOL_REGISTRY,
  detectFilesRouting,
  getToolById,
  matchesToolQuery,
} from '../registry/toolRegistry';
import type { ToolCategoryId, ToolDefinition } from '../types/workspace';
import { useWorkspace } from '../state/workspaceStore';
import { ToolIcon } from './ToolIcon';
import { formatBytes } from '../utils/formatters';
import { readSupportedClipboardFiles } from '../utils/clipboard';
import { useClipboardFilePaste } from '../hooks/useClipboardFilePaste';

interface StageADiscoverProps {
  activeCategory: ToolCategoryId | 'all';
  onSelectCategory: (cat: ToolCategoryId | 'all') => void;
}

const ORDERED_CATEGORIES: ToolCategoryId[] = [
  'convert',
  'pdf',
  'image',
  'audio-video',
  'design',
  'office',
  'ocr',
  'developer',
  'utilities',
  'privacy',
  'ai-batch',
];

export const StageADiscover: React.FC<StageADiscoverProps> = ({
  activeCategory,
  onSelectCategory,
}) => {
  const { openToolPrepare, openToolExecute } = useWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [detectedFiles, setDetectedFiles] = useState<File[]>([]);
  const [sortMode, setSortMode] = useState<'popular' | 'alpha' | 'all'>('popular');
  const [localFilter, setLocalFilter] = useState('');
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

  const routing = useMemo(() => detectFilesRouting(detectedFiles), [detectedFiles]);

  useClipboardFilePaste((pasted) => {
    setDetectedFiles(pasted);
    setPasteNotice(null);
  });

  const handlePasteButton = async () => {
    setPasteNotice(null);
    const { files: pasted, unsupportedError } = await readSupportedClipboardFiles('pasted_asset');
    if (pasted.length > 0) {
      setDetectedFiles(pasted);
    } else if (unsupportedError) {
      setPasteNotice(unsupportedError);
    }
  };

  const handleFileSelection = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setDetectedFiles(Array.from(fileList));
    setPasteNotice(null);
  };

  const visibleCategories = useMemo(() => {
    const cats = activeCategory === 'all' ? ORDERED_CATEGORIES : [activeCategory];
    return cats.filter((catId) => {
      const tools = TOOL_REGISTRY.filter((t) => t.category === catId);
      if (!localFilter.trim()) return tools.length > 0;
      return tools.some((t) => matchesToolQuery(t, localFilter));
    });
  }, [activeCategory, localFilter]);

  const sortAndFilterTools = (tools: ToolDefinition[]) => {
    const filtered = localFilter.trim()
      ? tools.filter((t) => matchesToolQuery(t, localFilter))
      : tools;

    if (sortMode === 'alpha') {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortMode === 'popular') {
      return [...filtered].sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)));
    }
    return filtered;
  };

  const hardwareCores =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : null;

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* Universal Dropzone Hero */}
      <section aria-label="Universal file dropzone">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelection(e.target.files)}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileSelection(e.dataTransfer.files);
          }}
          className={`bg-white border rounded-xl px-6 py-9 sm:py-11 transition-colors text-center ${
            isDragging
              ? 'border-[#1D4ED8] bg-[#EFF6FF]/40 ring-2 ring-[#1D4ED8]/15'
              : 'border-[#E2E5EC]'
          }`}
        >
          {detectedFiles.length === 0 ? (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="w-11 h-11 mx-auto rounded-xl bg-[#EFF6FF] border border-[#1D4ED8]/15 flex items-center justify-center text-[#1D4ED8]">
                <Upload className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-[32px] font-bold tracking-tight text-[#17191D] text-balance leading-tight">
                  Drop any PDF, Image, Audio, or Video file here
                </h1>
                <p className="text-sm text-[#717782] max-w-xl mx-auto leading-relaxed">
                  Smart detection identifies your file type and routes it to the right local workspace. Everything you need, processed in your browser.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-10 px-5 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Upload className="w-4 h-4" />
                  <span>Select Local File</span>
                </button>
                <button
                  type="button"
                  onClick={() => openToolExecute('convert-anything')}
                  className="h-10 px-4 bg-white hover:bg-[#F6F7F9] text-[#17191D] border border-[#E2E5EC] text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ArrowLeftRight className="w-4 h-4 text-[#1D4ED8]" />
                  <span>Convert Anything</span>
                </button>
                <button
                  type="button"
                  onClick={handlePasteButton}
                  className="h-10 px-4 bg-white hover:bg-[#F6F7F9] text-[#17191D] border border-[#E2E5EC] text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ClipboardPaste className="w-4 h-4 text-[#717782]" />
                  <span>Paste from Clipboard</span>
                  <kbd className="font-mono text-[10px] text-[#717782] bg-[#F6F7F9] px-1.5 py-0.5 rounded border border-[#E2E5EC]">
                    ⌘V
                  </kbd>
                </button>
              </div>

              {pasteNotice && (
                <p className="text-xs text-[#717782] pt-1">{pasteNotice}</p>
              )}

              <p className="text-xs text-[#717782] pt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0D9488]" />
                  Processed locally in your browser
                </span>
                <span aria-hidden="true">·</span>
                <span>No account required</span>
                <span aria-hidden="true">·</span>
                <span>Originals stay untouched until export</span>
              </p>
            </div>
          ) : (
            /* Detected File Routing Panel (Safe next-step choice, never auto-destructive) */
            <div className="max-w-3xl mx-auto text-left space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#E2E5EC]">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center shrink-0">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-[#17191D]">
                        Detected: {routing.label}
                      </h2>
                      <span className="text-xs font-mono text-[#717782] tabular-nums">
                        ({formatBytes(detectedFiles.reduce((s, f) => s + f.size, 0))})
                      </span>
                    </div>
                    <p className="text-xs text-[#717782] mt-0.5 font-mono truncate max-w-md">
                      {detectedFiles.map((f) => f.name).join(', ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-medium bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg text-[#17191D] cursor-pointer"
                  >
                    Change Files
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetectedFiles([])}
                    aria-label="Clear selected files"
                    className="p-1.5 text-[#717782] hover:text-[#17191D] border border-[#E2E5EC] rounded-lg cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#717782] uppercase tracking-wider mb-2.5">
                  Choose a workspace to continue
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {routing.recommendedToolIds.map((toolId, idx) => {
                    const tool = getToolById(toolId);
                    if (!tool) return null;
                    const cat = CATEGORY_META[tool.category];
                    const isPrimary = idx === 0;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => openToolExecute(tool.id, detectedFiles)}
                        className={`p-3 rounded-lg border text-left transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                          isPrimary
                            ? 'bg-[#1D4ED8] text-white border-[#1D4ED8] hover:bg-[#1E40AF]'
                            : 'bg-[#F6F7F9] text-[#17191D] border-[#E2E5EC] hover:bg-white hover:border-[#C5CBD6]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: isPrimary ? 'rgba(255,255,255,0.18)' : cat.lightTint,
                              color: isPrimary ? '#FFFFFF' : cat.primaryColor,
                            }}
                          >
                            <ToolIcon name={tool.iconName} className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{tool.name}</div>
                            <div
                              className={`text-[11px] truncate ${
                                isPrimary ? 'text-white/80' : 'text-[#717782]'
                              }`}
                            >
                              {tool.engineName}
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Filter & Sort Bar */}
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => onSelectCategory('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-[#17191D] text-white border-[#17191D]'
                  : 'bg-white text-[#717782] border-[#E2E5EC] hover:text-[#17191D]'
              }`}
            >
              All Tools <span className="font-mono opacity-75">{TOOL_REGISTRY.length}</span>
            </button>
            {ORDERED_CATEGORIES.map((catId) => {
              const meta = CATEGORY_META[catId];
              const count = TOOL_REGISTRY.filter((t) => t.category === catId).length;
              const active = activeCategory === catId;
              return (
                <button
                  key={catId}
                  type="button"
                  onClick={() => onSelectCategory(catId)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#17191D] text-white border-[#17191D]'
                      : 'bg-white text-[#717782] border-[#E2E5EC] hover:text-[#17191D]'
                  }`}
                >
                  {meta.shortLabel} <span className="font-mono opacity-75">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Inline Filter & Sort */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex-1 sm:w-52">
              <Search className="w-3.5 h-3.5 text-[#717782] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={localFilter}
                onChange={(e) => setLocalFilter(e.target.value)}
                placeholder="Filter visible tools…"
                className="w-full h-8 pl-8 pr-3 bg-white border border-[#E2E5EC] rounded-lg text-xs text-[#17191D] placeholder:text-[#717782] focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>
            <div className="flex items-center bg-white border border-[#E2E5EC] rounded-lg p-0.5 text-xs">
              {(['popular', 'alpha'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSortMode(mode)}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                    sortMode === mode
                      ? 'bg-[#F6F7F9] text-[#17191D]'
                      : 'text-[#717782] hover:text-[#17191D]'
                  }`}
                >
                  {mode === 'popular' ? 'Popular' : 'A–Z'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Honest Capability Summary Strip (3 cards) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white border border-[#E2E5EC] rounded-lg px-4 py-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#717782]">
                Local Compute Environment
              </p>
              <p className="text-sm font-semibold text-[#17191D] mt-0.5">
                {hardwareCores ? `${hardwareCores} Browser CPU Threads` : 'In-Browser Execution'}
              </p>
              <p className="text-xs text-[#717782]">Canvas 2D, Web Audio & WebAssembly engines</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white border border-[#E2E5EC] rounded-lg px-4 py-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#717782]">
                Document & Media Stack
              </p>
              <p className="text-sm font-semibold text-[#17191D] mt-0.5">
                PDF.js · pdf-lib · Tesseract · SheetJS
              </p>
              <p className="text-xs text-[#717782]">Lazy-loaded only when you open a studio</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-[#F0FDFA] text-[#0D9488] flex items-center justify-center shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white border border-[#E2E5EC] rounded-lg px-4 py-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#717782]">
                Privacy Architecture
              </p>
              <p className="text-sm font-semibold text-[#17191D] mt-0.5">
                Local by Default · Explicit Cloud Consent
              </p>
              <p className="text-xs text-[#717782]">Optional AI features never upload without approval</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-[#F5F3FF] text-[#7C3AED] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
        </div>
      </section>

      {/* Categorized Tool Grids */}
      <div className="space-y-8">
        {visibleCategories.map((catId) => {
          const meta = CATEGORY_META[catId];
          const tools = sortAndFilterTools(TOOL_REGISTRY.filter((t) => t.category === catId));
          if (tools.length === 0) return null;

          return (
            <section key={catId} className="space-y-3" aria-labelledby={`cat-${catId}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: meta.primaryColor }}
                    aria-hidden="true"
                  />
                  <h2 id={`cat-${catId}`} className="text-base font-bold text-[#17191D]">
                    {meta.label}
                  </h2>
                  <span className="text-xs font-mono text-[#717782] tabular-nums">
                    {tools.length} tool{tools.length === 1 ? '' : 's'}
                  </span>
                </div>
                {activeCategory !== catId && (
                  <button
                    type="button"
                    onClick={() => onSelectCategory(catId)}
                    className="text-xs font-medium text-[#1D4ED8] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>View category</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {tools.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => openToolPrepare(tool.id)}
                    className="group bg-white border border-[#E2E5EC] hover:border-[#1D4ED8]/50 rounded-xl p-4 text-left flex flex-col justify-between transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center border"
                          style={{
                            backgroundColor: meta.lightTint,
                            color: meta.primaryColor,
                            borderColor: `${meta.primaryColor}20`,
                          }}
                        >
                          <ToolIcon name={tool.iconName} className="w-4 h-4" />
                        </div>
                        {tool.processingMode === 'optional-cloud' && (
                          <span className="text-[11px] font-mono text-[#7C3AED]">
                            Opt-in AI
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-[#17191D] group-hover:text-[#1D4ED8] transition-colors">
                        {tool.name}
                      </h3>
                      <p className="text-xs text-[#717782] mt-1 line-clamp-2 leading-relaxed">
                        {tool.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-2.5 border-t border-[#F1F3F6] flex items-center justify-between text-[11px] font-mono text-[#717782]">
                      <span className="truncate">{tool.shortSpecLeft}</span>
                      <span className="shrink-0">{tool.shortSpecRight}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* How Local Browser Computation Works */}
      <section className="bg-white border border-[#E2E5EC] rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-[#717782]">
              Local-First Architecture
            </p>
            <h2 className="text-lg font-bold text-[#17191D] mt-0.5">
              How Local Browser Computation Works
            </h2>
          </div>
          <span className="text-xs font-mono text-[#0D9488]">
            Processed locally in your browser
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg space-y-1.5">
            <p className="text-[11px] font-mono text-[#1D4ED8]">STEP 01</p>
            <h3 className="text-sm font-semibold text-[#17191D]">
              1. In-Memory File Ingestion
            </h3>
            <p className="text-xs text-[#717782] leading-relaxed">
              Your browser reads selected or dropped files directly via the File API into local memory without uploading them to a remote server.
            </p>
          </div>
          <div className="p-4 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg space-y-1.5">
            <p className="text-[11px] font-mono text-[#1D4ED8]">STEP 02</p>
            <h3 className="text-sm font-semibold text-[#17191D]">
              2. Specialized Studio Engines
            </h3>
            <p className="text-xs text-[#717782] leading-relaxed">
              Canvas 2D, PDF.js, pdf-lib, Web Audio, SheetJS, and Tesseract OCR process your files deterministically inside your device’s browser sandbox.
            </p>
          </div>
          <div className="p-4 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg space-y-1.5">
            <p className="text-[11px] font-mono text-[#1D4ED8]">STEP 03</p>
            <h3 className="text-sm font-semibold text-[#17191D]">
              3. Preview, Verify & Export
            </h3>
            <p className="text-xs text-[#717782] leading-relaxed">
              Inspect before/after previews, file dimensions, and byte savings before downloading a fresh Blob directly to disk.
            </p>
          </div>
        </div>
      </section>

      {/* Clean Footer */}
      <footer className="pt-6 pb-12 border-t border-[#E2E5EC] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#717782]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <span className="font-bold tracking-tight text-[#17191D]">EVERYTHING</span>
          <span className="hidden sm:inline text-[#C5CBD3]">·</span>
          <span>Everything you need. One workspace. Your files stay yours.</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap font-sans text-xs">
          <span>Created & Developed by</span>
          <a
            href="https://github.com/barnikbasu"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#17191D] hover:text-[#1D4ED8] transition-colors underline decoration-[#C5CBD3] hover:decoration-[#1D4ED8] underline-offset-2"
          >
            Barnik Basu
          </a>
          <span className="text-[#C5CBD3]">·</span>
          <span>© {new Date().getFullYear()} Barnik Basu. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
};
