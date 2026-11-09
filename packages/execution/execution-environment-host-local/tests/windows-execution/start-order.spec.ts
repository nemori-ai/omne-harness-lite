import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  originRef,
  type CommandFacility,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { commandSettings } from '../../src/host-command.ts'
import { createWindowsHostCommands } from '../../src/windows-execution/index.ts'
import type {
  WindowsCommandReading,
  WindowsPrerequisite,
} from '../../src/windows-execution/prerequisites.ts'

function manager(reading: WindowsCommandReading) {
  const tenant = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  const scope = decodeScopeRef({ ref: `windows-order-${randomUUID()}` })
  if (!tenant.ok || !('ok' in scope)) throw new Error('invalid fixture identity')
  const planned: string[] = []
  const missing: WindowsPrerequisite[][] = []
  const ledger: ResourceLedger = {
    closed: new AbortController().signal,
    plan: async resource => {
      planned.push(resource.key)
      return 'recorded'
    },
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async () => 'recorded',
  }
  const commands = createWindowsHostCommands({
    ledger,
    provider: 'test',
    scope: scope.ok,
    settings: commandSettings(),
    prerequisites: { facts: () => reading.kind, ready: async () => reading },
    unavailable: items => missing.push([...items]),
  })
  const request: Parameters<CommandFacility<unknown>['start']>[0] = {
    requestId: randomUUID(),
    access: { tenant: tenant.value, principal: null },
    origin: originRef('windows-test'),
    binding: { kind: 'host_machine' },
    executable: 'C:\\Windows\\System32\\whoami.exe',
    args: [],
    cwd: 'C:\\',
    env: {},
    outputMode: 'separate',
  }
  return { commands, request, planned, missing }
}

it('answers unavailable before closed and names the missing prerequisites', async () => {
  const m = manager({ kind: 'unsatisfied', missing: ['job-round-trip'] })
  m.commands.seal()
  expect(await m.commands.facility.start(m.request)).toMatchObject({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(m.missing).toEqual([['job-round-trip']])
  expect(m.planned).toEqual([])
})

it('answers unavailable with no names when the probe itself failed', async () => {
  const m = manager({ kind: 'unknown' })
  expect(await m.commands.facility.start(m.request)).toMatchObject({ reason: 'unavailable' })
  expect(m.missing).toEqual([[]])
})

it('answers closed after the prerequisites when the facade is sealed', async () => {
  const m = manager({ kind: 'satisfied' })
  m.commands.seal()
  expect(await m.commands.facility.start(m.request)).toMatchObject({ reason: 'closed' })
  expect(m.planned).toEqual([])
})

it('refuses a batch file as the executable before any platform check', async () => {
  const m = manager({ kind: 'unsatisfied', missing: ['dotnet-csc'] })
  for (const executable of ['C:\\tools\\build.bat', 'C:\\tools\\Run.CMD'])
    expect(await m.commands.facility.start({ ...m.request, executable })).toMatchObject({
      kind: 'rejected',
      reason: 'unsupported',
    })
  expect(m.missing).toEqual([])
})
