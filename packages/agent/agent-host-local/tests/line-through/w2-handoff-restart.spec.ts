// @module-tag slow
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
const restored = (input: HandoffPrepare): HandoffPrepare & typeof own => ({ ...input, ...own })
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

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
    w.bindings.controls.bind(TENANT, sessionId(SESSION))
    const found = w.ctx.get(agentMessageHandoffKey)
    if (found === undefined) throw new Error('agentMessageHandoff is not provided')
    const handoff = found as MessageHandoff<unknown>

    for (const { input, answer } of answered) {
      const read = ok(await handoff.lookup({ ...own, ...lookupOf(input) }))
      expect(plain(read)).toEqual({ kind: 'recorded', outcome: plain(answer.ok) })
    }

    const commitsBefore = w.commits.length
    for (const { input, answer } of answered) {
      const again = ok(await handoff.prepare(restored(input)))
      expect(plain(again)).toEqual(plain(answer.ok))
    }
    expect(w.commits.length).toBe(commitsBefore)

    expect(w.admits).toHaveLength(0)
    expect(w.tools.invoke.calls).toHaveLength(0)

    for (const { input } of answered) {
      const other = await handoff.lookup({ ...strangerAccess, ...lookupOf(input) } as never)
      expect(JSON.stringify(other)).not.toContain('"recorded"')
    }
  })
})
