import { describe, expect, it } from 'vitest'
import {
  askedIn,
  drivesItself,
  openedIn,
  type RoundEntry,
} from '../../../src/rows/goal-session/drive.ts'

type Drives = Parameters<typeof drivesItself>[0]
type Defaults = NonNullable<Parameters<typeof drivesItself>[1]>
const SOURCE = { owner: 'o', name: 'coding', revision: '1', digest: 'd' }
const AUTHORIZATION = { owner: 'o', record: 'r', revision: '1', digest: 'd' }
const modesOf = (collaboration: string) => ({ collaboration })
const at = (creation: object, changes: readonly object[] = []) =>
  ({
    tenant: 't',
    session: 's',
    work: { definition: { name: 'coding' }, creation: { modes: creation }, changes },
  }) as unknown as Drives
const defaultsTo =
  (collaboration: string): Defaults =>
  async input => {
    asked.push(input)
    return { ok: { modes: modesOf(collaboration), basis: AUTHORIZATION } } as never
  }
const asked: unknown[] = []
const explicit = (collaboration: string) => ({ kind: 'explicit', value: modesOf(collaboration) })
const changed = (value: string) => ({
  kind: 'collaboration-mode',
  value,
  authorization: AUTHORIZATION,
})

describe('whether a session drives itself', () => {
  it('is the last change of its collaboration mode, whatever it was created with', async () => {
    const changes = [changed('auto-drive'), { kind: 'permission-mode' }, changed('co-work')]
    expect(await drivesItself(at(explicit('auto-drive'), changes), undefined)).toEqual({
      kind: 'read',
      value: false,
    })
    const turned = [changed('co-work'), changed('auto-drive')]
    expect(await drivesItself(at(explicit('co-work'), turned), undefined)).toEqual({
      kind: 'read',
      value: true,
    })
  })

  it('without a change is what its creation named', async () => {
    for (const [mode, value] of [
      ['auto-drive', true],
      ['co-work', false],
    ] as const)
      expect(await drivesItself(at(explicit(mode)), undefined)).toEqual({ kind: 'read', value })
  })

  it('created on the default of its definition is what that default is now; a default that cannot be read is unavailable, never a no', async () => {
    const created = at({ kind: 'tenant-default', source: SOURCE })
    asked.length = 0
    expect(await drivesItself(created, defaultsTo('auto-drive'))).toEqual({
      kind: 'read',
      value: true,
    })
    expect(asked).toEqual([
      { tenant: 't', session: 's', definition: { name: 'coding' }, source: SOURCE },
    ])
    expect(await drivesItself(created, defaultsTo('co-work'))).toEqual({
      kind: 'read',
      value: false,
    })
    const away: Defaults = async () => ({ failure: { kind: 'unavailable', diagnostic: 'gone' } })
    expect(await drivesItself(created, away)).toEqual({ kind: 'unavailable' })
    expect(await drivesItself(created, undefined)).toEqual({ kind: 'unavailable' })
  })
})

describe('the input that opened the round in progress', () => {
  const text = (value: string, toModel = true) => ({
    kind: 'text',
    text: value,
    visibility: { toHuman: true, toModel },
  })
  const message = (id: string, kind: string, ...blocks: readonly object[]): RoundEntry => ({
    id,
    kind,
    payload: { message: { blocks } },
  })
  const began = (id: string): RoundEntry => ({ id, kind: 'run.started', payload: {} })

  it('is the nearest message before the latest round began: reminders sent into the round are not it', () => {
    const entries = [
      message('50', 'message.system_reminder', text('You were about to stop')),
      began('32'),
      message('30', 'message.user', text('把改动说明写进 CHANGELOG'), text('共两处')),
      began('12'),
      message('10', 'message.user', text('hello')),
    ]
    expect(openedIn(entries)).toEqual({ since: '30', text: '把改动说明写进 CHANGELOG\n共两处' })
  })

  it('may be a reminder a system part sent, and carries only the words the model reads', () => {
    const woke = [
      began('32'),
      message('30', 'message.system_reminder', text('只给人看', false), text('到点了：出周报')),
    ]
    expect(openedIn(woke)).toEqual({ since: '30', text: '到点了：出周报' })
    const picture = [began('32'), message('30', 'message.user', { kind: 'image' })]
    expect(openedIn(picture)).toEqual({ since: '30', text: '' })
  })

  it('is not known from entries that do not reach back to where the round began, or to the message before it', () => {
    expect(openedIn([])).toBe('more')
    expect(openedIn([message('50', 'message.user', text('later'))])).toBe('more')
    expect(openedIn([message('50', 'message.user', text('later')), began('32')])).toBe('more')
  })
})

describe('what the person last said in a session', () => {
  const text = (value: string, more: object = {}) => ({
    kind: 'text',
    text: value,
    visibility: { toHuman: true, toModel: true },
    ...more,
  })
  const said = (id: string, ...blocks: readonly object[]): RoundEntry => ({
    id,
    kind: 'message.user',
    payload: { message: { blocks } },
  })
  const ORIGIN = { origin: { name: 'goal:goal', layer: 'official' } }

  it('is the newest message of theirs, in their own words: what a command put after their line is not theirs', () => {
    const entries = [
      said('50', text('/goal 把首页降下来'), text('The person asks for a goal…', ORIGIN)),
      said('30', text('hello')),
    ]
    expect(askedIn(entries)).toEqual({ at: '50', text: '/goal 把首页降下来' })
    expect(askedIn([said('70', text('第一行'), text('第二行')), ...entries])).toEqual({
      at: '70',
      text: '第一行\n第二行',
    })
  })

  it('passes over a message with no words of theirs, such as a picture alone, and over what is not a message of a person', () => {
    const entries: RoundEntry[] = [
      {
        id: '90',
        kind: 'message.system_reminder',
        payload: { message: { blocks: [text('到点了')] } },
      },
      said('80', { kind: 'image' }),
      said('75', { kind: 'reference', text: 'notes.md' }),
      said('72', { ...text('没给人看的那一段'), visibility: { toHuman: false } }),
      said('70', text('  ')),
      said('60', text('只有命令带来的话', ORIGIN)),
      said('30', text('我说的')),
    ]
    expect(askedIn(entries)).toEqual({ at: '30', text: '我说的' })
  })

  it('is not known from entries that hold no words of theirs', () => {
    expect(askedIn([])).toBe('more')
    expect(askedIn([said('80', { kind: 'image' })])).toBe('more')
  })
})
