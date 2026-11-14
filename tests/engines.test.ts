import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PDFDocument, PDFName } from 'pdf-lib';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

import {
  TOOL_REGISTRY,
  WORKSPACE_STUDIOS,
  detectFilesRouting,
  getToolById,
  matchesToolQuery,
} from '../src/registry/toolRegistry.ts';
import { dataUrlToArrayBuffer, imageMimeToExt } from '../src/utils/mediaUtils.ts';
import {
  compressPdf,
  fillAndFlattenPdf,
  inspectPdfFormFields,
  mergePdfs,
  organizePdf,
  parsePageRangeExpression,
  splitPdf,
} from '../src/engines/pdfEngine.ts';
import {
  cleanSpreadsheetRows,
  createZipFromFiles,
  exportSpreadsheet,
  inspectZipFile,
  parseRtfText,
  parseSpreadsheetFile,
} from '../src/engines/officeEngine.ts';
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
  renderSafeMarkdownHtml,
} from '../src/engines/devToolsEngine.ts';
import {
  calculateDateDiff,
  calculateEmi,
  calculateGst,
  convertCase,
  convertUnits,
  getTextStats,
} from '../src/engines/utilitiesEngine.ts';
import {
  estimatePasswordEntropy,
  generateSecurePassword,
  inspectFilePrivacy,
  stripPdfMetadata,
} from '../src/engines/privacyEngine.ts';
import { computeContrastRatio, generateQrOutputs } from '../src/engines/designEngine.ts';
import { computeCutoutAlphaMask } from '../src/engines/imageEngine.ts';
import { encodeAudioBufferToWav } from '../src/engines/audioEngine.ts';
import { computeOutputDimensions } from '../src/engines/videoEngine.ts';
import { AIWorkflowPlanSchema, buildLocalWorkflowPlan } from '../src/engines/aiCommandEngine.ts';

async function sha256File(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function createSamplePdfFile(name: string, pageCount: number, withForm = false): Promise<File> {
  const doc = await PDFDocument.create();
  doc.setTitle('Confidential Draft');
  doc.setAuthor('Test Author');
  doc.setSubject('Audit Subject');
  doc.setCreator('EVERYTHING Test');
  doc.setProducer('pdf-lib');
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`Page ${i + 1} of ${name}`, { x: 40, y: 540, size: 16 });
  }
  if (withForm) {
    const form = doc.getForm();
    const tf = form.createTextField('applicant_name');
    tf.setText('Initial Name');
    tf.addToPage(doc.getPage(0), { x: 40, y: 460, width: 200, height: 28 });

    const cb = form.createCheckBox('agree_terms');
    cb.uncheck();
    cb.addToPage(doc.getPage(0), { x: 40, y: 420, width: 18, height: 18 });

    const dd = form.createDropdown('plan_tier');
    dd.addOptions(['Starter', 'Pro', 'Enterprise']);
    dd.select('Starter');
    dd.addToPage(doc.getPage(0), { x: 40, y: 370, width: 160, height: 28 });
  }
  const bytes = await doc.save();
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

test('Tool Registry Integrity & Intelligent File Routing', () => {
  assert.ok(TOOL_REGISTRY.length >= 25, 'Registry should contain full tool catalog');

  // Unique tool IDs and honest declared outputFormats
  const seenIds = new Set<string>();
  for (const t of TOOL_REGISTRY) {
    assert.ok(!seenIds.has(t.id), `Duplicate tool ID: ${t.id}`);
    seenIds.add(t.id);
  }
  assert.deepEqual(getToolById('audio-studio')?.outputFormats, ['WAV']);
  assert.deepEqual(getToolById('audio-record')?.outputFormats, ['WAV']);
  assert.ok(getToolById('dev-formatters')?.outputFormats?.includes('JS'));
  assert.deepEqual(getToolById('util-calculators')?.outputFormats, ['TXT']);

  const pdfRoute = detectFilesRouting([new File(['%PDF-1.4'], 'contract.pdf', { type: 'application/pdf' })]);
  assert.equal(pdfRoute.detectedKind, 'pdf');
  assert.equal(pdfRoute.primaryToolId, 'pdf-compress');

  const multiPdfRoute = detectFilesRouting([
    new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' }),
    new File(['%PDF-1.4'], 'b.pdf', { type: 'application/pdf' }),
  ]);
  assert.equal(multiPdfRoute.primaryToolId, 'pdf-merge');

  const imgRoute = detectFilesRouting([new File(['img'], 'photo.png', { type: 'image/png' })]);
  assert.equal(imgRoute.detectedKind, 'image');
  assert.equal(imgRoute.primaryToolId, 'image-remove-bg');

  const svgRoute = detectFilesRouting([new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' })]);
  assert.equal(svgRoute.detectedKind, 'code');
  assert.equal(svgRoute.primaryToolId, 'dev-regex-diff-svg');

  const multiImgRoute = detectFilesRouting([
    new File(['a'], 'one.jpg', { type: 'image/jpeg' }),
    new File(['b'], 'two.jpg', { type: 'image/jpeg' }),
  ]);
  assert.equal(multiImgRoute.detectedKind, 'image');
  assert.equal(multiImgRoute.primaryToolId, 'batch-lab');

  const sheetRoute = detectFilesRouting([new File(['a,b'], 'sales.xlsx')]);
  assert.equal(sheetRoute.detectedKind, 'spreadsheet');
  assert.equal(sheetRoute.primaryToolId, 'office-spreadsheet');

  const rtfRoute = detectFilesRouting([new File(['{\\rtf1 hi}'], 'notes.rtf')]);
  assert.equal(rtfRoute.detectedKind, 'document');
  assert.equal(rtfRoute.primaryToolId, 'office-docx-reader');

  const jsRoute = detectFilesRouting([new File(['const a=1;'], 'app.js')]);
  assert.equal(jsRoute.detectedKind, 'code');
  assert.equal(jsRoute.primaryToolId, 'dev-formatters');

  const unsupported = detectFilesRouting([new File(['?'], 'blob.xyz')]);
  assert.equal(unsupported.detectedKind, 'unknown');
  assert.equal(unsupported.primaryToolId, 'batch-lab');
});

test('PDF Engine: Merge, Split, Organize, Lossless Compress, Dropdown AcroForm & Error Paths', async () => {
  const pdfA = await createSamplePdfFile('a.pdf', 2);
  const pdfB = await createSamplePdfFile('b.pdf', 3);
  const hashBeforeA = await sha256File(pdfA);
  const hashBeforeB = await sha256File(pdfB);

  // Merge
  const mergedBlob = await mergePdfs([pdfA, pdfB]);
  const mergedDoc = await PDFDocument.load(await mergedBlob.arrayBuffer());
  assert.equal(mergedDoc.getPageCount(), 5);

  // Rejects single file and corrupt PDF
  await assert.rejects(() => mergePdfs([pdfA]), /at least 2/i);
  await assert.rejects(
    () => mergePdfs([pdfA, new File(['not a pdf'], 'corrupt.pdf')]),
    /Failed|PDF|header/i
  );

  // Range parser & Split single PDF
  assert.deepEqual(parsePageRangeExpression('1, 3-5, 2', 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(parsePageRangeExpression('99', 5), []);

  const mergedFile = new File([await mergedBlob.arrayBuffer()], 'merged.pdf', { type: 'application/pdf' });
  await assert.rejects(() => splitPdf(mergedFile, '99', 'single-pdf'), /No valid pages/i);
  const splitSingle = await splitPdf(mergedFile, '2-3, 5', 'single-pdf');
  assert.equal(splitSingle.extension, 'pdf');
  const splitDoc = await PDFDocument.load(await splitSingle.blob.arrayBuffer());
  assert.equal(splitDoc.getPageCount(), 3);

  // Split ZIP pages
  const splitZip = await splitPdf(pdfA, '1-2', 'zip-pages');
  assert.equal(splitZip.extension, 'zip');
  const { entries } = await inspectZipFile(new File([await splitZip.blob.arrayBuffer()], 'pages.zip'));
  assert.equal(entries.length, 2);

  // Organize (keep page 2 rotated 90 deg, drop page 1)
  const organized = await organizePdf(pdfA, [
    { originalIndex: 0, rotation: 0, deleted: true },
    { originalIndex: 1, rotation: 90, deleted: false },
  ]);
  const orgDoc = await PDFDocument.load(await organized.arrayBuffer());
  assert.equal(orgDoc.getPageCount(), 1);
  assert.equal(orgDoc.getPage(0).getRotation().angle, 90);
  await assert.rejects(
    () =>
      organizePdf(pdfA, [
        { originalIndex: 0, rotation: 0, deleted: true },
        { originalIndex: 1, rotation: 0, deleted: true },
      ]),
    /at least 1 page/i
  );

  // Lossless compress strips title/author metadata
  const compressed = await compressPdf(pdfA, 'lossless');
  const compDoc = await PDFDocument.load(await compressed.arrayBuffer());
  assert.equal(compDoc.getTitle() || '', '');
  assert.equal(compDoc.getAuthor() || '', '');

  // AcroForm inspect, fill (including dropdown!) & flatten
  const formFile = await createSamplePdfFile('form.pdf', 1, true);
  const fields = await inspectPdfFormFields(formFile);
  assert.equal(fields.length, 3);
  assert.equal(fields[0].name, 'applicant_name');
  assert.equal(fields[1].checked, false);
  assert.equal(fields[2].type, 'dropdown');
  assert.deepEqual(fields[2].options, ['Starter', 'Pro', 'Enterprise']);

  // Editable save preserves filled values
  const filledBlob = await fillAndFlattenPdf(
    formFile,
    { applicant_name: 'Ada Lovelace', agree_terms: true, plan_tier: 'Enterprise' },
    false
  );
  const reloadedFields = await inspectPdfFormFields(
    new File([await filledBlob.arrayBuffer()], 'filled.pdf')
  );
  assert.equal(reloadedFields.find((f) => f.name === 'applicant_name')?.value, 'Ada Lovelace');
  assert.equal(reloadedFields.find((f) => f.name === 'agree_terms')?.checked, true);
  assert.equal(reloadedFields.find((f) => f.name === 'plan_tier')?.value, 'Enterprise');

  // Flattened save removes interactive fields cleanly
  const flattenedBlob = await fillAndFlattenPdf(
    formFile,
    { applicant_name: 'Ada Lovelace', agree_terms: true, plan_tier: 'Pro' },
    true
  );
  const flatDoc = await PDFDocument.load(await flattenedBlob.arrayBuffer());
  assert.equal(flatDoc.getForm().getFields().length, 0);

  // Original input files remain strictly unmodified
  assert.equal(await sha256File(pdfA), hashBeforeA);
  assert.equal(await sha256File(pdfB), hashBeforeB);
});

test('Office Engine: XLSX/CSV/JSON roundtrip, RTF parser, ZIP roundtrip & invalid input checks', async () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['  Name ', 'Role  '],
    ['Alice', 'Engineer'],
    ['', ''],
    ['Alice', 'Engineer'],
    ['Bob', '  Designer '],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Team');
  const xlsxBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const xlsxFile = new File([xlsxBytes], 'team.xlsx');
  const hashBefore = await sha256File(xlsxFile);

  const parsed = await parseSpreadsheetFile(xlsxFile);
  assert.deepEqual(parsed.sheetNames, ['Team']);

  const cleaned = cleanSpreadsheetRows(parsed.sheets['Team'], {
    trimWhitespace: true,
    removeEmptyRows: true,
    deduplicateRows: true,
  });
  assert.deepEqual(cleaned, [
    ['Name', 'Role'],
    ['Alice', 'Engineer'],
    ['Bob', 'Designer'],
  ]);

  const jsonBlob = exportSpreadsheet(cleaned, 'Team', 'json');
  const jsonRecords = JSON.parse(await jsonBlob.text());
  assert.deepEqual(jsonRecords, [
    { Name: 'Alice', Role: 'Engineer' },
    { Name: 'Bob', Role: 'Designer' },
  ]);

  const csvBlob = exportSpreadsheet(cleaned, 'Team', 'csv');
  const csvText = await csvBlob.text();
  assert.match(csvText, /Alice,Engineer/);

  // XLSX binary export opens back cleanly
  const xlsxOutBlob = exportSpreadsheet(cleaned, 'Team', 'xlsx');
  const xlsxReloaded = await parseSpreadsheetFile(new File([await xlsxOutBlob.arrayBuffer()], 'out.xlsx'));
  assert.deepEqual(xlsxReloaded.sheets['Team'], cleaned);

  // RTF Parser strips destination groups & decodes escapes cleanly
  const sampleRtf =
    '{\\rtf1\\ansi{\\fonttbl{\\f0 Helvetica;}}{\\colortbl;\\red0\\green0\\blue0;}\\pard Project\\emdash Cafe\\' +
    "'e9" +
    '\\par Second\\tab Line\\u8364?\\par}';
  const plainRtf = parseRtfText(sampleRtf);
  assert.doesNotMatch(plainRtf, /Helvetica/);
  assert.match(plainRtf, /Project\u2014Cafe/);
  assert.match(plainRtf, /Second\tLine€/);

  // ZIP creation and inspection + corrupt ZIP rejection
  const zipBlob = await createZipFromFiles([
    { name: 'hello.txt', data: 'world' },
    { name: 'team.csv', data: csvBlob },
  ]);
  const { entries, zip } = await inspectZipFile(new File([await zipBlob.arrayBuffer()], 'bundle.zip'));
  assert.equal(entries.length, 2);
  assert.equal(await zip.file('hello.txt')?.async('string'), 'world');

  await assert.rejects(() => inspectZipFile(new File(['not a zip'], 'broken.zip')));
  assert.equal(await sha256File(xlsxFile), hashBefore);
});

test('Developer Engine: JSON/XML/CSS/JS formatters, Base64, JWT, Hashes, Regex, Markdown & Diff', async () => {
  const j = formatJson('{"b":1,"a":2}', true);
  assert.equal(j.error, null);
  assert.equal(j.output, '{"b":1,"a":2}');
  assert.ok(formatJson('{bad json}').error);

  const xml = formatXmlOrHtml('<root><item>1</item></root>', 'xml', false);
  assert.match(xml, /<root>\n  <item>1<\/item>\n<\/root>/);

  const cssMin = formatCss('body { color: red; margin: 0; }', true);
  assert.equal(cssMin, 'body{color:red;margin:0}');

  const jsMin = formatJs('const url = "https://a.com//keep"; // drop comment\nfunction hi(x){return x + 1;}', true);
  assert.match(jsMin, /https:\/\/a\.com\/\/keep/);
  assert.doesNotMatch(jsMin, /drop comment/);
  const jsPretty = formatJs('function hi(x){return x+1;}', false);
  assert.match(jsPretty, /function hi\(x\) \{\n  return x\+1;\n\}/);

  const b64 = encodeBase64Utf8('EVERYTHING ✓');
  const decoded = decodeBase64Utf8(b64);
  assert.equal(decoded.text, 'EVERYTHING ✓');
  assert.ok(decodeBase64Utf8('!!!not-base64!!!').error);

  const jwt = decodeJwt(
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJleHAiOjE5MDAwMDAwMDB9.sig'
  );
  assert.equal(jwt.error, null);
  assert.equal(jwt.data?.payload.sub, '123');
  assert.equal(jwt.data?.expired, false);
  assert.ok(decodeJwt('invalid-token').error);

  const hashes = await computeHashes('abc');
  assert.equal(hashes.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  const uuids = generateUuidBatch(3);
  assert.equal(uuids.length, 3);
  assert.notEqual(uuids[0], uuids[1]);

  const rx = evaluateRegex('\\d+', 'g', 'Order 42 has 7 items');
  assert.equal(rx.matches.length, 2);
  assert.equal(rx.matches[0].match, '42');
  assert.ok(evaluateRegex('([unclosed', 'g', 'test').error);

  const mdHtml = renderSafeMarkdownHtml('# Title\n<script>alert(1)</script>');
  assert.match(mdHtml, /<h1/);
  assert.doesNotMatch(mdHtml, /<script>/);

  const diff = computeTextDiff('a\nb', 'a\nc');
  assert.ok(diff.some((p) => p.removed && p.value.includes('b')));
  assert.ok(diff.some((p) => p.added && p.value.includes('c')));
});

test('Utilities Engine: Finance Math, Unit Converter, Dates, Text Stats & jsQR Payload Roundtrip', () => {
  const emi = calculateEmi(120000, 12, 12);
  assert.ok(Math.abs(emi.emi - 10661.85) < 0.05);

  const gstInc = calculateGst(118, 18, 'inclusive');
  assert.ok(Math.abs(gstInc.baseAmount - 100) < 0.001);
  const gstExc = calculateGst(100, 18, 'exclusive');
  assert.ok(Math.abs(gstExc.totalAmount - 118) < 0.001);

  assert.equal(Math.round(convertUnits(100, 'temperature', 'C', 'F')), 212);
  assert.ok(Math.abs(convertUnits(1, 'length', 'km', 'm') - 1000) < 1e-9);
  assert.equal(convertUnits(2, 'data', 'KB', 'B'), 2048);

  const diff = calculateDateDiff('2020-01-01', '2021-02-04');
  assert.equal(diff?.years, 1);
  assert.equal(diff?.months, 1);
  assert.equal(diff?.days, 3);
  assert.equal(calculateDateDiff('bad-date', '2021-02-04'), null);

  const stats = getTextStats('Hello world.\nSecond line!');
  assert.equal(stats.words, 4);
  assert.equal(stats.lines, 2);
  assert.equal(convertCase('hello world', 'camel'), 'helloWorld');
  assert.equal(convertCase('helloWorld', 'snake'), 'hello_world');

  // Synthesize real QR matrix using `qrcode` and decode RGBA buffer via `jsqr`
  const payload = 'https://everything.local/verify';
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const scale = 4;
  const margin = 4;
  const dim = (modules.size + margin * 2) * scale;
  const rgba = new Uint8ClampedArray(dim * dim * 4);
  rgba.fill(255);
  for (let r = 0; r < modules.size; r++) {
    for (let c = 0; c < modules.size; c++) {
      if (modules.get(r, c)) {
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = (c + margin) * scale + dx;
            const y = (r + margin) * scale + dy;
            const idx = (y * dim + x) * 4;
            rgba[idx] = 0;
            rgba[idx + 1] = 0;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = 255;
          }
        }
      }
    }
  }
  const scanned = jsQR(rgba, dim, dim);
  assert.equal(scanned?.data, payload);
});

test('Privacy & Design Engines: Magic Bytes, PDF/PNG/JPEG Inspection, PDF Strip, Password & QR', async () => {
  // Valid PDF magic bytes named as .png -> detects spoofing mismatch!
  const spoofed = new File(['%PDF-1.7\n%Producer (Acme)'], 'fake_image.png', { type: 'image/png' });
  const inspected = await inspectFilePrivacy(spoofed);
  assert.equal(inspected.detectedFormat, 'PDF Document (%PDF)');
  assert.equal(inspected.extensionMismatch, true);
  assert.equal(inspected.sha256.length, 64);

  // Full PDF metadata inspection + stripPdfMetadata roundtrip
  const pdfWithMeta = await createSamplePdfFile('meta.pdf', 2);
  const metaDoc = await PDFDocument.load(await pdfWithMeta.arrayBuffer());
  const xmpStream = metaDoc.context.flateStream('<x:xmpmeta>Secret Camera Info</x:xmpmeta>');
  const xmpRef = metaDoc.context.register(xmpStream);
  metaDoc.catalog.set(PDFName.of('Metadata'), xmpRef);
  const metaFile = new File([new Uint8Array(await metaDoc.save())], 'with_xmp.pdf', { type: 'application/pdf' });
  const hashBeforeMeta = await sha256File(metaFile);

  const pdfInspect = await inspectFilePrivacy(metaFile);
  assert.ok(pdfInspect.metadataFindings.some((m) => m.key === 'PDF Title' && m.value === 'Confidential Draft'));
  assert.ok(pdfInspect.metadataFindings.some((m) => m.key === 'PDF XMP Metadata Stream'));

  const strippedPdfBlob = await stripPdfMetadata(metaFile);
  const strippedFile = new File([await strippedPdfBlob.arrayBuffer()], 'clean_with_xmp.pdf', {
    type: 'application/pdf',
  });
  const strippedInspect = await inspectFilePrivacy(strippedFile);
  assert.ok(!strippedInspect.metadataFindings.some((m) => m.key === 'PDF Title'));
  assert.ok(!strippedInspect.metadataFindings.some((m) => m.key === 'PDF Author'));
  assert.ok(!strippedInspect.metadataFindings.some((m) => m.key === 'PDF XMP Metadata Stream'));
  const reopenedStripped = await PDFDocument.load(await strippedPdfBlob.arrayBuffer());
  assert.equal(reopenedStripped.getPageCount(), 2);
  assert.equal(await sha256File(metaFile), hashBeforeMeta);

  // PNG tEXt chunk inspection
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const textPayload = Buffer.from('Software\0TestEditor', 'latin1');
  const lenBytes = [(textPayload.length >>> 24) & 0xff, (textPayload.length >>> 16) & 0xff, (textPayload.length >>> 8) & 0xff, textPayload.length & 0xff];
  const pngBytes = Buffer.concat([
    Buffer.from(pngSig),
    Buffer.from(lenBytes),
    Buffer.from('tEXt', 'ascii'),
    textPayload,
    Buffer.alloc(4), // CRC placeholder
    Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0]),
  ]);
  const pngInspect = await inspectFilePrivacy(new File([pngBytes], 'photo.jpg', { type: 'image/png' }));
  assert.equal(pngInspect.detectedFormat, 'PNG Image');
  assert.equal(pngInspect.extensionMismatch, true);
  assert.ok(pngInspect.metadataFindings.some((m) => m.key === 'PNG tEXt (Software)' && m.value === 'TestEditor'));

  const pw = generateSecurePassword({
    length: 24,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  assert.equal(pw.password.length, 24);
  assert.ok(pw.entropyBits > 100);
  assert.equal(estimatePasswordEntropy(pw.password).label, 'Strong');

  assert.equal(computeContrastRatio([0, 0, 0], [255, 255, 255]), 21);

  const qr = await generateQrOutputs('https://everything.local');
  assert.ok(qr.pngDataUrl.startsWith('data:image/png;base64,'));
  assert.ok(qr.svgString.includes('<svg'));
});

test('Image Cutout Mask, WAV Encoder & Video Output Dimensions pure logic', async () => {
  // 12x12 white background with solid blue 4x4 center square
  const w = 12;
  const h = 12;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const inFg = x >= 4 && x <= 7 && y >= 4 && y <= 7;
      data[idx] = inFg ? 20 : 255;
      data[idx + 1] = inFg ? 60 : 255;
      data[idx + 2] = inFg ? 220 : 255;
      data[idx + 3] = 255;
    }
  }
  const cutout = computeCutoutAlphaMask({ width: w, height: h, data } as unknown as ImageData, 30, 0, true);
  assert.equal(cutout.data[3], 0, 'Corner background alpha should be zero');
  const centerIdx = (5 * w + 5) * 4;
  assert.ok(cutout.data[centerIdx + 3] >= 200, 'Center foreground alpha should remain opaque');

  // WAV Encoder produces valid RIFF/WAVE header + exact sample byte count
  const fakeBuf = {
    numberOfChannels: 1,
    sampleRate: 8000,
    length: 100,
    getChannelData: () => new Float32Array(100).fill(0.5),
  } as unknown as AudioBuffer;
  const wavBlob = encodeAudioBufferToWav(fakeBuf);
  assert.equal(wavBlob.size, 44 + 100 * 2);
  const wavView = new DataView(await wavBlob.arrayBuffer());
  assert.equal(String.fromCharCode(wavView.getUint8(0), wavView.getUint8(1), wavView.getUint8(2), wavView.getUint8(3)), 'RIFF');
  assert.equal(String.fromCharCode(wavView.getUint8(8), wavView.getUint8(9), wavView.getUint8(10), wavView.getUint8(11)), 'WAVE');
  assert.equal(wavView.getUint32(24, true), 8000);

  // Video output dimension calculation preserves rotation & even dimensions
  const rotDims = computeOutputDimensions(1920, 1080, 90, 'original', 1280);
  assert.equal(rotDims.width % 2, 0);
  assert.equal(rotDims.height % 2, 0);
  assert.ok(rotDims.height > rotDims.width, '90 deg rotation swaps portrait proportions');
  const sqDims = computeOutputDimensions(1920, 1080, 0, '1:1', 720);
  assert.equal(sqDims.width, 720);
  assert.equal(sqDims.height, 720);
});

test('AI Command Local Planner produces Zod-valid Plans without API key', () => {
  const pdf = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' });
  const redactPlan = buildLocalWorkflowPlan('Redact sensitive SSNs in this pdf', [pdf]);
  assert.equal(redactPlan.toolId, 'pdf-redact');
  assert.equal(redactPlan.requiresConfirmation, true);
  assert.ok(AIWorkflowPlanSchema.safeParse(redactPlan).success);

  const resizePlan = buildLocalWorkflowPlan('Resize all images to 1080 pixels wide', [
    new File(['1'], 'a.png', { type: 'image/png' }),
    new File(['2'], 'b.png', { type: 'image/png' }),
  ]);
  assert.equal(resizePlan.toolId, 'batch-lab');
  assert.equal(resizePlan.parameters?.width, 1080);
  assert.ok(AIWorkflowPlanSchema.safeParse(resizePlan).success);
});

test('Registry Search, Studio Navigation & Shared Media Utils', () => {
  // Every quick-studio switcher entry resolves cleanly to a registered tool
  for (const studio of WORKSPACE_STUDIOS) {
    const resolved = getToolById(studio.id);
    assert.ok(resolved, `Missing registry entry for studio ${studio.id}`);
    assert.equal(resolved.workspaceType, studio.workspaceType);
  }

  const pdfCompress = getToolById('pdf-compress');
  assert.ok(pdfCompress && matchesToolQuery(pdfCompress, 'shrink'));
  assert.ok(pdfCompress && !matchesToolQuery(pdfCompress, 'ffmpeg'));

  // Base64 Data URL decoding without fetch()
  const rawBytes = dataUrlToArrayBuffer('data:text/plain;base64,SGVsbG8=');
  assert.equal(new TextDecoder().decode(rawBytes), 'Hello');
  assert.equal(imageMimeToExt('image/jpeg'), 'jpg');
  assert.equal(imageMimeToExt('image/webp'), 'webp');
  assert.equal(imageMimeToExt('image/png'), 'png');
});

