import { access, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { originRef, type FileRequest } from '@omne-harness/execution-environment-contract'
import { createHostFiles } from '@omne-harness/execution-environment-host-local'

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

let root = ''
let missing = ''
let target = ''

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-env-')))
  missing = join(root, 'missing', 'notes.txt')
  target = join(root, 'target', 'copy.txt')
})

afterEach(async () => {
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

it('replies unsupported to list without touching the file system', async () => {
  const result = await createHostFiles().list(request('list'))
  expect(result).toEqual({ kind: 'rejected', requestId: 'list', reason: 'unsupported' })
  await expectUntouched()
})

it('replies unsupported to search without touching the file system', async () => {
  const result = await createHostFiles().search({
    ...request('search'),
    pattern: new TextEncoder().encode('needle'),
    match: 'content',
    recursive: true,
  })
  expect(result).toEqual({ kind: 'rejected', requestId: 'search', reason: 'unsupported' })
  await expectUntouched()
})

it('replies unsupported to mkdir and creates no directory', async () => {
  const result = await createHostFiles().mkdir({ ...request('mkdir'), parents: true })
  expect(result).toEqual({ kind: 'rejected', requestId: 'mkdir', reason: 'unsupported' })
  await expectUntouched()
})

it('replies unsupported to remove without touching the file system', async () => {
  const result = await createHostFiles().remove({ ...request('remove'), recursive: true })
  expect(result).toEqual({ kind: 'rejected', requestId: 'remove', reason: 'unsupported' })
  await expectUntouched()
})

it('replies unsupported to move and creates no target', async () => {
  const result = await createHostFiles().move({
    ...request('move'),
    target: { path: target, named: null },
    replace: true,
  })
  expect(result).toEqual({ kind: 'rejected', requestId: 'move', reason: 'unsupported' })
  await expectUntouched()
})

it('replies unsupported to copy and creates no target', async () => {
  const result = await createHostFiles().copy({
    ...request('copy'),
    target: { path: target, named: null },
    replace: true,
  })
  expect(result).toEqual({ kind: 'rejected', requestId: 'copy', reason: 'unsupported' })
  await expectUntouched()
})

it('replies unsupported to commitBatch and publishes nothing', async () => {
  const { path: _path, named: _named, ...base } = request('commit')
  const result = await createHostFiles().commitBatch({
    ...base,
    entries: [
      {
        path: target,
        named: null,
        bytes: new TextEncoder().encode('batch'),
        expectedVersion: null,
      },
    ],
  })
  expect(result).toEqual({ kind: 'rejected', requestId: 'commit', reason: 'unsupported' })
  await expectUntouched()
})

it('replies unsupported to recoverBatch without touching the file system', async () => {
  const { path: _path, named: _named, ...base } = request('recover')
  const result = await createHostFiles().recoverBatch({
    ...base,
    batch: { id: 'batch-1', generation: '1' },
  })
  expect(result).toEqual({ kind: 'rejected', requestId: 'recover', reason: 'unsupported' })
  await expectUntouched()
})
