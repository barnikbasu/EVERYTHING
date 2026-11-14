import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioNotice } from '../StudioFeedback';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  computeHashes,
  computeTextDiff,
  decodeBase64Utf8,
  decodeJwt,
  encodeBase64Utf8,
  evaluateRegex,
  formatCss,
  formatJs,
  formatJson,
  formatXmlOrHtml,
  generateUuidBatch,
  optimizeSvgMarkup,
  renderSafeMarkdownHtml,
} from '../../engines/devToolsEngine';
import { downloadBlob, formatBytes, replaceFileExtension } from '../../utils/formatters';

const DEV_RAIL_TABS: StudioRailTab[] = [
  { id: 'format', label: 'Format', icon: 'Braces' },
  { id: 'encode', label: 'Base64', icon: 'Binary' },
  { id: 'jwt', label: 'JWT/Hash', icon: 'KeyRound' },
  { id: 'regex', label: 'Regex', icon: 'Code2' },
  { id: 'markdown', label: 'MD/Diff', icon: 'FileText' },
  { id: 'svg', label: 'SVG', icon: 'Palette' },
];

export const DeveloperStudio: React.FC = () => {
  const { selectedTool, files, recordHistory } = useWorkspace();
  const { copiedKey, copyText } = useCopyFeedback();
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (selectedTool?.id === 'dev-encoding-crypto') return 'encode';
    if (selectedTool?.id === 'dev-regex-diff-svg') return 'regex';
    return 'format';
  });

  // Formatters state
  const [fmtMode, setFmtMode] = useState<'json' | 'xml' | 'html' | 'css' | 'js'>('json');
  const [fmtInput, setFmtInput] = useState('{"workspace":"EVERYTHING","local":true,"tools":["pdf","image","audio"]}');
  const [fmtOutput, setFmtOutput] = useState('');
  const [fmtError, setFmtError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filename, setFilename] = useState('formatted.json');

  // Base64 & URL state
  const [b64Mode, setB64Mode] = useState<'b64-encode' | 'b64-decode' | 'url-encode' | 'url-decode'>('b64-decode');
  const [b64Input, setB64Input] = useState('SGVsbG8gRVZFUllUSElORyE=');
  const [b64Output, setB64Output] = useState('');
  const [dataUriPreview, setDataUriPreview] = useState<string | null>(null);
  const [b64Error, setB64Error] = useState<string | null>(null);

  // JWT, UUID, Hashes
  const [jwtInput, setJwtInput] = useState(
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkVWRVJZVGhJTkciLCJpYXQiOjE3MDAwMDAwMDB9.signature'
  );
  const [uuids, setUuids] = useState<string[]>(() => generateUuidBatch(5));
  const [hashInput, setHashInput] = useState('everything-local-hash');
  const [hashes, setHashes] = useState({ sha1: '', sha256: '', sha384: '', sha512: '' });

  // Regex
  const [regexPattern, setRegexPattern] = useState('\\b[A-Z]{2,}\\b');
  const [regexFlags, setRegexFlags] = useState('g');
  const [regexSample, setRegexSample] = useState('EVERYTHING supports PDF, PNG, WAV, and JSON locally.');

  // Markdown & Diff
  const [mdInput, setMdInput] = useState('# EVERYTHING Workspace\n\n- Local **Canvas** & **PDF.js**\n- `Zero silent uploads`');
  const [diffA, setDiffA] = useState('alpha\nbeta\ngamma');
  const [diffB, setDiffB] = useState('alpha\nbeta-updated\ngamma\ndelta');

  // SVG Optimizer
  const [svgInput, setSvgInput] = useState(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><!-- sample --><circle cx="60" cy="60" r="46" fill="#1D4ED8" /></svg>'
  );

  useEffect(() => {
    if (selectedTool?.id === 'dev-encoding-crypto') setActiveTab('encode');
    else if (selectedTool?.id === 'dev-regex-diff-svg') setActiveTab('regex');
    else if (selectedTool?.id === 'dev-formatters') setActiveTab('format');
  }, [selectedTool?.id]);

  useEffect(() => {
    if (activeTab === 'format') {
      setFilename(files[0]?.name ? replaceFileExtension(files[0].name, fmtMode) : `formatted.${fmtMode}`);
    } else if (activeTab === 'svg') {
      setFilename('optimized.svg');
    } else if (activeTab === 'markdown') {
      setFilename('rendered.html');
    } else {
      setFilename(`devtools_${activeTab}.txt`);
    }
  }, [activeTab, fmtMode, files]);

  // If user dropped a file into Developer Studio, load text into active tab
  useEffect(() => {
    const f = files[0]?.file;
    if (!f) return;
    setFileError(null);
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    f.text()
      .then((txt) => {
        if (ext === 'svg') {
          setActiveTab('svg');
          setSvgInput(txt);
        } else if (ext === 'md') {
          setActiveTab('markdown');
          setMdInput(txt);
        } else if (['js', 'mjs', 'cjs', 'ts'].includes(ext)) {
          setActiveTab('format');
          setFmtMode('js');
          setFmtInput(txt);
        } else if (['json', 'xml', 'html', 'css'].includes(ext)) {
          setActiveTab('format');
          setFmtMode(ext as 'json' | 'xml' | 'html' | 'css');
          setFmtInput(txt);
        } else if (ext === 'txt') {
          setActiveTab('encode');
          setB64Input(txt);
        }
      })
      .catch((err) => {
        setFileError(err instanceof Error ? err.message : 'Unable to read dropped file as text.');
      });
  }, [files]);

  // Run formatter automatically
  const runFormat = (minify = false) => {
    setFmtError(null);
    if (fmtMode === 'json') {
      const res = formatJson(fmtInput, minify);
      setFmtOutput(res.output);
      setFmtError(res.error);
    } else if (fmtMode === 'css') {
      setFmtOutput(formatCss(fmtInput, minify));
    } else if (fmtMode === 'js') {
      setFmtOutput(formatJs(fmtInput, minify));
    } else {
      setFmtOutput(formatXmlOrHtml(fmtInput, fmtMode, minify));
    }
  };

  useEffect(() => {
    runFormat(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmtInput, fmtMode]);

  // Base64 / URL live evaluate
  useEffect(() => {
    setB64Error(null);
    setDataUriPreview(null);
    if (b64Mode === 'b64-encode') {
      setB64Output(encodeBase64Utf8(b64Input));
    } else if (b64Mode === 'b64-decode') {
      const res = decodeBase64Utf8(b64Input);
      setB64Error(res.error);
      if (res.dataUriMime?.startsWith('image/')) {
        setDataUriPreview(b64Input.trim());
        setB64Output(`[Binary ${res.dataUriMime} image preview rendered below]`);
      } else {
        setB64Output(res.text);
      }
    } else if (b64Mode === 'url-encode') {
      setB64Output(encodeURIComponent(b64Input));
    } else {
      try {
        setB64Output(decodeURIComponent(b64Input));
      } catch {
        setB64Error('Malformed URL-encoded sequence.');
      }
    }
  }, [b64Input, b64Mode]);

  // Hashes live evaluate
  useEffect(() => {
    computeHashes(hashInput).then(setHashes).catch(() => {});
  }, [hashInput]);

  const jwtResult = useMemo(() => decodeJwt(jwtInput), [jwtInput]);
  const regexResult = useMemo(
    () => evaluateRegex(regexPattern, regexFlags, regexSample),
    [regexPattern, regexFlags, regexSample]
  );
  const svgResult = useMemo(() => optimizeSvgMarkup(svgInput), [svgInput]);
  const diffChunks = useMemo(() => computeTextDiff(diffA, diffB), [diffA, diffB]);
  const mdHtml = useMemo(() => renderSafeMarkdownHtml(mdInput), [mdInput]);

  const handleExport = () => {
    const t0 = performance.now();
    let content = '';
    let mime = 'text/plain;charset=utf-8';
    let toolId = selectedTool?.id || 'dev-formatters';
    let toolName = 'Developer Output';

    if (activeTab === 'format') {
      if (!fmtOutput) return;
      content = fmtOutput;
      toolId = 'dev-formatters';
      toolName = `${fmtMode.toUpperCase()} Formatter`;
      mime = fmtMode === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8';
    } else if (activeTab === 'encode') {
      content = b64Output;
      toolId = 'dev-encoding-crypto';
      toolName = 'Base64 / URL Transform';
    } else if (activeTab === 'jwt') {
      content = JSON.stringify({ jwt: jwtResult.data, hashes, uuids }, null, 2);
      mime = 'application/json;charset=utf-8';
      toolId = 'dev-encoding-crypto';
      toolName = 'JWT & Hashes Report';
    } else if (activeTab === 'regex') {
      content = JSON.stringify({ pattern: regexPattern, flags: regexFlags, matches: regexResult.matches }, null, 2);
      mime = 'application/json;charset=utf-8';
      toolId = 'dev-regex-diff-svg';
      toolName = 'Regex Matches';
    } else if (activeTab === 'markdown') {
      content = mdHtml;
      mime = 'text/html;charset=utf-8';
      toolId = 'dev-regex-diff-svg';
      toolName = 'Markdown HTML Export';
    } else if (activeTab === 'svg') {
      if (svgResult.error || !svgResult.optimized) return;
      content = svgResult.optimized;
      mime = 'image/svg+xml;charset=utf-8';
      toolId = 'dev-regex-diff-svg';
      toolName = 'SVG Optimizer';
    }

    const blob = new Blob([content], { type: mime });
    const outName = filename.trim() || `devtools_${activeTab}.txt`;
    downloadBlob(blob, outName);
    recordHistory({
      toolId,
      toolName,
      category: 'developer',
      inputFilename: files[0]?.name || activeTab,
      outputFilename: outName,
      inputSize: files[0]?.size || content.length,
      outputSize: blob.size,
      durationMs: performance.now() - t0,
      mode: 'local',
    });
  };

  return (
    <StudioShell
      filename={filename}
      onFilenameChange={setFilename}
      onExport={handleExport}
      exportLabel="Export Output"
      exportDisabled={
        (activeTab === 'format' && (!fmtOutput || Boolean(fmtError))) ||
        (activeTab === 'svg' && (Boolean(svgResult.error) || !svgResult.optimized))
      }
      railTabs={DEV_RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={setActiveTab}
      bottomMetaLeft="100% In-Browser Deterministic Tools"
      bottomMetaRight="Web Crypto API · AST / Parser"
    >
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
        {fileError && <StudioNotice variant="error">{fileError}</StudioNotice>}
        {activeTab === 'format' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#E2E5EC] rounded-xl p-3">
              <div className="flex items-center gap-1.5">
                {(['json', 'xml', 'html', 'css', 'js'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFmtMode(m)}
                    className={`px-3 py-1.5 text-xs font-mono uppercase rounded-md border cursor-pointer ${
                      fmtMode === m
                        ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                        : 'bg-[#F6F7F9] text-[#17191D] border-[#E2E5EC]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => runFormat(false)}
                  className="h-8 px-3 bg-[#17191D] hover:bg-[#272A30] text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
                >
                  Beautify
                </button>
                <button
                  type="button"
                  onClick={() => runFormat(true)}
                  className="h-8 px-3 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] text-xs font-medium rounded-md transition-colors cursor-pointer"
                >
                  Minify
                </button>
                <button
                  type="button"
                  disabled={!fmtOutput}
                  onClick={() => copyText(fmtOutput, 'fmt')}
                  className="h-8 px-3 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] text-xs font-medium rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                >
                  {copiedKey === 'fmt' ? (
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
            </div>

            {fmtError && <StudioNotice variant="error" className="font-mono">{fmtError}</StudioNotice>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-[#E2E5EC] rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-[#717782]">Input</div>
                <textarea
                  value={fmtInput}
                  onChange={(e) => setFmtInput(e.target.value)}
                  rows={16}
                  className="w-full p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
              </div>
              <div className="bg-white border border-[#E2E5EC] rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-[#717782]">Formatted Output</div>
                <textarea
                  readOnly
                  value={fmtOutput}
                  rows={16}
                  className="w-full p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'encode' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5 bg-white border border-[#E2E5EC] rounded-xl p-3">
              {(
                [
                  { id: 'b64-decode', label: 'Base64 / Data-URI Decode' },
                  { id: 'b64-encode', label: 'Base64 Encode' },
                  { id: 'url-encode', label: 'URL Encode' },
                  { id: 'url-decode', label: 'URL Decode' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setB64Mode(m.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer ${
                    b64Mode === m.id
                      ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                      : 'bg-[#F6F7F9] border-[#E2E5EC]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {b64Error && <StudioNotice variant="error">{b64Error}</StudioNotice>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <textarea
                value={b64Input}
                onChange={(e) => setB64Input(e.target.value)}
                rows={10}
                placeholder="Paste text or data:image/png;base64,…"
                className="w-full p-3 bg-white border border-[#E2E5EC] rounded-xl text-xs font-mono focus:outline-none focus:border-[#1D4ED8]"
              />
              <textarea
                readOnly
                value={b64Output}
                rows={10}
                className="w-full p-3 bg-white border border-[#E2E5EC] rounded-xl text-xs font-mono focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>

            {dataUriPreview && (
              <div className="bg-white border border-[#E2E5EC] rounded-xl p-4">
                <p className="text-xs font-semibold mb-2">Decoded Data-URI Image Preview</p>
                <img src={dataUriPreview} alt="Decoded data URI" className="max-h-60 rounded border border-[#E2E5EC]" />
              </div>
            )}
          </div>
        )}

        {activeTab === 'jwt' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* JWT Decoder */}
            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#17191D]">JWT Token Inspector</h3>
              <textarea
                value={jwtInput}
                onChange={(e) => setJwtInput(e.target.value)}
                rows={4}
                className="w-full p-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
              {jwtResult.error ? (
                <StudioNotice variant="error">{jwtResult.error}</StudioNotice>
              ) : (
                jwtResult.data && (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2.5 bg-[#F6F7F9] rounded border border-[#E2E5EC]">
                      <div className="text-[10px] text-[#717782] uppercase mb-1">Header</div>
                      <pre>{JSON.stringify(jwtResult.data.header, null, 2)}</pre>
                    </div>
                    <div className="p-2.5 bg-[#F6F7F9] rounded border border-[#E2E5EC]">
                      <div className="text-[10px] text-[#717782] uppercase mb-1">Payload</div>
                      <pre>{JSON.stringify(jwtResult.data.payload, null, 2)}</pre>
                    </div>
                    {jwtResult.data.expiresAt && (
                      <div className="text-[11px] text-[#717782]">
                        exp: {jwtResult.data.expiresAt} ({jwtResult.data.expired ? 'Expired' : 'Active'})
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            {/* UUID + Web Crypto Hashes */}
            <div className="space-y-4">
              <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#17191D]">UUID v4 Generator</h3>
                  <button
                    type="button"
                    onClick={() => setUuids(generateUuidBatch(5))}
                    className="h-7 px-2.5 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Regenerate
                  </button>
                </div>
                <div className="space-y-1 font-mono text-xs">
                  {uuids.map((u) => (
                    <div
                      key={u}
                      className="flex items-center justify-between px-2.5 py-1.5 bg-[#F6F7F9] rounded gap-2"
                    >
                      <span className="truncate">{u}</span>
                      <button
                        type="button"
                        onClick={() => copyText(u, u)}
                        className="text-[#717782] hover:text-[#17191D] shrink-0 cursor-pointer"
                        aria-label={`Copy UUID ${u}`}
                      >
                        {copiedKey === u ? (
                          <Check className="w-3 h-3 text-[#0D9488]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-[#17191D]">Web Crypto Hash Generator</h3>
                <input
                  type="text"
                  value={hashInput}
                  onChange={(e) => setHashInput(e.target.value)}
                  className="w-full h-9 px-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
                <div className="space-y-1.5 text-[11px] font-mono">
                  {(['sha256', 'sha1', 'sha384', 'sha512'] as const).map((alg) => (
                    <div key={alg} className="p-2 bg-[#F6F7F9] rounded break-all">
                      <span className="uppercase text-[#717782] mr-2">{alg}:</span>
                      <span>{hashes[alg]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'regex' && (
          <div className="bg-white border border-[#E2E5EC] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#17191D]">Live Regex Tester</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={regexPattern}
                onChange={(e) => setRegexPattern(e.target.value)}
                placeholder="Pattern…"
                className="flex-1 h-9 px-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
              <input
                type="text"
                value={regexFlags}
                onChange={(e) => setRegexFlags(e.target.value)}
                placeholder="Flags (gi)"
                className="w-20 h-9 px-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
            </div>
            {regexResult.error && (
              <StudioNotice variant="error" className="font-mono">{regexResult.error}</StudioNotice>
            )}
            <textarea
              value={regexSample}
              onChange={(e) => setRegexSample(e.target.value)}
              rows={5}
              className="w-full p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
            />
            <div className="text-xs font-mono text-[#717782] tabular-nums">
              Matches found: {regexResult.matches.length}
            </div>
            <div className="flex flex-wrap gap-2">
              {regexResult.matches.map((m, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-[#EFF6FF] border border-[#1D4ED8]/25 rounded text-xs font-mono text-[#1D4ED8]"
                >
                  @{m.index}: "{m.match}"
                </span>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'markdown' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-2">
                <div className="text-xs font-semibold text-[#717782]">Markdown Source</div>
                <textarea
                  value={mdInput}
                  onChange={(e) => setMdInput(e.target.value)}
                  rows={10}
                  className="w-full p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
              </div>
              <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-2">
                <div className="text-xs font-semibold text-[#717782]">Rendered Preview</div>
                <div
                  className="p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg min-h-[210px]"
                  dangerouslySetInnerHTML={{ __html: mdHtml }}
                />
              </div>
            </div>

            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#17191D]">Quick Text Diff</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <textarea
                  value={diffA}
                  onChange={(e) => setDiffA(e.target.value)}
                  rows={4}
                  className="p-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
                <textarea
                  value={diffB}
                  onChange={(e) => setDiffB(e.target.value)}
                  rows={4}
                  className="p-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
              </div>
              <div className="p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded font-mono text-xs space-y-0.5 overflow-x-auto">
                {diffChunks.map((c, idx) => (
                  <pre
                    key={idx}
                    className={`whitespace-pre-wrap break-words px-2 py-0.5 rounded ${
                      c.added ? 'bg-[#DCFCE7] text-[#166534]' : c.removed ? 'bg-[#FEE2E2] text-[#991B1B]' : ''
                    }`}
                  >
                    {c.added ? '+ ' : c.removed ? '- ' : '  '}
                    {c.value}
                  </pre>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'svg' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#17191D]">SVG Markup & Optimizer</h3>
              <textarea
                value={svgInput}
                onChange={(e) => setSvgInput(e.target.value)}
                rows={10}
                className="w-full p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
              {svgResult.error ? (
                <StudioNotice variant="error">{svgResult.error}</StudioNotice>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#717782] tabular-nums">
                  <span>
                    {formatBytes(svgResult.originalBytes)} → {formatBytes(svgResult.optimizedBytes)} ·{' '}
                    {svgResult.elementCount} shapes · viewBox {svgResult.viewBox}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const t0 = performance.now();
                      const blob = new Blob([svgResult.optimized], { type: 'image/svg+xml' });
                      downloadBlob(blob, 'optimized.svg');
                      recordHistory({
                        toolId: 'dev-regex-diff-svg',
                        toolName: 'SVG Optimizer',
                        category: 'developer',
                        inputFilename: files[0]?.name || 'vector.svg',
                        outputFilename: 'optimized.svg',
                        inputSize: svgResult.originalBytes,
                        outputSize: blob.size,
                        durationMs: performance.now() - t0,
                        mode: 'local',
                      });
                    }}
                    className="h-8 px-3 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white rounded text-xs font-sans font-semibold transition-colors cursor-pointer"
                  >
                    Download SVG
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 flex flex-col items-center justify-center">
              <p className="text-xs font-semibold text-[#717782] mb-3 self-start">Live SVG Render</p>
              {!svgResult.error && (
                <div
                  className="w-56 h-56 checkerboard-bg border border-[#E2E5EC] rounded-lg p-4 flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full"
                  dangerouslySetInnerHTML={{ __html: svgResult.optimized }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
};
