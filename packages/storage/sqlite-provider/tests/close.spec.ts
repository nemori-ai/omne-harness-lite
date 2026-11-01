// Close protocol (SQL contract SPEC 13, C12/C14): the steps of 13.3, the reporting latch of 13.4
// and the in-process writer exclusion of 13.5. A commit that spins in the participant keeps the
// write Worker busy, so each test controls what is in flight when `close` runs.
import { appendFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommitResultV2, SqlIdentity } from '@omne-harness/sql-contract'
import {
  buildMaterials,
  command,
  commitRequest,
  createProvider,
  identity,
  kindOf,
  makeWorkspace,
  recordingLeases,
  registration,
  type Built,
  type Provider,
  type RecordingLeases,
  type Workspace,
} from './support.ts'
import { domainFile } from './group-support.ts'

let workspace: Workspace
let built: Built
let leases: RecordingLeases
const providers: Provider[] = []

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildMaterials(workspace)
  leases = recordingLeases()
})

afterEach(async () => {
  for (const provider of providers.splice(0))
    await provider.control.close({ initiator: 'disposal' }).catch(() => undefined)
  await workspace.remove()
})

async function ready(config = {}, port: RecordingLeases = leases): Promise<Provider> {
  const provider = await createProvider(workspace, built, config, port)
  providers.push(provider)
  const result = await provider.storage.registerCombination(registration(built))
  if (result.kind !== 'registered') throw new Error(`registration is ${result.kind}`)
  return provider
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const keyOf = (key: string): SqlIdentity => identity({ operationKey: key })

function spinning(key: string, ms: number): ReturnType<typeof commitRequest> {
  return commitRequest(built, {
    identity: keyOf(key),
    commands: [command('ledger', { mode: 'spin', ms: String(ms), note: key })],
  })
}

const plain = (key: string): ReturnType<typeof commitRequest> =>
  commitRequest(built, {
    identity: keyOf(key),
    commands: [command('ledger', { note: key })],
  })

/** The commit is posted to the Worker, which is now busy with it. */
async function startSpinning(
  provider: Provider,
  key: string,
  ms: number,
): Promise<{ result: Promise<CommitResultV2> }> {
  const result = provider.storage.commit(spinning(key, ms))
  await sleep(150)
  return { result }
}

describe('close steps (13.3)', () => {
  it('withdraws unstarted commit, registerCombination and query, and lets the running commit finish', async () => {
    const provider = await ready()
    const { result: running } = await startSpinning(provider, 'running', 500)
    const queuedCommit = provider.storage.commit(plain('queued'))
    const queuedRegister = provider.storage.registerCombination(registration(built))
    const queuedQuery = provider.storage.query(keyOf('queued'))
    const closing = provider.control.close({ initiator: 'disposal' })

    expect(kindOf(await queuedCommit)).toBe('unknown')
    expect(await queuedCommit).toMatchObject({ diagnostic: 'withdrawn_before_start' })
    expect(await queuedRegister).toMatchObject({
      kind: 'unknown',
      diagnostic: 'withdrawn_before_start',
    })
    expect(await queuedQuery).toMatchObject({ kind: 'unknown' })
    expect(kindOf(await running)).toBe('committed')
    expect(await closing).toEqual({ kind: 'closed' })

    // The withdrawn commit left no receipt; the running one is durable. A new generation sees both.
    const next = await createProvider(workspace, built, {}, recordingLeases())
    providers.push(next)
    expect(kindOf(await next.storage.query(keyOf('queued')))).toBe('not_committed')
    expect(kindOf(await next.storage.query(keyOf('running')))).toBe('committed')
  })

  it('gives incomplete with residuals at the deadline, and reports the in-flight commit as unknown, not rolled back', async () => {
    const provider = await ready({ closeDeadlineMs: 200 })
    const { result: running } = await startSpinning(provider, 'slow', 900)
    const started = Date.now()
    const result = await provider.control.close({ initiator: 'disposal' })
    expect(Date.now() - started).toBeLessThan(700)
    expect(result.kind).toBe('incomplete')
    if (result.kind !== 'incomplete') return
    expect(result.residuals).toHaveLength(1)
    const [residual] = result.residuals
    expect(residual).toMatchObject({
      workerRole: 'writer',
      domain: { scope: { kind: 'tenant', tenant: 'tenant-a' }, transactionDomain: 'domain-a' },
    })
    expect(residual?.leaseName).toBe(leases.admitted[0])
    expect(residual?.inFlight).toEqual([keyOf('slow')])

    // The caller is answered at the deadline, before the Worker is done.
    const answered = await Promise.race([running, sleep(300).then(() => 'still waiting' as const)])
    expect(answered).toMatchObject({ kind: 'unknown', diagnostic: 'close_deadline' })
    // The Worker was not stopped: the write finishes and stays durable (SPEC 13.3).
    await vi.waitFor(() => expect(leases.released).toHaveLength(1), { timeout: 5000 })
    const next = await createProvider(workspace, built, {}, recordingLeases())
    providers.push(next)
    expect(kindOf(await next.storage.query(keyOf('slow')))).toBe('committed')
    // A late message does not rewrite what was given.
    expect(await running).toMatchObject({ kind: 'unknown', diagnostic: 'close_deadline' })
  })

  it('keeps one deadline: a second call does not extend it, and a later call sees closed', async () => {
    const provider = await ready({ closeDeadlineMs: 300 })
    await startSpinning(provider, 'slow', 900)
    const first = await provider.control.close({ initiator: 'disposal' })
    expect(first.kind).toBe('incomplete')
    const again = Date.now()
    expect((await provider.control.close({ initiator: 'disposal' })).kind).toBe('incomplete')
    expect(Date.now() - again).toBeLessThan(150)
    await vi.waitFor(() => expect(leases.released).toHaveLength(1), { timeout: 5000 })
    expect(await provider.control.close({ initiator: 'disposal' })).toEqual({ kind: 'closed' })
  })
})

describe('close after a quarantine (13.3 step 5)', () => {
  it('returns closed only after the write Worker of a quarantined domain has exited', async () => {
    const provider = await ready()
    // The participant file changes after construction: the Worker sees a digest mismatch.
    await appendFile(built.files['participant-ledger'] as string, '\n// changed\n')
    expect(kindOf(await provider.storage.commit(plain('a')))).toBe(
      'rejected_before_accept/domain_unavailable',
    )
    const writer = leases.admitted.find(name => name.includes('/writer/'))
    expect(await provider.control.close({ initiator: 'assembly' })).toEqual({ kind: 'closed' })
    expect(leases.released).toContain(writer)
  })
})

describe('a Worker that ends is not a rollback', () => {
  it('gives unknown (worker_exited) when the Worker ends under a commit, and reopens at the next touch', async () => {
    const provider = await ready()
    const result = await provider.storage.commit(
      commitRequest(built, {
        identity: keyOf('dies'),
        commands: [command('ledger', { mode: 'die' })],
      }),
    )
    expect(result).toMatchObject({ kind: 'unknown', diagnostic: 'worker_exited' })
    expect(kindOf(await provider.storage.commit(plain('after')))).toBe('committed')
    expect(kindOf(await provider.storage.query(keyOf('dies')))).toBe('not_committed')
  })
})

describe('reporting latch (13.4)', () => {
  it('does not release when the Worker exits before the report is settled; releases on settle', async () => {
    const provider = await ready({ closeDeadlineMs: 150 })
    await startSpinning(provider, 'slow', 500)
    expect((await provider.control.close({ initiator: 'assembly' })).kind).toBe('incomplete')
    await sleep(1200) // the spin has ended and the Worker has exited
    expect(leases.released).toEqual([])
    provider.control.assemblyReportSettled()
    expect(leases.released).toEqual([leases.admitted[0]])
    provider.control.assemblyReportSettled()
    expect(leases.released).toHaveLength(1)
  })

  it('releases at the exit when the report was settled first', async () => {
    const provider = await ready({ closeDeadlineMs: 150 })
    await startSpinning(provider, 'slow', 700)
    expect((await provider.control.close({ initiator: 'assembly' })).kind).toBe('incomplete')
    provider.control.assemblyReportSettled()
    expect(leases.released).toEqual([])
    await vi.waitFor(() => expect(leases.released).toEqual([leases.admitted[0]]), { timeout: 5000 })
  })

  it('sets no latch when only disposal got incomplete', async () => {
    const provider = await ready({ closeDeadlineMs: 150 })
    await startSpinning(provider, 'slow', 500)
    expect((await provider.control.close({ initiator: 'disposal' })).kind).toBe('incomplete')
    await vi.waitFor(() => expect(leases.released).toHaveLength(1), { timeout: 5000 })
  })
})

describe('one writer per file in the process (13.5)', () => {
  it('does not start a second writer while the old generation Worker is alive', async () => {
    const first = await ready({ closeDeadlineMs: 150 })
    await startSpinning(first, 'slow', 800)
    expect((await first.control.close({ initiator: 'disposal' })).kind).toBe('incomplete')

    const secondLeases = recordingLeases()
    const second = await createProvider(workspace, built, {}, secondLeases)
    providers.push(second)
    const blocked = await second.storage.commit(plain('other'))
    expect(kindOf(blocked)).toBe('rejected_before_accept/domain_unavailable')
    expect(secondLeases.admitted).toEqual([])

    // After the old Worker exit is observed the new generation takes the claim.
    await vi.waitFor(() => expect(leases.released).toHaveLength(1), { timeout: 5000 })
    expect(kindOf(await second.storage.commit(plain('other')))).toBe('committed')
    expect(secondLeases.admitted).toHaveLength(1)
  })

  // The claim is keyed by the file, not by the path text (SPEC 13.5).
  it.runIf(process.platform === 'win32')(
    'does not start a second writer through a storage root that differs only in drive-letter case',
    async () => {
      const first = await ready()
      expect(kindOf(await first.storage.commit(plain('a')))).toBe('committed')
      const root = workspace.storageRoot
      const flipped =
        root.charAt(0).toLowerCase() === root.charAt(0)
          ? root.charAt(0).toUpperCase()
          : root.charAt(0).toLowerCase()
      const secondLeases = recordingLeases()
      const second = await createProvider(
        workspace,
        built,
        { storageRoot: flipped + root.slice(1) },
        secondLeases,
      )
      providers.push(second)
      expect(kindOf(await second.storage.commit(plain('b')))).toBe(
        'rejected_before_accept/domain_unavailable',
      )
      expect(secondLeases.admitted).toEqual([])
    },
  )

  it('does not start a second writer through a linked storage root', async () => {
    const first = await ready()
    expect(kindOf(await first.storage.commit(plain('a')))).toBe('committed')
    const alias = join(workspace.root, 'alias')
    await symlink(workspace.storageRoot, alias, 'junction')
    const secondLeases = recordingLeases()
    const second = await createProvider(workspace, built, { storageRoot: alias }, secondLeases)
    providers.push(second)
    expect(kindOf(await second.storage.commit(plain('b')))).toBe(
      'rejected_before_accept/domain_unavailable',
    )
    expect(secondLeases.admitted).toEqual([])
  })

  // SPEC 7.5 step 1: the group checks the write generation after BEGIN IMMEDIATE.
  it('gives unknown to the group of a Worker whose write generation another opener advanced', async () => {
    const provider = await ready()
    expect(kindOf(await provider.storage.commit(plain('a')))).toBe('committed')
    const other = new DatabaseSync(domainFile(workspace), { timeout: 5000 })
    try {
      other.exec('update _sql_generation set generation = generation + 1')
    } finally {
      other.close()
    }
    expect(await provider.storage.commit(plain('stale'))).toMatchObject({
      kind: 'unknown',
      diagnostic: 'write_generation_changed',
    })
    // The Worker ends. The next touch opens the domain again with a new write generation.
    await vi.waitFor(() => expect(leases.released).toHaveLength(1), { timeout: 5000 })
    expect(kindOf(await provider.storage.query(keyOf('stale')))).toBe('not_committed')
    expect(kindOf(await provider.storage.commit(plain('fresh')))).toBe('committed')
  })

  it('gives closing to a call on the old generation', async () => {
    const first = await ready()
    await first.control.close({ initiator: 'disposal' })
    expect(kindOf(await first.storage.commit(plain('late')))).toBe('rejected_before_accept/closing')
  })
})
