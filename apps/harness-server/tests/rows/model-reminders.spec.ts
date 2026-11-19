// @module-tag slow
import { describe, expect, it } from 'vitest'
import {
  identityGovernanceKey,
  identityOperationsKey,
  principalIssuerKey,
} from '@omne-harness/identity/cordis'
import { loginStateCodec } from '@omne-harness/legal-identity'
import { operationId, sessionId } from '@omne-harness/session-contract/testing'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { SESSION_PERMISSION_OWN_LOGIN_POLICY } from '../../src/rows/authorization/session-permission-write.ts'
import { loadProductionRelease } from '../../src/entry/tool-release.ts'
import {
  historyOf,
  onReleaseTree,
  onReleaseTreeRuns,
  pollUntil,
  type ReleaseTree,
} from '../support/release-tree.ts'

const sse = (events: readonly unknown[]) =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

type Body = Readonly<{ messages: readonly Readonly<Record<string, unknown>>[] }>

const SNAPSHOT = 'Runtime context: the current values.'
const CHANGE = 'Runtime context: these values changed.'

// The gateway answers every request with one short reply and keeps the request bodies.
function replying(bodies: Body[]) {
  return ({ body }: { body: string }) => {
    const request = JSON.parse(body) as Body & { model: string }
    bodies.push(request)
    const serving = { model: request.model, provider: 'OpenAI' }
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { ...serving, choices: [{ delta: { content: `reply ${bodies.length}` } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    }
  }
}

const textOf = (message: Readonly<Record<string, unknown>>): string =>
  typeof message['content'] === 'string' ? message['content'] : JSON.stringify(message['content'])
const history = (body: Body) => body.messages.filter(message => message['role'] !== 'system')
const reminders = (body: Body, marker: string) =>
  history(body).filter(message => textOf(message).includes(marker))

async function runs(tree: ReleaseTree, session: string, count: number) {
  await pollUntil(
    `${String(count)} runs end`,
    () => historyOf(tree, session),
    seen => seen.filter(entry => entry.kind === 'run.terminal').length >= count,
  )
}

async function send(tree: ReleaseTree, session: string, text: string) {
  const sent = await tree.cli(['send-input', '--session', session, '--text', text])
  expect(sent.status, sent.stderr).toBe(0)
}

// The permission change a person makes through the real services; the modes block follows it.
async function denyShell(tree: ReleaseTree, session: string) {
  const identity = tree.scope.get(identityOperationsKey)
  const governance = tree.env.readTrusted(identityGovernanceKey).get(identityGovernanceKey)
  const issuer = tree.env.readTrusted(principalIssuerKey).get(principalIssuerKey)
  const service = tree.scope.intercept(sessionKey, { caller: 'intake' }).get(sessionKey)
  if (!identity || !governance || !issuer || !service) throw new Error('services absent')
  const issued = await identity.issueLogin({
    loginIdentifier: 'erin',
    credential: 'erin-pw-release-tree-71f3',
  })
  if (issued.kind !== 'succeeded') throw new Error(`login: ${issued.kind}`)
  const recognized = await identity.recognizeLogin({ loginProof: issued.loginProof })
  if (recognized.kind !== 'recognized') throw new Error(`recognition: ${recognized.kind}`)
  const current = await governance.queryCurrentTenant({ login: recognized.login })
  if (current.kind !== 'succeeded') throw new Error(`tenant: ${current.kind}`)
  const login = loginStateCodec.encode(recognized.login)
  if (!login.ok) throw new Error('login encoding')
  const actor = issuer.issueSystem({ component: 'server-entry' })
  if ('failure' in actor) throw new Error('actor')
  const principal = issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: current.tenant,
    work: { owner: 'identity-login', work: login.value },
  })
  if ('failure' in principal) throw new Error('principal')
  const release = await loadProductionRelease()
  if (release.kind !== 'trusted') throw new Error('release')
  const permission = release.manifest.entries.find(entry => entry.asset.name === 'Shell')
    ?.governance.declaration.permissions[0]
  if (!permission) throw new Error('Shell permission absent')
  const changed = await service.management.change({
    principal: principal.ok,
    tenant: current.tenant,
    session: sessionId(session),
    operation: operationId('model-reminders-deny-shell'),
    declaration: {
      kind: 'permission-assignment',
      capabilityId: permission.capabilityId,
      enforcementKey: permission.enforcementKey,
      definition: permission.reference,
      rule: { pick: 'deny', allowedSet: null },
      expectedRevision: '0',
      authorization: SESSION_PERMISSION_OWN_LOGIN_POLICY,
    },
  })
  if ('failure' in changed) throw new Error(`change: ${JSON.stringify(changed.failure)}`)
}

describe('runtime context reaches the model through reminders in the session log', () => {
  it('C4: the first history message of a new session is a snapshot reminder with session.modes, and the log has it', async () => {
    const bodies: Body[] = []
    const extraHistoryKinds = ['message.system_reminder', 'message.delivered']
    await onReleaseTree({ script: replying(bodies), extraHistoryKinds }, async tree => {
      const session = await tree.startSession('Say hello.')
      await runs(tree, session, 1)
      const kinds = (await historyOf(tree, session)).map(entry => entry.kind)
      expect(kinds).toContain('message.system_reminder')
      expect(kinds.indexOf('message.system_reminder')).toBeLessThan(
        kinds.indexOf('message.delivered'),
      )
    })
    const [first] = bodies
    if (first === undefined) throw new Error('no request')
    const [head, next] = history(first)
    expect(textOf(head ?? {})).toContain(SNAPSHOT)
    expect(textOf(head ?? {})).toContain('session.modes')
    expect(textOf(next ?? {})).toContain('Say hello.')
  })

  it('C5: a changed mode adds one change reminder before the inputs of the next step; nothing else changes', async () => {
    const bodies: Body[] = []
    await onReleaseTree({ script: replying(bodies) }, async tree => {
      const session = await tree.startSession('First.')
      await runs(tree, session, 1)
      await send(tree, session, 'Second.')
      await runs(tree, session, 2)
      await denyShell(tree, session)
      await send(tree, session, 'Third.')
      await runs(tree, session, 3)
    })
    expect(bodies).toHaveLength(3)
    const [one, two, three] = bodies as [Body, Body, Body]
    expect(reminders(two, CHANGE)).toEqual([])
    expect(reminders(three, CHANGE)).toHaveLength(1)
    for (const [earlier, later] of [
      [one, two],
      [two, three],
    ] as const)
      expect(JSON.stringify(later.messages.slice(0, earlier.messages.length))).toBe(
        JSON.stringify(earlier.messages),
      )
    const tail = history(three).slice(history(two).length)
    expect(textOf(tail.find(message => textOf(message).includes(CHANGE)) ?? {})).toContain(
      'session.modes',
    )
    expect(tail.findIndex(message => textOf(message).includes(CHANGE))).toBeLessThan(
      tail.findIndex(message => textOf(message).includes('Third.')),
    )
  })

  it('C6: after the process is rebuilt, the first request carries a new full snapshot; the earlier history is unchanged', async () => {
    const bodies: Body[] = []
    let session = ''
    await onReleaseTreeRuns({ script: replying(bodies) }, [
      async tree => {
        session = await tree.startSession('Before the restart.')
        await runs(tree, session, 1)
      },
      async tree => {
        await send(tree, session, 'After the restart.')
        await runs(tree, session, 2)
      },
    ])
    expect(bodies).toHaveLength(2)
    const [before, after] = bodies as [Body, Body]
    expect(reminders(before, SNAPSHOT)).toHaveLength(1)
    expect(reminders(after, SNAPSHOT)).toHaveLength(2)
    expect(JSON.stringify(after.messages.slice(0, before.messages.length))).toBe(
      JSON.stringify(before.messages),
    )
  })
})
