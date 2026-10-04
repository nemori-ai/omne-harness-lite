import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Executes frozen upstream pure functions only. No SDK client, credentials or network.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('./source-manifest.json'));
for (const source of manifest) {
  assert.equal(createHash('sha256').update(read(source.snapshot)).digest('hex'), source.sha256);
}
const cases = [];
function check(name, fn) { fn(); cases.push({ name, passed: true }); }
function loadPure(source, names) {
  const js = stripTypeScriptTypes(source, { mode: 'strip' }).replaceAll('export ', '');
  return vm.runInNewContext(js + '\n;({' + names.join(',') + '})');
}
const estimateSource = read('./sources/pi/packages/ai/src/utils/estimate.ts');
const textSource = read('./sources/pi/packages/ai/src/utils/text.ts');
const pi = loadPure(
  textSource.replace(/^import type .*;$/m, '') +
  estimateSource.replace(/^import .*;$/gm, ''),
  ['calculateContextTokens', 'estimateContextTokens', 'estimateMessageTokens']
);
const assistant = (overrides = {}) => ({
  role: 'assistant', content: [{ type: 'thinking', thinking: '', thinkingSignature: 'opaque' },
    { type: 'text', text: 'answer' }], timestamp: 2, stopReason: 'stop',
  usage: { input: 100, output: 30, cacheRead: 20, cacheWrite: 0, totalTokens: 150 },
  api: 'openai-completions', provider: 'openrouter', model: 'synthetic', ...overrides
});
const user = { role: 'user', content: 'next', timestamp: 3 };
check('pi usage anchor includes output once and tail only', () => {
  const result = pi.estimateContextTokens([assistant(), user]);
  assert.equal(result.tokens, 151); assert.equal(result.usageTokens, 150);
  assert.equal(result.trailingTokens, 1); assert.equal(result.lastUsageIndex, 0);
});
check('pi newer inserted prefix invalidates older timestamp usage', () => {
  const result = pi.estimateContextTokens([{ role: 'user', content: 'summary', timestamp: 9 }, assistant()]);
  assert.equal(result.lastUsageIndex, null);
});
check('pi unknown opaque cost remains uncovered without valid usage', () => {
  const result = pi.estimateContextTokens([assistant({ stopReason: 'error', content: [
    { type: 'thinking', thinking: '', thinkingSignature: 'a'.repeat(1000) }
  ] })]);
  assert.equal(result.tokens, 0); assert.equal(result.lastUsageIndex, null);
});
check('pi counterexample: model identity change does not invalidate anchor', () => {
  const result = pi.estimateContextTokens({ model: 'different-model', messages: [assistant(), user] });
  assert.equal(result.usageTokens, 150);
});
const chat = read('./sources/pi/packages/ai/src/api/openai-completions.ts');
const guard = chat.slice(chat.indexOf('function isReasoningDetailObject'), chat.indexOf('\nfunction ', chat.indexOf('function isOpenAIReasoningDetail') + 10));
const helpers = chat.slice(chat.indexOf('function parseOpenAIReasoningDetails'), chat.indexOf('const OPENAI_COMPLETIONS_REASONING_FIELDS'));
const replay = loadPure(guard + helpers, ['parseOpenAIReasoningDetails', 'appendOpenAIReasoningDetail']);
check('pi encrypted fragments stay discrete and ordered', () => {
  const details = [];
  for (const data of ['cipher-A', 'cipher-B']) replay.appendOpenAIReasoningDetail(details,
    { type: 'reasoning.encrypted', data, id: 'same-id', format: 'openai-responses-v1' });
  assert.equal(details.length, 2); assert.equal(details[1].data, 'cipher-B');
  assert.equal(JSON.stringify(replay.parseOpenAIReasoningDetails(JSON.stringify(details))), JSON.stringify(details));
});
check('pi visible summary fragments merge without changing encrypted data', () => {
  const details = [];
  for (const summary of ['first ', 'second']) replay.appendOpenAIReasoningDetail(details, { type: 'reasoning.summary', summary });
  replay.appendOpenAIReasoningDetail(details, { type: 'reasoning.encrypted', data: 'cipher' });
  assert.equal(details.length, 2); assert.equal(details[0].summary, 'first second');
  assert.equal(details[1].data, 'cipher');
});
const sdk = loadPure(read('./sources/sdk/src/utils/compute-token-usage.ts').replace(/^import type .*;$/m, ''),
  ['computeTokenUsage', 'emptyUsage']);
check('OpenRouter SDK O already includes reasoning subset', () => {
  const result = sdk.computeTokenUsage({ prompt_tokens: 100, completion_tokens: 30,
    completion_tokens_details: { reasoning_tokens: 25 } });
  assert.equal(result.outputTokens.total, 30); assert.equal(result.outputTokens.text, 5);
});
check('OpenRouter SDK counterexample: absent counts normalize to zero', () => {
  assert.equal(sdk.computeTokenUsage({}).inputTokens.total, 0);
  assert.equal(sdk.computeTokenUsage({}).outputTokens.reasoning, 0);
});
const dsh = loadPure(read('./sources/dsh/packages/llm/token-meter/src/estimate.ts').replace(/^import type .*$/gm, ''),
  ['estimateContent']);
check('DSH reasoning price observes plaintext, not hidden signature', () => {
  assert.equal(dsh.estimateContent([{ type: 'reasoning', text: '', signature: 'opaque' }]), 4);
});
console.log(JSON.stringify({ node: process.version, network: false, credentials: false,
  scope: 'frozen pure function probes; not upstream/model certification', cases }, null, 2));
