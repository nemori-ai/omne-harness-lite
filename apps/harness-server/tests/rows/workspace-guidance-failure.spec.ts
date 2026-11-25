// @module-tag slow
// Starts the actual release tree, native file readers, and a loopback model endpoint.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFailed, onTestFinished } from 'vitest'
import { agentCompactionKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { CompactionOutcome, CompactionTaskState } from '@omne-harness/agent-contract'
import { sessionModelHistoryReadinessKey } from '@omne-harness/session-adapters/cordis'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  textsOf,
  toolLedger,
  unsettledExecutions,
  type ReleaseTree,
} from '../support/release-tree.ts'
import { setModelSwitches } from '../support/model-switches.ts'
import { command, registered, run, sessionIn } from '../support/workspace-guidance.ts'

function workspace() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-failure-')))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  return root
}

async function settled(tree: ReleaseTree, session: string) {
  await pollUntil(
    'the Agent execution to settle',
    () => unsettledExecutions(tree.storageRoot, session),
    count => count === 0,
  )
}

it(
  'C6 required root guidance exceeding model input budgets fails explicitly before dispatch',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const root = workspace()
    // This release model has a 163840-token window. Its o200k tokenizer measures each
    // space-separated hieroglyph as five tokens: the body exceeds the window while remaining
    // below the release fixture storage response limit.
    const body = 'BUDGET_REQUIRED_802\n' + '𓀀 '.repeat(40_000)
    const requests: string[] = []
    const answers = toolCallsByRequest(body => {
      requests.push(body)
      return []
    })
    const exit = await onReleaseTree(
      {
        model: 'deepseek/deepseek-v3.2',
        // Leave room for an ordinary control request on this small-window model.
        nonresident: ['Code', 'OmneExtensions', 'Schedules'],
        script: async input => {
          const answer = await answers(input)
          // The selected release record pins DeepInfra as its serving provider.
          return {
            ...answer,
            body: answer.body.replaceAll('"provider":"OpenAI"', '"provider":"DeepInfra"'),
          }
        },
        extraHistoryKinds: ['message.system_reminder'],
      },
      async tree => {
        const service = tree.scope.get(agentCompactionKey)
        if (service === undefined) throw new Error('release compaction service is missing')
        const outcomes: CompactionOutcome[] = []
        const record = (state: CompactionTaskState) => {
          if (state.phase === 'terminal') outcomes.push(state.outcome)
        }
        const admit = service.admit.bind(service)
        Reflect.set(service, 'admit', async (input: Parameters<typeof admit>[0]) => {
          const answer = await admit(input)
          if ('ok' in answer) record(answer.ok)
          return answer
        })
        const inspect = service.inspect.bind(service)
        Reflect.set(service, 'inspect', async (input: Parameters<typeof inspect>[0]) => {
          const answer = await inspect(input)
          if ('ok' in answer && answer.ok.kind === 'found') record(answer.ok.state)
          return answer
        })
        onTestFailed(() => {
          process.stderr.write(
            'failure release records: ' +
              JSON.stringify(
                tree.records
                  .filter(record => {
                    const text = JSON.stringify(record)
                    return (
                      text.includes('agent run waits for a dependency') ||
                      text.includes('owner=session-log-journal diagnostic=')
                    )
                  })
                  .slice(-8),
              ) +
              '\n',
          )
        })
        await setModelSwitches(tree, { 'deepseek/deepseek-v3.2': true })
        const selected = await registered(tree, root)
        const control = await run(tree, await sessionIn(tree, selected))
        const controlEnd = control.find(entry => entry.kind === 'run.terminal')?.payload
        expect(controlEnd, JSON.stringify(controlEnd)).toMatchObject({
          terminal: { outcome: 'completed' },
        })
        expect(requests).toHaveLength(1)
        expect(requests[0]).toContain('deepseek/deepseek-v3.2')
        expect(requests[0]).not.toContain('BUDGET_REQUIRED_802')
        writeFileSync(join(root, 'AGENTS.md'), body)
        const session = await sessionIn(tree, selected)
        await command(tree, ['send-input', '--session', session, '--text', 'Begin.'])
        const entries = await pollUntil(
          'the over-budget run to end',
          () => {
            const sourceFailure = tree.records.find(record => {
              const text = JSON.stringify(record)
              return (
                text.includes('agent run waits for a dependency') &&
                text.includes('workspace guidance') &&
                /unreadable|unknown|denied/u.test(text)
              )
            })
            if (sourceFailure !== undefined)
              throw new Error(
                'budget fixture did not reach measurement: ' + JSON.stringify(sourceFailure),
              )
            return historyOf(tree, session)
          },
          seen => seen.some(entry => entry.kind === 'run.terminal'),
        )
        expect(requests).toHaveLength(1)
        expect(entries.filter(entry => entry.kind === 'run.started')).toHaveLength(1)
        expect(
          entries
            .filter(entry => entry.kind === 'message.system_reminder')
            .flatMap(entry => textsOf(entry.payload))
            .some(text => text.includes(JSON.stringify(body))),
          'the complete required root body is persisted before budget rejection',
        ).toBe(true)
        expect(entries.find(entry => entry.kind === 'run.terminal')?.payload).toMatchObject({
          terminal: { outcome: 'failed' },
        })
        // The release default compactor rejects its fixed summary material before sending.
        expect(outcomes).toContainEqual(
          expect.objectContaining({
            kind: 'failed',
            reason: 'execution-limit',
            diagnostic: expect.stringContaining(
              'fixed summary material exceeds the summary model input limit',
            ),
          }),
        )
        expect(toolLedger(tree.storageRoot)).toHaveLength(0)
        await settled(tree, session)
      },
    )
    expect(exit).toBe(0)
  },
)

it(
  'C6 cancelling while required child guidance is unavailable preserves one completed write and stops waiting',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const root = workspace()
    const child = join(root, 'child')
    mkdirSync(child)
    writeFileSync(join(child, 'AGENTS.md'), Buffer.from([0xff]))
    const requests: string[] = []
    const exit = await onReleaseTree(
      {
        permission: 'bypass-permissions',
        extraHistoryKinds: ['message.system_reminder'],
        script: toolCallsByRequest(body => {
          requests.push(body)
          return requests.length === 1
            ? [
                {
                  id: 'write-once',
                  tool: 'Files',
                  arguments: JSON.stringify({
                    command: 'write',
                    intent: 'create one note',
                    params: { path: 'child/note.txt', text: 'one effect', mode: 'create' },
                  }),
                },
              ]
            : []
        }),
      },
      async tree => {
        onTestFailed(() => {
          process.stderr.write(
            'failure release records: ' +
              JSON.stringify(
                tree.records
                  .filter(record => {
                    const text = JSON.stringify(record)
                    return (
                      text.includes('agent run waits for a dependency') ||
                      text.includes('owner=session-log-journal diagnostic=')
                    )
                  })
                  .slice(-8),
              ) +
              '\n',
          )
        })
        const session = await sessionIn(tree, root)
        await command(tree, ['send-input', '--session', session, '--text', 'Begin.'])
        await pollUntil(
          'the Agent to wait for the unreadable guidance',
          () => tree.records,
          records =>
            records.some(
              record =>
                JSON.stringify(record).includes('agent run waits for a dependency') &&
                JSON.stringify(record).includes('guidance'),
            ),
        )
        expect(requests).toHaveLength(1)
        expect(readFileSync(join(child, 'note.txt'), 'utf8')).toBe('one effect')
        const before = await historyOf(tree, session)
        expect(before.filter(entry => entry.kind === 'message.tool')).toHaveLength(1)
        expect(before.filter(entry => entry.kind === 'run.terminal')).toHaveLength(0)
        const started = before.find(entry => entry.kind === 'run.started')
        await command(tree, [
          'cancel-run',
          '--session',
          session,
          '--run',
          String(started?.payload['run']),
          '--urgency',
          'force',
        ])
        const after = await pollUntil(
          'the waiting Run to cancel',
          () => historyOf(tree, session),
          entries => entries.some(entry => entry.kind === 'run.terminal'),
        )
        expect(after.find(entry => entry.kind === 'run.terminal')?.payload).toMatchObject({
          terminal: { outcome: 'cancelled' },
        })
        const calls = await pollUntil(
          'the completed Files resources to release',
          () => toolLedger(tree.storageRoot),
          rows =>
            rows.length === 1 &&
            rows.every(
              row =>
                row.released &&
                !row.tasks.some(task => task === 'queue' || task.startsWith('wait-registration')),
            ),
        )
        expect(calls).toMatchObject([{ tool: 'Files', phase: 'settled', released: true }])
        expect(requests).toHaveLength(1)
        expect(after.filter(entry => entry.kind === 'message.tool')).toHaveLength(1)
        expect(readFileSync(join(child, 'note.txt'), 'utf8')).toBe('one effect')
        await settled(tree, session)
      },
    )
    expect(exit).toBe(0)
  },
)

it(
  'C6 cancellation while the guidance readiness answer is in flight prevents the prepared request',
  { tags: ['slow'], timeout: 360_000 },
  async () => {
    const root = workspace()
    writeFileSync(join(root, 'AGENTS.md'), 'READ_CANCEL_ROOT_934')
    const requests: string[] = []
    const exit = await onReleaseTree(
      {
        script: toolCallsByRequest(body => {
          requests.push(body)
          return []
        }),
        extraHistoryKinds: ['message.system_reminder'],
      },
      async tree => {
        const service = tree.scope.get(sessionModelHistoryReadinessKey)
        if (service === undefined) throw new Error('release readiness service is missing')
        const ensure = service.ensure.bind(service)
        const gate = Promise.withResolvers<void>()
        let held = false
        let returned = false
        Reflect.set(service, 'ensure', async (input: Parameters<typeof ensure>[0]) => {
          const answer = await ensure(input)
          held = true
          await gate.promise
          returned = true
          return answer
        })
        onTestFailed(() => {
          process.stderr.write(
            'failure release records: ' +
              JSON.stringify(
                tree.records
                  .filter(record => {
                    const text = JSON.stringify(record)
                    return (
                      text.includes('agent run waits for a dependency') ||
                      text.includes('owner=session-log-journal diagnostic=')
                    )
                  })
                  .slice(-8),
              ) +
              '\n',
          )
        })
        const session = await sessionIn(tree, root)
        try {
          await command(tree, ['send-input', '--session', session, '--text', 'Begin.'])
          await pollUntil('the real guidance readiness answer to be held', () => held, Boolean)
          expect(requests).toHaveLength(0)
          const before = await historyOf(tree, session)
          expect(
            JSON.stringify(before.filter(entry => entry.kind === 'message.system_reminder')),
          ).toContain('READ_CANCEL_ROOT_934')
          const started = before.find(entry => entry.kind === 'run.started')
          await command(tree, [
            'cancel-run',
            '--session',
            session,
            '--run',
            String(started?.payload['run']),
            '--urgency',
            'force',
          ])
        } finally {
          gate.resolve()
        }
        const after = await pollUntil(
          'the in-flight readiness Run to cancel',
          () => historyOf(tree, session),
          entries => entries.some(entry => entry.kind === 'run.terminal'),
        )
        expect(returned).toBe(true)
        expect(after.find(entry => entry.kind === 'run.terminal')?.payload).toMatchObject({
          terminal: { outcome: 'cancelled' },
        })
        expect(requests).toHaveLength(0)
        expect(toolLedger(tree.storageRoot)).toHaveLength(0)
        await settled(tree, session)
      },
    )
    expect(exit).toBe(0)
  },
)
