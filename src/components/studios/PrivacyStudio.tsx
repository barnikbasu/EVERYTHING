import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, RefreshCw, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioEmptyCard, StudioNotice } from '../StudioFeedback';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  estimatePasswordEntropy,
  generateSecurePassword,
  inspectFilePrivacy,
  stripImageMetadata,
  stripPdfMetadata,
  type FileSignatureInspection,
} from '../../engines/privacyEngine';
import { downloadBlob, formatBytes, replaceFileExtension } from '../../utils/formatters';
import { imageMimeToExt } from '../../utils/mediaUtils';

const PRIVACY_RAIL_TABS: StudioRailTab[] = [
  { id: 'inspect', label: 'Inspect', icon: 'ShieldCheck' },
  { id: 'passwords', label: 'Keys', icon: 'KeyRound' },
];

export const PrivacyStudio: React.FC = () => {
  const { selectedTool, files, addFiles, recordHistory } = useWorkspace();
  const { copiedKey, copyText } = useCopyFeedback();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const activeFile = files[0]?.file || null;

  const [activeTab, setActiveTab] = useState<string>(() =>
    selectedTool?.id === 'privacy-passwords-hash' ? 'passwords' : 'inspect'
  );

  const [inspection, setInspection] = useState<FileSignatureInspection | null>(null);
  const [expectedHash, setExpectedHash] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Password Lab
  const [pwOpts, setPwOpts] = useState({
    length: 20,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  const [generatedPw, setGeneratedPw] = useState(() =>
    generateSecurePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    })
  );
  const [testPw, setTestPw] = useState('CorrectHorseBattery99!');

  useEffect(() => {
    if (selectedTool?.id === 'privacy-passwords-hash') setActiveTab('passwords');
  }, [selectedTool?.id]);

  useEffect(() => {
    if (!activeFile) {
      setInspection(null);
      setErrorMsg(null);
      return;
    }
    let cancelled = false;
    setIsProcessing(true);
    setErrorMsg(null);
    inspectFilePrivacy(activeFile)
      .then((res) => {
        if (!cancelled) setInspection(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setInspection(null);
          setErrorMsg(err instanceof Error ? err.message : 'Unable to inspect file.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsProcessing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFile]);

  const ext = activeFile?.name.split('.').pop()?.toLowerCase() || '';
  const isImageFile = Boolean(
    activeFile &&
      (activeFile.type.startsWith('image/') ||
        ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext))
  );
  const isPdfFile = Boolean(
    activeFile && (activeFile.type === 'application/pdf' || ext === 'pdf')
  );

  const handleStripImage = async () => {
    if (!activeFile || !isImageFile) return;
    setIsProcessing(true);
    setErrorMsg(null);
    const t0 = performance.now();
    try {
      const cleanBlob = await stripImageMetadata(activeFile);
      const outName = replaceFileExtension(`clean_${activeFile.name}`, imageMimeToExt(cleanBlob.type));
      downloadBlob(cleanBlob, outName);
      recordHistory({
        toolId: 'privacy-strip-metadata',
        toolName: 'Strip Image Metadata',
        category: 'privacy',
        inputFilename: activeFile.name,
        outputFilename: outName,
        inputSize: activeFile.size,
        outputSize: cleanBlob.size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to strip image metadata.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStripPdf = async () => {
    if (!activeFile || !isPdfFile) return;
    setIsProcessing(true);
    setErrorMsg(null);
    const t0 = performance.now();
    try {
      const cleanBlob = await stripPdfMetadata(activeFile);
      const outName = replaceFileExtension(`clean_${activeFile.name}`, 'pdf');
      downloadBlob(cleanBlob, outName);
      recordHistory({
        toolId: 'privacy-strip-metadata',
        toolName: 'Strip PDF Metadata',
        category: 'privacy',
        inputFilename: activeFile.name,
        outputFilename: outName,
        inputSize: activeFile.size,
        outputSize: cleanBlob.size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to strip PDF metadata.');
    } finally {
      setIsProcessing(false);
    }
  };

  const entropyEstimate = estimatePasswordEntropy(testPw);
  const hashMatch =
    inspection && expectedHash.trim()
      ? inspection.sha256.toLowerCase() === expectedHash.trim().toLowerCase()
      : null;

  return (
    <StudioShell
      filename={activeFile?.name || 'privacy_lab'}
      isProcessing={isProcessing}
      railTabs={PRIVACY_RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={setActiveTab}
      bottomMetaLeft={inspection ? `${inspection.detectedFormat} · ${formatBytes(inspection.sizeBytes)}` : 'No file inspected'}
      bottomMetaRight="Binary Header Parser + Web Crypto CSPRNG"
    >
      <input
        ref={filePickerRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(Array.from(e.target.files), true);
        }}
      />

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
        {errorMsg && <StudioNotice variant="error">{errorMsg}</StudioNotice>}
        {activeTab === 'inspect' && (
          <div className="space-y-4">
            {!inspection ? (
              <div className="py-8 flex justify-center">
                <StudioEmptyCard
                  category="privacy"
                  iconName="ShieldCheck"
                  title="Inspect File Signature, EXIF & Checksum"
                  description="Inspects binary magic bytes, embedded JPEG EXIF & PNG metadata segments, and computes a local SHA-256 digest."
                  primaryLabel="Select File to Inspect"
                  onPrimaryClick={() => filePickerRef.current?.click()}
                  footnote="100% client-side binary parser · Zero file upload"
                />
              </div>
            ) : (
              <>
                <div className="bg-white border border-[#E2E5EC] rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#17191D]">
                      File Signature, EXIF & Checksum Inspector
                    </h2>
                    <p className="text-xs text-[#717782]">
                      Inspects magic bytes, embedded JPEG APP1/EXIF & PNG text chunks, and computes SHA-256 locally.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => filePickerRef.current?.click()}
                    className="h-9 px-4 bg-[#17191D] hover:bg-[#272A30] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Inspect Another File</span>
                  </button>
                </div>

                <div className="bg-white border border-[#E2E5EC] rounded-xl p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg space-y-1">
                      <div className="text-[#717782]">Detected Signature</div>
                      <div className="font-semibold text-[#17191D]">{inspection.detectedFormat}</div>
                      <div className="font-mono text-[11px] text-[#717782]">
                        Magic: {inspection.magicHex || 'N/A'}
                      </div>
                    </div>
                    <div className="p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg space-y-1">
                      <div className="text-[#717782]">Declared Extension & MIME</div>
                      <div className="font-mono text-[#17191D] break-all">
                        {inspection.filename} ({inspection.declaredMime})
                      </div>
                      {inspection.extensionMismatch ? (
                        <div className="text-[#E5322D] font-semibold flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" /> Extension does not match magic bytes!
                        </div>
                      ) : (
                        <div className="text-[#0D9488] flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Signature matches extension
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SHA-256 + Verifier */}
                  <div className="p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">SHA-256 Digest</span>
                      <button
                        type="button"
                        onClick={() => copyText(inspection.sha256, 'sha256')}
                        className="text-[#1D4ED8] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'sha256' ? (
                          <>
                            <Check className="w-3 h-3 text-[#0D9488]" />
                            <span className="text-[#0D9488]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="font-mono text-xs break-all text-[#17191D]">{inspection.sha256}</div>
                    <input
                      type="text"
                      value={expectedHash}
                      onChange={(e) => setExpectedHash(e.target.value)}
                      placeholder="Paste expected SHA-256 to verify integrity…"
                      className="w-full h-8 px-2.5 bg-white border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8]"
                    />
                    {hashMatch !== null && (
                      <StudioNotice variant={hashMatch ? 'success' : 'error'}>
                        <span className="font-semibold">
                          {hashMatch ? 'Checksum Verified (Exact Match)' : 'Checksum Mismatch'}
                        </span>
                      </StudioNotice>
                    )}
                  </div>

                  {/* Metadata Findings */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#717782] tabular-nums">
                        Embedded Metadata Findings ({inspection.metadataFindings.length})
                      </h3>
                      {isImageFile && (
                        <button
                          type="button"
                          onClick={handleStripImage}
                          disabled={isProcessing}
                          className="h-8 px-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Strip EXIF & Download Clean Copy
                        </button>
                      )}
                      {isPdfFile && (
                        <button
                          type="button"
                          onClick={handleStripPdf}
                          disabled={isProcessing}
                          className="h-8 px-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Strip PDF Metadata & Download Clean Copy
                        </button>
                      )}
                    </div>
                    {inspection.metadataFindings.length === 0 ? (
                      <p className="text-xs text-[#717782]">
                        No standard EXIF, XMP, IPTC, or PNG text metadata segments detected.
                      </p>
                    ) : (
                      <div className="divide-y divide-[#F1F3F6] border border-[#E2E5EC] rounded-lg">
                        {inspection.metadataFindings.map((m, idx) => (
                          <div key={idx} className="px-3 py-2 flex justify-between gap-4 text-xs">
                            <span className="font-mono font-semibold text-[#17191D]">{m.key}</span>
                            <span className="font-mono text-[#717782] truncate">{m.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'passwords' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E2E5EC] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#17191D]">CSPRNG Password Generator</h3>
                <button
                  type="button"
                  onClick={() => setGeneratedPw(generateSecurePassword(pwOpts))}
                  className="h-8 px-2.5 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" /> Generate
                </button>
              </div>
              <div className="p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold break-all text-[#17191D]">
                  {generatedPw.password}
                </span>
                <button
                  type="button"
                  onClick={() => copyText(generatedPw.password, 'password')}
                  className="p-1.5 text-[#717782] hover:text-[#17191D] shrink-0 cursor-pointer"
                  aria-label="Copy generated password"
                >
                  {copiedKey === 'password' ? (
                    <Check className="w-4 h-4 text-[#0D9488]" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="text-xs font-mono text-[#717782] tabular-nums">
                Estimated pool: {generatedPw.poolSize} chars · ~{generatedPw.entropyBits} bits
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Length</span>
                  <span className="font-mono tabular-nums">{pwOpts.length}</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={64}
                  value={pwOpts.length}
                  onChange={(e) => {
                    const next = { ...pwOpts, length: Number(e.target.value) };
                    setPwOpts(next);
                    setGeneratedPw(generateSecurePassword(next));
                  }}
                  className="w-full accent-[#1D4ED8]"
                />
              </div>
            </div>

            <div className="bg-white border border-[#E2E5EC] rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-[#17191D]">Entropy Estimator</h3>
              <input
                type="text"
                value={testPw}
                onChange={(e) => setTestPw(e.target.value)}
                className="w-full h-9 px-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
              <div className="p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg font-mono text-xs space-y-1 tabular-nums">
                <div>Rating: {entropyEstimate.label}</div>
                <div>Estimated Entropy: ~{entropyEstimate.entropyBits} bits</div>
                <div>Character Pool: {entropyEstimate.charsetSize}</div>
              </div>
              <p className="text-[11px] text-[#717782]">
                Note: Mathematical entropy estimates character-set randomness only and cannot guarantee resistance against leaked passwords or dictionary attacks.
              </p>
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
};
