// @module-tag slow
import { expect, it } from 'vitest'
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { workspaceCodec } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import {
  originRef,
  type EnvironmentFacilities,
  type EnvironmentLease,
  type FileSystemFacility,
} from '@omne-harness/execution-environment-contract'
import { createHostFiles, hostObjectToken } from '@omne-harness/execution-environment-host-local'
import { createAuthorEnvironment } from '../../src/author-environment.ts'
import { directoryVisitOf } from '../../src/directory-visits.ts'
import { callId, principalA, tenantA } from '../coordinator-values.ts'

function author(root: string, files: FileSystemFacility<unknown>) {
  const parsed = workspaceCodec.parse('wsp_00000000000000000000000001')
  if (!parsed.ok) throw new Error('invalid workspace')
  const facilities: Partial<EnvironmentFacilities> = { files }
  const lease: EnvironmentLease = {
    placement: {
      kind: 'placement',
      binding: { kind: 'host_machine' },
      provider: { name: 'host', generation: '1', version: '1' },
      quotaDomain: 'test',
      filesScope: { read: root, write: root },
      continuity: { kind: 'not_guaranteed' },
      requirement: {
        allowedBindings: [{ kind: 'host_machine' }],
        isolation: [],
        facilities: ['files'],
      },
    },
    instance: { id: 'test', generation: '1' },
    continuity: { kind: 'not_guaranteed' },
    facility: key => facilities[key],
    invalidated: new Promise(() => {}),
    release: async () => ({ kind: 'released' }),
  }
  return createAuthorEnvironment({
    access: { principal: principalA, tenant: tenantA, call: callId('directory-replacement') },
    origin: originRef('test'),
    lease,
    naming: {
      name: async request =>
        succeed(
          await hostObjectToken(request.role === 'object' ? request.path : dirname(request.path)),
        ),
    },
    facts: {
      system: process.platform,
      release: 'test',
      architecture: process.arch,
      facilities: ['files'],
    },
    media: () => undefined,
    reportDirectoryVisits: true,
    directory: {
      path: root,
      workspace: { id: parsed.value, instance: 'instance' },
      generation: '1',
      files: { read: root, write: root },
    },
  })
}

it.each(['read', 'read-unrooted', 'copy', 'copy-read-unrooted', 'copy-write-unrooted'] as const)(
  'C2/C6 a real host %s cannot attest a sibling substituted after completion',
  async operation => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'visit-replacement-')))
    try {
      const source = join(root, 'entered')
      const target = join(root, 'target')
      const sibling = join(root, 'never-entered')
      await Promise.all([mkdir(source), mkdir(target), mkdir(sibling)])
      await writeFile(join(source, 'file'), 'actual host bytes')
      await writeFile(join(sibling, 'file'), 'never accessed bytes')
      const host = createHostFiles({
        ...(operation === 'copy-read-unrooted' || operation === 'read-unrooted'
          ? {}
          : { read: root }),
        ...(operation === 'copy-write-unrooted' ? {} : { write: root }),
      })
      const replace = async () => {
        for (const path of operation.startsWith('read') ? [source] : [source, target]) {
          await rename(path, path + '-moved')
          await symlink(sibling, path)
        }
      }
      const files: FileSystemFacility<unknown> = {
        ...host,
        read: async request => {
          const result = await host.read(request)
          if (result.kind === 'done') await replace()
          return result
        },
        copy: async request => {
          const result = await host.copy(request)
          if (result.kind === 'done') await replace()
          return result
        },
      }
      const value = author(root, files)
      const result = operation.startsWith('read')
        ? await value.files.read({ path: join(source, 'file') })
        : await value.files.copy({
            path: join(source, 'file'),
            target: { path: join(target, 'copy') },
            replace: false,
          })
      expect(result.kind).toBe('done')
      if (operation.startsWith('read') && result.kind === 'done' && 'bytes' in result.value)
        expect(new TextDecoder().decode(result.value.bytes)).toBe('actual host bytes')
      if (!operation.startsWith('read'))
        expect(await readFile(join(target + '-moved', 'copy'), 'utf8')).toBe('actual host bytes')
      expect(directoryVisitOf(value)?.directories).toEqual(
        operation.startsWith('read') ? [source] : [source, target].sort(),
      )
      expect(directoryVisitOf(value)?.directories).not.toContain(sibling)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  60000,
)

it('C6 an unrooted read follows the physical directory across either side of the workspace boundary', async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'visit-unrooted-')))
  try {
    const root = join(base, 'workspace')
    const actual = join(root, 'entered')
    const outside = join(base, 'workspace-neighbor')
    await mkdir(actual, { recursive: true })
    await mkdir(outside)
    await writeFile(join(actual, 'file'), 'internal bytes')
    await writeFile(join(outside, 'file'), 'external bytes')
    const outward = join(root, 'alias-out')
    const inward = join(outside, 'alias-in')
    await symlink(outside, outward)
    await symlink(actual, inward)
    const value = author(root, createHostFiles())
    const external = await value.files.read({ path: join(outward, 'file') })
    expect(external).toMatchObject({ kind: 'done', verifiedDirectories: [outside] })
    expect(directoryVisitOf(value)).toBeUndefined()
    const internal = await value.files.read({ path: join(inward, 'file') })
    expect(internal).toMatchObject({ kind: 'done', verifiedDirectories: [actual] })
    expect(directoryVisitOf(value)?.directories).toEqual([actual])
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}, 60000)
