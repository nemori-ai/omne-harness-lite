import { commandMenu } from '@omne-harness/tool-contract'
import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import {
  createNotificationsAuthor,
  notificationsAdoption,
  notificationsCommandNames,
  notificationsContract,
  notificationsParameterCodec,
  notificationsToolModule,
} from '@omne-harness/notification-tools'
import { author, json } from './world.ts'

describe('the author of Notifications', () => {
  it('refuses a construction that is not exactly resultMaxBytes, at least 64', () => {
    const wrong = [
      {},
      { resultMaxBytes: 63 },
      { resultMaxBytes: '64' },
      { resultMaxBytes: 64.5 },
      { limit: 64 },
      [],
      null,
    ]
    for (const construction of [...wrong, { resultMaxBytes: 64, more: 1 }])
      expect(createNotificationsAuthor(json(construction)), JSON.stringify(construction)).toEqual({
        failure: {
          field: 'construction',
          reason: 'Notifications takes only resultMaxBytes, at least 64',
        },
      })
    expect(createNotificationsAuthor(json({ resultMaxBytes: 64 }))).toHaveProperty('ok')
  })

  it('runs each command as one call that waits for nobody', () => {
    for (const [name, operation] of author().registration.operations) {
      expect(operation.author.waits, name).toEqual([])
      expect(operation.segments, name).toBeNull()
    }
  })

  it('says why a result over the limit is refused', () => {
    const operation = author(64).registration.operations[0]![1]
    if (operation.author.kind !== 'ordinary') throw new Error('ordinary')
    expect(operation.author.output.check({ value: 'x'.repeat(65) } as never)).toEqual({
      failure: { reason: 'the Notifications result exceeds resultMaxBytes' },
    })
  })

  it('writes a result as UTF-8 text and reads it back, and takes nothing but text', () => {
    const operation = author().registration.operations[1]![1]
    if (operation.author.kind !== 'ordinary') throw new Error('ordinary')
    const { codec, renderer } = operation.author
    const bytes = codec.encode('done 办完')
    if (!('ok' in bytes)) throw new Error('encode')
    expect([...bytes.ok]).toEqual([...new TextEncoder().encode('done 办完')])
    expect(codec.decode(bytes.ok)).toEqual({ ok: 'done 办完' })
    expect(codec.decode(new Uint8Array([0xff]))).toEqual({ failure: { reason: 'invalid-utf8' } })
    expect(codec.encode(5 as never)).toEqual({ failure: { reason: 'text-required' } })
    expect(renderer.render('done' as never)).toEqual({ ok: 'done' })
  })

  it('declares text in and text out, in the foreground only', () => {
    const created = createNotificationsAuthor(json({ resultMaxBytes: 64 }))
    if ('failure' in created) throw new Error('author')
    expect(created.ok.facts).toMatchObject({
      backgroundAllowed: false,
      declarations: { inputModalities: ['text'], outputModalities: ['text'], attachments: [] },
    })
  })

  it('the text a model reads: the menu and the rules of the tool', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const lines = commandMenu(definition)
      .split('\n')
      .map(line => line.replace(/ Returns string .*$/, ''))
    expect([...lines, '', definition.guide].join('\n')).toMatchInlineSnapshot(`
      "Call with {"command": <name>, "params": {…fields}}. In signatures, ? marks an optional field and a|b lists the allowed values.
      help {name?=help|send|sent|inbox|read|done|dismiss|restore|sources|subscriptions|subscribe|unsubscribe} - Read command usage.
      send {id, title, body?, locator?, replace?, renotify?} - Post one item to the owner. The same id again is the same post and writes nothing; replace supersedes your earlier post with that key.
      sent {id} - Whether a post was accepted, and how each recipient disposed it.
      inbox {filter?=unresolved|all, after?, limit?} - List your own inbox, oldest first. Unresolved only unless filter is all.
      read {source, event} - Read one notification of your inbox in full. Reading does not mark it.
      done {source, event} - Mark a notification of your inbox as handled.
      dismiss {source, event} - Mark a notification of your inbox as not needing action.
      restore {source, event} - Take back done or dismiss.
      sources {} - List the sources and event types you can subscribe to, with the subject each takes.
      subscriptions {} - List your own subscriptions.
      subscribe {source, type, level=off|weak|strong, scope?, note?, term?} - Set your subscription to one event type.
      unsubscribe {source, type, scope?} - Return one subscription to the default of its event type.

      You act as yourself: a post is from you, and inbox, read, done, dismiss, restore and subscriptions are about your own inbox. A post goes to the owner; other agents get it only if they subscribed to you.

      Give every post an id of your own. After a failure that says unknown, send the same command with the same id: a post that was accepted is recalled, not posted twice.

      A notification is named by its source and event, as inbox lists them. Done and dismiss both resolve it; restore takes either back.

      Subscribe sets one subscription: level off, weak or strong; scope all, one subject or a subject prefix; term standing, once or until an instant. See sources for the subject each event type takes.

      A failure starts with its reason, then says what to do."
    `)
  })

  it('the identities of what it declares and keeps change only on purpose', () => {
    expect({
      protocol: notificationsAdoption,
      executor: notificationsToolModule.executor,
      vocabulary: notificationsContract('sent').vocabulary,
    }).toMatchInlineSnapshot(`
      {
        "executor": {
          "digest": "sha256:09f75bfc5aa84d5bdfaace1f57acf345219a0da58944cd2e443016da115ce523",
          "name": "Notifications",
          "owner": "@omne-harness/notification-tools",
          "revision": "2",
        },
        "protocol": {
          "digest": "sha256:72013f1a40047847660a469be6dc1b1d545472f50476014d49fb522b07cc042c",
          "name": "notifications-protocol",
          "owner": "@omne-harness/notification-tools",
          "revision": "2",
        },
        "vocabulary": {
          "digest": "sha256:3bc678812d4bdd7ec87238b6aef84b74a1f843223164dea5907fae7bce0a4728",
          "name": "json-schema",
          "owner": "@omne-harness/notification-tools",
          "revision": "2020-12",
        },
      }
    `)
  })
})

describe('the schema of a command', () => {
  it('never marks a field read-only: a model is to send scope, term and locator', () => {
    for (const name of notificationsCommandNames) {
      const schema = writeJsonText(notificationsContract(name).schema)
      expect(schema, name).not.toContain('readOnly')
    }
    const subscribe = JSON.parse(writeJsonText(notificationsContract('subscribe').schema))
    expect(subscribe.properties.scope.oneOf).toHaveLength(3)
    expect(subscribe.properties.term.oneOf[2].properties.at).toMatchObject({ type: 'string' })
    expect(subscribe).not.toHaveProperty('$schema')
  })
})

describe('the parameters of a command', () => {
  const parse = (text: string, complete = true) =>
    notificationsParameterCodec('send').parse({ original: text, effective: text, complete })
  const reasonOf = (params: unknown) => {
    const parsed = parse(JSON.stringify(params))
    if (!('failure' in parsed)) throw new Error('expected a failure')
    return parsed.failure
  }

  it('are refused when they are not JSON', () => {
    expect(parse('{"id":')).toHaveProperty('failure')
    expect(parse(JSON.stringify({ id: 'p1', title: 'T' }))).toEqual({
      ok: { command: 'send', params: { id: 'p1', title: 'T' } },
    })
  })

  it('name the field that is wrong, with its path, and every problem at once', () => {
    expect(reasonOf({ id: 'p1', title: '' })).toEqual({
      kind: 'invalid',
      reason: expect.stringMatching(/^title: \S/),
    })
    expect(reasonOf({ id: 'p1', title: 'T', locator: { kind: '', ref: 'r' } }).reason).toMatch(
      /^locator\.kind: \S/,
    )
    expect(reasonOf({ id: 'p1', title: 'T', emitter: 'a2' }).reason).toBe(
      'Unrecognized key: "emitter"',
    )
    expect(reasonOf({ id: 'bad id', title: '' }).reason).toMatch(/^id: .+; title: .+$/)
  })
})
