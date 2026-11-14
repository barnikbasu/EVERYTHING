import React, { useEffect, useRef, useState } from 'react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioEmptyCard, StudioNotice } from '../StudioFeedback';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  UNIT_OPTIONS,
  calculateDateDiff,
  calculateEmi,
  calculateGst,
  convertCase,
  convertUnits,
  decodeQrFromImageFile,
  getTextStats,
  type UnitCategory,
} from '../../engines/utilitiesEngine';
import { downloadBlob, replaceFileExtension } from '../../utils/formatters';

function getLocalDatetimeInputValue(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const UTIL_RAIL_TABS: StudioRailTab[] = [
  { id: 'finance', label: 'Math', icon: 'Calculator' },
  { id: 'units', label: 'Units', icon: 'SlidersHorizontal' },
  { id: 'time', label: 'Time', icon: 'Clock' },
  { id: 'text', label: 'Text', icon: 'FileText' },
  { id: 'qrscan', label: 'QR Read', icon: 'QrCode' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const UtilitiesStudio: React.FC = () => {
  const { selectedTool, files, recordHistory } = useWorkspace();
  const { copiedKey, copyText } = useCopyFeedback();
  const filePickerRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<string>(() =>
    selectedTool?.id === 'util-text-qr-reader' ? 'text' : 'finance'
  );
  const [filename, setFilename] = useState('utilities_finance.txt');

  // Percentage & GST & EMI
  const [pctVal, setPctVal] = useState(20);
  const [pctOf, setPctOf] = useState(450);
  const [gstAmount, setGstAmount] = useState(1000);
  const [gstRate, setGstRate] = useState(18);
  const [gstMode, setGstMode] = useState<'exclusive' | 'inclusive'>('exclusive');
  const [emiPrincipal, setEmiPrincipal] = useState(500000);
  const [emiRate, setEmiRate] = useState(8.5);
  const [emiMonths, setEmiMonths] = useState(60);

  // Unit Converter
  const [unitCat, setUnitCat] = useState<UnitCategory>('length');
  const [unitVal, setUnitVal] = useState(10);
  const [unitFrom, setUnitFrom] = useState('km');
  const [unitTo, setUnitTo] = useState('mi');

  // Date & Timezone
  const [dateA, setDateA] = useState('1995-06-15');
  const [dateB, setDateB] = useState(() => getLocalDatetimeInputValue().slice(0, 10));
  const [baseIso, setBaseIso] = useState(() => getLocalDatetimeInputValue());

  // Text stats & Case converter
  const [textInput, setTextInput] = useState('Everything You Need. One Unified Workspace.');

  // QR Reader
  const [qrDecoded, setQrDecoded] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTool?.id === 'util-text-qr-reader') setActiveTab('text');
  }, [selectedTool?.id]);

  useEffect(() => {
    setFilename(`utilities_${activeTab}.txt`);
  }, [activeTab]);

  const handleScanQrFile = async (f: File) => {
    setQrError(null);
    setQrDecoded(null);
    try {
      const res = await decodeQrFromImageFile(f);
      if (res.text) setQrDecoded(res.text);
      else setQrError('No QR code found in this image.');
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'Could not scan image.');
    }
  };

  useEffect(() => {
    const f = files[0]?.file;
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (f.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
      setActiveTab('qrscan');
      handleScanQrFile(f);
    } else if (f.type.startsWith('text/') || ['txt', 'md', 'log', 'csv'].includes(ext)) {
      f.text()
        .then((txt) => {
          setTextInput(txt);
          setActiveTab('text');
        })
        .catch(() => {});
    }
  }, [files]);

  const gstRes = calculateGst(gstAmount, gstRate, gstMode);
  const emiRes = calculateEmi(emiPrincipal, emiRate, emiMonths);
  const dateRes = calculateDateDiff(dateA, dateB);
  const unitResult = convertUnits(unitVal, unitCat, unitFrom, unitTo);
  const textStats = getTextStats(textInput);

  const handleExportReport = () => {
    const t0 = performance.now();
    let body = '';
    if (activeTab === 'finance') {
      body = [
        'EVERYTHING — Math & Finance Report',
        `Percentage: ${pctVal}% of ${pctOf} = ${((pctVal / 100) * pctOf).toFixed(2)}`,
        `GST (${gstMode}, ${gstRate}%): Base=${gstRes.baseAmount.toFixed(2)}, Tax=${gstRes.gstAmount.toFixed(2)}, Total=${gstRes.totalAmount.toFixed(2)}`,
        `EMI Loan: Principal=${emiPrincipal}, Rate=${emiRate}%, Months=${emiMonths} => Monthly=${emiRes.emi.toFixed(2)}, Interest=${emiRes.totalInterest.toFixed(2)}, Total=${emiRes.totalPayment.toFixed(2)}`,
      ].join('\n');
    } else if (activeTab === 'units') {
      body = `EVERYTHING — Unit Conversion (${unitCat})\n${unitVal} ${unitFrom} = ${unitResult} ${unitTo}\n`;
    } else if (activeTab === 'time') {
      body = [
        'EVERYTHING — Date & Time-Zone Report',
        dateRes
          ? `Duration (${dateA} to ${dateB}): ${dateRes.years}y ${dateRes.months}m ${dateRes.days}d (${dateRes.totalDays} days)`
          : 'Invalid date range',
        `Base local input: ${baseIso}`,
      ].join('\n');
    } else if (activeTab === 'text') {
      body = textInput;
    } else if (activeTab === 'qrscan') {
      if (!qrDecoded) return;
      body = qrDecoded;
    }

    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const outName = replaceFileExtension(filename || `utilities_${activeTab}`, 'txt');
    downloadBlob(blob, outName);
    recordHistory({
      toolId: selectedTool?.id || 'util-calculators',
      toolName: selectedTool?.name || 'Utilities Export',
      category: 'utilities',
      inputFilename: activeTab,
      outputFilename: outName,
      inputSize: body.length,
      outputSize: blob.size,
      durationMs: performance.now() - t0,
      mode: 'local',
    });
  };

  return (
    <StudioShell
      filename={filename}
      onFilenameChange={setFilename}
      onExport={handleExportReport}
      exportLabel={activeTab === 'text' ? 'Download TXT' : 'Export Report'}
      exportDisabled={activeTab === 'qrscan' && !qrDecoded}
      railTabs={UTIL_RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={setActiveTab}
      bottomMetaLeft="Offline Deterministic Math & Browser Intl APIs"
      bottomMetaRight="jsQR Local Scanner"
    >
      <input
        ref={filePickerRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) handleScanQrFile(e.target.files[0]);
        }}
      />

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
        {activeTab === 'finance' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Percentage */}
            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#17191D]">Percentage Calculator</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[#717782] block mb-1">Percent (%)</label>
                  <input
                    type="number"
                    value={pctVal}
                    onChange={(e) => setPctVal(Number(e.target.value))}
                    className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#717782] block mb-1">Of Value</label>
                  <input
                    type="number"
                    value={pctOf}
                    onChange={(e) => setPctOf(Number(e.target.value))}
                    className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                  />
                </div>
              </div>
              <div className="p-3 bg-[#F6F7F9] rounded-lg font-mono text-sm font-bold text-[#1D4ED8] tabular-nums">
                {((pctVal / 100) * pctOf).toFixed(2)}
              </div>
            </div>

            {/* GST */}
            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#17191D]">GST / Tax Calculator</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[#717782] block mb-1">Amount</label>
                  <input
                    type="number"
                    value={gstAmount}
                    onChange={(e) => setGstAmount(Number(e.target.value))}
                    className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#717782] block mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    value={gstRate}
                    onChange={(e) => setGstRate(Number(e.target.value))}
                    className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                  />
                </div>
              </div>
              <div className="flex gap-1.5">
                {(['exclusive', 'inclusive'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setGstMode(m)}
                    className={`flex-1 py-1 text-xs rounded border capitalize transition-colors cursor-pointer ${
                      gstMode === m
                        ? 'bg-[#17191D] text-white border-[#17191D]'
                        : 'bg-[#F6F7F9] hover:bg-[#ECEFF4] border-[#E2E5EC]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="p-2.5 bg-[#F6F7F9] rounded-lg text-xs font-mono space-y-1 tabular-nums">
                <div>Base: {gstRes.baseAmount.toFixed(2)}</div>
                <div>Tax ({gstRate}%): {gstRes.gstAmount.toFixed(2)}</div>
                <div className="font-bold text-[#17191D]">Total: {gstRes.totalAmount.toFixed(2)}</div>
              </div>
            </div>

            {/* EMI */}
            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#17191D]">EMI Loan Calculator</h3>
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-[#717782] block mb-1">Principal</label>
                  <input
                    type="number"
                    value={emiPrincipal}
                    onChange={(e) => setEmiPrincipal(Number(e.target.value))}
                    className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-[#717782] block mb-1">Rate (% p.a.)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={emiRate}
                      onChange={(e) => setEmiRate(Number(e.target.value))}
                      className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#717782] block mb-1">Tenure (Months)</label>
                    <input
                      type="number"
                      value={emiMonths}
                      onChange={(e) => setEmiMonths(Number(e.target.value))}
                      className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                    />
                  </div>
                </div>
              </div>
              <div className="p-2.5 bg-[#F6F7F9] rounded-lg text-xs font-mono space-y-1 tabular-nums">
                <div className="font-bold text-[#1D4ED8]">Monthly EMI: {emiRes.emi.toFixed(2)}</div>
                <div>Total Interest: {emiRes.totalInterest.toFixed(2)}</div>
                <div>Total Payable: {emiRes.totalPayment.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'units' && (
          <div className="bg-white border border-[#E2E5EC] rounded-xl p-5 space-y-4 max-w-2xl">
            <h3 className="text-sm font-bold text-[#17191D]">Offline Unit Converter</h3>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(UNIT_OPTIONS) as UnitCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setUnitCat(cat);
                    setUnitFrom(UNIT_OPTIONS[cat][0]);
                    setUnitTo(UNIT_OPTIONS[cat][1]);
                  }}
                  className={`px-3 py-1.5 text-xs capitalize rounded-md border cursor-pointer ${
                    unitCat === cat ? 'bg-[#17191D] text-white border-[#17191D]' : 'bg-[#F6F7F9] border-[#E2E5EC]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="text-[11px] text-[#717782] block mb-1">Value</label>
                <input
                  type="number"
                  value={unitVal}
                  onChange={(e) => setUnitVal(Number(e.target.value))}
                  className="w-full h-9 px-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#717782] block mb-1">From</label>
                <select
                  value={unitFrom}
                  onChange={(e) => setUnitFrom(e.target.value)}
                  className="w-full h-9 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                >
                  {UNIT_OPTIONS[unitCat].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-[#717782] block mb-1">To</label>
                <select
                  value={unitTo}
                  onChange={(e) => setUnitTo(e.target.value)}
                  className="w-full h-9 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                >
                  {UNIT_OPTIONS[unitCat].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-4 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg font-mono text-base font-bold text-[#1D4ED8] tabular-nums">
              {unitVal} {unitFrom} = {Number.isInteger(unitResult) ? unitResult : unitResult.toPrecision(6)} {unitTo}
            </div>
          </div>
        )}

        {activeTab === 'time' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#17191D]">Age & Date Duration</h3>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={dateA}
                  onChange={(e) => setDateA(e.target.value)}
                  className="h-9 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
                <input
                  type="date"
                  value={dateB}
                  onChange={(e) => setDateB(e.target.value)}
                  className="h-9 px-2 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
              </div>
              {dateRes && (
                <div className="p-3 bg-[#F6F7F9] rounded-lg text-xs font-mono space-y-1 tabular-nums">
                  <div className="font-bold text-[#17191D]">
                    {dateRes.years} years, {dateRes.months} months, {dateRes.days} days
                  </div>
                  <div>Total Days: {dateRes.totalDays.toLocaleString()}</div>
                  <div>Total Weeks: {dateRes.totalWeeks.toLocaleString()}</div>
                </div>
              )}
            </div>

            <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#17191D]">Time-Zone Converter (Intl)</h3>
              <input
                type="datetime-local"
                value={baseIso}
                onChange={(e) => setBaseIso(e.target.value)}
                className="w-full h-9 px-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
              />
              <div className="divide-y divide-[#F1F3F6] border border-[#E2E5EC] rounded-lg">
                {TIMEZONES.map((tz) => {
                  const d = new Date(baseIso);
                  const formatted = Number.isNaN(d.getTime())
                    ? 'Invalid date'
                    : new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(d);
                  return (
                    <div key={tz} className="px-3 py-1.5 flex justify-between gap-2 text-xs font-mono tabular-nums">
                      <span className="text-[#717782] truncate">{tz}</span>
                      <span className="text-[#17191D] shrink-0">{formatted}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'text' && (
          <div className="bg-white border border-[#E2E5EC] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#17191D]">Word Counter & Case Converter</h3>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={6}
              className="w-full p-3 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg text-xs font-mono focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
            />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              {[
                { label: 'Words', val: textStats.words },
                { label: 'Chars', val: textStats.chars },
                { label: 'No Space', val: textStats.charsNoSpaces },
                { label: 'Lines', val: textStats.lines },
                { label: 'Sentences', val: textStats.sentences },
                { label: 'Read Min', val: textStats.readingMinutes },
              ].map((s) => (
                <div key={s.label} className="p-2.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-lg">
                  <div className="font-mono text-sm font-bold text-[#17191D] tabular-nums">{s.val}</div>
                  <div className="text-[11px] text-[#717782]">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'upper', label: 'UPPERCASE' },
                  { id: 'lower', label: 'lowercase' },
                  { id: 'title', label: 'Title Case' },
                  { id: 'sentence', label: 'Sentence case' },
                  { id: 'camel', label: 'camelCase' },
                  { id: 'snake', label: 'snake_case' },
                  { id: 'kebab', label: 'kebab-case' },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setTextInput((t) => convertCase(t, c.id))}
                  className="px-3 py-1.5 bg-[#F6F7F9] hover:bg-white border border-[#E2E5EC] rounded-md text-xs font-mono transition-colors cursor-pointer"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'qrscan' && (
          <div className="py-6 flex justify-center">
            <StudioEmptyCard
              category="utilities"
              iconName="QrCode"
              title="Local QR Code Reader"
              description="Upload an image containing a QR code to decode its payload in browser memory via jsQR."
              primaryLabel="Select Image to Scan"
              onPrimaryClick={() => filePickerRef.current?.click()}
              footnote="Processed offline via jsQR"
            >
              {qrDecoded && (
                <div className="space-y-2 text-left">
                  <StudioNotice variant="success" className="font-mono break-all">
                    <strong>Decoded Payload:</strong> {qrDecoded}
                  </StudioNotice>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyText(qrDecoded, 'qr')}
                      className="h-8 px-3 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] rounded text-xs font-medium cursor-pointer"
                    >
                      {copiedKey === 'qr' ? 'Copied' : 'Copy Payload'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQrDecoded(null);
                        setQrError(null);
                      }}
                      className="h-8 px-3 bg-white hover:bg-[#F6F7F9] border border-[#E2E5EC] rounded text-xs font-medium cursor-pointer"
                    >
                      Clear Result
                    </button>
                  </div>
                </div>
              )}
              {qrError && <StudioNotice variant="error">{qrError}</StudioNotice>}
            </StudioEmptyCard>
          </div>
        )}
      </div>
    </StudioShell>
  );
};
