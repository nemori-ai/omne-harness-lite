import { describe, expect, it } from 'vitest'
import { pointPicture } from '@omne-harness/ui-kit'
import {
  SCOPE,
  TAKEN_AT,
  WINDOW,
  bytesIn,
  carried,
  framed,
  harness,
  held,
  lifted,
  onDesk,
  png,
  shot,
  shotOf,
  sizeOf,
  until,
  DROPPED_WAIT,
  type Harness,
} from './support/desk-stay.ts'

const OTHER = () => Response.json(WINDOW)
const OWN_TRUE = () => Response.json({ own: true })
const LOOKS = { window: OTHER, own: OWN_TRUE } as const
const INTO_NOTE = '松手放进说话笺 · 加按 ⇧ 直接发送'
const NOTHING = ['这里没有可看的窗口', '松手就停在这里']
const OUTSIDE = ['应用外面', '松手就停在这里，双击回到应用']
const HINT = '按住 ⌘ 让它看一个窗口'
const DROP_AT = { x: 1100, y: 350 }

const texts = (device: Harness) => device.last().label?.map(line => line.text)
const noLooking = (device: Harness) => {
  expect(device.asked('window')).toEqual([])
  expect(device.asked('read')).toEqual([])
}

/** ⌘ let go over WINDOW; the read's answer and its pictures worked out. */
async function letGoOver(device: Harness, shift = false) {
  await framed(device, shift)
  device.hand('drop', 1000, 300, { meta: true, shift })
  await until(device, () => device.last().note != null)
}

describe('DT-56：不按 ⌘ 的每一条路上不问 window、不读，own 至多在松手落在内容区里时一次', () => {
  it('在页面里拿起、拖出去、松在窗口外', async () => {
    const { device } = await carried(LOOKS)
    device.hand('move', 1000, 300)
    device.hand('move', 1200, 400)
    device.hand('drop', 1200, 400)
    await device.settle()
    expect(device.last().where.mode).toBe('rest')
    noLooking(device)
    expect(device.asked('own')).toEqual([])
  })

  it('页面画着时就松手：不问 own', async () => {
    const device = harness('leave', undefined, { read: true, ...LOOKS })
    await lifted(device)
    device.hand('move', 900, 300, { meta: true })
    device.hand('drop', 300, 200)
    await device.settle()
    noLooking(device)
    expect(device.asked('own')).toEqual([])
  })

  it('拖回窗口里松手：只问一次 own，问的是松手点，答真回程', async () => {
    const { device } = await carried(LOOKS)
    device.hand('move', 1000, 300)
    device.hand('move', 300, 200)
    device.hand('drop', 300, 200)
    expect(device.last().where.mode).toBe('hand')
    await device.settle()
    expect(device.asked('own').map(each => each.url)).toEqual(['/device/figure/own?x=400&y=250'])
    expect(device.last().where.mode).toBe('home')
    noLooking(device)
  })

  it('在桌面上拿起再放下：放在窗口外不问 own，放回内容区里问一次', async () => {
    const { device, lease } = await carried(LOOKS)
    device.hand('drop', 1200, 400)
    await device.settle()
    device.up({ kind: 'input', lease, input: 'lift', at: { x: 1300, y: 450 } })
    device.up({ kind: 'input', lease, input: 'move', at: { x: 1250, y: 420 } })
    device.up({ kind: 'input', lease, input: 'drop', at: { x: 1250, y: 420 } })
    await device.settle()
    expect(device.asked('own')).toEqual([])
    device.up({ kind: 'input', lease, input: 'lift', at: { x: 1250, y: 420 } })
    device.up({ kind: 'input', lease, input: 'move', at: { x: 500, y: 300 } })
    device.up({ kind: 'input', lease, input: 'drop', at: { x: 500, y: 300 } })
    await device.settle()
    expect(device.asked('own')).toHaveLength(1)
    expect(device.last().where.mode).toBe('home')
    noLooking(device)
  })

  it('Escape、指针取消、租约结束、登出：都不问', async () => {
    const escaped = await carried(LOOKS)
    escaped.device.hand('escape', 300, 200)
    await escaped.device.settle()
    const cancelled = await carried(LOOKS)
    cancelled.device.hand('drop', 1200, 400)
    const at = { x: 1300, y: 450 }
    cancelled.device.up({ kind: 'input', lease: cancelled.lease, input: 'lift', at })
    cancelled.device.up({ kind: 'input', lease: cancelled.lease, input: 'cancel', at })
    const ended = await carried(LOOKS)
    ended.device.line(0, { ended: true })
    const out = await carried(LOOKS)
    out.device.stay.signedIn(false)
    for (const { device } of [escaped, cancelled, ended, out]) {
      await device.settle()
      noLooking(device)
      expect(device.asked('own')).toEqual([])
    }
  })

  it('按着 ⌘ 而说话位上没有项、这台机器不能读、或页面自己画着：不问 window', async () => {
    const empty = await carried(LOOKS, {}, 'empty')
    const unread = await carried({ ...LOOKS, read: false })
    for (const { device } of [empty, unread]) {
      device.hand('move', 1000, 300, { meta: true })
      device.hand('drop', 1000, 300, { meta: true })
      await device.settle()
      noLooking(device)
    }
    const early = harness('leave', undefined, { read: true, ...LOOKS })
    await lifted(early)
    early.hand('move', 1000, 300, { meta: true })
    await early.settle()
    noLooking(early)
  })

  it('按着 ⌘ 但没有框：松在内容区里只问一次 own，不读', async () => {
    const { device } = await carried({
      own: OWN_TRUE,
      window: () => Response.json({ kind: 'own' }),
    })
    device.hand('move', 300, 200, { meta: true })
    await device.settle()
    device.hand('drop', 300, 200, { meta: true })
    await device.settle()
    expect(device.asked('own')).toHaveLength(1)
    expect(device.asked('read')).toEqual([])
    expect(device.last().where.mode).toBe('home')
  })
})

describe('松手问 own：答复与等的那一小会儿', () => {
  const backInside = async (own: () => Response | Promise<Response>) => {
    const { device } = await carried({ own })
    device.hand('drop', 300, 200)
    await device.settle()
    return device
  }

  it('答真回程；答假留在桌面，落在松手点；出错与没有后端照真', async () => {
    expect((await backInside(OWN_TRUE)).last().where.mode).toBe('home')
    const covered = await backInside(() => Response.json({ own: false }))
    expect(covered.last().where).toEqual({ mode: 'rest', at: { x: 400, y: 250 } })
    const broken = () => Response.json({ reason: 'failed', detail: '读不到' }, { status: 500 })
    expect((await backInside(broken)).last().where.mode).toBe('home')
    const failing = await backInside(() => Promise.reject(new TypeError('gone')))
    expect(failing.last().where.mode).toBe('home')
    const none = await carried({ read: false, own: OWN_TRUE })
    none.device.hand('drop', 300, 200)
    expect(none.device.last().where.mode).toBe('home')
    expect(none.device.asked('own')).toEqual([])
  })

  it('主窗口藏着：不问 own，留在桌面', async () => {
    const { device } = await carried({ own: OWN_TRUE })
    device.line(0, { facts: { ...FACTS_HIDDEN } })
    await device.settle()
    device.hand('drop', 300, 200)
    expect(device.last().where.mode).toBe('rest')
    expect(device.asked('own')).toEqual([])
  })

  it('等答复时形仍在手里，桌面层画在松手点；这时的拿起照表不理，答复到了照样落', async () => {
    const answer = held<Response>()
    const { device, lease } = await carried({ own: () => answer.promise })
    device.hand('drop', 300, 200)
    expect(device.last().where).toEqual({ mode: 'hand', at: { x: 400, y: 250 } })
    expect(device.modes().at(-1)?.body).toEqual({ hold: true, keys: false })
    device.up({ kind: 'input', lease, input: 'lift', at: { x: 400, y: 250 } })
    answer.settle(Response.json({ own: false }))
    await device.settle()
    expect(device.last().where).toEqual({ mode: 'rest', at: { x: 400, y: 250 } })
    expect(device.asked('own')).toHaveLength(1)
  })

  it('等答复时租约没了：答复到了丢掉', async () => {
    const answer = held<Response>()
    const { device } = await carried({ own: () => answer.promise })
    device.hand('drop', 300, 200)
    device.line(0, { ended: true })
    await device.settle()
    const scenes = device.scenes().length
    answer.settle(Response.json({ own: false }))
    await device.settle()
    expect(device.scenes()).toHaveLength(scenes)
    expect(device.stay.away()).toBe(false)
  })
})

const FACTS_HIDDEN = {
  screen: { x: 0, y: 0, width: 1440, height: 900 },
  content: { x: 100, y: 50, width: 800, height: 600 },
  visible: false,
}

describe('按着 ⌘ 移动：问 window、观测框与签', () => {
  it('问的是手下那一点；答了别的应用的窗口，一幕带观测框与签', async () => {
    const { device } = await carried(LOOKS)
    await framed(device)
    expect(device.asked('window').map(each => each.url)).toEqual([
      '/device/figure/window?x=1100&y=350',
    ])
    expect(device.last().frame).toEqual({
      rect: WINDOW.bounds,
      covered: WINDOW.covered,
      closed: false,
    })
    expect(device.last().label).toEqual([{ text: 'Safari · 报错' }, { text: INTO_NOTE }])
  })

  it('按着 ⇧：口合上，第二行「松手直接发送」用提示色', async () => {
    const { device } = await carried(LOOKS)
    await framed(device, true)
    expect(device.last().frame?.closed).toBe(true)
    expect(device.last().label).toEqual([
      { text: 'Safari · 报错' },
      { text: '松手直接发送', tone: 'hint' },
    ])
  })

  it('没有标题、或标题等于应用名：第一行只写应用名', async () => {
    for (const title of ['', 'Safari']) {
      const { device } = await carried({ window: () => Response.json({ ...WINDOW, title }) })
      await framed(device)
      expect(texts(device)).toEqual(['Safari', INTO_NOTE])
    }
  })

  it('手下是 omne 自己的、没有窗口、出错或断了：没有框，签写这里没有可看的窗口', async () => {
    const answers = [
      () => Response.json({ kind: 'own' }),
      () => Response.json({ kind: 'none' }),
      () => Response.json({ reason: 'failed', detail: '列不出' }, { status: 500 }),
      () => Promise.reject(new TypeError('gone')),
      () => Response.json({ kind: 'other', id: 'w-1' }),
    ]
    for (const window of answers) {
      const { device } = await carried({ window })
      await framed(device)
      expect(device.last().frame).toBeNull()
      expect(texts(device)).toEqual(NOTHING)
    }
  })

  it('⌘ 松开（下一次移动不带 ⌘）：框立刻拿掉；第一次出页的签回来，带「按住 ⌘」一行', async () => {
    const { device } = await carried(LOOKS)
    await framed(device)
    device.hand('move', 1010, 300)
    expect(device.last().frame).toBeNull()
    expect(texts(device)).toEqual([...OUTSIDE, HINT])
  })

  it('按着 ⌘ 回到应用窗口里、手下是 omne 自己的：签写松手回去，和松手真的会怎样一致', async () => {
    const { device } = await carried({ window: () => Response.json({ kind: 'own' }) })
    device.hand('move', 300, 200, { meta: true })
    await device.settle()
    expect(device.last().frame).toBeNull()
    expect(texts(device)).toEqual(['这里没有可看的窗口', '松手回去'])
    device.hand('move', 1000, 300, { meta: true })
    await device.settle()
    expect(texts(device)).toEqual(NOTHING)
  })

  it('说话位上没有项：按 ⌘ 什么都不做，第一次出页的签也不写「按住 ⌘」一行', async () => {
    const { device } = await carried(LOOKS, {}, 'empty')
    device.hand('move', 1000, 300)
    expect(texts(device)).toEqual(OUTSIDE)
    device.hand('move', 1010, 300, { meta: true })
    await device.settle()
    noLooking(device)
  })

  it('这台机器不能读：第一次出页的签没有「按住 ⌘」一行', async () => {
    const { device } = await carried({ read: false })
    device.hand('move', 1000, 300)
    expect(texts(device)).toEqual(OUTSIDE)
  })

  it('至多每 100ms 问一次：99ms 不问，到 100ms 问手最后在的那一点', async () => {
    const { device } = await carried(LOOKS)
    await framed(device)
    device.tick(50)
    device.hand('move', 1020, 300, { meta: true })
    device.hand('move', 1030, 310, { meta: true })
    device.tick(49)
    expect(device.asked('window')).toHaveLength(1)
    device.tick(1)
    expect(device.asked('window').map(each => each.url)).toEqual([
      '/device/figure/window?x=1100&y=350',
      '/device/figure/window?x=1130&y=360',
    ])
    device.tick(150)
    device.hand('move', 1040, 310, { meta: true })
    expect(device.asked('window')).toHaveLength(3)
  })

  it('⌘ 松开之后排着的那一问不再问', async () => {
    const { device } = await carried(LOOKS)
    await framed(device)
    device.tick(10)
    device.hand('move', 1020, 300, { meta: true })
    device.hand('move', 1030, 300)
    device.tick(200)
    expect(device.asked('window')).toHaveLength(1)
  })

  it('迟到的答复丢掉：⌘ 已经松开，或已经有更新的一问', async () => {
    const first = held<Response>()
    let calls = 0
    const window = () => {
      calls += 1
      return calls === 1
        ? first.promise
        : Response.json({ ...WINDOW, id: 'w-2', app: 'Mail', title: '' })
    }
    const { device } = await carried({ window })
    device.hand('move', 1000, 300, { meta: true })
    device.tick(100)
    device.hand('move', 1010, 300, { meta: true })
    await device.settle()
    first.settle(Response.json(WINDOW))
    await device.settle()
    expect(texts(device)).toEqual(['Mail', INTO_NOTE])

    const late = held<Response>()
    const released = await carried({ window: () => late.promise })
    released.device.hand('move', 1000, 300, { meta: true })
    released.device.hand('move', 1000, 300)
    late.settle(Response.json(WINDOW))
    await released.device.settle()
    expect(released.device.last().frame).toBeNull()
  })

  it('说话位上的项在答复回来之前撤下：答复丢掉', async () => {
    const answer = held<Response>()
    const { device, place, one } = await carried({ window: () => answer.promise })
    device.hand('move', 1000, 300, { meta: true })
    place.take(one.item)
    answer.settle(Response.json(WINDOW))
    await device.settle()
    expect(device.last().frame).toBeNull()
  })
})

describe('⌘ 松手：读那个窗口', () => {
  it('到在桌面，笺先不开，调 read 读最后框住的那一个', async () => {
    let calls = 0
    const window = () => {
      calls += 1
      return Response.json(calls === 1 ? WINDOW : { ...WINDOW, id: 'w-2' })
    }
    const answer = held<Response>()
    const { device } = await carried({ window, shot: () => answer.promise })
    await framed(device)
    device.tick(100)
    device.hand('move', 1010, 300, { meta: true })
    await device.settle()
    device.hand('drop', 1010, 300, { meta: true })
    expect(device.last()).toMatchObject({
      where: { mode: 'rest', at: { x: 1110, y: 350 } },
      note: null,
      frame: null,
    })
    expect(device.asked('read').map(each => [each.url, each.body])).toEqual([
      ['/device/figure/read?lease=7', { window: 'w-2' }],
    ])
    expect(device.asked('own')).toEqual([])
  })

  it('答了图：两张，名字带截图的时刻，近看以松手点为中心；字节单走，一幕里只有标识与名字', async () => {
    const { device } = await carried({ ...LOOKS, shot }, { pictures: () => true })
    await letGoOver(device)
    const note = device.last().note!
    expect(note.pictures?.map(picture => picture.name)).toEqual([
      '窗口 09.05.07.png',
      '近看 09.05.07.png',
    ])
    expect(note.told).toBeUndefined()
    const sent = device.pictures()
    expect(sent.map(each => each.id)).toEqual(note.pictures?.map(picture => picture.id))
    expect(sent.map(each => sizeOf(each.bytes))).toEqual([
      [800, 600],
      [680, 580],
    ])
    expect(device.scenes().some(bytesIn)).toBe(false)
    expect(device.modes().at(-1)?.body).toEqual({ hold: false, keys: true })
  })

  it('松手点不在图里：只有一张「窗口」', async () => {
    const away = { ...WINDOW.bounds, x: 1200 }
    const { device } = await carried(
      { ...LOOKS, shot: () => shotOf(png(800, 600), away, 2, TAKEN_AT) },
      { pictures: () => true },
    )
    await letGoOver(device)
    expect(device.last().note?.pictures?.map(picture => picture.name)).toEqual([
      '窗口 09.05.07.png',
    ])
  })

  it('403：开笺写没有许可，不带图；按打开系统设置调 /device/screen/settings', async () => {
    const forbidden = () => Response.json({ reason: 'not-authorized' }, { status: 403 })
    const { device, lease } = await carried({ ...LOOKS, shot: forbidden })
    await letGoOver(device)
    expect(device.last().note).toMatchObject({ told: { kind: 'not-authorized' } })
    expect(device.last().note?.pictures).toBeUndefined()
    expect(device.pictures()).toEqual([])
    device.up({ kind: 'input', lease, input: 'settings', at: null })
    expect(device.sent.filter(each => each.url === '/device/screen/settings')).toEqual([
      { url: '/device/screen/settings', method: 'POST', body: undefined },
    ])
  })

  it('404 gone、没有后端的 404 与 409：不开笺，什么都不说', async () => {
    const answers = [
      () => Response.json({ reason: 'gone' }, { status: 404 }),
      () => Response.json({ reason: 'not-found' }, { status: 404 }),
      () => Response.json({ reason: 'not-current' }, { status: 409 }),
    ]
    for (const answer of answers) {
      const { device } = await carried({ ...LOOKS, shot: answer })
      await framed(device)
      device.hand('drop', 1000, 300, { meta: true })
      const scenes = device.scenes().length
      await until(device, () => false, DROPPED_WAIT)
      expect(device.scenes()).toHaveLength(scenes)
      expect(device.last()).toMatchObject({ where: { mode: 'rest' }, note: null })
    }
  })

  it('500、请求失败、图读不懂：开笺写没能看这个窗口与原因，不带图', async () => {
    const reason = await pointPicture(new TextEncoder().encode('not a png'), { x: 1, y: 1 }, 1)
      .then(() => '')
      .catch((error: Error) => error.message)
    const cases = [
      [
        () => Response.json({ reason: 'failed', detail: '截这个窗口时出错' }, { status: 500 }),
        '截这个窗口时出错',
      ],
      [() => Promise.reject(new TypeError('gone')), '读窗口的请求没有成功'],
      [() => shotOf(new TextEncoder().encode('not a png'), WINDOW.bounds, 2, TAKEN_AT), reason],
    ] as const
    expect(reason).not.toBe('')
    for (const [answer, said] of cases) {
      const { device } = await carried({ ...LOOKS, shot: answer })
      await letGoOver(device)
      expect(device.last().note?.told).toEqual({ kind: 'not-seen', reason: said })
      expect(device.last().note?.pictures).toBeUndefined()
    }
  })

  it('说话位那一项不认识图（没有这个成员或答假）：照样放进笺，写现在发不了图', async () => {
    for (const given of [{}, { pictures: () => false }]) {
      const { device } = await carried({ ...LOOKS, shot }, given)
      await letGoOver(device)
      expect(device.last().note?.pictures).toHaveLength(2)
      expect(device.last().note?.told).toEqual({ kind: 'cannot-send-pictures' })
    }
  })

  it('图到的时候笺已经开着（人单击开的）：放进这张笺', async () => {
    const answer = held<Response>()
    const { device, lease } = await carried({ ...LOOKS, shot: () => answer.promise })
    await framed(device)
    device.hand('drop', 1000, 300, { meta: true })
    device.up({ kind: 'input', lease, input: 'click', at: null })
    expect(device.last().note).not.toBeNull()
    answer.settle(shot())
    await until(device, () => device.last().note?.pictures !== undefined)
    expect(device.last().note?.pictures).toHaveLength(2)
  })

  it('报到之后重发笺里图的字节，在那一幕之前', async () => {
    const { device } = await carried({ ...LOOKS, shot }, { pictures: () => true })
    await letGoOver(device)
    const before = device.posted.length
    device.up({ kind: 'hello' })
    expect(device.posted.slice(before).map(message => message.kind)).toEqual([
      'picture',
      'picture',
      'scene',
    ])
  })

  describe('read 在途时所在变了：结果到了就丢掉，不开笺', () => {
    const changes: Record<string, (device: Harness, lease: number) => void> = {
      又被拿起: (device, lease) => device.up({ kind: 'input', lease, input: 'lift', at: DROP_AT }),
      拿起又放回桌面: (device, lease) => {
        device.up({ kind: 'input', lease, input: 'lift', at: DROP_AT })
        device.up({ kind: 'input', lease, input: 'drop', at: { x: 1300, y: 450 } })
      },
      到了回程: device => device.stay.recall(),
      租约没了: device => device.line(0, { ended: true }),
      租户换了: device => device.setScope('tenant-b'),
      登出: device => device.stay.signedIn(false),
    }
    for (const [name, change] of Object.entries(changes))
      for (const [answered, answer] of [
        ['图', shot],
        ['403', () => Response.json({ reason: 'not-authorized' }, { status: 403 })],
        ['500', () => Response.json({ reason: 'failed', detail: '坏了' }, { status: 500 })],
      ] as const)
        it(`${name} × ${answered}`, async () => {
          const pending = held<Response>()
          const { device, lease, one } = await carried(
            { ...LOOKS, shot: () => pending.promise },
            { pictures: () => true },
          )
          await framed(device)
          device.hand('drop', 1000, 300, { meta: true })
          change(device, lease)
          await device.settle()
          pending.settle(answer())
          await until(device, () => false, DROPPED_WAIT)
          expect(device.scenes().every(scene => scene.note === null)).toBe(true)
          expect(device.pictures()).toEqual([])
          expect(one.said).toEqual([])
        })
  })
})

describe('⌘⇧ 松手：读到图直接说给缺省的那一个', () => {
  it('受理了：调一次 say（话为空、带两张图），形回程，那一幕带重写的记号，笺收起', async () => {
    const { device, one } = await carried({ ...LOOKS, shot }, { pictures: () => true })
    await framed(device, true)
    device.hand('drop', 1000, 300, { meta: true, shift: true })
    await until(device, () => device.last().where.mode === 'home')
    expect(one.said).toHaveLength(1)
    const [scope, to, words, pictures] = one.said[0] as [string, unknown, string, unknown[]]
    expect([scope, to, words]).toEqual([SCOPE, { kind: 'new' }, ''])
    expect(pictures).toEqual(
      device.pictures().map((sent, index) => ({
        name: ['窗口 09.05.07.png', '近看 09.05.07.png'][index],
        bytes: sent.bytes,
      })),
    )
    expect(device.last()).toMatchObject({ where: { mode: 'home', rewrite: true }, note: null })
  })

  it('current 答了键：说给那个键', async () => {
    const { device, one } = await carried(
      { ...LOOKS, shot },
      { pictures: () => true, current: () => 's-1' },
    )
    await framed(device, true)
    device.hand('drop', 1000, 300, { meta: true, shift: true })
    await until(device, () => one.said.length > 0)
    expect(one.said[0]?.[1]).toEqual({ kind: 'target', key: 's-1' })
  })

  it('确定没发出：形留在桌面，笺里写结局，图留着', async () => {
    const { device } = await carried(
      { ...LOOKS, shot },
      {
        pictures: () => true,
        say: () => Promise.resolve({ kind: 'failed', reason: '图没有收下' }),
      },
    )
    await letGoOver(device, true)
    await until(device, () => device.last().note?.fate?.kind === 'failed')
    expect(device.last()).toMatchObject({
      where: { mode: 'rest' },
      note: { fate: { kind: 'failed', reason: '图没有收下' } },
    })
    expect(device.last().note?.pictures).toHaveLength(2)
  })

  it('不知道：形留在桌面，笺里写不知道，图清掉', async () => {
    const { device } = await carried(
      { ...LOOKS, shot },
      { pictures: () => true, say: () => Promise.resolve({ kind: 'unknown' }) },
    )
    await letGoOver(device, true)
    await until(device, () => device.last().note?.fate?.kind === 'unknown')
    expect(device.last().where.mode).toBe('rest')
    expect(device.last().note?.pictures).toBeUndefined()
  })

  it('那一项此刻不认识图：等于没按 ⇧，不调 say，笺里写现在发不了图', async () => {
    const { device, one } = await carried({ ...LOOKS, shot }, { pictures: () => false })
    await letGoOver(device, true)
    await device.settle()
    expect(one.said).toEqual([])
    expect(device.last()).toMatchObject({
      where: { mode: 'rest' },
      note: { told: { kind: 'cannot-send-pictures' }, fate: null },
    })
  })

  it('403 与没按 ⇧ 一样', async () => {
    const forbidden = () => Response.json({ reason: 'not-authorized' }, { status: 403 })
    const { device, one } = await carried({ ...LOOKS, shot: forbidden }, { pictures: () => true })
    await letGoOver(device, true)
    expect(one.said).toEqual([])
    expect(device.last().note?.told).toEqual({ kind: 'not-authorized' })
  })

  it('受理了之后再拿起、放下：回程的幕不再带记号', async () => {
    const { device } = await carried({ ...LOOKS, shot }, { pictures: () => true })
    await framed(device, true)
    device.hand('drop', 1000, 300, { meta: true, shift: true })
    await until(device, () => device.last().where.mode === 'home')
    const lease = device.last().lease
    device.up({ kind: 'input', lease, input: 'lift', at: { x: 1300, y: 450 } })
    device.up({ kind: 'input', lease, input: 'cancel', at: { x: 1300, y: 450 } })
    expect(device.last().where).toEqual({ mode: 'home', at: { x: 140, y: 610 } })
  })
})

describe('签在一幕里的位置不变', () => {
  it('在桌面上从桌面层拿起再按着 ⌘ 移动：带框与签，修饰键来自桌面层的上报', async () => {
    const { device, lease } = await carried(LOOKS)
    device.hand('drop', 1200, 400)
    await device.settle()
    device.up({ kind: 'input', lease, input: 'lift', at: { x: 1300, y: 450 } })
    device.up({ kind: 'input', lease, input: 'move', at: { x: 1100, y: 350 }, meta: true })
    await device.settle()
    expect(device.asked('window').map(each => each.url)).toEqual([
      '/device/figure/window?x=1100&y=350',
    ])
    expect(texts(device)).toEqual(['Safari · 报错', INTO_NOTE])
  })

  it('落定之后没有框', async () => {
    const device = harness()
    await onDesk(device)
    expect(device.last().frame).toBeNull()
  })
})
