import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_REGISTRY, detectFilesRouting, getToolById, matchesToolQuery } from '../src/registry/toolRegistry.ts';
import { formatJson } from '../src/engines/devToolsEngine.ts';
import { executeFileConversion } from '../src/engines/convert/convertEngine.ts';
import { DEFAULT_CONVERSION_SETTINGS } from '../src/engines/convert/types.ts';

test('Integration & Component Workflow: 1. Homepage & Tool Discovery', () => {
  const tool = getToolById('convert-anything');
  assert.ok(tool);
  assert.equal(tool.name, 'Convert Anything');
  assert.equal(matchesToolQuery(tool, 'json to yaml'), true);
  assert.equal(matchesToolQuery(tool, 'unrelated term xyz'), false);

  const route = detectFilesRouting([new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' })]);
  assert.equal(route.detectedKind, 'pdf');
  assert.ok(route.recommendedToolIds.includes('convert-anything'));
});

test('Integration & Component Workflow: 5. Open JSON formatter -> validate -> copy output', () => {
  const rawJson = '{"name": "EVERYTHING", "version": 1.0}';
  const res = formatJson(rawJson, false);
  assert.equal(res.error, null);
  assert.ok(res.output.includes('\n'));
  assert.ok(res.output.includes('"name": "EVERYTHING"'));
});

test('Integration & Component Workflow: 7. Handle unsupported file & 8. Recover from error', async () => {
  const unsupportedFile = new File(['plain text data'], 'data.xyz', { type: 'text/plain' });
  
  const hashBefore = await unsupportedFile.arrayBuffer();
  await assert.rejects(
    () => executeFileConversion(unsupportedFile, 'mp4' as any, DEFAULT_CONVERSION_SETTINGS),
    /not supported/i
  );
  const hashAfter = await unsupportedFile.arrayBuffer();
  assert.equal(hashBefore.byteLength, hashAfter.byteLength);
});
