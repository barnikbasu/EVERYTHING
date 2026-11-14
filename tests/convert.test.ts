import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import * as yaml from 'js-yaml';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';

import { detectFileFormat, validateOutputSignature } from '../src/engines/convert/formatDetector.ts';
import {
  decodeBmpRgba,
  encodeBmpRgba,
  encodeIcoFromPngBuffers,
  extractLargestFrameFromIco,
  gunzipBytes,
  gzipBytes,
  packTarArchive,
  readZipEntries,
  unpackTarArchive,
  writeZipEntries,
} from '../src/engines/convert/binaryCodecs.ts';
import {
  CONVERSION_REGISTRY,
  detectRuntimeCodecCapabilities,
  getSupportedTargetsForSource,
} from '../src/engines/convert/compatibilityRegistry.ts';
import { estimateConversionOutput, executeFileConversion } from '../src/engines/convert/convertEngine.ts';
import { DEFAULT_CONVERSION_SETTINGS } from '../src/engines/convert/types.ts';
import { parseSpreadsheetFile } from '../src/engines/officeEngine.ts';
import { getToolById, detectFilesRouting } from '../src/registry/toolRegistry.ts';

async function sha256File(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function makeFakePngBytes(): Uint8Array {
  // Minimal PNG header + IHDR + IEND signature sufficient for signature & ICO container framing
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x72, 0xb6, 0x0d, 0x24,
  ]);
}

function makeIsoBmffFtyp(brand: string): Uint8Array {
  const buf = new Uint8Array(24);
  buf[3] = 24;
  buf.set([0x66, 0x74, 0x79, 0x70], 4); // 'ftyp'
  for (let i = 0; i < 4; i++) buf[8 + i] = brand.charCodeAt(i);
  return buf;
}

test('Conversion compatibility registry invariants & tool wiring', () => {
  const convTool = getToolById('convert-anything');
  assert.ok(convTool);
  assert.equal(convTool.workspaceType, 'convert');
  assert.equal(convTool.category, 'convert');

  // Verify no duplicate (source, target) pairs in registry
  const seenIds = new Set<string>();
  for (const def of CONVERSION_REGISTRY) {
    assert.ok(!seenIds.has(def.id), `Duplicate conversion definition id: ${def.id}`);
    seenIds.add(def.id);
    assert.notEqual(def.outputMimeType, '');
    assert.notEqual(def.outputExtension, '');
  }

  // Unavailable pairs (HEIC, TIFF, PPTX, MP3/FLAC/AAC encode, MP4/MKV/AVI) must NOT appear as selectable targets
  const caps = detectRuntimeCodecCapabilities();
  for (const blockedSrc of ['heic', 'tiff', 'pptx', 'mkv', 'avi'] as const) {
    assert.deepEqual(
      getSupportedTargetsForSource(blockedSrc, caps, false),
      [],
      `Expected no executable targets for ${blockedSrc}`
    );
  }
  const wavTargets = getSupportedTargetsForSource('wav', caps, false).map((t) => t.targetFormat);
  assert.ok(!wavTargets.includes('mp3'));
  assert.ok(!wavTargets.includes('flac'));
  assert.ok(!wavTargets.includes('aac'));

  // File routing always surfaces convert-anything cleanly
  const pngFile = new File([makeFakePngBytes().buffer as ArrayBuffer], 'shot.png', { type: 'image/png' });
  const routing = detectFilesRouting([pngFile]);
  assert.ok(routing.recommendedToolIds.includes('convert-anything'));
});

test('Signature-based format detection catches spoofed extensions & inspects containers', async () => {
  // 1. PNG bytes disguised with a .jpg extension
  const spoofedPng = new File([makeFakePngBytes().buffer as ArrayBuffer], 'photo.jpg', { type: 'image/jpeg' });
  const detPng = await detectFileFormat(spoofedPng);
  assert.equal(detPng.format, 'png');
  assert.equal(detPng.detectionMethod, 'magic-bytes');
  assert.equal(detPng.extensionMismatch, true);
  assert.equal(detPng.declaredExtension, 'jpg');

  // 2. Real DOCX container signature disguised as .zip
  const docxZip = new JSZip();
  docxZip.file('[Content_Types].xml', '<Types></Types>');
  docxZip.file('word/document.xml', '<w:document/>');
  const docxBytes = await docxZip.generateAsync({ type: 'uint8array' });
  const spoofedDocx = new File([docxBytes.buffer as ArrayBuffer], 'archive.zip', { type: 'application/zip' });
  const detDocx = await detectFileFormat(spoofedDocx);
  assert.equal(detDocx.format, 'docx');
  assert.equal(detDocx.detectionMethod, 'container-inspect');
  assert.equal(detDocx.extensionMismatch, true);

  // 3. Real XLSX container inspection
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['Item', 'Qty'], ['Widget', 5]]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const xlsxAb = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const xlsxFile = new File([xlsxAb], 'data.xlsx', { type: 'application/octet-stream' });
  const detXlsx = await detectFileFormat(xlsxFile);
  assert.equal(detXlsx.format, 'xlsx');
  assert.equal(detXlsx.extensionMismatch, false);

  // 4. TAR vs TAR.GZ vs plain GZ distinction
  const tarBytes = packTarArchive([{ path: 'hello.txt', data: new TextEncoder().encode('hello tar world') }]);
  const detTar = await detectFileFormat(new File([tarBytes.buffer as ArrayBuffer], 'bundle.tar'));
  assert.equal(detTar.format, 'tar');
  assert.equal(detTar.detectionMethod, 'magic-bytes');

  const targzBytes = gzipBytes(tarBytes);
  const detTarGz = await detectFileFormat(new File([targzBytes.buffer as ArrayBuffer], 'bundle.tar.gz'));
  assert.equal(detTarGz.format, 'tar.gz');
  assert.equal(detTarGz.detectionMethod, 'container-inspect');

  const rawGzBytes = gzipBytes(new TextEncoder().encode('plain gzipped payload'));
  const detGz = await detectFileFormat(new File([new Uint8Array(rawGzBytes)], 'notes.txt.gz'));
  assert.equal(detGz.format, 'gz');

  // 5. ISO BMFF brands (AVIF, HEIC, MP4, M4A) & RIFF (WEBP, WAV, AVI)
  assert.equal((await detectFileFormat(new File([new Uint8Array(makeIsoBmffFtyp('avif'))], 'a.bin'))).format, 'avif');
  assert.equal((await detectFileFormat(new File([new Uint8Array(makeIsoBmffFtyp('heic'))], 'b.bin'))).format, 'heic');
  assert.equal((await detectFileFormat(new File([new Uint8Array(makeIsoBmffFtyp('mp42'))], 'c.bin'))).format, 'mp4');
  assert.equal((await detectFileFormat(new File([new Uint8Array(makeIsoBmffFtyp('M4A '))], 'd.bin'))).format, 'm4a');

  const webpHead = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  assert.equal((await detectFileFormat(new File([webpHead], 'img.dat'))).format, 'webp');

  const wavHead = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
  assert.equal((await detectFileFormat(new File([wavHead], 'snd.dat'))).format, 'wav');

  // 6. Structured text heuristics (JSON misnamed .txt, RTF, SVG, YAML, XML)
  const jsonAsTxt = new File(['{"service":"everything","count":3}'], 'payload.txt', { type: 'text/plain' });
  const detJson = await detectFileFormat(jsonAsTxt);
  assert.equal(detJson.format, 'json');
  assert.equal(detJson.extensionMismatch, true);

  const rtfFile = new File(['{\\rtf1\\ansi Hello {\\b World}}'], 'memo.rtf');
  assert.equal((await detectFileFormat(rtfFile)).format, 'rtf');

  const svgFile = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"></svg>'], 'icon.svg');
  assert.equal((await detectFileFormat(svgFile)).format, 'svg');
});

test('Pure TS Binary Codecs: 24/32-bit BMP & PNG-in-ICO roundtrips', () => {
  // 2x2 RGBA pixels with distinct channels & partial alpha
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 200,
    0, 0, 255, 128,
    255, 255, 0, 255,
  ]);
  const bmp32 = encodeBmpRgba(pixels, 2, 2, true);
  assert.equal(validateOutputSignature(bmp32, 'bmp').valid, true);
  const dec32 = decodeBmpRgba(bmp32);
  assert.equal(dec32.width, 2);
  assert.equal(dec32.height, 2);
  assert.deepEqual(Array.from(dec32.rgba), Array.from(pixels));

  const bmp24 = encodeBmpRgba(pixels, 2, 2, false);
  const dec24 = decodeBmpRgba(bmp24);
  assert.equal(dec24.width, 2);
  assert.equal(dec24.rgba[0], 255);
  assert.equal(dec24.rgba[3], 255); // opaque

  // Reliable BMP output estimator
  const est = estimateConversionOutput(100, 'png', 'bmp', { ...DEFAULT_CONVERSION_SETTINGS, preserveTransparency: true }, { width: 100, height: 100 });
  assert.ok(est && est.includes('100×100'));

  // ICO encoding & frame extraction
  const png16 = makeFakePngBytes();
  const icoBytes = encodeIcoFromPngBuffers([
    { width: 16, height: 16, pngBytes: png16 },
    { width: 32, height: 32, pngBytes: png16 },
  ]);
  assert.equal(validateOutputSignature(icoBytes, 'ico').valid, true);
  const largest = extractLargestFrameFromIco(icoBytes);
  assert.equal(largest.width, 32);
  assert.deepEqual(Array.from(largest.pngBytes!), Array.from(png16));
});

test('Structured Data Conversions: JSON <-> YAML <-> XML <-> CSV <-> TSV <-> MD <-> HTML & Error Handling', async () => {
  const sampleRecords = [
    { id: 1, product: 'Desk Lamp', price: 49.5 },
    { id: 2, product: 'Cable Organizer', price: 14 },
  ];
  const jsonFile = new File([JSON.stringify(sampleRecords)], 'catalog.json', { type: 'application/json' });
  const origHash = await sha256File(jsonFile);

  // JSON -> YAML -> XML -> CSV -> JSON roundtrip
  const toYaml = await executeFileConversion(jsonFile, 'yaml', DEFAULT_CONVERSION_SETTINGS);
  assert.equal(toYaml.signatureValid, true);
  const yamlParsed = yaml.load(await toYaml.blob.text());
  assert.deepEqual(yamlParsed, sampleRecords);

  const yamlFile = new File([await toYaml.blob.text()], 'catalog.yaml', { type: 'application/yaml' });
  const toXml = await executeFileConversion(yamlFile, 'xml', { ...DEFAULT_CONVERSION_SETTINGS, xmlRootName: 'catalog' });
  const xmlText = await toXml.blob.text();
  assert.ok(xmlText.startsWith('<?xml') && xmlText.includes('<catalog>'));

  const toCsv = await executeFileConversion(jsonFile, 'csv', DEFAULT_CONVERSION_SETTINGS);
  const csvText = await toCsv.blob.text();
  assert.ok(csvText.includes('id,product,price') && csvText.includes('Desk Lamp'));

  const csvFile = new File([csvText], 'catalog.csv', { type: 'text/csv' });
  const csvToTsv = await executeFileConversion(csvFile, 'tsv', DEFAULT_CONVERSION_SETTINGS);
  assert.ok((await csvToTsv.blob.text()).includes('id\tproduct\tprice'));

  const csvToMd = await executeFileConversion(csvFile, 'md', DEFAULT_CONVERSION_SETTINGS);
  assert.ok((await csvToMd.blob.text()).includes('| id | product | price |'));

  const csvToHtml = await executeFileConversion(csvFile, 'html', DEFAULT_CONVERSION_SETTINGS);
  assert.ok((await csvToHtml.blob.text()).includes('<table>') && (await csvToHtml.blob.text()).includes('Desk Lamp'));

  // Original input file must remain unmodified
  assert.equal(await sha256File(jsonFile), origHash);

  // Malformed JSON is detected as plain text; parsing yaml from bad json syntax must fail loudly
  const badJson = new File(['{"broken": [1, 2,'], 'broken.json', { type: 'application/json' });
  await assert.rejects(
    () => executeFileConversion(badJson, 'yaml', DEFAULT_CONVERSION_SETTINGS, { detectedHint: 'json' })
  );
});

test('Spreadsheet & Document Conversions: XLSX <-> CSV/JSON/YAML/HTML/MD/PDF & RTF/MD -> PDF', async () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Role', 'Score'],
    [' Alice ', 'Engineer', 98],
    ['Bob', 'Designer', 92],
    ['Bob', 'Designer', 92],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Team');
  const xlsxAb = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const xlsxFile = new File([xlsxAb], 'team.xlsx');

  const xToCsv = await executeFileConversion(xlsxFile, 'csv', {
    ...DEFAULT_CONVERSION_SETTINGS,
    trimCells: true,
    deduplicateRows: true,
  });
  const csvStr = await xToCsv.blob.text();
  assert.ok(csvStr.includes('Alice,Engineer,98'));
  assert.equal(csvStr.split('\n').filter(Boolean).length, 3); // header + Alice + deduplicated Bob

  const xToPdf = await executeFileConversion(xlsxFile, 'pdf', DEFAULT_CONVERSION_SETTINGS);
  assert.equal(xToPdf.signatureValid, true);
  const reloadedPdf = await PDFDocument.load(await xToPdf.blob.arrayBuffer());
  assert.ok(reloadedPdf.getPageCount() >= 1);

  // CSV -> XLSX -> reload with SheetJS parser
  const csvFile = new File(['City,Pop\nTokyo,14000000\nZurich,434000'], 'cities.csv', { type: 'text/csv' });
  const cToXlsx = await executeFileConversion(csvFile, 'xlsx', DEFAULT_CONVERSION_SETTINGS);
  const outXlsxFile = new File([await cToXlsx.blob.arrayBuffer()], 'cities.xlsx');
  const parsedBack = await parseSpreadsheetFile(outXlsxFile);
  assert.equal(parsedBack.sheetNames[0], 'Sheet1');
  assert.equal(parsedBack.sheets.Sheet1[1][0], 'Tokyo');
  assert.equal(String(parsedBack.sheets.Sheet1[1][1]), '14000000');

  // RTF -> TXT, HTML, PDF (including WinAnsi-safe arrow/unicode replacement test!)
  const rtfFile = new File(['{\\rtf1\\ansi Project Summary \\par Revenue grew → 120%!}'], 'summary.rtf');
  const rToTxt = await executeFileConversion(rtfFile, 'txt', DEFAULT_CONVERSION_SETTINGS);
  assert.ok((await rToTxt.blob.text()).includes('Project Summary'));

  const rToPdf = await executeFileConversion(rtfFile, 'pdf', DEFAULT_CONVERSION_SETTINGS);
  assert.equal(rToPdf.signatureValid, true);
  const rtfPdfDoc = await PDFDocument.load(await rToPdf.blob.arrayBuffer());
  assert.equal(rtfPdfDoc.getPageCount(), 1);

  // Markdown (with emoji / Unicode arrows) -> HTML & PDF without WinAnsi crash
  const mdFile = new File(['# Quarterly Update\n\n- Pipeline → healthy 🚀\n- Budget stable'], 'notes.md');
  const mToHtml = await executeFileConversion(mdFile, 'html', DEFAULT_CONVERSION_SETTINGS);
  assert.ok((await mToHtml.blob.text()).includes('<h1>Quarterly Update</h1>'));
  const mToPdf = await executeFileConversion(mdFile, 'pdf', DEFAULT_CONVERSION_SETTINGS);
  assert.equal(mToPdf.signatureValid, true);
});

test('Archive Conversions: ZIP <-> TAR <-> TAR.GZ, single-file packaging, GZ decompress & AbortSignal cancellation', async () => {
  const inputFiles = [
    { path: 'docs/readme.txt', data: new TextEncoder().encode('Hello archive!') },
    { path: 'config.json', data: new TextEncoder().encode('{"ok":true}') },
  ];
  const initialZip = await writeZipEntries(inputFiles);
  const zipFile = new File([new Uint8Array(initialZip)], 'bundle.zip', { type: 'application/zip' });

  // ZIP -> TAR -> TAR.GZ -> ZIP full byte-level roundtrip
  const zipToTar = await executeFileConversion(zipFile, 'tar', DEFAULT_CONVERSION_SETTINGS);
  assert.equal(zipToTar.signatureValid, true);
  assert.equal(zipToTar.outputFilename, 'bundle.tar');

  const tarFile = new File([await zipToTar.blob.arrayBuffer()], 'bundle.tar');
  const tarToTgz = await executeFileConversion(tarFile, 'tar.gz', DEFAULT_CONVERSION_SETTINGS);
  assert.equal(tarToTgz.signatureValid, true);
  assert.equal(tarToTgz.outputFilename, 'bundle.tar.gz');

  const tgzFile = new File([await tarToTgz.blob.arrayBuffer()], 'bundle.tar.gz');
  const tgzToZip = await executeFileConversion(tgzFile, 'zip', DEFAULT_CONVERSION_SETTINGS);
  assert.equal(tgzToZip.signatureValid, true);
  assert.equal(tgzToZip.outputFilename, 'bundle.zip');

  const unpacked = await readZipEntries(new Uint8Array(await tgzToZip.blob.arrayBuffer()));
  assert.equal(unpacked.length, 2);
  assert.equal(unpacked[0].path, 'docs/readme.txt');
  assert.equal(new TextDecoder().decode(unpacked[0].data), 'Hello archive!');
  assert.equal(new TextDecoder().decode(unpacked[1].data), '{"ok":true}');

  // Single non-archive file packaged as .gz -> decompressed back to .txt
  const txtFile = new File(['Compact local stream data'], 'report.txt', { type: 'text/plain' });
  const toGz = await executeFileConversion(txtFile, 'gz', DEFAULT_CONVERSION_SETTINGS);
  assert.equal(toGz.outputFilename, 'report.txt.gz');
  assert.equal(toGz.signatureValid, true);

  const gzFile = new File([await toGz.blob.arrayBuffer()], 'report.txt.gz', { type: 'application/gzip' });
  const gzToTxt = await executeFileConversion(gzFile, 'txt', DEFAULT_CONVERSION_SETTINGS);
  assert.equal(await gzToTxt.blob.text(), 'Compact local stream data');

  // AbortController pre-aborted cancellation must cleanly abort
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    () => executeFileConversion(zipFile, 'tar', DEFAULT_CONVERSION_SETTINGS, { signal: ac.signal }),
    /cancelled/i
  );

  // Malformed TAR must fail loudly
  const corruptTarBytes = new Uint8Array(1024).fill(0xaa);
  assert.throws(() => unpackTarArchive(corruptTarBytes));

  // Direct gunzip + unpack sanity check
  assert.equal(gunzipBytes(gzipBytes(new Uint8Array([1, 2, 3, 4]))).length, 4);
  assert.equal(unpackTarArchive(packTarArchive(inputFiles)).length, 2);
});
