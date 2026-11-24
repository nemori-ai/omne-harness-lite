import { describe, expect, it } from 'vitest'
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  encodeToolInvocationRef,
  type ToolCallId,
  type ToolFailure,
  type ToolOperationId,
  type ToolState,
} from '@omne-harness/tool-contract'
import type { ProgramPosition, ProgramTable } from '@omne-harness/tool-contract/provider'
import { createToolAccessContribution } from '@omne-harness/tool-access'
import type { ToolCallFaces, ToolCallPrincipals } from '@omne-harness/tool-access'

const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
if (!parsed.ok) throw new Error('fixture tenant did not parse')
const tenant: TenantId = parsed.value
const login = { login: 'a' } as unknown as LoginIdentity
const principal = { principal: 'a' } as unknown as Principal
const signal = new AbortController().signal

function referenceOf(call: string, admission = `${call}-admission`): string {
  const encoded = encodeToolInvocationRef({
    tenant,
    call: call as ToolCallId,
    admission: admission as ToolOperationId,
  })
  if ('failure' in encoded) throw new Error('fixture reference did not encode')
  return encoded.ok
}
const parent = referenceOf('parent')

type Rest = Record<string, unknown>
function position(ordinal: number, rest: Rest, target: Rest = {}): ProgramPosition {
  return {
    ordinal,
    child: `child-${ordinal}`,
    admission: `child-${ordinal}-admission`,
    target: { name: 'Files', command: 'read', digest: 'd', preview: `read ${ordinal}`, ...target },
    ...rest,
  } as unknown as ProgramPosition
}
const tableOf = (positions: readonly ProgramPosition[]): ProgramTable => ({
  phase: 'open',
  positions,
})
const stateOf = (phase: string) => ({ phase }) as unknown as ToolState

type Table = Awaited<ReturnType<NonNullable<ReturnType<ToolCallFaces['children']>>['table']>>
type Current = Awaited<ReturnType<ToolCallFaces['instances']['current']>>
type Scripted = Readonly<{
  acting?: Awaited<ReturnType<ToolCallPrincipals['actingFor']>>
  current?: (reference: string) => Current | 'throw'
  table?: Table | 'throw'
  children?: 'absent'
  faces?: 'absent'
}>

function world(script: Scripted = {}) {
  const calls: { kind: string; input: unknown }[] = []
  const faces: ToolCallFaces = {
    queries: {
      readResult: () => Promise.reject(new Error('not read here')),
      readOutput: () => Promise.reject(new Error('not read here')),
    },
    instances: {
      current: input => {
        calls.push({ kind: 'current', input })
        const answer =
          script.current?.(input.reference) ?? succeed({ state: stateOf('running'), current: null })
        return answer === 'throw' ? Promise.reject(new Error('down')) : Promise.resolve(answer)
      },
    },
    observation: {
      observe: () => {
        throw new Error('not observed here')
      },
    },
    children: () =>
      script.children === 'absent'
        ? undefined
        : {
            table: input => {
              calls.push({ kind: 'table', input })
              return script.table === 'throw'
                ? Promise.reject(new Error('down'))
                : Promise.resolve(script.table ?? succeed(tableOf([])))
            },
          },
  }
  const contribution = createToolAccessContribution({
    faces: () => (script.faces === 'absent' ? undefined : faces),
    principals: {
      actingFor: () => {
        calls.push({ kind: 'acting', input: null })
        return Promise.resolve(script.acting ?? { ok: principal })
      },
    },
  })
  const context = { principal: login, messageId: 'm1', revision: 1, signal }
  return {
    calls,
    list: (cursor: string | null = null, reference = parent) =>
      contribution.operations['list-call-children'](context, { tenant, reference, cursor }),
  }
}

async function itemsOf(script: Scripted) {
  const answer = await world(script).list()
  if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
  return answer.body.items
}

describe('list-call-children: who may read', () => {
  it.each(['denied', 'basis-unavailable'] as const)(
    'a refusal of acting (%s) answers before Tool is asked',
    async refused => {
      const w = world({ acting: { refused } })
      expect(await w.list()).toEqual({ outcome: refused })
      expect(w.calls.map(call => call.kind)).toEqual(['acting'])
    },
  )

  it('answers basis-unavailable while the faces of Tool are away', async () => {
    expect(await world({ faces: 'absent' }).list()).toEqual({ outcome: 'basis-unavailable' })
  })

  it.each([
    [{ kind: 'denied', action: 'lookup' }, 'denied'],
    [{ kind: 'invalid', field: 'reference', reason: 'type' }, 'denied'],
    [{ kind: 'unavailable', dependency: 'ledger', diagnostic: 'down' }, 'basis-unavailable'],
  ] as const)(
    'a parent that cannot be read (%o) answers %s and its table is not read',
    async (failure, outcome) => {
      const w = world({ current: () => fail(failure as ToolFailure) })
      expect(await w.list()).toEqual({ outcome })
      expect(w.calls.map(call => call.kind)).toEqual(['acting', 'current'])
    },
  )

  it.each(['x', '1.5', '-2', ''])(
    'a cursor that is not an ordinal (%j) is denied',
    async cursor => {
      const w = world()
      expect(await w.list(cursor)).toEqual({ outcome: 'denied' })
      expect(w.calls.map(call => call.kind)).toEqual(['acting'])
    },
  )

  it('reads the table of the call the reference names, as the acting principal', async () => {
    const w = world()
    expect(await w.list()).toEqual({ outcome: 'succeeded', body: { items: [], next: null } })
    expect(w.calls.at(-1)).toEqual({ kind: 'table', input: { principal, tenant, call: 'parent' } })
  })
})

describe('list-call-children: the table cannot be read', () => {
  it('answers basis-unavailable while the records are away', async () => {
    expect(await world({ children: 'absent' }).list()).toEqual({ outcome: 'basis-unavailable' })
  })

  it('answers basis-unavailable when the read throws', async () => {
    expect(await world({ table: 'throw' }).list()).toEqual({ outcome: 'basis-unavailable' })
  })

  it.each([
    [{ kind: 'unavailable', dependency: 'ledger', diagnostic: 'down' }, 'basis-unavailable'],
    [{ kind: 'denied', action: 'lookup' }, 'denied'],
  ] as const)('a failure of the read (%o) answers %s', async (failure, outcome) => {
    expect(await world({ table: fail(failure as ToolFailure) }).list()).toEqual({ outcome })
  })
})

describe('list-call-children: the items', () => {
  it('writes each position with its ordinal, target, preview, state word and child reference', async () => {
    const table = tableOf([
      position(0, { state: 'retained', terminal: { kind: 'completed' } }),
      position(1, { state: 'registered' }, { name: 'Shell', command: null, preview: undefined }),
      position(2, { state: 'excluded', exclusion: { kind: 'denied', reason: 'no' } }),
      position(3, { state: 'handed', background: true }),
    ])
    expect(await itemsOf({ table: succeed(table) })).toEqual([
      {
        ordinal: 0,
        tool: 'Files',
        command: 'read',
        preview: 'read 0',
        state: 'completed',
        child: referenceOf('child-0'),
      },
      { ordinal: 1, tool: 'Shell', command: null, preview: '', state: 'waiting', child: null },
      {
        ordinal: 2,
        tool: 'Files',
        command: 'read',
        preview: 'read 2',
        state: 'denied',
        child: referenceOf('child-2'),
      },
      {
        ordinal: 3,
        tool: 'Files',
        command: 'read',
        preview: 'read 3',
        state: 'background',
        child: referenceOf('child-3'),
      },
    ])
  })

  it('asks what a call is doing only for a position handed off in the foreground', async () => {
    const table = tableOf([
      position(1, { state: 'retained', terminal: { kind: 'completed' } }),
      position(2, { state: 'handed', background: true }),
      position(3, { state: 'handed', background: false }),
    ])
    const w = world({ table: succeed(table) })
    await w.list()
    const asked = w.calls.filter(call => call.kind === 'current').map(call => call.input)
    expect(asked).toEqual([
      { access: { principal, tenant }, reference: parent },
      { access: { principal, tenant }, reference: referenceOf('child-3') },
    ])
  })

  it.each([
    [succeed({ state: stateOf('queued'), current: null }), 'queued'],
    [succeed({ state: stateOf('running'), current: null }), 'running'],
    [succeed({ state: stateOf('suspended'), current: null }), 'waiting'],
    [fail({ kind: 'invalid', field: 'call', reason: 'unknown-call' } as ToolFailure), 'queued'],
    [fail({ kind: 'invalid', field: 'reference', reason: 'type' } as ToolFailure), 'unknown'],
    [fail({ kind: 'denied', action: 'lookup' } as ToolFailure), 'unknown'],
    [fail({ kind: 'unavailable', dependency: 'l', diagnostic: 'd' } as ToolFailure), 'unknown'],
    ['throw', 'unknown'],
  ] as const)('a handed position whose call answers %o reads %s', async (answer, word) => {
    const table = tableOf([position(1, { state: 'handed', background: false })])
    const current = (reference: string) =>
      reference === parent ? succeed({ state: stateOf('running'), current: null }) : answer
    const items = await itemsOf({
      table: succeed(table),
      current: current as NonNullable<Scripted['current']>,
    })
    expect(items.map(item => item.state)).toEqual([word])
  })
})

describe('list-call-children: pages', () => {
  const many = tableOf(
    Array.from({ length: 120 }, (_, ordinal) =>
      position(ordinal, { state: 'retained', terminal: { kind: 'completed' } }),
    ),
  )
  const ordinals = async (cursor: string | null) => {
    const answer = await world({ table: succeed(many) }).list(cursor)
    if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
    return {
      first: answer.body.items[0]?.ordinal,
      count: answer.body.items.length,
      next: answer.body.next,
    }
  }

  it('gives fifty positions a page by ordinal, and no cursor after the last', async () => {
    expect(await ordinals(null)).toEqual({ first: 0, count: 50, next: '49' })
    expect(await ordinals('49')).toEqual({ first: 50, count: 50, next: '99' })
    expect(await ordinals('99')).toEqual({ first: 100, count: 20, next: null })
    expect(await ordinals('119')).toEqual({ first: undefined, count: 0, next: null })
  })

  it('gives exactly fifty positions as one page without a cursor', async () => {
    const table = tableOf(many.positions.slice(0, 50))
    const answer = await world({ table: succeed(table) }).list()
    expect(answer).toMatchObject({ outcome: 'succeeded', body: { next: null } })
  })
})
