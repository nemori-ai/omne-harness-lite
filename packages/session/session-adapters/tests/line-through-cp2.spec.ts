// CP2, the second in-line checkpoint (E.1): the Agent Journal and the Session log commit together
// in one tenant transaction domain on the real sqlite-provider, and a process killed after the
// commit is answered by its original operation identity in a new process.
//
// Real: the sqlite-provider (real write Worker, read Workers, files in a temporary directory); the
// Session storage port of session-storage-sql (create and startRun, which writes the execution
// index); the `agentJournal` plugin `SessionLogAgentJournalProvider` on real Cordis 4.0.4, which
// routes by tenant and execution to `createSessionLogJournal`; a child process started with plain
// `node` and killed with SIGKILL. Doubles: the plugin's `storage` key forwards to the real storage
// and counts its commits; `tenantDomainLookup` knows the two registered tenants; `sessionAccessCheck`
// allows every request; the Session domain resolution and cursor signing of the storage port are
// doubles of session-contract and session-cordis-contract. See fixtures/line-through-cp2.ts.
// @module-tag slow
// Why slow: real Workers, real files and a killed child process.
import { spawn } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { CommandReceipt } from '@omne-harness/agent-contract'
import { ok } from './fixtures/common-journal.ts'
import {
  messageCommit,
  openCp2,
  other,
  own,
  seedCp2,
  type Cp2World,
  type JournalCommitRequest,
} from './fixtures/line-through-cp2.ts'

const worlds: Cp2World[] = []
const roots: string[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function newRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'line-through-cp2-')))
  roots.push(root)
  return root
}

async function open(root: string): Promise<Cp2World> {
  const world = await openCp2(root)
  worlds.push(world)
  return world
}

describe('CP2: the Journal and the Session log commit together on the real sqlite-provider', () => {
  it('one storage commit holds the Agent records and the Session participation, and both sides show it', async () => {
    const world = await open(await newRoot())
    const { execution, open: opening } = await seedCp2(world)
    const opened = ok(await world.journal().open(opening))
    const loaded = ok(await world.journal().load({ ...own, execution }))
    const before = await world.published()
    const sessionBefore = await world.sessionRevision()
    world.commits.length = 0

    const receipt = ok(
      await world.journal().commit(messageCommit(execution, opened.authority, loaded)),
    )

    // One storage commit, with a command of each participant, committed as one.
    expect(world.commits).toHaveLength(1)
    const [seen] = world.commits
    expect([...seen!.participants].sort()).toEqual(['execution-record', 'session'])
    expect(seen!.result.kind).toBe('committed')
    if (seen!.result.kind !== 'committed') return
    expect(seen!.result.responses.map(item => [item.participant, item.reply.kind])).toEqual([
      ['execution-record', 'participated'],
      ['session', 'participated'],
    ])
    // The publication moved the common root once: the Agent count and the Session root read the
    // same number, one past the one before.
    const after = await world.published()
    expect(after.agent).toBe(String(BigInt(before.agent) + 1n))
    expect(after.session).toBe(after.agent)
    expect(BigInt(await world.sessionRevision())).toBeGreaterThan(BigInt(sessionBefore))
    expect(ok(await world.journal().load({ ...own, execution })).revision).toBe(receipt.revision)
  })

  it('a principal of another tenant is denied for the execution, and nothing is written', async () => {
    const world = await open(await newRoot())
    const { execution, open: opening } = await seedCp2(world)
    const opened = ok(await world.journal().open(opening))
    const loaded = ok(await world.journal().load({ ...own, execution }))
    const before = await world.published()
    world.commits.length = 0

    expect(await world.journal().load({ ...other, execution })).toEqual({
      failure: { kind: 'denied', action: 'load' },
    })
    const foreign: JournalCommitRequest = {
      ...messageCommit(execution, opened.authority, loaded),
      ...other,
    }
    expect(await world.journal().commit(foreign)).toEqual({
      failure: { kind: 'denied', action: 'commit' },
    })
    expect(world.commits).toEqual([])
    expect(await world.published()).toEqual(before)
    expect(ok(await world.journal().load({ ...own, execution })).revision).toBe(loaded.revision)
  })
})

type ChildLine = Readonly<{
  execution: string
  request: JournalCommitRequest
  receipt: CommandReceipt
  published: { agent: string; session: string }
  sessionRevision: string
}>

/** Runs the child on `root` until it printed its line, then kills it with SIGKILL. */
async function commitThenKill(root: string): Promise<ChildLine> {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./fixtures/line-through-cp2-child.ts', import.meta.url)), root],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const text = await new Promise<string>((resolve, reject) => {
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      if (out.includes('\n')) resolve(out.trim())
    })
    child.once('exit', () => reject(new Error(`the child ended before its commit: ${out}`)))
  })
  child.kill('SIGKILL')
  await exited
  if (!text.startsWith('CP2 ')) throw new Error(`unexpected child output: ${text}`)
  const line = JSON.parse(text.slice('CP2 '.length)) as ChildLine
  // A tenant is only valid as the minted value: the text form of the line names the same tenant.
  return { ...line, request: { ...line.request, ...own } }
}

describe('CP2: a process killed after the commit', () => {
  it('a new process answers the original operation with the original receipt, and the revision moved once', async () => {
    const root = await newRoot()
    const line = await commitThenKill(root)

    const world = await open(root)
    const execution = line.request.execution
    // The new process reads the durable records: the commit of the killed process is there.
    expect(ok(await world.journal().load({ ...own, execution })).revision).toBe(
      line.receipt.revision,
    )
    expect(await world.published()).toEqual(line.published)

    // The same request, under the same operation identity, is recognized: the original receipt.
    world.commits.length = 0
    const again = await world.journal().commit(line.request)
    expect(again).toEqual({ ok: line.receipt })

    // Nothing moved a second time: the Agent revision, the common root and the Session revision.
    expect(ok(await world.journal().load({ ...own, execution })).revision).toBe(
      line.receipt.revision,
    )
    expect(await world.published()).toEqual(line.published)
    expect(await world.sessionRevision()).toBe(line.sessionRevision)
    expect(world.commits.filter(seen => seen.result.kind === 'committed')).toEqual([])

    // Another tenant is denied for the recovered execution, as for one it never had.
    expect(await world.journal().load({ ...other, execution })).toEqual({
      failure: { kind: 'denied', action: 'load' },
    })
  })
})
