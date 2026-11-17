// covers: PD-tool-execution S15
import assert from 'node:assert/strict'
import { it } from 'vitest'
import {
  onReleaseTree,
  toolCallFacts,
  toolCallsByRequest,
  type ScriptedToolCall,
} from '../tests/support/release-tree.ts'
import {
  history,
  LIMIT_MS,
  record,
  release,
  textOf,
  until,
  untilQuiet,
  waitingCommand,
} from './fixtures/release.ts'

const OPENING = 'start: S15 the first long command'
const SECOND = 'S15: start the second long command'
const THIRD = 'S15: list them and stop the first'
const REASON = 'S15 not needed'
const STOPPED = 'never-s15'
const KEPT = 'go-s15'

type Entry = Awaited<ReturnType<typeof history>>[number]
const count = (entries: readonly Entry[], kind: string) =>
  entries.filter(entry => entry.kind === kind).length
const bkg = (id: string, command: string, params: object): ScriptedToolCall => ({
  id,
  tool: 'BkgToolCalls',
  arguments: JSON.stringify({ command, params }),
})

// One Run holds one tool place, and a call in the background keeps its place (Tool SPEC 排队与名额),
// so each command starts in its own turn; a third turn lists them and stops the one naming STOPPED.
function step(body: string): readonly ScriptedToolCall[] {
  if (body.includes(THIRD)) {
    if (!body.includes('done BkgToolCalls list')) return [bkg('call_s15_list', 'list', {})]
    if (body.includes('done BkgToolCalls terminate')) return []
    const short = new RegExp(
      `(b[0-9]+) {2}\\S+ {2}test call {2}Shell execute · [^"\\\\]*${STOPPED}`,
      'u',
    )
    const id = short.exec(body)?.[1]
    return id === undefined ? [] : [bkg('call_s15_stop_it', 'terminate', { id, reason: REASON })]
  }
  if (body.includes(SECOND))
    return body.includes('call_s15_keep')
      ? []
      : [{ id: 'call_s15_keep', tool: 'Shell', arguments: waitingCommand(KEPT) }]
  return body.includes(OPENING) && !body.includes('call_s15_stop')
    ? [{ id: 'call_s15_stop', tool: 'Shell', arguments: waitingCommand(STOPPED) }]
    : []
}

it(
  'S15 the agent lists two background commands and stops one; the outcome says the agent stopped it',
  { timeout: 4 * LIMIT_MS },
  async () => {
    const bodies: string[] = []
    const script = toolCallsByRequest(body => {
      bodies.push(body)
      return step(body)
    })
    const observed: Record<string, unknown> = {}
    let passed = false
    const exitCode = await onReleaseTree(
      { script, permission: 'bypass-permissions', extraHistoryKinds: ['message.system_reminder'] },
      async tree => {
        try {
          const session = await tree.startSession(OPENING)
          const turn = async (text: string, ended: number) => {
            await until(
              `turn ${ended} to end`,
              () => history(tree, session),
              entries => count(entries, 'run.terminal') >= ended,
            )
            const sent = await tree.cli(['send-input', '--session', session, '--text', text])
            assert.equal(sent.status, 0, sent.stderr)
          }
          await turn(SECOND, 1)
          await turn(THIRD, 2)
          const callIdOf = (marker: string) =>
            [...toolCallFacts(tree.storageRoot)].find(([, facts]) =>
              facts.arguments.includes(marker),
            )?.[0]
          const quiet = await until(
            'the stopped command to come back',
            () => history(tree, session),
            entries =>
              entries.some(
                entry =>
                  entry.kind === 'message.system_reminder' &&
                  textOf(entry).includes(`The background call ${callIdOf(STOPPED)}`),
              ),
          )
          const listed = bodies.find(body => body.includes('done BkgToolCalls list')) ?? ''
          const lines = [STOPPED, KEPT].map(marker =>
            new RegExp(
              `b[0-9]+ {2}(queued|running) {2}test call {2}Shell execute · [^"\\\\]*${marker}`,
              'u',
            ).exec(listed),
          )
          observed['listed'] = lines.map(line => line?.[0] ?? null)
          assert.ok(
            lines.every(line => line !== null),
            'each call has a short id, intent, action and state',
          )
          const answered = await until(
            'the answer of terminate to reach the model',
            () => bodies.find(body => body.includes('done BkgToolCalls terminate')) ?? '',
            body => body !== '',
          )
          assert.match(
            answered,
            /stop requested\. It has not stopped yet/u,
            'the answer is requested',
          )
          const reminders = quiet.filter(entry => entry.kind === 'message.system_reminder')
          observed['reminders'] = reminders.map(textOf)
          const stopped = reminders.find(entry =>
            textOf(entry).includes(`The background call ${callIdOf(STOPPED)}`),
          )
          assert.ok(
            stopped !== undefined && textOf(stopped).includes(`stopped by you. Reason: ${REASON}`),
            'the outcome says the agent stopped it',
          )
          assert.ok(
            !reminders.some(entry => textOf(entry).includes('The user stopped background call')),
            'no stop reminder: the agent knows from the answer',
          )
          assert.equal(count(quiet, 'run.started'), 3, 'the stopped outcome starts no turn')

          await until(
            'the third turn to end',
            () => history(tree, session),
            value => count(value, 'run.terminal') >= 3,
          )
          release(tree, KEPT)
          const entries = await until(
            'the other command to wake the agent',
            () => history(tree, session),
            value => count(value, 'run.terminal') >= 4,
          )
          observed['starts'] = count(entries, 'run.started')
          assert.equal(count(entries, 'run.started'), 4, 'only the other outcome woke the agent')
          const target = callIdOf(STOPPED)
          assert.equal(
            target === undefined ? -1 : toolCallFacts(tree.storageRoot).get(target)?.starts,
            1,
          )
          await untilQuiet(tree, session, 4)
          passed = true
        } finally {
          record('S15', passed, observed)
        }
      },
    )
    assert.equal(exitCode, 0)
  },
)
