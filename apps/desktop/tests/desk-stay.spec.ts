import { describe, expect, it } from 'vitest'
import { FACTS, LOOK, harness, lifted, onDesk } from './support/desk-stay.ts'

describe('外壳的桌面层：能不能离开', () => {
  it('GET /device/figure 读不到当作不能离开：拿起不开租约，松手页面自己回座位', async () => {
    const device = harness('unreadable')
    device.stay.signedIn(true)
    await device.settle()
    device.hand('lift', 300, 200)
    expect(device.hand('drop', 1200, 300)).toBe(false)
    await device.settle()
    expect(device.leases()).toBe(0)
  })

  it('这台机器不能离开，或没有登录：不开租约', async () => {
    const stays = harness('stay')
    stays.stay.signedIn(true)
    await stays.settle()
    stays.hand('lift', 300, 200)
    await stays.settle()
    expect(stays.leases()).toBe(0)
    const out = harness('leave')
    out.stay.signedIn(false)
    await out.settle()
    out.hand('lift', 300, 200)
    await out.settle()
    expect(out.leases()).toBe(0)
  })
})

describe('外壳的桌面层：出页', () => {
  it('拿起开租约；第一行到了调 mode、发第一幕：这个租约、序号 1、跟手、屏幕上的点', async () => {
    const device = harness()
    await lifted(device)
    expect(device.leases()).toBe(1)
    expect(device.modes().map(each => [each.url, each.body])).toEqual([
      ['/device/figure/mode?lease=7', { hold: true, keys: false }],
    ])
    expect(device.scenes()).toHaveLength(1)
    expect(device.last()).toMatchObject({
      lease: 7,
      serial: 1,
      look: LOOK,
      where: { mode: 'hand', at: { x: 400, y: 250 } },
    })
    expect(device.stay.away()).toBe(false)
  })

  it('手动时手的位置单走小消息，带租约号', async () => {
    const device = harness()
    await lifted(device)
    device.hand('move', 310, 220)
    expect(device.posted.at(-1)).toEqual({ kind: 'hand', lease: 7, at: { x: 410, y: 270 } })
  })

  it('只认现在的租约、最后发的那一幕的「画好了」', async () => {
    const device = harness()
    await lifted(device)
    device.stay.figure({ doing: 'thinking', waiting: 0 })
    expect(device.last()).toMatchObject({ serial: 2, figure: { doing: 'thinking' } })
    device.up({ kind: 'painted', lease: 7, serial: 1 })
    device.up({ kind: 'painted', lease: 6, serial: 2 })
    expect(device.stay.away()).toBe(false)
    device.up({ kind: 'painted', lease: 7, serial: 2 })
    expect(device.stay.away()).toBe(true)
  })

  it('页面画着时松手：有租约，宿主接手、发空的一幕；「空了」之后放弃那条请求，页面从松手点一笔回座位', async () => {
    const device = harness()
    await lifted(device)
    expect(device.hand('drop', 320, 210)).toBe(true)
    expect(device.last()).toMatchObject({ serial: 2, where: { mode: 'none' } })
    expect(device.goHome).not.toHaveBeenCalled()
    device.up({ kind: 'cleared', lease: 7, serial: 1 })
    expect(device.goHome).not.toHaveBeenCalled()
    device.up({ kind: 'cleared', lease: 7, serial: 2 })
    await device.settle()
    expect(device.goHome).toHaveBeenCalledTimes(1)
    expect(device.cancelled).toEqual([0])
  })

  it('第一行还没到就松手：没有租约，页面自己回座位，放掉那条请求', async () => {
    const device = harness()
    device.stay.signedIn(true)
    await device.settle()
    device.hand('lift', 300, 200)
    await device.settle()
    expect(device.hand('drop', 320, 210)).toBe(false)
    await device.settle()
    expect(device.cancelled).toEqual([0])
    expect(device.scenes()).toEqual([])
  })
})

describe('外壳的桌面层：在桌面上', () => {
  it('松在窗口外：落定在松手点，所在一变调 mode', async () => {
    const device = harness()
    await onDesk(device)
    expect(device.last().where).toEqual({ mode: 'rest', at: { x: 1300, y: 350 } })
    expect(device.modes().map(each => each.body)).toEqual([
      { hold: true, keys: false },
      { hold: true, keys: false },
      { hold: false, keys: false },
    ])
    expect(device.stay.away()).toBe(true)
  })

  it('人的输入只核租约号：双击请主进程把主窗口提到前面；租约号不对的不理', async () => {
    const device = harness()
    const lease = await onDesk(device)
    const fronts = () => device.sent.filter(each => each.url === '/device/figure/front').length
    device.up({ kind: 'input', lease: lease + 1, input: 'double', at: { x: 1300, y: 350 } })
    expect(fronts()).toBe(0)
    device.up({ kind: 'input', lease, input: 'double', at: { x: 1300, y: 350 } })
    expect(fronts()).toBe(1)
  })

  it('从桌面层拿起再松：跟手，松在窗口里回程', async () => {
    const device = harness()
    const lease = await onDesk(device)
    device.up({ kind: 'input', lease, input: 'lift', at: { x: 1290, y: 340 } })
    expect(device.last().where).toEqual({ mode: 'hand', at: { x: 1290, y: 340 } })
    device.up({ kind: 'input', lease, input: 'move', at: { x: 500, y: 300 } })
    device.up({ kind: 'input', lease, input: 'drop', at: { x: 500, y: 300 } })
    expect(device.last().where).toEqual({ mode: 'home', at: { x: 140, y: 610 } })
  })

  it('报到不带租约号，把现在的一幕再发一遍；重发之后旧序号的回报不被采用，新一幕的被采用', async () => {
    const device = harness()
    await onDesk(device)
    device.stay.recall()
    const home = device.last()
    device.up({ kind: 'hello' })
    const again = device.last()
    expect(again).toEqual({ ...home, serial: home.serial + 1 })
    device.up({ kind: 'arrived', lease: home.lease, serial: home.serial })
    expect(device.stay.away()).toBe(true)
    device.up({ kind: 'arrived', lease: again.lease, serial: again.serial })
    expect(device.stay.away()).toBe(false)
    expect(device.last().where).toEqual({ mode: 'none' })
  })

  it('回程到在座：「到了」页面在座位上画、发空的一幕；「空了」到在座、放弃那条请求', async () => {
    const device = harness()
    await onDesk(device)
    device.stay.recall()
    const home = device.last()
    device.up({ kind: 'arrived', lease: home.lease, serial: home.serial })
    const empty = device.last()
    expect(device.cancelled).toEqual([])
    device.up({ kind: 'cleared', lease: empty.lease, serial: empty.serial })
    await device.settle()
    expect(device.cancelled).toEqual([0])
    expect(device.goHome).not.toHaveBeenCalled()
  })

  it('没有租约时报到什么都不发', async () => {
    const device = harness()
    device.up({ kind: 'hello' })
    expect(device.posted).toEqual([])
  })
})

describe('外壳的桌面层：租约没了', () => {
  it('读到 ended：在桌面上的形回到座位上；再拿起开新的租约', async () => {
    const device = harness()
    await onDesk(device)
    device.line(0, { ended: true })
    await device.settle()
    expect(device.stay.away()).toBe(false)
    device.hand('lift', 300, 200)
    await device.settle()
    expect(device.leases()).toBe(2)
  })

  it('流断了也照「租约没了」走', async () => {
    const device = harness()
    await onDesk(device)
    device.line(0, { facts: FACTS })
    await device.settle()
    expect(device.stay.away()).toBe(true)
    device.line(0, { facts: { ...FACTS, visible: false } })
    await device.settle()
    expect(device.stay.away()).toBe(true)
    device.close(0)
    await device.settle()
    expect(device.stay.away()).toBe(false)
  })

  it('流出错也照「租约没了」走', async () => {
    const device = harness()
    await onDesk(device)
    device.fail(0)
    await device.settle()
    expect(device.stay.away()).toBe(false)
  })

  it('开不了：页面一直画，松手自己回座位', async () => {
    const device = harness()
    device.refuse()
    device.stay.signedIn(true)
    await device.settle()
    device.hand('lift', 300, 200)
    await device.settle()
    expect(device.hand('drop', 320, 210)).toBe(false)
  })
})

describe('外壳的桌面层：签', () => {
  it('页面加载后第一次出页（桌面层画着在手的形）时放进一幕，页面自己画着时不放，第二次不放', async () => {
    const device = harness()
    await lifted(device)
    expect(device.last().label).toBeNull()
    const first = device.last()
    device.up({ kind: 'painted', lease: first.lease, serial: first.serial })
    expect(device.last().label?.map(line => line.text)).toEqual(['应用里', '松手回去'])
    device.hand('move', 1000, 300)
    expect(device.last().label?.map(line => line.text)).toEqual([
      '应用外面',
      '松手就停在这里，双击回到应用',
    ])
    device.hand('drop', 1000, 300)
    device.stay.recall()
    const home = device.last()
    device.up({ kind: 'arrived', lease: home.lease, serial: home.serial })
    const empty = device.last()
    device.up({ kind: 'cleared', lease: empty.lease, serial: empty.serial })
    await device.settle()
    device.hand('lift', 300, 200)
    await device.settle()
    device.line(1, { lease: 9, facts: FACTS })
    await device.settle()
    expect(device.last()).toMatchObject({ lease: 9, label: null })
  })
})

describe('外壳的桌面层：退出登录', () => {
  it('页面里没有座位时形留在桌面等；座位一出现就回程', async () => {
    const device = harness()
    await onDesk(device)
    device.setSeat(null)
    device.stay.signedIn(false)
    expect(device.last().where.mode).toBe('rest')
    device.seatChanged()
    expect(device.last().where.mode).toBe('rest')
    device.setSeat({ x: 400, y: 300 })
    device.seatChanged()
    expect(device.last().where).toEqual({ mode: 'home', at: { x: 500, y: 350 } })
  })
})
