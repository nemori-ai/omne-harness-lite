import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test, vi } from 'vitest'
import { REGISTERED_CATEGORIES } from '@omne-harness-lite/asset-registry'
import { copyJsonValue, LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { LogEntry } from '@omne-harness-lite/session-log'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import {
  captureDriverValue,
  driverKey,
  inspectDriverEntry,
  prepareDriverEntry,
  toolDriverAll,
} from '../src/tool-driver-codec.ts'

const scope = {
  tenant: unwrap(parseTenantId({ organization: 'driver-org', account: 'driver-user' })),
  session: unwrap(parseOpaqueIdentifier('driver-session', 'SessionRef')),
}
const at = '2026-10-04T00:00:00.000Z'
const origin = { run: 'run', attempt: 1, assistantMessage: 'reply' }
const key = (parts: string[]) => `tool-driver/1/${JSON.stringify(parts)}`
function call() {
  return {
    kind: 'tool_call',
    id: 'block',
    callId: 'call',
    complete: true,
    visibility: { toHuman: true, toModel: true },
    tool: 'echo',
    arguments: { n: new LosslessNumber('9007199254740993') },
  }
}
const reason = {
  kind: 'admission_unavailable',
  by: 'omne-official:admission-judgment',
  conclusion: key(['actions', 'reply']),
  explanation: 'missing',
}
function adoption(attempt: number | LosslessNumber = 1) {
  const attemptText = attempt === 1 ? '1e0' : '9007199254740993e0'
  return {
    kind: 'attempt_adopted',
    run: 'run',
    attempt,
    adoption: key(['attempt', 'run', attemptText]),
    startedMessageKey: 'started',
    context: [
      {
        key: 'session',
        revision: 'v1',
        value: { exact: new LosslessNumber('1.00') },
        observedAt: at,
      },
    ],
    report: {
      session: scope.session,
      runId: 'run',
      attempt,
      computedAt: 1,
      snapshots: REGISTERED_CATEGORIES.map(category => ({ category, filledAt: 1 })),
      availability: [],
      mcpActions: [],
      endpointHoldings: [],
      skillGate: [],
      effectivePermissions: { echo: 'not_in_composition' },
    },
    tools: [
      {
        name: 'echo',
        capability: 'tool:echo',
        asset: 'asset',
        version: '1e0',
        definition: {
          name: 'echo',
          description: 'Echo',
          paradigm: 'single',
          origin: { kind: 'authored' },
          input: { type: 'object', properties: {}, description: 'Input' },
          permissions: { execute: { default: 'auto' } },
        },
      },
    ],
  }
}
function completed() {
  return {
    kind: 'actions_completed',
    origin,
    adoption: key(['attempt', 'run', '1e0']),
    chain: [],
    completion: {
      key: key(['actions', 'reply']),
      gate: { kind: 'missing', reason: 'chain' },
      items: [
        {
          callId: 'call',
          effectiveCall: call(),
          anchor: 'anchor',
          conclusions: [],
          decision: { kind: 'denied', reason, conclusion: reason.conclusion },
        },
      ],
    },
  }
}
function values() {
  return [
    { kind: 'run_started', run: 'run', inboundKey: 'inbound', at },
    adoption(),
    completed(),
    {
      kind: 'action_denial_intended',
      origin,
      adoption: key(['attempt', 'run', '1e0']),
      call: call(),
      reason,
    },
    {
      kind: 'action_denied',
      origin,
      callId: 'call',
      reason,
      message: {
        type: 'tool',
        id: 'tool-message',
        createdAt: at,
        callId: 'call',
        blocks: [
          {
            kind: 'tool_result',
            id: 'result',
            callId: 'call',
            visibility: { toHuman: true, toModel: true },
            outcome: 'denied',
            reason,
            blocks: [],
          },
        ],
      },
    },
    { kind: 'run_ended', run: 'run', reason: 'completed', basis: ['reply'], at },
  ]
}
function entry(value: unknown): LogEntry {
  const prepared = prepareDriverEntry(scope, value)
  if ('invalid' in prepared) throw new Error(`invalid test value ${JSON.stringify(value)}`)
  return { ...prepared.entry, session: scope.session, position: 1 }
}

for (let index = 0; index < 6; index++)
  test(`captures and encodes driver branch ${index}`, () => {
    const value = values()[index]
    const encoded = entry(value)
    expect(inspectDriverEntry(scope, encoded)).toMatchObject({ value, key: driverKey(value) })
    expect(encoded.readKeys).toEqual([encoded.dedupeKey, toolDriverAll])
    expect(encoded.run === undefined).toBe(index === 0 || index === 5)
  })

test('preserves exact attempts, version identities and owned numeric arguments', () => {
  const encoded = entry(adoption(new LosslessNumber('9007199254740993')))
  expect(encoded.dedupeKey).toBe(key(['attempt', 'run', '9007199254740993e0']))
  expect(captureDriverValue({ ...adoption(), attempt: new LosslessNumber('1.0') })).not.toEqual({
    invalid: true,
  })
  const input = completed()
  const captured = captureDriverValue(input)
  input.completion.items[0]!.effectiveCall.arguments.n = new LosslessNumber('9007199254740992')
  expect(captured).toMatchObject({
    completion: {
      items: [{ effectiveCall: { arguments: { n: new LosslessNumber('9007199254740993') } } }],
    },
  })
  expect(Object.isFrozen(captured)).toBe(true)
})

for (const mutate of [
  (v: ReturnType<typeof adoption>) => ({ ...v, extra: true }),
  (v: ReturnType<typeof adoption>) => ({ ...v, attempt: 0 }),
  (v: ReturnType<typeof adoption>) => ({ ...v, attempt: 1.1 }),
  (v: ReturnType<typeof adoption>) => ({ ...v, report: null }),
  (v: ReturnType<typeof adoption>) => ({ ...v, report: { ...v.report, attempt: 2 } }),
  (v: ReturnType<typeof adoption>) => ({ ...v, report: { ...v.report, runId: 'other' } }),
  (v: ReturnType<typeof adoption>) => ({ ...v, report: { ...v.report, effectivePermissions: {} } }),
  (v: ReturnType<typeof adoption>) => ({ ...v, tools: [...v.tools, ...v.tools] }),
  (v: ReturnType<typeof adoption>) => ({ ...v, context: [...v.context, ...v.context] }),
  (v: ReturnType<typeof adoption>) => ({ ...v, tools: [{ ...v.tools[0], name: 'other' }] }),
  (v: ReturnType<typeof adoption>) => ({ ...v, tools: [{ ...v.tools[0], definition: null }] }),
  (v: ReturnType<typeof adoption>) => ({ ...v, tools: [{ ...v.tools[0], version: '-1' }] }),
  (v: ReturnType<typeof adoption>) => ({
    ...v,
    context: [{ ...v.context[0], observedAt: 'yesterday' }],
  }),
])
  test(`rejects malformed adoption ${mutate.toString()}`, () => {
    expect(captureDriverValue(mutate(adoption()))).toEqual({ invalid: true })
  })

for (const mutate of [
  (v: ReturnType<typeof completed>) => ({ ...v, completion: { ...v.completion, items: [] } }),
  (v: ReturnType<typeof completed>) => ({
    ...v,
    completion: { ...v.completion, gate: { kind: 'available', extra: true } },
  }),
  (v: ReturnType<typeof completed>) => ({
    ...v,
    completion: { ...v.completion, items: [...v.completion.items, ...v.completion.items] },
  }),
  (v: ReturnType<typeof completed>) => ({ ...v, chain: [{ definition: null, power: 'veto' }] }),
  (v: ReturnType<typeof completed>) => ({ ...v, origin: { ...origin, attempt: 0 } }),
  (v: ReturnType<typeof completed>) => ({
    ...v,
    completion: { ...v.completion, items: [{ ...v.completion.items[0], callId: 'other' }] },
  }),
  (v: ReturnType<typeof completed>) => ({
    ...v,
    completion: { ...v.completion, items: [{ ...v.completion.items[0], effectiveCall: {} }] },
  }),
  (v: ReturnType<typeof completed>) => ({
    ...v,
    completion: {
      ...v.completion,
      items: [{ ...v.completion.items[0], conclusions: ['same', 'same'] }],
    },
  }),
  (v: ReturnType<typeof completed>) => ({
    ...v,
    completion: {
      ...v.completion,
      items: [
        { ...v.completion.items[0], decision: { kind: 'denied', reason, conclusion: 'wrong' } },
      ],
    },
  }),
])
  test(`rejects malformed completion ${mutate.toString()}`, () => {
    expect(captureDriverValue(mutate(completed()))).toEqual({ invalid: true })
  })

for (const mutate of [
  (v: LogEntry) => ({ ...v, run: 'other' }),
  (v: LogEntry) => ({ ...v, attempt: 2 }),
  (v: LogEntry) => ({ ...v, session: 'other' }),
  (v: LogEntry) => ({ ...v, tenant: { organization: 'other', account: 'driver-user' } }),
  (v: LogEntry) => ({ ...v, position: 0 }),
  (v: LogEntry) => ({ ...v, position: 0.5 }),
  (v: LogEntry) => ({ ...v, readKeys: [v.dedupeKey] }),
  (v: LogEntry) => ({ ...v, readKeys: [v.dedupeKey, toolDriverAll, 'foreign'] }),
  (v: LogEntry) => ({ ...v, readKeys: [toolDriverAll, toolDriverAll] }),
  (v: LogEntry) => ({ ...v, dedupeKey: 'tool-driver/2/unknown' }),
  (v: LogEntry) => ({
    ...v,
    payload: { format: 'tool-driver/2', category: 'driver', value: completed() },
  }),
  (v: LogEntry) => ({
    ...v,
    payload: { format: 'tool-driver/1', category: 'other', value: completed() },
  }),
  (v: LogEntry) => ({ ...v, extra: true }),
])
  test(`rejects mismatched shell or claimed format ${mutate.toString()}`, () => {
    expect(inspectDriverEntry(scope, mutate(entry(completed())) as LogEntry)).toEqual({
      invalid: true,
    })
  })

test('refuses local adoption/completion key mismatch even when shapes pass', () => {
  expect(prepareDriverEntry(scope, { ...adoption(), adoption: 'other' })).toEqual({ invalid: true })
  expect(
    prepareDriverEntry(scope, {
      ...completed(),
      completion: { ...completed().completion, key: 'other' },
    }),
  ).toEqual({ invalid: true })
  expect(
    prepareDriverEntry(scope, {
      ...adoption(),
      report: { ...adoption().report, session: 'other' },
    }),
  ).toEqual({ invalid: true })
})

test('copies before observing getters and does not invoke them on any public codec entry', () => {
  const getter = vi.fn(() => 'run')
  const value = Object.defineProperty({ ...values()[0] }, 'run', { enumerable: true, get: getter })
  expect(captureDriverValue(value)).toEqual({ invalid: true })
  expect(driverKey(value)).toEqual({ invalid: true })
  expect(prepareDriverEntry(scope, value)).toEqual({ invalid: true })
  expect(
    inspectDriverEntry(
      scope,
      Object.defineProperty({}, 'payload', { enumerable: true, get: getter }) as LogEntry,
    ),
  ).toEqual({ invalid: true })
  expect(
    prepareDriverEntry(
      Object.defineProperty({}, 'session', { enumerable: true, get: getter }) as typeof scope,
      values()[0],
    ),
  ).toEqual({ invalid: true })
  expect(getter).not.toHaveBeenCalled()
})

test('rejects driver claims on any key while allowing genuinely foreign domains', () => {
  const original = entry(values()[0])
  const foreign = {
    ...original,
    dedupeKey: 'foreign',
    readKeys: ['foreign'],
    payload: { format: 'foreign/1' },
  }
  expect(inspectDriverEntry(scope, foreign)).toEqual({ unrelated: true })
  expect(
    inspectDriverEntry(scope, { ...foreign, readKeys: ['foreign', 'tool-driver/99/all'] }),
  ).toEqual({ invalid: true })
})

test('a bare driver namespace cannot disguise an undecodable owned record', () => {
  const row = entry(values()[0])
  expect(
    inspectDriverEntry(scope, {
      ...row,
      dedupeKey: 'foreign',
      readKeys: ['foreign'],
      payload: { format: 'tool-driver' },
    }),
  ).toEqual({ invalid: true })
})

test('fixed validator loads on first use and retains the native module cache', () => {
  const codec = new URL('../dist/tool-driver-codec.js', import.meta.url).href
  const manifest = new URL('../package.json', import.meta.url).href
  const result = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(manifest)});
    const path = require.resolve('./generated/tool-driver.cjs');
    const codec = await import(${JSON.stringify(codec)});
    assert.equal(require.cache[path], undefined);
    codec.captureDriverValue({ kind: 'run_started', run: 'r', inboundKey: 'i', at: '${at}' });
    const first = require.cache[path]; assert.ok(first);
    codec.captureDriverValue({ kind: 'run_started', run: 'r', inboundKey: 'i', at: '${at}' });
    assert.equal(require.cache[path], first); console.log('lazy-cache-ok');
  `,
    ],
    { encoding: 'utf8' },
  )
  expect(result.trim()).toBe('lazy-cache-ok')
})

test('round trips all driver records through actual JSONL and reopening', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'omne-driver-codec-'))
  const options = {
    dir,
    processOwnership: { current: 'codec-test', observeExit: async () => 'exited' as const },
  }
  let log = await openJsonlSessionLog(options)
  try {
    for (const value of values()) {
      const prepared = prepareDriverEntry(scope, value)
      if ('invalid' in prepared) throw new Error('invalid test fixture')
      const row = prepared.entry
      const fence =
        row.run === undefined || row.attempt === undefined
          ? { kind: 'unfenced' as const }
          : { kind: 'fenced' as const, run: row.run, attempt: row.attempt }
      expect(
        await log.append(scope.session, [row], fence, { kind: 'unconditional' }),
      ).toHaveProperty('tail')
    }
    await log.close()
    log = await openJsonlSessionLog(options)
    const prefix = await log.readSince(scope.session, 0)
    if ('failure' in prefix) throw new Error('unreadable prefix')
    expect(prefix.entries).toHaveLength(6)
    for (const row of prefix.entries) expect(inspectDriverEntry(scope, row)).toHaveProperty('value')
    const exact = copyJsonValue(prefix.entries[2]?.payload)
    expect(exact).toMatchObject({
      ok: {
        value: {
          completion: {
            items: [
              { effectiveCall: { arguments: { n: new LosslessNumber('9007199254740993') } } },
            ],
          },
        },
      },
    })
  } finally {
    await log.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('denial confirmation must contain the same denied call and reason', () => {
  const original = values()[4]
  expect(captureDriverValue({ ...original, callId: 'other' })).toEqual({ invalid: true })
  expect(
    captureDriverValue({ ...original, reason: { ...reason, explanation: 'changed' } }),
  ).toEqual({ invalid: true })
})
