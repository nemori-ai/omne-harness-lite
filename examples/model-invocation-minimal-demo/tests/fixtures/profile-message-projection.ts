import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import {
  checkAppendInput,
  checkSourceToken,
  factLogPayload,
  messageLogPayload,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import { attemptStartedPayload } from '@omne-harness-lite/session-runtime'
import {
  createProjectionCache,
  extendProjection,
  materializeMessages,
  projectMessages,
  releaseProjectionCache,
  type ProjectionInput,
  type ProjectionRules,
} from '@omne-harness-lite/model-message-projection'
import {
  createOfficialProfileContent,
  createOpenAiInputMeter,
  openaiConfiguration,
  openaiDefinitions,
  planRequest,
} from '@omne-harness-lite/pi-ai-transport'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'

const tenant = { organization: 'profile-org', account: 'profile-account' }
const at = '2026-10-07T00:00:00Z'
const visibility = { toHuman: true, toModel: true }
const rules: ProjectionRules = {
  version: 'profile-1',
  external: {
    agentDefinition: 'a1',
    assembly: 's1',
    systemPrompt: 'p1',
    contextGeneration: 'c1',
    modelProfile: 'm1',
    modalities: 'text',
    tools: 't1',
    parameters: 'v1',
  },
  system: [],
  pendingCardBlocks: [],
  lastModelRequestPrefixLength: 0,
}
const options = { limits: { entries: 8192, blocks: 8192, bytes: 32 * 1024 * 1024 } }
function message(value: unknown): Message {
  const result = judgeMessage(value)
  if ('rejected' in result) throw Error(result.rejected)
  return result.ok
}
function row(position: number, payload: unknown): LogEntry {
  const result = checkAppendInput(
    'profile-session',
    [{ tenant, readKeys: [], payload }],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in result || result.ok.entries[0] === undefined) throw Error('invalid profile row')
  return { ...result.ok.entries[0], session: result.ok.session, position }
}
function user(position: number): LogEntry {
  return row(
    position,
    messageLogPayload(
      message({
        id: `m${position}`,
        type: 'user',
        createdAt: at,
        blocks: [{ id: `b${position}`, kind: 'text', text: `request ${position}`, visibility }],
      }),
    ),
  )
}
function input(entries: readonly LogEntry[], selectedRules = rules): ProjectionInput {
  const result = checkSourceToken({
    tenant,
    session: 'profile-session',
    journalGeneration: 'profile-journal',
    tail: entries.length,
  })
  if ('failure' in result) throw Error('invalid profile source')
  return { source: result.ok, entries, rules: selectedRules }
}
function timed<T>(action: () => T) {
  const heap = process.memoryUsage().heapUsed,
    cpu = process.cpuUsage(),
    start = performance.now()
  const result = action()
  return {
    result,
    wallMs: performance.now() - start,
    cpuMicroseconds: process.cpuUsage(cpu),
    heapDeltaBytes: process.memoryUsage().heapUsed - heap,
  }
}
const definition = openaiDefinitions.find(value => value.modelId === 'openai/gpt-5.6-sol')
assert(definition, 'adopted exact OpenAI model definition is missing')
const official = createOfficialProfileContent(definition, {
  providers: ['openai'],
  allowFallback: false,
  configuration: openaiConfiguration,
})
assert('ok' in official)
const meter = createOpenAiInputMeter(definition)
const observations = []
for (const size of [256, 512, 1024]) {
  const entries = Array.from({ length: size }, (_, index) => user(index + 1))
  entries[1] = {
    ...row(
      2,
      attemptStartedPayload({
        kind: 'attempt_started',
        run: 'run-a',
        attempt: 1,
        reason: 'first',
        at,
      }),
    ),
    run: 'run-a',
    attempt: 1,
  }
  entries[2] = row(3, factLogPayload('profile-fact', '1', { secret: 'FACT_ONLY_MUST_NOT_BE_SENT' }))
  entries[3] = row(
    4,
    messageLogPayload(
      message({
        id: 'reminder',
        type: 'system_reminder',
        nature: 'event',
        source: { kind: 'extension', extension: 'profile-extension' },
        createdAt: at,
        blocks: [
          {
            id: 'reminder-block',
            kind: 'text',
            text: 'BUSINESS_REMINDER_MUST_BE_SENT',
            visibility,
          },
        ],
      }),
    ),
  )
  const fixed = input(entries),
    originalBytes = writeJsonLossless(fixed)
  const cold = timed(() => createProjectionCache(fixed, options))
  assert('ready' in cold.result)
  const first = cold.result
  const next = user(size + 1),
    hot = timed(() =>
      extendProjection(first.ready, { ...input([...entries, next]), entries: [next] }),
    )
  assert('projected' in hot.result)
  assert.equal(hot.result.projected.segments?.previous, first.projected.segments)
  assert.equal(hot.result.projected.workCounters.entries - first.projected.workCounters.entries, 1)
  const hotView = hot.result.projected
  const materialized = timed(() => materializeMessages(hotView))
  assert('materialized' in materialized.result)
  const messages = materialized.result.materialized
  assert.equal(messages.length, size - 1)
  const expectedIds = entries
    .filter(entry => (entry.payload as { kind?: string }).kind === 'message')
    .map(entry => (entry.payload as { value: { id: string } }).value.id)
  assert.deepEqual(
    messages.map(value => value.id),
    [...expectedIds, `m${size + 1}`],
  )
  assert.equal(writeJsonLossless(fixed), originalBytes)
  const changedRules = { ...rules, external: { ...rules.external!, tools: 't2' } },
    changed = input([...entries, next], changedRules)
  assert.deepEqual(extendProjection(first.ready, { ...changed, entries: [] }), {
    rebuildRequired: true,
    reason: 'external',
  })
  const rebuilt = timed(() => createProjectionCache(changed, options))
  assert('ready' in rebuilt.result)
  const reference = projectMessages(changed)
  assert('projected' in reference)
  assert.deepEqual(
    materializeMessages(rebuilt.result.projected),
    materializeMessages(reference.projected),
  )
  const request: PlanInput = {
    calibration: { kind: 'none', reason: 'no_observation' },
    outputHistory: [],
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('profile-call', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
    provider: 'openai',
    snapshot: {
      updatedAt: at,
      adaptation: official.ok.adaptation,
      providers: official.ok.providers,
      allowFallback: official.ok.allowFallback,
      inputModalities: official.ok.inputModalities,
      outputModalities: official.ok.outputModalities,
      maxInputTokens: official.ok.maxInputTokens,
      maxOutputTokens: official.ok.maxOutputTokens,
      inputConstraints: official.ok.inputConstraints,
      upstreamInputLimits: official.ok.upstreamInputLimits,
    },
    parameters: { maxOutputTokens: 128 },
    messages,
    tools: [],
  }
  const serializationStart = performance.now(),
    planned = await planRequest(request, [definition], meter, {
      signal: new AbortController().signal,
    })
  assert('planned' in planned, JSON.stringify(planned))
  const serialized = planned.planned.serialized
  assert(serialized.includes('BUSINESS_REMINDER_MUST_BE_SENT'))
  assert(!serialized.includes('FACT_ONLY_MUST_NOT_BE_SENT'))
  assert(!serialized.includes('attempt_started'))
  observations.push({
    size,
    cold: { ...cold, result: first.projected.workCounters },
    hot: { ...hot, result: hot.result.projected.workCounters },
    rebuild: { ...rebuilt, result: rebuilt.result.projected.workCounters },
    materialize: {
      ...materialized,
      result: { messages: messages.length, bytes: Buffer.byteLength(writeJsonLossless(messages)) },
    },
    serialization: {
      wallMs: performance.now() - serializationStart,
      bytes: Buffer.byteLength(serialized),
      model: definition.modelId,
      businessReminderPreserved: true,
      factsExcluded: true,
    },
  })
  assert.deepEqual(releaseProjectionCache(first.ready), { released: true })
  assert.deepEqual(releaseProjectionCache(rebuilt.result.ready), { released: true })
}
process.stdout.write(
  JSON.stringify(
    {
      observations,
      scope:
        'offline production projection/cache plus actual transport planning serialization; no HTTP; heap deltas include GC noise; timing does not prove asymptotic complexity',
    },
    null,
    2,
  ) + '\n',
)
