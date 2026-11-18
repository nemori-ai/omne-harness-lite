import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultAnswer,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess } from './support/in-process.ts'

let root: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-notification-')))
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const person = { kind: 'person' }
const marks = { seenAt: null, resolved: null, supersededBy: null }
const succeeded: Readonly<Record<string, unknown>> = {
  send: { recipients: [person] },
  'query-send': { kind: 'accepted', notifications: [{ recipient: person, marks }] },
  'list-inbox': { entries: [], next: null },
  'read-notification': {
    source: 'owner.posts',
    event: 'e-1',
    recipient: person,
    sequence: 1,
    type: 'post',
    title: '浇花',
    level: 'strong',
    cause: { kind: 'named' },
    acceptedAt: '2026-11-18T06:00:00.000Z',
    marks,
    subject: null,
    at: '2026-11-18T06:00:00.000Z',
    body: '',
    locator: null,
  },
  mark: marks,
  'list-sources': { sources: [] },
}

async function serve(override: (seen: Seen) => Answer | undefined = () => undefined) {
  const service = await startFakeService(
    (seen: Seen) =>
      override(seen) ??
      (Object.hasOwn(succeeded, seen.operation)
        ? { outcome: 'succeeded', body: succeeded[seen.operation] }
        : defaultAnswer(seen)),
  )
  services.push(service)
  const login = await runInProcess(
    ['login', '--login-identifier', 'alice', '--server', service.origin],
    { omneHome: join(root, 'state'), homeDirectory: join(root, 'home') },
  )
  expect(login.code).toBe(0)
  return service
}
const cli = (argv: readonly string[]) =>
  runInProcess(argv, { omneHome: join(root, 'state'), homeDirectory: join(root, 'home') })
const sent = (service: FakeService, operation: string) =>
  service.seen.filter(seen => seen.operation === operation)
const body = (service: FakeService, operation: string) => sent(service, operation).at(-1)?.body
const printed = (run: { stdout: string }) => JSON.parse(run.stdout) as Record<string, any>

describe('omne notification send', () => {
  it('posts as the owner to the person, with an event id of its own that it prints', async () => {
    const service = await serve()
    const run = await cli(['notification', 'send', '--title', '浇花', '--body', '阳台那两盆'])
    expect(run.code).toBe(0)
    const event = body(service, 'send')?.['event']
    expect(body(service, 'send')).toEqual({
      tenant: tenantText,
      source: 'owner.posts',
      event: expect.stringMatching(/^.+$/),
      type: 'post',
      subject: null,
      title: '浇花',
      body: '阳台那两盆',
      locator: null,
      replaceKey: null,
      renotify: false,
      named: [person],
    })
    expect(event).not.toBe(sent(service, 'send')[0]?.messageId)
    expect(run.stderr).toBe('')
    expect(printed(run)).toMatchObject({
      outcome: 'succeeded',
      body: { recipients: [person] },
      request: { tenant: tenantText, source: 'owner.posts', event },
    })
    await cli(['notification', 'send', '--title', '再来一条'])
    expect(body(service, 'send')).toMatchObject({ body: '' })
  })

  it('takes the event id, source, type, subject and replace key it is given', async () => {
    const service = await serve()
    await cli([
      'notification',
      'send',
      '--title',
      '周报',
      '--event',
      'weekly-47',
      '--source',
      'demo.things',
      '--type',
      'changed',
      '--subject',
      'repo/a',
      '--replace',
      'weekly',
    ])
    expect(body(service, 'send')).toMatchObject({
      source: 'demo.things',
      event: 'weekly-47',
      type: 'changed',
      subject: 'repo/a',
      replaceKey: 'weekly',
    })
  })

  it('exits 0 for a send that is recalled and 3 for one the server refuses', async () => {
    const service = await serve(seen =>
      seen.operation !== 'send'
        ? undefined
        : seen.body['event'] === 'again'
          ? { outcome: 'no-change', body: { recipients: [person] } }
          : seen.body['event'] === 'other'
            ? { outcome: 'conflict', body: { reason: 'different-content' } }
            : { outcome: 'denied', body: {} },
    )
    const recalled = await cli(['notification', 'send', '--title', 't', '--event', 'again'])
    expect([recalled.code, printed(recalled)['outcome']]).toEqual([0, 'no-change'])
    const conflict = await cli(['notification', 'send', '--title', 't', '--event', 'other'])
    expect([conflict.code, printed(conflict)['body']]).toEqual([3, { reason: 'different-content' }])
    expect((await cli(['notification', 'send', '--title', 't'])).code).toBe(3)
    expect(service.seen.filter(seen => seen.operation === 'send')).toHaveLength(3)
  })

  it('does not say a send succeeded when its result is unknown, and tells how to ask again', async () => {
    await serve(seen => (seen.operation === 'send' ? { outcome: 'unknown', body: {} } : undefined))
    const run = await cli(['notification', 'send', '--title', 't', '--event', 'e-9'])
    expect(run.code).toBe(5)
    expect(printed(run)).toMatchObject({ outcome: 'unknown', request: { event: 'e-9' } })
    expect(run.stderr).toContain('omne notification send: result uncertain')
    expect(run.stderr).toContain('omne notification sent --source owner.posts --event e-9')
  })

  it('says only that the result is uncertain for a command that has no way to ask again', async () => {
    await serve(seen => (seen.operation === 'mark' ? { outcome: 'unknown', body: {} } : undefined))
    const run = await cli(['notification', 'done', '--event', 'e-1'])
    expect(run.code).toBe(5)
    expect(run.stderr).toBe('omne notification done: result uncertain\n')
  })

  it('asks what became of a send by its event id, and never sends', async () => {
    const service = await serve()
    const run = await cli(['notification', 'sent', '--event', 'e-9'])
    expect(run.code).toBe(0)
    expect(body(service, 'query-send')).toEqual({
      tenant: tenantText,
      source: 'owner.posts',
      event: 'e-9',
    })
    expect(printed(run)['body']).toMatchObject({ kind: 'accepted' })
    expect(sent(service, 'send')).toEqual([])
  })
})

describe('omne notification list, show and the four marks', () => {
  it('lists what is not resolved, the first twenty, unless asked for all or a later page', async () => {
    const service = await serve()
    expect((await cli(['notification', 'list'])).code).toBe(0)
    expect(body(service, 'list-inbox')).toEqual({
      tenant: tenantText,
      recipient: person,
      filter: 'unresolved',
      after: null,
      limit: 20,
    })
    await cli(['notification', 'list', '--all', '--after', '20', '--limit', '5'])
    expect(body(service, 'list-inbox')).toMatchObject({ filter: 'all', after: 20, limit: 5 })
  })

  it.each([
    ['--after', 'x'],
    ['--after', '-1'],
    ['--after', '0x10'],
    ['--after', '05'],
    ['--after', '1e1'],
    ['--limit', '1.5'],
    ['--limit', '1e1'],
    ['--limit', ' 5'],
  ])('refuses %s %s before any request and names the option', async (option, value) => {
    const service = await serve()
    const run = await cli(['notification', 'list', option, value])
    expect(run.code).toBe(2)
    expect(run.stderr).toBe(`omne notification list: ${option.slice(2)}\n`)
    expect(sent(service, 'list-inbox')).toEqual([])
  })

  it('leaves a page size of zero to the protocol, which does not send it', async () => {
    const service = await serve()
    expect((await cli(['notification', 'list', '--limit', '0'])).code).toBe(2)
    expect(sent(service, 'list-inbox')).toEqual([])
  })

  it('reads one notification of the person in full', async () => {
    const service = await serve()
    const run = await cli(['notification', 'show', '--event', 'e-1'])
    expect(run.code).toBe(0)
    expect(body(service, 'read-notification')).toEqual({
      tenant: tenantText,
      recipient: person,
      source: 'owner.posts',
      event: 'e-1',
    })
    expect(printed(run)['body']).toMatchObject({ title: '浇花', cause: { kind: 'named' } })
  })

  it.each(['seen', 'done', 'dismiss', 'restore'])('%s marks one notification', async operation => {
    const service = await serve()
    const run = await cli(['notification', operation, '--event', 'e-1', '--source', 'agent.posts'])
    expect(run.code).toBe(0)
    expect(body(service, 'mark')).toEqual({
      tenant: tenantText,
      recipient: person,
      source: 'agent.posts',
      event: 'e-1',
      operation,
    })
  })

  it('exits 3 when the notification is not there or the mark conflicts', async () => {
    await serve(seen =>
      seen.operation === 'read-notification'
        ? { outcome: 'not-found', body: {} }
        : seen.operation === 'mark'
          ? { outcome: 'conflict', body: { reason: 'restore-first' } }
          : undefined,
    )
    expect((await cli(['notification', 'show', '--event', 'nope'])).code).toBe(3)
    const run = await cli(['notification', 'done', '--event', 'e-1'])
    expect([run.code, printed(run)['body']]).toEqual([3, { reason: 'restore-first' }])
  })

  it('lists the sources and their event types', async () => {
    const service = await serve()
    expect((await cli(['notification', 'sources'])).code).toBe(0)
    expect(body(service, 'list-sources')).toEqual({ tenant: tenantText })
  })
})

describe('omne notification: usage', () => {
  it.each([
    [['notification']],
    [['notification', 'forward']],
    [['notification', 'send']],
    [['notification', 'send', '--title', 't', '--title', 'u']],
    [['notification', 'send', '--title', 't', '--named', 'agent']],
    [['notification', 'sent']],
    [['notification', 'show']],
    [['notification', 'done']],
    [['notification', 'done', '--event', 'e-1', '--all']],
    [['notification', 'sources', '--event', 'e-1']],
  ])('%j is a usage error and sends nothing', async argv => {
    const service = await serve()
    const before = service.seen.length
    const run = await cli(argv)
    expect(run.code).toBe(2)
    expect(run.stdout).toBe('')
    expect(service.seen).toHaveLength(before)
  })

  it.each([
    [['notification', 'send'], 'omne notification send: missing --title'],
    [['notification', 'sent'], 'omne notification sent: missing --event'],
    [['notification', 'show'], 'omne notification show: missing --event'],
    [['notification', 'restore'], 'omne notification restore: missing --event'],
    [['notification', 'forward'], 'omne notification: unrecognized arguments'],
    [['notification', 'sources', '--all'], 'omne notification sources: unrecognized arguments'],
  ])('%j says what is wrong', async (argv, message) => {
    await serve()
    expect((await cli(argv)).stderr.split('\n')[0]).toBe(message)
  })

  it('needs a login', async () => {
    const run = await cli(['notification', 'list'])
    expect(run.code).not.toBe(0)
    expect(run.stdout).toBe('')
  })
})
