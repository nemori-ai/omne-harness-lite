// 严格 JSON 读取器（https-json/1 S-7、S-8；绑定 V-3、V-4 的解析器那一半；V-11 的「第 3 级里谁在前」）。
// examples §6 的行号写在用例名里；答复那一半（读下来之后落在哪一步）在 decide.spec.ts 与 center.spec.ts。
// 深度与成员数的先后按 ccd39d9 的读法：语法错那个码点本身不计入深度与成员数；超界落在最长合法前缀之内才是超界。
import { describe, expect, it } from 'vitest'
import { jsonNumberValue, readJsonText } from '../src/json.ts'

const LIMITS = { depth: 64, members: 1024 }
const read = (text: string | Buffer, limits = LIMITS) =>
  readJsonText(typeof text === 'string' ? Buffer.from(text, 'utf8') : text, limits)
const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(
    parts.map(part => (typeof part === 'string' ? Buffer.from(part, 'utf8') : Buffer.from(part))),
  )

const P = '"lsp_q8Jf3kQ2vXw9pLr7TzA0mYc4Nd6Hb5Ue1GsW"'
const R27 = '"capability.organization-governance/v2#S-27"'
const ENVELOPE = `{"protocolVersion":"2","presentedLoginState":${P},"operation":${R27},"payload":{}}`

describe('S-7 四级读法（examples §6）', () => {
  it('#1 空请求体、只有空白 ⇒ 第 3 级读不下来', () => {
    expect(read('')).toEqual({ kind: 'unreadable', level: 3 })
    expect(read(' \t\r\n')).toEqual({ kind: 'unreadable', level: 3 })
  })

  it('#2 以 EF BB BF 开头 ⇒ 第 2 级读不下来（不跳过）；去掉这三个字节就是一份合格信封', () => {
    expect(read(bytes([0xef, 0xbb, 0xbf], ENVELOPE))).toEqual({ kind: 'unreadable', level: 2 })
    expect(read(ENVELOPE).kind).toBe('value')
  })

  it('#3 非法 UTF-8 字节 FF ⇒ 第 1 级读不下来', () => {
    expect(read(bytes('{"protocolVersion":"', [0xff], '"}'))).toEqual({
      kind: 'unreadable',
      level: 1,
    })
  })

  it('#4 原始字节里的代理码点编码 ED A0 80 ⇒ 第 1 级读不下来；超长编码与越过 U+10FFFF 同样', () => {
    expect(
      read(
        bytes(
          '{"protocolVersion":"2","presentedLoginState":"lsp_',
          [0xed, 0xa0, 0x80],
          `x","operation":${R27},"payload":{}}`,
        ),
      ),
    ).toEqual({ kind: 'unreadable', level: 1 })
    expect(read(bytes('"', [0xc0, 0xaf], '"'))).toEqual({ kind: 'unreadable', level: 1 })
    expect(read(bytes('"', [0xf4, 0x90, 0x80, 0x80], '"'))).toEqual({
      kind: 'unreadable',
      level: 1,
    })
  })

  it('#5 转义写出的孤立代理码点照常读成字符串的一部分', () => {
    const reading = read(
      `{"protocolVersion":"2","presentedLoginState":"lsp_\\uD800x","operation":${R27},"payload":{}}`,
    )
    expect(reading.kind).toBe('value')
    if (reading.kind !== 'value') return
    expect(reading.value).toMatchObject({ presentedLoginState: 'lsp_\uD800x' })
  })

  it('#6、#7 顶层是数组或字符串：读下来了（第 4 级由调用方判）', () => {
    expect(read('[{"protocolVersion":"2"}]')).toMatchObject({
      kind: 'value',
      value: [{ protocolVersion: '2' }],
    })
    expect(read('"version-mismatch"')).toMatchObject({ kind: 'value', value: 'version-mismatch' })
  })

  it('#8 值之后还有别的字符 ⇒ 第 3 级读不下来；前后只许 JSON 的四种空白', () => {
    expect(read(`${ENVELOPE} {}`)).toEqual({ kind: 'unreadable', level: 3 })
    expect(read(` \t\r\n${ENVELOPE}\n`).kind).toBe('value')
    expect(read(` ${ENVELOPE}`)).toEqual({ kind: 'unreadable', level: 3 })
  })

  it('第 1、2 级对整个请求体先判：非法 UTF-8 在后、超深嵌套在前 ⇒ 仍是第 1 级读不下来（V-11）', () => {
    expect(read(bytes('['.repeat(100), [0xff]))).toEqual({ kind: 'unreadable', level: 1 })
  })
})

describe('S-7 JSON 值的读法', () => {
  it('#18 成员名与字符串按转义还原后比较：\\/ 还原为 /', () => {
    expect(read('{"operation":"composition.governance-center-entry\\/v1#S-18"}')).toMatchObject({
      value: { operation: 'composition.governance-center-entry/v1#S-18' },
    })
    expect(read('{"\\u006fperation":1}')).toMatchObject({ value: { operation: 1 } })
  })

  it('不做 Unicode 规范化：é 的两种写法是两个不同的名字', () => {
    const reading = read('{"\\u00e9":1,"e\\u0301":2}')
    expect(reading).toMatchObject({ kind: 'value', duplicates: [] })
  })

  it('#15 9007199254740990.5 不是整数；#16 1e3 是 1000；1.0 是 1；越过 2⁵³−1 的整数不被舍入回范围内', () => {
    expect(jsonNumberValue('9007199254740990.5')).toBeNaN()
    expect(jsonNumberValue('1e3')).toBe(1000)
    expect(jsonNumberValue('1.0')).toBe(1)
    expect(jsonNumberValue('1.5')).toBeNaN()
    expect(jsonNumberValue('9007199254740991')).toBe(9007199254740991)
    expect(jsonNumberValue('9007199254740992')).toBeGreaterThan(Number.MAX_SAFE_INTEGER)
    expect(jsonNumberValue('-9007199254740992')).toBeLessThan(-Number.MAX_SAFE_INTEGER)
    expect(jsonNumberValue('1e400')).toBeGreaterThan(Number.MAX_SAFE_INTEGER)
    expect(jsonNumberValue('12e-1')).toBeNaN()
    expect(jsonNumberValue('120e-1')).toBe(12)
    expect(jsonNumberValue('-0')).toBe(0)
    expect(jsonNumberValue('0.000')).toBe(0)
  })

  it('JSON 数的语法错：前导零、孤立负号、小数点后无数字 ⇒ 第 3 级读不下来', () => {
    for (const text of ['01', '-', '1.', '.5', '+1', '1e', 'NaN', 'Infinity']) {
      expect(read(`[${text}]`)).toEqual({ kind: 'unreadable', level: 3 })
    }
  })

  it('字符串里的控制字符与未知转义 ⇒ 读不下来', () => {
    expect(read('"a\u0001b"')).toEqual({ kind: 'unreadable', level: 3 })
    expect(read('"\\x41"')).toEqual({ kind: 'unreadable', level: 3 })
    expect(read('"\\u12G4"')).toEqual({ kind: 'unreadable', level: 3 })
  })

  it('成员名 __proto__ 是普通的自有成员，不碰原型', () => {
    const reading = read('{"__proto__":{"polluted":true}}')
    expect(reading.kind).toBe('value')
    if (reading.kind !== 'value') return
    const value = reading.value
    expect(Object.hasOwn(value as object, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
  })
})

describe('S-8 重复成员：报告每一处，不取其一（examples §6 #9～#14、#17、#19）', () => {
  it('#9 顶层 protocolVersion 重复（值相同也报）', () => {
    expect(
      read(`{"protocolVersion":"2","protocolVersion":"2","operation":${R27},"payload":{}}`),
    ).toMatchObject({
      duplicates: [{ path: [], name: 'protocolVersion' }],
    })
  })

  it('#10 以转义写出的第二个 operation 还原后就是 operation', () => {
    expect(read(`{"operation":${R27},"\\u006f\\u0070eration":${R27}}`)).toMatchObject({
      duplicates: [{ path: [], name: 'operation' }],
    })
  })

  it('#11 两个出示物；#13 两个 payload', () => {
    expect(read(`{"presentedLoginState":${P},"presentedLoginState":"Q"}`)).toMatchObject({
      duplicates: [{ path: [], name: 'presentedLoginState' }],
    })
    expect(read('{"payload":{},"payload":{}}')).toMatchObject({
      duplicates: [{ path: [], name: 'payload' }],
    })
  })

  it('#14 载荷里面的重复报出路径 ["payload"]；更深处报出完整路径（成员名与数组下标）', () => {
    expect(read('{"payload":{"role":"member","role":"superAdministrator"}}')).toMatchObject({
      duplicates: [{ path: ['payload'], name: 'role' }],
    })
    expect(read('{"payload":{"organizations":[{"a":1,"a":2}]}}')).toMatchObject({
      duplicates: [{ path: ['payload', 'organizations', 0], name: 'a' }],
    })
  })

  it('#17、#19 公开体检请求里的其余重复也报（由调用方决定看不看）；三处重复报三处', () => {
    expect(read('{"operation":"x","x":1,"x":2}')).toMatchObject({
      duplicates: [{ path: [], name: 'x' }],
    })
    expect(read('{"a":1,"a":2,"a":3}')).toMatchObject({
      duplicates: [
        { path: [], name: 'a' },
        { path: [], name: 'a' },
      ],
    })
  })

  it('保留的是第一次出现的值，只供排在前面的步骤照常进行（S-8 不取其一由调用方据重复报告兑现）', () => {
    expect(read('{"a":1,"a":2}')).toMatchObject({ value: { a: 1 } })
  })

  it('只用 JSON.parse 的实现会丢掉重复：同一份文本 JSON.parse 取后一个且无从报告（本读取器的存在理由）', () => {
    expect(JSON.parse('{"a":1,"a":2}')).toEqual({ a: 2 })
    expect(read('{"a":1,"a":2}')).toMatchObject({ duplicates: [{ path: [], name: 'a' }] })
  })
})

describe('嵌套深度与成员数两个上界（S-7 表下、S-10；V-11）', () => {
  const nested = (depth: number) => '['.repeat(depth) + ']'.repeat(depth)
  const members = (count: number) =>
    `{${Array.from({ length: count }, (_, i) => `"m${String(i)}":0`).join(',')}}`

  it('恰在下限上：嵌套 64 层、一个对象 1024 个成员 ⇒ 读下来', () => {
    expect(read(nested(64)).kind).toBe('value')
    expect(read(members(1024)).kind).toBe('value')
  })

  it('上界 + 1：嵌套 65 层、1025 个成员（同名也计）⇒ 超界', () => {
    expect(read(nested(65))).toEqual({ kind: 'exceeds-limit' })
    expect(read(members(1025))).toEqual({ kind: 'exceeds-limit' })
    expect(read(`{${Array.from({ length: 1025 }, () => '"same":0').join(',')}}`)).toEqual({
      kind: 'exceeds-limit',
    })
  })

  it('超界在前 ⇒ 超界，哪怕之后有语法错', () => {
    expect(read(`${'['.repeat(65)}x`)).toEqual({ kind: 'exceeds-limit' })
    expect(read(`${members(1025).slice(0, -1)},}`)).toEqual({ kind: 'exceeds-limit' })
  })

  it('语法错在前 ⇒ 读不下来，哪怕之后有超界', () => {
    expect(read(`[x${'['.repeat(100)}`)).toEqual({ kind: 'unreadable', level: 3 })
  })

  it('ccd39d9：语法错那个码点不计入深度——64 层之内的 `1` 之后紧跟 `[` 是语法错，不是第 65 层', () => {
    expect(read(`${'['.repeat(64)}1[`)).toEqual({ kind: 'unreadable', level: 3 })
  })

  it('ccd39d9：语法错那个码点不计入成员数——第 1024 个成员之后缺逗号就开始的名字是语法错，不是第 1025 个成员', () => {
    expect(read(`${members(1024).slice(0, -1)} "late":0}`)).toEqual({
      kind: 'unreadable',
      level: 3,
    })
  })
})
