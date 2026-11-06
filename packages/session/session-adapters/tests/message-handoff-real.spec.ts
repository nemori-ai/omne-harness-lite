// J06 on the real sqlite-provider: the message admission provider saves the intent and the outcome
// of an invoke admission in a child process killed with SIGKILL after either phase. A new provider
// on the same files reads the original Ki: an intent stays unknown, and a fixed outcome is recalled
// by the same prepare without a new write. The 24 KiB body fits the unchanged response budget once.
// @module-tag slow
// Why slow: real Workers, real files and a killed child process.
import { spawn } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
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
  outcome: HandoffOutcome | null
}>

/** Runs the child on `root` until it printed its line, then kills it with SIGKILL. */
async function prepareThenKill(
  root: string,
  textFile: string,
  stopAfter: 'intent' | 'outcome',
): Promise<ChildLine> {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('./fixtures/message-handoff-child.ts', import.meta.url)),
      root,
      textFile,
      stopAfter,
    ],
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

describe('J06: recovery after a child is killed', () => {
  for (const stopAfter of ['intent', 'outcome'] as const)
    it(`a new provider recovers a 24 KiB candidate after kill at ${stopAfter}`, async () => {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'message-handoff-')))
      roots.push(root)
      let text = ''
      for (let index = 0; ; index += 1) {
        const part = `candidate-${index} 中文 🚀 ${index * 7919} "quoted" \\slash\n\t`
        if (Buffer.byteLength(text + part) > 24576) break
        text += part
      }
      text += 'x'.repeat(24576 - Buffer.byteLength(text))
      const textFile = join(root, 'candidate.txt')
      await writeFile(textFile, text)
      const line = await prepareThenKill(root, textFile, stopAfter)

      const world = await openCp2(root)
      worlds.push(world)
      const handoff = await world.handoff()
      const request = line.input.request
      if (request.kind !== 'input') throw new Error('an external request is expected')
      const lookup = () =>
        handoff.lookup({
          principal: own.principal,
          tenant: own.tenant,
          kind: 'input-entry',
          execution: request.reference.execution,
          operation: request.reference.entry,
        })
      world.commits.length = 0
      const found = ok(await lookup())
      if (stopAfter === 'intent') {
        expect(line.outcome).toBeNull()
        expect(found.kind).toBe('unknown')
        if (found.kind !== 'unknown') throw new Error('the intent has no fixed outcome')
        expect(JSON.parse(JSON.stringify(found.original?.request))).toEqual(request)
        expect(ok(await lookup())).toEqual(found)
        expect(world.commits).toEqual([])
        return
      }
      if (line.outcome?.decision.kind !== 'prepared')
        throw new Error('a prepared outcome is expected')
      expect(line.outcome.decision.message.blocks).toMatchObject([{ text }])
      expect(JSON.parse(JSON.stringify(found))).toEqual({ kind: 'recorded', outcome: line.outcome })
      world.commits.length = 0
      const again = ok(await handoff.prepare(line.input))
      expect(JSON.parse(JSON.stringify(again))).toEqual(line.outcome)
      expect(world.commits).toEqual([])
    })
})
