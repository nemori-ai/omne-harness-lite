import { describe, expect, it } from 'vitest'
import type { SayOutcome } from '@omne-harness/shell-contract'
import {
  SCOPE,
  WINDOW,
  carried,
  framed,
  harness,
  onDesk,
  sayItem,
  sayPlace,
  shot,
  until,
} from './support/desk-stay.ts'

/** On the desk with one item in the say slot; `click` is a single click on the figure out there. */
async function talking(given: Parameters<typeof sayItem>[1] = {}) {
  const place = sayPlace()
  const one = sayItem('session-ui#1', given)
  place.put(one.item)
  const device = harness('leave', place)
  const lease = await onDesk(device)
  const input = (input: string, more: object = { at: null }) =>
    device.up({ kind: 'input', lease, input, ...more })
  return {
    device,
    place,
    one,
    lease,
    input,
    click: () => input('click'),
    send: (words: string, to: object = { kind: 'new' }) => input('send', { words, to }),
    note: () => device.last().note,
    keys: () => device.modes().at(-1)?.body,
  }
}

function later<T>() {
  let settle!: (value: T) => void
  let fail!: (reason: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  return { promise, settle, fail }
}

describe('外壳读说话位：开笺', () => {
  it('位置上有一项时单击开笺：一幕带候选与缺省；keys 为真，所在一变恰一次 mode', async () => {
    const talk = await talking({ current: () => 's-1' })
    const modes = talk.device.modes().length
    talk.click()
    expect(talk.note()).toEqual({
      targets: [{ key: 's-1', label: '周报' }],
      to: { kind: 'target', key: 's-1' },
      fate: null,
    })
    expect(talk.device.modes()).toHaveLength(modes + 1)
    expect(talk.keys()).toEqual({ hold: false, keys: true })
    expect(talk.one.asked).toEqual([SCOPE])
  })

  it('current 答 undefined：缺省说给新会话', async () => {
    const talk = await talking()
    talk.click()
    expect(talk.note()?.to).toEqual({ kind: 'new' })
  })

  it('位置上没有项，或两项冲突：单击不开笺', async () => {
    const empty = harness()
    const lease = await onDesk(empty)
    empty.up({ kind: 'input', lease, input: 'click', at: null })
    expect(empty.last().note).toBeNull()
    expect(empty.modes().at(-1)?.body).toEqual({ hold: false, keys: false })

    const talk = await talking()
    talk.place.put(sayItem('other#1').item)
    talk.click()
    expect(talk.note()).toBeNull()
  })

  it('targets 答 undefined 或抛出：一幕里是「读不到」，不当成没有候选', async () => {
    const unread = await talking({ targets: () => undefined })
    unread.click()
    expect(unread.note()?.targets).toBeNull()
    const broken = await talking({
      targets: () => {
        throw new Error('no catalog')
      },
    })
    broken.click()
    expect(broken.note()?.targets).toBeNull()
  })

  it('笺开着时那一项叫 subscribe：重取候选与缺省并重发一幕；笺收着时不重发', async () => {
    let targets = [{ key: 's-1', label: '周报' }]
    const talk = await talking({ targets: () => targets })
    talk.one.changed()
    expect(talk.note()).toBeNull()
    talk.click()
    targets = [...targets, { key: 's-2', label: '新的' }]
    talk.one.changed()
    expect(talk.note()?.targets).toEqual(targets)
  })

  it('笺开着时项被撤下：笺留着，写读不到，不让发', async () => {
    const talk = await talking()
    talk.click()
    talk.place.take(talk.one.item)
    expect(talk.note()?.targets).toBeNull()
    talk.send('在吗')
    expect(talk.one.said).toEqual([])
  })

  it('每次用都现取这一项：换了一项之后发送调的是新的', async () => {
    const talk = await talking()
    talk.click()
    const next = sayItem('session-ui#2')
    talk.place.take(talk.one.item)
    talk.place.put(next.item)
    talk.send('在吗')
    expect(talk.one.said).toEqual([])
    expect(next.said).toEqual([[SCOPE, { kind: 'new' }, '在吗']])
  })
})

describe('外壳读说话位：发送', () => {
  it('调 say 一次，说给人选的那一个；在途时一幕写发送中，受理了写受理', async () => {
    const pending = later<SayOutcome>()
    const talk = await talking({ say: () => pending.promise })
    talk.click()
    talk.send('帮我看一下周报', { kind: 'target', key: 's-1' })
    expect(talk.one.said).toEqual([[SCOPE, { kind: 'target', key: 's-1' }, '帮我看一下周报']])
    expect(talk.note()?.fate).toEqual({ kind: 'sending' })
    pending.settle({ kind: 'sent', key: 's-1' })
    await talk.device.settle()
    expect(talk.note()?.fate).toEqual({ kind: 'accepted' })
  })

  it('失败带原因；不知道就是不知道', async () => {
    const failed = await talking({
      say: () => Promise.resolve({ kind: 'failed', reason: '租户换了' }),
    })
    failed.click()
    failed.send('在吗')
    await failed.device.settle()
    expect(failed.note()?.fate).toEqual({ kind: 'failed', reason: '租户换了' })
    const unknown = await talking({ say: () => Promise.resolve({ kind: 'unknown' }) })
    unknown.click()
    unknown.send('在吗')
    await unknown.device.settle()
    expect(unknown.note()?.fate).toEqual({ kind: 'unknown' })
  })

  it('say 抛出或拒绝：记不知道，不重发', async () => {
    const thrown = await talking({
      say: () => {
        throw new Error('module gone')
      },
    })
    thrown.click()
    thrown.send('在吗')
    await thrown.device.settle()
    expect(thrown.note()?.fate).toEqual({ kind: 'unknown' })
    expect(thrown.one.said).toHaveLength(1)
    const rejected = await talking({ say: () => Promise.reject(new Error('closed')) })
    rejected.click()
    rejected.send('在吗')
    await rejected.device.settle()
    expect(rejected.note()?.fate).toEqual({ kind: 'unknown' })
    expect(rejected.one.said).toHaveLength(1)
  })

  it('在途时第二次发送不接', async () => {
    const pending = later<SayOutcome>()
    const talk = await talking({ say: () => pending.promise })
    talk.click()
    talk.send('一')
    talk.send('二')
    expect(talk.one.said).toHaveLength(1)
    pending.settle({ kind: 'failed', reason: '不行' })
    await talk.device.settle()
    talk.send('二')
    expect(talk.one.said).toHaveLength(2)
  })

  it('在途时形被拿起、叫回：那一次照它的结局落定，外壳不重发，结局到了没有笺可写就丢掉', async () => {
    const pending = later<SayOutcome>()
    const talk = await talking({ say: () => pending.promise })
    talk.click()
    talk.send('在吗')
    talk.input('lift', { at: { x: 1300, y: 350 } })
    expect(talk.note()).toBeNull()
    talk.input('drop', { at: { x: 1300, y: 350 } })
    const scenes = talk.device.scenes().length
    pending.settle({ kind: 'sent', key: 's-1' })
    await talk.device.settle()
    expect(talk.device.scenes()).toHaveLength(scenes)
    expect(talk.one.said).toHaveLength(1)
    talk.click()
    expect(talk.note()?.fate).toBeNull()
  })

  it('笺没开时的发送不理', async () => {
    const talk = await talking()
    talk.send('在吗')
    expect(talk.one.said).toEqual([])
  })
})

describe('外壳读说话位：收起与去对话页', () => {
  it('收起：笺收起，keys 回到假，形留在桌面', async () => {
    const talk = await talking()
    talk.click()
    talk.input('close')
    expect(talk.note()).toBeNull()
    expect(talk.device.last().where.mode).toBe('rest')
    expect(talk.keys()).toEqual({ hold: false, keys: false })
    expect(talk.device.fronts()).toBe(0)
  })

  it('去对话页：调 show(scope, 受理的键)，再请主进程提主窗口；笺收起，形留在桌面', async () => {
    const talk = await talking({ say: () => Promise.resolve({ kind: 'sent', key: 's-9' }) })
    talk.click()
    talk.send('在吗')
    await talk.device.settle()
    talk.input('show')
    expect(talk.one.shown).toEqual([[SCOPE, 's-9']])
    expect(talk.device.fronts()).toBe(1)
    expect(talk.note()).toBeNull()
    expect(talk.device.last().where.mode).toBe('rest')
    expect(talk.keys()).toEqual({ hold: false, keys: false })
  })

  it('笺是为开它时的那个租户开的：租户换了之后，读候选、say 与 show 问的仍是原来的租户，由那一项自己拒绝', async () => {
    const talk = await talking({ say: () => Promise.resolve({ kind: 'sent', key: 's-9' }) })
    talk.click()
    talk.device.setScope('tenant-b')
    talk.one.changed()
    expect(talk.one.asked).toEqual([SCOPE, SCOPE])
    talk.send('在吗', { kind: 'target', key: 's-1' })
    await talk.device.settle()
    expect(talk.one.said).toEqual([[SCOPE, { kind: 'target', key: 's-1' }, '在吗']])
    talk.input('show')
    expect(talk.one.shown).toEqual([[SCOPE, 's-9']])
  })

  it('没有受理的那一句时，去对话页不理', async () => {
    const talk = await talking()
    talk.click()
    talk.input('show')
    expect(talk.one.shown).toEqual([])
    expect(talk.device.fronts()).toBe(0)
    expect(talk.note()).not.toBeNull()
  })
})

/** On the desk with the note open on the two pictures of a ⌘ drop over WINDOW. */
async function withPictures(given: Parameters<typeof sayItem>[1] = {}) {
  const looked = await carried({ window: () => Response.json(WINDOW), shot }, given)
  const { device, lease } = looked
  await framed(device)
  device.hand('drop', 1000, 300, { meta: true })
  await until(device, () => device.last().note != null)
  const ids = () => device.last().note?.pictures?.map(picture => picture.id) ?? []
  const send = (words: string, pictures = ids()) =>
    device.up({ kind: 'input', lease, input: 'send', words, to: { kind: 'new' }, pictures })
  const bytes = () => new Map(device.pictures().map(sent => [sent.id, sent.bytes]))
  return { ...looked, ids, send, bytes }
}

describe('外壳读说话位：带图发送', () => {
  it('那一项答认识图：留着的图作为第四个参数交给 say，名字与字节和笺里的一样', async () => {
    const talk = await withPictures({ pictures: () => true })
    const [window, near] = talk.ids()
    talk.send('这是什么意思')
    const handed = talk.bytes()
    expect(talk.one.said).toEqual([
      [
        SCOPE,
        { kind: 'new' },
        '这是什么意思',
        [
          { name: '窗口 09.05.07.png', bytes: handed.get(window!) },
          { name: '近看 09.05.07.png', bytes: handed.get(near!) },
        ],
      ],
    ])
  })

  it('去掉一张：笺里拿掉它，发送只交留着的那张', async () => {
    const talk = await withPictures({ pictures: () => true })
    const [window, near] = talk.ids()
    talk.device.up({ kind: 'input', lease: talk.lease, input: 'unpicture', picture: window! })
    expect(talk.ids()).toEqual([near])
    talk.send('看近的这张')
    const handed = talk.one.said[0]?.[3] as { name: string }[]
    expect(handed.map(picture => picture.name)).toEqual(['近看 09.05.07.png'])
  })

  it('那一项答不认识或没有这个成员：发送不交图，只交三个参数', async () => {
    for (const given of [{ pictures: () => false }, {}]) {
      const talk = await withPictures(given)
      expect(talk.device.last().note?.told).toEqual({ kind: 'cannot-send-pictures' })
      talk.send('只发字')
      expect(talk.one.said).toEqual([[SCOPE, { kind: 'new' }, '只发字']])
    }
  })

  it('发送那一刻现问：开笺时认识、发送时不认识了，不交图', async () => {
    let knows = true
    const talk = await withPictures({ pictures: () => knows })
    knows = false
    talk.send('在吗')
    expect(talk.one.said[0]).toHaveLength(3)
  })

  it('那一项叫 subscribe：重问认不认识图，说明跟着变', async () => {
    let knows = false
    const talk = await withPictures({ pictures: () => knows })
    expect(talk.device.last().note?.told).toEqual({ kind: 'cannot-send-pictures' })
    knows = true
    talk.one.changed()
    expect(talk.device.last().note?.told).toBeUndefined()
  })

  it('受理了或不知道：笺里的图清掉；确定没发出：图留着', async () => {
    const outcomes: readonly [SayOutcome, number][] = [
      [{ kind: 'sent', key: 's-1' }, 0],
      [{ kind: 'unknown' }, 0],
      [{ kind: 'failed', reason: '图没有收下' }, 2],
    ]
    for (const [outcome, left] of outcomes) {
      const talk = await withPictures({ pictures: () => true, say: () => Promise.resolve(outcome) })
      talk.send('看一下')
      await talk.device.settle()
      expect(talk.ids()).toHaveLength(left)
      expect(talk.device.last().where.mode).toBe('rest')
    }
  })

  it('租户换了：图仍只交给开笺时那个租户的 say', async () => {
    const talk = await withPictures({ pictures: () => true })
    talk.device.setScope('tenant-b')
    talk.send('在吗')
    expect(talk.one.said[0]?.[0]).toBe(SCOPE)
  })
})
