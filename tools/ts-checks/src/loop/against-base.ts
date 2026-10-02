// 「要解释的函数」与基线比的结果与它的说明文字。没有运行时依赖：收工钩子的主线程也用它，
// 不能因此带进 TypeScript 解析器（算基线复杂度的部分在 function-baseline.ts，只在量读数的线程里加载）。
import type { FunctionRow } from '../metrics/report.ts'

/** 一个函数与基线比的结果。 */
export type AgainstBase =
  | { readonly kind: 'worse'; readonly baseline: number }
  | { readonly kind: 'not-worse'; readonly baseline: number }
  | { readonly kind: 'new'; readonly reason: 'new-file' | 'new-function' }
  | { readonly kind: 'unsure'; readonly reason: string }

export type ExplainedFunction = FunctionRow & { readonly againstBase: AgainstBase }

/** 跟在函数那一行后面的说明：「原 N → 现 M」、「新出现」或拿不准的原因。 */
export function describeAgainstBase(row: ExplainedFunction): string {
  const against = row.againstBase
  switch (against.kind) {
    case 'worse':
    case 'not-worse':
      return `原 ${against.baseline} → 现 ${row.complexity}`
    case 'new':
      return against.reason === 'new-file' ? '新出现（新文件）' : '新出现'
    case 'unsure':
      return `拿不准，照列：${against.reason}`
  }
}
