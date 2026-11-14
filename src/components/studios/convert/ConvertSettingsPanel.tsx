import React, { useState } from 'react';
import { AlertCircle, ArrowRightLeft, Layers, RotateCcw } from 'lucide-react';
import type {
  ConversionDefinition,
  ConversionOptionKey,
  ConversionSettings,
  ConvertFormatId,
} from '../../../engines/convert/types';
import { FORMAT_META } from '../../../engines/convert/formatDetector';

interface ConvertSettingsPanelProps {
  sourceFormat: ConvertFormatId | 'unknown';
  targetFormat: ConvertFormatId | '';
  availableTargets: ConversionDefinition[];
  activeDefinition?: ConversionDefinition;
  settings: ConversionSettings;
  onTargetChange: (target: ConvertFormatId) => void;
  onSettingsChange: (patch: Partial<ConversionSettings>) => void;
  onResetSettings: () => void;
  sheetNames: string[];
  estimatedOutputNote: string | null;
  hasMultipleQueued: boolean;
  onApplyTargetToCompatible: () => void;
  onConvertActive: () => void;
  isConvertingActive: boolean;
  disabled: boolean;
}

export const ConvertSettingsPanel: React.FC<ConvertSettingsPanelProps> = ({
  sourceFormat,
  targetFormat,
  availableTargets,
  activeDefinition,
  settings,
  onTargetChange,
  onSettingsChange,
  onResetSettings,
  sheetNames,
  estimatedOutputNote,
  hasMultipleQueued,
  onApplyTargetToCompatible,
  onConvertActive,
  isConvertingActive,
  disabled,
}) => {
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const opts = activeDefinition?.supportedOptions ?? [];
  const has = (k: ConversionOptionKey) => opts.includes(k);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[#17191D]">Conversion Settings</h3>
        <div
          role="tablist"
          aria-label="Settings detail mode"
          className="flex items-center bg-[#F6F7F9] border border-[#E2E5EC] rounded-md p-0.5 text-[11px]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'simple'}
            onClick={() => setMode('simple')}
            className={`px-2 py-0.5 rounded font-medium cursor-pointer transition-colors ${
              mode === 'simple'
                ? 'bg-white text-[#17191D] shadow-2xs'
                : 'text-[#717782] hover:text-[#17191D]'
            }`}
          >
            Simple
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'advanced'}
            onClick={() => setMode('advanced')}
            className={`px-2 py-0.5 rounded font-medium cursor-pointer transition-colors ${
              mode === 'advanced'
                ? 'bg-white text-[#17191D] shadow-2xs'
                : 'text-[#717782] hover:text-[#17191D]'
            }`}
          >
            Advanced
          </button>
        </div>
      </div>

      {/* Source -> Target selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#717782]">Detected Input</span>
          <span className="font-mono font-semibold text-[#17191D] uppercase">
            {sourceFormat === 'unknown' ? 'None' : sourceFormat}
          </span>
        </div>

        <div className="space-y-1">
          <label htmlFor="convert-target-select" className="text-xs font-medium text-[#17191D] block">
            Target Output Format
          </label>
          <select
            id="convert-target-select"
            value={targetFormat}
            disabled={disabled || availableTargets.length === 0}
            onChange={(e) => onTargetChange(e.target.value as ConvertFormatId)}
            className="w-full h-9 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-medium text-[#17191D] focus:outline-none focus:border-[#1D4ED8] focus:bg-white disabled:opacity-50"
          >
            {availableTargets.length === 0 ? (
              <option value="">No executable targets available</option>
            ) : (
              availableTargets.map((t) => {
                const label = FORMAT_META[t.targetFormat]?.label || t.targetFormat.toUpperCase();
                return (
                  <option key={t.id} value={t.targetFormat}>
                    .{t.outputExtension} — {label}
                  </option>
                );
              })
            )}
          </select>
        </div>

        {hasMultipleQueued && targetFormat && (
          <button
            type="button"
            onClick={onApplyTargetToCompatible}
            className="w-full h-8 px-2.5 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg text-[11px] font-medium text-[#17191D] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-[#1D4ED8]" />
            <span>Apply .{targetFormat} to compatible items</span>
          </button>
        )}
      </div>

      {/* Format-specific genuine controls */}
      {activeDefinition && opts.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-[#E2E5EC]">
          {/* QUALITY (Image / PDF raster) */}
          {has('quality') && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="conv-quality" className="font-medium text-[#17191D]">
                  Encoding Quality
                </label>
                <span className="font-mono tabular-nums text-[#717782]">{settings.quality}%</span>
              </div>
              <input
                id="conv-quality"
                type="range"
                min={10}
                max={100}
                value={settings.quality}
                onChange={(e) => onSettingsChange({ quality: Number(e.target.value) })}
                className="w-full accent-[#1D4ED8]"
              />
            </div>
          )}

          {/* PDF COMPRESSION */}
          {has('pdfCompression') && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#17191D] block">Compression Mode</label>
              <select
                value={settings.pdfCompression}
                onChange={(e) =>
                  onSettingsChange({
                    pdfCompression: e.target.value as ConversionSettings['pdfCompression'],
                  })
                }
                className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              >
                <option value="recommended">Recommended (150 DPI raster)</option>
                <option value="maximum">Maximum Compression (96 DPI)</option>
                <option value="lossless">Structure Cleanup (Vector)</option>
              </select>
            </div>
          )}

          {/* PAGE SIZE / ORIENTATION (Simple exposes Page Size; Advanced exposes Orientation) */}
          {has('pageSize') && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-[#17191D] block mb-1">Page Size</label>
                <select
                  value={settings.pageSize}
                  onChange={(e) =>
                    onSettingsChange({ pageSize: e.target.value as ConversionSettings['pageSize'] })
                  }
                  className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                >
                  <option value="a4">A4</option>
                  <option value="letter">US Letter</option>
                  {activeDefinition.category === 'image' && <option value="fit">Fit Image</option>}
                </select>
              </div>
              {mode === 'advanced' && has('orientation') && (
                <div>
                  <label className="text-xs font-medium text-[#17191D] block mb-1">Orientation</label>
                  <select
                    value={settings.orientation}
                    onChange={(e) =>
                      onSettingsChange({
                        orientation: e.target.value as ConversionSettings['orientation'],
                      })
                    }
                    className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* AUDIO SAMPLE RATE & CHANNELS */}
          {has('sampleRate') && (
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-[#17191D] block mb-1">Sample Rate</label>
                <select
                  value={settings.sampleRate}
                  onChange={(e) =>
                    onSettingsChange({
                      sampleRate: Number(e.target.value) as ConversionSettings['sampleRate'],
                    })
                  }
                  className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                >
                  <option value={48000}>48,000 Hz</option>
                  <option value={44100}>44,100 Hz (CD)</option>
                  <option value={22050}>22,050 Hz</option>
                  <option value={16000}>16,000 Hz (Voice)</option>
                </select>
              </div>
              {mode === 'advanced' && has('channels') && (
                <div>
                  <label className="text-xs font-medium text-[#17191D] block mb-1">Channels</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([2, 1] as const).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => onSettingsChange({ channels: ch })}
                        className={`h-8 rounded-md text-xs font-medium border cursor-pointer ${
                          settings.channels === ch
                            ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                            : 'bg-[#F6F7F9] border-[#E2E5EC] text-[#17191D]'
                        }`}
                      >
                        {ch === 2 ? 'Stereo (2ch)' : 'Mono (1ch)'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIDEO RESOLUTION / FPS */}
          {has('videoResolution') && (
            <div>
              <label className="text-xs font-medium text-[#17191D] block mb-1">Max Output Width</label>
              <select
                value={settings.videoMaxWidth}
                onChange={(e) =>
                  onSettingsChange({
                    videoMaxWidth: Number(e.target.value) as ConversionSettings['videoMaxWidth'],
                  })
                }
                className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              >
                <option value={480}>480 px (Compact)</option>
                <option value={720}>720 px (HD)</option>
                <option value={1280}>1280 px (720p Wide)</option>
                <option value={1920}>1920 px (1080p)</option>
              </select>
            </div>
          )}

          {has('videoFps') && (
            <div>
              <label className="text-xs font-medium text-[#17191D] block mb-1">GIF Frame Rate</label>
              <div className="grid grid-cols-4 gap-1">
                {([8, 12, 24, 30] as const).map((fps) => (
                  <button
                    key={fps}
                    type="button"
                    onClick={() => onSettingsChange({ videoFps: fps })}
                    className={`h-7 rounded text-[11px] font-mono border cursor-pointer ${
                      settings.videoFps === fps
                        ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                        : 'bg-[#F6F7F9] border-[#E2E5EC] text-[#17191D]'
                    }`}
                  >
                    {fps}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SPREADSHEET SHEET SELECTION */}
          {has('sheetSelection') && sheetNames.length > 0 && (
            <div>
              <label className="text-xs font-medium text-[#17191D] block mb-1">Worksheet</label>
              <select
                value={settings.sheetName || sheetNames[0]}
                onChange={(e) => onSettingsChange({ sheetName: e.target.value })}
                className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              >
                {sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {has('cleanSpreadsheet') && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-[#17191D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.trimCells}
                  onChange={(e) => onSettingsChange({ trimCells: e.target.checked })}
                  className="accent-[#1D4ED8]"
                />
                <span>Trim cell whitespace & empty rows</span>
              </label>
              {mode === 'advanced' && (
                <label className="flex items-center gap-2 text-xs text-[#17191D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.deduplicateRows}
                    onChange={(e) => onSettingsChange({ deduplicateRows: e.target.checked })}
                    className="accent-[#1D4ED8]"
                  />
                  <span>Remove duplicate rows</span>
                </label>
              )}
            </div>
          )}

          {/* ADVANCED-ONLY OPTIONS */}
          {mode === 'advanced' && (
            <div className="space-y-3 pt-2 border-t border-[#F1F3F6]">
              {has('dimensions') && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#17191D] block">
                    Resize Dimensions (px, blank = original)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={1}
                      placeholder="Width"
                      value={settings.width ?? ''}
                      onChange={(e) =>
                        onSettingsChange({
                          width: e.target.value.trim() ? Number(e.target.value) : null,
                        })
                      }
                      className="h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Height"
                      value={settings.height ?? ''}
                      onChange={(e) =>
                        onSettingsChange({
                          height: e.target.value.trim() ? Number(e.target.value) : null,
                        })
                      }
                      className="h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-[#717782] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.maintainAspect}
                      onChange={(e) => onSettingsChange({ maintainAspect: e.target.checked })}
                      className="accent-[#1D4ED8]"
                    />
                    <span>Maintain aspect ratio when one dimension is blank</span>
                  </label>
                </div>
              )}

              {has('backgroundColor') && (
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-[#17191D]">Opaque Backdrop</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={settings.backgroundColor}
                      onChange={(e) => onSettingsChange({ backgroundColor: e.target.value })}
                      className="w-7 h-7 p-0.5 bg-white border border-[#E2E5EC] rounded cursor-pointer"
                    />
                    <span className="font-mono text-[11px] text-[#717782] uppercase">
                      {settings.backgroundColor}
                    </span>
                  </div>
                </div>
              )}

              {has('preserveTransparency') && (
                <label className="flex items-center gap-2 text-xs text-[#17191D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.preserveTransparency}
                    onChange={(e) => onSettingsChange({ preserveTransparency: e.target.checked })}
                    className="accent-[#1D4ED8]"
                  />
                  <span>Preserve alpha transparency</span>
                </label>
              )}

              {has('stripMetadata') && (
                <label className="flex items-center gap-2 text-xs text-[#17191D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.stripMetadata}
                    onChange={(e) => onSettingsChange({ stripMetadata: e.target.checked })}
                    className="accent-[#1D4ED8]"
                  />
                  <span>Strip EXIF / document metadata on export</span>
                </label>
              )}

              {has('pageRange') && (
                <div>
                  <label className="text-xs font-medium text-[#17191D] block mb-1">
                    Page Range (blank = all)
                  </label>
                  <input
                    type="text"
                    value={settings.pageRange}
                    onChange={(e) => onSettingsChange({ pageRange: e.target.value })}
                    placeholder="e.g. 1-3, 5"
                    className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                  />
                </div>
              )}

              {has('dpi') && (
                <div>
                  <label className="text-xs font-medium text-[#17191D] block mb-1">Render DPI</label>
                  <div className="grid grid-cols-3 gap-1">
                    {([72, 150, 300] as const).map((dpi) => (
                      <button
                        key={dpi}
                        type="button"
                        onClick={() => onSettingsChange({ dpi })}
                        className={`h-7 rounded text-[11px] font-mono border cursor-pointer ${
                          settings.dpi === dpi
                            ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                            : 'bg-[#F6F7F9] border-[#E2E5EC] text-[#17191D]'
                        }`}
                      >
                        {dpi} DPI
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {has('videoAspectRatio') && (
                <div>
                  <label className="text-xs font-medium text-[#17191D] block mb-1">Aspect Ratio</label>
                  <select
                    value={settings.videoAspectRatio}
                    onChange={(e) =>
                      onSettingsChange({
                        videoAspectRatio: e.target.value as ConversionSettings['videoAspectRatio'],
                      })
                    }
                    className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs font-mono"
                  >
                    <option value="original">Original</option>
                    <option value="16:9">16:9 Landscape</option>
                    <option value="9:16">9:16 Vertical</option>
                    <option value="1:1">1:1 Square</option>
                    <option value="4:5">4:5 Social</option>
                  </select>
                </div>
              )}

              {has('muteAudio') && (
                <label className="flex items-center gap-2 text-xs text-[#17191D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.muteAudio}
                    onChange={(e) => onSettingsChange({ muteAudio: e.target.checked })}
                    className="accent-[#1D4ED8]"
                  />
                  <span>Mute audio track in WebM output</span>
                </label>
              )}

              {has('prettyPrint') && (
                <label className="flex items-center gap-2 text-xs text-[#17191D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.prettyPrint}
                    onChange={(e) => onSettingsChange({ prettyPrint: e.target.checked })}
                    className="accent-[#1D4ED8]"
                  />
                  <span>Pretty-print indented output</span>
                </label>
              )}

              {has('xmlRootName') && (
                <div>
                  <label className="text-xs font-medium text-[#17191D] block mb-1">XML Root Element</label>
                  <input
                    type="text"
                    value={settings.xmlRootName}
                    onChange={(e) => onSettingsChange({ xmlRootName: e.target.value })}
                    placeholder="root"
                    className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                  />
                </div>
              )}

              {has('csvDelimiter') && (
                <div>
                  <label className="text-xs font-medium text-[#17191D] block mb-1">CSV Delimiter</label>
                  <select
                    value={settings.csvDelimiter}
                    onChange={(e) =>
                      onSettingsChange({
                        csvDelimiter: e.target.value as ConversionSettings['csvDelimiter'],
                      })
                    }
                    className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md text-xs"
                  >
                    <option value=",">Comma (,)</option>
                    <option value=";">Semicolon (;)</option>
                    <option value={'\t'}>Tab (\t)</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reliable estimate & engine metadata */}
      {activeDefinition && (
        <div className="p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg space-y-2 text-[11px]">
          <div className="flex items-center justify-between text-[#717782]">
            <span>Engine</span>
            <span className="font-mono text-[#17191D] text-right truncate max-w-[155px]">
              {activeDefinition.processingEngine}
            </span>
          </div>
          {estimatedOutputNote && (
            <div className="flex items-center justify-between text-[#717782]">
              <span>Estimated Size</span>
              <span className="font-mono text-[#0D9488] tabular-nums text-right">
                {estimatedOutputNote}
              </span>
            </div>
          )}
          <div className="pt-1.5 border-t border-[#E2E5EC] text-[#717782] leading-relaxed flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-[#D97706] shrink-0 mt-0.5" />
            <span>{activeDefinition.limitations}</span>
          </div>
        </div>
      )}

      {/* Primary Convert Action + Reset */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          disabled={disabled || !targetFormat || isConvertingActive}
          onClick={onConvertActive}
          className="w-full h-9 bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-45 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>{isConvertingActive ? 'Converting…' : 'Convert Selected File'}</span>
        </button>

        <button
          type="button"
          onClick={onResetSettings}
          className="w-full h-8 bg-white hover:bg-[#F6F7F9] border border-[#E2E5EC] text-[#717782] hover:text-[#17191D] text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Parameters</span>
        </button>
      </div>
    </div>
  );
};
