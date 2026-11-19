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
      delaysMs: [1],
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

const running = { ok: { state: { phase: 'running' } } }
const released = {
  failure: { kind: 'invalid', field: 'call', reason: 'recovery-material-released' },
}
const unavailable = { failure: { kind: 'unavailable', dependency: 'storage' } }
const denied = { failure: { kind: 'denied' } }

/** A scan of tenant A whose calls answer their loads in turn; a pause before a second read is granted. */
function loading(
  answers: Map<ModelCallId, readonly object[]>,
  onLoad = () => {},
  stopping = new AbortController().signal,
) {
  const scheduled: string[] = []
  const loads: string[] = []
  const reports: object[] = []
  const commands = {
    scanPending: () => Promise.resolve({ ok: { calls: [...answers.keys()], next: null } }),
    loadRecovery: (input: { call: ModelCallId }) => {
      const turn = loads.filter(call => call === input.call).length
      loads.push(input.call)
      onLoad()
      return Promise.resolve(answers.get(input.call)?.[turn])
    },
  } as unknown as ModelCommands<unknown>
  let pauses = 0
  const started = createStartScan(
    {
      commands,
      paused: () => Promise.resolve((pauses += 1) === 1),
      delaysMs: [1],
      size: 10,
      stopping,
      report: event => reports.push(event),
      wake: () => {},
      schedule: target => scheduled.push(target.call),
    },
    { scopes: () => Promise.resolve({ ok: [{ principal: 'scanner', tenant: A }] }) },
  )
  return { started, scheduled, loads, reports }
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

  it('takes a call whose material was released as looked at and wakes nothing for it', async () => {
    const s = loading(new Map([[callOf('released'), [released]]]))
    await s.started.run()
    expect(s.scheduled).toEqual([])
    expect(s.loads).toEqual([callOf('released')])
    expect(s.reports).toEqual([{ kind: 'recovered', woken: 0 }])
  })

  it('reads the tenant again when a call cannot be loaded for now, and gives up on a refused one', async () => {
    const s = loading(
      new Map([
        [callOf('flaky'), [unavailable, running]],
        [callOf('refused'), [denied, denied]],
      ]),
    )
    await s.started.run()
    expect(s.scheduled).toEqual([callOf('flaky')])
    expect(s.reports).toContainEqual({
      kind: 'recovery-failed',
      step: 'load',
      failure: 'unavailable',
      again: true,
    })
    expect(s.reports).toContainEqual({
      kind: 'recovery-failed',
      step: 'load',
      failure: 'denied',
      again: false,
    })
  })

  it('stops waking calls once the host is stopping', async () => {
    const stopping = new AbortController()
    const s = loading(
      new Map([
        [callOf('first'), [running]],
        [callOf('second'), [running]],
      ]),
      () => stopping.abort(),
      stopping.signal,
    )
    await s.started.run()
    expect(s.loads).toEqual([callOf('first')])
  })

  it('counts every call as looked at when there is nothing to scan', () => {
    const none = createStartScan(
      {
        commands: {} as ModelCommands<unknown>,
        paused: () => Promise.resolve(false),
        delaysMs: [1],
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
