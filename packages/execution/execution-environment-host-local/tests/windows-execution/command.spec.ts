/** @module-tag slow */
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  originRef,
  type CommandFacility,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { commandSettings } from '../../src/host-command.ts'
import { createWindowsHostCommands } from '../../src/windows-execution/index.ts'

describe('Windows Job commands', () => {
  it('streams original bytes after permit and records a confirmed stop', async context => {
    if (process.platform !== 'win32') return context.skip()
    const tenant = tenantCodec.parse(
      JSON.stringify({
        organization: 'org_0123456789abcdefghjkmnpqrs',
        account: 'acc_0123456789abcdefghjkmnpqrs',
      }),
    )
    if (!tenant.ok) throw new Error('tenant fixture')
    const stopped: string[] = []
    const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-winexec-')))
    const ledger: ResourceLedger = {
      closed: new AbortController().signal,
      plan: async () => 'recorded',
      permit: async () => 'confirmed',
      adopt: async () => 'confirmed',
      stopped: async (_, status) => {
        stopped.push(status)
        return 'recorded'
      },
    }
    const scope = decodeScopeRef({ ref: 'windows-test' })
    if (!('ok' in scope)) throw new Error('scope fixture')
    const manager = createWindowsHostCommands({
      ledger,
      provider: 'test',
      scope: scope.ok,
      settings: commandSettings({ startBoundMs: 20_000 }),
    })
    try {
      const request: Parameters<CommandFacility<unknown>['start']>[0] = {
        requestId: randomUUID(),
        access: { tenant: tenant.value, principal: null },
        origin: originRef('windows-test'),
        binding: { kind: 'host_machine' },
        executable: process.execPath,
        args: [
          '-e',
          'process.stdout.write(Buffer.from([0,13,10,27,255]));process.stderr.write("err")',
        ],
        cwd: root,
        env: {},
        outputMode: 'separate',
      }
      const result = await manager.facility.start(request)
      expect(result.kind).toBe('done')
      if (result.kind !== 'done') return
      const out: number[] = []
      const err: number[] = []
      for await (const chunk of result.value.output)
        (chunk.stream === 'stdout' ? out : err).push(...chunk.data)
      expect(out).toEqual([0, 13, 10, 27, 255])
      expect(Buffer.from(err).toString()).toBe('err')
      expect(await result.value.result).toMatchObject({
        kind: 'completed',
        exit: { kind: 'code', code: 0 },
      })
      expect(await result.value.stop('forced')).toBe('confirmed')
      expect(stopped).toContain('confirmed')
      expect(manager.unconfirmed()).toHaveLength(0)
      const sentinel = join(root, 'forbidden')
      const refused = createWindowsHostCommands({
        ledger: { ...ledger, permit: async () => 'closed' },
        provider: 'test',
        scope: scope.ok,
        settings: commandSettings({ startBoundMs: 20_000 }),
      })
      try {
        expect(
          await refused.facility.start({
            ...request,
            args: ['-e', 'require("fs").writeFileSync(process.argv[1], "bad")', sentinel],
          }),
        ).toMatchObject({ kind: 'rejected', reason: 'closed' })
        await expect(readFile(sentinel)).rejects.toMatchObject({ code: 'ENOENT' })
        expect(await refused.stopAll()).toEqual([])
      } finally {
        await refused.stopAll()
      }
    } finally {
      await manager.stopAll()
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
