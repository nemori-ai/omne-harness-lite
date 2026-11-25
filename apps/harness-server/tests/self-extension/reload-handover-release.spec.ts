// @module-tag slow
// Starts the release tree: a person reloads a session while its run goes on; the run is handed over and goes on in the new version.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import type { GatewayScript } from '../fixtures/model-gateway.ts'
import { cliOk, direct, plan } from '../support/planned-model.ts'
import { answerCard, history, pollUntil, type ReleaseTree } from '../support/release-tree.ts'
import {
  definition,
  noterSession,
  of,
  ownerOf,
  publish,
  published,
  reload,
  replace,
  say,
  type Entry,
} from './noter.ts'
import { inWorkspace, recordingModel, workspaceExit, write } from './support.ts'

const NOTER = 'You say back what you are told.'
const TOOLS = ['Files', 'Shell']

/** A Shell call that marks each time it runs, then waits for the test to write `file`. */
const waitFor = (project: string, file = 'go') =>
  direct('Shell', {
    command: 'execute',
    intent: 'wait until the test lets the call end',
    params: {
      script: `echo ${file} >> ${join(project, 'runs.txt')}; while [ ! -f ${join(project, file)} ]; do sleep 0.2; done; cat ${join(project, file)}`,
    },
  })

const askPort = direct('Ask', {
  command: 'ask',
  params: {
    questions: [
      {
        title: 'Which port should the dev server use?',
        description: 'Port 8080 is in use by another process on this machine.',
        options: [
          { label: '8081 (Recommended)', description: 'The next free port.' },
          { label: '3000', description: 'The default port of the framework.' },
        ],
      },
    ],
  },
})

const reasonOf = (item: Entry) => (item.payload as { reason?: string }).reason
const answerOf = (ran: Awaited<ReturnType<typeof reload>>) => {
  const { outcome, body } = JSON.parse(ran.stdout) as { outcome: string; body?: unknown }
  return { outcome, body }
}

async function runEnds(tree: ReleaseTree, session: string, count: number) {
  return pollUntil(
    `run ${String(count)} of the noter to end`,
    () => history(tree.port, tree.home, session),
    seen => of(seen, 'run.terminal').length >= count,
  )
}

describe('a person reloads a session while its run goes on, on the release tree', () => {
  it(
    'waiting on a tool: the same run goes on in one more attempt, the next request has the new prompt, the tool ran once and queued words keep their order',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree, project) => {
          const child = await noterSession(ask, tree, definition('MARK-ONE', TOOLS))
          await say(tree, child, plan([waitFor(project)], []))
          await pollUntil(
            'the tool to run',
            async () => existsSync(join(project, 'runs.txt')),
            Boolean,
          )
          await ask(
            [replace('work/noter/AGENT.md', definition('MARK-TWO', TOOLS))],
            [publish('op-2')],
          )
          await published(model.bodies, 'op-2')
          await say(tree, child, 'QUEUED-ONE')
          await say(tree, child, 'QUEUED-TWO')

          expect(answerOf(await reload(tree, child, 'reload-1'))).toEqual({
            outcome: 'succeeded',
            body: { kind: 'handed-over' },
          })
          writeFileSync(join(project, 'go'), 'RELEASED')
          const after = await runEnds(tree, child, 2)

          expect(of(after, 'run.started')).toHaveLength(2)
          expect(
            of(after, 'run.attempt-started')
              .map(reasonOf)
              .filter(r => r === 'reload'),
          ).toHaveLength(1)
          expect(readFileSync(join(project, 'runs.txt'), 'utf8').trim().split('\n')).toEqual(['go'])
          const noter = model.bodies.filter((_, at) => (model.systems[at] ?? '').includes(NOTER))
          const answered = noter.filter(body => body.includes('RELEASED'))
          expect(answered.length).toBeGreaterThan(0)
          for (const body of answered) expect(body).toContain('MARK-TWO')
          const last = noter.at(-1) ?? ''
          expect(last.indexOf('QUEUED-ONE')).toBeGreaterThan(-1)
          expect(last.indexOf('QUEUED-ONE')).toBeLessThan(last.indexOf('QUEUED-TWO'))
        },
        { script: model.script, extraHistoryKinds: ['run.attempt-started'] },
      )
    },
  )

  it(
    'while the Model is asked: the reload waits for the step to end, then the run is handed over and the call is not sent again',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      const gate = Promise.withResolvers<void>()
      let held = 0
      // The second request of the run is held while the Model answers: the first event goes out, the rest waits.
      const script: GatewayScript = async input => {
        const answer = await model.script(input)
        const asked = input.body.includes('FIRST-DONE') && !input.body.includes('SECOND-DONE')
        if (!asked || held > 0 || !(model.systems.at(-1) ?? '').includes(NOTER)) return answer
        held += 1
        const cut = answer.body.indexOf('\n\n') + 2
        return {
          ...answer,
          body: answer.body.slice(0, cut),
          rest: { after: gate.promise, body: answer.body.slice(cut) },
        }
      }
      await inWorkspace(
        async (ask, tree, project) => {
          try {
            const child = await noterSession(ask, tree, definition('MARK-ONE', TOOLS))
            await say(
              tree,
              child,
              plan([waitFor(project, 'first')], [waitFor(project, 'second')], []),
            )
            await pollUntil(
              'the first tool to run',
              async () => existsSync(join(project, 'runs.txt')),
              Boolean,
            )
            await ask(
              [replace('work/noter/AGENT.md', definition('MARK-TWO', TOOLS))],
              [publish('op-2')],
            )
            await published(model.bodies, 'op-2')
            writeFileSync(join(project, 'first'), 'FIRST-DONE')
            await pollUntil(
              'the Model to be asked',
              async () => held,
              count => count === 1,
            )
            let answered = false
            const reloading = reload(tree, child, 'reload-1').finally(() => (answered = true))
            await sleep(1_500)
            expect(answered).toBe(false)

            gate.resolve()
            expect(answerOf(await reloading)).toEqual({
              outcome: 'succeeded',
              body: { kind: 'handed-over' },
            })
            writeFileSync(join(project, 'second'), 'SECOND-DONE')
            const after = await runEnds(tree, child, 2)

            expect(
              of(after, 'run.attempt-started')
                .map(reasonOf)
                .filter(r => r === 'reload'),
            ).toHaveLength(1)
            const noter = model.bodies.filter((_, at) => (model.systems[at] ?? '').includes(NOTER))
            const asked = noter.filter(
              body => body.includes('FIRST-DONE') && !body.includes('SECOND-DONE'),
            )
            expect(asked).toHaveLength(1)
            expect(asked[0]).toContain('MARK-ONE')
            const last = noter.filter(body => body.includes('SECOND-DONE'))
            expect(last.length).toBeGreaterThan(0)
            for (const body of last) expect(body).toContain('MARK-TWO')
            expect(readFileSync(join(project, 'runs.txt'), 'utf8').trim().split('\n')).toEqual([
              'first',
              'second',
            ])
          } finally {
            gate.resolve()
          }
        },
        { script, extraHistoryKinds: ['run.attempt-started'] },
      )
    },
  )

  it(
    'after a cancel of the run: the run is not handed over, and it ends cancelled',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      // The subject is the reload, not how the server stops: a cancelled Shell call is not settled by then.
      await workspaceExit(
        async (ask, tree, project) => {
          const child = await noterSession(ask, tree, definition('MARK-ONE', TOOLS))
          await say(tree, child, plan([waitFor(project)], []))
          await pollUntil(
            'the tool to run',
            async () => existsSync(join(project, 'runs.txt')),
            Boolean,
          )
          await ask(
            [replace('work/noter/AGENT.md', definition('MARK-TWO', TOOLS))],
            [publish('op-2')],
          )
          await published(model.bodies, 'op-2')
          const run = String(
            (
              of(await history(tree.port, tree.home, child), 'run.started').at(-1)?.payload as {
                run?: string
              }
            )?.run,
          )
          await cliOk(tree, [
            'cancel-run',
            '--session',
            child,
            '--run',
            run,
            '--control-id',
            'cancel-1',
            '--tenant',
            ownerOf(tree),
          ])

          const answer = answerOf(await reload(tree, child, 'reload-1'))
          expect([
            JSON.stringify({ outcome: 'conflict', body: { reason: 'cancelled' } }),
            JSON.stringify({ outcome: 'succeeded', body: { kind: 'adopted' } }),
          ]).toContain(JSON.stringify(answer))
          const after = await runEnds(tree, child, 2)
          expect(of(after, 'run.attempt-started').map(reasonOf)).not.toContain('reload')
          expect(of(after, 'run.terminal').at(-1)?.payload).toMatchObject({
            terminal: { outcome: 'cancelled' },
          })
          writeFileSync(join(project, 'go'), 'RELEASED')
        },
        { script: model.script, extraHistoryKinds: ['run.attempt-started'] },
      )
    },
  )

  it(
    'with a card waiting for a person: the card is still there after the handover, and its answer goes on in the new version',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          // A person's own session of the noter: a delegated one has no person to ask.
          await ask(
            [write('work/noter/AGENT.md', definition('MARK-ONE', [...TOOLS, 'Ask']))],
            [publish('op-1')],
          )
          await published(model.bodies, 'op-1')
          const made = await cliOk(tree, ['create-session', '--definition', 'noter'])
          const child = String(made.body['session'])
          await say(tree, child, plan([askPort], []))
          const [card] = await pollUntil(
            'the card of the noter',
            () => tree.cards({ sessionRef: child }),
            cards => cards.length === 1,
          )
          await ask(
            [replace('work/noter/AGENT.md', definition('MARK-TWO', [...TOOLS, 'Ask']))],
            [publish('op-2')],
          )
          await published(model.bodies, 'op-2')

          expect(answerOf(await reload(tree, child, 'reload-1'))).toEqual({
            outcome: 'succeeded',
            body: { kind: 'handed-over' },
          })
          const kept = await tree.cards({ sessionRef: child })
          expect(kept.map(item => item.card.ref.cardId)).toEqual([card?.card.ref.cardId])
          await answerCard(tree, child, 'use port 8081 please')
          const after = await runEnds(tree, child, 1)

          expect(
            of(after, 'run.attempt-started')
              .map(reasonOf)
              .filter(r => r === 'reload'),
          ).toHaveLength(1)
          const noter = model.bodies.filter((_, at) => (model.systems[at] ?? '').includes(NOTER))
          const answered = noter.filter(body => body.includes('8081 please'))
          expect(answered.length).toBeGreaterThan(0)
          for (const body of answered) expect(body).toContain('MARK-TWO')
        },
        { script: model.script, extraHistoryKinds: ['run.attempt-started'] },
      )
    },
  )
})
