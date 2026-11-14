import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, FileText, GitCompareArrows, ScanText, Upload } from 'lucide-react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioNotice } from '../StudioFeedback';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  computeDocumentDiff,
  createSearchablePdfFromOcr,
  runLocalOcr,
  type OcrPageResult,
} from '../../engines/ocrEngine';
import { extractPdfText } from '../../engines/pdfEngine';
import { readDocxFile } from '../../engines/officeEngine';
import { downloadBlob, formatBytes, replaceFileExtension } from '../../utils/formatters';
import { requestCloudDocumentAssist } from '../../services/aiService';

const OCR_RAIL_TABS: StudioRailTab[] = [
  { id: 'ocr', label: 'OCR', icon: 'ScanText' },
  { id: 'compare', label: 'Diff', icon: 'GitCompareArrows' },
  { id: 'assist', label: 'AI Assist', icon: 'Terminal' },
];

export const OcrStudio: React.FC = () => {
  const { selectedTool, files, addFiles, recordHistory } = useWorkspace();
  const { copiedKey, copyText } = useCopyFeedback();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const activeFile = files[0]?.file || null;

  const [activeTab, setActiveTab] = useState<string>(() =>
    selectedTool?.id === 'doc-compare-assist' ? 'compare' : 'ocr'
  );

  // OCR state
  const [ocrLang, setOcrLang] = useState('eng');
  const [ocrPages, setOcrPages] = useState<OcrPageResult[]>([]);
  const [extractedText, setExtractedText] = useState('');
  const [avgConf, setAvgConf] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Diff state
  const [diffA, setDiffA] = useState('Line 1: EVERYTHING local workspace\nLine 2: Version 1.0 draft');
  const [diffB, setDiffB] = useState('Line 1: EVERYTHING local workspace\nLine 2: Version 2.0 verified');

  // Optional Cloud Assist (Explicit Consent Required)
  const [cloudConsent, setCloudConsent] = useState(false);
  const [assistTask, setAssistTask] = useState<'summarize' | 'translate' | 'extract-key-points'>('summarize');
  const [targetLang, setTargetLang] = useState('Spanish');
  const [assistOutput, setAssistOutput] = useState('');

  useEffect(() => {
    if (selectedTool?.id === 'doc-compare-assist') setActiveTab('compare');
    else if (selectedTool?.id === 'ocr-extract') setActiveTab('ocr');
  }, [selectedTool?.id]);

  // Auto-extract text if user loads a text/docx/pdf file in compare/assist tab
  useEffect(() => {
    if (!activeFile) return;
    let cancelled = false;
    const ext = activeFile.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'txt' || ext === 'md' || ext === 'json' || ext === 'csv') {
      activeFile
        .text()
        .then((t) => {
          if (cancelled) return;
          setExtractedText(t);
          setDiffA(t);
        })
        .catch((err) => {
          if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'Failed to read text file.');
        });
    } else if (ext === 'docx') {
      readDocxFile(activeFile)
        .then((r) => {
          if (cancelled) return;
          setExtractedText(r.plainText);
          setDiffA(r.plainText);
        })
        .catch((err) => {
          if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'Failed to read DOCX file.');
        });
    } else if (ext === 'pdf' && activeTab !== 'ocr') {
      extractPdfText(activeFile)
        .then((pages) => {
          if (cancelled) return;
          const joined = pages.map((p) => p.text).join('\n\n');
          if (joined.trim()) {
            setExtractedText(joined);
            setDiffA(joined);
          }
        })
        .catch((err) => {
          if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'Failed to extract PDF text.');
        });
    }
    return () => {
      cancelled = true;
    };
  }, [activeFile, activeTab]);

  const handleRunOcr = async () => {
    if (!activeFile) return;
    setIsProcessing(true);
    setErrorMsg(null);
    setOcrProgress(0);
    const t0 = performance.now();
    try {
      const res = await runLocalOcr(activeFile, ocrLang, (st, pct) => {
        setOcrStatus(st);
        setOcrProgress(pct);
      });
      setOcrPages(res.pages);
      setExtractedText(res.fullText);
      setAvgConf(res.avgConfidence);
      setDiffA(res.fullText);
      recordHistory({
        toolId: 'ocr-extract',
        toolName: 'Local OCR',
        category: 'ocr',
        inputFilename: activeFile.name,
        outputFilename: replaceFileExtension(activeFile.name, 'txt'),
        inputSize: activeFile.size,
        outputSize: new Blob([res.fullText]).size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'OCR processing failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadSearchablePdf = async () => {
    if (ocrPages.length === 0) return;
    setIsProcessing(true);
    const t0 = performance.now();
    try {
      const pdfBlob = await createSearchablePdfFromOcr(ocrPages);
      const outName = replaceFileExtension(activeFile?.name || 'ocr_document', 'pdf').replace(
        '.pdf',
        '_searchable.pdf'
      );
      downloadBlob(pdfBlob, outName);
      recordHistory({
        toolId: 'ocr-searchable-pdf',
        toolName: 'Searchable PDF',
        category: 'ocr',
        inputFilename: activeFile?.name || 'scan',
        outputFilename: outName,
        inputSize: activeFile?.size || 0,
        outputSize: pdfBlob.size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not build Searchable PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadText = () => {
    const outName = replaceFileExtension(activeFile?.name || 'extracted', 'txt');
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, outName);
    recordHistory({
      toolId: 'ocr-extract',
      toolName: 'Export Extracted Text',
      category: 'ocr',
      inputFilename: activeFile?.name || 'document',
      outputFilename: outName,
      inputSize: activeFile?.size || 0,
      outputSize: blob.size,
      durationMs: 0,
      mode: 'local',
    });
  };

  const handleDownloadTsv = () => {
    const tsvContent = ocrPages
      .map((p) => p.tsv)
      .filter(Boolean)
      .join('\n');
    if (!tsvContent) {
      setErrorMsg('No TSV word-box output was generated for this scan.');
      return;
    }
    const outName = replaceFileExtension(activeFile?.name || 'ocr_output', 'tsv');
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8' });
    downloadBlob(blob, outName);
    recordHistory({
      toolId: 'ocr-extract',
      toolName: 'Export OCR TSV',
      category: 'ocr',
      inputFilename: activeFile?.name || 'document',
      outputFilename: outName,
      inputSize: activeFile?.size || 0,
      outputSize: blob.size,
      durationMs: 0,
      mode: 'local',
    });
  };

  const handleRunCloudAssist = async () => {
    if (!cloudConsent) {
      setErrorMsg('Please confirm explicit consent before sending document text to Gemini.');
      return;
    }
    if (!extractedText.trim()) {
      setErrorMsg('Provide or extract document text first.');
      return;
    }
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const { result } = await requestCloudDocumentAssist({
        task: assistTask,
        text: extractedText,
        targetLanguage: targetLang,
        consentGranted: true,
      });
      setAssistOutput(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Cloud assist error');
    } finally {
      setIsProcessing(false);
    }
  };

  const diffChunks = computeDocumentDiff(diffA, diffB);

  const settingsPanel = (
    <div className="space-y-4">
      {activeTab === 'ocr' && (
        <div className="space-y-3.5">
          <h3 className="text-sm font-bold text-[#17191D]">Tesseract.js Local OCR</h3>
          <div>
            <label className="text-xs font-medium block mb-1">Recognition Language</label>
            <select
              value={ocrLang}
              onChange={(e) => setOcrLang(e.target.value)}
              className="w-full h-9 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
            >
              <option value="eng">English (eng)</option>
              <option value="spa">Spanish (spa)</option>
              <option value="fra">French (fra)</option>
              <option value="deu">German (deu)</option>
              <option value="ita">Italian (ita)</option>
              <option value="por">Portuguese (por)</option>
            </select>
          </div>

          <button
            type="button"
            disabled={!activeFile || isProcessing}
            onClick={handleRunOcr}
            className="w-full h-9 bg-[#E5322D] hover:bg-[#DC2626] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Scanning…' : 'Run Local OCR'}
          </button>

          {ocrPages.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#E2E5EC]">
              <div className="text-xs font-mono text-[#0D9488] tabular-nums">
                Mean Confidence: {avgConf}% ({ocrPages.length} page{ocrPages.length > 1 ? 's' : ''})
              </div>
              <button
                type="button"
                onClick={handleDownloadSearchablePdf}
                className="w-full h-9 bg-[#17191D] hover:bg-[#272A30] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Export Searchable PDF
              </button>
              <button
                type="button"
                onClick={handleDownloadTsv}
                className="w-full h-9 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] text-[#17191D] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Export OCR Word Boxes (TSV)
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'compare' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Document Diff</h3>
          <p className="text-xs text-[#717782]">
            Compares Original Text (A) against Revised Text (B) locally line-by-line.
          </p>
        </div>
      )}

      {activeTab === 'assist' && (
        <div className="space-y-3.5">
          <h3 className="text-sm font-bold text-[#17191D]">Optional Cloud Assist</h3>
          <StudioNotice variant="warning" className="text-[11px]">
            <div className="font-semibold mb-0.5">External Processing</div>
            <p>
              Summarization and translation send your extracted text to Gemini on our server only when you check consent below.
            </p>
          </StudioNotice>

          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={cloudConsent}
              onChange={(e) => setCloudConsent(e.target.checked)}
              className="mt-0.5 accent-[#1D4ED8] cursor-pointer"
            />
            <span>I consent to send the document text in the editor to Gemini.</span>
          </label>

          <select
            value={assistTask}
            onChange={(e) =>
              setAssistTask(e.target.value as 'summarize' | 'translate' | 'extract-key-points')
            }
            className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
          >
            <option value="summarize">Summarize Document</option>
            <option value="extract-key-points">Extract Key Points</option>
            <option value="translate">Translate Document</option>
          </select>

          {assistTask === 'translate' && (
            <input
              type="text"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              placeholder="Target language…"
              className="w-full h-8 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
            />
          )}

          <button
            type="button"
            disabled={!cloudConsent || isProcessing || !extractedText.trim()}
            onClick={handleRunCloudAssist}
            className="w-full h-9 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing…' : 'Run Cloud Assist'}
          </button>
        </div>
      )}

      <div className="pt-3 border-t border-[#E2E5EC]">
        <button
          type="button"
          onClick={() => filePickerRef.current?.click()}
          className="w-full h-9 text-xs font-medium bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg transition-colors cursor-pointer"
        >
          Load Image / PDF / Doc…
        </button>
      </div>
    </div>
  );

  return (
    <StudioShell
      filename={activeFile ? replaceFileExtension(activeFile.name, 'txt') : 'ocr_output.txt'}
      isProcessing={isProcessing}
      onExport={handleDownloadText}
      exportLabel="Export TXT"
      exportDisabled={!extractedText.trim()}
      railTabs={OCR_RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={setActiveTab}
      settingsPanel={settingsPanel}
      bottomMetaLeft={
        activeFile ? `${activeFile.name} · ${formatBytes(activeFile.size)}` : 'No document loaded'
      }
      bottomMetaRight="Tesseract.js WASM + Optional Gemini"
    >
      <input
        ref={filePickerRef}
        type="file"
        accept="image/*,.pdf,.txt,.md,.docx"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(Array.from(e.target.files), true);
        }}
      />

      <div className="p-4 sm:p-6 space-y-4">
        {errorMsg && <StudioNotice variant="error">{errorMsg}</StudioNotice>}

        {isProcessing && activeTab === 'ocr' && (
          <div className="bg-white border border-[#E2E5EC] rounded-lg p-3 space-y-1.5">
            <div className="flex justify-between text-xs font-mono tabular-nums">
              <span>{ocrStatus || 'Initializing Tesseract…'}</span>
              <span>{ocrProgress}%</span>
            </div>
            <div className="h-1.5 bg-[#F6F7F9] rounded-full overflow-hidden">
              <div className="h-full bg-[#E5322D] transition-all" style={{ width: `${ocrProgress}%` }} />
            </div>
          </div>
        )}

        {activeTab === 'ocr' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#717782]">
                  Source Input
                </h2>
                <button
                  type="button"
                  onClick={() => filePickerRef.current?.click()}
                  className="text-xs text-[#1D4ED8] hover:underline font-medium cursor-pointer"
                >
                  Choose File
                </button>
              </div>
              {!activeFile ? (
                <div className="h-64 p-6 flex flex-col items-center justify-center text-center border border-dashed border-[#E2E5EC] rounded-lg space-y-3 bg-[#F6F7F9]/40">
                  <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] border border-[#E5322D]/20 text-[#E5322D] flex items-center justify-center">
                    <ScanText className="w-5 h-5" />
                  </div>
                  <p className="text-xs text-[#717782] max-w-xs">
                    Upload an image or scanned PDF to extract text locally via Tesseract.js.
                  </p>
                  <button
                    type="button"
                    onClick={() => filePickerRef.current?.click()}
                    className="h-9 px-4 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Select Image or PDF</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="text-xs font-mono text-[#17191D] truncate">{activeFile.name}</div>
                  {activeFile.type.startsWith('image/') && (
                    <img
                      src={files[0].objectUrl}
                      alt="OCR Source"
                      className="max-h-72 w-auto rounded border border-[#E2E5EC] object-contain"
                    />
                  )}
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleRunOcr}
                    className="h-9 px-4 bg-[#E5322D] hover:bg-[#DC2626] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Run Local OCR
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#717782]">
                  Extracted Text
                </h2>
                <button
                  type="button"
                  disabled={!extractedText}
                  onClick={() => copyText(extractedText, 'ocr')}
                  className="text-xs text-[#717782] hover:text-[#17191D] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  {copiedKey === 'ocr' ? (
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
              <textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                rows={14}
                placeholder="Extracted OCR text will appear here…"
                className="w-full p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono leading-relaxed focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
            </div>
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-2">
                <label className="text-xs font-semibold text-[#17191D] block">Document A (Original)</label>
                <textarea
                  value={diffA}
                  onChange={(e) => setDiffA(e.target.value)}
                  rows={8}
                  className="w-full p-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
              </div>
              <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-2">
                <label className="text-xs font-semibold text-[#17191D] block">Document B (Revised)</label>
                <textarea
                  value={diffB}
                  onChange={(e) => setDiffB(e.target.value)}
                  rows={8}
                  className="w-full p-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
              </div>
            </div>

            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#717782] flex items-center gap-1.5">
                <GitCompareArrows className="w-3.5 h-3.5" />
                <span>Line Diff Output</span>
              </h3>
              <div className="bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg p-3 font-mono text-xs space-y-0.5 overflow-x-auto">
                {diffChunks.map((part, idx) => (
                  <pre
                    key={idx}
                    className={`whitespace-pre-wrap px-2 py-0.5 rounded ${
                      part.added
                        ? 'bg-[#DCFCE7] text-[#166534]'
                        : part.removed
                        ? 'bg-[#FEE2E2] text-[#991B1B]'
                        : 'text-[#17191D]'
                    }`}
                  >
                    {part.added ? '+ ' : part.removed ? '- ' : '  '}
                    {part.value}
                  </pre>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'assist' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#17191D] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Document Text Input
                </span>
                <button
                  type="button"
                  onClick={() => filePickerRef.current?.click()}
                  className="text-xs text-[#1D4ED8] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3 h-3" /> Load File
                </button>
              </div>
              <textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                rows={14}
                placeholder="Paste or load document text…"
                className="w-full p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
            </div>

            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#17191D]">Assistant Output</span>
                {assistOutput && (
                  <button
                    type="button"
                    onClick={() => copyText(assistOutput, 'assist')}
                    className="text-xs text-[#717782] hover:text-[#17191D] inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'assist' ? (
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
                )}
              </div>
              <div className="min-h-[300px] p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs whitespace-pre-wrap leading-relaxed text-[#17191D]">
                {assistOutput ||
                  'Grant explicit consent in the settings panel and click Run Cloud Assist to summarize, extract key points, or translate.'}
              </div>
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
};
