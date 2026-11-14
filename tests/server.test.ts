import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.ts';
import { isCloudAiConfigured } from '../server/aiProvider.ts';

test('AI Provider configuration check ignores empty and placeholder keys', () => {
  const prev = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    assert.equal(isCloudAiConfigured(), false);

    process.env.GEMINI_API_KEY = 'MY_GEMINI_API_KEY';
    assert.equal(isCloudAiConfigured(), false);

    process.env.GEMINI_API_KEY = '   ';
    assert.equal(isCloudAiConfigured(), false);
  } finally {
    if (prev === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prev;
  }
});

test('Express HTTP API enforces health check, consent boundaries, and input validation', async () => {
  const app = createApp();
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

    const healthRes = await fetch(`${base}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as {
      ok: boolean;
      aiConfigured: boolean;
      cloudAiConfigured: boolean;
      defaultModel: string;
      mode: string;
    };
    assert.equal(healthJson.ok, true);
    assert.equal(typeof healthJson.aiConfigured, 'boolean');
    assert.equal(healthJson.cloudAiConfigured, healthJson.aiConfigured);
    assert.ok(healthJson.defaultModel.length > 0);

    const planNoConsent = await fetch(`${base}/api/ai/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Compress my PDF', consentGranted: false }),
    });
    assert.equal(planNoConsent.status, 400);

    const planEmptyPrompt = await fetch(`${base}/api/ai/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ', consentGranted: true }),
    });
    assert.equal(planEmptyPrompt.status, 400);

    const assistNoConsent = await fetch(`${base}/api/ai/document-assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'summarize', text: 'Sample doc', consentGranted: false }),
    });
    assert.equal(assistNoConsent.status, 400);

    const assistEmptyText = await fetch(`${base}/api/ai/document-assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'summarize', text: '   ', consentGranted: true }),
    });
    assert.equal(assistEmptyText.status, 400);

    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const planNoKey = await fetch(`${base}/api/ai/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Compress my PDF', consentGranted: true }),
      });
      assert.equal(planNoKey.status, 503);

      const assistNoKey = await fetch(`${base}/api/ai/document-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'summarize', text: 'Hello world document', consentGranted: true }),
      });
      assert.equal(assistNoKey.status, 503);
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
