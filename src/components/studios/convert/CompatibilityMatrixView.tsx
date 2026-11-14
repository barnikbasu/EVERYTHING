import React, { useMemo, useState } from 'react';
import { CheckCircle2, Info, Search, XCircle } from 'lucide-react';
import {
  CONVERSION_REGISTRY,
  detectRuntimeCodecCapabilities,
  isDefinitionExecutable,
} from '../../../engines/convert/compatibilityRegistry';
import type { ConversionCategory } from '../../../engines/convert/types';

const CATEGORY_LABELS: Record<ConversionCategory | 'all', string> = {
  all: 'All Categories',
  image: 'Image',
  document: 'Documents',
  audio: 'Audio',
  video: 'Video',
  archive: 'Archives',
  structured: 'Structured Data',
};

export const CompatibilityMatrixView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ConversionCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'executable' | 'unavailable'>('all');

  const caps = useMemo(() => detectRuntimeCodecCapabilities(), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CONVERSION_REGISTRY.map((def) => {
      const exec = isDefinitionExecutable(def, caps);
      return { def, exec };
    }).filter(({ def, exec }) => {
      if (category !== 'all' && def.category !== category) return false;
      if (statusFilter === 'executable' && !exec.executable) return false;
      if (statusFilter === 'unavailable' && exec.executable) return false;
      if (!q) return true;
      return (
        def.sourceFormat.toLowerCase().includes(q) ||
        def.targetFormat.toLowerCase().includes(q) ||
        def.processingEngine.toLowerCase().includes(q) ||
        def.limitations.toLowerCase().includes(q)
      );
    });
  }, [caps, category, query, statusFilter]);

  const executableCount = useMemo(
    () =>
      CONVERSION_REGISTRY.filter((d) => isDefinitionExecutable(d, caps).executable).length,
    [caps]
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#17191D]">
              Universal Conversion Compatibility Matrix
            </h2>
            <p className="text-xs text-[#717782] mt-0.5">
              Generated directly from the active conversion registry and live browser codec probes. Only verified, executable local paths are selectable in target dropdowns.
            </p>
          </div>
          <div className="text-xs font-mono text-[#17191D] tabular-nums bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg px-3 py-1.5">
            {executableCount} executable · {CONVERSION_REGISTRY.length} documented paths
          </div>
        </div>

        {/* Live Browser Codec Capabilities */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-[#F1F3F6] text-[11px] font-mono">
          <div className="px-2.5 py-1.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md flex items-center justify-between">
            <span className="text-[#717782]">WebP Encode</span>
            <span className={caps.canvasWebp ? 'text-[#0D9488]' : 'text-[#E5322D]'}>
              {caps.canvasWebp ? 'Ready' : 'No'}
            </span>
          </div>
          <div className="px-2.5 py-1.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md flex items-center justify-between">
            <span className="text-[#717782]">AVIF Encode</span>
            <span className={caps.canvasAvif ? 'text-[#0D9488]' : 'text-[#D97706]'}>
              {caps.canvasAvif ? 'Ready' : 'Browser No'}
            </span>
          </div>
          <div className="px-2.5 py-1.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md flex items-center justify-between">
            <span className="text-[#717782]">WebM Video</span>
            <span className={caps.mediaWebmVideo ? 'text-[#0D9488]' : 'text-[#D97706]'}>
              {caps.mediaWebmVideo ? 'Ready' : 'No'}
            </span>
          </div>
          <div className="px-2.5 py-1.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md flex items-center justify-between">
            <span className="text-[#717782]">Ogg Opus</span>
            <span className={caps.mediaOggOpus ? 'text-[#0D9488]' : 'text-[#D97706]'}>
              {caps.mediaOggOpus ? 'Ready' : 'Browser No'}
            </span>
          </div>
          <div className="px-2.5 py-1.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md flex items-center justify-between">
            <span className="text-[#717782]">Web Audio</span>
            <span className={caps.webAudioAvailable ? 'text-[#0D9488]' : 'text-[#E5322D]'}>
              {caps.webAudioAvailable ? 'Ready' : 'No'}
            </span>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {(Object.keys(CATEGORY_LABELS) as Array<ConversionCategory | 'all'>).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  category === cat
                    ? 'bg-[#17191D] text-white border-[#17191D]'
                    : 'bg-[#F6F7F9] text-[#717782] border-[#E2E5EC] hover:text-[#17191D]'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative w-48 sm:w-56">
              <Search className="w-3.5 h-3.5 text-[#717782] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter formats or engine…"
                className="w-full h-8 pl-8 pr-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs text-[#17191D]"
            >
              <option value="all">All Statuses</option>
              <option value="executable">Executable Now</option>
              <option value="unavailable">Unavailable / Codec Blocked</option>
            </select>
          </div>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="bg-white border border-[#E2E5EC] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F6F7F9] border-b border-[#E2E5EC] text-[11px] font-mono uppercase tracking-wider text-[#717782]">
                <th className="py-2.5 px-3">Path</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Engine & Codec</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Scope & Known Limitations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F3F6]">
              {rows.map(({ def, exec }) => (
                <tr key={def.id} className="hover:bg-[#F6F7F9]/60 align-top">
                  <td className="py-2.5 px-3 font-mono font-semibold text-[#17191D] whitespace-nowrap">
                    {def.sourceFormat.toUpperCase()} → {def.targetFormat.toUpperCase()}
                  </td>
                  <td className="py-2.5 px-3 text-[#717782] capitalize whitespace-nowrap">
                    {def.category}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-[#17191D]">{def.processingEngine}</div>
                    <div className="text-[11px] font-mono text-[#717782] mt-0.5">
                      Local · {def.codecRequirement}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {exec.executable ? (
                      <span className="inline-flex items-center gap-1 text-[#0D9488] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Executable
                      </span>
                    ) : def.availability === 'runtime-codec' ? (
                      <span className="inline-flex items-center gap-1 text-[#D97706] font-medium">
                        <Info className="w-3.5 h-3.5" />
                        Browser Codec No
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#E5322D] font-medium">
                        <XCircle className="w-3.5 h-3.5" />
                        Unavailable
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-[#717782] leading-relaxed min-w-[260px]">
                    {exec.executable ? def.limitations : exec.reason || def.limitations}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-[#717782]">
                    No conversion definitions match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
