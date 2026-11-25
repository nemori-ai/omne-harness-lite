import { describe, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import type { SessionFailure } from '@omne-harness/session-contract'
import {
  DEFINITION,
  createWorld,
  fixtureLogin,
  loginIdentity,
  type World,
} from './fixtures/world.ts'

const ALICE = fixtureLogin('a')
const signal = new AbortController().signal
const ops = (world: World) => world.contribution.operations
const as = <P>(principal: P) => ({ principal, messageId: 'm-1', signal })
const MODEL = 'anthropic/claude-sonnet-5'
const LIMITS = {
  maxBytes: 65536,
  maxDepth: 16,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 65536,
  maxNumberLength: 32,
}

function said(text: string) {
  const read = readJsonText(
    JSON.stringify({
      id: 'msg_abcdefghijklmnopqrstuv',
      role: 'user',
      blocks: [{ kind: 'text', id: 'block-1', visibility: { toHuman: true, toModel: true }, text }],
    }),
    LIMITS,
  )
  if (read.kind !== 'ok' || read.value.kind !== 'object')
    throw new Error('fixture message did not read')
  return read.value
}

async function opened(): Promise<Readonly<{ world: World; session: string }>> {
  const world = createWorld()
  const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
    createCallId: 'create-1',
    definition: DEFINITION,
    purpose: 'hello',
  })
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return { world, session: answer.body.session }
}

const asked = (name: string, operation: string, args: string): SessionFailure =>
  ({ kind: 'unsupported', request: { name, operation, args } }) as SessionFailure

async function command(name: string, operation: string, args: string) {
  const { world, session } = await opened()
  world.session.controls.failNext(asked(name, operation, args))
  const answer = await ops(world)['send-input'](as(loginIdentity(ALICE)), {
    tenant: ALICE.tenant,
    session,
    acceptId: 'accept-1',
    inputId: 'input-1',
    message: said(`/${name} ${args}`),
  })
  const methods = world.session.controls.calls().map(call => call.method)
  return { answer, methods, world }
}

const refused = (reason: string) => ({
  outcome: 'invalid',
  body: { field: 'value.message', reason },
})

describe('a system command does its own operation after it is written into the session (C11)', () => {
  it('/model names one model and selects it', async () => {
    const { answer, methods } = await command('model', 'select-model', ` ${MODEL} `)
    expect(answer).toMatchObject({
      outcome: 'succeeded',
      body: { operation: { name: 'model', outcome: 'succeeded' } },
    })
    expect(methods.filter(method => method === 'recordCommand' || method === 'change')).toEqual([
      'recordCommand',
      'change',
    ])
  })

  it('/model with no model or with two is refused, written but not done', async () => {
    for (const args of ['', `${MODEL} other/model`]) {
      const { answer, methods } = await command('model', 'select-model', args)
      expect(answer).toEqual(refused('model: invalid: name one model'))
      expect(methods).toContain('recordCommand')
      expect(methods).not.toContain('change')
    }
  })

  it('/permission names one of the modes; another word is refused with the modes', async () => {
    const done = await command('permission', 'change-permission-mode', 'never')
    expect(done.answer).toMatchObject({
      outcome: 'succeeded',
      body: { operation: { name: 'permission', outcome: 'succeeded' } },
    })
    expect(done.world.modes.calls().length).toBeGreaterThan(0)
    expect(done.methods).toContain('change')
    const wrong = await command('permission', 'change-permission-mode', 'loud')
    expect(wrong.answer).toEqual(
      refused('permission: invalid: name one mode: never, auto_permission, bypass-permissions'),
    )
    expect(wrong.world.modes.calls()).toHaveLength(0)
  })

  it('/archive takes no arguments', async () => {
    const wrong = await command('archive', 'archive-session', 'now')
    expect(wrong.answer).toEqual(refused('archive: invalid: it takes no arguments'))
    const done = await command('archive', 'archive-session', '')
    expect(done.answer).toMatchObject({
      outcome: 'succeeded',
      body: { operation: { name: 'archive', outcome: 'succeeded' } },
    })
  })

  it('an operation the release does not do is refused by its name', async () => {
    const { answer } = await command('reload', 'reload-session', '')
    expect(answer).toEqual(refused('reload: unsupported: reload-session'))
  })
})
