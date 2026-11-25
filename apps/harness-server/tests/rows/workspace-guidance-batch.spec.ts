// @module-tag slow
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { workspaceCodec } from '@omne-harness/legal-identity'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import {
  originRef,
  type EnvironmentLease,
  type EnvironmentFacilities,
  type FileSystemFacility,
  type FilesScope,
} from '@omne-harness/execution-environment-contract'
import { createAuthorEnvironment } from '../../../../packages/tool/tool-host-local/src/author-environment.ts'
import { directoryVisitOf } from '../../../../packages/tool/tool-host-local/src/directory-visits.ts'
import {
  createHostFilesEngine,
  hostObjectToken,
} from '../../../../packages/execution/execution-environment-host-local/src/host-files.ts'
import {
  prepareNativeHooks,
  spawnWithNativeHooks,
} from '../../../../packages/execution/execution-environment-host-local/tests/macos-files/native-hooks.ts'

const fault = vi.hoisted(() => ({ path: '' }))
vi.mock(
  '../../../../packages/execution/execution-environment-host-local/src/macos-files/launcher.ts',
  () => ({
    spawnFilesHelper: (executable: string) =>
      spawnWithNativeHooks(executable, async (fn, paths) => {
        if (fn === 'rename' && fault.path !== '' && paths.some(path => path.endsWith(fault.path))) {
          fault.path = ''
          throw Object.assign(new Error('injected publication failure'), { code: 'EIO' })
        }
      }),
  }),
)

async function fixture(rooted: boolean) {
  if (process.platform === 'darwin') await prepareNativeHooks()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-batch-receipt-')))
  onTestFinished(async () => {
    fault.path = ''
    await rm(root, { recursive: true, force: true })
  })
  const paths = ['one', 'two'].map(name => join(root, name, name + '.txt'))
  const state = join(root, 'state')
  await mkdir(state)
  for (const path of paths) {
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, 'original')
  }
  const scope: FilesScope = rooted ? { read: root, write: root } : {}
  const facility = createHostFilesEngine({ stateDirectory: state, scope }).facilityFor(
    'receipt-test',
  )
  const workspace = workspaceCodec.parse('wsp_00000000000000000000000000')
  const call = decodeToolCallId('batch-receipt')
  if (!workspace.ok || 'failure' in call) throw new Error('invalid test identity')
  const tenant = testingTenant('org_0123456789abcdefghjkmnpqrs', 'acc_0123456789abcdefghjkmnpqrs')
  const origin = originRef('batch-receipt')
  const offered: Partial<EnvironmentFacilities> = { files: facility }
  const lease: EnvironmentLease = {
    placement: {
      kind: 'placement',
      binding: { kind: 'host_machine' },
      provider: { name: 'native', generation: '1', version: '1' },
      quotaDomain: 'native',
      continuity: { kind: 'not_guaranteed' },
      requirement: {
        allowedBindings: [{ kind: 'host_machine' }],
        isolation: [],
        facilities: ['files'],
      },
    },
    instance: { id: 'native', generation: '1' },
    continuity: { kind: 'not_guaranteed' },
    facility: key => offered[key],
    invalidated: new Promise(() => {}),
    release: async () => ({ kind: 'released' }),
  }
  const environment = (files: FileSystemFacility<unknown> = facility) => {
    const offered: Partial<EnvironmentFacilities> = { files }
    return createAuthorEnvironment({
      access: { principal: 'tester', tenant, call: call.ok },
      origin,
      lease: { ...lease, facility: key => offered[key] },
      naming: { name: async ({ path }) => succeed(await hostObjectToken(path)) },
      facts: {
        system: process.platform,
        architecture: process.arch,
        release: 'test',
        facilities: ['files'],
      },
      media: () => undefined,
      reportDirectoryVisits: true,
      directory: {
        path: root,
        files: scope,
        workspace: { id: workspace.value, instance: 'native' },
        generation: '1',
      },
    })
  }
  const entries = []
  for (const path of paths) {
    const current = await facility.stat({
      requestId: 'stat-' + path,
      access: { principal: 'tester', tenant },
      origin,
      binding: { kind: 'host_machine' },
      path,
      named: await hostObjectToken(path),
    })
    if (current.kind !== 'done') throw new Error(JSON.stringify(current))
    entries.push({
      path,
      bytes: new TextEncoder().encode('published'),
      expectedVersion: current.value.version,
    })
  }
  return { root, paths, entries, facility, environment }
}

// Native syscall injection is exercised on the macOS host.
it
  .skipIf(process.platform !== 'darwin')
  .each(['committed', 'partial', 'rejected', 'lost-reply', 'unrooted'] as const)(
  'C2 native batch %s reports only confirmed publications and recovery adds no visit',
  { tags: ['slow'], timeout: 120_000 },
  async mode => {
    const f = await fixture(mode !== 'unrooted')
    const first = f.paths[0]!,
      second = f.paths[1]!
    if (mode === 'partial') fault.path = '/two.txt'
    const captured: Awaited<ReturnType<FileSystemFacility<unknown>['commitBatch']>>[] = []
    const commitBatch = vi.fn<FileSystemFacility<unknown>['commitBatch']>(async request => {
      const result = await f.facility.commitBatch(request)
      captured.push(result)
      return mode === 'lost-reply' ? { kind: 'unknown', requestId: request.requestId } : result
    })
    const environment = f.environment({ ...f.facility, commitBatch })
    const entries =
      mode === 'rejected'
        ? f.entries.map(entry => ({ ...entry, expectedVersion: 'stale' }))
        : f.entries
    const result = await environment.files.commitBatch({ entries })
    expect(commitBatch).toHaveBeenCalledTimes(1)
    expect(await readFile(first, 'utf8')).toBe(mode === 'rejected' ? 'original' : 'published')
    expect(await readFile(second, 'utf8')).toBe(
      mode === 'partial' || mode === 'rejected' ? 'original' : 'published',
    )
    const directories =
      mode === 'committed' || mode === 'unrooted'
        ? [join(f.root, 'one'), join(f.root, 'two')]
        : mode === 'partial'
          ? [join(f.root, 'one')]
          : undefined
    expect(directoryVisitOf(environment)?.directories).toEqual(directories)
    const actual = captured[0]!
    if (mode === 'rejected') {
      expect(result).toMatchObject({ kind: 'rejected', reason: 'conflict' })
      return
    }
    expect(actual.kind).toBe('done')
    if (actual.kind !== 'done') throw new Error('native receipt missing')
    expect(actual.value).toMatchObject({
      kind: mode === 'partial' ? 'unknown' : 'committed',
      published: mode === 'partial' ? [first] : [first, second],
    })
    if (mode === 'lost-reply') expect(result.kind).toBe('unknown')
    const recoveredBy = f.environment()
    const recovered = await recoveredBy.files.recoverBatch({ batch: actual.value.batch })
    expect(recovered).toMatchObject({ kind: 'done', value: { published: actual.value.published } })
    expect(directoryVisitOf(recoveredBy)).toBeUndefined()
    expect(directoryVisitOf(environment)?.directories).toEqual(directories)
    expect(commitBatch).toHaveBeenCalledTimes(1)
  },
)
