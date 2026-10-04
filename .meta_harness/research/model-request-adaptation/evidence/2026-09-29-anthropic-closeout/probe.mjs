import { readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const here = new URL('./', import.meta.url)
const root = new URL('../../../../../', here)
const sources = []
function read(url) {
  const text = readFileSync(url, 'utf8')
  sources.push({ path: url.pathname, sha256: createHash('sha256').update(text).digest('hex') })
  return text
}
function between(text, start, end) {
  assert(text.includes(start) && text.includes(end))
  return text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)))
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const plan = read(new URL('packages/model/pi-ai-transport/src/plan.ts', root))
const add = new Function('object', `${stripTypeScriptTypes(between(plan, 'function addBreakpoint(', 'export function planRequest('))};return addBreakpoint`)(object)
const pi = read(new URL('pi-openai.ts', here))
const compat = new Function(`${stripTypeScriptTypes(between(pi, 'function addCacheControlToTextContent(', 'export function convertMessages('))};return addCacheControlToTextContent`)()
const native = read(new URL('pi-anthropic.ts', here))
const nativeCache = new Function('params', 'cacheControl', stripTypeScriptTypes(between(native, '// Add cache_control to the last user or system message', '\n\treturn { messages: params, assistantLevels };')))
const controls = [{ type: 'ephemeral', ttl: '1h' }, { type: 'ephemeral', ttl: '5m' }]
const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,fixture' } }
const shapes = [
  ['pure-image', [image], 0],
  ['text-image', [{ type: 'text', text: 'question' }, image], 1],
  ['empty-text-image', [{ type: 'text', text: '' }, image], 1],
  ['empty-array', [], 0],
  ['empty-string', '', 0],
  ['tool-text', 'result', 1],
]
const observations = []
let assertions = 0
for (const control of controls) for (const [name, content, expected] of shapes) {
  const message = { role: name === 'tool-text' ? 'tool' : 'user', content: structuredClone(content) }
  const upstream = structuredClone(message)
  add(message, control)
  compat(upstream, control)
  assert.deepEqual(message, upstream); assertions++
  const markers = Array.isArray(message.content) ? message.content.filter(p => p.cache_control).length : 0
  assert.equal(markers, expected); assertions++
  if (markers) { assert.deepEqual(message.content.find(p => p.cache_control).cache_control, control); assertions++ }
  observations.push({ name, control, markers, currentMatchesPiCompat: true })
}
const nativeMessages = [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'fixture' } }] }]
nativeCache(nativeMessages, controls[0])
assert.deepEqual(nativeMessages[0].content[0].cache_control, controls[0]); assertions++

const meter = read(new URL('packages/model/pi-ai-transport/src/input-meters/anthropic.ts', root))
const validation = between(meter, 'const requestControls =', 'function supportedModel(')
const validate = new Function('object', 'isJsonNumber', 'imageTokens', `${stripTypeScriptTypes(validation)};return supportedInputBody`)(object, value => typeof value === 'number' && Number.isFinite(value), () => { throw Error('no image in validation probe') })
const body = detail => ({ provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true }, messages: [{ role: 'assistant', content: [{ type: 'text', text: 'answer' }], reasoning_details: [detail] }] })
const signed = { type: 'reasoning.text', text: 'summary', signature: 'opaque-signature', format: 'anthropic-claude-v1', index: 0 }
const hidden = { type: 'reasoning.encrypted', data: 'opaque-ciphertext', format: 'anthropic-claude-v1', index: 0 }
assert.equal(validate(body(signed), new Set(['1h']), new Map()), true); assertions++
assert.equal(validate(body(hidden), new Set(['1h']), new Map()), false); assertions++
const cacheModule = stripTypeScriptTypes(read(new URL('sdk-cache.ts', here))).replace(/^import[^\n]*\n/gm, '').replace('export class ', 'class ')
const Validator = new Function(`${cacheModule};return CacheControlValidator`)()
const validator = new Validator()
for (let i = 0; i < 4; i++) { assert.deepEqual(validator.getCacheControl({ anthropic: { cacheControl: controls[0] } }, { type: 'image', canCache: true }), controls[0]); assertions++ }
assert.equal(validator.getCacheControl({ anthropic: { cacheControl: controls[0] } }, { type: 'image', canCache: true }), undefined); assertions++
assert.equal(validator.getWarnings().length, 1); assertions++
const result = { assertions, passed: true, externalModelRequests: 0, scope: 'Extracted unchanged source functions; no full planner, tokenizer, native API or OpenRouter service execution. 5m function input is not current official-definition acceptance.', observations, nativePiImageMarker: true, signedTextAcceptedByCurrentMeterGuard: true, encryptedRejectedByCurrentMeterGuard: true, sdkFifthMarkerDroppedWithWarning: true, sources }
writeFileSync(new URL('probe-result.json', here), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ assertions, passed: true, externalModelRequests: 0 }))
