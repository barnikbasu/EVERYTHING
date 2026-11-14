import React from 'react';
import {
  Eraser,
  FilePlus2,
  Highlighter,
  PenTool,
  ShieldAlert,
  Trash2,
  Type,
} from 'lucide-react';
import type { WorkspaceFile } from '../../../types/workspace';
import type { PdfAnnotationItem, PdfFormFieldInfo, PdfPagePreview, PdfPageSpec } from '../../../engines/pdfEngine';
import { formatBytes } from '../../../utils/formatters';

interface PdfSettingsPanelProps {
  activeTab: string;
  primaryPdf: File | null;
  pdfQueue: WorkspaceFile[];
  imageFiles: WorkspaceFile[];
  previews: PdfPagePreview[];
  currentSpecs: PdfPageSpec[];
  splitRange: string;
  onSplitRangeChange: (val: string) => void;
  splitMode: 'single-pdf' | 'zip-pages';
  onSplitModeChange: (mode: 'single-pdf' | 'zip-pages') => void;
  compressPreset: 'recommended' | 'maximum' | 'lossless';
  onCompressPresetChange: (preset: 'recommended' | 'maximum' | 'lossless') => void;
  compressedBlob: Blob | null;
  progressPct: number;
  isProcessing: boolean;
  onCompressRun: () => void;
  drawTool: 'redact' | 'highlight' | 'text' | 'signature';
  onDrawToolChange: (tool: 'redact' | 'highlight' | 'text' | 'signature') => void;
  textInput: string;
  onTextInputChange: (val: string) => void;
  watermarkText: string;
  onWatermarkTextChange: (val: string) => void;
  annotations: PdfAnnotationItem[];
  onRemoveLastAnnotation: () => void;
  sigCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onSigPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onSigPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onSigPointerUp: () => void;
  onClearSignaturePad: () => void;
  formFields: PdfFormFieldInfo[];
  formValues: Record<string, string | boolean>;
  onFormValueChange: (name: string, value: string | boolean) => void;
  flattenForms: boolean;
  onFlattenFormsChange: (val: boolean) => void;
  imgPageMode: 'a4' | 'letter' | 'fit-image';
  onImgPageModeChange: (mode: 'a4' | 'letter' | 'fit-image') => void;
  onRemoveFile: (id: string) => void;
  onPickFiles: () => void;
}

export const PdfSettingsPanel: React.FC<PdfSettingsPanelProps> = ({
  activeTab,
  primaryPdf,
  pdfQueue,
  imageFiles,
  previews,
  currentSpecs,
  splitRange,
  onSplitRangeChange,
  splitMode,
  onSplitModeChange,
  compressPreset,
  onCompressPresetChange,
  compressedBlob,
  progressPct,
  isProcessing,
  onCompressRun,
  drawTool,
  onDrawToolChange,
  textInput,
  onTextInputChange,
  watermarkText,
  onWatermarkTextChange,
  annotations,
  onRemoveLastAnnotation,
  sigCanvasRef,
  onSigPointerDown,
  onSigPointerMove,
  onSigPointerUp,
  onClearSignaturePad,
  formFields,
  formValues,
  onFormValueChange,
  flattenForms,
  onFlattenFormsChange,
  imgPageMode,
  onImgPageModeChange,
  onRemoveFile,
  onPickFiles,
}) => {
  return (
    <div className="space-y-4">
      {activeTab === 'organize' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Organize Pages</h3>
          <p className="text-xs text-[#717782]">
            Use the card controls on each page thumbnail to move, rotate 90°, or delete pages before export.
          </p>
          <div className="p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono space-y-1">
            <div>Total Pages: {previews.length}</div>
            <div>Keeping: {currentSpecs.filter((s) => !s.deleted).length}</div>
          </div>
        </div>
      )}

      {activeTab === 'merge' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Merge PDF Queue</h3>
          <p className="text-xs text-[#717782]">
            Add 2 or more PDF files. They will be combined in the exact order shown.
          </p>
          <button
            type="button"
            onClick={onPickFiles}
            className="w-full py-2 px-3 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Add PDF Files</span>
          </button>
          <div className="space-y-1.5">
            {pdfQueue.map((f, idx) => (
              <div
                key={f.id}
                className="p-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate font-mono">
                  {idx + 1}. {f.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(f.id)}
                  className="text-[#717782] hover:text-[#E5322D] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'split' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Split & Extract</h3>
          <div>
            <label className="text-xs font-medium text-[#17191D] block mb-1">
              Page Ranges (e.g. 1-3, 5)
            </label>
            <input
              type="text"
              value={splitRange}
              onChange={(e) => onSplitRangeChange(e.target.value)}
              placeholder="1-3, 5"
              className="w-full h-9 px-3 bg-[#F6F7F9] border border-[#E2E5EC] focus:outline-none focus:border-[#1D4ED8] focus:bg-white rounded-lg text-xs font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                checked={splitMode === 'single-pdf'}
                onChange={() => onSplitModeChange('single-pdf')}
                className="accent-[#1D4ED8]"
              />
              <span>Extract into one combined PDF</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                checked={splitMode === 'zip-pages'}
                onChange={() => onSplitModeChange('zip-pages')}
                className="accent-[#1D4ED8]"
              />
              <span>Split into individual PDFs (ZIP)</span>
            </label>
          </div>
        </div>
      )}

      {activeTab === 'compress' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Compress PDF</h3>
          {(
            [
              { id: 'recommended', label: 'Recommended (150 DPI)', sub: 'Balanced raster & legibility' },
              { id: 'maximum', label: 'Maximum (96 DPI)', sub: 'Smallest size for email/web' },
              { id: 'lossless', label: 'Structure Clean (Vector)', sub: 'Strip metadata & repack streams' },
            ] as const
          ).map((p) => (
            <label
              key={p.id}
              className={`block p-2.5 rounded-lg border cursor-pointer ${
                compressPreset === p.id
                  ? 'bg-[#EFF6FF] border-[#1D4ED8]'
                  : 'bg-[#F6F7F9] border-[#E2E5EC]'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={compressPreset === p.id}
                  onChange={() => onCompressPresetChange(p.id)}
                  className="accent-[#1D4ED8]"
                />
                <span className="text-xs font-semibold text-[#17191D]">{p.label}</span>
              </div>
              <p className="text-[11px] text-[#717782] pl-5 mt-0.5">{p.sub}</p>
            </label>
          ))}
          <button
            type="button"
            disabled={!primaryPdf || isProcessing}
            onClick={onCompressRun}
            className="w-full h-9 px-3 bg-[#17191D] hover:bg-[#272A30] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? `Compressing ${progressPct}%…` : 'Run Compression Preview'}
          </button>
          {compressedBlob && primaryPdf && (
            <div className="p-2.5 bg-[#F0FDFA] border border-[#0D9488]/30 rounded-lg text-xs font-mono text-[#0F766E]">
              {formatBytes(primaryPdf.size)} → {formatBytes(compressedBlob.size)}
            </div>
          )}
        </div>
      )}

      {(activeTab === 'annotate' || activeTab === 'redact') && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#17191D]">
            {activeTab === 'redact' ? 'Secure Redaction' : 'Annotate, Sign & Watermark'}
          </h3>

          {activeTab === 'redact' ? (
            <div className="p-3 bg-[#FEF2F2] border border-[#E5322D]/25 rounded-lg text-xs text-[#991B1B] space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>True Content Removal</span>
              </div>
              <p className="text-[11px]">
                Drag boxes over sensitive areas. Redacted pages are raster-flattened so underlying text cannot be copied or recovered.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'highlight', label: 'Highlight', Icon: Highlighter },
                  { id: 'text', label: 'Text', Icon: Type },
                  { id: 'signature', label: 'Sign', Icon: PenTool },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onDrawToolChange(t.id)}
                  className={`py-2 px-1.5 rounded-lg border text-[11px] font-medium flex flex-col items-center gap-1 cursor-pointer ${
                    drawTool === t.id
                      ? 'bg-[#EFF6FF] border-[#1D4ED8] text-[#1D4ED8]'
                      : 'bg-[#F6F7F9] border-[#E2E5EC] text-[#17191D]'
                  }`}
                >
                  <t.Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          )}

          {drawTool === 'text' && activeTab === 'annotate' && (
            <input
              type="text"
              value={textInput}
              onChange={(e) => onTextInputChange(e.target.value)}
              placeholder="Text callout to stamp…"
              className="w-full h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] focus:outline-none focus:border-[#1D4ED8] focus:bg-white rounded-md text-xs"
            />
          )}

          {drawTool === 'signature' && activeTab === 'annotate' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Draw Signature</span>
                <button
                  type="button"
                  onClick={onClearSignaturePad}
                  className="text-[11px] text-[#717782] hover:text-[#17191D] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Eraser className="w-3 h-3" /> Clear
                </button>
              </div>
              <canvas
                ref={sigCanvasRef}
                width={230}
                height={84}
                onPointerDown={onSigPointerDown}
                onPointerMove={onSigPointerMove}
                onPointerUp={onSigPointerUp}
                onPointerLeave={onSigPointerUp}
                className="w-full bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg cursor-crosshair touch-none"
              />
              <p className="text-[11px] text-[#717782]">
                Draw above, then click on the PDF page to stamp.
              </p>
            </div>
          )}

          {activeTab === 'annotate' && (
            <div className="pt-2 border-t border-[#E2E5EC] space-y-1.5">
              <label className="text-xs font-medium text-[#17191D] block">
                Optional Diagonal Watermark
              </label>
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => onWatermarkTextChange(e.target.value)}
                placeholder="e.g. CONFIDENTIAL"
                className="w-full h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] focus:outline-none focus:border-[#1D4ED8] focus:bg-white rounded-md text-xs"
              />
            </div>
          )}

          <div className="pt-2 border-t border-[#E2E5EC] flex items-center justify-between text-xs">
            <span className="text-[#717782]">
              Items placed: <strong className="font-mono text-[#17191D]">{annotations.length}</strong>
            </span>
            {annotations.length > 0 && (
              <button
                type="button"
                onClick={onRemoveLastAnnotation}
                className="text-[#E5322D] hover:underline cursor-pointer"
              >
                Remove last
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'forms' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">AcroForm Inspector</h3>
          {formFields.length === 0 ? (
            <p className="text-xs text-[#717782]">
              No fillable AcroForm fields detected in this PDF.
            </p>
          ) : (
            <div className="space-y-2.5">
              {formFields.map((f) => (
                <div key={f.name} className="space-y-1">
                  <label className="text-[11px] font-mono text-[#717782] block truncate">
                    {f.name}
                  </label>
                  {f.type === 'checkbox' ? (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formValues[f.name])}
                        onChange={(e) => onFormValueChange(f.name, e.target.checked)}
                        className="accent-[#1D4ED8]"
                      />
                      <span>Checked</span>
                    </label>
                  ) : f.type === 'dropdown' && f.options && f.options.length > 0 ? (
                    <select
                      value={String(formValues[f.name] ?? '')}
                      onChange={(e) => onFormValueChange(f.name, e.target.value)}
                      className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] focus:outline-none focus:border-[#1D4ED8] focus:bg-white rounded-md text-xs"
                    >
                      <option value="">Select…</option>
                      {f.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={String(formValues[f.name] ?? '')}
                      onChange={(e) => onFormValueChange(f.name, e.target.value)}
                      className="w-full h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] focus:outline-none focus:border-[#1D4ED8] focus:bg-white rounded-md text-xs"
                    />
                  )}
                </div>
              ))}
              <label className="flex items-center gap-2 text-xs pt-2 border-t border-[#E2E5EC] cursor-pointer">
                <input
                  type="checkbox"
                  checked={flattenForms}
                  onChange={(e) => onFlattenFormsChange(e.target.checked)}
                  className="accent-[#1D4ED8]"
                />
                <span>Flatten form fields permanently</span>
              </label>
            </div>
          )}
        </div>
      )}

      {activeTab === 'img2pdf' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Images to PDF</h3>
          <button
            type="button"
            onClick={onPickFiles}
            className="w-full h-9 px-3 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Add PNG / JPG / WebP Images
          </button>
          <div className="space-y-1.5">
            <label className="text-xs font-medium block">Page Sizing</label>
            <select
              value={imgPageMode}
              onChange={(e) => onImgPageModeChange(e.target.value as 'a4' | 'letter' | 'fit-image')}
              className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] focus:outline-none focus:border-[#1D4ED8] focus:bg-white rounded-md text-xs"
            >
              <option value="a4">A4 (Portrait)</option>
              <option value="letter">US Letter</option>
              <option value="fit-image">Fit to Image Dimensions</option>
            </select>
          </div>
          <p className="text-xs font-mono text-[#717782]">
            {imageFiles.length} image(s) queued
          </p>
        </div>
      )}

      <div className="pt-3 border-t border-[#E2E5EC]">
        <button
          type="button"
          onClick={onPickFiles}
          className="w-full py-2 text-xs font-medium bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg cursor-pointer"
        >
          Load / Add Files…
        </button>
      </div>
    </div>
  );
};
