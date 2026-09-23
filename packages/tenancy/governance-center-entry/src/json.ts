// 严格的 RFC 8259 读取器（施工计划 I-6；契约 https-json/1 S-7「请求体怎样读成信封」、S-8「重复成员」）。
// 为什么不用 JSON.parse：它静默取重复成员的后一个、会跳过……不会跳过 BOM 但 TextDecoder 会，且把数先舍入到双精度。
//
// 读法按 S-7 的四级，本模块做前三级（第 4 级「顶层是对象」由调用方判）：
//   1 字节 → 字符：UTF-8 严格解码（非法序列、超长编码、代理码点的编码、超过 U+10FFFF 都解不了，不以 U+FFFD 顶替）；
//   2 BOM：以 U+FEFF 开头算解不了，不跳过；
//   3 字符 → JSON：恰一份 JSON text，前后只许 JSON 的四种空白。
// 第 1、2 级对整个请求体判完才进第 3 级；第 3 级从左到右读，同时判嵌套深度与对象成员数两个上界：
// 深度在读到使深度超界的 `{`／`[` 时判，成员数在读到超界那个成员名的起始 `"` 时判——这两个字符此处都是合法续写，
// 所以它们必落在「仍是某个 JSON text 前缀」的最长前缀之内；语法错的位置是那个前缀之后的第一个码点。
// 于是「语法错在前 ⇒ 读不下来；超界在前 ⇒ 超界」就是读取器自然的先后。

export interface JsonLimits {
  /** 顶层的对象或数组是第 1 层。 */
  readonly depth: number
  /** 任何一个对象的成员个数，同名成员出现几次计几个。 */
  readonly members: number
}

/** 一处重复：`path` 是那个对象在文档里的位置（成员名与数组下标），`name` 是按转义还原后的成员名。 */
export interface DuplicateMember {
  readonly path: readonly (string | number)[]
  readonly name: string
}

export type JsonReading =
  /**
   * 读下来了。对象里同名成员只保留第一次出现的值，其余每一处都报在 `duplicates`——**调用方不得据保留的那个值
   * 判那个成员**（S-8：不取其一），它只让排在前面的判定步骤照常进行。
   * 数的取值见 {@link jsonNumberValue}。
   */
  | {
      readonly kind: 'value'
      readonly value: unknown
      readonly duplicates: readonly DuplicateMember[]
    }
  | { readonly kind: 'unreadable'; readonly level: 1 | 2 | 3 }
  | { readonly kind: 'exceeds-limit' }

class SyntaxFault extends Error {}
class LimitExceeded extends Error {}

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y
const NUMBER_PARTS = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/
const HEX4 = /^[0-9A-Fa-f]{4}$/
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
/** 越过安全整数范围的整数一律取这个量级（带号）：它与原值同号、同样越过 2⁵³−1，是整数。 */
const BEYOND_SAFE = 2 ** 53

export function readJsonText(bytes: Uint8Array, limits: JsonLimits): JsonReading {
  let text: string
  try {
    text = decoder.decode(bytes)
  } catch {
    return { kind: 'unreadable', level: 1 }
  }
  if (text.charCodeAt(0) === 0xfeff) return { kind: 'unreadable', level: 2 }
  const reader = new Reader(text, limits)
  try {
    const value = reader.document()
    return { kind: 'value', value, duplicates: reader.duplicates }
  } catch (error) {
    if (error instanceof LimitExceeded) return { kind: 'exceeds-limit' }
    if (error instanceof SyntaxFault) return { kind: 'unreadable', level: 3 }
    throw error
  }
}

/**
 * JSON 数的取值（S-7「数按 JSON 文本所写的精确数值判」）。精确值由文本直接判，不先舍入：
 * - 精确值是安全整数 ⇒ 就是那个整数；
 * - 精确值是整数但越过 ±(2⁵³−1) ⇒ ±2⁵³（同号、同样越界、仍是整数——线上唯一的整数项 `offerTtl` 只约束
 *   「是整数且不大于 2⁵³−1」，大正数照样被拒，大负数照样合形、交给领域判非正）；
 * - 精确值不是整数 ⇒ `NaN`（任何 Schema 的 integer 都不收它；信封与载荷里没有非整数的数位置）。
 * 例：`1.0`、`1e3` 是 1、1000；`9007199254740990.5` 不是整数；`9007199254740992` 越界。
 */
export function jsonNumberValue(literal: string): number {
  const parts = NUMBER_PARTS.exec(literal)
  if (parts === null) throw new SyntaxFault()
  const negative = parts[1] === '-'
  const integer = parts[2] ?? ''
  const fraction = parts[3] ?? ''
  const exponent = Number(parts[4] ?? '0')
  let digits = (integer + fraction).replace(/^0+/, '')
  if (digits === '') return 0
  let scale = exponent - fraction.length
  const trimmed = digits.replace(/0+$/, '')
  scale += digits.length - trimmed.length
  digits = trimmed
  if (scale < 0) return Number.NaN
  if (digits.length + scale > 16) return negative ? -BEYOND_SAFE : BEYOND_SAFE
  const magnitude = BigInt(digits) * 10n ** BigInt(scale)
  if (magnitude > MAX_SAFE) return negative ? -BEYOND_SAFE : BEYOND_SAFE
  const value = Number(magnitude)
  return negative ? -value : value
}

function isJsonWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
}

class Reader {
  readonly duplicates: DuplicateMember[] = []
  readonly #text: string
  readonly #limits: JsonLimits
  #pos = 0
  #depth = 0

  constructor(text: string, limits: JsonLimits) {
    this.#text = text
    this.#limits = limits
  }

  document(): unknown {
    this.#skipWhitespace()
    const value = this.#value([])
    this.#skipWhitespace()
    if (this.#pos !== this.#text.length) throw new SyntaxFault()
    return value
  }

  #skipWhitespace(): void {
    while (this.#pos < this.#text.length && isJsonWhitespace(this.#text.charCodeAt(this.#pos))) {
      this.#pos += 1
    }
  }

  #expect(char: string): void {
    if (this.#text[this.#pos] !== char) throw new SyntaxFault()
    this.#pos += 1
  }

  #value(path: readonly (string | number)[]): unknown {
    const char = this.#text[this.#pos]
    switch (char) {
      case '{':
        return this.#object(path)
      case '[':
        return this.#array(path)
      case '"':
        return this.#string()
      case 't':
        return this.#literal('true', true)
      case 'f':
        return this.#literal('false', false)
      case 'n':
        return this.#literal('null', null)
      default:
        if (char === '-' || (char !== undefined && char >= '0' && char <= '9'))
          return this.#number()
        throw new SyntaxFault()
    }
  }

  #enter(): void {
    this.#depth += 1
    if (this.#depth > this.#limits.depth) throw new LimitExceeded()
    this.#pos += 1
  }

  #object(path: readonly (string | number)[]): Record<string, unknown> {
    this.#enter()
    const object: Record<string, unknown> = {}
    const seen = new Set<string>()
    let members = 0
    this.#skipWhitespace()
    if (this.#text[this.#pos] === '}') {
      this.#pos += 1
      this.#depth -= 1
      return object
    }
    for (;;) {
      if (this.#text[this.#pos] !== '"') throw new SyntaxFault()
      members += 1
      if (members > this.#limits.members) throw new LimitExceeded()
      const name = this.#string()
      this.#skipWhitespace()
      this.#expect(':')
      this.#skipWhitespace()
      const value = this.#value([...path, name])
      if (seen.has(name)) {
        this.duplicates.push({ path, name })
      } else {
        seen.add(name)
        // 定义为自有数据属性：成员名 `__proto__` 不碰原型
        Object.defineProperty(object, name, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        })
      }
      this.#skipWhitespace()
      const next = this.#text[this.#pos]
      this.#pos += 1
      if (next === '}') break
      if (next !== ',') throw new SyntaxFault()
      this.#skipWhitespace()
    }
    this.#depth -= 1
    return object
  }

  #array(path: readonly (string | number)[]): unknown[] {
    this.#enter()
    const array: unknown[] = []
    this.#skipWhitespace()
    if (this.#text[this.#pos] === ']') {
      this.#pos += 1
      this.#depth -= 1
      return array
    }
    for (;;) {
      array.push(this.#value([...path, array.length]))
      this.#skipWhitespace()
      const next = this.#text[this.#pos]
      this.#pos += 1
      if (next === ']') break
      if (next !== ',') throw new SyntaxFault()
      this.#skipWhitespace()
    }
    this.#depth -= 1
    return array
  }

  #literal<T>(word: string, value: T): T {
    if (!this.#text.startsWith(word, this.#pos)) throw new SyntaxFault()
    this.#pos += word.length
    return value
  }

  #number(): number {
    NUMBER.lastIndex = this.#pos
    const match = NUMBER.exec(this.#text)
    if (match === null) throw new SyntaxFault()
    this.#pos += match[0].length
    return jsonNumberValue(match[0])
  }

  /** 转义还原后的码点序列；`\uD800` 一类转义写出的孤立代理码点照常进字符串（S-7），由它所属那一步判。 */
  #string(): string {
    this.#pos += 1
    const text = this.#text
    let result = ''
    let runStart = this.#pos
    for (;;) {
      const code = text.charCodeAt(this.#pos)
      if (Number.isNaN(code) || code < 0x20) throw new SyntaxFault()
      if (code === 0x22) {
        result += text.slice(runStart, this.#pos)
        this.#pos += 1
        return result
      }
      if (code !== 0x5c) {
        this.#pos += 1
        continue
      }
      result += text.slice(runStart, this.#pos)
      const escape = text[this.#pos + 1]
      this.#pos += 2
      switch (escape) {
        case '"':
        case '\\':
        case '/':
          result += escape
          break
        case 'b':
          result += '\b'
          break
        case 'f':
          result += '\f'
          break
        case 'n':
          result += '\n'
          break
        case 'r':
          result += '\r'
          break
        case 't':
          result += '\t'
          break
        case 'u': {
          const hex = text.slice(this.#pos, this.#pos + 4)
          if (!HEX4.test(hex)) throw new SyntaxFault()
          result += String.fromCharCode(Number.parseInt(hex, 16))
          this.#pos += 4
          break
        }
        default:
          throw new SyntaxFault()
      }
      runStart = this.#pos
    }
  }
}
