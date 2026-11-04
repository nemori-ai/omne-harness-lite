import { link, mkdir, readFile, symlink, writeFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import {
  createHostFilesDomain,
  hostObjectToken,
} from '@omne-harness/execution-environment-host-local'
import { createHostFilesRuntime } from '../../../src/host-files.ts'
import { disposeRow } from '../../../src/loader.ts'
import { hostFixture, providerInput } from './support.ts'

const control = vi.hoisted(() => ({ failClose: false }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      const close = handle.close.bind(handle)
      handle.close = async () => {
        if (control.failClose) throw new Error('injected close failure')
        await close()
      }
      return handle
    },
  }
})

it.skipIf(process.platform !== 'linux')(
  'preserves unsettled quota across explicit row unload and reclaims it after maintenance',
  async () => {
    const domain = createHostFilesDomain({ quota: () => ({ perTenant: 1, global: null }) })
    const runtime = createHostFilesRuntime({ domain, diagnose: vi.fn() })
    const fixture = await hostFixture(runtime)
    try {
      const first = await fixture.load()
      const original = providerInput(first.provider, 'old')
      const acquired = await first.provider.acquire(original)
      if (acquired.kind !== 'acquired') throw new Error('expected acquisition')
      const files = acquired.lease.facility('files')
      if (files === undefined) throw new Error('expected files')
      const path = join(fixture.filesRoot, 'kept')
      await writeFile(path, 'kept')
      const named = await hostObjectToken(path)
      // Warm the prerequisite probe before fault injection affects descriptor closes.
      await files.read({
        requestId: 'warm',
        access: { tenant: original.tenant, principal: null },
        origin: original.origin,
        binding: { kind: 'host_machine' },
        path,
        named,
      })
      control.failClose = true
      expect(
        await files.read({
          requestId: 'held',
          access: { tenant: original.tenant, principal: null },
          origin: original.origin,
          binding: { kind: 'host_machine' },
          path,
          named,
        }),
      ).toMatchObject({ kind: 'done' })
      await disposeRow(first.row, () => runtime.request())
      const second = await fixture.load()
      expect(await second.provider.inspectAcquisition(original)).toMatchObject({
        kind: 'pending',
        phase: 'releasing',
      })
      expect(await second.provider.acquire(providerInput(second.provider, 'new'))).toMatchObject({
        kind: 'rejected',
        reason: 'quotaExceeded',
      })
      expect(await runtime.request()).toEqual({ kind: 'maintained', pending: 1 })
      control.failClose = false
      expect(await runtime.request()).toEqual({ kind: 'maintained', pending: 0 })
      expect(await second.provider.acquire(providerInput(second.provider, 'new'))).toMatchObject({
        kind: 'acquired',
      })
      expect(await readFile(path, 'utf8')).toBe('kept')
    } finally {
      control.failClose = false
      await domain.maintain()
      await fixture.close()
    }
  },
)

it.skipIf(process.platform !== 'linux')(
  'passes the configured root to the backend and rejects four escapes without changing files',
  async () => {
    const fixture = await hostFixture()
    try {
      const { provider } = await fixture.load()
      const input = providerInput(provider, 'boundaries')
      const acquired = await provider.acquire(input)
      if (acquired.kind !== 'acquired') throw new Error('expected acquisition')
      const files = acquired.lease.facility('files')
      if (files === undefined) throw new Error('expected files')
      const inside = join(fixture.filesRoot, 'inside')
      const outside = join(fixture.directory, 'outside')
      await mkdir(outside)
      const secret = join(outside, 'secret')
      await writeFile(inside, 'inside')
      await writeFile(secret, 'outside')
      await symlink(outside, join(fixture.filesRoot, 'link'))
      await link(secret, join(fixture.filesRoot, 'hard'))
      const access = { tenant: input.tenant, principal: null }
      const common = { access, origin: input.origin, binding: { kind: 'host_machine' } as const }
      expect(
        await files.read({
          ...common,
          requestId: 'inside',
          path: inside,
          named: await hostObjectToken(inside),
        }),
      ).toMatchObject({ kind: 'done', value: { bytes: new TextEncoder().encode('inside') } })
      const before = await lstat(secret)
      for (const path of [
        secret,
        `${fixture.filesRoot}/../outside/secret`,
        join(fixture.filesRoot, 'link', 'secret'),
        join(fixture.filesRoot, 'hard'),
      ]) {
        expect(
          await files.read({
            ...common,
            requestId: 'escape',
            path,
            named: await hostObjectToken(secret),
          }),
        ).toMatchObject({ kind: 'rejected', reason: 'notAuthorized' })
      }
      const after = await lstat(secret)
      expect({ size: after.size, mtimeMs: after.mtimeMs, nlink: after.nlink }).toEqual({
        size: before.size,
        mtimeMs: before.mtimeMs,
        nlink: before.nlink,
      })
      expect(await readFile(secret, 'utf8')).toBe('outside')
      expect(await readFile(inside, 'utf8')).toBe('inside')
    } finally {
      await fixture.close()
    }
  },
)
