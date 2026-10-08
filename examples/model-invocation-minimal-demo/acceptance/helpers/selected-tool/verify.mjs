// Independent S118 / TE1/2/7/17/20/21 evidence oracle. Read only the new run.
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { sdk } from './sdk.mjs'
const directory = process.argv[2]
const JSONSDK = await sdk('packages/core/content-blocks')
const TOOL = await sdk('packages/core/tool-execution-runtime')
const DRIVER = await sdk('examples/model-invocation-minimal-demo')
const RUNNER = await sdk('packages/core/loop-extension-runner')
const MODEL = await sdk('packages/core/model-request-runtime')
const read = async name => {
  const parsed = JSONSDK.readJsonStrict(await readFile(join(directory, name), 'utf8'))
  assert.ok('ok' in parsed, 'Strict JSON must decode: ' + name)
  return parsed.ok
}
const equal = (left, right) =>
  assert.equal(JSONSDK.writeJsonLossless(left), JSONSDK.writeJsonLossless(right))
const result = await read('result.json')
const selection = await read('selection.json')
const input = await read('current-input.json')
const closed = await read('close.json')
const scope = result.prefix.scope
assert.equal(closed.complete, true)
assert.deepEqual(closed.errors, [])
assert.equal(result.status, 'PASS')
assert.equal(input.standing.standing, 'effective')
equal(input.tenant, scope.tenant)
const selected = selection.evaluation.ok.assets.filter(
  asset => asset.capability.category === 'tool',
)
assert.equal(selected.length, 1)
assert.equal(selected[0].asset, 'selected-tool-tenant')
assert.equal(JSONSDK.jsonNumberSource(selected[0].version), '1')
assert.deepEqual(selected[0].replaced, ['factory'])
assert.equal(selection.entry.asset, selected[0].asset)
equal(result.selected.definition, selection.entry.content.definition)
const checks = ['S118_unique_real_evaluation_and_registry_asset_version']
const db = new DatabaseSync(join(directory, 'state.sqlite'), { readOnly: true })
let raw, journal
try {
  raw = db
    .prepare(
      'SELECT session, position, batch, value FROM sl_entry WHERE session = ? ORDER BY position_length, position',
    )
    .all(scope.session)
  journal = db
    .prepare('SELECT session, generation, tail FROM sl_journal WHERE session = ?')
    .get(scope.session)
} finally {
  db.close()
}
const entries = raw.map(row => {
  const value = JSONSDK.readJsonStrict(row.value)
  const position = JSONSDK.readJsonStrict(row.position)
  assert.ok('ok' in value && 'ok' in position)
  return { ...value.ok, session: row.session, position: position.ok }
})
equal(entries, result.prefix.entries)
// SessionLog SPEC:12 distinguishes journalGeneration from physical ownerGeneration.
assert.equal(typeof journal.generation, 'string')
assert.ok(journal.generation.length > 0)
assert.equal(journal.tail, JSONSDK.jsonNumberSource(result.prefix.tail))
await writeFile(
  join(directory, 'raw-session-log.json'),
  JSON.stringify({ journal, entries: raw }, null, 2) + '\n',
)
const history = TOOL.projectToolJournal(scope, entries)
assert.ok(!('invalid' in history))
assert.equal(history.executions.size, 1)
const execution = history.executions.get(result.submitted.execution.callId)
assert.ok(execution.started && execution.terminal)
const tools = entries
  .map(entry => TOOL.inspectToolJournalEntry(scope, entry))
  .filter(value => 'value' in value)
for (const kind of ['execution_intended', 'execution_started', 'execution_ended']) {
  assert.equal(tools.filter(record => record.value.kind === kind).length, 1)
}
assert.ok(execution.intent.entry.position < execution.started.entry.position)
assert.ok(execution.started.entry.position < execution.terminal.entry.position)
assert.equal(execution.intent.value.selected.asset, selected[0].asset)
assert.equal(execution.intent.value.selected.version, '1')
equal(execution.intent.value.selected.definition, selection.entry.content.definition)
// intent.input is public JsonValue, not a public provider-envelope contract.
// Read the original call from its message owner through the public envelope codec.
const originalCalls = entries.flatMap(entry => {
  const decoded = MODEL.readModelLogEnvelope(entry.payload)
  assert.ok(!('failure' in decoded))
  if (decoded.kind !== 'model' || decoded.envelope.category !== 'message') return []
  const message = decoded.envelope.value
  if (message.type !== 'assistant') return []
  return message.blocks.filter(
    block => block.kind === 'tool_call' && block.callId === result.submitted.execution.callId,
  )
})
assert.equal(originalCalls.length, 1)
equal(originalCalls[0].arguments, result.calls[0].args)
equal(result.ended.snapshot.selected, execution.intent.value.selected)
checks.push('TE2_single_durable_intent_start_end_and_original_arguments')
const drivers = entries
  .map(entry => DRIVER.inspectDriverEntry(scope, entry))
  .filter(value => 'value' in value)
const adopted = drivers.filter(record => record.value.kind === 'attempt_adopted')
const completed = drivers.filter(record => record.value.kind === 'actions_completed')
assert.equal(adopted.length, 1)
assert.equal(completed.length, 1)
assert.equal(execution.intent.value.selected.adoption, adopted[0].value.adoption)
assert.equal(result.completion.completion.items.length, 1)
assert.equal(result.completion.completion.items[0].decision.kind, 'allow')
assert.equal(result.completion.admissions.length, 1)
const finals = entries
  .map(entry => ({ entry, parsed: RUNNER.inspectRunnerConclusion({ ...scope, entry }) }))
  .filter(value => 'conclusion' in value.parsed)
assert.equal(finals.length, 1)
assert.equal(finals[0].parsed.conclusion.position, 'before_action')
assert.equal(finals[0].parsed.conclusion.extension, 'omne-official:admission-judgment')
assert.equal(finals[0].entry.dedupeKey, result.completion.completion.items[0].decision.conclusion)
const completionEntry = entries.find(entry => entry.dedupeKey === result.completion.completion.key)
assert.ok(completionEntry)
assert.ok(
  finals[0].entry.position < completionEntry.position &&
    completionEntry.position < execution.intent.entry.position,
)
checks.push('TA_official_before_action_final_and_complete_prefix_precede_intent')
assert.equal(result.calls.length, 1)
assert.equal(result.calls[0].asset, 'selected-tool-tenant')
assert.deepEqual(
  (await readdir(directory)).filter(name => name.endsWith('.marker')),
  ['selected-tool-tenant.marker'],
)
const marker = await readFile(join(directory, 'selected-tool-tenant.marker'), 'utf8')
assert.equal(result.ended.snapshot.state.terminal.result, `${result.calls[0].args.text}:${marker}`)
assert.equal(execution.terminal.value.terminal.result, result.ended.snapshot.state.terminal.result)
equal(result.again.execution, result.submitted.execution)
checks.push(
  'S118_actual_selected_result_and_zero_unselected_effect',
  'TE1_repeat_identity_without_second_intent_or_effect',
)
assert.equal(result.paidRequests, 0)
checks.push('resources_original_close_complete')
await writeFile(
  join(directory, 'independent-verification.json'),
  JSON.stringify(
    {
      status: 'PASS',
      checks,
      rawEntryCount: entries.length,
      counts: {
        intent: 1,
        started: 1,
        ended: 1,
        author: 1,
        selectedMarkers: 1,
        unselectedMarkers: 0,
      },
      closeComplete: true,
      queryScope: 'Only this Session sl_entry/sl_journal; no credentials exported',
      paidHTTP: 0,
    },
    null,
    2,
  ) + '\n',
)
console.log('PASS: ' + checks.length + ' independent evidence checks')
