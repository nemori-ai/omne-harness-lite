import { describe, expect, it } from 'vitest'
import type {
  ItemOf,
  SayItem,
  SayOutcome,
  SayPhrase,
  ShellSlots,
  SlotConflict,
  SlotName,
} from '@omne-harness/shell-contract'
import type { NoteTo } from '../src/page/desk/scene.ts'
import { createShellNote, type Gift, type NoteDesk } from '../src/page/shell/say-note.ts'
import { SCOPE, held, phraseFeed, replies, sayItem, sayPlace } from './support/desk-stay.ts'

const S1: NoteTo = { kind: 'target', key: 's-1' }
const NEW: NoteTo = { kind: 'new' }
const ONE = { name: '窗口 09.05.07.png', bytes: new Uint8Array([1]) }
const TWO = { name: '近看 09.05.07.png', bytes: new Uint8Array([2]) }
const SEEN: Gift = {
  pictures: [ONE, TWO],
  told: { kind: 'not-seen', reason: '旧的说明' },
  send: false,
}

/** The desk side stood in for: open while `open` says so; closing it is the whereabouts' step, which tells the note. */
function deskSide(closed: () => void = () => undefined) {
  const side = { opened: false, closes: 0, accepts: 0 }
  const port: NoteDesk = {
    open: () => side.opened,
    close: () => {
      side.closes += 1
      side.opened = false
      closed()
    },
    accepted: () => void (side.accepts += 1),
  }
  return { side, port }
}

/** One shell's note over a say slot holding one item; `element` is where a floating item opens it. */
function noted(
  given: Parameters<typeof sayItem>[1] = {},
  slots?: ShellSlots,
  phrases = phraseFeed(),
) {
  const place = sayPlace()
  const one = sayItem('session-ui#1', given)
  place.put(one.item)
  let scope: string | undefined = SCOPE
  const note = createShellNote({
    slots: slots ?? place.slots,
    scope: () => scope,
    phrases: phrases.feed,
  })
  const desk = deskSide(() => note.deskClosed())
  const undesk = note.desk(desk.port)
  const element = { id: 'pet-button' } as unknown as Element
  let told = 0
  note.subscribe(() => void (told += 1))
  const view = () => note.view()
  return {
    place,
    one,
    phrases,
    note,
    desk,
    undesk,
    element,
    view,
    told: () => told,
    drawn: () => view().note,
    names: () => view().pictures.map(picture => picture.name),
    open: () => note.toggle('pet', element),
    openOnDesk: (gift?: Gift) => {
      desk.side.opened = true
      note.deskOpened(gift)
    },
    closeOnDesk: () => {
      desk.side.opened = false
      note.deskClosed()
    },
    setScope: (next: string | undefined) => {
      scope = next
      note.rescope()
    },
  }
}

/** Open in the window with half a sentence for s-1, two pictures and a word on why. */
function filled(given: Parameters<typeof sayItem>[1] = {}) {
  const t = noted(given)
  t.open()
  t.note.write('半句', S1)
  t.note.give(SEEN)
  return t
}

const flushed = () => new Promise(resolve => setTimeout(resolve, 0))

describe('说话笺的状态：开在哪', () => {
  it('窗口里开：现取候选与缺省，记着开在哪一项身边与那个元素，通知', () => {
    const t = noted({ current: () => 's-1' })
    const before = t.told()
    t.open()
    expect(t.view().window).toEqual({ id: 'pet', element: t.element })
    expect(t.drawn()).toMatchObject({ targets: [{ key: 's-1', label: '周报' }], to: S1 })
    expect(t.one.asked).toEqual([SCOPE])
    expect(t.told()).toBeGreaterThan(before)
  })

  it('说话位上没有一项或两项冲突：present 为假，toggle 开不出', () => {
    const t = noted()
    t.place.take(t.one.item)
    expect(t.note.present()).toBe(false)
    t.open()
    expect(t.view().window).toBeNull()
    t.place.put(t.one.item)
    t.place.put(sayItem('other#1').item)
    expect(t.view().present).toBe(false)
    t.open()
    expect(t.view().window).toBeNull()
  })

  it('同一项再 toggle 收起；别的项 toggle 开到那一项身边；close 只收开在自己身边的', () => {
    const t = noted()
    t.open()
    t.note.toggle('pet', t.element)
    expect(t.view().window).toBeNull()
    t.open()
    t.note.toggle('other', t.element)
    expect(t.view().window?.id).toBe('other')
    t.note.close('pet')
    expect(t.view().window?.id).toBe('other')
    t.note.close('other')
    expect(t.view().window).toBeNull()
  })

  it('窗口里开时桌面上开着：先叫停留收桌面上的，再在窗口里开', () => {
    const t = noted()
    t.openOnDesk()
    t.open()
    expect(t.desk.side.closes).toBe(1)
    expect(t.view().window?.id).toBe('pet')
    const other = noted()
    other.open()
    expect(other.desk.side.closes).toBe(0)
  })

  it('桌面上开：窗口里开着的收起', () => {
    const t = noted()
    t.open()
    t.openOnDesk()
    expect(t.view().window).toBeNull()
  })

  it('开着（窗口里或桌面上）而那一项叫了订阅：重取候选并通知；两处都收着时不重取', () => {
    let targets = [{ key: 's-1', label: '周报' }]
    const t = noted({ targets: () => targets })
    t.open()
    targets = [...targets, { key: 's-2', label: '新的' }]
    const before = t.told()
    t.one.changed()
    expect(t.drawn().targets).toEqual(targets)
    expect(t.told()).toBeGreaterThan(before)
    t.note.close()
    t.one.changed()
    expect(t.one.asked).toHaveLength(2)
    t.openOnDesk()
    t.one.changed()
    expect(t.one.asked).toHaveLength(4)
    t.closeOnDesk()
    t.one.changed()
    expect(t.one.asked).toHaveLength(4)
  })

  it('说话位上的那一项撤下：桌面上开着时叫停留收桌面上的', () => {
    const t = noted()
    t.openOnDesk()
    t.place.take(t.one.item)
    expect(t.desk.side.closes).toBe(1)
    const shut = noted()
    shut.place.take(shut.one.item)
    expect(shut.desk.side.closes).toBe(0)
  })

  it('说话位上的那一项撤下：窗口里的笺收起，present 为假', () => {
    const t = noted()
    t.open()
    t.place.take(t.one.item)
    expect(t.view()).toMatchObject({ present: false, window: null })
  })
})

describe('说话笺的状态：缺省说给谁', () => {
  const opened = (current: string | undefined, chosen: NoteTo | undefined) => {
    const t = noted({
      current: () => current,
      targets: () => [
        { key: 's-1', label: '周报' },
        { key: 's-2', label: '日报' },
      ],
    })
    t.open()
    t.note.write('', chosen)
    return t.drawn().to
  }

  it('人选过而且选的是新会话：用新会话，不看 current', () => {
    expect(opened('s-2', NEW)).toEqual(NEW)
  })

  it('人选过而且还在候选里：用人选的', () => {
    expect(opened('s-2', S1)).toEqual(S1)
  })

  it('人选的已经不在候选里：落到 current 答的键', () => {
    expect(opened('s-2', { kind: 'target', key: 's-9' })).toEqual({ kind: 'target', key: 's-2' })
  })

  it('没选过而 current 答了键：用那个键', () => {
    expect(opened('s-2', undefined)).toEqual({ kind: 'target', key: 's-2' })
  })

  it('没选过而 current 没答：新会话；人选的不在候选里也一样', () => {
    expect(opened(undefined, undefined)).toEqual(NEW)
    expect(opened(undefined, { kind: 'target', key: 's-9' })).toEqual(NEW)
  })
})

describe('每样东西什么时候离开状态：开始发', () => {
  it('结局：正在发', () => {
    const pending = held<SayOutcome>()
    const t = filled({ say: () => pending.promise })
    t.note.send('半句', S1, [])
    expect(t.drawn().fate).toEqual({ kind: 'sending' })
  })

  it('字、说给谁、图与说明不变，图照样显示', () => {
    const pending = held<SayOutcome>()
    const t = filled({ say: () => pending.promise })
    t.note.send('半句', S1, [])
    expect(t.drawn()).toMatchObject({ words: '半句', chosen: S1, edit: 0, told: SEEN.told })
    expect(t.names()).toEqual([ONE.name, TWO.name])
  })
})

describe('每样东西什么时候离开状态：受理了', () => {
  it('字与人选的说给谁清掉，edit 加一', async () => {
    const t = filled()
    t.note.send('半句', S1, [])
    await flushed()
    expect(t.drawn().words).toBe('')
    expect(t.drawn().chosen).toBeUndefined()
    expect(t.drawn().edit).toBe(1)
  })

  it('图：发出时已在笺里的拿走，在发时才到的留着', async () => {
    const pending = held<SayOutcome>()
    const t = filled({ say: () => pending.promise })
    t.note.send('半句', S1, [])
    t.note.give({ pictures: [ONE], send: false })
    pending.settle({ kind: 'sent', key: 's-1' })
    await flushed()
    expect(t.names()).toEqual([ONE.name])
    const all = filled()
    all.note.send('半句', S1, [])
    await flushed()
    expect(all.names()).toEqual([])
  })

  it('结局：受理了；说明不变', async () => {
    const t = filled()
    t.note.send('半句', S1, [])
    await flushed()
    expect(t.drawn().fate).toEqual({ kind: 'accepted' })
    expect(t.drawn().told).toEqual(SEEN.told)
  })
})

describe('每样东西什么时候离开状态：确定没发出', () => {
  it('结局：没发出与原因', async () => {
    const t = filled({ say: () => Promise.resolve({ kind: 'failed', reason: '不行' }) })
    t.note.send('半句', S1, [])
    await flushed()
    expect(t.drawn().fate).toEqual({ kind: 'failed', reason: '不行' })
  })

  it('字、说给谁、edit、图与说明不变', async () => {
    const t = filled({ say: () => Promise.resolve({ kind: 'failed', reason: '不行' }) })
    t.note.send('半句', S1, [])
    await flushed()
    expect(t.drawn()).toMatchObject({ words: '半句', chosen: S1, edit: 0, told: SEEN.told })
    expect(t.names()).toEqual([ONE.name, TWO.name])
  })
})

describe('每样东西什么时候离开状态：不知道', () => {
  it('图：发出时已在笺里的拿走', async () => {
    const t = filled({ say: () => Promise.resolve({ kind: 'unknown' }) })
    t.note.send('半句', S1, [])
    await flushed()
    expect(t.names()).toEqual([])
  })

  it('结局：不知道；say 抛出也是不知道', async () => {
    const t = filled({ say: () => Promise.resolve({ kind: 'unknown' }) })
    t.note.send('半句', S1, [])
    await flushed()
    expect(t.drawn().fate).toEqual({ kind: 'unknown' })
    const thrown = filled({
      say: () => {
        throw new Error('module gone')
      },
    })
    thrown.note.send('半句', S1, [])
    await flushed()
    expect(thrown.drawn().fate).toEqual({ kind: 'unknown' })
  })

  it('字、说给谁、edit 与说明不变', async () => {
    const t = filled({ say: () => Promise.resolve({ kind: 'unknown' }) })
    t.note.send('半句', S1, [])
    await flushed()
    expect(t.drawn()).toMatchObject({ words: '半句', chosen: S1, edit: 0, told: SEEN.told })
  })
})

describe('每样东西什么时候离开状态：人改了字', () => {
  it('字与人选的说给谁换成改后的，edit 不变', () => {
    const t = filled()
    t.note.write('改过的', NEW)
    expect(t.drawn()).toMatchObject({ words: '改过的', chosen: NEW, edit: 0 })
  })

  it('结局：没发出与不知道清掉', async () => {
    for (const outcome of [{ kind: 'failed', reason: '不行' }, { kind: 'unknown' }] as const) {
      const t = filled({ say: () => Promise.resolve(outcome) })
      t.note.send('半句', S1, [])
      await flushed()
      t.note.write('再试', S1)
      expect(t.drawn().fate).toBeNull()
    }
  })

  it('结局：受理了留着', async () => {
    const t = filled()
    t.note.send('半句', S1, [])
    await flushed()
    t.note.write('下一句', S1)
    expect(t.drawn().fate).toEqual({ kind: 'accepted' })
  })

  it('图与说明不变', () => {
    const t = filled()
    t.note.write('改过的', S1)
    expect(t.names()).toEqual([ONE.name, TWO.name])
    expect(t.drawn().told).toEqual(SEEN.told)
  })
})

describe('每样东西什么时候离开状态：读窗口的答复到了', () => {
  it('图换成这一次的，可以是空', () => {
    const t = filled()
    t.note.give({ pictures: [TWO], send: false })
    expect(t.names()).toEqual([TWO.name])
    t.note.give({ pictures: [], told: { kind: 'not-authorized' }, send: false })
    expect(t.names()).toEqual([])
  })

  it('说明换成这一次的，可以没有', () => {
    const t = filled()
    t.note.give({ pictures: [], told: { kind: 'not-authorized' }, send: false })
    expect(t.drawn().told).toEqual({ kind: 'not-authorized' })
    t.note.give({ pictures: [TWO], send: false })
    expect(t.drawn().told).toEqual({ kind: 'cannot-send-pictures' })
    const knows = filled({ pictures: () => true })
    knows.note.give({ pictures: [TWO], send: false })
    expect(knows.drawn().told).toBeUndefined()
  })

  it('字、说给谁与结局不变', async () => {
    const t = filled({ say: () => Promise.resolve({ kind: 'failed', reason: '不行' }) })
    t.note.send('半句', S1, [])
    await flushed()
    t.note.give({ pictures: [TWO], send: false })
    expect(t.drawn()).toMatchObject({ words: '半句', chosen: S1, fate: { kind: 'failed' } })
  })
})

describe('每样东西什么时候离开状态：人去掉一张图', () => {
  it('图少那一张', () => {
    const t = filled()
    t.note.unpicture(t.view().pictures[0]!.id)
    expect(t.names()).toEqual([TWO.name])
  })

  it('字、说给谁、说明与结局不变', () => {
    const t = filled()
    t.note.unpicture(t.view().pictures[0]!.id)
    expect(t.drawn()).toMatchObject({ words: '半句', chosen: S1, told: SEEN.told, fate: null })
  })
})

describe('每样东西什么时候离开状态：收起', () => {
  it('窗口里收起、桌面上收起：字、说给谁、图、说明与结局都不变', async () => {
    const t = filled({ say: () => Promise.resolve({ kind: 'failed', reason: '不行' }) })
    t.note.send('半句', S1, [])
    await flushed()
    const before = { note: t.drawn(), names: t.names() }
    t.note.close()
    t.openOnDesk()
    t.closeOnDesk()
    t.open()
    expect({ note: t.drawn(), names: t.names() }).toEqual(before)
  })
})

describe('每样东西什么时候离开状态：说话位的那一项撤下', () => {
  it('字、说给谁、图、说明与结局都不变', async () => {
    const t = filled({ say: () => Promise.resolve({ kind: 'failed', reason: '不行' }) })
    t.note.send('半句', S1, [])
    await flushed()
    t.place.take(t.one.item)
    expect(t.drawn()).toMatchObject({
      words: '半句',
      chosen: S1,
      told: SEEN.told,
      fate: { kind: 'failed', reason: '不行' },
    })
    expect(t.names()).toEqual([ONE.name, TWO.name])
  })
})

describe('每样东西什么时候离开状态：租户换了、退出登录', () => {
  it('租户换了：整份丢掉，edit 加一，窗口里开着的收起', async () => {
    const t = filled({ say: () => Promise.resolve({ kind: 'failed', reason: '不行' }) })
    t.note.send('半句', S1, [])
    await flushed()
    t.setScope('tenant-b')
    expect(t.view().window).toBeNull()
    expect(t.names()).toEqual([])
    expect(t.drawn()).toEqual({ targets: null, to: NEW, fate: null, words: '', edit: 1 })
  })

  it('退出登录（租户变成没有）：同样丢掉，edit 加一', () => {
    const t = filled()
    t.setScope(undefined)
    expect(t.drawn()).toMatchObject({ words: '', edit: 1 })
    expect(t.drawn().chosen).toBeUndefined()
    expect(t.names()).toEqual([])
  })

  it('租户没变时 rescope 什么都不做', () => {
    const t = filled()
    t.note.rescope()
    expect(t.drawn()).toMatchObject({ words: '半句', edit: 0 })
  })

  it('在途的一句在租户换了之后落定：不写进新租户的那一份', async () => {
    const pending = held<SayOutcome>()
    const t = filled({ say: () => pending.promise })
    t.note.send('半句', S1, [])
    t.setScope('tenant-b')
    t.open()
    t.note.write('新租户的话', undefined)
    pending.settle({ kind: 'sent', key: 's-1' })
    await flushed()
    expect(t.drawn()).toMatchObject({ words: '新租户的话', fate: null, edit: 1 })
  })

  it('say 用发的那一刻状态所属的租户', () => {
    const t = noted()
    t.setScope('tenant-b')
    t.open()
    t.note.send('在吗', NEW, [])
    expect(t.one.said).toEqual([['tenant-b', NEW, '在吗']])
  })
})

describe('说话笺的状态：发送', () => {
  it('正在发时再来的发送不理；一次发送只调一次 say', async () => {
    const pending = held<SayOutcome>()
    const t = filled({ say: () => pending.promise })
    t.note.send('一', S1, [])
    t.note.send('二', S1, [])
    expect(t.one.said).toHaveLength(1)
    pending.settle({ kind: 'failed', reason: '不行' })
    await flushed()
    expect(t.one.said).toHaveLength(1)
    t.note.send('二', S1, [])
    expect(t.one.said).toHaveLength(2)
  })

  it('发送先把没发出的字换成带来的整段，再调 say', () => {
    const pending = held<SayOutcome>()
    const t = filled({ say: () => pending.promise })
    t.note.send('整段的话', S1, [])
    expect(t.drawn().words).toBe('整段的话')
    expect(t.one.said).toEqual([[SCOPE, S1, '整段的话']])
  })

  it('读窗口加按 ⇧：读到图就说给缺省的那一个，受理了交给桌面那一边', async () => {
    const t = noted({ pictures: () => true, current: () => 's-1' })
    t.openOnDesk({ pictures: [ONE], send: true })
    expect(t.one.said).toEqual([[SCOPE, S1, '', [ONE]]])
    await flushed()
    expect(t.desk.side.accepts).toBe(1)
  })

  it('去对话页：show 问状态所属的租户与最后受理的那一句；没有受理的答假', async () => {
    const t = noted({ say: () => Promise.resolve({ kind: 'sent', key: 's-9' }) })
    t.open()
    expect(t.note.show()).toBe(false)
    t.note.send('在吗', NEW, [])
    await flushed()
    expect(t.note.show()).toBe(true)
    expect(t.one.shown).toEqual([[SCOPE, 's-9']])
  })
})

describe('说话笺的状态：桌面层交回的字', () => {
  it('edit 相同的 unsent 收下，笺收着也收', () => {
    const t = noted()
    t.note.unsent('桌面上写的', S1, 0)
    expect(t.drawn()).toMatchObject({ words: '桌面上写的', chosen: S1, edit: 0 })
  })

  it('edit 不同的 unsent 丢掉：受理清掉之后迟到的一份不把字带回来', async () => {
    const t = filled()
    t.note.send('半句', S1, [])
    await flushed()
    t.note.unsent('半句', S1, 0)
    expect(t.drawn()).toMatchObject({ words: '', edit: 1 })
    t.note.unsent('下一句', undefined, 1)
    expect(t.drawn().words).toBe('下一句')
  })

  it('没选过说给谁的一份不带它：人选的清掉', () => {
    const t = filled()
    t.note.unsent('半句', undefined, 0)
    expect(t.drawn().chosen).toBeUndefined()
  })
})

describe('说话笺的状态：放下', () => {
  it('dispose 之后不再听说话位与那一项', () => {
    const t = noted()
    t.open()
    const asked = t.one.asked.length
    t.note.dispose()
    t.one.changed()
    t.place.take(t.one.item)
    expect(t.one.asked).toHaveLength(asked)
    expect(t.one.listening()).toBe(0)
  })
})

describe('说话笺的状态：加按 ⇧ 的直接发送', () => {
  const outcomes: readonly SayOutcome[] = [
    { kind: 'sent', key: 's-1' },
    { kind: 'failed', reason: '不行' },
    { kind: 'unknown' },
  ]
  for (const outcome of outcomes)
    it(`结局是 ${outcome.kind}：没发出的字、人选的说给谁与 edit 都不动`, async () => {
      const t = noted({ pictures: () => true, say: () => Promise.resolve(outcome) })
      t.open()
      t.note.write('半句', S1)
      t.note.close()
      t.openOnDesk({ pictures: [ONE], send: true })
      expect(t.one.said).toEqual([[SCOPE, S1, '', [ONE]]])
      expect(t.drawn()).toMatchObject({
        words: '半句',
        chosen: S1,
        edit: 0,
        fate: { kind: 'sending' },
      })
      await flushed()
      expect(t.drawn()).toMatchObject({ words: '半句', chosen: S1, edit: 0 })
    })

  it('gift 要直接发送而没有图：不调 say', () => {
    const t = noted({ pictures: () => true })
    t.openOnDesk({ pictures: [], told: { kind: 'not-authorized' }, send: true })
    expect(t.one.said).toEqual([])
  })
})

/** A say slot whose one item is swapped for another in one change, or put in conflict while still listed. */
function swappable(first: SayItem) {
  let items: readonly SayItem[] = [first]
  let conflicts: SlotConflict[] = []
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const listener of listeners) listener()
  }
  const slots: ShellSlots = {
    items: <K extends SlotName>(slot: K) =>
      (slot === 'say' ? items : []) as unknown as readonly ItemOf<K>[],
    conflicts: slot => (slot === 'say' ? conflicts : []),
    subscribe: (_slot, listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    slots,
    swap: (next: SayItem) => {
      items = [next]
      changed()
    },
    conflict: () => {
      conflicts = [{ slot: 'say', anchor: undefined, id: '', by: ['a', 'b'] }]
      changed()
    },
  }
}

describe('说话笺的状态：跟着那一项的订阅', () => {
  it('窗口里收起之后退订：那一项再叫订阅，不重读也不通知', () => {
    const t = noted()
    t.open()
    expect(t.one.listening()).toBe(1)
    t.note.close()
    expect(t.one.listening()).toBe(0)
    const asked = t.one.asked.length
    const told = t.told()
    t.one.changed()
    expect(t.one.asked).toHaveLength(asked)
    expect(t.told()).toBe(told)
  })

  it('桌面上收起之后退订', () => {
    const t = noted()
    t.openOnDesk()
    expect(t.one.listening()).toBe(1)
    t.closeOnDesk()
    expect(t.one.listening()).toBe(0)
  })

  it('换到别处开时旧的订阅先退掉：同一刻只有一份', () => {
    const t = noted()
    t.open()
    t.note.toggle('other', t.element)
    expect(t.one.listening()).toBe(1)
    t.openOnDesk()
    expect(t.one.listening()).toBe(1)
    t.open()
    expect(t.desk.side.closes).toBe(1)
    expect(t.one.listening()).toBe(1)
  })

  it('那一项撤下、换了租户、桌面那一边撤回登记：都退订', () => {
    const gone = noted()
    gone.open()
    gone.place.take(gone.one.item)
    expect(gone.one.listening()).toBe(0)
    const moved = noted()
    moved.open()
    moved.setScope('tenant-b')
    expect(moved.one.listening()).toBe(0)
    const left = noted()
    left.openOnDesk()
    left.undesk()
    expect(left.one.listening()).toBe(0)
  })

  it('位置换了一项而笺开着：窗口里的笺留着，候选取自新的那一项，订阅换到它', () => {
    const one = sayItem('session-ui#1')
    const place = swappable(one.item)
    const t = noted({}, place.slots)
    t.open()
    const two = sayItem('session-ui#2', { targets: () => [{ key: 's-2', label: '日报' }] })
    place.swap(two.item)
    expect(t.view().window?.id).toBe('pet')
    expect(t.drawn().targets).toEqual([{ key: 's-2', label: '日报' }])
    expect([one.listening(), two.listening()]).toEqual([0, 1])
  })

  it('窗口里开着时桌面那一边撤回登记：订阅留着', () => {
    const t = noted()
    t.open()
    t.undesk()
    expect(t.one.listening()).toBe(1)
  })

  it('两处都收着时位置换了一项：不读也不订阅新的那一项', () => {
    const one = sayItem('session-ui#1')
    const place = swappable(one.item)
    noted({}, place.slots)
    const two = sayItem('session-ui#2')
    place.swap(two.item)
    expect(two.asked).toEqual([])
    expect(two.listening()).toBe(0)
  })

  it('位置上有冲突、那一项还列着：present 为假，开不出', () => {
    const one = sayItem('session-ui#1')
    const place = swappable(one.item)
    const t = noted({}, place.slots)
    place.conflict()
    expect(t.note.present()).toBe(false)
    t.open()
    expect(t.view().window).toBeNull()
  })

  it('桌面上开着时换租户：照新租户重读候选', () => {
    const t = noted()
    t.openOnDesk()
    t.setScope('tenant-b')
    expect(t.one.asked.at(-1)).toBe('tenant-b')
    expect(t.drawn().targets).toEqual([{ key: 's-1', label: '周报' }])
  })
})

describe('说话笺的状态：通知', () => {
  it('退订之后不再通知', () => {
    const t = noted()
    let heard = 0
    const stop = t.note.subscribe(() => void (heard += 1))
    t.open()
    stop()
    t.note.close()
    expect(heard).toBe(1)
  })

  it('dispose 之后不再听位置：位置换了一项也不读、不订阅新的那一项', () => {
    const one = sayItem('session-ui#1')
    const place = swappable(one.item)
    const t = noted({}, place.slots)
    t.open()
    t.note.dispose()
    const two = sayItem('session-ui#2')
    place.swap(two.item)
    expect(two.asked).toEqual([])
    expect(two.listening()).toBe(0)
  })

  it('dispose 之后不再通知', () => {
    const t = noted()
    t.note.dispose()
    const told = t.told()
    t.note.write('迟到的一笔', undefined)
    expect(t.told()).toBe(told)
  })

  it('桌面上开：通知，视图里窗口那一处是没有', () => {
    const t = noted()
    t.open()
    const told = t.told()
    t.openOnDesk()
    expect(t.told()).toBeGreaterThan(told)
    expect(t.view().window).toBeNull()
  })

  it('去掉不认识的图不通知；两张去掉一张，剩下的是另一张', () => {
    const t = filled()
    const [first, second] = t.view().pictures
    const told = t.told()
    t.note.unpicture('nobody')
    expect(t.told()).toBe(told)
    t.note.unpicture(second!.id)
    expect(t.view().pictures.map(picture => picture.id)).toEqual([first!.id])
  })
})

describe('说话笺的状态：发送的边', () => {
  it('say 交回的 promise 被拒绝：结局是不知道', async () => {
    const t = filled({ say: () => Promise.reject(new Error('closed')) })
    t.note.send('半句', S1, [])
    await flushed()
    expect(t.drawn().fate).toEqual({ kind: 'unknown' })
  })

  it('只交发送时留着的那几张图', () => {
    const t = filled({ pictures: () => true })
    const [first] = t.view().pictures
    t.note.send('半句', S1, [first!.id])
    expect(t.one.said).toEqual([[SCOPE, S1, '半句', [ONE]]])
  })
})

const SAID: SayOutcome = { kind: 'sent', key: 's-1', said: 'm-1' }

/** Open in the window over an item that says back: each accepted line answers with its own `said`. */
function replying(given: Parameters<typeof sayItem>[1] = {}) {
  const heard = replies()
  let count = 0
  const t = noted({
    reply: heard.reply,
    say: () => Promise.resolve({ kind: 'sent', key: 's-1', said: `m-${(count += 1)}` }),
    ...given,
  })
  t.open()
  const accepted = async (words = '在吗') => {
    t.note.send(words, S1, [])
    await flushed()
  }
  return { ...t, heard, accepted, reply: () => t.drawn().reply }
}

describe('回的话：表里「回的话」一列', () => {
  it('受理了：调 reply 一次，带状态所属的租户与 said；第一次给之前是还在说、文字是空的', async () => {
    const t = replying()
    await t.accepted()
    expect(t.heard.calls.map(({ scope, said }) => [scope, said])).toEqual([[SCOPE, 'm-1']])
    expect(t.reply()).toEqual({ text: '', state: 'coming' })
  })

  it('每次给的整段文字与状态记进状态，并通知', async () => {
    const t = replying()
    await t.accepted()
    const told = t.told()
    t.heard.calls[0]!.give({ text: '我看', state: 'coming' })
    expect(t.reply()).toEqual({ text: '我看', state: 'coming' })
    t.heard.calls[0]!.give({ text: '我看过了。', state: 'ended' })
    expect(t.reply()).toEqual({ text: '我看过了。', state: 'ended' })
    expect(t.told()).toBe(told + 2)
  })

  it('开始发：丢掉上一句的回的话', async () => {
    const outcomes = [Promise.resolve(SAID), held<SayOutcome>().promise]
    const t = replying({ say: () => outcomes.shift()! })
    await t.accepted()
    t.heard.calls[0]!.give({ text: '上一句的回话', state: 'ended' })
    t.note.send('下一句', S1, [])
    expect(t.reply()).toBeUndefined()
  })

  it('确定没发出与不知道：没有回的话', async () => {
    for (const outcome of [{ kind: 'failed', reason: '不行' }, { kind: 'unknown' }] as const) {
      const t = replying({ say: () => Promise.resolve(outcome) })
      await t.accepted()
      expect(t.reply()).toBeUndefined()
      expect(t.heard.calls).toEqual([])
    }
  })

  it('人改了字、读窗口的答复到了、人去掉一张图、收起：回的话不变，还在跟', async () => {
    const t = replying()
    await t.accepted()
    t.heard.calls[0]!.give({ text: '一半', state: 'coming' })
    t.note.write('又写了', S1)
    t.note.give(SEEN)
    t.note.unpicture(t.view().pictures[0]!.id)
    t.note.close()
    t.openOnDesk()
    t.closeOnDesk()
    expect(t.reply()).toEqual({ text: '一半', state: 'coming' })
    t.heard.calls[0]!.give({ text: '一半又一半', state: 'coming' })
    expect(t.reply()).toEqual({ text: '一半又一半', state: 'coming' })
    expect(t.heard.calls[0]!.stops).toBe(0)
  })

  it('说话位的那一项撤下：停止跟，已有的字留着，状态记不知道；之后它再给的不算', async () => {
    const t = replying()
    await t.accepted()
    t.heard.calls[0]!.give({ text: '一半', state: 'coming' })
    t.place.take(t.one.item)
    expect(t.heard.calls[0]!.stops).toBe(1)
    expect(t.reply()).toEqual({ text: '一半', state: 'unknown' })
    t.heard.calls[0]!.give({ text: '一半又一半', state: 'coming' })
    expect(t.reply()).toEqual({ text: '一半', state: 'unknown' })
  })

  it('租户换了：停止跟，回的话随整份丢掉', async () => {
    const t = replying()
    await t.accepted()
    t.setScope('tenant-b')
    expect(t.heard.calls[0]!.stops).toBe(1)
    expect(t.reply()).toBeUndefined()
    t.heard.calls[0]!.give({ text: '迟到的', state: 'coming' })
    expect(t.reply()).toBeUndefined()
  })
})

describe('回的话：只跟着最后受理的那一句', () => {
  it('第二句受理：第一句的停止的函数被调，第一句迟到的一次叫不进状态', async () => {
    const t = replying()
    await t.accepted('第一句')
    await t.accepted('第二句')
    expect(t.heard.calls.map(call => [call.said, call.stops])).toEqual([
      ['m-1', 1],
      ['m-2', 0],
    ])
    t.heard.calls[0]!.give({ text: '第一句的回话', state: 'coming' })
    expect(t.reply()).toEqual({ text: '', state: 'coming' })
    t.heard.calls[1]!.give({ text: '第二句的回话', state: 'coming' })
    expect(t.reply()).toEqual({ text: '第二句的回话', state: 'coming' })
  })

  it('说完了或不知道之后：调停止的函数，之后再给的不算', async () => {
    for (const state of ['ended', 'unknown'] as const) {
      const t = replying()
      await t.accepted()
      t.heard.calls[0]!.give({ text: '完', state })
      expect(t.heard.calls[0]!.stops).toBe(1)
      t.heard.calls[0]!.give({ text: '完了又说', state: 'coming' })
      expect(t.reply()).toEqual({ text: '完', state })
    }
  })

  it('那一轮已经收场：reply 返回之前同步给一次说完了，写进状态；拿到的停止的函数随后调一次', async () => {
    let stops = 0
    const t = replying({
      reply: (_scope, _said, give) => {
        give({ text: '早就说完了', state: 'ended' })
        return () => void (stops += 1)
      },
    })
    await t.accepted()
    expect(t.reply()).toEqual({ text: '早就说完了', state: 'ended' })
    expect(stops).toBe(1)
  })

  it('加按 ⇧ 的直接发送受理了也开始跟', async () => {
    const heard = replies()
    const t = noted({ pictures: () => true, reply: heard.reply, say: () => Promise.resolve(SAID) })
    t.openOnDesk({ pictures: [ONE], send: true })
    await flushed()
    expect(heard.calls.map(call => call.said)).toEqual(['m-1'])
    expect(t.drawn().reply).toEqual({ text: '', state: 'coming' })
  })
})

describe('回的话：只写受理了的三种时候', () => {
  it('结局里没有 said：不调 reply，状态里没有回的话', async () => {
    const t = replying({ say: () => Promise.resolve({ kind: 'sent', key: 's-1' }) })
    await t.accepted()
    expect(t.heard.calls).toEqual([])
    expect(t.drawn()).toMatchObject({ fate: { kind: 'accepted' } })
    expect(t.reply()).toBeUndefined()
  })

  it('那一项没有 reply：状态里没有回的话', async () => {
    const t = noted({ say: () => Promise.resolve(SAID) })
    t.open()
    t.note.send('在吗', S1, [])
    await flushed()
    expect(t.drawn()).toMatchObject({ fate: { kind: 'accepted' } })
    expect(t.drawn().reply).toBeUndefined()
  })

  it('reply 抛出：状态里没有回的话', async () => {
    const t = replying({
      reply: () => {
        throw new Error('no turn')
      },
    })
    await t.accepted()
    expect(t.drawn()).toMatchObject({ fate: { kind: 'accepted' } })
    expect(t.reply()).toBeUndefined()
  })
})

describe('回的话：只留前 4000 个字符', () => {
  it('4001 个字符：留前 4000 个，记后面还有', async () => {
    const t = replying()
    await t.accepted()
    t.heard.calls[0]!.give({ text: `${'字'.repeat(4000)}尾`, state: 'coming' })
    expect(t.reply()).toEqual({ text: '字'.repeat(4000), state: 'coming', more: true })
  })

  it('恰好 4000 个：全留着，没有后面还有', async () => {
    const t = replying()
    await t.accepted()
    t.heard.calls[0]!.give({ text: '字'.repeat(4000), state: 'ended' })
    expect(t.reply()).toEqual({ text: '字'.repeat(4000), state: 'ended' })
  })
})

const FOUR: readonly SayPhrase[] = [
  { key: 'shell.expand', label: '展开讲讲', words: '展开讲讲' },
  { key: 'notes.translate', label: '翻成英文', words: '把图里的字翻成英文' },
]

/** Open in the window with a picture, over an item that knows pictures, and the shell's phrases at hand. */
function phrased(given: Parameters<typeof sayItem>[1] = {}, first = FOUR) {
  const feed = phraseFeed(first)
  const t = noted({ pictures: () => true, ...given }, undefined, feed)
  t.open()
  t.note.give({ pictures: [ONE, TWO], send: false })
  return t
}

describe('现成的话：在状态里', () => {
  it('开的时候读外壳的 phrases()；一幕里每句只有键与按钮上的字', () => {
    const t = phrased()
    expect(t.drawn().phrases).toEqual([
      { key: 'shell.expand', label: '展开讲讲' },
      { key: 'notes.translate', label: '翻成英文' },
    ])
  })

  it('开着时 phrases() 变了：重读并通知；收着时变了不读', () => {
    const t = phrased()
    const told = t.told()
    t.phrases.set([FOUR[1]!])
    expect(t.drawn().phrases).toEqual([{ key: 'notes.translate', label: '翻成英文' }])
    expect(t.told()).toBeGreaterThan(told)
    t.note.close()
    const asked = t.phrases.asked()
    t.phrases.set(FOUR)
    expect(t.phrases.asked()).toBe(asked)
  })

  it('笺里没有图，或说话位此刻不认识图：一幕里不带现成的话', () => {
    const bare = noted({ pictures: () => true })
    bare.open()
    expect(bare.drawn().phrases).toBeUndefined()
    const blind = phrased({ pictures: () => false })
    expect(blind.drawn().phrases).toBeUndefined()
  })

  it('dispose 之后不再听 phrases()', () => {
    const t = phrased()
    t.note.dispose()
    expect(t.phrases.watching()).toBe(0)
  })
})

describe('现成的话：按一句', () => {
  it('调一次 say：话是那一句的 words，图是此刻的全部，说给谁是此刻选的', () => {
    const t = phrased({ current: () => 's-1' })
    t.note.phrase('notes.translate')
    expect(t.one.said).toEqual([[SCOPE, S1, '把图里的字翻成英文', [ONE, TWO]]])
  })

  it('人写了字：字另起一行接在后面；没发出的字不换成拼好的那一段', () => {
    const pending = held<SayOutcome>()
    const t = phrased({ say: () => pending.promise })
    t.note.write('第二段', NEW)
    t.note.phrase('notes.translate')
    expect(t.one.said).toEqual([[SCOPE, NEW, '把图里的字翻成英文\n第二段', [ONE, TWO]]])
    expect(t.drawn()).toMatchObject({ words: '第二段', fate: { kind: 'sending' } })
  })

  it('受理了：清字，edit 加一，图拿走', async () => {
    const t = phrased()
    t.note.write('第二段', NEW)
    t.note.phrase('shell.expand')
    await flushed()
    expect(t.drawn()).toMatchObject({ words: '', edit: 1, fate: { kind: 'accepted' } })
    expect(t.names()).toEqual([])
  })

  it('没发出：人的字不变，edit 不变，图留着', async () => {
    const t = phrased({ say: () => Promise.resolve({ kind: 'failed', reason: '不行' }) })
    t.note.write('第二段', NEW)
    t.note.phrase('shell.expand')
    await flushed()
    expect(t.drawn()).toMatchObject({ words: '第二段', edit: 0, fate: { kind: 'failed' } })
    expect(t.names()).toEqual([ONE.name, TWO.name])
  })

  it('正在发时不理：再按一句或按发送都不再调 say', () => {
    const pending = held<SayOutcome>()
    const t = phrased({ say: () => pending.promise })
    t.note.phrase('shell.expand')
    t.note.phrase('notes.translate')
    t.note.send('再发', S1, [])
    expect(t.one.said).toHaveLength(1)
  })

  it('键不在此刻的几句里：不发；笺里没了图时也不发', () => {
    const t = phrased()
    t.note.phrase('shell.todo')
    expect(t.one.said).toEqual([])
    t.note.give({ pictures: [], send: false })
    t.note.phrase('shell.expand')
    expect(t.one.said).toEqual([])
  })

  it('受理了也开始跟回的话', async () => {
    const heard = replies()
    const t = phrased({ reply: heard.reply, say: () => Promise.resolve(SAID) })
    t.note.phrase('shell.expand')
    await flushed()
    expect(heard.calls.map(call => call.said)).toEqual(['m-1'])
  })
})

describe('回的话与现成的话：边上的几格', () => {
  it('发出去到受理之间那一项换成了另一项：不跟回的话，新旧两项的 reply 都不调', async () => {
    const pending = held<SayOutcome>()
    const first = replies()
    const one = sayItem('session-ui#1', { reply: first.reply, say: () => pending.promise })
    const place = swappable(one.item)
    const t = noted({}, place.slots)
    t.open()
    t.note.send('在吗', S1, [])
    const second = replies()
    place.swap(sayItem('session-ui#2', { reply: second.reply }).item)
    pending.settle(SAID)
    await flushed()
    expect([first.calls, second.calls]).toEqual([[], []])
    expect(t.drawn().fate).toEqual({ kind: 'accepted' })
    expect('reply' in t.drawn()).toBe(false)
  })

  it('没有回的话时一幕的笺里没有 reply 这个键；没有现成的话时也没有 phrases 这个键', () => {
    const t = noted()
    t.open()
    expect(Object.keys(t.drawn())).not.toContain('reply')
    expect(Object.keys(t.drawn())).not.toContain('phrases')
  })

  it('那一项撤下而此刻没在跟（上一句已经说完了）：回的话不变', async () => {
    const t = replying()
    await t.accepted()
    t.heard.calls[0]!.give({ text: '说完了', state: 'ended' })
    t.place.take(t.one.item)
    expect(t.reply()).toEqual({ text: '说完了', state: 'ended' })
  })

  it('位置叫了订阅而在跟的那一项还在：不停，回的话不变', async () => {
    const heard = replies()
    const one = sayItem('session-ui#1', { reply: heard.reply, say: () => Promise.resolve(SAID) })
    const place = swappable(one.item)
    const t = noted({}, place.slots)
    t.open()
    t.note.send('在吗', S1, [])
    await flushed()
    place.swap(one.item)
    expect(heard.calls[0]!.stops).toBe(0)
    expect(t.drawn().reply).toEqual({ text: '', state: 'coming' })
  })

  it('在跟而还没收到过一次回的话时那一项撤下：空文字加不知道', async () => {
    const t = replying()
    await t.accepted()
    t.place.take(t.one.item)
    expect(t.reply()).toEqual({ text: '', state: 'unknown' })
  })

  it('外壳实例没了：在跟的那一句的停止的函数被调', async () => {
    const t = replying()
    await t.accepted()
    t.note.dispose()
    expect(t.heard.calls[0]!.stops).toBe(1)
  })

  it('人只打了空白：发出去的就是那一句现成的话，后面不接空白', () => {
    const t = phrased()
    t.note.write('  \n ', NEW)
    t.note.phrase('shell.expand')
    expect(t.one.said).toEqual([[SCOPE, NEW, '展开讲讲', [ONE, TWO]]])
  })

  it('现成的话叫了订阅而答的还是同一份：不通知', () => {
    const t = phrased()
    const told = t.told()
    t.phrases.set(FOUR)
    expect(t.told()).toBe(told)
  })
})
