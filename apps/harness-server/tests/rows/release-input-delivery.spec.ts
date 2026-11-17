// @module-tag slow
// Slow: runs the release tree in process with a local model gateway, real Session, Agent and Tool.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GatewayScript } from '../fixtures/model-gateway.ts'
import {
  historyOf,
  likeARealModel,
  onReleaseTree,
  pollUntil,
  sse,
  toolCallFacts,
  toolCallsByRequest,
  type Entry,
  type ReleaseTree,
} from '../support/release-tree.ts'

const serving = { model: 'm', provider: 'OpenAI' }
const words = (text: string) => ({ ...serving, choices: [{ delta: { content: text } }] })
const stop = { choices: [{ delta: {}, finish_reason: 'stop' }] }
const reply = (text: string) => ({
  status: 200,
  contentType: 'text/event-stream',
  body: sse([words(text), stop]),
})
const noReply = {
  status: 200,
  contentType: 'text/event-stream',
  body: sse([{ ...serving, ...stop }]),
}

type Asked = Readonly<{ role: string; text: string }>

/** The messages of a model request, each as its role and its whole content as text. */
function messagesOf(body: string): Asked[] {
  const parsed = JSON.parse(body) as { messages?: { role?: string; content?: unknown }[] }
  return (parsed.messages ?? []).map(message => ({
    role: String(message.role),
    text: JSON.stringify(message.content ?? null),
  }))
}

/** What a request brings after the last reply of the model: the news it asks about. */
function newsOf(body: string): Asked[] {
  const messages = messagesOf(body)
  return messages.slice(messages.findLastIndex(message => message.role === 'assistant') + 1)
}

const count = (entries: readonly Entry[], kind: string) =>
  entries.filter(entry => entry.kind === kind).length

function outcomes(entries: readonly Entry[]): string[] {
  return entries
    .filter(entry => entry.kind === 'run.terminal')
    .map(entry =>
      String((entry.payload as { terminal?: { outcome?: unknown } }).terminal?.outcome ?? ''),
    )
}

const ended = (tree: ReleaseTree, session: string, turns: number) =>
  pollUntil(
    `${String(turns)} turns to end`,
    () => historyOf(tree, session),
    entries => count(entries, 'run.terminal') >= turns,
  )

async function sendInput(tree: ReleaseTree, session: string, text: string) {
  const sent = await tree.cli(['send-input', '--session', session, '--text', text])
  expect(sent.status, sent.stderr).toBe(0)
}

describe('an input reaches the model with the step that takes it', () => {
  it('a follow-up sent while the model writes its reply is asked after that reply, in the same turn', async () => {
    const OPENING = 'start: a question with a slow answer'
    const FOLLOW = 'follow-up: one more thing'
    const held = Promise.withResolvers<void>()
    const asked = { ownReply: 0 }
    const requests: string[] = []
    const script: GatewayScript = likeARealModel(({ body }) => {
      requests.push(body)
      // The first reply sends some words, then holds until the follow-up is in.
      if (!body.includes(FOLLOW))
        return {
          status: 200,
          contentType: 'text/event-stream',
          body: `data: ${JSON.stringify(words('first '))}\n\n`,
          rest: { after: held.promise, body: sse([words('answer'), stop]) },
        }
      return reply('second answer')
    }, asked)
    const exitCode = await onReleaseTree(
      { script, permission: 'bypass-permissions' },
      async tree => {
        const session = await tree.startSession(OPENING)
        await pollUntil(
          'the first reply to be half way',
          () => requests.length,
          value => value >= 1,
        )
        await sendInput(tree, session, FOLLOW)
        held.resolve()
        const entries = await ended(tree, session, 1)

        expect(outcomes(entries)).toEqual(['completed'])
        expect(count(entries, 'run.started')).toBe(1)
        expect(asked.ownReply).toBe(0)
        expect(requests).toHaveLength(2)
        expect(requests[0]).not.toContain(FOLLOW)
        const news = newsOf(requests[1] ?? '')
        expect(news.map(message => message.role)).toEqual(['user'])
        expect(news[0]?.text).toContain(FOLLOW)
        expect(messagesOf(requests[1] ?? '').some(message => message.role === 'assistant')).toBe(
          true,
        )
      },
    )
    expect(exitCode).toBe(0)
  })

  it('after a turn that took quiet reminders fails, the next input of a person starts a turn that carries them', async () => {
    const OPENING = 'start: two long commands'
    const FOLLOW = 'follow-up: after the failed turn'
    const STOPPED = 'The user stopped background call'
    const command = (name: string) =>
      JSON.stringify({
        command: 'execute',
        intent: 'test call',
        params: {
          script: `while [ ! -f ${name} ]; do sleep 0.1; done; echo ${name}-done`,
          run_in_background: true,
        },
      })
    const asked = { ownReply: 0 }
    const requests: string[] = []
    const base = toolCallsByRequest(body =>
      body.includes(OPENING) && !body.includes('"role":"tool"')
        ? [
            { id: 'call_stop', tool: 'Shell', arguments: command('never-delivery') },
            { id: 'call_keep', tool: 'Shell', arguments: command('go-delivery') },
          ]
        : [],
    )
    // The model has no reply for the reminder of the stop until a person writes again.
    const script: GatewayScript = likeARealModel(request => {
      requests.push(request.body)
      return newsOf(request.body).some(message => message.text.includes(STOPPED)) &&
        !request.body.includes(FOLLOW)
        ? noReply
        : base(request)
    }, asked)
    const exitCode = await onReleaseTree(
      { script, permission: 'bypass-permissions', extraHistoryKinds: ['message.system_reminder'] },
      async tree => {
        const session = await tree.startSession(OPENING)
        await ended(tree, session, 1)
        const listed = await tree.cli(['calls', 'list', '--session', session, '--json'])
        const calls = (
          JSON.parse(listed.stdout) as {
            body: { calls: { producer: { call: string }; intent?: string }[] }
          }
        ).body.calls.map(item => item.producer.call)
        expect(calls).toHaveLength(2)
        const ledger = toolCallFacts(tree.storageRoot)
        const target = calls.find(call =>
          ledger
            .get(String((JSON.parse(call) as unknown[])[2]))
            ?.arguments.includes('never-delivery'),
        )
        if (target === undefined) throw new Error('the call that never ends is not listed')
        const stopped = await tree.cli([
          'calls',
          'stop',
          '--session',
          session,
          '--call',
          target,
          '--reason',
          'no longer needed',
        ])
        expect(stopped.status, stopped.stderr).toBe(0)
        await pollUntil(
          'the stop reminder and the outcome of the stopped call to come back',
          () => historyOf(tree, session),
          entries => count(entries, 'message.system_reminder') >= 2,
        )

        writeFileSync(join(dirname(tree.storageRoot), 'workspace', 'go-delivery'), '')
        const failed = await ended(tree, session, 2)
        expect(outcomes(failed)).toEqual(['completed', 'failed'])
        expect(count(failed, 'run.started')).toBe(2)

        await sendInput(tree, session, FOLLOW)
        const entries = await ended(tree, session, 3)
        expect(outcomes(entries)).toEqual(['completed', 'failed', 'completed'])
        expect(count(entries, 'run.started')).toBe(3)
        expect(asked.ownReply).toBe(0)
        const last = messagesOf(requests.at(-1) ?? '')
          .map(message => message.text)
          .join('\n')
        expect(last).toContain(STOPPED)
        expect(last.indexOf(STOPPED)).toBeLessThan(last.indexOf(FOLLOW))
      },
    )
    expect(exitCode).toBe(0)
  })
})
