import { readFile } from 'node:fs/promises';

const base = process.env.AI_WORKER_URL || 'http://127.0.0.1:4030';
const apiKey = process.env.AI_API_KEY || '';
const runs = Math.max(1, Number(process.env.BENCHMARK_RUNS) || 1);
const headers = { 'content-type': 'application/json', ...(apiKey ? { 'x-ai-key': apiKey } : {}) };

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../test/fixtures/${name}.json`, import.meta.url), 'utf8'));
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function waitFor(key, timeoutMs = 300_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await request(`/ai/result/${key}`);
    if (result.status === 'completed' || result.status === 'failed') return result;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${key}`);
}

for (const name of ['vacancy', 'apartment']) {
  const input = await fixture(name);
  for (let run = 1; run <= runs; run += 1) {
    input.knownFacts = { ...input.knownFacts, benchmarkRun: `${Date.now()}-${run}` };
    const started = performance.now();
    const submitted = await request('/ai/extract', { method: 'POST', body: JSON.stringify(input) });
    const result = submitted.status === 'completed' ? submitted : await waitFor(submitted.key);
    const elapsedMs = Math.round(performance.now() - started);
    console.log(JSON.stringify({ fixture: name, run, elapsedMs, status: result.status, confidence: result.confidence }, null, 2));
  }
}

console.log(JSON.stringify(await request('/metrics'), null, 2));
