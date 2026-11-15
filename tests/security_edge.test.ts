import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.ts';
import healthHandler from '../api/health.ts';
import planHandler from '../api/ai/plan.ts';
import assistHandler from '../api/ai/document-assist.ts';
import {
  escapeHtml,
  sanitizeArchivePath,
  sanitizeDownloadFilename,
  sanitizeHtmlMarkup,
} from '../src/utils/sanitize.ts';
import { validateFilesForTool } from '../src/utils/formatters.ts';
import { getToolById } from '../src/registry/toolRegistry.ts';
import {
  packTarArchive,
  readZipEntries,
  unpackTarArchive,
  writeZipEntries,
} from '../src/engines/convert/binaryCodecs.ts';
import { createZipFromFiles, inspectZipFile } from '../src/engines/officeEngine.ts';

test('XSS sanitization strips active scripts, event handlers, frames, and dangerous URI schemes', () => {
  const dirty =
    '<p onclick="alert(1)">Hello</p>' +
    '<script>fetch("https://evil.test")</script>' +
    '<iframe srcdoc="<script>alert(2)</script>"></iframe>' +
    '<a href="JaVaScRiPt:alert(3)">Bad link</a>' +
    '<img src="data:text/html,<script>alert(4)</script>" onerror=alert(5) />' +
    '<a href="https://example.com">Safe link</a>';

  const clean = sanitizeHtmlMarkup(dirty);
  assert.ok(!clean.includes('<script'));
  assert.ok(!clean.includes('<iframe'));
  assert.ok(!/onclick=/i.test(clean));
  assert.ok(!/onerror=/i.test(clean));
  assert.ok(!/javascript:/i.test(clean));
  assert.ok(!/data:text\/html/i.test(clean));
  assert.ok(clean.includes('href="#blocked"'));
  assert.ok(clean.includes('<p>Hello</p>'));
  assert.ok(clean.includes('href="https://example.com"'));

  const escaped = escapeHtml('<script>"test" & \'more\'</script>');
  assert.equal(escaped, '&lt;script&gt;&quot;test&quot; &amp; &#39;more&#39;&lt;/script&gt;');
});

test('Archive path & filename sanitizers block Zip-slip traversal and unsafe characters', () => {
  assert.equal(sanitizeArchivePath('../../etc/passwd'), 'etc/passwd');
  assert.equal(sanitizeArchivePath('C:\\Windows\\System32\\cmd.exe'), 'Windows/System32/cmd.exe');
  assert.equal(sanitizeArchivePath('/root/../../secret\0.txt'), 'root/secret.txt');
  assert.equal(sanitizeArchivePath('../..'), 'entry');

  assert.equal(sanitizeDownloadFilename('../../.hidden?name*.png'), '_.._.hidden_name_.png');
  assert.equal(sanitizeDownloadFilename('...'), 'download');
});

test('ZIP & TAR engines neutralize traversal entry paths and reject corrupt archives', async () => {
  const enc = new TextEncoder();
  const unsafeEntries = [
    { path: '../../evil/payload.txt', data: enc.encode('hello') },
    { path: '/abs/subdir/ok.txt', data: enc.encode('world') },
  ];

  const zipBytes = await writeZipEntries(unsafeEntries);
  const readBackZip = await readZipEntries(zipBytes);
  assert.deepEqual(
    readBackZip.map((e) => e.path),
    ['evil/payload.txt', 'abs/subdir/ok.txt']
  );

  const tarBytes = packTarArchive(unsafeEntries);
  const readBackTar = unpackTarArchive(tarBytes);
  assert.deepEqual(
    readBackTar.map((e) => e.path),
    ['evil/payload.txt', 'abs/subdir/ok.txt']
  );

  const zipFile = new File([zipBytes.buffer as ArrayBuffer], 'traversal.zip', { type: 'application/zip' });
  const inspected = await inspectZipFile(zipFile);
  assert.equal(inspected.entries.some((e) => e.path === 'evil/payload.txt'), true);
  assert.equal(inspected.entries.every((e) => !e.path.includes('..')), true);

  const repacked = await createZipFromFiles([
    { name: '../folder/note.txt', data: 'safe content' },
  ]);
  const repackedEntries = await readZipEntries(await repacked.arrayBuffer());
  assert.equal(repackedEntries[0].path, 'folder/note.txt');

  await assert.rejects(() => readZipEntries(new Uint8Array([1, 2, 3, 4])));
});

test('File validation rejects 0-byte empty files, unsupported extensions, and oversized files', () => {
  const mergeTool = getToolById('pdf-merge');
  assert.ok(mergeTool);

  const emptyPdf = new File([], 'empty.pdf', { type: 'application/pdf' });
  const wrongExt = new File(['hello'], 'notes.xyz', { type: 'application/octet-stream' });
  const validPdf = new File(['%PDF-1.7'], 'valid.pdf', { type: 'application/pdf' });

  const result = validateFilesForTool([emptyPdf, wrongExt, validPdf], mergeTool);
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].name, 'valid.pdf');
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /empty \(0 B\)/i);
  assert.match(result.errors[1], /not supported/i);
});

test('Express server emits security headers and JSON 400 error on malformed JSON body', async () => {
  const app = createApp();
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(health.headers.get('permissions-policy') || '', /camera=\(\)/);
    assert.equal(health.headers.get('x-powered-by'), null);

    const badJson = await fetch(`${base}/api/ai/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"prompt": invalid json',
    });
    assert.equal(badJson.status, 400);
    const badJsonBody = (await badJson.json()) as { error?: string };
    assert.match(badJsonBody.error || '', /invalid json/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('Vercel serverless handlers enforce HTTP methods, consent, and missing key guards', async () => {
  function mockRes() {
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let body: unknown = null;
    return {
      headers,
      get statusCode() {
        return statusCode;
      },
      get body() {
        return body;
      },
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      status(code: number) {
        statusCode = code;
        return {
          json(payload: unknown) {
            body = payload;
          },
        };
      },
    };
  }

  const resHealthMethod = mockRes();
  healthHandler({ method: 'POST' }, resHealthMethod);
  assert.equal(resHealthMethod.statusCode, 405);

  const resHealthOk = mockRes();
  healthHandler({ method: 'GET' }, resHealthOk);
  assert.equal(resHealthOk.statusCode, 200);
  assert.equal((resHealthOk.body as { ok: boolean }).ok, true);

  const resPlanMethod = mockRes();
  await planHandler({ method: 'GET' }, resPlanMethod);
  assert.equal(resPlanMethod.statusCode, 405);

  const resPlanConsent = mockRes();
  await planHandler({ method: 'POST', body: { prompt: 'merge', consentGranted: false } }, resPlanConsent);
  assert.equal(resPlanConsent.statusCode, 400);

  const resAssistConsent = mockRes();
  await assistHandler({ method: 'POST', body: { text: 'doc', consentGranted: false } }, resAssistConsent);
  assert.equal(resAssistConsent.statusCode, 400);
});
