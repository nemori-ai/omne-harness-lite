// @module-tag slow
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

describe('the Journal and the Session log commit together on the real sqlite-provider', () => {
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

    expect(world.commits).toHaveLength(1)
    const [seen] = world.commits
    expect([...seen!.participants].sort()).toEqual([
      'execution-record',
      'session',
      'session-ordinary-basis',
    ])
    expect(seen!.result.kind).toBe('committed')
    if (seen!.result.kind !== 'committed') return
    expect(seen!.result.responses.map(item => [item.participant, item.reply.kind])).toEqual([
      ['execution-record', 'participated'],
      ['session-ordinary-basis', 'participated'],
      ['session', 'participated'],
    ])
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
  return { ...line, request: { ...line.request, ...own } }
}

describe('a process killed after the commit', () => {
  it('a new process answers the original operation with the original receipt, and the revision moved once', async () => {
    const root = await newRoot()
    const line = await commitThenKill(root)

    const world = await open(root)
    const execution = line.request.execution
    expect(ok(await world.journal().load({ ...own, execution })).revision).toBe(
      line.receipt.revision,
    )
    expect(await world.published()).toEqual(line.published)

    world.commits.length = 0
    const again = await world.journal().commit(line.request)
    expect(again).toEqual({ ok: line.receipt })

    expect(ok(await world.journal().load({ ...own, execution })).revision).toBe(
      line.receipt.revision,
    )
    expect(await world.published()).toEqual(line.published)
    expect(await world.sessionRevision()).toBe(line.sessionRevision)
    expect(world.commits.filter(seen => seen.result.kind === 'committed')).toEqual([])

    expect(await world.journal().load({ ...other, execution })).toEqual({
      failure: { kind: 'denied', action: 'load' },
    })
  })
})
