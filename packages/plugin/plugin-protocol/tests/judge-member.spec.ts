import { describe, expect, it } from 'vitest'
import {
  genericItem,
  judgeMember,
  reasonText,
  type Member,
  type PointRules,
  type Target,
} from '@omne-harness/plugin-protocol'

const data: Member = { point: 'notes.board', key: 'pins', data: { label: 'x' } }
const directory: Member = { point: 'notes.board', key: 'pins', directory: 'skills/pins' }
const code: Member = { point: 'notes.board', key: 'pins', module: 'pins.js', export: 'pins' }

const rules = (over: Partial<PointRules> = {}): PointRules => ({
  binding: 'run',
  item: { kind: 'data', fields: { label: 'string' } },
  ...over,
})
const fn = { kind: 'pure', fields: { render: 'function' } } as const
const CLOSED = { only: 'deployment', why: 'no-tenant', note: 'Nobody is signed in here.' } as const

const absent = {
  kind: 'not',
  reason: { kind: 'absent', absent: { kind: 'point', name: 'notes.board' } },
}
const closed = { kind: 'not', reason: { kind: 'closed', why: 'no-tenant', note: CLOSED.note } }
const fixed = { kind: 'not', reason: { kind: 'fixed' } }
const wrong = (takes: string, gives: string) => ({
  kind: 'not',
  reason: { kind: 'wrong-way', takes, gives },
})

/** 「一个成员怎样判」：点的八种情形乘成员的三种写法，每一格一条。 */
const TABLE: readonly (readonly [string, Target, unknown, unknown, unknown])[] = [
  ['此刻不在', { kind: 'absent' }, absent, absent, absent],
  [
    '关着',
    { kind: 'point', rules: rules({ scopes: CLOSED }), form: false },
    closed,
    closed,
    closed,
  ],
  [
    '写着构建时就定',
    { kind: 'point', rules: rules({ binding: 'build' }), form: false },
    fixed,
    fixed,
    fixed,
  ],
  [
    '数据型类别的点',
    { kind: 'category', takes: 'data' },
    { kind: 'held', way: 'data' },
    wrong('data', 'directory'),
    wrong('data', 'code'),
  ],
  [
    '目录型类别的点',
    { kind: 'category', takes: 'directory' },
    wrong('directory', 'data'),
    { kind: 'held', way: 'directory' },
    wrong('directory', 'code'),
  ],
  [
    '不收 Plugin 成员的类别的点',
    { kind: 'category', takes: 'none', why: 'a plugin does not hold a skin' },
    { kind: 'not', reason: { kind: 'refused', detail: 'a plugin does not hold a skin' } },
    { kind: 'not', reason: { kind: 'refused', detail: 'a plugin does not hold a skin' } },
    { kind: 'not', reason: { kind: 'refused', detail: 'a plugin does not hold a skin' } },
  ],
  [
    '一项交数据',
    { kind: 'point', rules: rules(), form: false },
    { kind: 'data' },
    wrong('data', 'directory'),
    wrong('data', 'code'),
  ],
  [
    '一项交函数，有专门的写法',
    { kind: 'point', rules: rules({ item: fn }), form: true },
    wrong('code', 'data'),
    wrong('code', 'directory'),
    { kind: 'code', form: 'special' },
  ],
  [
    '一项交函数，没有专门的写法',
    { kind: 'point', rules: rules({ item: fn }), form: false },
    wrong('code', 'data'),
    wrong('code', 'directory'),
    { kind: 'code', form: 'generic' },
  ],
]

describe('一个成员怎样判：两棵树共用的一张表', () => {
  it.each(TABLE)('%s', (_name, target, byData, byDirectory, byCode) => {
    expect([
      judgeMember(target, data),
      judgeMember(target, directory),
      judgeMember(target, code),
    ]).toEqual([byData, byDirectory, byCode])
  })

  it('写开的规矩照规则判：不写与写 all 一样', () => {
    const open = { kind: 'point', rules: rules({ scopes: 'all' }), form: false } as const
    expect(judgeMember(open, data)).toEqual({ kind: 'data' })
  })

  it('关着先于构建时就定：两样都写着的点答关着', () => {
    const both = {
      kind: 'point',
      rules: rules({ scopes: CLOSED, binding: 'build' }),
      form: false,
    } as const
    expect(judgeMember(both, data)).toEqual(closed)
  })

  it('每一种原因都说得出一句话', () => {
    expect(
      [
        { kind: 'absent', absent: { kind: 'point', name: 'notes.board' } },
        { kind: 'closed', why: 'no-tenant', note: 'Nobody is signed in here.' },
        { kind: 'fixed' },
        { kind: 'wrong-way', takes: 'directory', gives: 'code' },
        { kind: 'threw', detail: 'pins threw: boom' },
        { kind: 'refused', detail: 'the item lacks label' },
      ].map(reason => reasonText(reason as never)),
    ).toEqual([
      'notes.board is not a point now',
      'the point is closed to plugins (no-tenant): Nobody is signed in here.',
      'the point is fixed when the application is built',
      'the point takes a directory; this member gives code',
      'pins threw: boom',
      'the item lacks label',
    ])
  })
})

describe('通用写法：代码交回的东西成为这个点的一项', () => {
  const drawing = rules({ item: fn })
  const two = rules({ item: { kind: 'pure', fields: { available: 'function', run: 'function' } } })

  it('只要一个函数字段时交回一个函数就够；交回一个对象也收', () => {
    const draw = () => null
    expect(genericItem(drawing, draw)).toEqual({ item: { render: draw } })
    expect(genericItem(drawing, { render: draw })).toEqual({ item: { render: draw } })
    expect(genericItem(two, { available: draw, run: draw })).toEqual({
      item: { available: draw, run: draw },
    })
  })

  it('清单的标识与次序盖过交回的对象里的同名字段；字段的种类照规矩核，缺了说缺哪一个', () => {
    const page = rules({
      item: {
        kind: 'pure',
        fields: { id: 'string', title: 'string', rank: 'number', render: 'function' },
      },
    })
    const render = () => null
    expect(
      genericItem(page, { id: 'mine', title: 'Notes', render }, { id: 'notes', rank: 60 }),
    ).toEqual({
      item: { id: 'notes', title: 'Notes', rank: 60, render },
    })
    expect(genericItem(page, { title: 'Notes', render }, { id: 'notes' })).toEqual({
      kind: 'refused',
      detail: 'the item lacks rank (number)',
    })
    expect(genericItem(two, { available: render, run: 'not a function' })).toEqual({
      kind: 'refused',
      detail: 'the item lacks run (function)',
    })
  })

  it('交回的既不是那个函数也不是对象：说明这个点要什么', () => {
    expect(genericItem(two, () => null)).toEqual({
      kind: 'refused',
      detail: 'what was given is not an item of the point, which asks for available, run',
    })
  })
})
