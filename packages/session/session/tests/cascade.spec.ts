import { afterEach, describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { SessionFailure, WorkSnapshot } from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  operationId,
  sessionId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { turn } from './fixtures/control-fixture.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, TENANT_A, type CommitHook, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

const INTERVAL = 10_000
const basis = evidence('created-by-test')

async function settle(): Promise<void> {
  for (let round = 0; round < 20; round += 1) await turn()
}

async function tree(): Promise<Harness> {
  const h = await harness({ backend: memoryBackend })
  open.push(h)
  await h.create('parent')
  const make = async (session: string, relation: object, attendance: 'attended' | 'unattended') =>
    succeeded(
      await h.faces('intake').management.create({
        ...h.access(session),
        operation: operationId(`create-${session}`),
        creation: creation({ relation, attendance } as never),
      }),
      `create ${session}`,
    )
  const child = (parent: string) => ({ kind: 'child', parent: sessionId(parent), basis })
  await make('child-1', child('parent'), 'unattended')
  await make('child-2', child('parent'), 'unattended')
  await make('grandchild', child('child-1'), 'unattended')
  await make('handed', { kind: 'handoff', origin: sessionId('parent'), basis }, 'attended')
  for (const session of ['parent', 'child-1', 'child-2', 'grandchild', 'handed'])
    h.bindings.controls.bind(TENANT_A, sessionId(session))
  return h
}

const read = async (h: Harness, session: string): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access(session)), `read ${session}`)
const cascades = (snapshot: WorkSnapshot) => snapshot.tasks.filter(task => task.kind === 'cascade')
const lifecycles = async (h: Harness, sessions: readonly string[]) =>
  Promise.all(sessions.map(async session => (await read(h, session)).lifecycle))

const archive = (h: Harness, session = 'parent') =>
  h.faces('intake').work.control({
    ...h.access(session),
    operation: operationId(`archive-${session}`),
    intent: { kind: 'archive' },
  })

/** Every control commit a session other than the parent is asked for, as the hook sees it. */
function childControls(
  h: Harness,
  answer?: (session: string, attempt: number) => SessionFailure | null,
) {
  const seen: { session: string; operation: string; intent: unknown }[] = []
  const hook: CommitHook = (input, next) => {
    const { command } = input
    if (command.kind !== 'control' || command.input.session === sessionId('parent')) return next()
    const { session, operation, intent } = command.input
    seen.push({ session, operation, intent })
    const attempt = seen.filter(item => item.session === session).length
    const failure = answer?.(session, attempt) ?? null
    return failure === null ? next() : Promise.resolve(fail(failure))
  }
  h.view.onCommit(hook)
  return seen
}

describe('the cascade of an archive', () => {
  it('archives every child layer by layer under the identity each task fixes, and leaves a handed-over session alone', async () => {
    const h = await tree()
    const seen = childControls(h)
    succeeded(await archive(h), 'archive')
    const saved = cascades(await read(h, 'parent'))
    await settle()
    expect(await lifecycles(h, ['child-1', 'child-2', 'grandchild'])).toEqual([
      'archived',
      'archived',
      'archived',
    ])
    expect((await read(h, 'handed')).lifecycle).not.toBe('archived')
    expect(cascades(await read(h, 'parent'))).toEqual([])
    expect(cascades(await read(h, 'child-1'))).toEqual([])
    const first = seen.find(item => item.session === sessionId('child-1'))
    const task = saved.find(item => item.child === sessionId('child-1'))
    expect(first).toEqual({
      session: 'child-1',
      operation: task?.childOperation,
      intent: {
        kind: 'archive',
        cascade: { parent: 'parent', control: operationId('archive-parent') },
      },
    })
    expect(seen.find(item => item.session === sessionId('grandchild'))?.intent).toMatchObject({
      cascade: { parent: 'child-1' },
    })
    expect(seen.map(item => item.session).sort()).toEqual(['child-1', 'child-2', 'grandchild'])
  })

  it('goes on after the process is rebuilt: a scan finds the saved tasks without the archive being made here', async () => {
    const h = await tree()
    succeeded(
      await h.backend.transactions.commit({
        access: h.access('parent'),
        command: {
          kind: 'control',
          input: {
            tenant: TENANT_A,
            session: sessionId('parent'),
            operation: operationId('archive-parent'),
            intent: { kind: 'archive' },
          },
        },
        guards: [],
      }),
      'archive behind the instance',
    )
    await settle()
    expect(await lifecycles(h, ['child-1', 'child-2'])).not.toContain('archived')
    const handle = succeeded(await h.instance.maintain(TENANT_A), 'maintain')
    await settle()
    expect(await lifecycles(h, ['child-1', 'child-2', 'grandchild'])).toEqual([
      'archived',
      'archived',
      'archived',
    ])
    expect(cascades(await read(h, 'parent'))).toEqual([])
    await handle.release()
  })

  it('keeps the task of a child that refuses as denied with the reason, does not drive it again, and archives the others', async () => {
    const h = await tree()
    const seen = childControls(h, session =>
      session === sessionId('child-1') ? { kind: 'denied', action: 'control' } : null,
    )
    succeeded(await archive(h), 'archive')
    await settle()
    expect(await lifecycles(h, ['child-1', 'child-2', 'grandchild'])).toEqual([
      expect.not.stringMatching('archived'),
      'archived',
      expect.not.stringMatching('archived'),
    ])
    expect(cascades(await read(h, 'parent'))).toMatchObject([{ child: 'child-1', state: 'denied' }])
    h.clock.controls.advance(INTERVAL * 3)
    await settle()
    expect(seen.filter(item => item.session === sessionId('child-1'))).toHaveLength(1)
  })

  it('drives a child again under the same identity when the result of its archive is not known', async () => {
    const h = await tree()
    const seen = childControls(h, (session, attempt) =>
      session === sessionId('child-2') && attempt === 1
        ? { kind: 'commit-unknown', operation: operationId('lost') }
        : null,
    )
    succeeded(await archive(h), 'archive')
    await settle()
    expect((await read(h, 'child-2')).lifecycle).not.toBe('archived')
    expect(cascades(await read(h, 'parent'))).toMatchObject([
      { child: 'child-2', state: 'pending' },
    ])
    h.clock.controls.advance(INTERVAL)
    await settle()
    expect((await read(h, 'child-2')).lifecycle).toBe('archived')
    expect(cascades(await read(h, 'parent'))).toEqual([])
    const asked = seen.filter(item => item.session === sessionId('child-2'))
    expect(asked).toHaveLength(2)
    expect(asked[0]?.operation).toBe(asked[1]?.operation)
  })

  it('counts a child that was archived before as done, and stops driving after the count of the policy', async () => {
    const h = await tree()
    succeeded(await archive(h, 'child-2'), 'archive the child first')
    await settle()
    const seen = childControls(h, session =>
      session === sessionId('child-1')
        ? { kind: 'unavailable', owner: 'storage', diagnostic: 'down' }
        : null,
    )
    succeeded(await archive(h), 'archive')
    await settle()
    expect(cascades(await read(h, 'parent'))).toMatchObject([
      { child: 'child-1', state: 'pending' },
    ])
    for (let drive = 0; drive < 40; drive += 1) {
      h.clock.controls.advance(INTERVAL)
      await settle()
    }
    expect(seen.filter(item => item.session === sessionId('child-1'))).toHaveLength(30)
    expect(cascades(await read(h, 'parent'))).toMatchObject([
      { child: 'child-1', state: 'pending' },
    ])
  })
})
