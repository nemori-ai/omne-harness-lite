// The call port `continueWithInput` (SPEC S2, MC-16): a continuation completes on the generation
// the `inputRequired` outcome was issued at; once the connection changed generation it is not
// sent, and nothing is sent on the new generation; the request state alone is a lawful
// continuation.
import { describe, expect, it } from 'vitest'
import type { DefinitionDigest, Generation, RequestState } from '@omne-harness/mcp-contract'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  generationOf,
  jsonOf,
  requestStateOf,
  type PeerReply,
} from '@omne-harness/mcp-contract/testing'
import { alice } from './doubles/identities.ts'
import { completed, listing, peer, services, text } from './doubles/peer.ts'
import { adoptStdio, storedRecord } from './doubles/world.ts'

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

/** A peer whose `read` first asks for input, then completes; adopted, with the catalog stored. */
async function arranged() {
  const p = peer({
    listing: { '': listing([{ name: 'read' }]) },
    calls: { read: [ASKS, completed([text('done')])] },
  })
  adoptStdio(p, files)
  const stored = await storedRecord(p, anonymousKey, ['read'])
  const digest = stored.actions[0]?.definitionDigest
  if (digest === undefined) throw new Error('no digest')
  const { services: s, table } = services(p)
  return { p, digest, table, ...s }
}

type Arranged = Awaited<ReturnType<typeof arranged>>

/** The first call, which the peer answers with an input request; answers the generation. */
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
  issuedAt: Generation,
  extra: Readonly<{ requestState?: RequestState; inputResponses?: unknown }> = {},
) {
  return {
    ref: files,
    action: READ,
    args: jsonOf({}),
    issuedAt,
    correlationKey: c2,
    signal: new AbortController().signal,
    ...(extra.requestState === undefined ? {} : { requestState: extra.requestState }),
    ...(extra.inputResponses === undefined ? {} : { inputResponses: jsonOf(extra.inputResponses) }),
  }
}

describe('continueWithInput (SPEC S2)', () => {
  it('completes on the same generation, sending the request state and the input responses', async () => {
    const c = await arranged()
    const issuedAt = await asked(c, c.digest)
    expect(
      await c.invoker.continueWithInput(
        alice,
        continuation(issuedAt, { requestState: requestStateOf('s1'), inputResponses: { q: 'a' } }),
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

  it('is not sent once the connection changed generation: unknown, and no call on the new generation', async () => {
    const c = await arranged()
    const issuedAt = await asked(c, c.digest)
    expect(await c.connections.release(alice, files)).toMatchObject({ ok: { kind: 'released' } })
    expect(
      await c.invoker.continueWithInput(
        alice,
        continuation(issuedAt, { requestState: requestStateOf('s1'), inputResponses: { q: 'a' } }),
      ),
    ).toEqual({ kind: 'not-sent', reason: { kind: 'unknown' } })
    expect(c.p.requests('tools/call')).toHaveLength(1)
    expect(c.p.opens()).toBe(1)
    expect(await c.invoker.cancel(alice, c2)).toBe('unknown')
  })

  it('is not sent on a generation other than the one given, even while a connection is up', async () => {
    const c = await arranged()
    const issuedAt = await asked(c, c.digest)
    const other = generationOf(issuedAt + 1)
    expect(
      await c.invoker.continueWithInput(
        alice,
        continuation(other, { requestState: requestStateOf('s1') }),
      ),
    ).toEqual({ kind: 'not-sent', reason: { kind: 'unknown' } })
    expect(c.p.requests('tools/call')).toHaveLength(1)
  })

  it('with the request state alone is lawful: the continuation carries no input responses', async () => {
    const c = await arranged()
    const issuedAt = await asked(c, c.digest)
    expect(
      await c.invoker.continueWithInput(
        alice,
        continuation(issuedAt, { requestState: requestStateOf('s1') }),
      ),
    ).toMatchObject({ kind: 'sent', outcome: { kind: 'complete' } })
    const second = c.p.requests('tools/call')[1]
    expect(second?.params).toMatchObject({ requestState: 's1' })
    expect(second?.params).not.toHaveProperty('inputResponses')
  })

  it('rejects arguments that are not a JSON object with TypeError (R2)', async () => {
    const c = await arranged()
    const issuedAt = await asked(c, c.digest)
    await expect(
      c.invoker.continueWithInput(alice, { ...continuation(issuedAt), args: jsonOf([]) }),
    ).rejects.toThrow(TypeError)
    expect(c.p.requests('tools/call')).toHaveLength(1)
  })
})
