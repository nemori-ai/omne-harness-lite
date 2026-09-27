import { judgeInput, isExtensionInput } from '../../packages/core/loop-extension/dist/index.js'
import { toolResultOf, isToolReturn } from '../../packages/core/tool-definition/dist/index.js'
import { judgeContentBlock, readOpaqueJson, toOpaqueJson, writeJsonLossless, readJsonStrict } from '../../packages/core/content-blocks/dist/index.js'

const opaque = readJsonStrict('{"token":"x","precision":9007199254740993,"absent":null}')
if ('failed' in opaque) throw new Error('invalid fixture')
const thinking = { id: 'b', kind: 'thinking', text: '', opaque: opaque.ok, visibility: { toHuman: false, toModel: false } }
const message = { id: 'msg_2', type: 'assistant', response: 'rsp_01', ending: 'complete', createdAt: '2026-09-23T10:00:00Z', blocks: [thinking] }
const input = { position: 'before_persist_message', subject: { producer: 'model', message }, earlier: [], log: 'log_1', environment: 'env_1' }
const rows = []
function inspect(label, action) {
  try { rows.push({ label, ok: true, value: writeJsonLossless(action()) }) }
  catch (error) { rows.push({ label, ok: false, error: error.name, message: error.message }) }
}
rows.push({ label: 'wire-input-guard', value: isExtensionInput(input) })
inspect('wire-input-opaque', () => {
  const result = judgeInput(input)
  if ('rejected' in result) throw new Error(result.rejected)
  return readOpaqueJson(result.ok.subject.message.blocks[0].opaque)
})
const branded = judgeContentBlock({ ...thinking, opaque: toOpaqueJson(opaque.ok) })
if ('rejected' in branded) throw new Error(branded.rejected)
rows.push({ label: 'wire-return-guard', value: isToolReturn({ content: [thinking] }) })
inspect('branded-return-opaque', () => readOpaqueJson(toolResultOf({ content: [branded.ok] }, 'unused').content[0].opaque))
console.log(JSON.stringify({ node: process.version, rows }, null, 2))
if (rows.some(row => row.ok === false)) process.exitCode = 1
