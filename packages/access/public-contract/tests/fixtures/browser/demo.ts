import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { exampleLimits, notesProtocol } from './example-protocol.ts'

for (const name of ['read-note', 'save-note'] as const) {
  const operation = notesProtocol.operations[name]
  console.log(`${name} (${operation.identity}, ${operation.effect}) outcomes:`)
  for (const [outcome, body] of Object.entries(operation.outcomes))
    console.log(`  ${outcome}${body === true ? '  (empty body, fixed)' : ''}`)
}

const { body } = notesProtocol.operations['save-note']
const written = body.write(
  { noteId: 'n-1', title: 'Plan', tags: ['draft', 'shared'], revision: '7' },
  exampleLimits,
)
if (!written.ok) throw new Error('the example body did not write')
const text = writeJsonText(written.value)
console.log(`save-note body written: ${text}`)
const parsed = readJsonText(text, exampleLimits)
if (parsed.kind !== 'ok') throw new Error('the written text did not read')
console.log(`save-note body read back: ${JSON.stringify(body.read(parsed.value, exampleLimits))}`)
const entries = parsed.value.kind === 'object' ? parsed.value.entries : []
const withEntry = (key: string, value: JsonValue): JsonValue => ({
  kind: 'object',
  entries: [...entries, { key, value }],
})
const duplicate = body.read(withEntry('title', { kind: 'string', value: 'Other' }), exampleLimits)
console.log(`duplicate key "title": ${JSON.stringify(duplicate)}`)
const extra = body.read(withEntry('admin', { kind: 'boolean', value: true }), exampleLimits)
console.log(`field outside the rule "admin": ${JSON.stringify(extra)}`)
