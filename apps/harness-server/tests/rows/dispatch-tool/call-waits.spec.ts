import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { createCallRead, type CallReadPorts } from '../../../src/rows/dispatch-tool/call-waits.ts'

const TEXT = JSON.stringify({
  organization: `org_${'a'.repeat(26)}`,
  account: `acc_${'1'.repeat(26)}`,
})
const parsed = tenantCodec.parse(TEXT)
if (!parsed.ok) throw new Error('fixture tenant')
const TENANT = parsed.value
const PRINCIPAL = { who: 'the work principal of the dispatching session' }
const MADE = { dispatcher: 'a'.repeat(64), call: 'call-1' }
const NO_CALL = { kind: 'read', value: null }
const UNAVAILABLE = { kind: 'unavailable' }

function reading(script: { issued?: unknown; recovery?: unknown; absent?: 'commands' | 'work' }) {
  const asked: { name: string; input: unknown }[] = []
  const ports = {
    commands: () =>
      script.absent === 'commands'
        ? undefined
        : {
            loadRecovery: async (input: unknown) => {
              asked.push({ name: 'loadRecovery', input })
              return script.recovery
            },
          },
    work: () =>
      script.absent === 'work'
        ? undefined
        : {
            forSession: async (input: unknown) => {
              asked.push({ name: 'forSession', input })
              return script.issued ?? { ok: PRINCIPAL }
            },
          },
  } as unknown as CallReadPorts
  return { asked, read: (tenant = TEXT) => createCallRead(ports)(tenant, MADE) }
}
const recovered = (phase: string, waits: unknown[] = []) => ({ ok: { state: { phase }, waits } })
const failed = (failure: object) => ({ failure })

describe('the read of the dispatching call', () => {
  it('reads the call as the dispatching session, and gives whether it is settled and its waits', async () => {
    const waits = [{ phase: 'open' }]
    const open = reading({ recovery: recovered('suspended', waits) })
    expect(await open.read()).toEqual({ kind: 'read', value: { settled: false, waits } })
    expect(open.asked).toEqual([
      {
        name: 'forSession',
        input: { actor: 'coordinator', tenant: TENANT, session: MADE.dispatcher },
      },
      { name: 'loadRecovery', input: { principal: PRINCIPAL, tenant: TENANT, call: MADE.call } },
    ])
    const settled = reading({ recovery: recovered('settled') })
    expect(await settled.read()).toEqual({ kind: 'read', value: { settled: true, waits: [] } })
  })

  it.each([
    [
      'Tool does not know the call',
      { recovery: failed({ kind: 'invalid', field: 'call', reason: 'unknown-call' }) },
    ],
    ['the dispatching session is not one of the tenant', { issued: failed({ kind: 'denied' }) }],
  ])('answers that there is no such call when %s', async (_name, script) => {
    expect(await reading(script).read()).toEqual(NO_CALL)
  })

  it('answers that there is no such call for a tenant text that is no tenant, and asks nothing', async () => {
    const { asked, read } = reading({ recovery: recovered('settled') })
    expect(await read('not-a-tenant')).toEqual(NO_CALL)
    expect(asked).toEqual([])
  })

  it.each([
    ['the Tool commands are not there', { absent: 'commands' }],
    ['the work principals are not there', { absent: 'work' }],
    ['the work principal cannot be issued now', { issued: failed({ kind: 'unavailable' }) }],
    [
      'the call is invalid for another reason',
      { recovery: failed({ kind: 'invalid', field: 'call', reason: 'malformed' }) },
    ],
    [
      'the failure only shares the reason text',
      { recovery: failed({ kind: 'unavailable', reason: 'unknown-call' }) },
    ],
    [
      'the ledger cannot be read now',
      { recovery: failed({ kind: 'unavailable', dependency: 'ledger' }) },
    ],
  ] as const)('is unreadable, never taken for no call, when %s', async (_name, script) => {
    expect(await reading(script).read()).toEqual(UNAVAILABLE)
  })

  it('asks for no principal while either service is absent', async () => {
    for (const absent of ['commands', 'work'] as const)
      expect(reading({ absent }).asked).toEqual([])
  })
})
