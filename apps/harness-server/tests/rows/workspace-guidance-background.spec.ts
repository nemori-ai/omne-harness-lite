// @module-tag slow
// Starts a release tree, a loopback model endpoint, and a real background Shell command.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  textsOf,
  toolCallFacts,
  toolCallsByRequest,
  toolLedger,
  unsettledExecutions,
  type Entry,
} from '../support/release-tree.ts'
import { command, registered, run, sessionIn } from '../support/workspace-guidance.ts'

const evidence: unknown[] = []
const evidencePath = process.env['OMNE_GUIDANCE_BACKGROUND_EVIDENCE']

it.each(['A', 'B'] as const)(
  'C2/C4 a completed background call keeps its A binding while the session is in %s',
  { tags: ['slow'], timeout: 360_000 },
  async target => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-background-')))
    onTestFinished(() => rmSync(base, { recursive: true, force: true }))
    const a = join(base, 'A')
    const b = join(base, 'B')
    const leaf = join(a, 'leaf')
    mkdirSync(leaf, { recursive: true })
    mkdirSync(join(b, 'leaf'), { recursive: true })
    writeFileSync(join(a, 'AGENTS.md'), 'BACKGROUND_A_ROOT_926')
    writeFileSync(join(b, 'AGENTS.md'), 'BACKGROUND_B_ROOT_926')
    writeFileSync(join(b, 'leaf', 'AGENTS.md'), 'UNVISITED_B_LEAF_926')
    const requests: string[] = []
    let entries: readonly Entry[] = []
    const script = toolCallsByRequest(body => {
      requests.push(body)
      return requests.length === 1
        ? [
            {
              id: 'background-in-A',
              tool: 'Shell',
              arguments: JSON.stringify({
                command: 'execute',
                intent: 'finish the original A command after the gate',
                params: {
                  cwd: leaf,
                  run_in_background: true,
                  script:
                    'printf started > started; while [ ! -f go ]; do sleep 0.1; done; printf x >> effect.txt; printf BACKGROUND_DONE_926',
                },
              }),
            },
          ]
        : []
    })
    const exit = await onReleaseTree(
      {
        script,
        permission: 'bypass-permissions',
        extraHistoryKinds: ['call.execution-fact', 'message.system_reminder'],
      },
      async tree => {
        const first = await registered(tree, a)
        const second = await registered(tree, b)
        const session = await sessionIn(tree, first)
        try {
          await run(tree, session)
          await pollUntil(
            'the detached command to start in A',
            () => existsSync(join(leaf, 'started')),
            Boolean,
          )
          expect(requests).toHaveLength(2)
          expect(existsSync(join(leaf, 'effect.txt'))).toBe(false)
          if (target === 'B') {
            await command(tree, ['select-workspace', '--session', session, ...second])
            await run(tree, session, 2)
            expect(requests).toHaveLength(3)
            expect(requests[2]).toContain('BACKGROUND_B_ROOT_926')
          }
          // The source first exists after the call detached, so no earlier legal prefix can contain it.
          writeFileSync(join(leaf, 'AGENTS.md'), 'LATE_BACKGROUND_A_LEAF_926')
          const before = requests.length
          writeFileSync(join(leaf, 'go'), '')
          entries = await pollUntil(
            'the background result and its following Run',
            () => historyOf(tree, session),
            seen =>
              seen.filter(entry => entry.kind === 'run.terminal').length >=
                (target === 'A' ? 2 : 3) && requests.length >= before + 1,
          )
          expect(requests).toHaveLength(before + 1)
          expect(readFileSync(join(leaf, 'effect.txt'), 'utf8')).toBe('x')
          expect(existsSync(join(b, 'leaf', 'effect.txt'))).toBe(false)
          const last = requests.at(-1)
          expect(last).toContain('BACKGROUND_DONE_926')
          expect(last).not.toContain('UNVISITED_B_LEAF_926')
          if (target === 'A') expect(last).toContain('LATE_BACKGROUND_A_LEAF_926')
          else {
            expect(last).toContain('BACKGROUND_B_ROOT_926')
            expect(last).not.toContain('LATE_BACKGROUND_A_LEAF_926')
          }
          const calls = toolLedger(tree.storageRoot)
          expect(calls).toHaveLength(1)
          const original = calls[0]
          if (original === undefined) throw new Error('the original Shell call is missing')
          const visit = entries.find(
            entry =>
              entry.kind === 'call.execution-fact' && JSON.stringify(entry.payload).includes(leaf),
          )
          expect(visit?.payload).toMatchObject({
            fact: {
              kind: 'execution',
              directoryVisit: { workspace: first[1], instance: first[3], directories: [leaf] },
            },
          })
          expect(JSON.stringify(visit?.payload)).toContain(original.call)
          expect(toolCallFacts(tree.storageRoot).get(original.call)?.starts).toBe(1)
          const manifests = entries
            .filter(entry => entry.kind === 'message.system_reminder')
            .flatMap(entry => textsOf(entry.payload))
            .filter(
              text =>
                text.includes('"key":"session.workspace-guidance"') && text.includes('"sources":['),
            )
          expect(manifests.at(-1)).toContain(JSON.stringify(target === 'A' ? a : b))
          await pollUntil(
            'the single background Tool to release',
            () => toolLedger(tree.storageRoot),
            rows => rows.length === 1 && rows.every(row => row.phase === 'settled' && row.released),
          )
          await pollUntil(
            'all Session Agent executions to settle',
            () => unsettledExecutions(tree.storageRoot, session),
            count => count === 0,
          )
        } finally {
          writeFileSync(join(leaf, 'go'), '')
          evidence.push({
            target,
            aBinding: first,
            bBinding: second,
            requests,
            entries,
            callFacts: [...toolCallFacts(tree.storageRoot)],
            aEffect: existsSync(join(leaf, 'effect.txt'))
              ? readFileSync(join(leaf, 'effect.txt'), 'utf8')
              : null,
            bEffect: existsSync(join(b, 'leaf', 'effect.txt')),
          })
          if (evidencePath !== undefined)
            writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
        }
      },
    )
    expect(exit).toBe(0)
  },
)
