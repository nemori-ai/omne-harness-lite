// Domain state x operation cells (SQL contract SPEC 5.5, scenario C7). One test per cell, on the
// real provider with a real file and real Workers. The cell is the name prefix of the test.
//
// Cell to test name (row x column):
//   absent           x registerCombination, commit, query, read   [absent x ...]
//   other scope      x registerCombination, commit, query, read   [other scope x ...]
//   unopened         x registerCombination, commit, query, read   [unopened x ...]
//   open failure     x registerCombination, commit, query, read   [open failure x ...]
//   ready            x registerCombination, commit, query, read   [ready x ...]
//   quarantined      x registerCombination, commit, query, read   [quarantined x ...]
//   closed           x registerCombination, commit, query, read   [closed x ...]
// Cells with a test elsewhere:
//   opening (queued operations get the result of the open): the [open failure x ...] cells send
//     the four operations together while the open is still pending.
//   draining x commit, registerCombination, query: close.spec.ts, "close steps (13.3)".
//   read-paused, write-stopped x commit, query, read: wal.spec.ts, "write-stopped through the provider".
// Cells without a test:
//   read-paused, write-stopped x registerCombination; draining x read.
//   recovering (writer_not_current): the provider does not give writer_not_current; the SPEC
//     marks it as proposal P-08.
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReadRequest } from '@omne-harness/sql-contract'
import {
  DOMAIN,
  TENANT_A,
  TENANT_B,
  commitRequest,
  createProvider,
  identity,
  kindOf,
  makeWorkspace,
  registration,
  type Built,
  type Provider,
  type Workspace,
} from './support.ts'
import { buildReadMaterials, readRequest, summary } from './read-support.ts'

const hex = (text: string): string => Buffer.from(text, 'utf8').toString('hex')

let workspace: Workspace
let built: Built
const providers: Provider[] = []

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildReadMaterials(workspace)
})

afterEach(async () => {
  for (const provider of providers.splice(0))
    await provider.control.close({ initiator: 'disposal' }).catch(() => undefined)
  await workspace.remove()
})

async function provide(): Promise<Provider> {
  const provider = await createProvider(workspace, built)
  providers.push(provider)
  return provider
}

/** Registers the combination and makes one commit (key "seed") durable, then closes the provider. */
async function seededFile(): Promise<void> {
  const first = await provide()
  await first.storage.registerCombination(registration(built))
  await first.storage.commit(commitRequest(built, { identity: identity({ operationKey: 'seed' }) }))
  await first.control.close({ initiator: 'disposal' })
}

const domainFile = (name: string = DOMAIN): string =>
  join(workspace.storageRoot, 'domains', `${hex(name)}.sqlite`)

const readIn = (scope: ReadRequest['domain']['scope'], domain: string): ReadRequest => ({
  ...readRequest('page'),
  domain: { scope, transactionDomain: domain },
})

describe('absent (SPEC 5.5)', () => {
  it('[absent x registerCombination] takes path B and registers', async () => {
    const { storage } = await provide()
    expect((await storage.registerCombination(registration(built))).kind).toBe('registered')
  })
  it('[absent x commit] is combination_unregistered', async () => {
    const { storage } = await provide()
    expect(kindOf(await storage.commit(commitRequest(built)))).toBe(
      'rejected_before_accept/combination_unregistered',
    )
  })
  it('[absent x query] is unknown', async () => {
    const { storage } = await provide()
    expect((await storage.query(identity())).kind).toBe('unknown')
  })
  it('[absent x read] is domain_unavailable', async () => {
    const { storage } = await provide()
    expect(summary(await storage.read(readRequest('page')))).toBe('unavailable/domain_unavailable')
  })
})

describe('bound to another scope (SPEC 5.5)', () => {
  beforeEach(async () => {
    await seededFile()
  })

  // The first touch of the file is this registration, so the provider opens it through path A.
  // The scope check must still run after that open.
  it('[other scope x registerCombination] is domain_occupied', async () => {
    const { storage } = await provide()
    expect(
      kindOf(await storage.registerCombination(registration(built, { scope: TENANT_B }))),
    ).toBe('rejected_before_accept/domain_occupied')
  })
  it('[other scope x commit] is combination_unregistered', async () => {
    const { storage } = await provide()
    const request = commitRequest(built, { identity: identity({ scope: TENANT_B }) })
    expect(kindOf(await storage.commit(request))).toBe(
      'rejected_before_accept/combination_unregistered',
    )
  })
  it('[other scope x query] is unknown, though the key exists for the bound scope', async () => {
    const { storage } = await provide()
    const result = await storage.query(identity({ scope: TENANT_B, operationKey: 'seed' }))
    expect(result.kind).toBe('unknown')
  })
  it('[other scope x read] is domain_unavailable', async () => {
    const { storage } = await provide()
    expect(summary(await storage.read(readIn(TENANT_B, DOMAIN)))).toBe(
      'unavailable/domain_unavailable',
    )
  })
})

describe('unopened: a file exists, no provider has touched it (SPEC 5.5, path A)', () => {
  beforeEach(async () => {
    await seededFile()
  })
  it('[unopened x registerCombination] opens, then behaves as ready', async () => {
    const { storage } = await provide()
    expect((await storage.registerCombination(registration(built))).kind).toBe('registered')
  })
  it('[unopened x commit] opens, then commits', async () => {
    const { storage } = await provide()
    const request = commitRequest(built, { identity: identity({ operationKey: 'new' }) })
    expect(kindOf(await storage.commit(request))).toBe('committed')
  })
  it('[unopened x query] opens, then recognizes the durable receipt', async () => {
    const { storage } = await provide()
    expect(kindOf(await storage.query(identity({ operationKey: 'seed' })))).toBe('committed')
  })
  it('[unopened x read] opens, then reads', async () => {
    const { storage } = await provide()
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
  })
})

describe('open failure: the operations wait for an open that fails (SPEC 5.5)', () => {
  beforeEach(async () => {
    await mkdir(join(workspace.storageRoot, 'domains'), { recursive: true })
    await writeFile(domainFile(), 'this is not a database, but long enough to be read as a header')
  })
  // All four are issued before any of them settles, so each waits for the same open.
  async function together(): Promise<{
    register: Awaited<ReturnType<Provider['storage']['registerCombination']>>
    commit: Awaited<ReturnType<Provider['storage']['commit']>>
    query: Awaited<ReturnType<Provider['storage']['query']>>
    read: Awaited<ReturnType<Provider['storage']['read']>>
  }> {
    const { storage } = await provide()
    const [register, commit, query, read] = await Promise.all([
      storage.registerCombination(registration(built)),
      storage.commit(commitRequest(built)),
      storage.query(identity()),
      storage.read(readRequest('page')),
    ])
    return { register, commit, query, read }
  }
  it('[open failure x registerCombination] is domain_unavailable', async () => {
    expect(kindOf((await together()).register)).toBe('rejected_before_accept/domain_unavailable')
  })
  it('[open failure x commit] is domain_unavailable', async () => {
    expect(kindOf((await together()).commit)).toBe('rejected_before_accept/domain_unavailable')
  })
  it('[open failure x query] is unknown', async () => {
    expect((await together()).query.kind).toBe('unknown')
  })
  it('[open failure x read] is domain_unavailable', async () => {
    expect(summary((await together()).read)).toBe('unavailable/domain_unavailable')
  })
})

describe('ready (SPEC 5.5)', () => {
  let provider: Provider
  beforeEach(async () => {
    provider = await provide()
    await provider.storage.registerCombination(registration(built))
    await provider.storage.commit(
      commitRequest(built, { identity: identity({ operationKey: 'seed' }) }),
    )
  })
  it('[ready x registerCombination] registers again without change', async () => {
    expect((await provider.storage.registerCombination(registration(built))).kind).toBe(
      'registered',
    )
  })
  it('[ready x commit] commits', async () => {
    const request = commitRequest(built, { identity: identity({ operationKey: 'new' }) })
    expect(kindOf(await provider.storage.commit(request))).toBe('committed')
  })
  it('[ready x query] recognizes the durable receipt', async () => {
    expect(kindOf(await provider.storage.query(identity({ operationKey: 'seed' })))).toBe(
      'committed',
    )
  })
  it('[ready x read] reads', async () => {
    expect(summary(await provider.storage.read(readRequest('page')))).toBe('read')
  })
})

describe('quarantined: the binding row does not match the file path (SPEC 5.5)', () => {
  const quarantined = 'domain-b'
  let provider: Provider
  beforeEach(async () => {
    await seededFile()
    await copyFile(domainFile(), domainFile(quarantined))
    provider = await provide()
  })
  const identityB = (): ReturnType<typeof identity> => identity({ transactionDomain: quarantined })

  it('[quarantined x registerCombination] is domain_unavailable', async () => {
    const result = await provider.storage.registerCombination(
      registration(built, { transactionDomain: quarantined }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/domain_unavailable')
  })
  it('[quarantined x commit] is domain_unavailable', async () => {
    const result = await provider.storage.commit(commitRequest(built, { identity: identityB() }))
    expect(kindOf(result)).toBe('rejected_before_accept/domain_unavailable')
  })
  it('[quarantined x query] is unknown', async () => {
    expect((await provider.storage.query(identityB())).kind).toBe('unknown')
  })
  it('[quarantined x read] is domain_unavailable', async () => {
    const result = await provider.storage.read(readIn(TENANT_A, quarantined))
    expect(summary(result)).toBe('unavailable/domain_unavailable')
  })
})

describe('closed: after close returned closed (SPEC 5.5)', () => {
  let provider: Provider
  beforeEach(async () => {
    provider = await provide()
    await provider.storage.registerCombination(registration(built))
    await provider.storage.commit(commitRequest(built))
    expect(await provider.control.close({ initiator: 'assembly' })).toEqual({ kind: 'closed' })
  })
  it('[closed x registerCombination] is closing', async () => {
    expect(kindOf(await provider.storage.registerCombination(registration(built)))).toBe(
      'rejected_before_accept/closing',
    )
  })
  it('[closed x commit] is closing', async () => {
    const request = commitRequest(built, { identity: identity({ operationKey: 'late' }) })
    expect(kindOf(await provider.storage.commit(request))).toBe('rejected_before_accept/closing')
  })
  it('[closed x query] is unknown', async () => {
    expect((await provider.storage.query(identity())).kind).toBe('unknown')
  })
  it('[closed x read] is unavailable', async () => {
    const result = await provider.storage.read(readRequest('page'))
    expect(result.kind).toBe('unavailable')
  })
})
