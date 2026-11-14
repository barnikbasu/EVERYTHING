import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Upload } from 'lucide-react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioEmptyCard, StudioNotice } from '../StudioFeedback';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  SOCIAL_PRESETS,
  computeContrastRatio,
  extractPaletteFromFile,
  generateFaviconZip,
  generateQrOutputs,
  renderDesignComposition,
  renderPaletteCardPng,
  type DesignCompositionOptions,
  type PaletteSwatch,
} from '../../engines/designEngine';
import { downloadBlob, formatBytes, replaceFileExtension } from '../../utils/formatters';
import { dataUrlToBlob, imageMimeToExt } from '../../utils/mediaUtils';

const DESIGN_RAIL_TABS: StudioRailTab[] = [
  { id: 'social', label: 'Canvas', icon: 'Palette' },
  { id: 'palette', label: 'Palette', icon: 'Pipette' },
  { id: 'qr', label: 'QR Code', icon: 'QrCode' },
  { id: 'favicon', label: 'Favicon', icon: 'Images' },
];

export const DesignStudio: React.FC = () => {
  const { selectedTool, files, addFiles, recordHistory } = useWorkspace();
  const { copiedKey, copyText } = useCopyFeedback();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const activeFile = files[0]?.file || null;

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (selectedTool?.id === 'design-palette-picker') return 'palette';
    if (selectedTool?.id === 'design-qr-favicon') return 'qr';
    return 'social';
  });

  // Social / Meme / Banner Composition state
  const [compOpts, setCompOpts] = useState<DesignCompositionOptions>({
    width: 1080,
    height: 1080,
    backgroundColor: '#17191D',
    imageFit: 'cover',
    topText: 'EVERYTHING STUDIO',
    bottomText: 'Local-first creative export',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    fontSize: 64,
    overlayScrim: 0.25,
    badgeText: 'NEW',
    badgeColor: '#1D4ED8',
  });
  const [socialFormat, setSocialFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const [socialQuality, setSocialQuality] = useState(0.92);
  const [paletteExportFormat, setPaletteExportFormat] = useState<'json' | 'css' | 'png'>('json');
  const [filename, setFilename] = useState('design_1080x1080.png');
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [compPreviewUrl, setCompPreviewUrl] = useState('');
  const [compBlob, setCompBlob] = useState<Blob | null>(null);

  // Palette Extractor state
  const [swatches, setSwatches] = useState<PaletteSwatch[]>([]);
  const [fgHex, setFgHex] = useState('#17191D');
  const [bgHex, setBgHex] = useState('#FFFFFF');

  // QR Code state
  const [qrText, setQrText] = useState('https://everything.local');
  const [qrDark, setQrDark] = useState('#17191D');
  const [qrLight, setQrLight] = useState('#FFFFFF');
  const [qrEcc, setQrEcc] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [qrOutputs, setQrOutputs] = useState<{ pngDataUrl: string; svgString: string } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTool?.id === 'design-palette-picker') setActiveTab('palette');
    else if (selectedTool?.id === 'design-qr-favicon') setActiveTab('qr');
    else if (selectedTool?.id === 'design-social-studio') setActiveTab('social');
  }, [selectedTool?.id]);

  // Sync suggested filename on tab or format changes
  useEffect(() => {
    if (activeTab === 'qr') {
      setFilename('qrcode_512.png');
    } else if (activeTab === 'favicon') {
      setFilename('favicon_pack.zip');
    } else if (activeTab === 'palette') {
      setFilename(`palette.${paletteExportFormat}`);
    } else {
      setFilename(`design_${compOpts.width}x${compOpts.height}.${imageMimeToExt(socialFormat)}`);
    }
  }, [activeTab, compOpts.width, compOpts.height, socialFormat, paletteExportFormat]);

  // Load source image & extract palette
  useEffect(() => {
    const ext = activeFile?.name.split('.').pop()?.toLowerCase() || '';
    const isImage = Boolean(
      activeFile &&
        (activeFile.type.startsWith('image/') ||
          ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext))
    );
    if (!activeFile || !isImage) {
      setLoadedImg(null);
      setSwatches([]);
      return;
    }
    setErrorMsg(null);
    const url = files[0].objectUrl;
    const img = new Image();
    img.onload = () => setLoadedImg(img);
    img.onerror = () => setErrorMsg('Could not decode image preview.');
    img.src = url;

    extractPaletteFromFile(activeFile, 6)
      .then((res) => setSwatches(res))
      .catch((err) => {
        setSwatches([]);
        setErrorMsg(err instanceof Error ? err.message : 'Failed to extract palette colors.');
      });
  }, [activeFile, files]);

  // Render live social/banner/meme composition
  useEffect(() => {
    if (activeTab !== 'social') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await renderDesignComposition(loadedImg, {
          ...compOpts,
          outputFormat: socialFormat,
          quality: socialQuality,
        });
        if (!cancelled) {
          setCompPreviewUrl(res.dataUrl);
          setCompBlob(res.blob);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to render composition.');
        }
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loadedImg, compOpts, socialFormat, socialQuality, activeTab]);

  // Render live QR code
  useEffect(() => {
    if (activeTab !== 'qr') return;
    generateQrOutputs(qrText, qrDark, qrLight, 512, qrEcc)
      .then((out) => {
        setQrOutputs(out);
        setErrorMsg(null);
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to generate QR code.');
      });
  }, [qrText, qrDark, qrLight, qrEcc, activeTab]);

  const hexToRgb = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return [0, 0, 0];
    return [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
    ];
  };

  const contrastRatio = computeContrastRatio(hexToRgb(fgHex), hexToRgb(bgHex));

  const handleExport = async () => {
    const t0 = performance.now();
    setErrorMsg(null);
    if (activeTab === 'social' && compBlob) {
      const outName = replaceFileExtension(filename || `design_${compOpts.width}x${compOpts.height}`, imageMimeToExt(socialFormat));
      downloadBlob(compBlob, outName);
      recordHistory({
        toolId: 'design-social-studio',
        toolName: 'Creator Canvas',
        category: 'design',
        inputFilename: activeFile?.name || 'canvas',
        outputFilename: outName,
        inputSize: activeFile?.size || 0,
        outputSize: compBlob.size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } else if (activeTab === 'palette') {
      setIsProcessing(true);
      try {
        const outName = replaceFileExtension(filename || 'palette', paletteExportFormat);
        let blob: Blob;
        if (paletteExportFormat === 'png') {
          blob = await renderPaletteCardPng(swatches, fgHex, bgHex);
        } else if (paletteExportFormat === 'css') {
          const lines = [
            ':root {',
            `  --contrast-fg: ${fgHex};`,
            `  --contrast-bg: ${bgHex};`,
            ...swatches.map((s, idx) => `  --swatch-${idx + 1}: ${s.hex};`),
            '}',
          ];
          blob = new Blob([lines.join('\n')], { type: 'text/css;charset=utf-8' });
        } else {
          const payload = {
            contrastPair: { fgHex, bgHex, contrastRatio },
            swatches,
          };
          blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        }
        downloadBlob(blob, outName);
        recordHistory({
          toolId: 'design-palette-picker',
          toolName: 'Palette & Contrast Export',
          category: 'design',
          inputFilename: activeFile?.name || 'contrast_pair',
          outputFilename: outName,
          inputSize: activeFile?.size || 0,
          outputSize: blob.size,
          durationMs: performance.now() - t0,
          mode: 'local',
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Palette export failed.');
      } finally {
        setIsProcessing(false);
      }
    } else if (activeTab === 'qr' && qrOutputs) {
      const blob = dataUrlToBlob(qrOutputs.pngDataUrl);
      const outName = replaceFileExtension(filename || 'qrcode_512', 'png');
      downloadBlob(blob, outName);
      recordHistory({
        toolId: 'design-qr-favicon',
        toolName: 'QR Generator (PNG)',
        category: 'design',
        inputFilename: qrText.slice(0, 32) || 'qrcode',
        outputFilename: outName,
        inputSize: qrText.length,
        outputSize: blob.size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } else if (activeTab === 'favicon' && activeFile) {
      setIsProcessing(true);
      try {
        const zipBlob = await generateFaviconZip(activeFile);
        const outName = replaceFileExtension(filename || 'favicon_pack', 'zip');
        downloadBlob(zipBlob, outName);
        recordHistory({
          toolId: 'design-qr-favicon',
          toolName: 'Favicon Pack',
          category: 'design',
          inputFilename: activeFile.name,
          outputFilename: outName,
          inputSize: activeFile.size,
          outputSize: zipBlob.size,
          durationMs: performance.now() - t0,
          mode: 'local',
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Favicon ZIP generation failed.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const settingsPanel = (
    <div className="space-y-4">
      {activeTab === 'social' && (
        <div className="space-y-3.5">
          <h3 className="text-sm font-bold text-[#17191D]">Social & Banner Presets</h3>
          <div className="grid grid-cols-1 gap-1.5">
            {SOCIAL_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setCompOpts((o) => ({ ...o, width: p.width, height: p.height }))}
                className={`px-2.5 py-1.5 rounded-md border text-left flex items-center justify-between text-xs cursor-pointer ${
                  compOpts.width === p.width && compOpts.height === p.height
                    ? 'bg-[#F5F3FF] border-[#7C3AED] text-[#6D28D9]'
                    : 'bg-[#F6F7F9] border-[#E2E5EC]'
                }`}
              >
                <span className="truncate font-medium">{p.label}</span>
                <span className="font-mono text-[10px]">
                  {p.width}×{p.height}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E2E5EC]">
            <input
              type="text"
              value={compOpts.topText}
              onChange={(e) => setCompOpts((o) => ({ ...o, topText: e.target.value }))}
              placeholder="Top headline / meme text"
              className="w-full h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
            />
            <input
              type="text"
              value={compOpts.bottomText}
              onChange={(e) => setCompOpts((o) => ({ ...o, bottomText: e.target.value }))}
              placeholder="Bottom caption"
              className="w-full h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
            />
            <input
              type="text"
              value={compOpts.badgeText}
              onChange={(e) => setCompOpts((o) => ({ ...o, badgeText: e.target.value }))}
              placeholder="Corner tag (optional)"
              className="w-full h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#717782]">Text Size</span>
              <span className="font-mono tabular-nums">{compOpts.fontSize}px</span>
            </div>
            <input
              type="range"
              min={24}
              max={120}
              value={compOpts.fontSize}
              onChange={(e) => setCompOpts((o) => ({ ...o, fontSize: Number(e.target.value) }))}
              className="w-full accent-[#7C3AED]"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#717782]">Background Scrim</span>
              <span className="font-mono tabular-nums">{Math.round(compOpts.overlayScrim * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={70}
              value={Math.round(compOpts.overlayScrim * 100)}
              onChange={(e) =>
                setCompOpts((o) => ({ ...o, overlayScrim: Number(e.target.value) / 100 }))
              }
              className="w-full accent-[#7C3AED]"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E2E5EC]">
            <label className="text-[11px] text-[#717782] block">Output Format</label>
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
                  onClick={() => setSocialFormat(fmt.mime)}
                  className={`py-1.5 text-xs font-mono rounded border cursor-pointer ${
                    socialFormat === fmt.mime
                      ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                      : 'bg-[#F6F7F9] border-[#E2E5EC]'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
            {socialFormat !== 'image/png' && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#717782]">Quality</span>
                  <span className="font-mono tabular-nums">{Math.round(socialQuality * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={Math.round(socialQuality * 100)}
                  onChange={(e) => setSocialQuality(Number(e.target.value) / 100)}
                  className="w-full accent-[#7C3AED]"
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => filePickerRef.current?.click()}
            className="w-full h-9 text-xs font-medium bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg transition-colors cursor-pointer"
          >
            Upload Backdrop Photo…
          </button>
        </div>
      )}

      {activeTab === 'palette' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">WCAG Contrast Tester</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-[#717782] block mb-1">Foreground</label>
              <input
                type="color"
                value={fgHex}
                onChange={(e) => setFgHex(e.target.value)}
                className="w-full h-9 rounded border border-[#E2E5EC]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#717782] block mb-1">Background</label>
              <input
                type="color"
                value={bgHex}
                onChange={(e) => setBgHex(e.target.value)}
                className="w-full h-9 rounded border border-[#E2E5EC]"
              />
            </div>
          </div>
          <div className="p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg font-mono text-xs space-y-1 tabular-nums">
            <div>Ratio: {contrastRatio}:1</div>
            <div>AA Normal (4.5): {contrastRatio >= 4.5 ? 'Pass' : 'Fail'}</div>
            <div>AAA Normal (7.0): {contrastRatio >= 7.0 ? 'Pass' : 'Fail'}</div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-[#E2E5EC]">
            <label className="text-[11px] text-[#717782] block">Palette Export Format</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['json', 'css', 'png'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setPaletteExportFormat(fmt)}
                  className={`py-1.5 text-xs font-mono uppercase rounded border cursor-pointer ${
                    paletteExportFormat === fmt
                      ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                      : 'bg-[#F6F7F9] border-[#E2E5EC]'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'qr' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">QR Code Generator</h3>
          <textarea
            value={qrText}
            onChange={(e) => setQrText(e.target.value)}
            rows={3}
            placeholder="URL, Wi-Fi string, or text…"
            className="w-full p-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-[#717782] block mb-1">Foreground</label>
              <input
                type="color"
                value={qrDark}
                onChange={(e) => setQrDark(e.target.value)}
                className="w-full h-8 rounded border border-[#E2E5EC] cursor-pointer"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#717782] block mb-1">Background</label>
              <input
                type="color"
                value={qrLight}
                onChange={(e) => setQrLight(e.target.value)}
                className="w-full h-8 rounded border border-[#E2E5EC] cursor-pointer"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-[#717782] block mb-1">Error Correction</label>
            <select
              value={qrEcc}
              onChange={(e) => setQrEcc(e.target.value as 'L' | 'M' | 'Q' | 'H')}
              className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
            >
              <option value="L">L (7%)</option>
              <option value="M">M (15%)</option>
              <option value="Q">Q (25%)</option>
              <option value="H">H (30%)</option>
            </select>
          </div>
        </div>
      )}

      {activeTab === 'favicon' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Favicon & App Icon Pack</h3>
          <p className="text-xs text-[#717782]">
            Generates 16, 32, 48, 96, 180, 192, and 512px PNG icons + site.webmanifest inside a ZIP.
          </p>
          <button
            type="button"
            onClick={() => filePickerRef.current?.click()}
            className="w-full h-9 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Select Square Logo Image
          </button>
        </div>
      )}
    </div>
  );

  return (
    <StudioShell
      filename={filename}
      onFilenameChange={setFilename}
      outputLabel={
        activeTab === 'social'
          ? imageMimeToExt(socialFormat).toUpperCase()
          : activeTab === 'palette'
          ? paletteExportFormat.toUpperCase()
          : activeTab === 'qr'
          ? 'PNG / SVG'
          : 'ZIP Pack'
      }
      isProcessing={isProcessing}
      onExport={handleExport}
      exportLabel={
        activeTab === 'qr'
          ? 'Download PNG'
          : activeTab === 'favicon'
          ? 'Download Icon ZIP'
          : activeTab === 'palette'
          ? `Export ${paletteExportFormat.toUpperCase()}`
          : `Export ${imageMimeToExt(socialFormat).toUpperCase()}`
      }
      exportDisabled={
        (activeTab === 'social' && !compBlob) ||
        (activeTab === 'favicon' && !activeFile)
      }
      railTabs={DESIGN_RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={setActiveTab}
      settingsPanel={settingsPanel}
      bottomMetaLeft={
        activeTab === 'social'
          ? `Canvas: ${compOpts.width} × ${compOpts.height} px · ${compBlob ? formatBytes(compBlob.size) : ''}`
          : activeFile?.name || 'Creator Studio'
      }
      bottomMetaRight="Canvas 2D + qrcode + JSZip"
    >
      <input
        ref={filePickerRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(Array.from(e.target.files), true);
        }}
      />

      <div className="min-h-full studio-grid-bg p-4 sm:p-8 flex flex-col items-center justify-center gap-4">
        {errorMsg && (
          <StudioNotice variant="error" className="max-w-xl w-full">
            {errorMsg}
          </StudioNotice>
        )}

        {activeTab === 'social' && compPreviewUrl && (
          <img
            src={compPreviewUrl}
            alt="Social design preview"
            className="max-w-full max-h-[68vh] rounded-lg border border-[#E2E5EC] shadow-sm object-contain"
          />
        )}

        {activeTab === 'palette' && (
          <div className="max-w-3xl w-full bg-white border border-[#E2E5EC] rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#17191D]">Color Palette & Contrast</h2>
                <p className="text-xs text-[#717782]">
                  Upload any image to extract dominant swatches with WCAG contrast checks.
                </p>
              </div>
              <button
                type="button"
                onClick={() => filePickerRef.current?.click()}
                className="h-9 px-3.5 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Image</span>
              </button>
            </div>

            <div
              className="p-6 rounded-xl border border-[#E2E5EC] text-center space-y-1"
              style={{ backgroundColor: bgHex, color: fgHex }}
            >
              <div className="text-lg font-bold tabular-nums">Sample Contrast Preview ({contrastRatio}:1)</div>
              <div className="text-xs opacity-90">
                Readable body copy check across selected foreground and background hex values.
              </div>
            </div>

            {swatches.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {swatches.map((s) => (
                  <div
                    key={s.hex}
                    className="border border-[#E2E5EC] rounded-lg overflow-hidden bg-[#F6F7F9]"
                  >
                    <div className="h-16" style={{ backgroundColor: s.hex }} />
                    <div className="p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold">{s.hex}</span>
                        <button
                          type="button"
                          onClick={() => copyText(s.hex, s.hex)}
                          className="text-[#717782] hover:text-[#17191D] cursor-pointer"
                          title="Copy HEX"
                          aria-label={`Copy ${s.hex}`}
                        >
                          {copiedKey === s.hex ? (
                            <Check className="w-3 h-3 text-[#0D9488]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <div className="font-mono text-[10px] text-[#717782]">{s.hsl}</div>
                      <div className="flex gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => setFgHex(s.hex)}
                          className="flex-1 py-0.5 text-[10px] bg-white hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded cursor-pointer"
                        >
                          Set FG
                        </button>
                        <button
                          type="button"
                          onClick={() => setBgHex(s.hex)}
                          className="flex-1 py-0.5 text-[10px] bg-white hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded cursor-pointer"
                        >
                          Set BG
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'qr' && qrOutputs && (
          <div className="bg-white border border-[#E2E5EC] rounded-xl p-6 text-center space-y-4">
            <img
              src={qrOutputs.pngDataUrl}
              alt="Generated QR code"
              className="w-64 h-64 mx-auto border border-[#E2E5EC] rounded-lg"
            />
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="h-9 px-4 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Download PNG
              </button>
              <button
                type="button"
                onClick={() => {
                  const t0 = performance.now();
                  const blob = new Blob([qrOutputs.svgString], { type: 'image/svg+xml' });
                  downloadBlob(blob, 'qrcode.svg');
                  recordHistory({
                    toolId: 'design-qr-favicon',
                    toolName: 'QR Generator (SVG)',
                    category: 'design',
                    inputFilename: qrText.slice(0, 32) || 'qrcode',
                    outputFilename: 'qrcode.svg',
                    inputSize: qrText.length,
                    outputSize: blob.size,
                    durationMs: performance.now() - t0,
                    mode: 'local',
                  });
                }}
                className="h-9 px-4 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Download SVG
              </button>
            </div>
          </div>
        )}

        {activeTab === 'favicon' &&
          (activeFile ? (
            <div className="max-w-md w-full bg-white border border-[#E2E5EC] rounded-xl p-6 text-center space-y-4">
              <img
                src={files[0].objectUrl}
                alt="Favicon source"
                className="w-28 h-28 mx-auto rounded-xl border border-[#E2E5EC] object-contain bg-[#F6F7F9]"
              />
              <p className="text-xs font-mono text-[#717782] truncate">{activeFile.name}</p>
              <button
                type="button"
                onClick={handleExport}
                className="h-9 px-5 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Generate & Download Favicon ZIP
              </button>
            </div>
          ) : (
            <StudioEmptyCard
              category="design"
              iconName="Images"
              title="Favicon & App Icon Pack"
              description="Upload a square PNG or SVG logo to generate 16–512px icons + site.webmanifest inside a ZIP."
              primaryLabel="Select Logo"
              onPrimaryClick={() => filePickerRef.current?.click()}
              footnote="Generates 7 PNG sizes + manifest locally"
            />
          ))}
      </div>
    </StudioShell>
  );
};
