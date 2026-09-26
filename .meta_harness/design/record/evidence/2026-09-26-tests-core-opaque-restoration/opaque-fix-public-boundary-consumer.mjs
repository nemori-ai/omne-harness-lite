import assert from 'node:assert/strict'
import { contentBlockFromRepresentation, judgeContentBlock, readJsonStrict, readOpaqueJson, writeJsonLossless } from '../../packages/core/content-blocks/dist/index.js'
import { brandMessage, brandRecord, judgeMessage, judgeModelInvocationRecord } from '../../packages/core/messages/dist/index.js'
import { judgeInput, judgeOutput, judgeConclusion } from '../../packages/core/loop-extension/dist/index.js'
import { toolResultOf } from '../../packages/core/tool-definition/dist/index.js'
const at = '2026-09-23T10:00:00Z'
const visibility = { toHuman: false, toModel: false }
const source = '{"token":"x","n":9007199254740993,"decimal":1.2300,"nil":null}'
const parsed = readJsonStrict(source)
assert.ok('ok' in parsed)
const thought = { id: 'b', kind: 'thinking', text: '', opaque: parsed.ok, visibility }
const message = { id: 'msg', type: 'assistant', response: 'rsp', ending: 'complete', createdAt: at, blocks: [thought] }
const wire = { position: 'before_persist_message', subject: { producer: 'model', message }, earlier: [], log: 'l', environment: 'e' }
const rows = []
function check(name, action) { action(); rows.push({ name, passed: true }) }
function payload(block) { assert.equal(block.kind, 'thinking'); return writeJsonLossless(readOpaqueJson(block.opaque)) }
check('CB shape adapter restores exact opaque', () => assert.equal(payload(contentBlockFromRepresentation(thought)), source))
check('Messages raw and domain adapter', () => { for (const value of [message, brandMessage(message)]) assert.equal(payload(brandMessage(value).blocks[0]), source) })
check('Loop input raw and domain', () => {
  const first = judgeInput(wire); assert.ok('ok' in first)
  assert.equal(payload(first.ok.subject.message.blocks[0]), source)
  const second = judgeInput(first.ok); assert.ok('ok' in second)
  assert.equal(payload(second.ok.subject.message.blocks[0]), source)
  assert.equal(Object.isFrozen(wire), false)
  assert.equal(Object.isFrozen(first.ok), true)
})
check('Loop output and conclusion', () => {
  const output = { kind: 'rewrite', subject: wire.subject }
  const restored = judgeOutput(output); assert.ok('ok' in restored)
  assert.equal(payload(restored.ok.subject.message.blocks[0]), source)
  const input = judgeInput(wire); assert.ok('ok' in input)
  const result = judgeConclusion({ extension: 'g', position: wire.position, power: 'rewrite', at, output }, { input: input.ok, extensionName: 'g' })
  assert.ok('ok' in result)
  assert.equal(payload(result.ok.output.subject.message.blocks[0]), source)
})
check('TD content nested result and offload summary', () => {
  const nested = { id: 'r', kind: 'tool_result', callId: 'call', outcome: 'completed', visibility, blocks: [thought] }
  const result = toolResultOf({ content: [nested], offload: { raw: { inline: 'eA==', mediaType: 'text/plain' }, summary: [thought] } }, contentBlockFromRepresentation(thought).id)
  assert.equal(payload(result.content[0].blocks[0]), source)
  assert.equal(payload(result.offload.summary[0]), source)
})
check('Shape-only boundary retains valid Loop input while full judgments refuse', () => {
  const voice = { id: 'v', kind: 'voice', mediaType: 'audio/wav', data: { storage: 's', key: 'k', mediaType: 'audio/ogg' }, visibility }
  assert.deepEqual(judgeContentBlock(voice), { rejected: 'malformed' })
  assert.equal(contentBlockFromRepresentation(voice).data.mediaType, 'audio/ogg')
  const unusual = { ...message, blocks: [voice] }
  assert.deepEqual(judgeMessage(unusual), { rejected: 'malformed' })
  assert.ok('ok' in judgeInput({ ...wire, subject: { ...wire.subject, message: unusual } }))
  const duplicate = { ...message, blocks: [thought, thought] }
  assert.deepEqual(judgeMessage(duplicate), { rejected: 'block_id_duplicate' })
  assert.equal(brandMessage(duplicate).blocks.length, 2)
})
check('Record restoration preserves shape-admitted value without business acceptance', () => {
  const record = { kind: 'model_call_dispatched', call: 'call', dispatch: 1, provider: 'p', response: 'rsp', profile: { origin: 'official', routeName: 'r' }, profileSnapshot: { providers: ['p'], allowFallback: true, inputModalities: ['text'], outputModalities: ['text'], maxInputTokens: 100, maxOutputTokens: 10, updatedAt: at }, parameters: {}, selectedBy: 'session', credentialScope: { layer: 'factory' }, droppedParameters: ['notExtra'] }
  assert.deepEqual(judgeModelInvocationRecord(record), { rejected: 'malformed' })
  assert.equal(brandRecord(record).droppedParameters[0], 'notExtra')
})
check('Invalid shape adapter preconditions throw TypeError', () => { for (const adapter of [contentBlockFromRepresentation, brandMessage, brandRecord]) assert.throws(() => adapter({}), TypeError) })
console.log(JSON.stringify({ node: process.version, rows }, null, 2))
