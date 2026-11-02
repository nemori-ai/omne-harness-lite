import { randomUUID } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  originRef,
  type CommandFacility,
  type ManagedResource,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { commandSettings, type HostCommandOptions } from '../../src/host-command.ts'
import { createWindowsHostCommands } from '../../src/windows-execution/index.ts'

export function commandFixture(cwd: string, options: HostCommandOptions = {}) {
  const tenant = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  const scope = decodeScopeRef({ ref: `windows-test-${randomUUID()}` })
  if (!tenant.ok || !('ok' in scope)) throw new Error('invalid fixture identity')
  const plans: ManagedResource[] = []
  let recordStops = true
  let observeStop: ResourceLedger['stopped'] | undefined
  const ledger: ResourceLedger = {
    closed: new AbortController().signal,
    plan: async resource => {
      plans.push(resource)
      return 'recorded'
    },
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async (key, status) => {
      if (observeStop !== undefined) await observeStop(key, status)
      return recordStops ? 'recorded' : 'unavailable'
    },
  }
  const manager = createWindowsHostCommands({
    ledger,
    provider: 'test',
    scope: scope.ok,
    settings: commandSettings(options),
  })
  const request: Parameters<CommandFacility<unknown>['start']>[0] = {
    requestId: randomUUID(),
    access: { tenant: tenant.value, principal: null },
    origin: originRef('windows-test'),
    binding: { kind: 'host_machine' },
    executable: process.execPath,
    args: [],
    cwd,
    env: { SystemRoot: process.env['SystemRoot'] ?? 'C:\\Windows' },
    outputMode: 'separate',
  }
  return {
    manager,
    request,
    plans,
    recordStops(value: boolean) {
      recordStops = value
    },
    observeStops(observer: ResourceLedger['stopped']) {
      observeStop = observer
    },
  }
}
