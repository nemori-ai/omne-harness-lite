import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import {
  judgeDefinition,
  judgePositionedSubject,
  type PositionedSubject,
  type Power,
} from '@omne-harness-lite/loop-extension'
import { judgeMessage, type LoggedMessage } from '@omne-harness-lite/messages'
import { encodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { openJsonlSessionLog, type SessionLog } from '@omne-harness-lite/session-log-jsonl'
import {
  runPass,
  createRunnerLogAdapter,
  createRunnerReminderLogAdapter,
  createRunnerTaskOwner,
  passKeys,
  type RunnerPorts,
  type RunnerPiece,
  type RunnerPass,
  type RunnerAskAssociation,
  type RunnerInvocationResult,
} from '@omne-harness-lite/loop-extension-runner'

// Controlled public-function scope. These are NOT production Run or waiting-owner facts.
// Oracles below transcribe LC6 S20/S21 and Runner5 policies, not implementation tables.
const at = '2026-09-29T00:00:00Z'
const parsedTenant = parseTenantId({
  organization: 'acceptance-org',
  account: 'acceptance-account',
})
const parsedSession = parseOpaqueIdentifier('acceptance-session', 'SessionRef')
const parsedLog = parseOpaqueIdentifier('acceptance-log', 'LogHandle')
const parsedEnv = parseOpaqueIdentifier('acceptance-env', 'EnvironmentHandle')
if (
  !('ok' in parsedTenant) ||
  !('ok' in parsedSession) ||
  !('ok' in parsedLog) ||
  !('ok' in parsedEnv)
)
  throw new Error('invalid scope')
const tenant = parsedTenant.ok,
  session = parsedSession.ok,
  logHandle = parsedLog.ok,
  environment = parsedEnv.ok
const binding = { tenant, session, logGeneration: 'acceptance-generation' }
const user = { id: 'message', type: 'user', blocks: [], createdAt: at }
const adaptation = {
  implementation: { name: 'vendor.family', revision: '1' },
  definition: { modelId: 'vendor/model', revision: '1' },
  configuration: { revision: '1', values: {} },
}
const profile = {
  providers: ['provider-a'],
  allowFallback: true,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 1000,
  maxOutputTokens: 100,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  adaptation,
  updatedAt: at,
}
const dispatch = {
  adaptation,
  kind: 'model_call_dispatched',
  call: 'model-call',
  dispatch: 1,
  provider: 'provider-a',
  response: 'response',
  profile: { origin: 'official', routeName: 'vendor/model' },
  profileSnapshot: profile,
  parameters: {},
  selectedBy: 'session',
  credentialScope: { layer: 'factory' },
}
const call = {
  id: 'call-block',
  kind: 'tool_call',
  complete: true,
  callId: 'call',
  tool: 'shell',
  arguments: { command: 'one' },
  visibility: { toHuman: true, toModel: true },
}
const toolResult = {
  id: 'result',
  kind: 'tool_result',
  callId: 'call',
  outcome: 'completed',
  blocks: [],
  visibility: { toHuman: true, toModel: true },
}
type Variant = {
  position: string
  dimension?: Record<string, string>
  subject: object
  mask: string
  callId?: string
}
const variants: Variant[] = [
  { position: 'attempt_started', subject: { attempt: 1 }, mask: '11000101' },
  {
    position: 'before_persist_message',
    subject: { message: user, producer: 'user' },
    mask: '11101000',
  },
  { position: 'after_persist_message', subject: { message: user }, mask: '11000101' },
  { position: 'before_compaction', subject: { plan: {} }, mask: '11001101' },
  {
    position: 'after_compaction',
    subject: {
      compaction: {
        id: 'compaction',
        type: 'compaction',
        blocks: [],
        silenced: [{ messageId: 'old', blockId: 'old-block' }],
        createdAt: at,
      },
    },
    mask: '11000101',
  },
  {
    position: 'before_model_call',
    subject: { request: { target: 'vendor/model', parameters: {}, messages: [], tools: [] } },
    mask: '11111101',
  },
  {
    position: 'after_model_call',
    dimension: { ending: 'complete_reply' },
    subject: {
      reply: {
        id: 'reply',
        type: 'assistant',
        response: 'response',
        ending: 'complete',
        blocks: [],
        createdAt: at,
      },
      usage: {
        input_tokens: 'unknown',
        output_tokens: 'unknown',
        cache_read_tokens: 'unknown',
        cache_write_tokens: 'unknown',
        source: 'none',
      },
      cost: { cost_usd: 'unknown', source: 'none' },
    },
    mask: '11000101',
  },
  {
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    subject: {
      failure: 'upstream_unavailable',
      profile,
      dispatches: [dispatch],
      retryConclusions: [],
    },
    mask: '11000111',
  },
  {
    position: 'before_action',
    subject: { call, definition: { name: 'shell' }, batch: ['call'] },
    callId: 'call',
    mask: '11101101',
  },
  {
    position: 'after_action',
    dimension: { scope: 'each' },
    subject: { callId: 'call', outcome: 'completed', result: toolResult },
    callId: 'call',
    mask: '11100101',
  },
  {
    position: 'after_action',
    dimension: { scope: 'batch' },
    subject: { outcomes: [{ callId: 'call', outcome: 'completed' }] },
    mask: '11000101',
  },
  { position: 'before_terminal', subject: { proposed: { state: 'completed' } }, mask: '11001101' },
  { position: 'after_terminal', subject: { terminal: { state: 'completed' } }, mask: '10000000' },
]
function positioned(v: Variant): PositionedSubject {
  const judged = judgePositionedSubject({
    position: v.position,
    ...(v.dimension ? { dimension: v.dimension } : {}),
    subject: v.subject,
  })
  if (!('ok' in judged)) throw new Error(`invalid fixture ${v.position}: ${judged.rejected}`)
  return judged.ok
}
function makePiece(
  v: Variant,
  name = 'extension',
  power: Power = 'veto',
  extra: object = {},
): RunnerPiece {
  const judged = judgeDefinition({
    name,
    position: v.position,
    ...(v.dimension ? { dimension: v.dimension } : {}),
    power,
    implementation: { kind: 'builtin', builtinName: name },
    ...extra,
  })
  if (!('ok' in judged)) throw new Error(`invalid definition ${judged.rejected}`)
  return { definition: judged.ok, power }
}
function makePass(v: Variant): RunnerPass {
  return {
    initial: positioned(v),
    anchor: v.position === 'before_persist_message' ? 'message' : 'anchor',
    execution:
      v.position === 'before_persist_message'
        ? { kind: 'noRun' }
        : { kind: 'withRun', run: 'controlled-run', attempt: 1 },
  }
}
function reminder(id = 'reminder', extension = 'extension') {
  const checked = judgeMessage({
    id,
    type: 'system_reminder',
    blocks: [],
    createdAt: at,
    nature: 'event',
    source: { kind: 'extension', extension },
  })
  if (!('ok' in checked) || checked.ok.type !== 'system_reminder')
    throw new Error('invalid reminder')
  return checked.ok
}
function outputs(v: Variant): object[] {
  return [
    { kind: 'observed' },
    { kind: 'inject', message: reminder() },
    { kind: 'rewrite', subject: v.subject },
    { kind: 'select_model', profile: 'vendor/alternate' },
    { kind: 'veto', reason: 'denied' },
    { kind: 'stop', reason: 'stop' },
    { kind: 'retry', plan: { provider: 'provider-a' } },
    {
      kind: 'ask',
      card: {
        explanation: 'choose',
        options: [{ id: 'yes', label: 'Yes' }],
        about: { position: v.position, ...(v.callId ? { callId: v.callId } : {}) },
      },
    },
  ]
}
const base = fileURLToPath(new URL('../../../../tmp/runner-public-acceptance/', import.meta.url))
async function fixture(v: Variant) {
  await mkdir(base, { recursive: true })
  const dir = await mkdtemp(join(base, 'jsonl-'))
  const ownership = {
    current: `acceptance-${process.pid}`,
    observeExit: async () => 'unknown' as const,
  }
  const log = await openJsonlSessionLog({ dir, processOwnership: ownership })
  const owner = createRunnerTaskOwner(binding)
  const pass = makePass(v)
  let currentSubject = pass.initial
  const counts = { invoke: 0, opened: 0, released: 0, now: 0, mint: 0, capability: 0, verified: 0 }
  const adapter = createRunnerLogAdapter({
    log,
    binding,
    owner,
    subjectForCandidate: () => currentSubject,
  })
  const readMessagePrefix = async (): Promise<readonly LoggedMessage[] | { unavailable: true }> => {
    const read = await log.readSince(session, 0)
    if (!('entries' in read)) return { unavailable: true }
    const result: LoggedMessage[] = []
    for (const entry of read.entries) {
      const payload = entry.payload as { category?: string; value?: unknown }
      if (payload.category !== 'message') continue
      const checked = judgeMessage(payload.value)
      if (!('ok' in checked) || checked.ok.type === 'system') return { unavailable: true }
      result.push(checked.ok)
    }
    return result
  }
  const shared = createRunnerReminderLogAdapter({ log, binding, owner, readMessagePrefix })
  const ports: RunnerPorts = {
    ...adapter,
    readAskState: async () => ({ kind: 'unavailable' }),
    presence: async () => 'present',
    openHandles: async () => {
      counts.opened++
      return {
        log: logHandle,
        environment,
        release: () => {
          counts.released++
        },
      }
    },
    invoke: async (_piece, input) => {
      counts.invoke++
      const judged = judgePositionedSubject({
        position: input.position,
        ...(input.dimension ? { dimension: input.dimension } : {}),
        subject: input.subject,
      })
      if ('ok' in judged) currentSubject = judged.ok
      return { kind: 'output', value: { kind: 'observed' } }
    },
    // Controlled equality binding ONLY: real runtime same-prefix verification is out of scope.
    verifyFailure: async subject => {
      counts.verified++
      return { kind: 'verified', subject, release() {} }
    },
    judgeCapabilities: async () => {
      counts.capability++
      return { kind: 'accepted' }
    },
    now: () => {
      counts.now++
      return at
    },
    mintReminder: () => {
      counts.mint++
      return `error-reminder-${counts.mint}`
    },
    isActive: () => true,
    fallbackNeedsProjection: async () => false,
    reminders: { ...shared, nestedChain: async () => [] },
  }
  return {
    dir,
    ownership,
    log,
    owner,
    pass,
    ports,
    counts,
    adapter,
    setSubject: (s: PositionedSubject) => {
      currentSubject = s
    },
    async close() {
      owner.closeAdmission()
      await log.close()
      // Cleanup must retain a semantic assertion failure even for a deliberately bad mutant.
      // Recovery reads are admitted only after the actual physical log close above.
      if (owner.hasUnknown(binding)) {
        const recovered = await openJsonlSessionLog({ dir, processOwnership: ownership })
        try {
          await owner.reconcileStoppedLog({
            binding,
            readByKey: async key => {
              const read = await recovered.readByKey(session, key)
              return 'entries' in read ? read.entries : { unavailable: true }
            },
          })
        } finally {
          await recovered.close()
        }
      }
      await owner.drain()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
const signal = () => new AbortController().signal
const powers: { power: Power; mask: string }[] = [
  { power: 'observe', mask: '10000000' },
  { power: 'rewrite', mask: '11110010' },
  { power: 'veto', mask: '11111111' },
]

describe('independent LC6 S20/S21 matrix through built public runPass and real JSONL', () => {
  for (const [vi, v] of variants.entries())
    for (const { power, mask } of powers)
      for (const [oi, output] of outputs(v).entries()) {
        it(`V6-1/6 position${vi + 1} ${v.position} ${JSON.stringify(v.dimension ?? {})} ${power} output${oi + 1}`, async () => {
          const f = await fixture(v)
          const p = { ...makePiece(v, 'extension', power), onError: 'ignore' as const }
          const expectedRejection =
            mask[oi] !== '1'
              ? 'output_not_allowed_for_power'
              : oi === 7 && ['before_persist_message', 'after_terminal'].includes(v.position)
                ? 'ask_at_forbidden_position'
                : v.mask[oi] !== '1'
                  ? 'output_not_allowed_at_position'
                  : undefined
          try {
            const result = await runPass(
              f.pass,
              [p],
              { ...f.ports, invoke: async () => ({ kind: 'output', value: output }) },
              signal(),
            )
            const expectedEffect = expectedRejection
              ? 'proceed'
              : ((
                  { veto: 'vetoed', stop: 'stopped', retry: 'retry', ask: 'asked' } as Record<
                    string,
                    string
                  >
                )[(output as { kind: string }).kind] ?? 'proceed')
            expect(result).toMatchObject({ effect: { kind: expectedEffect } })
            if (!('conclusions' in result)) throw new Error('no conclusion')
            expect(result.conclusions).toHaveLength(1)
            if (expectedRejection)
              expect(result.conclusions[0]).toMatchObject({
                skipped: 'errored',
                error: expectedRejection,
                output: { kind: 'observed' },
              })
            else expect(result.conclusions[0]).toMatchObject({ output })
            expect(f.counts.capability).toBe(expectedRejection ? 0 : 1)
            const saved = await f.log.readSince(session, 0)
            expect('entries' in saved && saved.entries.length).toBe(
              expectedRejection || oi !== 1 ? 1 : 2,
            )
          } finally {
            await f.close()
          }
        })
      }
})

describe('independent policies and propagation', () => {
  for (const classification of ['nonzero_exit', 'timeout', 'bad_output'] as const)
    it(`V6-1 command ${classification} always records errored observed`, async () => {
      const v = variants[1]!,
        f = await fixture(v)
      const piece = makePiece(v, 'compat', 'veto', {
        onError: 'treat_as_veto',
        implementation: {
          kind: 'command',
          host: 'codex',
          dialect: 'test',
          event: 'test',
          command: 'not-executed-by-this-controlled-port',
        },
      })
      try {
        expect(
          await runPass(
            f.pass,
            [piece],
            {
              ...f.ports,
              invoke: async () => ({ kind: 'errored', error: 'command_failed', classification }),
            },
            signal(),
          ),
        ).toMatchObject({
          effect: { kind: 'proceed' },
          conclusions: [{ skipped: 'errored', output: { kind: 'observed' } }],
        })
        expect(f.counts.mint).toBe(0)
      } finally {
        await f.close()
      }
    })
  for (const narrowed of [false, true])
    it(`V6-1 unavailable declared veto honors narrowed=${narrowed}`, async () => {
      const v = variants[1]!,
        f = await fixture(v)
      const p = makePiece(v, 'absent', 'veto', { unavailability: 'veto' })
      try {
        expect(
          await runPass(
            f.pass,
            [{ ...p, power: narrowed ? 'observe' : 'veto' }],
            { ...f.ports, presence: async () => 'absent' },
            signal(),
          ),
        ).toMatchObject({
          effect: { kind: narrowed ? 'proceed' : 'vetoed' },
          conclusions: [{ skipped: 'unavailable', unavailability: narrowed ? 'skip' : 'veto' }],
        })
        expect(f.counts.opened).toBe(0)
      } finally {
        await f.close()
      }
    })
  for (const mode of ['absent', 'notStarted', 'unreadable'] as const)
    it(`V6-1 distinguishes ${mode} from ordinary errors`, async () => {
      const v = variants[1]!,
        f = await fixture(v)
      try {
        const result = await runPass(
          f.pass,
          [makePiece(v)],
          {
            ...f.ports,
            presence: async () =>
              mode === 'absent' ? 'absent' : mode === 'unreadable' ? 'unavailable' : 'present',
            invoke: async () => ({ kind: 'notStartedUnavailable' }),
          },
          signal(),
        )
        expect(result).toMatchObject(
          mode === 'unreadable'
            ? { failure: 'unavailable' }
            : {
                effect: { kind: 'proceed' },
                conclusions: [{ skipped: 'unavailable', unavailability: 'skip' }],
              },
        )
        expect(f.counts.mint).toBe(0)
      } finally {
        await f.close()
      }
    })
  for (const config of [
    { vi: 1, fallback: 'modality', name: 'modality', needed: true, expected: 'vetoed' },
    { vi: 1, fallback: 'modality', name: 'modality', needed: false, expected: 'proceed' },
    { vi: 7, fallback: 'retry', name: 'omne-official:default-retry', expected: 'proceed' },
    { vi: 8, fallback: 'admission', name: 'omne-official:admission-judgment', expected: 'vetoed' },
    { vi: 6, fallback: 'loop', name: 'loop', expected: 'proceed' },
    { vi: 9, fallback: 'offload', name: 'omne-official:offload-judgment', expected: 'proceed' },
  ] as const)
    it(`V6-1 fallback ${config.fallback} ${'needed' in config ? config.needed : ''}`, async () => {
      const v = variants[config.vi]!,
        f = await fixture(v),
        p = makePiece(v, config.name, config.fallback === 'retry' ? 'rewrite' : 'veto')
      try {
        expect(
          await runPass(
            f.pass,
            [{ ...p, fallback: config.fallback }],
            {
              ...f.ports,
              presence: async () => 'absent',
              fallbackNeedsProjection: async () => 'needed' in config && config.needed,
            },
            signal(),
          ),
        ).toMatchObject({
          effect: { kind: config.expected },
          conclusions: [{ skipped: 'unavailable', unavailability: 'fallback' }],
        })
        expect(f.counts.opened).toBe(0)
      } finally {
        await f.close()
      }
    })
  for (const vi of [1, 2, 12])
    for (const policy of ['ignore', 'record', 'treat_as_veto'] as const) {
      it(`V6-1 ordinary error policy ${policy} at ${variants[vi]!.position}`, async () => {
        const v = variants[vi]!,
          f = await fixture(v)
        try {
          const result = await runPass(
            f.pass,
            [{ ...makePiece(v), onError: policy }],
            { ...f.ports, invoke: async () => ({ kind: 'errored', error: 'ordinary_error' }) },
            signal(),
          )
          const effect =
            vi === 12 || policy !== 'treat_as_veto' ? 'proceed' : vi === 1 ? 'vetoed' : 'stopped'
          expect(result).toMatchObject({
            effect: { kind: effect },
            conclusions: [{ skipped: 'errored', error: 'ordinary_error' }],
          })
          expect(f.counts.mint).toBe(policy === 'record' && vi !== 12 ? 1 : 0)
        } finally {
          await f.close()
        }
      })
    }
  for (const failure of ['unavailable', 'invalidInput'] as const)
    it(`V6-1 capability ${failure} is not contributor error`, async () => {
      const v = variants[1]!,
        f = await fixture(v)
      try {
        expect(
          await runPass(
            f.pass,
            [makePiece(v)],
            { ...f.ports, judgeCapabilities: async () => ({ kind: failure }) },
            signal(),
          ),
        ).toEqual({ failure })
        expect(await f.log.readSince(session, 0)).toEqual({ entries: [], tail: 0 })
        expect(f.counts.mint).toBe(0)
      } finally {
        await f.close()
      }
    })
  it('V6-1 accumulates rewrite/select_model/rewrite and replays the original without reinvocation', async () => {
    const v = variants[5]!,
      f = await fixture(v),
      inputs: unknown[] = []
    const chain = ['one', 'two', 'three'].map(name => makePiece(v, name, 'rewrite'))
    const ports: RunnerPorts = {
      ...f.ports,
      invoke: async (p, input) => {
        inputs.push(input)
        const current = judgePositionedSubject({
          position: input.position,
          ...(input.dimension ? { dimension: input.dimension } : {}),
          subject: input.subject,
        })
        if (!('ok' in current) || current.ok.position !== 'before_model_call')
          throw new Error('unexpected input')
        f.setSubject(current.ok)
        if (p.definition.name === 'two')
          return { kind: 'output', value: { kind: 'select_model', profile: 'vendor/alternate' } }
        return {
          kind: 'output',
          value: {
            kind: 'rewrite',
            subject: {
              request: {
                ...current.ok.subject.request,
                parameters: { temperature: p.definition.name === 'one' ? 0.2 : 0.8 },
              },
            },
          },
        }
      },
    }
    try {
      const first = await runPass(f.pass, chain, ports, signal())
      expect(first).toMatchObject({
        effect: { kind: 'proceed', subject: { request: { target: 'vendor/alternate' } } },
      })
      expect(inputs).toHaveLength(3)
      expect(inputs[2]).toMatchObject({
        earlier: [{ extension: 'one' }, { extension: 'two' }],
        subject: { request: { target: 'vendor/alternate' } },
      })
      expect(await runPass(f.pass, chain, ports, signal())).toEqual(first)
      expect(inputs).toHaveLength(3)
    } finally {
      await f.close()
    }
  })
  for (const nestedOutput of ['veto', 'inject'] as const)
    it(`V6-6 nested ${nestedOutput} stays one level and leaves outer effect intact`, async () => {
      const v = variants[1]!,
        f = await fixture(v),
        injected = reminder('outer-reminder', 'outer')
      let invocations = 0
      const nested = makePiece(v, 'nested')
      const ports: RunnerPorts = {
        ...f.ports,
        invoke: async (piece, input) => {
          invocations++
          const current = judgePositionedSubject({
            position: input.position,
            ...(input.dimension ? { dimension: input.dimension } : {}),
            subject: input.subject,
          })
          if ('ok' in current) f.setSubject(current.ok)
          return {
            kind: 'output',
            value:
              piece.definition.name === 'outer'
                ? { kind: 'inject', message: injected }
                : nestedOutput === 'veto'
                  ? { kind: 'veto', reason: 'nested denial' }
                  : { kind: 'inject', message: reminder('recursive-reminder', 'nested') },
          }
        },
        reminders: { ...f.ports.reminders, nestedChain: async () => [nested] },
      }
      try {
        const result = await runPass(f.pass, [makePiece(v, 'outer', 'rewrite')], ports, signal())
        expect(result).toMatchObject({ effect: { kind: 'proceed' } })
        expect(invocations).toBe(2)
        const key = encodeModelLogKey({ kind: 'message', message: injected.id })
        if (!('ok' in key)) throw new Error('key')
        expect(await f.log.readByKey(session, key.ok)).toMatchObject({ entries: [] })
        const all = await f.log.readSince(session, 0)
        expect('entries' in all && all.entries).toHaveLength(2)
      } finally {
        await f.close()
      }
    })
})

describe('independent ownership and physical recovery', () => {
  for (const v of variants)
    it(`V6-1 rejects illegal dimension before any source at ${v.position} ${JSON.stringify(v.dimension ?? {})}`, async () => {
      const f = await fixture(v)
      let reads = 0
      try {
        const { dimension: _dimension, ...without } = f.pass.initial
        const invalid = v.dimension
          ? without
          : { ...without, dimension: { unexpected: 'dimension' } }
        expect(
          await runPass(
            { ...f.pass, initial: invalid as PositionedSubject },
            [],
            {
              ...f.ports,
              readConclusions: async pass => {
                reads++
                return f.ports.readConclusions(pass)
              },
            },
            signal(),
          ),
        ).toEqual({ failure: 'invalidInput' })
        expect(reads).toBe(0)
        expect(f.counts.invoke).toBe(0)
      } finally {
        await f.close()
      }
    })
  it('V6-7/X5-1 old conclusion precedes new attempt and is adopted without reinvocation', async () => {
    const v = variants[2]!,
      f = await fixture(v),
      chain = [makePiece(v)]
    try {
      const first = await runPass(f.pass, chain, f.ports, signal())
      expect(first).toMatchObject({ effect: { kind: 'proceed' } })
      const replayed = await runPass(
        { ...f.pass, execution: { kind: 'withRun', run: 'controlled-run', attempt: 2 } },
        chain,
        f.ports,
        signal(),
      )
      expect(replayed).toEqual(first)
      expect(f.counts.invoke).toBe(1)
      expect(await f.log.readSince(session, 0)).toMatchObject({ tail: 1 })
    } finally {
      await f.close()
    }
  })
  it('V6-7/X5-1 newer actual fenced write prevents a late old runner append', async () => {
    const v = variants[2]!,
      f = await fixture(v),
      chain = [makePiece(v)]
    let entered!: () => void, release!: () => void
    const start = new Promise<void>(resolve => {
        entered = resolve
      }),
      gate = new Promise<void>(resolve => {
        release = resolve
      })
    try {
      const pending = runPass(
        f.pass,
        chain,
        {
          ...f.ports,
          invoke: async () => {
            entered()
            await gate
            return { kind: 'output', value: { kind: 'observed' } }
          },
        },
        signal(),
      )
      await start
      // A controlled physical fence watermark; no claim of production Run provenance.
      expect(
        await f.log.append(
          session,
          [
            {
              tenant,
              run: 'controlled-run',
              attempt: 2,
              dedupeKey: 'new-attempt',
              readKeys: [],
              payload: { controlledAttempt: 2 },
            },
          ],
          { kind: 'fenced', run: 'controlled-run', attempt: 2 },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      release()
      expect(await pending).toEqual({ failure: 'attemptSuperseded' })
      const keys = passKeys({
        position: v.position as PositionedSubject['position'],
        anchor: f.pass.anchor,
      })
      if ('invalidInput' in keys) throw new Error('keys')
      expect(await f.log.readByKey(session, keys.pass)).toMatchObject({ entries: [] })
    } finally {
      release()
      await f.close()
    }
  })
  for (const runnerFirst of [true, false])
    it(`V6-7/X5-2 actual tailEquals order runnerFirst=${runnerFirst}`, async () => {
      const v = variants[2]!,
        f = await fixture(v),
        chain = [makePiece(v)]
      const response = () =>
        f.log.append(
          session,
          [
            {
              tenant,
              run: 'controlled-run',
              attempt: 1,
              dedupeKey: 'controlled-response',
              readKeys: [],
              payload: { controlledResponse: true },
            },
          ],
          { kind: 'fenced', run: 'controlled-run', attempt: 1 },
          { kind: 'tailEquals', tail: 0 },
        )
      try {
        if (runnerFirst) {
          expect(await runPass(f.pass, chain, f.ports, signal())).toMatchObject({
            effect: { kind: 'proceed' },
          })
          expect(await response()).toMatchObject({ failure: 'tailChanged' })
          expect(await f.log.readSince(session, 0)).toMatchObject({ tail: 1 })
        } else {
          expect(await response()).toHaveProperty('positions')
          expect(await runPass(f.pass, chain, f.ports, signal())).toMatchObject({
            effect: { kind: 'proceed' },
          })
          expect(await f.log.readSince(session, 0)).toMatchObject({ tail: 2 })
        }
      } finally {
        await f.close()
      }
    })
  it('V6-1 fractional Run attempt fails before invoking or reading sources', async () => {
    const v = variants[2]!,
      f = await fixture(v)
    let reads = 0
    try {
      const result = await runPass(
        { ...f.pass, execution: { kind: 'withRun', run: 'controlled-run', attempt: 1.5 } },
        [makePiece(v)],
        {
          ...f.ports,
          readConclusions: async pass => {
            reads++
            return f.ports.readConclusions(pass)
          },
        },
        signal(),
      )
      expect(result).toEqual({ failure: 'invalidInput' })
      expect(reads).toBe(0)
      expect(f.counts.invoke).toBe(0)
      expect(await f.log.readSince(session, 0)).toEqual({ entries: [], tail: 0 })
    } finally {
      await f.close()
    }
  })
  for (const failure of ['unavailable', 'invalidInput'] as const)
    it(`V6-8 failure source ${failure} aborts before reading conclusions`, async () => {
      const v = variants[7]!,
        f = await fixture(v)
      let reads = 0
      try {
        expect(
          await runPass(
            f.pass,
            [makePiece(v)],
            {
              ...f.ports,
              readConclusions: async pass => {
                reads++
                return f.ports.readConclusions(pass)
              },
              verifyFailure: async () => ({ kind: failure }),
            },
            signal(),
          ),
        ).toEqual({ failure })
        expect(reads).toBe(0)
        expect(f.counts.invoke).toBe(0)
      } finally {
        await f.close()
      }
    })
  it('V6-8 source may not replace the original complete failure subject', async () => {
    const v = variants[7]!,
      f = await fixture(v)
    let released = 0
    try {
      expect(
        await runPass(
          f.pass,
          [makePiece(v)],
          {
            ...f.ports,
            verifyFailure: async subject => ({
              kind: 'verified',
              subject: {
                ...subject,
                subject: { ...v.subject, statusCode: 503 },
              } as PositionedSubject,
              release() {
                released++
              },
            }),
          },
          signal(),
        ),
      ).toEqual({ failure: 'invalidInput' })
      expect(released).toBe(1)
      expect(f.counts.invoke).toBe(0)
    } finally {
      await f.close()
    }
  })
  it('V6-6 inherits a real outer fence for a system reminder while hiding Run from nested input', async () => {
    const v = variants[2]!,
      f = await fixture(v),
      nestedV = variants[1]!,
      inputs: unknown[] = []
    try {
      const result = await runPass(
        f.pass,
        [makePiece(v)],
        {
          ...f.ports,
          invoke: async (piece, input) => {
            inputs.push(input)
            const current = judgePositionedSubject({
              position: input.position,
              ...(input.dimension ? { dimension: input.dimension } : {}),
              subject: input.subject,
            })
            if (!('ok' in current)) throw new Error('input')
            f.setSubject(current.ok)
            return {
              kind: 'output',
              value:
                piece.definition.name === 'nested'
                  ? { kind: 'observed' }
                  : { kind: 'inject', message: reminder() },
            }
          },
          reminders: {
            ...f.ports.reminders,
            nestedChain: async () => [makePiece(nestedV, 'nested', 'observe')],
          },
        },
        signal(),
      )
      expect(result).toMatchObject({ effect: { kind: 'proceed' } })
      expect(inputs).toHaveLength(2)
      expect(inputs[1]).not.toHaveProperty('run')
      expect(inputs[1]).not.toHaveProperty('attempt')
      const persisted = await f.log.readSince(session, 0)
      if (!('entries' in persisted)) throw new Error('read')
      expect(persisted.entries).toHaveLength(3)
      for (const entry of persisted.entries)
        expect(entry).toMatchObject({ run: 'controlled-run', attempt: expect.anything() })
    } finally {
      await f.close()
    }
  })
  it('V6-1 external system withRun is rejected before effects', async () => {
    const v = { ...variants[1]!, subject: { message: reminder(), producer: 'system' } },
      f = await fixture(v)
    try {
      expect(
        await runPass(
          { ...f.pass, execution: { kind: 'withRun', run: 'controlled-run', attempt: 1 } },
          [],
          f.ports,
          signal(),
        ),
      ).toEqual({ failure: 'invalidInput' })
      expect(await f.log.readSince(session, 0)).toEqual({ entries: [], tail: 0 })
    } finally {
      await f.close()
    }
  })
  for (const returned of ['pending', 'ready'] as const)
    it(`V6-5 cancellation while waiting source resolves ${returned} prevents any reinvocation`, async () => {
      const v = variants[2]!,
        f = await fixture(v),
        chain = [makePiece(v)],
        controller = new AbortController()
      let markEntered!: () => void,
        release!: () => void,
        invoked = 0,
        bindingReleased = 0
      const entered = new Promise<void>(resolve => {
          markEntered = resolve
        }),
        gate = new Promise<void>(resolve => {
          release = resolve
        })
      const ports: RunnerPorts = {
        ...f.ports,
        invoke: async () => {
          invoked++
          return { kind: 'output', value: outputs(v)[7] }
        },
      }
      try {
        await runPass(f.pass, chain, ports, signal())
        const pending = runPass(
          f.pass,
          chain,
          {
            ...ports,
            readAskState: async association => {
              markEntered()
              await gate
              return returned === 'pending'
                ? { kind: 'pending', association }
                : {
                    kind: 'ready',
                    binding: {
                      association,
                      cardId: 'card',
                      batchId: 'batch',
                      answerId: 'answer',
                      control: () => 'valid',
                      release() {
                        bindingReleased++
                      },
                    },
                  }
            },
          },
          controller.signal,
        )
        await entered
        controller.abort()
        release()
        expect(await pending).toEqual({ failure: 'cancelled' })
        expect(invoked).toBe(1)
        expect(f.counts.opened).toBe(1)
        expect(bindingReleased).toBe(returned === 'ready' ? 1 : 0)
        expect(await f.log.readSince(session, 0)).toMatchObject({ tail: 1 })
      } finally {
        release()
        await f.close()
      }
    })
  it('V6-5 cancellation retains an admitted real JSONL append until completion and suppresses next piece', async () => {
    const v = variants[1]!,
      f = await fixture(v),
      controller = new AbortController()
    let markEntered!: () => void,
      release!: () => void,
      invoked = 0
    const entered = new Promise<void>(resolve => {
        markEntered = resolve
      }),
      gate = new Promise<void>(resolve => {
        release = resolve
      })
    const delayed: SessionLog = {
      readByKey: f.log.readByKey,
      readSince: f.log.readSince,
      append: async (...args) => {
        markEntered()
        await gate
        return f.log.append(...args)
      },
    }
    const adapter = createRunnerLogAdapter({
      log: delayed,
      owner: f.owner,
      binding,
      subjectForCandidate: () => f.pass.initial,
    })
    try {
      const pending = runPass(
        f.pass,
        [makePiece(v, 'first'), makePiece(v, 'next')],
        {
          ...f.ports,
          ...adapter,
          invoke: async () => {
            invoked++
            return { kind: 'output', value: { kind: 'observed' } }
          },
        },
        controller.signal,
      )
      await entered
      controller.abort()
      expect(await pending).toEqual({ failure: 'cancelled' })
      f.owner.closeAdmission()
      let drained = false
      const draining = f.owner.drain().then(() => {
        drained = true
      })
      await Promise.resolve()
      expect(drained).toBe(false)
      release()
      await draining
      expect(invoked).toBe(1)
      expect(await f.log.readSince(session, 0)).toMatchObject({ tail: 1 })
    } finally {
      release()
      await f.close()
    }
  })
  for (const winner of ['same', 'different', 'absent'] as const)
    it(`V6-7 unknown cannot reinvoke, physical close/reopen resolves ${winner}`, async () => {
      const v = variants[1]!,
        f = await fixture(v),
        chain = [makePiece(v)]
      let invoked = 0
      const lostReceipt: SessionLog = {
        readByKey: f.log.readByKey,
        readSince: f.log.readSince,
        append: async (s, entries, fence, condition) => {
          if (winner !== 'absent') {
            if (winner === 'same')
              expect(await f.log.append(s, entries, fence, condition)).toHaveProperty('positions')
            else {
              const result = await runPass(
                f.pass,
                chain,
                {
                  ...f.ports,
                  invoke: async () => ({
                    kind: 'output',
                    value: { kind: 'veto', reason: 'legal competitor' },
                  }),
                  now: () => '2026-09-29T00:00:01Z',
                },
                signal(),
              )
              expect(result).toMatchObject({ effect: { kind: 'vetoed' } })
            }
          }
          return { failure: 'unavailable' }
        },
      }
      const adapter = createRunnerLogAdapter({
        log: lostReceipt,
        owner: f.owner,
        binding,
        subjectForCandidate: () => f.pass.initial,
      })
      const ports: RunnerPorts = {
        ...f.ports,
        ...adapter,
        invoke: async () => {
          invoked++
          return { kind: 'output', value: { kind: 'observed' } }
        },
      }
      try {
        expect(await runPass(f.pass, chain, ports, signal())).toEqual({ failure: 'unavailable' })
        expect(f.owner.hasUnknown(binding)).toBe(true)
        expect(await runPass(f.pass, chain, ports, signal())).toEqual({ failure: 'unavailable' })
        expect(invoked).toBe(1)
        let drained = false
        const draining = f.owner.drain().then(() => {
          drained = true
        })
        await Promise.resolve()
        expect(drained).toBe(false)
        f.owner.closeAdmission()
        await f.log.close()
        const reopened = await openJsonlSessionLog({ dir: f.dir, processOwnership: f.ownership })
        try {
          expect(
            await f.owner.reconcileStoppedLog({
              binding: { ...binding, logGeneration: 'other' },
              readByKey: async () => [],
            }),
          ).toEqual({ unavailable: true })
          const recovery = await f.owner.reconcileStoppedLog({
            binding,
            readByKey: async key => {
              const read = await reopened.readByKey(session, key)
              return 'entries' in read ? read.entries : { unavailable: true }
            },
          })
          expect(recovery).toMatchObject([{ kind: winner === 'different' ? 'winner' : winner }])
          await draining
          const nextBinding = { ...binding, logGeneration: 'reopened' },
            nextOwner = createRunnerTaskOwner(nextBinding)
          const nextAdapter = createRunnerLogAdapter({
            log: reopened,
            binding: nextBinding,
            owner: nextOwner,
            subjectForCandidate: () => f.pass.initial,
          })
          try {
            const result = await runPass(f.pass, chain, { ...ports, ...nextAdapter }, signal())
            expect(result).toMatchObject({
              effect: { kind: winner === 'different' ? 'vetoed' : 'proceed' },
            })
            expect(invoked).toBe(winner === 'absent' ? 2 : 1)
          } finally {
            nextOwner.closeAdmission()
            await nextOwner.drain()
          }
        } finally {
          await reopened.close()
        }
      } finally {
        await f.close()
      }
    })
})

describe('independent controlled waiting source with durable JSONL asks', () => {
  function replay(
    association: RunnerAskAssociation,
    control: () => 'valid' | 'replayInconsistent' | 'unavailable' = () => 'valid',
  ) {
    return {
      association,
      cardId: 'owned-card',
      batchId: 'owned-batch',
      answerId: 'owned-answer',
      control,
      release() {},
    }
  }
  for (const state of [
    'no-card-yet',
    'partial-batch',
    'unreadable',
    'wrong-card',
    'wrong-batch',
    'other-piece-answer',
  ] as const)
    it(`V6-2/3 controlled waiting owner ${state}`, async () => {
      const v = variants[2]!,
        f = await fixture(v),
        chain = [makePiece(v)]
      let invokes = 0
      const ports: RunnerPorts = {
        ...f.ports,
        invoke: async () => {
          invokes++
          return { kind: 'output', value: outputs(v)[7] }
        },
      }
      try {
        const original = await runPass(f.pass, chain, ports, signal())
        const current = await runPass(
          f.pass,
          chain,
          {
            ...ports,
            readAskState: async association => {
              // Controlled owner model has two cards in one batch. A single matching option label
              // is never identity; no-card and one-answer remain pending. Production owner is absent.
              const cards = [
                { cardId: 'card-a', batch: 'batch', piece: 'extension', answered: true },
                { cardId: 'card-b', batch: 'batch', piece: 'another', answered: false },
              ]
              if (state === 'unreadable') return { kind: 'unavailable' }
              if (state === 'no-card-yet') return { kind: 'pending', association }
              const candidate = {
                ...cards[0]!,
                ...(state === 'wrong-card' ? { cardId: 'other-card' } : {}),
                ...(state === 'wrong-batch' ? { batch: 'other-batch' } : {}),
                ...(state === 'other-piece-answer' ? { piece: 'another' } : {}),
              }
              if (
                candidate.cardId !== 'card-a' ||
                candidate.batch !== 'batch' ||
                candidate.piece !== association.piece
              )
                return { kind: 'replayInconsistent' }
              expect(cards.every(card => card.answered)).toBe(false)
              return {
                kind: 'pending',
                association,
                card: { cardId: candidate.cardId, batchId: candidate.batch },
              }
            },
          },
          signal(),
        )
        expect(current).toEqual(
          state === 'no-card-yet' || state === 'partial-batch'
            ? original
            : { failure: state === 'unreadable' ? 'unavailable' : 'replayInconsistent' },
        )
        expect(invokes).toBe(1)
        expect(await f.log.readSince(session, 0)).toMatchObject({ tail: 1 })
      } finally {
        await f.close()
      }
    })
  it('V6-2/3 preserves three ask rounds and final, pending makes no new card/conclusion/invocation', async () => {
    const v = variants[2]!,
      f = await fixture(v),
      chain = [makePiece(v)]
    let calls = 0,
      ready = false
    const ports: RunnerPorts = {
      ...f.ports,
      invoke: async (_piece, input, _signal, mode) => {
        calls++
        expect(input.earlier).toEqual([])
        if (mode.kind === 'replay')
          expect(mode.binding.association.askHistory).toHaveLength(calls - 1)
        return { kind: 'output', value: calls <= 3 ? outputs(v)[7] : { kind: 'observed' } }
      },
      readAskState: async association =>
        ready ? { kind: 'ready', binding: replay(association) } : { kind: 'pending', association },
    }
    try {
      const first = await runPass(f.pass, chain, ports, signal())
      expect(first).toMatchObject({ effect: { kind: 'asked' } })
      expect(await runPass(f.pass, chain, ports, signal())).toEqual(first)
      expect(calls).toBe(1)
      ready = true
      for (let n = 2; n <= 4; n++) {
        const next = await runPass(f.pass, chain, ports, signal())
        expect(next).toMatchObject({ effect: { kind: n === 4 ? 'proceed' : 'asked' } })
        expect('conclusions' in next && next.conclusions).toHaveLength(n)
      }
      const final = await runPass(
        f.pass,
        chain,
        {
          ...ports,
          readAskState: async () => {
            throw new Error('final must not read waiting')
          },
        },
        signal(),
      )
      expect(final).toMatchObject({ effect: { kind: 'proceed' } })
      expect(calls).toBe(4)
    } finally {
      await f.close()
    }
  })
  for (const field of [
    'tenant',
    'session',
    'generation',
    'pass',
    'piece',
    'ordinal',
    'subject',
    'earlier',
  ] as const)
    it(`V6-3 rejects wrong ready association ${field}`, async () => {
      const v = variants[2]!,
        f = await fixture(v),
        chain = [makePiece(v)]
      let invoked = 0,
        released = 0
      const ports: RunnerPorts = {
        ...f.ports,
        invoke: async () => {
          invoked++
          return { kind: 'output', value: outputs(v)[7] }
        },
      }
      try {
        expect(await runPass(f.pass, chain, ports, signal())).toMatchObject({
          effect: { kind: 'asked' },
        })
        const result = await runPass(
          f.pass,
          chain,
          {
            ...ports,
            readAskState: async association => {
              const wrong = {
                ...association,
                binding: { ...association.binding },
                pass: { ...association.pass },
                askEntry: { ...association.askEntry },
              }
              if (field === 'tenant')
                Object.assign(wrong.binding, {
                  tenant: { organization: 'other', account: 'other' },
                })
              if (field === 'session') Object.assign(wrong.binding, { session: 'other' })
              if (field === 'generation') Object.assign(wrong.binding, { logGeneration: 'other' })
              if (field === 'pass') Object.assign(wrong.pass, { anchor: 'other' })
              if (field === 'piece') Object.assign(wrong, { piece: 'other' })
              if (field === 'ordinal')
                Object.assign(wrong.askEntry, {
                  payload: {
                    ...(wrong.askEntry.payload as object),
                    occurrence: { kind: 'ask', ordinal: 99 },
                  },
                })
              if (field === 'subject') Object.assign(wrong, { subject: positioned(variants[1]!) })
              if (field === 'earlier') Object.assign(wrong, { earlier: association.askHistory })
              return {
                kind: 'ready',
                binding: {
                  ...replay(wrong),
                  release() {
                    released++
                  },
                },
              }
            },
          },
          signal(),
        )
        expect(result).toEqual({ failure: 'replayInconsistent' })
        expect(invoked).toBe(1)
        expect(released).toBe(1)
        expect(await f.log.readSince(session, 0)).toMatchObject({ tail: 1 })
      } finally {
        await f.close()
      }
    })
  for (const control of ['replayInconsistent', 'unavailable'] as const)
    for (const returned of ['output', 'errored'] as const)
      it(`V6-4 ${control} latch overrides caught ${returned}`, async () => {
        const v = variants[2]!,
          f = await fixture(v),
          chain = [makePiece(v)]
        try {
          await runPass(
            f.pass,
            chain,
            { ...f.ports, invoke: async () => ({ kind: 'output', value: outputs(v)[7] }) },
            signal(),
          )
          const before = { ...f.counts }
          const result = await runPass(
            f.pass,
            chain,
            {
              ...f.ports,
              readAskState: async association => ({
                kind: 'ready',
                binding: replay(association, () => control),
              }),
              invoke: async (): Promise<RunnerInvocationResult> =>
                returned === 'output'
                  ? { kind: 'output', value: { kind: 'observed' } }
                  : { kind: 'errored', error: 'caught contributor error' },
            },
            signal(),
          )
          expect(result).toEqual({ failure: control })
          expect(f.counts.now).toBe(before.now)
          expect(f.counts.mint).toBe(before.mint)
          expect(await f.log.readSince(session, 0)).toMatchObject({ tail: 1 })
        } finally {
          await f.close()
        }
      })
})
