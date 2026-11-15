import React, { useEffect, useRef, useState } from 'react';
import { Download, FolderArchive, Plus, Trash2 } from 'lucide-react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioEmptyCard, StudioNotice } from '../StudioFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  cleanSpreadsheetRows,
  createZipFromFiles,
  exportSpreadsheet,
  htmlToSimpleMarkdown,
  inspectZipFile,
  parseRtfText,
  parseSpreadsheetFile,
  readDocxFile,
  type SpreadsheetData,
  type ZipEntryInfo,
} from '../../engines/officeEngine';
import { downloadBlob, formatBytes, replaceFileExtension } from '../../utils/formatters';
import { escapeHtml, sanitizeArchivePath, sanitizeDownloadFilename, sanitizeHtmlMarkup } from '../../utils/sanitize';
import JSZip from 'jszip';

const OFFICE_RAIL_TABS: StudioRailTab[] = [
  { id: 'sheet', label: 'Sheets', icon: 'Table2' },
  { id: 'docx', label: 'Docs', icon: 'FileText' },
  { id: 'zip', label: 'ZIP', icon: 'FolderArchive' },
];

export const OfficeStudio: React.FC = () => {
  const { selectedTool, files, addFiles, removeFile, clearFiles, recordHistory } = useWorkspace();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const activeFile = files[0]?.file || null;

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (selectedTool?.id === 'office-docx-reader') return 'docx';
    if (selectedTool?.id === 'office-zip') return 'zip';
    return 'sheet';
  });

  // Spreadsheet state
  const [sheetData, setSheetData] = useState<SpreadsheetData | null>(null);
  const [activeSheetName, setActiveSheetName] = useState('');
  const [cleanOpts, setCleanOpts] = useState({
    trimWhitespace: true,
    removeEmptyRows: true,
    deduplicateRows: false,
  });
  const [sheetExportFormat, setSheetExportFormat] = useState<'csv' | 'xlsx' | 'json'>('csv');

  // DOCX / Text state
  const [docHtml, setDocHtml] = useState('');
  const [docText, setDocText] = useState('');
  const [docExportFmt, setDocExportFmt] = useState<'html' | 'md' | 'txt'>('md');

  // ZIP state
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [zipEntries, setZipEntries] = useState<ZipEntryInfo[]>([]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (selectedTool?.id === 'office-docx-reader') setActiveTab('docx');
    else if (selectedTool?.id === 'office-zip') setActiveTab('zip');
    else if (selectedTool?.id === 'office-spreadsheet') setActiveTab('sheet');
  }, [selectedTool?.id]);

  useEffect(() => {
    if (!activeFile) {
      setSheetData(null);
      setActiveSheetName('');
      setDocHtml('');
      setDocText('');
      setZipInstance(null);
      setZipEntries([]);
      return;
    }
    const ext = activeFile.name.split('.').pop()?.toLowerCase() || '';
    if (activeFile.size === 0) {
      setErrorMsg(`"${activeFile.name}" is empty (0 B). Please upload a valid non-empty file.`);
      return;
    }
    setErrorMsg(null);
    let cancelled = false;

    if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
      setActiveTab('sheet');
      setDocHtml('');
      setDocText('');
      setZipInstance(null);
      setZipEntries([]);
      (async () => {
        try {
          setIsProcessing(true);
          const data = await parseSpreadsheetFile(activeFile);
          if (cancelled) return;
          setSheetData(data);
          setActiveSheetName(data.sheetNames[0] || '');
        } catch (err) {
          if (!cancelled) {
            setSheetData(null);
            setErrorMsg(err instanceof Error ? err.message : 'Failed to read spreadsheet');
          }
        } finally {
          if (!cancelled) setIsProcessing(false);
        }
      })();
    } else if (['docx', 'txt', 'md', 'html', 'rtf'].includes(ext)) {
      setActiveTab('docx');
      setSheetData(null);
      setZipInstance(null);
      setZipEntries([]);
      (async () => {
        try {
          setIsProcessing(true);
          if (ext === 'docx') {
            const res = await readDocxFile(activeFile);
            if (cancelled) return;
            setDocHtml(sanitizeHtmlMarkup(res.html));
            setDocText(res.plainText);
          } else if (ext === 'rtf') {
            const rawRtf = await activeFile.text();
            if (cancelled) return;
            const parsed = parseRtfText(rawRtf);
            setDocText(parsed);
            setDocHtml(`<pre class="whitespace-pre-wrap text-sm">${escapeHtml(parsed)}</pre>`);
          } else {
            const txt = await activeFile.text();
            if (cancelled) return;
            setDocText(txt);
            setDocHtml(`<pre class="whitespace-pre-wrap text-sm">${escapeHtml(txt)}</pre>`);
          }
        } catch (err) {
          if (!cancelled) {
            setDocText('');
            setDocHtml('');
            setErrorMsg(err instanceof Error ? err.message : 'Failed to read document');
          }
        } finally {
          if (!cancelled) setIsProcessing(false);
        }
      })();
    } else if (ext === 'zip') {
      setActiveTab('zip');
      setSheetData(null);
      setDocHtml('');
      setDocText('');
      (async () => {
        try {
          setIsProcessing(true);
          const res = await inspectZipFile(activeFile);
          if (cancelled) return;
          setZipInstance(res.zip);
          setZipEntries(res.entries);
        } catch (err) {
          if (!cancelled) {
            setZipInstance(null);
            setZipEntries([]);
            setErrorMsg(err instanceof Error ? err.message : 'Failed to inspect ZIP archive');
          }
        } finally {
          if (!cancelled) setIsProcessing(false);
        }
      })();
    } else {
      setZipInstance(null);
      setZipEntries([]);
    }

    return () => {
      cancelled = true;
    };
  }, [activeFile]);

  const rawRows = sheetData && activeSheetName ? sheetData.sheets[activeSheetName] || [] : [];
  const cleanedRows = cleanSpreadsheetRows(rawRows, cleanOpts);

  const handleExport = async () => {
    const t0 = performance.now();
    try {
      setIsProcessing(true);
      if (activeTab === 'sheet' && sheetData) {
        const blob = exportSpreadsheet(cleanedRows, activeSheetName, sheetExportFormat);
        const outName = replaceFileExtension(activeFile?.name || 'sheet', sheetExportFormat);
        downloadBlob(blob, outName);
        recordHistory({
          toolId: 'office-spreadsheet',
          toolName: 'Spreadsheet Studio',
          category: 'office',
          inputFilename: activeFile?.name || 'sheet',
          outputFilename: outName,
          inputSize: activeFile?.size || 0,
          outputSize: blob.size,
          durationMs: performance.now() - t0,
          mode: 'local',
        });
      } else if (activeTab === 'docx' && docText) {
        const content =
          docExportFmt === 'html'
            ? sanitizeHtmlMarkup(docHtml)
            : docExportFmt === 'md'
            ? htmlToSimpleMarkdown(sanitizeHtmlMarkup(docHtml)) || docText
            : docText;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const outName = replaceFileExtension(activeFile?.name || 'document', docExportFmt);
        downloadBlob(blob, outName);
        recordHistory({
          toolId: 'office-docx-reader',
          toolName: 'DOCX Studio',
          category: 'office',
          inputFilename: activeFile?.name || 'document',
          outputFilename: outName,
          inputSize: activeFile?.size || 0,
          outputSize: blob.size,
          durationMs: performance.now() - t0,
          mode: 'local',
        });
      } else if (activeTab === 'zip' && (zipInstance || files.length > 0)) {
        let blob: Blob;
        let outName = 'archive_bundle.zip';
        if (zipInstance) {
          const buf = await zipInstance.generateAsync({ type: 'arraybuffer' });
          const repacked = await JSZip.loadAsync(buf);
          const extraFiles = files.filter((f) => f.file !== activeFile);
          for (const item of extraFiles) {
            repacked.file(sanitizeArchivePath(item.name), item.file);
          }
          blob = await repacked.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 },
          });
          outName = replaceFileExtension(activeFile?.name || 'archive', 'zip').replace(
            '.zip',
            '_repacked.zip'
          );
        } else {
          blob = await createZipFromFiles(files.map((f) => ({ name: f.name, data: f.file })));
        }
        downloadBlob(blob, outName);
        recordHistory({
          toolId: 'office-zip',
          toolName: 'ZIP Archive',
          category: 'office',
          inputFilename: zipInstance ? activeFile?.name || 'archive.zip' : `${files.length} file(s)`,
          outputFilename: outName,
          inputSize: files.reduce((s, f) => s + f.size, 0),
          outputSize: blob.size,
          durationMs: performance.now() - t0,
          mode: 'local',
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const settingsPanel = (
    <div className="space-y-4">
      {activeTab === 'sheet' && (
        <div className="space-y-3.5">
          <h3 className="text-sm font-bold text-[#17191D]">Spreadsheet Cleanup</h3>
          {sheetData && sheetData.sheetNames.length > 1 && (
            <div>
              <label className="text-xs font-medium block mb-1">Active Sheet</label>
              <select
                value={activeSheetName}
                onChange={(e) => setActiveSheetName(e.target.value)}
                className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              >
                {sheetData.sheetNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOpts.trimWhitespace}
                onChange={(e) =>
                  setCleanOpts((o) => ({ ...o, trimWhitespace: e.target.checked }))
                }
                className="accent-[#1D4ED8]"
              />
              <span>Trim extra cell whitespace</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOpts.removeEmptyRows}
                onChange={(e) =>
                  setCleanOpts((o) => ({ ...o, removeEmptyRows: e.target.checked }))
                }
                className="accent-[#1D4ED8]"
              />
              <span>Remove empty rows</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOpts.deduplicateRows}
                onChange={(e) =>
                  setCleanOpts((o) => ({ ...o, deduplicateRows: e.target.checked }))
                }
                className="accent-[#1D4ED8]"
              />
              <span>Deduplicate identical rows</span>
            </label>
          </div>

          <div className="pt-2 border-t border-[#E2E5EC]">
            <label className="text-xs font-semibold block mb-1.5">Export Format</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['csv', 'xlsx', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setSheetExportFormat(fmt)}
                  className={`py-1.5 text-xs font-mono uppercase rounded border cursor-pointer ${
                    sheetExportFormat === fmt
                      ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
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

      {activeTab === 'docx' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">DOCX & Text Reader</h3>
          <p className="text-xs text-[#717782]">
            Extracts structured headings, lists, and paragraphs from DOCX via Mammoth.js.
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {(['md', 'html', 'txt'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setDocExportFmt(fmt)}
                className={`py-1.5 text-xs font-mono uppercase rounded border cursor-pointer ${
                  docExportFmt === fmt
                    ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                    : 'bg-[#F6F7F9] border-[#E2E5EC]'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'zip' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">ZIP Archive Lab</h3>
          <p className="text-xs text-[#717782]">
            Inspect entries inside an existing ZIP or add any files to package a new archive.
          </p>
          <button
            type="button"
            onClick={() => filePickerRef.current?.click()}
            className="w-full h-9 px-3 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Files to Pack</span>
          </button>
        </div>
      )}

      <div className="pt-3 border-t border-[#E2E5EC]">
        <button
          type="button"
          onClick={() => filePickerRef.current?.click()}
          className="w-full h-9 text-xs font-medium bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg transition-colors cursor-pointer"
        >
          Open Another File…
        </button>
      </div>
    </div>
  );

  return (
    <StudioShell
      filename={activeFile?.name || 'office_workspace'}
      isProcessing={isProcessing}
      onExport={handleExport}
      exportLabel={
        activeTab === 'zip'
          ? zipInstance
            ? 'Repack Archive & Download ZIP'
            : 'Create & Download ZIP'
          : activeTab === 'sheet'
          ? `Export ${sheetExportFormat.toUpperCase()}`
          : `Export ${docExportFmt.toUpperCase()}`
      }
      exportDisabled={
        activeTab === 'sheet'
          ? !sheetData
          : activeTab === 'docx'
          ? !docText
          : !zipInstance && files.length === 0
      }
      railTabs={OFFICE_RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={setActiveTab}
      settingsPanel={settingsPanel}
      bottomMetaLeft={
        activeTab === 'sheet' && sheetData
          ? `${cleanedRows.length} rows (from ${rawRows.length})`
          : activeTab === 'zip'
          ? `${zipEntries.length} ZIP entries`
          : activeFile?.name || 'No file loaded'
      }
      bottomMetaRight="SheetJS · Mammoth.js · JSZip"
    >
      <input
        ref={filePickerRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            addFiles(Array.from(e.target.files), activeTab !== 'zip');
          }
        }}
      />

      <div className="p-4 sm:p-6 space-y-4">
        {errorMsg && <StudioNotice variant="error">{errorMsg}</StudioNotice>}

        {activeTab === 'sheet' && !sheetData && (
          <div className="py-8 flex items-center justify-center">
            <StudioEmptyCard
              category="office"
              iconName="Table2"
              title="Open XLSX or CSV File"
              description="Preview sheets, remove empty or duplicate rows, and export clean CSV, XLSX, or JSON."
              primaryLabel="Select Spreadsheet"
              onPrimaryClick={() => filePickerRef.current?.click()}
              footnote="Parsed locally via SheetJS · Zero cloud upload"
            />
          </div>
        )}

        {activeTab === 'sheet' && sheetData && (
          <div className="bg-white border border-[#E2E5EC] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#E2E5EC] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#17191D] tabular-nums">
                Sheet: {activeSheetName} ({cleanedRows.length} rows)
              </span>
              <span className="font-mono text-[#717782] tabular-nums">Showing up to 200 rows</span>
            </div>
            <div className="overflow-auto max-h-[560px]">
              <table className="w-full text-xs text-left border-collapse tabular-nums">
                <tbody>
                  {cleanedRows.slice(0, 200).map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={
                        rIdx === 0
                          ? 'bg-[#F6F7F9] font-semibold text-[#17191D] sticky top-0'
                          : 'border-t border-[#F1F3F6] hover:bg-[#F6F7F9]/60'
                      }
                    >
                      <td className="px-2.5 py-2 font-mono text-[11px] text-[#717782] border-r border-[#F1F3F6] w-10">
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 whitespace-nowrap max-w-[260px] truncate">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'docx' && !docText && (
          <div className="py-8 flex items-center justify-center">
            <StudioEmptyCard
              category="office"
              iconName="FileText"
              title="Open DOCX, Markdown, or Text"
              description="Extract structured headings, lists, and clean plain text via Mammoth.js and export MD, HTML, or TXT."
              primaryLabel="Select Document"
              onPrimaryClick={() => filePickerRef.current?.click()}
              footnote="Processed locally in browser memory"
            />
          </div>
        )}

        {activeTab === 'docx' && docText && (
          <div className="bg-white border border-[#E2E5EC] rounded-xl p-6 max-w-4xl mx-auto">
            <div
              className="prose prose-sm max-w-none text-[#17191D] leading-relaxed space-y-2"
              dangerouslySetInnerHTML={{ __html: docHtml }}
            />
          </div>
        )}

        {activeTab === 'zip' && (
          <div className="bg-white border border-[#E2E5EC] rounded-xl p-5 max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FolderArchive className="w-4 h-4 text-[#1D4ED8]" />
                <h2 className="text-sm font-bold text-[#17191D]">
                  {zipInstance ? `Archive Contents (${zipEntries.length})` : `Files Queued to Zip (${files.length})`}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {(files.length > 0 || zipInstance) && (
                  <button
                    type="button"
                    onClick={() => {
                      clearFiles();
                      setZipInstance(null);
                      setZipEntries([]);
                    }}
                    className="h-8 px-3 bg-white hover:bg-[#FEF2F2] text-[#E5322D] border border-[#E2E5EC] rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    Clear Queue
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => filePickerRef.current?.click()}
                  className="h-8 px-3 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  Add Files
                </button>
              </div>
            </div>

            {zipInstance ? (
              <div className="space-y-3">
                <div className="divide-y divide-[#F1F3F6] border border-[#E2E5EC] rounded-lg">
                  {zipEntries.map((entry) => (
                    <div
                      key={entry.path}
                      className="px-3 py-2 flex items-center justify-between text-xs gap-3"
                    >
                      <span className="font-mono truncate">{entry.path}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-[#717782] tabular-nums">
                          {entry.dir ? 'Folder' : formatBytes(entry.uncompressedSize)}
                        </span>
                        {!entry.dir && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const f = zipInstance.file(entry.rawPath || entry.path);
                                if (!f) return;
                                const blob = await f.async('blob');
                                downloadBlob(blob, sanitizeDownloadFilename(entry.path.split('/').pop() || 'extracted'));
                              } catch (err) {
                                setErrorMsg(err instanceof Error ? err.message : 'Failed to extract ZIP entry.');
                              }
                            }}
                            className="text-[#1D4ED8] hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3 h-3" /> Extract
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {files.filter((f) => f.file !== activeFile).length > 0 && (
                  <div className="divide-y divide-[#F1F3F6] border border-[#E2E5EC] rounded-lg">
                    <div className="px-3 py-2 bg-[#F6F7F9] text-[11px] font-mono text-[#717782]">
                      Additional files staged for repack
                    </div>
                    {files
                      .filter((f) => f.file !== activeFile)
                      .map((f) => (
                        <div key={f.id} className="px-3 py-2 flex items-center justify-between text-xs gap-3">
                          <span className="font-mono truncate">{f.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[#717782] tabular-nums">{formatBytes(f.size)}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${f.name}`}
                              onClick={() => removeFile(f.id)}
                              className="text-[#717782] hover:text-[#E5322D] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[#F1F3F6] border border-[#E2E5EC] rounded-lg">
                {files.length === 0 ? (
                  <p className="p-6 text-center text-xs text-[#717782]">
                    Open a `.zip` file to extract its contents, or add multiple files to compress into a new ZIP.
                  </p>
                ) : (
                  files.map((f) => (
                    <div key={f.id} className="px-3 py-2 flex items-center justify-between text-xs gap-3">
                      <span className="font-mono truncate">{f.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[#717782] tabular-nums">{formatBytes(f.size)}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => removeFile(f.id)}
                          className="text-[#717782] hover:text-[#E5322D] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </StudioShell>
  );
};
