import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import {
  definitionMappingsKey,
  type DefinitionMappingEntry,
} from '../../../src/rows/agent-adoptions/definition-mappings.ts'
import { executorCallsOf } from '../../../src/rows/schedule-session/calls.ts'

const adoption = (name: string, revision = '1') => ({
  owner: 'o',
  name,
  revision,
  digest: `sha256:${name}-${revision}`,
})
const entryOf = (revision: string): DefinitionMappingEntry => ({
  name: 'coding',
  candidate: adoption('coding', revision),
  execution: adoption('execution'),
  entryContract: adoption('entry'),
  requiredIdentities: [],
  modes: { permission: 'never', environment: adoption('environment'), collaboration: 'co-work' },
})
const TENANT = JSON.stringify({
  organization: `org_${'a'.repeat(26)}`,
  account: `acc_${'1'.repeat(26)}`,
})
const SYSTEM = { kind: 'system', component: 'schedule' }
const MODES = {
  permission: 'never',
  environmentAdoptionRef: 'e',
  collaboration: 'auto-drive',
} as const
const job = (n: number) => ({
  tenant: TENANT,
  session: `session-${String(n)}`,
  operation: `sop_${String(n)}`,
  creation: { agent: 'coding', modes: MODES },
})

function fixture() {
  const state = {
    definition: entryOf('1') as DefinitionMappingEntry | undefined | 'unavailable',
    answer: { ok: {} } as unknown,
    mounted: true,
  }
  const created: {
    principal: unknown
    session: string
    operation: string
    creation: Record<string, unknown>
  }[] = []
  const mappings = {
    async named() {
      if (state.definition === 'unavailable') return { kind: 'unavailable' }
      return state.definition === undefined
        ? { kind: 'absent' }
        : { kind: 'found', entry: state.definition }
    },
    modesFor: () => (typeof state.definition === 'object' ? state.definition : undefined),
  }
  const service = {
    management: {
      async create(input: (typeof created)[number]) {
        created.push(input)
        return state.answer
      },
    },
  }
  const ctx = {
    get: (key: unknown) => (key === definitionMappingsKey && state.mounted ? mappings : undefined),
    intercept: () => ({ get: () => service }),
  } as unknown as Context
  const calls = executorCallsOf(ctx, { system: SYSTEM, workPrincipals: () => undefined })
  return { state, created, sessions: calls.sessions }
}

describe('the session a Job creates on the release', () => {
  it('is a main session nobody attends, created as schedule by the definition as it stands at the call, with the modes the Job fixed', async () => {
    const f = fixture()
    expect(await f.sessions.create(job(1))).toEqual({ kind: 'created' })
    expect(f.created).toHaveLength(1)
    const [made] = f.created
    expect(made).toMatchObject({ principal: SYSTEM, session: 'session-1', operation: 'sop_1' })
    expect(tenantCodec.encode((made as never as { tenant: never }).tenant)).toEqual({
      ok: true,
      value: TENANT,
    })
    const { initialization, ...creation } = made?.creation ?? {}
    expect(initialization).toBeDefined()
    expect(creation).toEqual({
      candidate: adoption('coding', '1'),
      execution: adoption('execution'),
      entryContract: adoption('entry'),
      requiredIdentities: [],
      definition: { name: 'coding', candidate: adoption('coding', '1') },
      purpose: 'schedule',
      workspace: null,
      workspaceAttachment: null,
      modes: {
        kind: 'explicit',
        value: {
          permission: 'never',
          environment: adoption('environment'),
          collaboration: 'auto-drive',
        },
      },
      initial: null,
      attendance: 'unattended',
    })
  })

  it('adopts the newest publication of the definition at each start: a Job after a new version takes the new one', async () => {
    const f = fixture()
    await f.sessions.create(job(1))
    f.state.definition = entryOf('2')
    await f.sessions.create(job(2))
    expect(
      f.created.map(made => (made.creation['definition'] as { candidate: unknown }).candidate),
    ).toEqual([adoption('coding', '1'), adoption('coding', '2')])
  })

  it('is not created without the definition: to be tried again when the tenant has none, unknown while it cannot be read', async () => {
    const f = fixture()
    f.state.definition = undefined
    expect(await f.sessions.create(job(1))).toEqual({
      kind: 'refused',
      recoverable: true,
      reason: 'no Agent definition coding',
    })
    expect(await f.sessions.definition({ tenant: TENANT, agent: 'coding' })).toEqual({
      kind: 'read',
      value: false,
    })
    f.state.definition = 'unavailable'
    expect(await f.sessions.create(job(1))).toEqual({ kind: 'unknown' })
    expect(await f.sessions.definition({ tenant: TENANT, agent: 'coding' })).toEqual({
      kind: 'unavailable',
    })
    f.state.mounted = false
    expect(await f.sessions.create(job(1))).toEqual({ kind: 'unknown' })
    expect(f.created).toEqual([])
  })

  it('is refused, to be tried again, when Session denies schedule the creation: the grant of schedule is not installed', async () => {
    const f = fixture()
    f.state.answer = { failure: { kind: 'denied' } }
    expect(await f.sessions.create(job(1))).toEqual({
      kind: 'refused',
      recoverable: true,
      reason: 'denied',
    })
  })

  it('refuses a tenant text that names no tenant, and asks Session nothing', async () => {
    const f = fixture()
    expect(await f.sessions.create({ ...job(1), tenant: 'nobody' })).toEqual({
      kind: 'refused',
      recoverable: false,
      reason: 'not-a-tenant',
    })
    expect(f.created).toEqual([])
  })
})
