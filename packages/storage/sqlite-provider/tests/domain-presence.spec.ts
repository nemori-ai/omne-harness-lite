// Whether a domain file exists is three-valued (SPEC 5.2): present, missing (only ENOENT), or
// unknown (any other error of stat). Unknown is a transient fault: it is not `absent`, it is not
// remembered, and it never leads to the removal of files.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  buildMaterials,
  commitRequest,
  createProvider,
  DOMAIN,
  identity,
  kindOf,
  makeWorkspace,
  recordingLeases,
  registration,
  type Built,
  type Provider,
  type Workspace,
} from './support.ts'

const fault = vi.hoisted(() => ({ statDenied: null as string | null, writerFails: false }))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const stat = ((path: Parameters<typeof actual.stat>[0], ...rest: unknown[]) =>
    fault.statDenied !== null && String(path) === fault.statDenied
      ? Promise.reject(
          Object.assign(new Error(`EACCES: permission denied, stat '${String(path)}'`), {
            code: 'EACCES',
            errno: -13,
            syscall: 'stat',
          }),
        )
      : (actual.stat as (...args: unknown[]) => unknown)(path, ...rest)) as typeof actual.stat
  return { ...actual, stat }
})

vi.mock('node:worker_threads', async importOriginal => {
  const actual = await importOriginal<typeof import('node:worker_threads')>()
  return {
    ...actual,
    Worker: class extends actual.Worker {
      constructor(...args: ConstructorParameters<typeof actual.Worker>) {
        if (fault.writerFails && String(args[0]).includes('/worker/writer.'))
          throw Object.assign(new Error('EAGAIN'), { code: 'ERR_WORKER_INIT_FAILED' })
        super(...args)
      }
    },
  }
})

const hex = (text: string): string => Buffer.from(text, 'utf8').toString('hex')

let workspace: Workspace
let built: Built
const providers: Provider[] = []

const domainsDir = (): string => join(workspace.storageRoot, 'domains')
const domainFile = (): string => join(domainsDir(), `${hex(DOMAIN)}.sqlite`)

async function provide(leases = recordingLeases()): Promise<Provider> {
  const provider = await createProvider(workspace, built, {}, leases)
  providers.push(provider)
  return provider
}

/** A domain registered and written by an earlier provider generation, then closed. */
async function existingDomain(): Promise<void> {
  const first = await provide()
  expect(kindOf(await first.storage.registerCombination(registration(built)))).toBe('registered')
  expect(kindOf(await first.storage.commit(commitRequest(built)))).toBe('committed')
  expect(await first.control.close({ initiator: 'disposal' })).toEqual({ kind: 'closed' })
}

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildMaterials(workspace)
})

afterEach(async () => {
  fault.statDenied = null
  fault.writerFails = false
  for (const provider of providers.splice(0))
    await provider.control.close({ initiator: 'disposal' }).catch(() => undefined)
  await workspace.remove()
})

it('answers an existing domain whose presence cannot be read as unavailable, not as unregistered', async () => {
  await existingDomain()
  const provider = await provide()
  fault.statDenied = domainFile()
  const second = commitRequest(built, { identity: identity({ operationKey: 'key-2' }) })
  expect(kindOf(await provider.storage.commit(second))).toBe(
    'rejected_before_accept/domain_unavailable',
  )
  expect(kindOf(await provider.storage.query(identity()))).toBe('unknown')
  // Unknown is not remembered: once stat answers again, the same domain commits.
  fault.statDenied = null
  expect(kindOf(await provider.storage.commit(second))).toBe('committed')
  expect(kindOf(await provider.storage.query(identity()))).toBe('committed')
})

it('starts no Worker and removes no file when a registration cannot read the presence', async () => {
  await existingDomain()
  const before = (await readdir(domainsDir())).sort()
  const leases = recordingLeases()
  const provider = await provide(leases)
  fault.statDenied = domainFile()
  // The Worker would fail to start too: with the presence taken as missing, its cleanup would
  // remove the files of a domain that exists.
  fault.writerFails = true
  expect(kindOf(await provider.storage.registerCombination(registration(built)))).toBe(
    'rejected_before_accept/domain_unavailable',
  )
  expect((await readdir(domainsDir())).sort()).toEqual(before)
  expect(leases.admitted.filter(name => name.includes('/writer/'))).toEqual([])
  fault.statDenied = null
  fault.writerFails = false
  expect(kindOf(await provider.storage.registerCombination(registration(built)))).toBe('registered')
  expect(kindOf(await provider.storage.query(identity()))).toBe('committed')
})
