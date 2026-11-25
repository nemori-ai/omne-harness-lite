// @module-tag slow
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import {
  onReleaseTree,
  toolCallsByRequest,
  toolResults,
  toolLedger,
  toolCallFacts,
} from '../support/release-tree.ts'
import { registered, run, sessionIn, saveGuidanceEvidence } from '../support/workspace-guidance.ts'
import {
  prepareNativeHooks,
  spawnWithNativeHooks,
} from '../../../../packages/execution/execution-environment-host-local/tests/macos-files/native-hooks.ts'

type Spawn = typeof import('node:child_process').spawn
function nativePartialFault(first: string, second: string) {
  const childProcess = createRequire(import.meta.url)('node:child_process') as { spawn: Spawn }
  const original = childProcess.spawn
  const batches: unknown[] = []
  const events: { event: string; index?: number; kind?: string; reason?: string }[] = []
  const observations: { firstAtSecondRename: string; target: string }[] = []
  let firstRenames = 0
  let injections = 0
  let armed = true
  let restored = false
  childProcess.spawn = ((executable: string, ...args: unknown[]) => {
    // Node's builtin live export also covers native ESM/dist imports; no source-only vi.mock.
    // All other programs, including the test helper named omne-files-test, use real spawn.
    if (basename(executable) !== 'omne-files')
      return Reflect.apply(original, childProcess, [executable, ...args])
    const child = spawnWithNativeHooks(executable, async (fn, paths) => {
      if (fn !== 'rename') return
      if (paths.some(path => basename(path) === basename(first))) firstRenames++
      if (!armed || !paths.some(path => basename(path) === basename(second))) return
      const firstAtSecondRename = await readFile(first, 'utf8')
      observations.push({ firstAtSecondRename, target: second })
      armed = false
      injections++
      throw Object.assign(new Error('second native publication EIO'), { code: 'EIO' })
    })
    const write = child.stdin.write
    let batch = false
    child.stdin.write = ((chunk: unknown, ...rest: unknown[]) => {
      if (typeof chunk === 'string' && chunk.startsWith('{')) {
        const value: unknown = JSON.parse(chunk)
        if (
          value &&
          typeof value === 'object' &&
          'operation' in value &&
          value.operation === 'batch'
        ) {
          batch = true
          batches.push(value)
        }
      }
      return Reflect.apply(write, child.stdin, [chunk, ...rest])
    }) as typeof write
    let pending = ''
    child.stdout.on('data', (chunk: Buffer) => {
      if (!batch) return
      pending += chunk.toString('utf8')
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (line === '') continue
        const value: unknown = JSON.parse(line)
        if (
          value &&
          typeof value === 'object' &&
          'event' in value &&
          typeof value.event === 'string'
        )
          events.push(value as (typeof events)[number])
      }
    })
    return child
  }) as Spawn
  syncBuiltinESMExports()
  const restore = () => {
    if (restored) return
    restored = true
    childProcess.spawn = original
    syncBuiltinESMExports()
  }
  onTestFinished(restore)
  return { batches, events, observations, restore, counts: () => ({ firstRenames, injections }) }
}

function partialReceipt(text: string) {
  const batch = /^unknown batch=(.+)$/mu.exec(text)?.[1]
  const published = /^confirmed published=(.+) reason=effectUnknown$/mu.exec(text)?.[1]
  if (!batch || !published)
    throw new Error('missing native partial-batch identity or publication range: ' + text)
  expect(text).toMatch(/^unknown request=/mu)
  expect(text).toContain('Original batch requires recovery. Do not resubmit.')
  expect(text).toContain('planned diff (publication is confirmed only by the range above)')
  return {
    batch: JSON.parse(batch) as { id: string; generation: string },
    published: JSON.parse(published) as string[],
  }
}

it(
  'C2/C6 partial Files.patch keeps its original receipt on model wire and in Session with real partial disk effects',
  { tags: ['slow'], timeout: 360_000 },
  async ({ skip }) => {
    skip(process.platform !== 'darwin', 'requires the macOS native filesystem helper')
    await prepareNativeHooks()
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-partial-wire-')))
    onTestFinished(() => rmSync(root, { recursive: true, force: true }))
    const leaf = join(root, 'src', 'pay')
    mkdirSync(leaf, { recursive: true })
    mkdirSync(join(root, 'unvisited'))
    writeFileSync(join(root, 'AGENTS.md'), 'PARTIAL_ROOT_842')
    writeFileSync(join(root, 'src', 'AGENTS.md'), 'PARTIAL_PARENT_385')
    writeFileSync(join(leaf, 'AGENTS.md'), 'PARTIAL_LEAF_642')
    writeFileSync(join(root, 'unvisited', 'AGENTS.md'), 'UNVISITED_BRANCH_730')
    const first = join(leaf, 'first.txt'),
      second = join(leaf, 'second.txt')
    writeFileSync(first, 'original-one')
    writeFileSync(second, 'original-two')
    const fault = nativePartialFault(first, second)
    const requests: { body: string; rawBody: string; path: string }[] = []
    const dialogue = toolCallsByRequest(() =>
      requests.length === 1
        ? [
            {
              id: 'partial-patch-once',
              tool: 'Files',
              arguments: JSON.stringify({
                command: 'patch',
                intent: 'edit both payment notes once',
                params: {
                  edits: [
                    {
                      path: 'src/pay/first.txt',
                      old_text: 'original-one',
                      new_text: 'published-one',
                    },
                    {
                      path: 'src/pay/second.txt',
                      old_text: 'original-two',
                      new_text: 'published-two',
                    },
                  ],
                },
              }),
            },
          ]
        : [],
    )
    try {
      await onReleaseTree(
        {
          permission: 'bypass-permissions',
          extraHistoryKinds: ['message.system_reminder', 'call.execution-fact'],
          script: request => {
            requests.push({ body: request.body, rawBody: request.rawBody, path: request.path })
            return dialogue(request)
          },
        },
        async tree => {
          const selected = await registered(tree, root)
          const entries = await run(tree, await sessionIn(tree, selected))
          const disk = { first: readFileSync(first, 'utf8'), second: readFileSync(second, 'utf8') }
          expect(disk).toEqual({ first: 'published-one', second: 'original-two' })
          expect(fault.observations).toEqual([
            { firstAtSecondRename: 'published-one', target: second },
          ])
          expect(fault.counts()).toEqual({ firstRenames: 1, injections: 1 })
          expect(fault.batches).toHaveLength(1)
          expect(fault.events.filter(event => event.event === 'published')).toEqual([
            { event: 'published', index: 0 },
          ])
          expect(fault.events).toContainEqual({
            event: 'result',
            kind: 'unknown',
            reason: 'effectUnknown',
          })
          const originalResults = toolResults(entries).filter(text =>
            text.includes('unknown batch='),
          )
          expect(originalResults).toHaveLength(1)
          const original = partialReceipt(originalResults[0]!)
          expect(original.batch).toEqual({ id: expect.any(String), generation: expect.any(String) })
          expect(original.published).toEqual([first])
          expect(originalResults[0]).toContain(second) // planned diff is not a publication receipt.
          expect(requests).toHaveLength(2)
          // rawBody is the actual HTTP request, not the gateway's normalized chat view.
          const wire = JSON.parse(requests[1]!.rawBody) as {
            input: { type?: string; call_id?: string; output?: string }[]
          }
          const outputs = wire.input.filter(item => item.type === 'function_call_output')
          expect(outputs).toEqual([
            {
              type: 'function_call_output',
              call_id: 'partial-patch-once',
              output: originalResults[0],
            },
          ])
          expect(requests[0]!.rawBody).not.toMatch(
            /PARTIAL_PARENT_385|PARTIAL_LEAF_642|UNVISITED_BRANCH_730/u,
          )
          for (const marker of ['PARTIAL_ROOT_842', 'PARTIAL_PARENT_385', 'PARTIAL_LEAF_642'])
            expect(requests[1]!.rawBody.split(marker)).toHaveLength(2)
          expect(requests[1]!.rawBody).not.toContain('UNVISITED_BRANCH_730')
          const resultAt = entries.findIndex(entry => entry.kind === 'message.tool')
          const guidanceAt = entries.findIndex(
            entry =>
              entry.kind === 'message.system_reminder' &&
              JSON.stringify(entry.payload).includes('PARTIAL_LEAF_642'),
          )
          expect(resultAt).toBeGreaterThanOrEqual(0)
          expect(guidanceAt).toBeGreaterThan(resultAt)
          const executionFacts = entries.filter(entry => entry.kind === 'call.execution-fact')
          const visit = executionFacts.find(entry => {
            const fact = (
              entry.payload as { fact?: { directoryVisit?: { directories?: string[] } } }
            ).fact
            return fact?.directoryVisit?.directories?.includes(leaf)
          })
          expect(visit?.payload).toMatchObject({
            fact: {
              kind: 'execution',
              directoryVisit: {
                workspace: selected[1],
                instance: selected[3],
                directories: [leaf],
              },
            },
          })
          const ledger = toolLedger(tree.storageRoot)
          expect(ledger).toHaveLength(1)
          const originalCall = ledger[0]
          if (!originalCall) throw new Error('original patch call missing')
          expect(JSON.stringify(visit?.payload)).toContain(originalCall.call)
          expect(toolCallFacts(tree.storageRoot).get(originalCall.call)?.starts).toBe(1)
          // Original wire text, native publication events, and observed disk bytes are independent evidence.
          saveGuidanceEvidence('partial-files-batch.json', {
            disk,
            wirePath: requests[1]!.path,
            wireRequest: requests[1]!.rawBody,
            sessionTool: originalResults[0],
            sessionToolEntries: entries.filter(entry => entry.kind === 'message.tool'),
            sessionExecutionFacts: executionFacts,
            originalCall: originalCall.call,
            wireTool: outputs[0]!.output,
            nativeEvents: fault.events,
            nativeBatchCount: fault.batches.length,
            syscallObservations: fault.observations,
          })
        },
      )
    } finally {
      fault.restore()
    }
  },
)
