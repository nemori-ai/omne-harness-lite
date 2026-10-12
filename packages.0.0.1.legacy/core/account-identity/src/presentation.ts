import {
  type Branded,
  type Parsed,
  invalidInput,
  isOk,
  ok,
  parseOpaqueIdentifier,
} from '@omne-harness-lite/identity-values'
export type LoginStatePresentation = Branded<string, 'LoginStatePresentation'>
export const MAX_PRESENTATION_SCALAR_VALUES = 1024

/**
 * S-45 交换表示的全部四条：非空、首末不在 IV S-31 的空白码点集合里（与不透明标识同一个函数）、
 * 不含孤立代理码点、至多 1024 个 Unicode 标量值。只看形状，不解析内容；拒绝理由不带输入值。
 * 入口层判出示物的表示层用的就是这一个函数（S-44 第 1 步）。
 */
export function parseLoginStatePresentation(value: unknown): Parsed<LoginStatePresentation> {
  const opaque = parseOpaqueIdentifier(value, 'LoginStatePresentation')
  if (!isOk(opaque)) return invalidInput(opaque.invalidInput)
  const text: string = opaque.ok
  if (!text.isWellFormed()) return invalidInput('LoginStatePresentation: lone surrogate')
  // 每个标量值至多两个 UTF-16 码元：码元数超过两倍上界时不必逐个数
  if (
    text.length > 2 * MAX_PRESENTATION_SCALAR_VALUES ||
    Array.from(text).length > MAX_PRESENTATION_SCALAR_VALUES
  ) {
    return invalidInput('LoginStatePresentation: too long')
  }
  return ok(text as LoginStatePresentation)
}
