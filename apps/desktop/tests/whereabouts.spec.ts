import { describe, expect, it } from 'vitest'
import {
  pageDraws,
  sceneWhere,
  step,
  type Effect,
  type Facts,
  type WhereEvent,
  type Whereabouts,
} from '../src/page/shell/desk/whereabouts.ts'

const SCREEN = { x: 0, y: 0, width: 1440, height: 900 }
const CONTENT = { x: 100, y: 100, width: 800, height: 600 }
const SEAT = { x: 140, y: 640 }
const OUT = { x: 1200, y: 300 }
const IN = { x: 500, y: 400 }
const SPOT = { x: 1300, y: 200 }
const SIZE = 56

const FACTS: Facts = {
  leave: true,
  leased: true,
  seat: SEAT,
  content: CONTENT,
  visible: true,
  screen: SCREEN,
  size: SIZE,
  talker: false,
}

const STATES = {
  seat: { at: 'seat' },
  handPage: { at: 'hand', drawn: 'page', on: 'page' },
  handDeskOnPage: { at: 'hand', drawn: 'desk', on: 'page' },
  handDeskOnDesk: { at: 'hand', drawn: 'desk', on: 'desk' },
  desk: { at: 'desk', spot: SPOT, note: false, waiting: false },
  deskNote: { at: 'desk', spot: SPOT, note: true, waiting: false },
  deskWaiting: { at: 'desk', spot: SPOT, note: false, waiting: true },
  home: { at: 'home', to: SEAT },
  landingFromHand: { at: 'landing', from: 'hand', drop: OUT },
  landingFromHome: { at: 'landing', from: 'home' },
} satisfies Record<string, Whereabouts>
type State = keyof typeof STATES

const EVENTS = {
  liftOnPage: { kind: 'lift', on: 'page' },
  liftOnDesk: { kind: 'lift', on: 'desk' },
  dropOnPage: { kind: 'drop', on: 'page', at: OUT },
  dropOnDesk: { kind: 'drop', on: 'desk', at: OUT },
  escapeOnPage: { kind: 'escape', on: 'page', at: OUT },
  escapeOnDesk: { kind: 'escape', on: 'desk', at: OUT },
  painted: { kind: 'painted' },
  arrived: { kind: 'arrived' },
  cleared: { kind: 'cleared' },
  ended: { kind: 'ended' },
  click: { kind: 'click' },
  double: { kind: 'double' },
  recall: { kind: 'recall' },
  signedOut: { kind: 'signedOut', at: OUT },
  seat: { kind: 'seat' },
  seen: { kind: 'seen' },
} satisfies Record<string, WhereEvent>
type EventName = keyof typeof EVENTS

const hold = (on: boolean, keys = false): Effect => ({ kind: 'mode', hold: on, keys })
const RELEASE: Effect = { kind: 'release' }
const OPEN: Effect = { kind: 'open' }
const STROKE: Effect = { kind: 'stroke' }
const deskAt = (spot: { x: number; y: number }, waiting = false): Whereabouts => ({
  at: 'desk',
  spot,
  note: false,
  waiting,
})
const HOME: Whereabouts = { at: 'home', to: SEAT }
const SEATED: Whereabouts = { at: 'seat' }
const LANDING: Whereabouts = { at: 'landing', from: 'hand', drop: OUT }

type Cell = readonly [Whereabouts, readonly Effect[]]

/** Every cell of the table in apps/desktop/SPEC.md#桌面层 that is not blank, with the default facts. */
const TABLE: Partial<Record<State, Partial<Record<EventName, Cell>>>> = {
  seat: {
    liftOnPage: [STATES.handPage, [hold(true), OPEN]],
    click: [SEATED, [{ kind: 'press' }]],
  },
  handPage: {
    dropOnPage: [LANDING, [hold(false)]],
    escapeOnPage: [LANDING, [hold(false)]],
    painted: [STATES.handDeskOnPage, [hold(true)]],
    signedOut: [LANDING, [hold(false)]],
  },
  handDeskOnPage: {
    dropOnPage: [deskAt(OUT), [hold(false)]],
    escapeOnPage: [HOME, [hold(false)]],
    ended: [STATES.handPage, [hold(true)]],
    signedOut: [HOME, [hold(false)]],
  },
  handDeskOnDesk: {
    dropOnDesk: [deskAt(OUT), [hold(false)]],
    escapeOnDesk: [HOME, [hold(false)]],
    ended: [SEATED, [hold(false)]],
    signedOut: [HOME, [hold(false)]],
  },
  desk: {
    liftOnDesk: [STATES.handDeskOnDesk, [hold(true)]],
    ended: [SEATED, [hold(false)]],
    double: [STATES.desk, [{ kind: 'front' }]],
    recall: [HOME, [hold(false)]],
    signedOut: [HOME, [hold(false)]],
  },
  deskNote: {
    liftOnDesk: [STATES.handDeskOnDesk, [hold(true)]],
    escapeOnPage: [STATES.desk, [hold(false)]],
    escapeOnDesk: [STATES.desk, [hold(false)]],
    ended: [SEATED, [hold(false)]],
    click: [STATES.desk, [hold(false)]],
    double: [STATES.deskNote, [{ kind: 'front' }]],
    recall: [HOME, [hold(false)]],
    signedOut: [HOME, [hold(false)]],
  },
  deskWaiting: {
    liftOnDesk: [STATES.handDeskOnDesk, [hold(true)]],
    ended: [SEATED, [hold(false)]],
    double: [STATES.deskWaiting, [{ kind: 'front' }]],
    recall: [HOME, [hold(false)]],
    signedOut: [HOME, [hold(false)]],
    seat: [HOME, [hold(false)]],
  },
  home: {
    liftOnDesk: [STATES.handDeskOnDesk, [hold(true)]],
    arrived: [{ at: 'landing', from: 'home' }, [hold(false)]],
    ended: [SEATED, [hold(false)]],
  },
  landingFromHand: {
    cleared: [SEATED, [RELEASE, hold(false), STROKE]],
    ended: [SEATED, [hold(false), STROKE]],
  },
  landingFromHome: {
    cleared: [SEATED, [RELEASE, hold(false)]],
    ended: [SEATED, [hold(false)]],
  },
}

const ALLOWED = new Set(['open', 'release', 'mode', 'front', 'press', 'stroke'])

describe('形的所在：规格那张表逐格', () => {
  for (const state of Object.keys(STATES) as State[])
    for (const name of Object.keys(EVENTS) as EventName[]) {
      const cell = TABLE[state]?.[name]
      const from = STATES[state]
      it(`${state} × ${name}：${cell === undefined ? '不理' : '照表'}`, () => {
        const answer = step(from, EVENTS[name], FACTS)
        if (cell === undefined) expect(answer).toEqual({ where: from, effects: [] })
        else expect(answer).toEqual({ where: cell[0], effects: cell[1] })
      })
    }
})

describe('形的所在：随事实变的那几格', () => {
  it('这台机器不能离开：拿起只在手里，不开租约', () => {
    expect(step(STATES.seat, EVENTS.liftOnPage, { ...FACTS, leave: false })).toEqual({
      where: STATES.handPage,
      effects: [hold(true)],
    })
  })

  it('页面画着而没有租约：松手、Escape、退出登录都在座，放掉在开的请求，页面里一笔回座位', () => {
    for (const event of [EVENTS.dropOnPage, EVENTS.escapeOnPage, EVENTS.signedOut])
      expect(step(STATES.handPage, event, { ...FACTS, leased: false })).toEqual({
        where: SEATED,
        effects: [RELEASE, hold(false), STROKE],
      })
  })

  it('页面画着时租约没了：留在原格，什么都不做', () => {
    expect(step(STATES.handPage, EVENTS.ended, { ...FACTS, leased: false })).toEqual({
      where: STATES.handPage,
      effects: [],
    })
  })

  it('落点在主窗口内容区里而且主窗口看得见：回程；看不见：留在桌面', () => {
    const drop = { kind: 'drop', on: 'page', at: IN } as const
    expect(step(STATES.handDeskOnPage, drop, FACTS).where).toEqual(HOME)
    expect(step(STATES.handDeskOnPage, drop, { ...FACTS, visible: false }).where).toEqual(
      deskAt(IN),
    )
  })

  it('留在桌面时落点夹到整个形在那块屏里', () => {
    const far = { kind: 'drop', on: 'desk', at: { x: 1500, y: -40 } } as const
    expect(step(STATES.handDeskOnDesk, far, FACTS).where).toEqual(deskAt({ x: 1412, y: 28 }))
    const near = { kind: 'drop', on: 'desk', at: { x: 3, y: 899 } } as const
    expect(step(STATES.handDeskOnDesk, near, FACTS).where).toEqual(deskAt({ x: 28, y: 872 }))
  })

  it('落点与内容区的边：左与上的边算在里面回程，右与下的边不算；四边外一格留在桌面', () => {
    const { x, y, width, height } = CONTENT
    const at = (px: number, py: number) =>
      step(STATES.handDeskOnPage, { kind: 'drop', on: 'page', at: { x: px, y: py } }, FACTS).where
        .at
    expect([
      at(x, 400),
      at(500, y),
      at(x, y),
      at(x + width - 1, 400),
      at(500, y + height - 1),
    ]).toEqual(['home', 'home', 'home', 'home', 'home'])
    expect([at(x - 1, 400), at(x + width, 400), at(500, y - 1), at(500, y + height)]).toEqual([
      'desk',
      'desk',
      'desk',
      'desk',
    ])
  })

  it('事实里没有屏：落点不夹，原样留在桌面', () => {
    const far = { kind: 'drop', on: 'desk', at: { x: 1500, y: -40 } } as const
    expect(step(STATES.handDeskOnDesk, far, { ...FACTS, screen: null }).where).toEqual(
      deskAt({ x: 1500, y: -40 }),
    )
  })

  it('事实里没有主窗口内容区：落在哪里都留在桌面', () => {
    const drop = { kind: 'drop', on: 'page', at: IN } as const
    expect(step(STATES.handDeskOnPage, drop, { ...FACTS, content: null }).where).toEqual(deskAt(IN))
  })

  it('等座位时还没有座位：落定的点不动，哪怕它在屏外', () => {
    const away: Whereabouts = { at: 'desk', spot: { x: 1500, y: -40 }, note: false, waiting: true }
    expect(step(away, EVENTS.seat, { ...FACTS, seat: null })).toEqual({ where: away, effects: [] })
  })

  it('要回程而没有看得见的座位：留在桌面，记着在等', () => {
    const none = { ...FACTS, seat: null }
    const drop = { kind: 'drop', on: 'page', at: IN } as const
    expect(step(STATES.handDeskOnPage, drop, none).where).toEqual(deskAt(IN, true))
    expect(step(STATES.handDeskOnDesk, EVENTS.escapeOnDesk, none).where).toEqual(deskAt(OUT, true))
    expect(step(STATES.handDeskOnDesk, EVENTS.signedOut, none).where).toEqual(deskAt(OUT, true))
    expect(step(STATES.deskNote, EVENTS.signedOut, none)).toEqual({
      where: deskAt(SPOT, true),
      effects: [hold(false)],
    })
    expect(step(STATES.desk, EVENTS.signedOut, none)).toEqual({
      where: deskAt(SPOT, true),
      effects: [hold(false)],
    })
  })

  it('在桌面上等座位：座位一出现就回程；还没有就接着等', () => {
    expect(step(STATES.deskWaiting, EVENTS.seat, FACTS).where).toEqual(HOME)
    expect(step(STATES.deskWaiting, EVENTS.seat, { ...FACTS, seat: null })).toEqual({
      where: STATES.deskWaiting,
      effects: [],
    })
  })

  it('单击：说话位上有人时开说话笺，键盘给桌面层', () => {
    expect(step(STATES.desk, EVENTS.click, { ...FACTS, talker: true })).toEqual({
      where: STATES.deskNote,
      effects: [hold(false, true)],
    })
  })

  it('从桌面层拿起时笔停在手下：在手、桌面层画、指针按在桌面层上', () => {
    expect(step(STATES.home, EVENTS.liftOnDesk, FACTS).where).toEqual(STATES.handDeskOnDesk)
  })

  it('落座从手里来的带着松手点，从回程来的不带', () => {
    const at = { x: 700, y: 20 }
    expect(step(STATES.handPage, { kind: 'drop', on: 'page', at }, FACTS).where).toEqual({
      at: 'landing',
      from: 'hand',
      drop: at,
    })
    expect(step(STATES.home, EVENTS.arrived, FACTS).where).toEqual({
      at: 'landing',
      from: 'home',
    })
  })
})

describe('形的所在：每一条路上', () => {
  const variants: readonly Facts[] = [
    FACTS,
    { ...FACTS, leave: false },
    { ...FACTS, leased: false },
    { ...FACTS, seat: null },
    { ...FACTS, visible: false },
    { ...FACTS, talker: true },
  ]
  const every = (check: (from: Whereabouts, event: WhereEvent, facts: Facts) => void) => {
    for (const from of Object.values(STATES))
      for (const event of Object.values(EVENTS))
        for (const facts of variants) check(from, event, facts)
  }

  it('所在一变就有一次 mode，不变就没有', () => {
    every((from, event, facts) => {
      const { where, effects } = step(from, event, facts)
      const modes = effects.filter(effect => effect.kind === 'mode')
      expect(modes.length).toBe(JSON.stringify(where) === JSON.stringify(from) ? 0 : 1)
      if (modes[0]?.kind === 'mode') {
        expect(modes[0].hold).toBe(where.at === 'hand')
        expect(modes[0].keys).toBe(where.at === 'desk' && where.note)
      }
    })
  })

  it('要做的事里没有问窗口、读窗口与截图', () => {
    every((from, event, facts) => {
      for (const effect of step(from, event, facts).effects)
        expect(ALLOWED.has(effect.kind)).toBe(true)
    })
  })

  it('说话位上没有人时说话笺不会开', () => {
    every((from, event, facts) => {
      const { where } = step(from, event, { ...facts, talker: false })
      if (where.at === 'desk' && where.note) expect(from).toEqual(where)
    })
  })
})

describe('松手落在哪：读窗口、被盖着乘落点乘主窗口', () => {
  const HANDS = { handDeskOnPage: 'page', handDeskOnDesk: 'desk' } as const
  for (const [state, on] of Object.entries(HANDS) as [State, 'page' | 'desk'][])
    for (const look of [false, true])
      for (const covered of [false, true])
        for (const [spot, at] of [
          ['内容区里', IN],
          ['内容区外', OUT],
        ] as const)
          for (const visible of [true, false]) {
            const back = !look && !covered && at === IN && visible
            const name = `${state}：${look ? '读窗口' : '不读'}、${covered ? '被盖着' : '没盖着'}、${spot}、主窗口${visible ? '看得见' : '藏着'} → ${back ? '回程' : '在桌面'}`
            it(name, () => {
              const drop = { kind: 'drop', on, at, look, covered } as const
              const answer = step(STATES[state], drop, { ...FACTS, visible })
              expect(answer).toEqual({
                where: back ? HOME : deskAt(at),
                effects: [hold(false)],
              })
            })
          }

  it('读窗口到在桌面时说话笺先不开，落点照样夹进屏里', () => {
    const far = { kind: 'drop', on: 'desk', at: { x: 1500, y: -40 }, look: true } as const
    expect(step(STATES.handDeskOnDesk, far, FACTS).where).toEqual(deskAt({ x: 1412, y: 28 }))
  })

  it('页面画着时松手带的两个事实不改变落座', () => {
    const drop = { kind: 'drop', on: 'page', at: OUT, look: true, covered: true } as const
    expect(step(STATES.handPage, drop, FACTS).where).toEqual(LANDING)
  })
})

describe('读到了要给人看的：开说话笺', () => {
  it('在桌面、笺收着、说话位上有人：开笺，键盘给桌面层', () => {
    for (const from of [STATES.desk, STATES.deskWaiting])
      expect(step(from, EVENTS.seen, { ...FACTS, talker: true })).toEqual({
        where: { ...from, note: true },
        effects: [hold(false, true)],
      })
  })

  it('笺已经开着：不动；说话位上没有人：不开', () => {
    expect(step(STATES.deskNote, EVENTS.seen, { ...FACTS, talker: true })).toEqual({
      where: STATES.deskNote,
      effects: [],
    })
    expect(step(STATES.desk, EVENTS.seen, FACTS)).toEqual({ where: STATES.desk, effects: [] })
  })

  it('不在桌面上的所在都不理', () => {
    for (const state of ['seat', 'handPage', 'handDeskOnDesk', 'home', 'landingFromHand'] as const)
      expect(step(STATES[state], EVENTS.seen, { ...FACTS, talker: true })).toEqual({
        where: STATES[state],
        effects: [],
      })
  })
})

describe('谁在画、画什么', () => {
  const HAND = { x: 9, y: 8 }
  it('页面画：在座、页面画的在手、落座', () => {
    const drawn = (Object.keys(STATES) as State[]).filter(state => pageDraws(STATES[state]))
    expect(drawn).toEqual(['seat', 'handPage', 'landingFromHand', 'landingFromHome'])
  })

  it('交给桌面层的：在手跟手，在桌面落定在一点，回程一笔写到座位，别的什么都不画', () => {
    expect(sceneWhere(STATES.handPage, HAND)).toEqual({ mode: 'hand', at: HAND })
    expect(sceneWhere(STATES.handDeskOnDesk, HAND)).toEqual({ mode: 'hand', at: HAND })
    expect(sceneWhere(STATES.desk, HAND)).toEqual({ mode: 'rest', at: SPOT })
    expect(sceneWhere(STATES.home, HAND)).toEqual({ mode: 'home', at: SEAT })
    expect(sceneWhere(STATES.seat, HAND)).toEqual({ mode: 'none' })
    expect(sceneWhere(STATES.landingFromHand, HAND)).toEqual({ mode: 'none' })
    expect(sceneWhere(STATES.landingFromHome, HAND)).toEqual({ mode: 'none' })
  })
})
