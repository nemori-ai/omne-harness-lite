// 无运行时依赖：收工钩子主进程也用它，不能带进 TypeScript 解析器（function-baseline.ts 只在子进程加载）。
import type { FunctionRow } from '../metrics/report.ts'

export type AgainstBase =
  | { readonly kind: 'worse'; readonly baseline: number }
  | { readonly kind: 'not-worse'; readonly baseline: number }
  | { readonly kind: 'new'; readonly reason: 'new-file' | 'new-function' }
  | { readonly kind: 'unsure'; readonly reason: string }

export type ExplainedFunction = FunctionRow & { readonly againstBase: AgainstBase }

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
