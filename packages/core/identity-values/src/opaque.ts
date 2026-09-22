import { type Parsed, invalidInput, ok } from './parsed.ts'

/**
 * 不透明标识的交换表示（data.identity-values/v1#S-31）：非空字符串，首尾不属于下列显式空白码点集合，
 * 相等是逐码点精确相等——不做 Unicode 规范化、不折叠大小写、不裁剪。
 *
 * 集合与 Schema 的 pattern 逐字对应；不用 `\s`（引擎间集合不同），不用 `$`（Python 会匹配到末尾换行之前）。
 */
const WHITESPACE_CODE_POINTS: ReadonlySet<number> = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x1680, 0x2000, 0x2001, 0x2002,
  0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f,
  0x3000, 0xfeff,
])

declare const brand: unique symbol

/** 品牌类型：不同种类的标识在编译期互不相容（S-2：登录标识不是 AccountId）。 */
export type Branded<T, B extends string> = T & { readonly [brand]: B }

export type OpaqueIdentifier<B extends string> = Branded<string, B>

function firstCodePoint(text: string): number {
  return text.codePointAt(0) ?? -1
}

function lastCodePoint(text: string): number {
  const chars = Array.from(text)
  const last = chars[chars.length - 1]
  return last === undefined ? -1 : (last.codePointAt(0) ?? -1)
}

/**
 * S-31 的词法校验：只看形状，不解析内容。
 * 返回 `invalidInput` 的三种情形：不是字符串、空串、首或尾码点属于空白集合。
 */
export function parseOpaqueIdentifier<B extends string>(
  value: unknown,
  kind: B,
): Parsed<OpaqueIdentifier<B>> {
  if (typeof value !== 'string') return invalidInput(`${kind}: not a string`)
  if (value.length === 0) return invalidInput(`${kind}: empty`)
  if (WHITESPACE_CODE_POINTS.has(firstCodePoint(value))) {
    return invalidInput(`${kind}: leading whitespace`)
  }
  if (WHITESPACE_CODE_POINTS.has(lastCodePoint(value))) {
    return invalidInput(`${kind}: trailing whitespace`)
  }
  return ok(value as OpaqueIdentifier<B>)
}

/** 逐码点精确相等（S-31）。字符串的 `===` 在 JS 里就是码元序列相等，等价于码点序列相等。 */
export function opaqueIdentifierEquals<B extends string>(
  a: OpaqueIdentifier<B>,
  b: OpaqueIdentifier<B>,
): boolean {
  return a === b
}
