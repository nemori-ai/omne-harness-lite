// 回路目录：趋势、草稿、卡片台账与体检页都落在这里。在工作树里跑也落主检出，工作树退役不带走。
import { join, resolve } from 'node:path'

export function loopHome(mainRoot: string, env: NodeJS.ProcessEnv): string {
  return resolve(env['OMNE_METRICS_HOME'] ?? join(mainRoot, 'tmp', 'clean-loop'))
}
