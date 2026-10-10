// covers: PF-006 S24, PF-006 S69
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'vitest'
import { type LogEntry } from '@omne-harness-lite/session-log'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { openScenario, observeRequests } from './pf006-host.ts'
import { array, journal, json, object, one, string, value } from './pf006-values.ts'

const nonceCommand = "tr -d '\\n-' < /proc/sys/kernel/random/uuid"

test('PF-006 S24/S69: formal CLI preserves ordinary results and continues with the actual nonce', async () => {
  const token = randomUUID()
  const prompt = `[acceptance ${token}] Call Shell help exactly once. Then call Shell execute exactly once with command ${JSON.stringify(nonceCommand)}. Reply with only the complete 32-character hexadecimal command output. Do not invent the value or call any other tool.`
  const scenario = await openScenario(token, prompt)
  try {
    const client = scenario.execute()
    const captured = await observeRequests(scenario.runtimeFile, token, client.finished)
    const result = await client.finished
    await writeFile(join(scenario.directory, 'client-result.json'), JSON.stringify(result), {
      mode: 0o600,
    })
    assert.equal(result.code, 0, 'formal machine client completes the original input')
    assert.equal(result.stderr, '')
    const report = object(json(result.stdout))
    assert.equal(report.format, 'omne-cli/1')
    const outcome = object(report.outcome)
    assert.equal(outcome.kind, 'session-message')
    assert.equal(outcome.status, 'completed')
    const session = string(object(outcome.request).session)
    const entries = journal(scenario.runtimeFile, session)
    await writeFile(join(scenario.directory, 'session-log.json'), writeJsonLossless(entries), {
      mode: 0o600,
    })
    const returned = verifyMessages(entries, prompt)
    await verifyResources(scenario.results, entries)
    verifyRequests(entries, captured, returned)
    await writeFile(
      join(scenario.directory, 'result.json'),
      JSON.stringify({
        status: 'PASS',
        session,
        returned,
        modelRequests: captured.size,
        criteria: ['PF-006 S24', 'PF-006 S69'],
        mode: 'formal-cli-real-openrouter',
      }),
      { mode: 0o600 },
    )
  } finally {
    await scenario.close()
  }
}, 180_000)

function matching(entries: readonly LogEntry[], kind: string) {
  return entries.filter(entry => value(entry).kind === kind)
}
function blocks(entry: LogEntry) {
  return array(value(entry).blocks).map(object)
}
function toolCalls(entries: readonly LogEntry[]) {
  return entries
    .filter(entry => value(entry).type === 'assistant')
    .flatMap(entry => blocks(entry).filter(block => block.kind === 'tool_call'))
}
function verifyMessages(entries: readonly LogEntry[], prompt: string): string {
  const calls = toolCalls(entries)
  assert.equal(calls.length, 2, 'exactly one help and one nonce execution')
  const help = one(
    calls.filter(call => object(call.arguments).command === 'help'),
    'one ordinary string-returning help call',
  )
  const execute = one(
    calls.filter(call => object(call.arguments).command === 'execute'),
    'one unpredictable nonce execution',
  )
  assert.equal(help.tool, 'Shell')
  assert.equal(execute.tool, 'Shell')
  assert.equal(object(object(execute.arguments).args).command, nonceCommand)
  const terminals = matching(entries, 'execution_ended')
  assert.equal(terminals.length, 2)
  const helpEnd = one(
    terminals.filter(entry => object(value(entry).ref).callId === help.callId),
    'one help terminal',
  )
  const executeEnd = one(
    terminals.filter(entry => object(value(entry).ref).callId === execute.callId),
    'one nonce terminal',
  )
  const helpResult = object(value(helpEnd).terminal)
  assert.equal(helpResult.outcome, 'completed')
  assert.ok(string(helpResult.result).startsWith('NAME\n'))
  const helpMessage = verifyToolMessage(entries, helpEnd)
  assert.equal(
    string(object(one(array(helpMessage.blocks), 'one help string block')).text),
    helpResult.result,
    'S24: the entire ordinary string is preserved',
  )
  const executeResult = object(value(executeEnd).terminal)
  assert.equal(executeResult.outcome, 'completed', 'S69: actual execution succeeds')
  const result = object(executeResult.result)
  const shell = object(json(string(object(one(array(result.content), 'one command result')).text)))
  assert.equal(object(shell.outcome).kind, 'completed')
  assert.equal(object(object(shell.outcome).exit).code, 0)
  const returned = string(
    object(one(array(object(shell.output).streams), 'one command output')).text,
  )
  assert.match(returned, /^[a-f0-9]{32}$/u)
  assert.ok(!prompt.includes(returned), 'nonce is not preloaded in the request')
  const executeMessage = verifyToolMessage(entries, executeEnd)
  assert.deepEqual(executeMessage.blocks, result.content, 'S69: actual command result is preserved')
  assert.equal(helpEnd.run, executeEnd.run)
  assert.ok(entries.indexOf(helpEnd) < entries.indexOf(executeEnd))
  const ending = one(matching(entries, 'run_finished'), 'one completed Run')
  assert.equal(value(ending).terminal, 'completed')
  assert.equal(ending.run, executeEnd.run)
  const final = one(
    entries.filter(
      entry =>
        value(entry).type === 'assistant' &&
        blocks(entry).some(block => block.kind === 'text') &&
        entries.indexOf(entry) > entries.indexOf(executeEnd),
    ),
    'one final assistant answer',
  )
  const answer = blocks(final)
    .filter(block => block.kind === 'text')
    .map(block => string(block.text))
    .join('')
    .trim()
  assert.equal(answer, returned, 'model continuation answers from the actual tool result')
  assert.equal(final.run, executeEnd.run)
  return returned
}
function verifyToolMessage(entries: readonly LogEntry[], ended: LogEntry) {
  const callId = object(value(ended).ref).callId
  const entry = one(
    entries.filter(entry => value(entry).type === 'tool' && value(entry).callId === callId),
    'one persisted ToolMessage for the original call',
  )
  assert.equal(entry.run, ended.run)
  assert.ok(entries.indexOf(ended) < entries.indexOf(entry))
  const result = object(one(blocks(entry), 'one tool_result'))
  assert.equal(result.kind, 'tool_result')
  assert.equal(result.outcome, 'completed')
  assert.equal(result.callId, callId)
  assert.deepEqual(object(value(ended).delivery).result, result)
  return result
}
async function verifyResources(directory: string, entries: readonly LogEntry[]) {
  const resources = await Promise.all(
    (await readdir(directory))
      .filter(file => file.endsWith('.json'))
      .map(async file => object(json(await readFile(join(directory, file), 'utf8')))),
  )
  for (const ended of matching(entries, 'execution_ended')) {
    const callId = object(value(ended).ref).callId
    const resource = one(
      resources.filter(
        item => item.kind === 'result' && object(object(item.value).ref).callId === callId,
      ),
      'one real durable result resource',
    )
    assert.deepEqual(
      object(object(resource.value).result).content,
      verifyToolMessage(entries, ended).blocks,
    )
  }
}
function verifyRequests(
  entries: readonly LogEntry[],
  captured: ReadonlyMap<string, unknown[]>,
  returned: string,
) {
  const created = matching(entries, 'model_call_created')
  assert.equal(
    created.length,
    3,
    'help, execution and final reply each use one actual model request',
  )
  assert.equal(captured.size, 3, 'capture all three real prepared request messages before release')
  assert.equal(
    matching(entries, 'model_call_acknowledged').length,
    3,
    'all original model results acknowledged',
  )
  for (const entry of created) assert.equal(entry.run, created[0]!.run)
  const requests = created.map(entry => {
    const input = captured.get(string(value(entry).call))
    assert.ok(input, 'capture the original call, not a substituted request')
    return input
  })
  assert.ok(!JSON.stringify(requests[0]).includes(returned), 'first request cannot know the nonce')
  assert.ok(
    !JSON.stringify(requests[1]).includes(returned),
    'execution request cannot know its future result',
  )
  assert.ok(
    JSON.stringify(requests[2]).includes(returned),
    'third actual request includes the unpredictable result',
  )
  for (const entry of entries.filter(entry => value(entry).type === 'tool')) {
    const message = value(entry)
    const capturedTool = one(
      requests[2]!
        .map(object)
        .filter(item => item.type === 'tool' && item.callId === message.callId),
      'one matching tool message reaches the continuation',
    )
    assert.deepEqual(
      capturedTool.blocks,
      message.blocks,
      'complete original result reaches the model',
    )
  }
}
