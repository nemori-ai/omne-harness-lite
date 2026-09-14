import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import Registry, { type Agent } from '@omne-harness-lite/agent/baseline'
import {
  createScope,
  NamedEntries,
  ScopedLayers,
  type Scope,
} from '@omne-harness-lite/scope/baseline'
import { snapshotJsonValue } from '@omne-harness-lite/values/baseline'
import { deadline } from '@omne-harness-lite/timeout/baseline'
import { createUserMessage, ToolCallId } from '@omne-harness-lite/llm/baseline'
import { Session, SessionId } from '@omne-harness-lite/session/baseline'
import {
  AssistantStreamAttempt,
  type SourceAssistantStreamFrame,
} from '@omne-harness-lite/agent-loop/baseline'
import {
  materializeAppendBatch,
  assertContiguous,
} from '@omne-harness-lite/session-persistence/baseline'
import {
  writeSyncedFile,
  appendSyncedBytes,
  readFirstLine,
  syncDirectory,
} from '@omne-harness-lite/jsonl/baseline'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolRuntime, defineTool } from '@omne-harness-lite/tools/baseline'
import { SystemPrompt, renderPrompt } from '@omne-harness-lite/system-prompt/baseline'

assert.deepEqual(snapshotJsonValue({ n: 1 }), { n: 1 })
const abort = new AbortController()
const timer = deadline(abort.signal, 1000, 'SOURCE_DEADLINE')
abort.abort('caller')
assert.equal(timer.signal.reason, 'caller')
timer[Symbol.dispose]()

const ctx = new Context()
const registry = await ctx.plugin(Registry)
const actor: Agent = { id: 'source-fixture', session: { id: 'source-fixture' }, ctx }
class Layer {
  named = new NamedEntries<string>(name => new Error(`duplicate ${name}`))
  isEmpty() {
    return this.named.isEmpty()
  }
}
const layers = new ScopedLayers(
  () => new Layer(),
  () => {},
)
let scoped!: Scope
const scopeOwner = await ctx.plugin((inner: Context) => {
  scoped = createScope(inner, actor)
})
let observed = 0
scoped.ctx.on('agent/created', () => {
  observed += 1
})
layers.effect(scoped.ctx, layer => layer.named.insert('entry', 'owned'), {
  label: 'source-fixture',
})
const detach = ctx.agents.register(actor)
assert.equal(observed, 1, 'agent dispatch and public scope must share one identity registry')
assert.equal(layers.merge(actor, layer => layer.named).get('entry'), 'owned')
assert.equal(layers.merge({}, layer => layer.named).size, 0)
const child: Agent = { id: 'child-fixture', session: { id: 'child-fixture' }, ctx }
const childScope = createScope(scoped.ctx, child, { parent: actor })
assert.equal(layers.merge(child, layer => layer.named).get('entry'), 'owned')
const detachChild = ctx.agents.register(child)
assert.equal(observed, 2, 'parent scoped listener receives child-scoped agent events')
await childScope.dispose()
await detachChild()
await scoped.dispose()
assert.equal(layers.peek(actor), undefined)
await detach()
await scopeOwner.dispose()
await registry.dispose()
console.log('PASS: built source helpers, shared agent scope routing and owned store teardown')

// Exercise only source mechanisms: the synchronous Session append is not a
// target durability acknowledgement, and these bytes are not a DR envelope.
const session = Session.create(SessionId('artifact-session'))
const message = createUserMessage({
  content: [{ type: 'text', text: 'artifact input' }],
  source: { kind: 'user' },
})
session.append('user/message', message, { surfaceOp: 'append' })
const frames: SourceAssistantStreamFrame[] = []
const attempt = new AssistantStreamAttempt(
  session.id,
  1,
  () => frames.length + 1,
  1,
  1,
  frame => frames.push(frame),
)
attempt.start()
attempt.push({ type: 'text-delta', index: 0, text: 'artifact output' })
attempt.settle(
  'assistant/attempt',
  () => session.append('assistant/attempt', { turn: 1, step: 1, stream: attempt.stream }).seq,
)
assert.equal(attempt.ended, true)
assert.equal(frames.at(-1)?.type, 'end')
assert.deepEqual(session.deriveMessages(), [message])
const batch = materializeAppendBatch(session.snapshotEvents())
assertContiguous(session.id, batch, 0)
const directory = await mkdtemp(join(tmpdir(), 'omne-source-io-'))
try {
  const path = join(directory, 'events.jsonl')
  const first = JSON.stringify(batch[0])
  const tail = batch
    .slice(1)
    .map(event => JSON.stringify(event) + '\n')
    .join('')
  await writeSyncedFile(path, first + '\n')
  await appendSyncedBytes(path, tail)
  await syncDirectory(directory)
  assert.equal(await readFirstLine(path), first)
  assert.equal(await readFile(path, 'utf8'), first + '\n' + tail)
} finally {
  await rm(directory, { recursive: true, force: true })
}
console.log('PASS: artifact LLM/Session/Loop/storage helpers and actual file I/O composition')

const services = new Context()
const toolService = await services.plugin(ToolRuntime)
const promptService = await services.plugin(SystemPrompt, { personaPrefix: '', personaSuffix: '' })
const contributions = await services.plugin(
  Object.assign(
    (owned: Context) => {
      owned.tools.register(
        defineTool({
          name: 'echo',
          description: 'source fixture',
          parameters: { text: { type: 'string', required: true } },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          async execute({ text }) {
            return text.toUpperCase()
          },
        }),
      )
      owned.systemPrompt.section({ name: 'fixture', order: 0, text: 'Available source tool' })
      owned.systemPrompt.tools(() => ({ schemas: owned.tools.schemas() }))
    },
    { inject: ['tools', 'systemPrompt'] },
  ),
)
try {
  const assembly = await services.systemPrompt.assemble()
  assert.equal(renderPrompt(assembly), 'Available source tool')
  assert.deepEqual(
    assembly.tools.map(tool => tool.name),
    ['echo'],
  )
  const result = await services.tools.execute({
    callId: ToolCallId('source-call'),
    name: 'echo',
    arguments: { text: 'hello' },
    signal: new AbortController().signal,
  })
  assert.equal(result.isError, false)
  assert.deepEqual(result.content, [{ type: 'text', text: 'HELLO' }])
  await contributions.dispose()
  assert.deepEqual(services.tools.schemas(), [])
  assert.deepEqual((await services.systemPrompt.assemble()).tools, [])
} finally {
  await contributions.dispose()
  await promptService.dispose()
  await toolService.dispose()
}
console.log('PASS: artifact prompt/tool contribution, native call and withdrawal')
