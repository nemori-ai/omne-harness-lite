import { isTestPath, scanLines, type Rule } from '@omne-harness/repo-toolchain/core/rule'

export const noBailControl: Rule = {
  id: 'no-bail-control',
  source: 'basis/cordis/async-control-not-bail · realization/AGENTS.md 红线',
  description: '产品源码里不得调用 ctx.bail(；异步控制走 serial',
  check(files) {
    return scanLines(this, files, /\.bail\(/, '调用了 bail 派发；控制判定须走 serial', path =>
      isTestPath(path),
    )
  },
}
