// J06 on the real sqlite-provider: the message admission provider saves the intent and the outcome
// of an invoke admission in a child process that is then killed with SIGKILL; a new process on the
// same files reads the complete record back by the original Ki, and the same prepare there recalls
// the original outcome without a new write.
// @module-tag slow
// Why slow: real Workers, real files and a killed child process.
import { spawn } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { HandoffOutcome, MessageHandoff } from '@omne-harness/agent-contract'
import { ok } from './fixtures/common-journal.ts'
import { openCp2, own, type Cp2World } from './fixtures/line-through-cp2.ts'

const worlds: Cp2World[] = []
const roots: string[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

type ChildLine = Readonly<{
  input: Parameters<MessageHandoff<string>['prepare']>[0]
  outcome: HandoffOutcome
}>

/** Runs the child on `root` until it printed its line, then kills it with SIGKILL. */
async function prepareThenKill(root: string): Promise<ChildLine> {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./fixtures/message-handoff-child.ts', import.meta.url)), root],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const text = await new Promise<string>((resolve, reject) => {
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      if (out.includes('\n')) resolve(out.trim())
    })
    child.once('exit', () => reject(new Error(`the child ended before its prepare: ${out}`)))
  })
  child.kill('SIGKILL')
  await exited
  if (!text.startsWith('HANDOFF ')) throw new Error(`unexpected child output: ${text}`)
  const line = JSON.parse(text.slice('HANDOFF '.length)) as ChildLine
  // A tenant is only valid as the minted value: the text form of the line names the same tenant.
  return { ...line, input: { ...line.input, principal: own.principal, tenant: own.tenant } }
}

describe('J06: a process killed after the prepare', () => {
  it('a new process reads the complete record by the original Ki, and the same prepare recalls it', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'message-handoff-')))
    roots.push(root)
    const line = await prepareThenKill(root)

    const world = await openCp2(root)
    worlds.push(world)
    const handoff = await world.handoff()
    const request = line.input.request
    if (request.kind !== 'input') throw new Error('an external request is expected')
    const found = ok(
      await handoff.lookup({
        principal: own.principal,
        tenant: own.tenant,
        kind: 'input-entry',
        execution: request.reference.execution,
        operation: request.reference.entry,
      }),
    )
    expect(JSON.parse(JSON.stringify(found))).toEqual({ kind: 'recorded', outcome: line.outcome })
    world.commits.length = 0
    const again = ok(await handoff.prepare(line.input))
    expect(JSON.parse(JSON.stringify(again))).toEqual(line.outcome)
    expect(world.commits).toEqual([])
  })
})
