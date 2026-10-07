// @module-tag slow
// Real durable host terminal ownership, independent of author package implementations.
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { expect, test } from 'vitest'
import { hostProviderFixture } from './host-provider-fixture.ts'
import { defaultHostNativePolicy } from '../dist/native-policy.js'

async function text(process: import('@omne-harness-lite/execution-environments').ProcessHandle) {
  let stdout = ''
  for await (const part of process.output)
    if (part.stream === 'terminal') stdout += Buffer.from(part.data).toString()
  expect((await process.result).kind).toBe('completed')
  return stdout
}
test(
  'adopted terminal survives creator release, later calls require their own permit, references remain scoped',
  { tags: ['slow'] },
  async () => {
    const host = await hostProviderFixture()
    try {
      const first = await host.acquire('terminal-birth'),
        port = first.lease.facilities.command!
      const birth = await port.createTerminal({ cwd: '/tmp', env: { PATH: '/usr/bin:/bin' } })
      if (birth.kind !== 'created') throw new Error(`Terminal birth ${birth.reason}`)
      expect(host.events.map(event => event.kind)).toEqual(['planned', 'permitted', 'adopted'])
      expect(await first.lease.release()).toEqual({ kind: 'released' })
      expect(await host.provider.listRecoveryResources(host.scope)).toEqual({
        kind: 'resources',
        values: [],
      })
      const foreign = await host.acquire('foreign-session', true, {
        ...host.scope,
        session: unwrap(parseOpaqueIdentifier('another-session', 'SessionRef')),
      })
      expect(
        await foreign.lease.facilities.command!.executeTerminal({
          terminal: birth.terminal,
          script: 'printf leaked',
        }),
      ).toMatchObject({ kind: 'rejected', reason: 'notFound' })
      await foreign.lease.release()
      const second = await host.acquire('terminal-next'),
        commands = second.lease.facilities.command!
      const leg = await commands.executeTerminal({
        terminal: birth.terminal,
        script: 'export KEPT=yes; cd /; printf established',
      })
      if (leg.kind !== 'started') throw new Error(`Terminal leg ${leg.reason}`)
      expect(await text(leg.process)).toBe('established')
      const denied = await host.acquire('terminal-denied', false)
      expect(
        await denied.lease.facilities.command!.executeTerminal({
          terminal: birth.terminal,
          script: 'printf unauthorized',
        }),
      ).toMatchObject({ kind: 'rejected', reason: 'closed' })
      const again = await commands.executeTerminal({
        terminal: birth.terminal,
        script: 'printf "$KEPT:$PWD"',
      })
      if (again.kind !== 'started') throw new Error(`Terminal followup ${again.reason}`)
      expect(await text(again.process)).toBe('yes:/')
      expect(
        await commands.executeTerminal({
          terminal: { ...birth.terminal, generation: 'old' },
          script: 'true',
        }),
      ).toMatchObject({ kind: 'rejected', reason: 'notFound' })
      expect(await commands.closeTerminal(birth.terminal)).toEqual({
        kind: 'closed',
        status: 'confirmed',
      })
      expect(
        await commands.executeTerminal({ terminal: birth.terminal, script: 'true' }),
      ).toMatchObject({ kind: 'rejected', reason: 'closed' })
      await denied.lease.release()
      await second.lease.release()
    } finally {
      await host.close()
    }
  },
)

test(
  'in-flight terminal births count against capacity before native launch completes',
  { tags: ['slow'] },
  async () => {
    const host = await hostProviderFixture({ ...defaultHostNativePolicy, maxTerminalsPerScope: 1 })
    try {
      const { lease } = await host.acquire('terminal-capacity'),
        command = lease.facilities.command!
      const values = await Promise.all([
        command.createTerminal({ cwd: '/tmp', env: {} }),
        command.createTerminal({ cwd: '/tmp', env: {} }),
      ])
      expect(values.filter(value => value.kind === 'created')).toHaveLength(1)
      expect(values.filter(value => value.kind === 'rejected')).toEqual([
        { kind: 'rejected', reason: 'capacity' },
      ])
      const birth = values.find(value => value.kind === 'created')!
      expect(await command.closeTerminal(birth.terminal)).toEqual({
        kind: 'closed',
        status: 'confirmed',
      })
      await lease.release()
    } finally {
      await host.close()
    }
  },
)

test(
  'a completed native leg with an unconfirmed original receipt closes the terminal before a next leg',
  { tags: ['slow'] },
  async () => {
    const host = await hostProviderFixture()
    try {
      let acknowledge = false
      const { lease } = await host.acquire('leg-receipt-cut', true, host.scope, {
        stopped: async () => (acknowledge ? 'recorded' : 'unavailable'),
      })
      const port = lease.facilities.command!,
        birth = await port.createTerminal({ cwd: '/tmp', env: {} })
      if (birth.kind !== 'created') throw new Error('Terminal not created')
      const leg = await port.executeTerminal({
        terminal: birth.terminal,
        script: 'printf original',
      })
      if (leg.kind !== 'started') throw new Error('Leg not started')
      expect(await text(leg.process)).toBe('original')
      expect(
        await port.executeTerminal({ terminal: birth.terminal, script: 'printf must-not-run' }),
      ).toMatchObject({ kind: 'rejected', reason: 'busy' })
      acknowledge = true
      expect(await port.closeTerminal(birth.terminal)).toEqual({
        kind: 'closed',
        status: 'confirmed',
      })
      await lease.release()
    } finally {
      await host.close()
    }
  },
)

test.each(['plan', 'permit', 'adopt'] as const)(
  'terminal birth cannot outlive an unconfirmed original %s receipt',
  { tags: ['slow'] },
  async boundary => {
    const host = await hostProviderFixture()
    try {
      const { lease } = await host.acquire('terminal-receipt-' + boundary, true, host.scope, {
        ...(boundary === 'plan' ? { plan: async () => 'unavailable' as const } : {}),
        ...(boundary === 'permit' ? { permit: async () => 'closed' as const } : {}),
        ...(boundary === 'adopt' ? { adopt: async () => 'unavailable' as const } : {}),
      })
      const commands = lease.facilities.command!
      expect(await commands.createTerminal({ cwd: '/tmp', env: {} })).toEqual({
        kind: 'rejected',
        reason: boundary === 'adopt' ? 'effectUnknown' : 'closed',
      })
      expect(await commands.terminals()).toEqual({ kind: 'terminals', values: [] })
      expect(await lease.release()).toEqual({ kind: 'released' })
      expect(await host.provider.listRecoveryResources(host.scope)).toEqual({
        kind: 'resources',
        values: [],
      })
    } finally {
      await host.close()
    }
  },
)
