import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type {
  DefinitionDigest,
  Generation,
  McpPorts,
  RequestState,
} from '@omne-harness/mcp-contract'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  jsonOf,
  requestStateOf,
  type PeerReply,
} from '@omne-harness/mcp-contract/testing'
import { loseOn } from '../src/internal/lost.ts'
import { settled } from './doubles/deferred.ts'
import { alice, type Principal } from './doubles/identities.ts'
import { completed, listing, peer, services, text, type Peer } from './doubles/peer.ts'
import { countedReads } from './doubles/ports.ts'
import { armedEligibility, armedStore, stallingAdoption } from './doubles/stalls.ts'
import { adoptHttp, storedRecord } from './doubles/world.ts'

const files = endpointRefOf('files')
const READ = actionNameOf('read')
const c1 = correlationKeyOf('c1')
const c2 = correlationKeyOf('c2')
const anonymousKey = {
  tenant: alice.tenant,
  account: { kind: 'anonymous' as const },
  holding: files.holding,
}
const ASKS: PeerReply = {
  kind: 'result',
  result: { resultType: 'input_required', requestState: 's1', inputRequests: { q: 1 } },
}

async function arranged(shape: (p: Peer) => Partial<McpPorts<Principal, string>> = () => ({})) {
  const p = peer({
    listing: { '': listing([{ name: 'read' }]) },
    calls: { read: [ASKS, completed([text('done')])] },
  })
  adoptHttp(p, files, { auth: 'none' })
  const stored = await storedRecord(p, anonymousKey, ['read'])
  const digest = stored.actions[0]?.definitionDigest
  if (digest === undefined) throw new Error('no digest')
  const { services: s, table } = services({ ...p, ports: { ...p.ports, ...shape(p) } })
  return { p, digest, table, ...s }
}

type Arranged = Awaited<ReturnType<typeof arranged>>

async function asked(c: Arranged, digest: DefinitionDigest): Promise<Generation> {
  const first = await c.invoker.invoke(alice, {
    ref: files,
    action: READ,
    args: jsonOf({}),
    expectedDefinition: digest,
    correlationKey: c1,
    signal: new AbortController().signal,
  })
  if (first.kind !== 'sent' || first.outcome.kind !== 'inputRequired') throw new Error('not asked')
  return first.outcome.issuedAt
}

function continuation(
  expectedDefinition: DefinitionDigest,
  extra: Readonly<{ requestState?: RequestState; inputResponses?: unknown }> = {},
) {
  return {
    ref: files,
    action: READ,
    args: jsonOf({}),
    expectedDefinition,
    correlationKey: c2,
    signal: new AbortController().signal,
    ...(extra.requestState === undefined ? {} : { requestState: extra.requestState }),
    ...(extra.inputResponses === undefined ? {} : { inputResponses: jsonOf(extra.inputResponses) }),
  }
}

describe('continueWithInput', () => {
  it('completes, sending the request state and the input responses', async () => {
    const c = await arranged()
    await asked(c, c.digest)
    expect(
      await c.invoker.continueWithInput(
        alice,
        continuation(c.digest, { requestState: requestStateOf('s1'), inputResponses: { q: 'a' } }),
      ),
    ).toMatchObject({ kind: 'sent', outcome: { kind: 'complete' } })
    const calls = c.p.requests('tools/call')
    expect(calls).toHaveLength(2)
    expect(calls[1]?.params).toMatchObject({
      name: 'read',
      arguments: {},
      requestState: 's1',
      inputResponses: { q: 'a' },
    })
  })

  it('needs no connection of the call it continues: after that one is gone it goes on a new one, from the values alone', async () => {
    const c = await arranged()
    await asked(c, c.digest)
    expect(await c.connections.release(alice, files)).toMatchObject({ ok: { kind: 'released' } })
    expect(
      await c.invoker.continueWithInput(
        alice,
        continuation(c.digest, { requestState: requestStateOf('s1'), inputResponses: { q: 'a' } }),
      ),
    ).toMatchObject({ kind: 'sent', outcome: { kind: 'complete' } })
    expect(c.p.requests('tools/call')).toHaveLength(2)
    expect(c.p.opens()).toBe(2)
  })

  it('after closeAll is not sent: connection-unavailable, and nothing connects', async () => {
    const c = await arranged()
    await asked(c, c.digest)
    await c.connections.closeAll()
    expect(
      await c.invoker.continueWithInput(
        alice,
        continuation(c.digest, { requestState: requestStateOf('s1'), inputResponses: { q: 'a' } }),
      ),
    ).toEqual({ kind: 'not-sent', reason: { kind: 'connection-unavailable' } })
    expect(c.p.requests('tools/call')).toHaveLength(1)
    expect(c.p.opens()).toBe(1)
  })

  it('closeAll while the continuation waits on the gate: the same not sent, connection-unavailable, as a first call; the store is not read after it', async () => {
    let store: ReturnType<typeof countedReads> | undefined
    let armed: ReturnType<typeof armedEligibility> | undefined
    const c = await arranged(p => ({
      store: (store = countedReads(p.store)),
      eligibility: (armed = armedEligibility(p.eligibility)).port,
    }))
    if (store === undefined || armed === undefined) throw new Error('not shaped')
    await asked(c, c.digest)
    const gate = armed.arm()
    const call = c.invoker.continueWithInput(
      alice,
      continuation(c.digest, { requestState: requestStateOf('s1') }),
    )
    await gate.reached
    await c.connections.closeAll()
    const reads = store.reads()
    gate.release()
    expect(await call).toEqual({ kind: 'not-sent', reason: { kind: 'connection-unavailable' } })
    expect(store.reads()).toBe(reads)
    expect(c.p.requests('tools/call')).toHaveLength(1)
    expect(c.p.opens()).toBe(1)
  })

  it('closeAll while the continuation waits on the store: the same not sent, connection-unavailable, as a first call, not the unknown of step 6; nothing is built or sent after it', async () => {
    let store: ReturnType<typeof armedStore> | undefined
    const c = await arranged(p => ({ store: (store = armedStore(p.store)).port }))
    if (store === undefined) throw new Error('not shaped')
    await asked(c, c.digest)
    const read = store.arm()
    const call = c.invoker.continueWithInput(
      alice,
      continuation(c.digest, { requestState: requestStateOf('s1') }),
    )
    await read.reached
    await c.connections.closeAll()
    read.release()
    expect(await call).toEqual({ kind: 'not-sent', reason: { kind: 'connection-unavailable' } })
    expect(c.p.requests('tools/call')).toHaveLength(1)
    expect(c.p.opens()).toBe(1)
  })

  it('is not sent when the action is no longer the one the call was suspended on: definition-changed', async () => {
    const c = await arranged()
    await asked(c, c.digest)
    const other = 'sha256:another-definition' as DefinitionDigest
    expect(
      await c.invoker.continueWithInput(
        alice,
        continuation(other, { requestState: requestStateOf('s1') }),
      ),
    ).toEqual({ kind: 'not-sent', reason: { kind: 'definition-changed' } })
    expect(c.p.requests('tools/call')).toHaveLength(1)
  })

  it('with the input responses alone is lawful too: the continuation carries no request state', async () => {
    const c = await arranged()
    await asked(c, c.digest)
    expect(
      await c.invoker.continueWithInput(
        alice,
        continuation(c.digest, { inputResponses: { q: 'a' } }),
      ),
    ).toMatchObject({ kind: 'sent', outcome: { kind: 'complete' } })
    const second = c.p.requests('tools/call')[1]
    expect(second?.params).toMatchObject({ name: 'read', inputResponses: { q: 'a' } })
    expect(second?.params).not.toHaveProperty('requestState')
  })

  it('with the request state alone is lawful: the continuation carries no input responses', async () => {
    const c = await arranged()
    await asked(c, c.digest)
    expect(
      await c.invoker.continueWithInput(
        alice,
        continuation(c.digest, { requestState: requestStateOf('s1') }),
      ),
    ).toMatchObject({ kind: 'sent', outcome: { kind: 'complete' } })
    const second = c.p.requests('tools/call')[1]
    expect(second?.params).toMatchObject({ requestState: 's1' })
    expect(second?.params).not.toHaveProperty('inputResponses')
  })

  it('goes on the connection built after the one it was suspended on broke while it was being prepared', async () => {
    const p = peer({
      listing: { '': listing([{ name: 'read' }]) },
      calls: { read: [ASKS, completed([text('done')])] },
    })
    adoptHttp(p, files, { auth: 'none' })
    const stored = await storedRecord(p, anonymousKey, ['read'])
    const digest = stored.actions[0]?.definitionDigest
    if (digest === undefined) throw new Error('no digest')
    const stalled = stallingAdoption(p.adoption, 4)
    const { services: s, table } = services({ ...p, ports: { ...p.ports, adoption: stalled.port } })
    const c = { p, digest, table, ...s }
    await asked(c, digest)
    const [first] = table.currentOf(alice.tenant, files.holding)
    if (first === undefined) throw new Error('no connection')
    const continued = c.invoker.continueWithInput(
      alice,
      continuation(c.digest, { requestState: requestStateOf('s1') }),
    )
    await settled()
    await loseOn(table, first, { reason: 'stream-broken', mark: 'connection-unavailable' })
    stalled.gate.resolve()
    expect(await continued).toMatchObject({ kind: 'sent', outcome: { kind: 'complete' } })
    expect(p.opens()).toBe(2)
    expect(p.requests('tools/call')).toHaveLength(2)
  })

  it('with neither the request state nor the input responses rejects with TypeError before any place is taken', async () => {
    const c = await arranged()
    await asked(c, c.digest)
    await expect(c.invoker.continueWithInput(alice, continuation(c.digest))).rejects.toThrow(
      TypeError,
    )
    expect(c.p.requests('tools/call')).toHaveLength(1)
    expect(await c.invoker.cancel(alice, c2)).toBe('unknown')
  })

  it('rejects arguments that are not a JSON object with TypeError', async () => {
    const c = await arranged()
    await asked(c, c.digest)
    await expect(
      c.invoker.continueWithInput(alice, { ...continuation(c.digest), args: jsonOf([]) }),
    ).rejects.toThrow(TypeError)
    expect(c.p.requests('tools/call')).toHaveLength(1)
  })

  it('reads each field of the request once: input responses that are an accessor answer once, and that answer is what goes out', async () => {
    const c = await arranged()
    await asked(c, c.digest)
    let reads = 0
    const unjudged: JsonValue = { kind: 'number', lexeme: 'NaN' }
    const request = Object.defineProperty(
      continuation(c.digest, { requestState: requestStateOf('s1') }),
      'inputResponses',
      {
        enumerable: true,
        get(): JsonValue | undefined {
          reads += 1
          return reads === 1 ? undefined : unjudged
        },
      },
    )
    expect(await c.invoker.continueWithInput(alice, request)).toMatchObject({
      kind: 'sent',
      outcome: { kind: 'complete' },
    })
    expect(reads).toBe(1)
    const second = c.p.requests('tools/call')[1]
    expect(second?.params).toMatchObject({ requestState: 's1' })
    expect(second?.params).not.toHaveProperty('inputResponses')
  })

  it('rejects input responses whose value tree fails judgeJsonValue with TypeError before any place is taken', async () => {
    const c = await arranged()
    await asked(c, c.digest)
    const inputResponses: JsonValue = {
      kind: 'array',
      items: [{ kind: 'number', lexeme: 'NaN' }],
    }
    await expect(
      c.invoker.continueWithInput(alice, { ...continuation(c.digest), inputResponses }),
    ).rejects.toThrow(TypeError)
    expect(c.p.requests('tools/call')).toHaveLength(1)
    expect(await c.invoker.cancel(alice, c2)).toBe('unknown')
  })
})
