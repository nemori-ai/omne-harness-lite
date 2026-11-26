// @module-tag slow
// Runs real release Session/Agent/Context and native Files, with a controlled compaction provider.
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { expect, it, onTestFinished } from 'vitest'
import { decodeCompactionOutcome } from '@omne-harness/agent-contract'
import { agentCompactionInputsKey } from '@omne-harness/agent-cordis-contract/cordis'
import { succeed } from '@omne-harness/operation-result'
import { workspaceInstancesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  textsOf,
  toolCallsByRequest,
  toolLedger,
} from '../support/release-tree.ts'
import { command, registered, sessionIn } from '../support/workspace-guidance.ts'

const PRIVATE_A = 'PRIVATE_A_GUIDANCE_617'
const PUBLIC_TASK = 'ORIGINAL_LEGAL_TASK_938'
const LEGAL_B = 'LEGAL_B_GUIDANCE_284'

it(
  'C4/C5/C6 revoking A after its mixed summary preserves the legal task and keeps B usable',
  { timeout: 360000 },
  async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'summary-rights-')))
    onTestFinished(() => rmSync(base, { recursive: true, force: true }))
    const a = join(base, 'A'),
      b = join(base, 'B')
    mkdirSync(a)
    mkdirSync(b)
    writeFileSync(join(a, 'AGENTS.md'), PRIVATE_A)
    writeFileSync(join(b, 'AGENTS.md'), LEGAL_B)
    let revoked = false
    let workCalls = 0
    let compactions = 0
    let refusalChecks = 0
    const requests: { revoked: boolean; body: string; rawBody: string; path: string }[] = []
    const summaries: {
      revoked: boolean
      material: string
      protected: readonly string[]
      taskRetained: boolean
    }[] = []
    const observations: unknown[] = []
    const replies = toolCallsByRequest(() => {
      workCalls++
      return workCalls === 1
        ? [
            {
              id: 'original-effect',
              tool: 'Files',
              arguments: JSON.stringify({
                command: 'write',
                intent: 'perform the original legal task once',
                params: { path: 'note', text: 'one effect', mode: 'create' },
              }),
            },
          ]
        : []
    })
    const result = await onReleaseTree(
      {
        permission: 'bypass-permissions',
        collaboration: 'co-work',
        compactionTriggerPercent: '2',
        extraHistoryKinds: [
          'message.system_reminder',
          'session.model-projected',
          'call.execution-fact',
        ],
        compactionProvider: {
          binding: {
            authority: 'release/summary-recovery',
            adoption: {
              owner: 'release-test',
              name: 'mixed-summary',
              revision: '1',
              digest: 'mixed-summary/1',
            },
          },
          inject: [],
          executor: () => ({
            async advance(request, generation) {
              compactions++
              const history = request.input.history
              const material = JSON.stringify(history.entries.flatMap(entry => entry.represented))
              const task = history.entries.find(
                entry =>
                  entry.message.role === 'user' &&
                  JSON.stringify(entry.message).includes(PUBLIC_TASK),
              )
              expect(
                material,
                'the summarizer must receive the original legal task, not an invented replacement',
              ).toContain(PUBLIC_TASK)
              if (!revoked)
                expect(material, 'the first summary really consumes A guidance').toContain(
                  PRIVATE_A,
                )
              const retained = history.logOrder.filter(ref => history.protected.includes(ref))
              summaries.push({
                revoked,
                material,
                protected: history.protected,
                taskRetained: task !== undefined && retained.includes(task.ref),
              })
              const decoded = decodeCompactionOutcome(
                JSON.stringify({
                  kind: 'completed',
                  message: {
                    id: request.input.outputMessageId,
                    role: 'compaction',
                    blocks: [
                      {
                        kind: 'text',
                        id: 'mixed-summary',
                        text: revoked
                          ? `SAFE_RECOVERED_SUMMARY ${PUBLIC_TASK}`
                          : `MIXED_SUMMARY ${PUBLIC_TASK} ${PRIVATE_A}`,
                        visibility: { toModel: true, toHuman: true },
                      },
                    ],
                    covers: { from: history.origin, to: history.upper },
                    retained,
                    derivation: generation,
                  },
                }),
              )
              if ('failure' in decoded || decoded.ok.kind !== 'completed')
                throw new Error('invalid compaction fixture')
              return succeed({
                phase: 'terminal',
                physical: 'settled',
                outcome: decoded.ok,
              } as const)
            },
            cancel: async () => succeed('settled' as const),
          }),
        },
        script: async request => {
          requests.push({
            revoked,
            body: request.body,
            rawBody: request.rawBody,
            path: request.path,
          })
          const answer = await replies(request)
          if (workCalls !== 2) return answer
          const frame =
            'data: ' +
            JSON.stringify({
              model: (JSON.parse(request.body) as { model: string }).model,
              provider: 'OpenAI',
              choices: [{ delta: { content: 'memo '.repeat(24000) } }],
            }) +
            '\n\n'
          return { ...answer, body: frame + answer.body }
        },
      },
      async tree => {
        const session = await sessionIn(tree, await registered(tree, a))
        const second = await registered(tree, b)
        const drive = async (text: string, ordinal: number) => {
          await command(tree, ['send-input', '--session', session, '--text', text])
          const entries = await pollUntil(
            'the release run ends',
            () => historyOf(tree, session),
            rows => rows.filter(row => row.kind === 'run.terminal').length >= ordinal,
          )
          expect(
            entries.filter(entry => entry.kind === 'run.terminal').at(-1)?.payload,
          ).toMatchObject({
            terminal: { outcome: 'completed' },
            end: { conclusion: 'complete', failure: null },
          })
          return entries
        }
        const service = tree.scope.get(workspaceInstancesKey)
        if (!service) throw new Error('workspace verification is missing')
        const verify = service.verify.bind(service)
        const compactionInputs = tree.scope.get(agentCompactionInputsKey)
        if (!compactionInputs) throw new Error('compaction input store is missing')
        const readInput = compactionInputs.read.bind(compactionInputs)
        const freezeInput = compactionInputs.freeze.bind(compactionInputs)
        const compactionInputResults: unknown[] = []
        Reflect.set(compactionInputs, 'read', async (...args: Parameters<typeof readInput>) => {
          const result = await readInput(...args)
          compactionInputResults.push({
            operation: 'read',
            revoked,
            args,
            result: 'failure' in result ? result : { kind: 'ready' },
          })
          return result
        })
        Reflect.set(compactionInputs, 'freeze', async (...args: Parameters<typeof freezeInput>) => {
          const result = await freezeInput(...args)
          compactionInputResults.push({ operation: 'freeze', revoked, result })
          return result
        })
        let recordsAtRevocation = tree.records.length
        let historyAtRevocation: Awaited<ReturnType<typeof historyOf>> = []
        const qualifications: unknown[] = []
        try {
          await drive(`Do the original legal task. ${PUBLIC_TASK}`, 1)
          const compressed = await drive('Continue the existing task and use a compact history.', 2)
          expect(compactions).toBe(1)
          expect(
            summaries[0]?.taskRetained,
            'the original task is covered by the mixed summary, not independently retained',
          ).toBe(false)
          const adopted = compressed.filter(entry => entry.kind === 'message.compaction')
          expect(adopted).toHaveLength(1)
          expect(textsOf(adopted[0]!.payload).join('\n')).toContain(PRIVATE_A)
          expect(requests.at(-1)?.body).toContain('MIXED_SUMMARY')
          expect(requests.at(-1)?.body).toContain(PUBLIC_TASK)
          const before = statSync(join(a, 'note'))
          expect(readFileSync(join(a, 'note'), 'utf8')).toBe('one effect')
          await command(tree, ['select-workspace', '--session', session, ...second])
          await drive('Continue in this legal workspace.', 3)
          expect(requests.at(-1)?.body).toContain(LEGAL_B)
          expect(requests.at(-1)?.body).toContain(PRIVATE_A)
          historyAtRevocation = await historyOf(tree, session)
          recordsAtRevocation = tree.records.length
          Reflect.set(service, 'verify', async (...args: Parameters<typeof verify>) => {
            const answer = await verify(...args)
            const refused = answer.kind === 'attachable' && answer.directory === a
            qualifications.push({
              args,
              original: answer,
              returned: refused ? { kind: 'not-permitted' } : answer,
            })
            if (refused) {
              refusalChecks++
              return { kind: 'not-permitted' }
            }
            return answer
          })
          revoked = true
          await command(tree, [
            'send-input',
            '--session',
            session,
            '--text',
            'Continue the original task using only currently legal information.',
          ])
          const deadline = Date.now() + 30000
          for (;;) {
            const leaked =
              requests.some(request => request.revoked && request.body.includes(PRIVATE_A)) ||
              summaries.some(summary => summary.revoked && summary.material.includes(PRIVATE_A))
            const sent = requests.some(request => request.revoked)
            if (leaked || sent || Date.now() > deadline) break
            await sleep(200)
          }
          const afterRequests = requests.filter(request => request.revoked)
          const afterSummaries = summaries.filter(summary => summary.revoked)
          observations.push({
            refusalChecks,
            afterRequests: afterRequests.length,
            afterSummaries: afterSummaries.length,
            compactions,
            records: tree.records
              .filter(record => JSON.stringify(record).includes('waits for a dependency'))
              .slice(-8),
          })
          expect(refusalChecks, 'A qualification was actually withdrawn').toBeGreaterThan(0)
          expect(
            afterRequests.filter(request => request.body.includes(PRIVATE_A)),
            'no revoked mixed summary may reach a work or summary model endpoint',
          ).toHaveLength(0)
          expect(
            afterSummaries.filter(summary => summary.material.includes(PRIVATE_A)),
            'recovery must not feed the revoked mixed summary back to a summarizer',
          ).toHaveLength(0)
          expect(
            afterRequests.length,
            'B remains legal and must continue rather than wait forever for A',
          ).toBeGreaterThan(0)
          expect(afterRequests.at(-1)?.body).toContain(PUBLIC_TASK)
          expect(afterRequests.at(-1)?.body).toContain(LEGAL_B)
          const ended = await pollUntil(
            'the legal B continuation ends',
            () => historyOf(tree, session),
            rows => rows.filter(row => row.kind === 'run.terminal').length >= 4,
          )
          expect(
            ended.filter(entry => entry.kind === 'run.terminal').at(-1)?.payload,
          ).toMatchObject({ terminal: { outcome: 'completed' } })
          expect(ended.filter(entry => entry.kind === 'message.tool')).toHaveLength(1)
          expect(toolLedger(tree.storageRoot)).toHaveLength(1)
          const after = statSync(join(a, 'note'))
          expect({
            ino: after.ino,
            size: after.size,
            mtimeMs: after.mtimeMs,
            text: readFileSync(join(a, 'note'), 'utf8'),
          }).toEqual({
            ino: before.ino,
            size: before.size,
            mtimeMs: before.mtimeMs,
            text: 'one effect',
          })
        } finally {
          const finalHistory = await historyOf(tree, session)
          observations.push({
            session,
            recordsAtRevocation,
            revisionAtRevocation: historyAtRevocation.at(-1)?.revision,
            lastRunAtRevocation: historyAtRevocation
              .filter(entry => entry.kind.startsWith('run.'))
              .slice(-3),
            finalRevision: finalHistory.at(-1)?.revision,
            compactionInputResults,
            qualifications,
            telemetryAfterRevocation: tree.records
              .slice(recordsAtRevocation)
              .filter(record => record['level'] === 'warn' || record['level'] === 'error'),
            factsAfterRevocation: finalHistory
              .slice(historyAtRevocation.length)
              .filter(entry => /run|step|compaction|project|recover/u.test(entry.kind)),
            lastHistory: finalHistory.slice(-20),
          })
          Reflect.set(service, 'verify', verify)
          Reflect.set(compactionInputs, 'read', readInput)
          Reflect.set(compactionInputs, 'freeze', freezeInput)
          process.stdout.write(
            'SUMMARY_RECOVERY_OBSERVATIONS ' +
              JSON.stringify({ requests, summaries, observations }) +
              '\n',
          )
        }
      },
    )
    expect(result).toBe(0)
  },
)
