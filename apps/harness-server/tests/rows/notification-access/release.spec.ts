import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { notificationAccessRow } from '../../../src/rows/notification-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { runOmne, savedLoginProof, savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import {
  onReleaseTreeRuns,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Reply = Readonly<{ status: number; outcome: string; body: Record<string, any> }>
type Client = Readonly<{
  tenant: string
  call(operation: string, body: Record<string, unknown>, tenant?: string): Promise<Reply>
  observe(): Readonly<{ frames: Record<string, unknown>[]; close(): void }>
}>

const person = { kind: 'person' }
const POST = {
  source: 'owner.posts',
  event: 'p1',
  type: 'post',
  subject: null,
  title: '周五前浇花',
  body: '阳台那两盆。',
  locator: null,
  replaceKey: null,
  renotify: false,
  named: [person],
}
const ref = (event: string) => ({ recipient: person, source: 'owner.posts', event })
const inbox = (filter: 'unresolved' | 'all') => ({
  recipient: person,
  filter,
  after: null,
  limit: 20,
})

/** A client of notification/v2 over HTTP, with the login the given client state saved. */
function clientOf(port: number, home: string): Client {
  const url = (operation: string) =>
    `http://127.0.0.1:${String(port)}/api/notification/v2/${operation}`
  const headers = () => ({
    'content-type': 'application/json',
    authorization: `Bearer ${savedLoginProof(home)}`,
    'omne-message-id': 'm-notification',
  })
  const tenant = savedTenant(home)
  return {
    tenant,
    async call(operation, body, as = tenant) {
      const response = await fetch(url(operation), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ tenant: as, ...body }),
      })
      const json = (await response.json()) as { outcome: string; body?: Record<string, any> }
      return { status: response.status, outcome: json.outcome, body: json.body ?? {} }
    },
    observe() {
      const frames: Record<string, unknown>[] = []
      const controller = new AbortController()
      void fetch(url('observe-changes'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ tenant }),
        signal: controller.signal,
      })
        .then(async response => {
          const reader = response.body?.getReader()
          if (reader === undefined) return
          const decoder = new TextDecoder()
          let buffered = ''
          for (;;) {
            const chunk = await reader.read()
            if (chunk.done) return
            buffered += decoder.decode(chunk.value, { stream: true })
            for (let end = buffered.indexOf('\n\n'); end !== -1; end = buffered.indexOf('\n\n')) {
              const block = buffered.slice(0, end)
              buffered = buffered.slice(end + 2)
              if (!block.startsWith('data: ')) continue
              const event = JSON.parse(block.slice('data: '.length)) as {
                kind: string
                frame?: Record<string, unknown>
              }
              if (event.kind === 'frame' && event.frame !== undefined) frames.push(event.frame)
            }
          }
        })
        .catch(() => {})
      return { frames, close: () => controller.abort() }
    },
  }
}

/** A second account on its own client state, registered and logged in against the same server. */
async function stranger(tree: ReleaseTree): Promise<Client> {
  const base = dirname(tree.home)
  const home = join(base, 'frank')
  const credential = 'frank-pw-notification-release-7d1a'
  for (const command of ['register', 'login'])
    expect(
      (
        await runOmne({
          args: [command, '--login-identifier', 'frank'],
          home,
          server: `http://127.0.0.1:${String(tree.port)}`,
          cwd: base,
          credential,
        })
      ).status,
    ).toBe(0)
  return clientOf(tree.port, home)
}

describe('notification and notification-access rows', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(notificationAccessRow)
    expect(declared).toMatchObject({
      row: 'notification-access',
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: { provides: [], injects: ['accessRegistry', 'principalIssuer'] },
    })
    expect(rowManifests.get(declared!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
  })

  it(
    'take a post of the owner once, keep it across a restart, and show it to no other tenant',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const exitCodes = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
        async tree => {
          const owner = clientOf(tree.port, tree.home)

          const sources = await owner.call('list-sources', {})
          expect(sources.outcome).toBe('succeeded')
          expect(sources.body['sources'].map((source: { name: string }) => source.name)).toEqual(
            expect.arrayContaining(['owner.posts', 'agent.posts', 'notification.system']),
          )

          const watching = owner.observe()
          try {
            await until(() => watching.frames.length >= 2, 'the opening frames', 10_000)
            const heard = watching.frames.length

            expect(await owner.call('send', POST)).toMatchObject({
              status: 200,
              outcome: 'succeeded',
              body: { recipients: [person] },
            })
            await until(() => watching.frames.length > heard, 'a frame after the send', 10_000)
            expect(watching.frames.at(-1)).toEqual({ kind: 'changed', about: 'inbox' })
          } finally {
            watching.close()
          }

          expect(await owner.call('send', POST)).toMatchObject({
            outcome: 'no-change',
            body: { recipients: [person] },
          })
          expect(await owner.call('send', { ...POST, title: '改主意了' })).toMatchObject({
            outcome: 'conflict',
            body: { reason: 'different-content' },
          })
          const listed = await owner.call('list-inbox', inbox('unresolved'))
          expect(listed.body['entries']).toHaveLength(1)
          expect(listed.body['entries'][0]).toMatchObject({
            source: 'owner.posts',
            event: 'p1',
            type: 'post',
            title: '周五前浇花',
            level: 'strong',
            cause: { kind: 'named' },
            marks: { seenAt: null, resolved: null, supersededBy: null },
          })
          expect((await owner.call('read-notification', ref('p1'))).body).toMatchObject({
            body: '阳台那两盆。',
            subject: null,
          })

          expect(await owner.call('send', { ...POST, source: 'agent.posts', event: 'x1' })).toEqual(
            { status: 403, outcome: 'denied', body: {} },
          )
          expect(
            await owner.call('list-inbox', {
              ...inbox('all'),
              recipient: { kind: 'agent', ref: 'some-session' },
            }),
          ).toMatchObject({ outcome: 'not-found' })

          const other = await stranger(tree)
          expect(other.tenant).not.toBe(owner.tenant)
          expect((await other.call('list-inbox', inbox('all'))).body['entries']).toEqual([])
          expect(await other.call('read-notification', ref('p1'))).toMatchObject({
            outcome: 'not-found',
          })
          expect(await other.call('mark', { ...ref('p1'), operation: 'done' })).toMatchObject({
            outcome: 'not-found',
          })
          expect(
            (await other.call('query-send', { source: 'owner.posts', event: 'p1' })).body,
          ).toEqual({ kind: 'not-submitted' })
          expect(await other.call('list-inbox', inbox('all'), owner.tenant)).toMatchObject({
            status: 403,
            outcome: 'denied',
          })
          expect(await other.call('send', { ...POST, title: '另一个租户的 p1' })).toMatchObject({
            outcome: 'succeeded',
          })
          expect((await owner.call('read-notification', ref('p1'))).body['title']).toBe(
            '周五前浇花',
          )
          expect((await other.call('read-notification', ref('p1'))).body['title']).toBe(
            '另一个租户的 p1',
          )
        },
        async tree => {
          await tree.relogin()
          const owner = clientOf(tree.port, tree.home)
          const kept = await owner.call('list-inbox', inbox('unresolved'))
          expect(kept.body['entries'].map((entry: { event: string }) => entry.event)).toEqual([
            'p1',
          ])
          expect(await owner.call('send', POST)).toMatchObject({ outcome: 'no-change' })

          expect(await owner.call('mark', { ...ref('p1'), operation: 'done' })).toMatchObject({
            outcome: 'succeeded',
            body: { resolved: { how: 'done' } },
          })
          expect((await owner.call('list-inbox', inbox('unresolved'))).body['entries']).toEqual([])
          const all = await owner.call('list-inbox', inbox('all'))
          expect(all.body['entries']).toHaveLength(1)
          expect(all.body['entries'][0]).toMatchObject({
            event: 'p1',
            marks: { resolved: { how: 'done' } },
          })
        },
      ])
      expect(exitCodes).toEqual([0, 0])
    },
  )
})
