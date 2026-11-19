import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import { decodeModelCallId, type ModelCallId } from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { createStartScan } from '../src/plugins/start-scan.ts'

function tenantOf(suffix: string): TenantId {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return tenant(organization.value, account.value)
}
const callOf = (name: string): ModelCallId => {
  const decoded = decodeModelCallId(`mcall_${name}`)
  if ('failure' in decoded) throw new Error('fixture call')
  return decoded.ok
}

const A = tenantOf('5')
const B = tenantOf('6')
const never = new Promise<never>(() => {})

/** A scan over fake commands: tenant A has a running and a settled call; tenant B's scan never answers. */
function scan(stuckOnB: boolean) {
  const scheduled: string[] = []
  const woken: string[] = []
  const phases = new Map([
    [callOf('running'), 'running'],
    [callOf('settled'), 'settled'],
  ])
  const commands = {
    scanPending: (input: { tenant: TenantId }) =>
      input.tenant === B
        ? stuckOnB
          ? never
          : Promise.resolve({ ok: { calls: [], next: null } })
        : Promise.resolve({ ok: { calls: [...phases.keys()], next: null } }),
    loadRecovery: (input: { call: ModelCallId }) =>
      Promise.resolve({ ok: { state: { phase: phases.get(input.call) } } }),
  } as unknown as ModelCommands<unknown>
  const started = createStartScan(
    {
      commands,
      paused: () => Promise.resolve(false),
      size: 10,
      stopping: new AbortController().signal,
      report: () => {},
      wake: target => woken.push(target.call),
      schedule: target => scheduled.push(target.call),
    },
    {
      scopes: () =>
        Promise.resolve({
          ok: [
            { principal: 'scanner', tenant: A },
            { principal: 'scanner', tenant: B },
          ],
        }),
    },
  )
  return { started, scheduled, woken }
}

describe('the start scan', () => {
  it('counts nothing as looked at before it ran, and every call once it read all tenants', async () => {
    const s = scan(false)
    expect(s.started.scanned(callOf('running'))).toBe(false)
    await s.started.run()
    expect(s.started.scanned(callOf('running'))).toBe(true)
    expect(s.started.scanned(callOf('admitted-later'))).toBe(true)
    expect(s.scheduled).toEqual([callOf('running')])
    expect(s.woken).toEqual([callOf('settled')])
  })

  it('counts the calls it read while another tenant still has not answered, and no others', async () => {
    const s = scan(true)
    void s.started.run()
    for (let turn = 0; turn < 50 && s.scheduled.length === 0; turn += 1) await Promise.resolve()
    for (let turn = 0; turn < 50; turn += 1) await Promise.resolve()
    expect(s.started.scanned(callOf('running'))).toBe(true)
    expect(s.started.scanned(callOf('settled'))).toBe(true)
    expect(s.started.scanned(callOf('admitted-later'))).toBe(false)
  })

  it('counts every call as looked at when there is nothing to scan', () => {
    const none = createStartScan(
      {
        commands: {} as ModelCommands<unknown>,
        paused: () => Promise.resolve(false),
        size: 10,
        stopping: new AbortController().signal,
        report: () => {},
        wake: () => {},
      },
      undefined,
    )
    expect(none.scanned(callOf('any'))).toBe(true)
  })
})
