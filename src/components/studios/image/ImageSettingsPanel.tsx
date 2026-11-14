import React from 'react';
import {
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Paintbrush,
  RotateCw,
} from 'lucide-react';
import type { ImageProcessParams } from '../../../engines/imageEngine';

interface ImageSettingsPanelProps {
  activeTab: string;
  params: ImageProcessParams;
  pushParams: (updater: (prev: ImageProcessParams) => ImageProcessParams) => void;
  sourceDims: { w: number; h: number };
  hasSourceCanvas: boolean;
  isProcessing: boolean;
  brushMode: 'erase' | 'restore';
  onBrushModeChange: (mode: 'erase' | 'restore') => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  onClearBrushStrokes: () => void;
  onApplyAspectCrop: (ratio: number | null) => void;
  passportPreset: '35x45mm' | '2x2in';
  onPassportPresetChange: (preset: '35x45mm' | '2x2in') => void;
  passportSheet: '4x6in' | 'a4';
  onPassportSheetChange: (sheet: '4x6in' | 'a4') => void;
  passportFormat: 'image/jpeg' | 'image/png' | 'application/pdf';
  onPassportFormatChange: (fmt: 'image/jpeg' | 'image/png' | 'application/pdf') => void;
  onGeneratePassport: () => void;
  onPickFile: () => void;
}

export const ImageSettingsPanel: React.FC<ImageSettingsPanelProps> = ({
  activeTab,
  params,
  pushParams,
  sourceDims,
  hasSourceCanvas,
  isProcessing,
  brushMode,
  onBrushModeChange,
  brushSize,
  onBrushSizeChange,
  onClearBrushStrokes,
  onApplyAspectCrop,
  passportPreset,
  onPassportPresetChange,
  passportSheet,
  onPassportSheetChange,
  passportFormat,
  onPassportFormatChange,
  onGeneratePassport,
  onPickFile,
}) => {
  return (
    <div className="space-y-5">
      {activeTab === 'cutout' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#17191D]">Cutout Engine</h3>
            <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={params.cutout.enabled}
                onChange={(e) =>
                  pushParams((p) => ({
                    ...p,
                    cutout: { ...p.cutout, enabled: e.target.checked },
                  }))
                }
                className="accent-[#1D4ED8]"
              />
              <span>Active</span>
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#717782]">BG Tolerance</span>
                <span className="font-mono text-[#17191D] tabular-nums">{params.cutout.tolerance}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={85}
                value={params.cutout.tolerance}
                onChange={(e) =>
                  pushParams((p) => ({
                    ...p,
                    cutout: { ...p.cutout, enabled: true, tolerance: Number(e.target.value) },
                  }))
                }
                className="w-full accent-[#1D4ED8]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#717782]">Edge Feathering</span>
                <span className="font-mono text-[#17191D] tabular-nums">{params.cutout.feather} px</span>
              </div>
              <input
                type="range"
                min={0}
                max={6}
                step={0.5}
                value={params.cutout.feather}
                onChange={(e) =>
                  pushParams((p) => ({
                    ...p,
                    cutout: { ...p.cutout, feather: Number(e.target.value) },
                  }))
                }
                className="w-full accent-[#1D4ED8]"
              />
            </div>
          </div>

          <div className="space-y-2 pt-1 border-t border-[#E2E5EC]">
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={params.cutout.defringe}
                onChange={(e) =>
                  pushParams((p) => ({
                    ...p,
                    cutout: { ...p.cutout, defringe: e.target.checked },
                  }))
                }
                className="mt-0.5 accent-[#1D4ED8]"
              />
              <div>
                <div className="font-medium text-[#17191D]">De-fringe Halos</div>
                <div className="text-[11px] text-[#717782]">Suppress edge color spill</div>
              </div>
            </label>

            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={params.cutout.recoverShadow}
                onChange={(e) =>
                  pushParams((p) => ({
                    ...p,
                    cutout: { ...p.cutout, recoverShadow: e.target.checked },
                  }))
                }
                className="mt-0.5 accent-[#1D4ED8]"
              />
              <div>
                <div className="font-medium text-[#17191D]">Synthesize Contact Shadow</div>
                <div className="text-[11px] text-[#717782]">Soft drop shadow on subject</div>
              </div>
            </label>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E2E5EC]">
            <p className="text-xs font-semibold text-[#17191D]">Backdrop Fill</p>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'transparent', label: 'Alpha' },
                  { id: 'white', label: 'White' },
                  { id: 'solid', label: 'Solid' },
                  { id: 'blur', label: 'Blur' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() =>
                    pushParams((p) => ({
                      ...p,
                      cutout: { ...p.cutout, enabled: true, backdropMode: mode.id },
                    }))
                  }
                  className={`py-1.5 text-[11px] font-medium rounded-md border cursor-pointer ${
                    params.cutout.backdropMode === mode.id
                      ? 'bg-[#EFF6FF] border-[#1D4ED8] text-[#1D4ED8]'
                      : 'bg-[#F6F7F9] border-[#E2E5EC] text-[#17191D]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {params.cutout.backdropMode === 'solid' && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="color"
                  value={params.cutout.backdropColor}
                  onChange={(e) =>
                    pushParams((p) => ({
                      ...p,
                      cutout: { ...p.cutout, backdropColor: e.target.value },
                    }))
                  }
                  className="w-8 h-8 rounded border border-[#E2E5EC] cursor-pointer"
                />
                <span className="font-mono text-xs text-[#717782]">
                  {params.cutout.backdropColor}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'mask' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#17191D]">Brush Mask Refine</h3>
          <p className="text-xs text-[#717782]">
            Paint directly on the preview canvas to erase unwanted background or restore foreground detail.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onBrushModeChange('erase')}
              className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                brushMode === 'erase'
                  ? 'bg-[#FEF2F2] border-[#E5322D] text-[#E5322D]'
                  : 'bg-white border-[#E2E5EC] text-[#17191D]'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Erase BG</span>
            </button>
            <button
              type="button"
              onClick={() => onBrushModeChange('restore')}
              className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                brushMode === 'restore'
                  ? 'bg-[#F0FDFA] border-[#0D9488] text-[#0D9488]'
                  : 'bg-white border-[#E2E5EC] text-[#17191D]'
              }`}
            >
              <Paintbrush className="w-3.5 h-3.5" />
              <span>Restore FG</span>
            </button>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#717782]">Brush Diameter</span>
              <span className="font-mono tabular-nums">{brushSize} px</span>
            </div>
            <input
              type="range"
              min={8}
              max={80}
              value={brushSize}
              onChange={(e) => onBrushSizeChange(Number(e.target.value))}
              className="w-full accent-[#1D4ED8]"
            />
          </div>

          <button
            type="button"
            onClick={onClearBrushStrokes}
            className="w-full py-2 text-xs font-medium bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg cursor-pointer"
          >
            Clear Brush Strokes
          </button>
        </div>
      )}

      {activeTab === 'tone' && (
        <div className="space-y-3.5">
          <h3 className="text-sm font-bold text-[#17191D]">Tone & Filters</h3>
          {(
            [
              { key: 'brightness', label: 'Brightness', min: -60, max: 60 },
              { key: 'contrast', label: 'Contrast', min: -60, max: 60 },
              { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
              { key: 'sharpen', label: 'Sharpen', min: 0, max: 100 },
              { key: 'blur', label: 'Gaussian Blur', min: 0, max: 16 },
            ] as const
          ).map((ctrl) => (
            <div key={ctrl.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#717782]">{ctrl.label}</span>
                <span className="font-mono text-[#17191D] tabular-nums">
                  {params.adjustments[ctrl.key]}
                </span>
              </div>
              <input
                type="range"
                min={ctrl.min}
                max={ctrl.max}
                value={params.adjustments[ctrl.key]}
                onChange={(e) =>
                  pushParams((p) => ({
                    ...p,
                    adjustments: { ...p.adjustments, [ctrl.key]: Number(e.target.value) },
                  }))
                }
                className="w-full accent-[#1D4ED8]"
              />
            </div>
          ))}

          <div className="flex gap-2 pt-2 border-t border-[#E2E5EC]">
            <button
              type="button"
              onClick={() =>
                pushParams((p) => ({
                  ...p,
                  adjustments: { ...p.adjustments, grayscale: !p.adjustments.grayscale },
                }))
              }
              className={`flex-1 py-1.5 text-xs font-medium rounded-md border cursor-pointer ${
                params.adjustments.grayscale
                  ? 'bg-[#17191D] text-white border-[#17191D]'
                  : 'bg-[#F6F7F9] text-[#17191D] border-[#E2E5EC]'
              }`}
            >
              Grayscale
            </button>
            <button
              type="button"
              onClick={() =>
                pushParams((p) => ({
                  ...p,
                  adjustments: { ...p.adjustments, sepia: !p.adjustments.sepia },
                }))
              }
              className={`flex-1 py-1.5 text-xs font-medium rounded-md border cursor-pointer ${
                params.adjustments.sepia
                  ? 'bg-[#17191D] text-white border-[#17191D]'
                  : 'bg-[#F6F7F9] text-[#17191D] border-[#E2E5EC]'
              }`}
            >
              Sepia
            </button>
          </div>
        </div>
      )}

      {activeTab === 'crop' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#17191D]">Crop, Resize & Compress</h3>

          <div>
            <p className="text-xs font-semibold text-[#17191D] mb-1.5">Aspect Crop</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'Original', ratio: null },
                { label: '1:1', ratio: 1 },
                { label: '4:5', ratio: 4 / 5 },
                { label: '16:9', ratio: 16 / 9 },
                { label: '4:3', ratio: 4 / 3 },
                { label: '9:16', ratio: 9 / 16 },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onApplyAspectCrop(item.ratio)}
                  className="py-1.5 text-xs font-mono bg-[#F6F7F9] hover:bg-white border border-[#E2E5EC] rounded-md cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E2E5EC]">
            <p className="text-xs font-semibold text-[#17191D]">Transform</p>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  pushParams((p) => ({
                    ...p,
                    transform: {
                      ...p.transform,
                      rotateDeg: ((p.transform.rotateDeg + 90) % 360) as 0 | 90 | 180 | 270,
                    },
                  }))
                }
                className="py-1.5 text-xs bg-[#F6F7F9] hover:bg-white border border-[#E2E5EC] rounded-md inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>90°</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  pushParams((p) => ({
                    ...p,
                    transform: { ...p.transform, flipH: !p.transform.flipH },
                  }))
                }
                className="py-1.5 text-xs bg-[#F6F7F9] hover:bg-white border border-[#E2E5EC] rounded-md inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" />
                <span>Flip H</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  pushParams((p) => ({
                    ...p,
                    transform: { ...p.transform, flipV: !p.transform.flipV },
                  }))
                }
                className="py-1.5 text-xs bg-[#F6F7F9] hover:bg-white border border-[#E2E5EC] rounded-md inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <FlipVertical2 className="w-3.5 h-3.5" />
                <span>Flip V</span>
              </button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E2E5EC]">
            <p className="text-xs font-semibold text-[#17191D]">Target Dimensions (px)</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={16}
                max={8000}
                placeholder={String(sourceDims.w || 'Width')}
                value={params.transform.targetWidth || ''}
                onChange={(e) => {
                  const w = e.target.value ? Number(e.target.value) : null;
                  const h =
                    w && sourceDims.w
                      ? Math.round((w * sourceDims.h) / sourceDims.w)
                      : params.transform.targetHeight;
                  pushParams((p) => ({
                    ...p,
                    transform: { ...p.transform, targetWidth: w, targetHeight: h },
                  }));
                }}
                className="h-8 px-2.5 text-xs font-mono bg-[#F6F7F9] border border-[#E2E5EC] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
              <input
                type="number"
                min={16}
                max={8000}
                placeholder={String(sourceDims.h || 'Height')}
                value={params.transform.targetHeight || ''}
                onChange={(e) =>
                  pushParams((p) => ({
                    ...p,
                    transform: {
                      ...p.transform,
                      targetHeight: e.target.value ? Number(e.target.value) : null,
                    },
                  }))
                }
                className="h-8 px-2.5 text-xs font-mono bg-[#F6F7F9] border border-[#E2E5EC] rounded-md focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E2E5EC]">
            <p className="text-xs font-semibold text-[#17191D]">Output Format & Quality</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { mime: 'image/png', label: 'PNG' },
                  { mime: 'image/jpeg', label: 'JPEG' },
                  { mime: 'image/webp', label: 'WebP' },
                ] as const
              ).map((fmt) => (
                <button
                  key={fmt.mime}
                  type="button"
                  onClick={() => pushParams((p) => ({ ...p, outputFormat: fmt.mime }))}
                  className={`py-1.5 text-xs font-mono rounded-md border cursor-pointer ${
                    params.outputFormat === fmt.mime
                      ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                      : 'bg-[#F6F7F9] text-[#17191D] border-[#E2E5EC]'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
            {params.outputFormat !== 'image/png' && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#717782]">Compression Quality</span>
                  <span className="font-mono tabular-nums">{Math.round(params.quality * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={100}
                  value={Math.round(params.quality * 100)}
                  onChange={(e) =>
                    pushParams((p) => ({ ...p, quality: Number(e.target.value) / 100 }))
                  }
                  className="w-full accent-[#1D4ED8]"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'watermark' && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#17191D]">Text Watermark</h3>
            <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={params.watermark.enabled}
                onChange={(e) =>
                  pushParams((p) => ({
                    ...p,
                    watermark: { ...p.watermark, enabled: e.target.checked },
                  }))
                }
                className="accent-[#1D4ED8]"
              />
              <span>Enable</span>
            </label>
          </div>
          <input
            type="text"
            value={params.watermark.text}
            onChange={(e) =>
              pushParams((p) => ({
                ...p,
                watermark: { ...p.watermark, enabled: true, text: e.target.value },
              }))
            }
            placeholder="Watermark text…"
            className="w-full h-9 px-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
          />
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#717782]">Opacity</span>
              <span className="font-mono tabular-nums">{Math.round(params.watermark.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={90}
              value={Math.round(params.watermark.opacity * 100)}
              onChange={(e) =>
                pushParams((p) => ({
                  ...p,
                  watermark: { ...p.watermark, opacity: Number(e.target.value) / 100 },
                }))
              }
              className="w-full accent-[#1D4ED8]"
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={params.watermark.tiled}
              onChange={(e) =>
                pushParams((p) => ({
                  ...p,
                  watermark: { ...p.watermark, tiled: e.target.checked },
                }))
              }
              className="accent-[#1D4ED8]"
            />
            <span>Tiled diagonal grid</span>
          </label>
        </div>
      )}

      {activeTab === 'passport' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#17191D]">Passport & ID Sheet</h3>
          <p className="text-xs text-[#717782]">
            Center-crops your portrait and tiles standard biometric dimensions onto a 300 DPI print sheet.
          </p>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#17191D] block">Photo Standard</label>
            <div className="grid grid-cols-2 gap-2">
              {(['35x45mm', '2x2in'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPassportPresetChange(p)}
                  className={`py-2 text-xs font-mono rounded-lg border cursor-pointer ${
                    passportPreset === p
                      ? 'bg-[#EFF6FF] border-[#1D4ED8] text-[#1D4ED8]'
                      : 'bg-[#F6F7F9] border-[#E2E5EC]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#17191D] block">Print Sheet Size</label>
            <div className="grid grid-cols-2 gap-2">
              {(['4x6in', 'a4'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onPassportSheetChange(s)}
                  className={`py-2 text-xs font-mono uppercase rounded-lg border cursor-pointer ${
                    passportSheet === s
                      ? 'bg-[#EFF6FF] border-[#1D4ED8] text-[#1D4ED8]'
                      : 'bg-[#F6F7F9] border-[#E2E5EC]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#17191D] block">Export Format</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { mime: 'image/jpeg', label: 'JPEG' },
                  { mime: 'image/png', label: 'PNG' },
                  { mime: 'application/pdf', label: 'PDF' },
                ] as const
              ).map((fmt) => (
                <button
                  key={fmt.mime}
                  type="button"
                  onClick={() => onPassportFormatChange(fmt.mime)}
                  className={`py-1.5 text-xs font-mono rounded-lg border cursor-pointer ${
                    passportFormat === fmt.mime
                      ? 'bg-[#EFF6FF] border-[#1D4ED8] text-[#1D4ED8]'
                      : 'bg-[#F6F7F9] border-[#E2E5EC]'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!hasSourceCanvas || isProcessing}
            onClick={onGeneratePassport}
            className="w-full py-2.5 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
          >
            Download 300 DPI Print Sheet
          </button>
        </div>
      )}

      {/* Always-accessible format footer in drawer */}
      <div className="pt-3 border-t border-[#E2E5EC] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#717782]">Format</span>
          <select
            value={params.outputFormat}
            onChange={(e) =>
              pushParams((p) => ({
                ...p,
                outputFormat: e.target.value as ImageProcessParams['outputFormat'],
              }))
            }
            className="h-7 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
          >
            <option value="image/png">PNG (Alpha)</option>
            <option value="image/webp">WebP</option>
            <option value="image/jpeg">JPEG</option>
          </select>
        </div>
        <button
          type="button"
          onClick={onPickFile}
          className="w-full py-2 text-xs font-medium bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg text-[#17191D] cursor-pointer"
        >
          Replace Source Image…
        </button>
      </div>
    </div>
  );
};
