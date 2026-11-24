import { describe, expect, it } from 'vitest'
import {
  NOT_CREATING,
  stepCreation,
  type CreateRequest,
  type Creating,
  type CreationEvent,
} from '../src/model/creation.ts'

const DATA: CreateRequest = { kind: 'data', name: 'notes', body: { kind: 'null' } }
const DIRECTORY: CreateRequest = {
  kind: 'directory',
  name: 'review',
  manifest: [{ path: 'SKILL.md', bytes: 9 }],
}
const nothingListed = () => false

function run(creating: Creating, ...events: CreationEvent[]) {
  let current = creating
  const effects = []
  let reread = false
  for (const event of events) {
    const step = stepCreation(current, event, nothingListed)
    current = step.creating
    effects.push(...step.effects)
    reread ||= step.reread
  }
  return { creating: current, effects, reread }
}

const sending = (request: CreateRequest = DATA) =>
  run(NOT_CREATING, { kind: 'create', operation: 'op-1', request }).creating

const unknown = () =>
  run(sending(), { kind: 'create-answered', operation: 'op-1', answer: { outcome: 'unknown' } })
    .creating

describe('the creation slot', () => {
  it('idle: a creation goes out under its operation', () => {
    expect(run(NOT_CREATING, { kind: 'create', operation: 'op-1', request: DIRECTORY })).toEqual({
      creating: {
        kind: 'sending',
        operation: 'op-1',
        request: DIRECTORY,
        received: 0,
        existed: false,
      },
      effects: [{ kind: 'create', operation: 'op-1', request: DIRECTORY }],
      reread: false,
    })
  })

  it('sending: a second creation is not sent; progress of its own operation is recorded, another is not', () => {
    const state = sending(DIRECTORY)
    expect(run(state, { kind: 'create', operation: 'op-2', request: DATA }).effects).toEqual([])
    expect(
      run(state, { kind: 'create-progress', operation: 'op-1', received: 5 }).creating,
    ).toMatchObject({ received: 5 })
    expect(run(state, { kind: 'create-progress', operation: 'op-0', received: 5 }).creating).toBe(
      state,
    )
  })

  it.each([
    [
      'succeeded, new',
      { outcome: 'succeeded', body: { version: 'v', holding: 'h', changed: true } },
      { kind: 'done', text: '已新建 notes。' },
      true,
    ],
    [
      'succeeded, the same content',
      { outcome: 'succeeded', body: { version: 'v', holding: 'h', changed: false } },
      { kind: 'done', text: 'notes 的内容和现在的这一版相同，没有变化。' },
      true,
    ],
    [
      'invalid, with what is missing',
      { outcome: 'invalid', body: { reason: 'body-invalid', missing: ['url', 'name'] } },
      {
        kind: 'refused',
        notice: { kind: 'refused', text: '服务端没有收下：body-invalid。缺：url、name。' },
      },
      false,
    ],
    [
      'conflict',
      { outcome: 'conflict', body: {} },
      {
        kind: 'refused',
        notice: { kind: 'refused', text: '同名的这一份正在别处改，没有新建。已重新读取。' },
      },
      true,
    ],
    [
      'an expired upload',
      { outcome: 'not-found', body: {} },
      {
        kind: 'refused',
        notice: { kind: 'refused', text: '这次上传已经过期或不在了，没有新建。请重新提交。' },
      },
      false,
    ],
    [
      'too many uploads',
      { outcome: 'limited', body: {} },
      { kind: 'refused', notice: { kind: 'refused', text: '同时在传的太多，稍后再试。' } },
      false,
    ],
    [
      'an upload that does not move',
      { outcome: 'stalled' },
      { kind: 'refused', notice: { kind: 'refused', text: '上传没有往前走，没有新建。' } },
      false,
    ],
    [
      'not sent',
      { outcome: 'unavailable' },
      { kind: 'refused', notice: { kind: 'unavailable', text: '没有发出去。' } },
      false,
    ],
  ] as const)('sending, answered %s', (_label, answer, creating, reread) => {
    const step = run(sending(), {
      kind: 'create-answered',
      operation: 'op-1',
      answer: answer as never,
    })
    expect(step.creating).toEqual(creating)
    expect(step.reread).toBe(reread)
  })

  const succeeded = {
    kind: 'create-answered',
    operation: 'op-1',
    answer: { outcome: 'succeeded', body: { version: 'v', holding: 'h', changed: true } },
  } as const
  const listedNotes = (name: string) => name === 'notes'

  it('a creation whose name was listed when it was sent becomes its new version', () => {
    const sent = stepCreation(
      NOT_CREATING,
      { kind: 'create', operation: 'op-1', request: DATA },
      listedNotes,
    ).creating
    expect(stepCreation(sent, succeeded, nothingListed).creating).toEqual({
      kind: 'done',
      text: '已成为 notes 的新版本。',
    })
  })

  it('a name that is listed only by the time the answer comes, because the list was read meanwhile, was made new', () => {
    expect(stepCreation(sending(), succeeded, listedNotes).creating).toEqual({
      kind: 'done',
      text: '已新建 notes。',
    })
  })

  it('an answer for another operation counts for nothing', () => {
    const state = sending()
    expect(
      run(state, { kind: 'create-answered', operation: 'op-0', answer: { outcome: 'unknown' } })
        .creating,
    ).toBe(state)
  })

  it.each([['unknown'], ['uncertain']] as const)(
    'answered %s: unknown, keeping the operation; a recall asks with the same request, once',
    outcome => {
      const state = run(sending(), {
        kind: 'create-answered',
        operation: 'op-1',
        answer: { outcome } as never,
      }).creating
      expect(state).toMatchObject({ kind: 'unknown', operation: 'op-1', confirming: false })
      expect(run(state, { kind: 'create', operation: 'op-2', request: DATA }).effects).toEqual([])
      const recall = run(state, { kind: 'confirm-create' })
      expect(recall.effects).toEqual([{ kind: 'recall-create', operation: 'op-1', request: DATA }])
      expect(run(recall.creating, { kind: 'confirm-create' }).effects).toEqual([])
    },
  )

  it.each([
    [
      'the original outcome',
      { outcome: 'succeeded', body: { version: 'v', holding: 'h', changed: true } },
      { kind: 'done', text: '已新建 notes。' },
    ],
    [
      'not committed',
      { outcome: 'not-committed', body: {} },
      { kind: 'refused', notice: { kind: 'unavailable', text: '上一次没有生效，可以再试一次。' } },
    ],
    ['still not known', { outcome: 'basis-unavailable' }, { kind: 'unknown', confirming: false }],
  ] as const)('a recall answered with %s', (_label, answer, creating) => {
    const recalling = run(unknown(), { kind: 'confirm-create' }).creating
    expect(
      run(recalling, {
        kind: 'confirm-create-answered',
        operation: 'op-1',
        answer: answer as never,
      }).creating,
    ).toMatchObject(creating)
  })

  it('a recall answer for another operation counts for nothing', () => {
    const recalling = run(unknown(), { kind: 'confirm-create' }).creating
    expect(
      run(recalling, {
        kind: 'confirm-create-answered',
        operation: 'op-0',
        answer: { outcome: 'not-committed', body: {} },
      }).creating,
    ).toBe(recalling)
  })

  it('done or refused: the next creation goes out', () => {
    const done = run(sending(), {
      kind: 'create-answered',
      operation: 'op-1',
      answer: { outcome: 'conflict', body: {} },
    }).creating
    expect(run(done, { kind: 'create', operation: 'op-2', request: DATA }).effects).toHaveLength(1)
  })
})
