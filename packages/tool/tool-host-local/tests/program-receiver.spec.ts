import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, type ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  encodeToolInvocationRef,
  type FixedToolRequest,
  type ToolDelivery,
  type ToolFailure,
} from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  decodeToolRevision,
  fixedRequestReference,
  toolInvokeRequestOf,
  type ProgramPosition,
  type ToolChildren,
} from '@omne-harness/tool-contract/provider'
import { testingCallLabel } from '@omne-harness/tool-contract/testing'
import type { LocalInvocationSourceInput } from '../src/invocation-source.ts'
import { sourceDomain, sourceKey } from '../src/invocation-forwarding.ts'
import { createProgramArrivals, createProgramReceiver } from '../src/program-receiver.ts'
import { positionTargetOf, programConsumer, programPositionOf } from '../src/program-source.ts'
import { createLocalTextResults } from '../src/text-results.ts'
import { callId, evidence, operationId, request, tenantA } from './coordinator-values.ts'

const ok = <T>(answer: { ok: T } | { failure: unknown }): T => {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
const parent = callId('call-parent')
const consumer = programConsumer(parent, 3)
const child = { call: callId('call-child'), admission: operationId('admit-child') }
const reference = ok(encodeToolInvocationRef({ tenant: tenantA, ...child }))
const fixed: FixedToolRequest = { ...request(), consumer }
const handed: ProgramPosition = {
  ordinal: 3,
  child: child.call,
  admission: child.admission,
  target: positionTargetOf(fixed),
  state: 'handed',
  background: false,
}

type WorldOver = Partial<{
  stored: boolean
  children: boolean
  programs: boolean
  fails: ToolFailure
  storeThrows: boolean
}>

async function world(over: WorldOver = {}) {
  const memory = createMemoryToolLedgerStore()
  const store: ToolLedgerStore = { ...memory, durability: 'durable' }
  if (over.stored !== false)
    await store.commit({
      domain: sourceDomain(tenantA, consumer),
      expected: ok(decodeToolRevision('0')),
      revision: ok(decodeToolRevision('1')),
      writes: [
        {
          kind: 'put',
          record: {
            kind: 'host',
            host: {
              key: sourceKey(consumer),
              request: fixed,
              value: {
                kind: 'invocation-source',
                ...child,
                requestDigest: canonicalDigest(toolInvokeRequestOf(fixed)),
                fixedDigest: canonicalDigest(fixedRequestReference(fixed)),
                invocation: fixed.invocation,
                principal: 'alice',
                origin: { kind: 'program', parent, ordinal: 3 },
              },
            },
          },
        },
      ],
    })
  const log: unknown[] = []
  const answered = (name: string, given: object) => {
    log.push([name, given])
    return Promise.resolve(over.fails === undefined ? succeed(handed) : fail(over.fails))
  }
  const children = {
    retain: given => answered('retain', given),
    background: given => answered('background', given),
  } as ToolChildren<string>
  const arrivals = createProgramArrivals()
  const reading: ToolLedgerStore = {
    ...store,
    readRecord: (...given) => {
      if (over.storeThrows === true) throw new Error('store broke')
      return store.readRecord(...given)
    },
  }
  const input = {
    store: reading,
    ...(over.programs === false
      ? {}
      : { programs: { children: () => (over.children === false ? undefined : children) } }),
  } as LocalInvocationSourceInput<string>
  const receiver = createProgramReceiver<string, ContentBlock>(input, arrivals)
  const push = (delivery: ToolDelivery<ContentBlock>, signal = new AbortController().signal) =>
    receiver.push({ access: { principal: 'alice', tenant: tenantA }, delivery, signal })
  return { push, log, arrivals }
}

const data = {
  kind: 'json',
  contract: evidence('contract') as never,
  schema: { id: 'value', revision: '1', digest: 'sha256:value' },
  value: { kind: 'string', value: 'the value' },
} as const
const result: Extract<ToolDelivery<ContentBlock>, { kind: 'result' }> = {
  kind: 'result',
  key: {
    kind: 'result',
    producer: 'tool',
    reference,
    result: ok(decodeToolResultVersion('result-1')),
  },
  consumer,
  delivery: ok(decodeToolDeliveryId('delivery-1')),
  relation: 'original',
  terminal: { kind: 'completed' },
  actualTerminal: null,
  effect: { kind: 'occurred', evidence: evidence('receipt') },
  source: evidence('result'),
  value: { ...ok(createLocalTextResults().text('the text')), data } as never,
  account: null,
}
const placeholder: ToolDelivery<ContentBlock> = {
  kind: 'placeholder',
  key: { kind: 'placeholder', producer: 'tool', reference },
  consumer,
  delivery: ok(decodeToolDeliveryId('delivery-2')),
  source: { kind: 'launched' },
  label: testingCallLabel(fixed.availability.definition, fixed.command),
  evidence: evidence('placeholder'),
}

describe('the receiver of a program position (TL-73)', () => {
  it('reads the parent call and the ordinal back from the consumer, and nothing from another owner', () => {
    expect(programPositionOf(consumer)).toEqual({ parent, ordinal: 3 })
    expect(programPositionOf({ ...consumer, owner: 'someone-else' })).toBeNull()
    expect(programPositionOf({ ...consumer, position: '-1' })).toBeNull()
    expect(programPositionOf({ ...consumer, position: 'three' })).toBeNull()
  })

  it('saving a result is the position recording its version; the waiting program gets the value, and no text is kept', async () => {
    const w = await world()
    const waiting = w.arrivals.wait(tenantA, consumer, new AbortController().signal)
    const saved = ok(await w.push(result))
    expect(saved).toEqual({
      key: result.key,
      evidence: {
        owner: consumer.owner,
        record: `${sourceKey(consumer)}/position`,
        revision: '1',
        digest: canonicalDigest(result.key),
      },
    })
    expect(w.log).toEqual([
      [
        'retain',
        {
          principal: 'alice',
          tenant: tenantA,
          call: parent,
          ordinal: 3,
          result: 'result-1',
          terminal: { kind: 'completed' },
          effect: result.effect,
        },
      ],
    ])
    expect(await waiting).toEqual({
      result: 'result-1',
      terminal: { kind: 'completed' },
      effect: result.effect,
      data,
    })
  })

  it('a placeholder only moves the position to the background and does not answer the program', async () => {
    const w = await world()
    const gone = new AbortController()
    const waiting = w.arrivals.wait(tenantA, consumer, gone.signal)
    expect(ok(await w.push(placeholder)).key).toEqual(placeholder.key)
    expect(w.log.map(one => (one as [string])[0])).toEqual(['background'])
    gone.abort()
    expect(await waiting).toBeNull()
  })

  it('an account is acknowledged and changes nothing at the position', async () => {
    const w = await world()
    const account = {
      kind: 'account',
      key: { kind: 'account', producer: 'tool', reference, event: 'e1', revision: '1' },
      consumer,
      account: { revision: '1', subject: { kind: 'tool_execution', id: child.call } },
    } as never
    expect(await w.push(account)).toHaveProperty('ok')
    expect(w.log).toEqual([])
  })

  it.each([
    [
      'a consumer that is not a program position',
      { ...result, consumer: { ...consumer, owner: 'x' } },
      {},
      { kind: 'denied' },
    ],
    [
      'a position with no issued source',
      result,
      { stored: false },
      { kind: 'unavailable', dependency: 'invocation-source' },
    ],
    [
      'no position table',
      result,
      { children: false },
      { kind: 'unavailable', dependency: 'program-positions' },
    ],
  ] as const)('%s is not saved', async (_, delivery, over, failure) => {
    const w = await world(over)
    expect(await w.push(delivery as never)).toEqual({ failure })
    expect(w.log).toEqual([])
  })

  it('a result of another call than the one issued for the position is denied', async () => {
    const w = await world()
    const other = ok(
      encodeToolInvocationRef({
        tenant: tenantA,
        call: callId('call-other'),
        admission: child.admission,
      }),
    )
    expect(await w.push({ ...result, key: { ...result.key, reference: other } })).toEqual({
      failure: { kind: 'denied' },
    })
    expect(w.log).toEqual([])
  })

  it.each([
    [{ kind: 'commit-unknown', operation: operationId('op') }, { kind: 'outcome-unknown' }],
    [{ kind: 'denied', action: 'write' }, { kind: 'denied' }],
    [{ kind: 'conflict', operation: operationId('op') }, { kind: 'conflict' }],
    [
      { kind: 'unavailable', dependency: 'store', diagnostic: 'down' },
      { kind: 'unavailable', dependency: 'program-positions' },
    ],
  ] as const)(
    'a position commit that answers %j is reported as %j, and the program is not answered',
    async (fails, failure) => {
      const w = await world({ fails })
      const gone = new AbortController()
      const waiting = w.arrivals.wait(tenantA, consumer, gone.signal)
      expect(await w.push(result)).toEqual({ failure })
      expect(await w.push(placeholder)).toEqual({ failure })
      gone.abort()
      expect(await waiting).toBeNull()
    },
  )

  it('a delivery that was already given up is not accepted', async () => {
    const w = await world()
    const gone = new AbortController()
    gone.abort()
    expect(await w.push(result, gone.signal)).toEqual({
      failure: { kind: 'cancelled-before-accept' },
    })
    expect(w.log).toEqual([])
  })

  it('refuses a delivery that names the call under another admission, and one that is not well formed', async () => {
    const w = await world()
    const other = ok(
      encodeToolInvocationRef({
        tenant: tenantA,
        call: child.call,
        admission: operationId('admit-other'),
      }),
    )
    expect(await w.push({ ...result, key: { ...result.key, reference: other } })).toEqual({
      failure: { kind: 'denied' },
    })
    const malformed = {
      kind: 'account',
      key: { kind: 'account', producer: 'tool', reference, event: 'e1', revision: '2' },
      consumer,
      account: { revision: '1', subject: { kind: 'tool_execution', id: child.call } },
    } as never
    expect(await w.push(malformed)).toMatchObject({
      failure: { kind: 'invalid', field: 'key.revision' },
    })
    expect(w.log).toEqual([])
  })

  it('answers unavailable when this host runs no programs, or its store cannot be read', async () => {
    const none = await world({ programs: false })
    expect(await none.push(result)).toEqual({
      failure: { kind: 'unavailable', dependency: 'program-positions' },
    })
    const broken = await world({ storeThrows: true })
    expect(await broken.push(result)).toEqual({
      failure: { kind: 'unavailable', dependency: 'program-positions' },
    })
  })

  it('a wait that was already given up answers at once, and an arrival reaches every waiter of the position', async () => {
    const { arrivals } = await world()
    const gone = new AbortController()
    gone.abort()
    expect(await arrivals.wait(tenantA, consumer, gone.signal)).toBeNull()
    const live = new AbortController()
    const both = [1, 2].map(() => arrivals.wait(tenantA, consumer, live.signal))
    const elsewhere = arrivals.wait(tenantA, programConsumer(parent, 4), live.signal)
    const arrival = {
      result: result.key.result,
      terminal: result.terminal,
      effect: result.effect,
      data,
    }
    arrivals.arrived(tenantA, consumer, arrival)
    expect(await Promise.all(both)).toEqual([arrival, arrival])
    live.abort()
    expect(await elsewhere).toBeNull()
  })
})
