/**
 * 表示层解析的结果（data.identity-values/v1#S-33）。
 *
 * 表示非法的输入在进入任何判定之前被拒绝，拒绝以返回值到达调用方——不抛异常，
 * 抛出的异常是一条调用方可以不接的带外通道。`invalidInput` 不是判定结果。
 */
export type Parsed<T> = { readonly ok: T } | { readonly invalidInput: string }

export function ok<T>(value: T): Parsed<T> {
  return { ok: value }
}

export function invalidInput<T = never>(reason: string): Parsed<T> {
  return { invalidInput: reason }
}

export function isOk<T>(parsed: Parsed<T>): parsed is { readonly ok: T } {
  return 'ok' in parsed
}

/** 只在调用方已经知道输入合法（例如来自存储）时使用；否则请分支处理。 */
export function unwrap<T>(parsed: Parsed<T>): T {
  if (isOk(parsed)) return parsed.ok
  throw new Error(`invalid input: ${parsed.invalidInput}`)
}
