// A host without descriptor paths (anything but Linux) answers `unavailable` to the eight
// operations that need them, and to every operation when a host file root is configured, without
// touching the file system. The four accepted operations keep their behaviour when no root is
// configured. The tests run on every host: on Linux the platform is replaced for the length of a
// test, on Windows it is the real one.
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { originRef, type FileRequest } from '@omne-harness/execution-environment-contract'
import { hostObjectToken } from '@omne-harness/execution-environment-host-local'
import { createHostFilesEngine } from '../src/host-files.ts'
import { probeHostFilesPrerequisite } from '../src/host-paths.ts'

const tenant = (() => {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
})()

const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
let root = ''
let missing = ''
let target = ''

beforeEach(async () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  root = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-env-')))
  missing = join(root, 'missing', 'notes.txt')
  target = join(root, 'target', 'copy.txt')
})

afterEach(async () => {
  if (realPlatform) Object.defineProperty(process, 'platform', realPlatform)
  await rm(root, { recursive: true, force: true })
})

function request(requestId: string): FileRequest<string> {
  return {
    requestId,
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: { kind: 'host_machine' },
    path: missing,
    named: { token: '1:2' },
  }
}

const unavailable = (requestId: string) => ({ kind: 'rejected', requestId, reason: 'unavailable' })

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

async function expectUntouched() {
  expect(await exists(join(root, 'missing'))).toBe(false)
  expect(await exists(join(root, 'target'))).toBe(false)
}

it('reports the descriptor-path prerequisite as unsatisfied', async () => {
  expect(await probeHostFilesPrerequisite()).toBe('unsatisfied')
})

it('answers unavailable to list and search without touching the file system', async () => {
  const files = createHostFilesEngine().facilityFor('platform')
  expect(await files.list(request('list'))).toEqual(unavailable('list'))
  expect(
    await files.search({
      ...request('search'),
      pattern: new TextEncoder().encode('needle'),
      match: 'content',
      recursive: true,
    }),
  ).toEqual(unavailable('search'))
  await expectUntouched()
})

it('answers unavailable to mkdir, remove, move and copy and changes nothing', async () => {
  const files = createHostFilesEngine().facilityFor('platform')
  expect(await files.mkdir({ ...request('mkdir'), parents: true })).toEqual(unavailable('mkdir'))
  expect(await files.remove({ ...request('remove'), recursive: true })).toEqual(
    unavailable('remove'),
  )
  expect(
    await files.move({
      ...request('move'),
      target: { path: target, named: { token: '1:2' } },
      replace: true,
    }),
  ).toEqual(unavailable('move'))
  expect(
    await files.copy({
      ...request('copy'),
      target: { path: target, named: { token: '1:2' } },
      replace: true,
    }),
  ).toEqual(unavailable('copy'))
  await expectUntouched()
})

it('answers unavailable to commitBatch and recoverBatch and publishes nothing', async () => {
  const files = createHostFilesEngine({ stateDirectory: root }).facilityFor('platform')
  const { path: _path, named: _named, ...base } = request('commit')
  expect(
    await files.commitBatch({
      ...base,
      entries: [
        {
          path: target,
          named: { token: '1:2' },
          bytes: new TextEncoder().encode('batch'),
          expectedVersion: null,
        },
      ],
    }),
  ).toEqual(unavailable('commit'))
  expect(
    await files.recoverBatch({
      ...base,
      requestId: 'recover',
      batch: { id: '00000000-0000-4000-8000-000000000000', generation: '1' },
    }),
  ).toEqual(unavailable('recover'))
  await expectUntouched()
})

it('still answers the four accepted operations when no root is configured', async () => {
  const path = join(root, 'notes.txt')
  await writeFile(path, 'kept')
  const named = await hostObjectToken(path)
  const files = createHostFilesEngine().facilityFor('platform')
  const read = await files.read({ ...request('read'), path, named })
  expect(read).toMatchObject({ kind: 'done', value: { eof: true } })
  expect(await files.stat({ ...request('stat'), path, named })).toMatchObject({ kind: 'done' })
  expect(await readFile(path, 'utf8')).toBe('kept')
})

it('answers unavailable to every operation when a root is configured, and does not fall back to no root', async () => {
  const path = join(root, 'notes.txt')
  await writeFile(path, 'kept')
  const named = await hostObjectToken(path)
  const files = createHostFilesEngine({ root }).facilityFor('platform')
  expect(await files.read({ ...request('read'), path, named })).toEqual(unavailable('read'))
  expect(await files.stat({ ...request('stat'), path, named })).toEqual(unavailable('stat'))
  expect(
    await files.write({
      ...request('write'),
      path,
      named,
      bytes: new Uint8Array(1),
      mode: 'replace',
    }),
  ).toEqual(unavailable('write'))
  expect(await files.list({ ...request('list'), path: root, named })).toEqual(unavailable('list'))
  expect(await readFile(path, 'utf8')).toBe('kept')
})
