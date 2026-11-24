import { describe, expect, it } from 'vitest'
import type { ToolInvokeRequest } from '@omne-harness/tool-contract'
import { decodeToolRevision, type ProgramPosition } from '@omne-harness/tool-contract/provider'
import { invocationSourceIdentities } from '../src/invocation-source.ts'
import { hostKey } from '@omne-harness/tool'
import { callId, operationId } from './coordinator-values.ts'
import { sourceDomain, sourceKey } from '../src/invocation-forwarding.ts'
import {
  positionTargetOf,
  programConsumer,
  programPositionOf,
  TOOL_PROGRAM_OWNER,
} from '../src/program-source.ts'
import { forwardingFixture, ok, parentRequest } from './forwarding-values.ts'

type World = Awaited<ReturnType<typeof world>>

async function world(options: Parameters<typeof forwardingFixture>[0] = {}) {
  const f = await forwardingFixture({ programs: true, ...options })
  const placed = (ordinal = 1, target: ToolInvokeRequest = f.target) => ({
    ...f.parent,
    start: f.parent.start as Extract<typeof f.parent.start, { kind: 'start' }>,
    ordinal,
    target,
  })
  const domain = { kind: 'call', tenant: f.parent.tenant, call: f.parent.call } as const
  /** Writes the position the way the table would after its hand-off. */
  const hand = async (
    ordinal = 1,
    state: ProgramPosition['state'] = 'handed',
    other: Partial<Pick<ProgramPosition, 'child' | 'admission'>> = {},
  ) => {
    const prepared = await f.source.programs.prepare(placed(ordinal))
    if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
    const read = await f.memory.read(domain)
    if (read.kind !== 'complete') throw new Error('read')
    const position = {
      ordinal,
      child: prepared.child,
      admission: prepared.admission,
      target: positionTargetOf(prepared.request),
      state,
      ...(state === 'handed' ? { background: false } : {}),
      ...other,
    } as ProgramPosition
    await f.memory.commit({
      domain,
      expected: read.revision,
      revision: ok(decodeToolRevision(String(Number(read.revision) + 1))),
      writes: [{ kind: 'put', record: { kind: 'position', position } }],
    })
    return prepared
  }
  /** Rewrites the stored source of position 1, as someone with the store but not the host would. */
  const tamper = async (change: (value: Record<string, unknown>) => Record<string, unknown>) => {
    const consumer = programConsumer(f.parent.call, 1)
    const at = sourceDomain(f.parent.tenant, consumer)
    const read = await f.memory.readRecord(at, hostKey(sourceKey(consumer)))
    if (read.kind !== 'complete' || read.record?.kind !== 'host') throw new Error('no source')
    const host = read.record.host
    await f.memory.commit({
      domain: at,
      expected: read.revision,
      revision: ok(decodeToolRevision(String(Number(read.revision) + 1))),
      writes: [
        {
          kind: 'put',
          record: {
            kind: 'host',
            host: { ...host, value: change(host.value as Record<string, unknown>) },
          },
        },
      ],
    })
  }
  return {
    ...f,
    placed,
    hand,
    tamper,
    resolve: (ordinal = 1) => f.source.programs.source.resolve(placed(ordinal)),
  }
}

const access = (w: World) => ({ principal: w.parent.principal, tenant: w.parent.tenant })

describe('what a position needs before it is registered', () => {
  it('names the child by the consuming position, so the same position is always the same call', async () => {
    const w = await world()
    const prepared = await w.source.programs.prepare(w.placed(4))
    if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
    const consumer = programConsumer(w.parent.call, 4)
    expect(prepared.consumer).toEqual(consumer)
    expect(consumer).toMatchObject({ owner: TOOL_PROGRAM_OWNER, position: '4' })
    expect({ call: prepared.child, admission: prepared.admission }).toEqual(
      invocationSourceIdentities(w.parent.tenant, consumer),
    )
    expect(prepared.request.invocation).toMatchObject({
      kind: 'programmatic',
      source: { owner: TOOL_PROGRAM_OWNER },
    })
    expect(await w.source.programs.prepare(w.placed(4))).toEqual(prepared)
    const other = await w.source.programs.prepare(w.placed(5))
    expect(other.kind === 'prepared' && other.child).not.toBe(prepared.child)
  })

  it('refuses a target that is not open to programs as unsupported', async () => {
    const w = await world({ programs: false })
    expect(await w.source.programs.prepare(w.placed())).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable' },
    })
    const open = await world()
    expect(await open.source.programs.prepare(open.placed(1, parentRequest()))).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unsupported', reason: 'Tools is not open to programs' },
    })
  })

  it.each([
    ['a negative ordinal', (w: World) => w.placed(-1), 'invalid'],
    [
      'a target that would wait in the background',
      (w: World) => w.placed(1, { ...w.target, mode: 'background' }),
      'denied',
    ],
    [
      'a target outside the scope the parent pinned',
      (w: World) => w.placed(1, { ...w.target, scope: { ...w.target.scope, key: 'another' } }),
      'denied',
    ],
  ] as const)('%s is refused', async (_, given, kind) => {
    const w = await world()
    expect(await w.source.programs.prepare(given(w))).toMatchObject({
      kind: 'rejected',
      failure: { kind },
    })
  })

  it('a parent that never started cannot issue', async () => {
    const w = await world({ consumed: false })
    expect((await w.source.programs.prepare(w.placed())).kind).toBe('rejected')
  })
})

describe('TL-65 the source of a position', () => {
  it('is not issued before the table has handed the position off', async () => {
    const w = await world()
    expect(await w.resolve()).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
    await w.hand(1, 'registered')
    expect(await w.resolve()).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
  })

  it('is issued once: the same position again gives the same call, marked recovered', async () => {
    const w = await world()
    const prepared = await w.hand()
    const first = await w.resolve()
    expect(first).toMatchObject({
      kind: 'bound',
      call: prepared.child,
      admission: prepared.admission,
      recovered: false,
    })
    expect(await w.resolve()).toMatchObject({
      kind: 'bound',
      call: prepared.child,
      recovered: true,
    })
  })

  it('another request at a position that already has a source is a conflict', async () => {
    const w = await world()
    await w.hand()
    await w.resolve()
    const text = JSON.stringify({ path: 'another.txt' })
    const other = { ...w.target, arguments: { original: text, effective: text, complete: true } }
    expect(await w.source.programs.source.resolve(w.placed(1, other))).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'conflict' },
    })
  })

  it.each([
    ['lost', { kind: 'issuance-unknown' }],
    ['unwritten', { kind: 'issuance-unknown' }],
    ['unavailable', { kind: 'rejected', failure: { kind: 'unavailable' } }],
    ['rejected', { kind: 'rejected', failure: { kind: 'invalid', field: 'storage' } }],
  ] as const)(
    'a commit that answers %s is reported as it is, never as issued',
    async (fault, expected) => {
      const w = await world()
      const prepared = await w.hand()
      w.arm(fault)
      expect(await w.resolve()).toMatchObject(expected)
      const again = await w.resolve()
      expect(again).toMatchObject({
        kind: 'bound',
        call: prepared.child,
        recovered: fault === 'lost',
      })
    },
  )
})

describe('a call a program made is verified against the source this host stored', () => {
  async function issued() {
    const w = await world()
    await w.hand()
    const bound = await w.resolve()
    if (bound.kind !== 'bound') throw new Error(JSON.stringify(bound))
    const verify = (over: object = {}) =>
      w.source.guard.verify({
        ...access(w),
        call: bound.call,
        operation: bound.admission,
        request: bound.request,
        ...over,
      })
    return { w, bound, verify }
  }

  it('is trusted as issued, and forged for another principal, another call or another request', async () => {
    const { w, bound, verify } = await issued()
    expect(await verify()).toEqual({ kind: 'trusted' })
    expect(await verify({ principal: 'mallory' })).toMatchObject({ kind: 'forged' })
    expect(await verify({ call: w.parent.call })).toMatchObject({ kind: 'forged' })
    const text = JSON.stringify({ path: 'elsewhere.txt' })
    const tampered = {
      ...bound.request,
      arguments: { original: text, effective: text, complete: true },
    }
    expect(await verify({ request: tampered })).toMatchObject({ kind: 'forged' })
  })

  it('gives back the principal it was issued for, and nothing for a request that does not match', async () => {
    const { w, bound } = await issued()
    const asked = { tenant: w.parent.tenant, call: bound.call, admission: bound.admission }
    expect(await w.source.recoverBinding({ ...asked, request: bound.request })).toEqual({
      ok: { principal: 'alice' },
    })
    const other = { ...bound.request, command: 'other' }
    expect(await w.source.recoverBinding({ ...asked, request: other })).toHaveProperty('failure')
  })

  it('a call that says of itself that a program made it is forged', async () => {
    const w = await world()
    const request = { ...w.target, consumer: { ...w.target.consumer, position: 'self-declared' } }
    const direct = await w.source.issuer.resolve({ ...access(w), request })
    if (direct.kind !== 'bound') throw new Error(JSON.stringify(direct))
    const claimed = {
      ...direct.request,
      invocation: { ...direct.request.invocation, kind: 'programmatic' as const },
    }
    const asked = { ...access(w), call: direct.call, operation: direct.admission }
    expect(await w.source.guard.verify({ ...asked, request: direct.request })).toEqual({
      kind: 'trusted',
    })
    expect(await w.source.guard.verify({ ...asked, request: claimed })).toMatchObject({
      kind: 'forged',
    })
  })

  it('a direct request cannot name a program position as its consumer', async () => {
    const w = await world()
    const forged = { ...w.target, consumer: programConsumer(w.parent.call, 1) }
    expect(await w.source.issuer.resolve({ ...access(w), request: forged })).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'denied' },
    })
  })

  it.each([
    ['its ordinal', { ordinal: 2 }],
    ['its parent call', { parent: 'call-another' }],
    ['the admission of its parent', { admission: 'admit-another' }],
    ['the request of its parent', { requestDigest: 'sha256:another' }],
    ['the start of its parent', { start: { kind: 'start', operation: 'another' } }],
    ['what it was issued for', { issued: 7 }],
  ] as const)('a stored source that was rewritten in %s is forged', async (_, change) => {
    const { w, verify } = await issued()
    expect(await verify()).toEqual({ kind: 'trusted' })
    await w.tamper(value => ({
      ...value,
      origin: { ...(value['origin'] as object), ...change },
    }))
    expect(await verify()).toMatchObject({ kind: 'forged' })
  })

  it('a stored source whose principal cannot be read back is not trusted', async () => {
    const { w, verify } = await issued()
    await w.tamper(value => ({ ...value, principal: 7 }))
    expect(await verify()).toMatchObject({ kind: 'unavailable' })
    expect(await verify({ operation: operationId('admit-other') })).not.toEqual({ kind: 'trusted' })
  })
})

describe('the consuming position of a program call, read back', () => {
  it('takes position 0, which loads the program, and refuses a parent that is not a call', () => {
    expect(programPositionOf(programConsumer(callId('call-p'), 0))).toEqual({
      parent: callId('call-p'),
      ordinal: 0,
    })
    expect(programPositionOf({ ...programConsumer(callId('call-p'), 1), work: '' })).toBeNull()
    expect(
      programPositionOf({ ...programConsumer(callId('call-p'), 1), position: '1.5' }),
    ).toBeNull()
  })
})

describe('what is refused before a source is written', () => {
  it('a position handed off to another child or under another admission', async () => {
    for (const other of [
      { child: callId('call-other') },
      { admission: operationId('admit-other') },
    ]) {
      const w = await world()
      await w.hand(1, 'handed', other)
      expect(await w.resolve()).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
    }
  })

  it('a parent request, a target, or a tool that cannot be read', async () => {
    const w = await world()
    const broken = { ...w.placed(), request: { ...w.parent.request, consumer: 7 } }
    expect(await w.source.programs.prepare(broken as never)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid' },
    })
    const target = { ...w.target, arguments: { original: 7 } }
    expect(await w.source.programs.prepare(w.placed(1, target as never))).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid' },
    })
    const unknown = {
      ...w.target,
      availability: { ...w.target.availability, name: 'no_such_tool' },
    }
    expect((await w.source.programs.prepare(w.placed(1, unknown as never))).kind).toBe('rejected')
    expect(await w.source.programs.prepare(w.placed(-1))).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'ordinal', reason: 'range' },
    })
    expect((await w.source.programs.prepare(w.placed(0))).kind).toBe('prepared')
  })
})
