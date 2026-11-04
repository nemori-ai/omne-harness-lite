// J5: after the process is killed, the admission record is read back under its original identity
// (R5 item 2; M-GENERATION SaveIntent and Lookup). The child process runs the joint world on a real
// sqlite-provider in a temporary directory, lets the Agent run a round, and is killed with SIGKILL
// once the Agent had a reply admitted; this process opens the same directory in a new world.
//
// Real: the handoff provider (`createSessionMessageHandoffPlugin`), the Session, the Agent and the
// sqlite-provider files, in both processes. Doubles: the Model, the Tool and the Runtime Context
// handoff, as in ./w2-world.ts. Not covered: the invoke branch after a cold start is read through the
// input-entry lookup only if the child recorded it; whatever C-ADAPTERS keeps as a limit of the
// invoke branch after a restart is not reported on here.
// @module-tag slow
// Why slow: a child process, real Workers and real files.
import { spawn } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { HandoffOutcome, HandoffPrepare, MessageHandoff } from '@omne-harness/agent-contract'
import { agentMessageHandoffKey } from '@omne-harness/agent-cordis-contract/cordis'
import { sessionId } from '@omne-harness/session-contract/testing'
import { COORDINATOR, SESSION, TENANT, ok, strangerAccess } from './world.ts'
import { openW2World, type W2World } from './w2-world.ts'

const roots: string[] = []
const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

type Recorded = Readonly<{ input: HandoffPrepare; answer: { ok: HandoffOutcome } }>

/** Runs the child on `root` until it printed its line, then kills it with SIGKILL. */
async function runThenKill(root: string): Promise<readonly Recorded[]> {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./w2-handoff-child.ts', import.meta.url)), root],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const text = await new Promise<string>((resolve, reject) => {
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      if (out.includes('\n')) resolve(out.trim())
    })
    child.once('exit', () => reject(new Error(`the child ended before its line: ${out}`)))
  })
  child.kill('SIGKILL')
  await exited
  if (!text.startsWith('HANDOFF ')) throw new Error(`unexpected child output: ${text}`)
  return JSON.parse(text.slice('HANDOFF '.length)) as Recorded[]
}

const own = { principal: COORDINATOR, tenant: TENANT }
/** The line of the child carries the tenant as text; the tenant is only valid as the minted value. */
const restored = (input: HandoffPrepare): HandoffPrepare & typeof own => ({ ...input, ...own })
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** The lookup that names the record of one prepare input: by H (execution) or by Ki (input entry). */
function lookupOf(input: HandoffPrepare) {
  const { request } = input
  return request.kind === 'execution'
    ? {
        kind: 'execution' as const,
        execution: request.reference.execution,
        handoff: request.reference,
      }
    : {
        kind: 'input-entry' as const,
        execution: request.reference.execution,
        operation: request.reference.entry,
      }
}

describe('J5: the admission record is read back under its original identity after a kill', () => {
  it('J5 reads each record back by its original identity, recalls a repeated prepare, starts no effect', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'w2-handoff-')))
    roots.push(root)
    const recorded = await runThenKill(root)
    const answered = recorded.filter(item => 'ok' in item.answer)
    expect(answered.some(item => item.input.kind === 'execution')).toBe(true)

    const w = await openW2World({
      root,
      model: () => ({ parts: [], reason: 'stop' }),
    })
    worlds.push(w)
    // The session was created in the child; this world binds its control principals again.
    w.bindings.controls.bind(TENANT, sessionId(SESSION))
    const found = w.ctx.get(agentMessageHandoffKey)
    if (found === undefined) throw new Error('agentMessageHandoff is not provided')
    const handoff = found as MessageHandoff<unknown>

    for (const { input, answer } of answered) {
      // By the original identity: H for the execution branch, Ki for the input entry.
      const read = ok(await handoff.lookup({ ...own, ...lookupOf(input) }))
      expect(plain(read)).toEqual({ kind: 'recorded', outcome: plain(answer.ok) })
    }

    // The same prepare again recalls the original outcome and writes no new record.
    const commitsBefore = w.commits.length
    for (const { input, answer } of answered) {
      const again = ok(await handoff.prepare(restored(input)))
      expect(plain(again)).toEqual(plain(answer.ok))
    }
    expect(w.commits.length).toBe(commitsBefore)

    // The lookups and the recall started no effect.
    expect(w.admits).toHaveLength(0)
    expect(w.tools.invoke.calls).toHaveLength(0)

    // Another tenant does not read the records, by H or by Ki.
    for (const { input } of answered) {
      const other = await handoff.lookup({ ...strangerAccess, ...lookupOf(input) } as never)
      expect(JSON.stringify(other)).not.toContain('"recorded"')
    }
  })
})
