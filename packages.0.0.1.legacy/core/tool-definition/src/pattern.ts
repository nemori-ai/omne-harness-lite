import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp'
import type { AST } from '@eslint-community/regexpp'

export const PATTERN_MAX_CODE_POINTS = 1024
export const PATTERN_MAX_FINITE_COUNT = 1000
export function patternFlags(pattern: string): '' | 'u' | undefined {
  try {
    new RegExp(pattern)
    return ''
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }
  try {
    new RegExp(pattern, 'u')
    return 'u'
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }
  return undefined
}
export function unsupportedPattern(pattern: string): string | undefined {
  const flags = patternFlags(pattern)
  if (flags === undefined) return 'U-1'
  if (Array.from(pattern).length > PATTERN_MAX_CODE_POINTS) return 'U-2'
  let root: AST.Pattern
  try {
    root = new RegExpParser({ ecmaVersion: 2025, strict: false }).parsePattern(
      pattern,
      0,
      pattern.length,
      { unicode: flags === 'u' },
    )
  } catch (error) {
    if (error instanceof SyntaxError) return 'U-7'
    throw error
  }
  let nested = false
  let backreference = false
  let count = false
  let unboundedDepth = 0
  visitRegExpAST(root, {
    onQuantifierEnter(node) {
      if (Number.isFinite(node.max) && node.max > PATTERN_MAX_FINITE_COUNT) count = true
      if (node.max !== Infinity) return
      if (unboundedDepth > 0) nested = true
      unboundedDepth++
    },
    onQuantifierLeave(node) {
      if (node.max === Infinity) unboundedDepth--
    },
    onBackreferenceEnter() {
      backreference = true
    },
  })
  return nested ? 'U-3' : backreference ? 'U-4' : count ? 'U-5' : undefined
}
