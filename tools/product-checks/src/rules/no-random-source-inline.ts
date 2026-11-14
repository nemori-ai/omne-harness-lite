import type { Rule, Violation } from '@omne-harness/repo-toolchain/core/rule'
import {
  ACCOUNT_IDENTITY_PLUGIN_MODULE,
  ACCOUNT_IDENTITY_RANDOM_MODULE,
  ACCOUNT_IDENTITY_SRC,
  productSourceIn,
} from '../layout.ts'
import { codeMatches, lineAt, viewsOf } from '@omne-harness/repo-toolchain/core/source-text'

const PRODUCTION_SOURCE = 'cryptoRandomSource'

export const noRandomSourceInline: Rule = {
  id: 'no-random-source-inline',
  source:
    'capability.account-identity v2 S-45（熵下限）· account-identity 节点 verification 两条文本规则',
  description:
    '账号能力包源码不出现 Math.random；crypto 随机函数只在 src/presentation.ts；插件体只传 cryptoRandomSource',
  check(files) {
    const out: Violation[] = []
    const aiFiles = files.filter(f => productSourceIn(f.path, ACCOUNT_IDENTITY_SRC))
    if (aiFiles.length === 0) return out
    if (!aiFiles.some(f => f.path === ACCOUNT_IDENTITY_PLUGIN_MODULE)) {
      out.push({
        rule: this.id,
        path: ACCOUNT_IDENTITY_SRC,
        line: 0,
        message: `账号能力包缺插件体模块 ${ACCOUNT_IDENTITY_PLUGIN_MODULE}：布局偏离，「插件体不传别的随机源」一条失效`,
      })
    }
    for (const file of aiFiles) {
      const views = viewsOf(file)
      const push = (index: number, message: string) =>
        out.push({ rule: this.id, path: file.path, line: lineAt(file.text, index), message })
      for (const m of codeMatches(views, /\bMath\s*\.\s*random\b/)) {
        push(m.index, '出现了 Math.random；出示物的随机源只能是 node:crypto，不退化为更低熵的来源')
      }
      if (file.path !== ACCOUNT_IDENTITY_RANDOM_MODULE) {
        for (const m of codeMatches(
          views,
          /\b(?:randomBytes|randomFill|randomFillSync|randomInt|randomUUID|getRandomValues)\b/,
        )) {
          push(
            m.index,
            `${m[0]} 出现在出示物模块之外；随机源只经参数注入，生产路径的源只在 ${ACCOUNT_IDENTITY_RANDOM_MODULE}`,
          )
        }
      }
      if (file.path === ACCOUNT_IDENTITY_PLUGIN_MODULE) {
        for (const m of codeMatches(views, /(?<![\w$.])random\s*:\s*([^,}\n]*)/)) {
          const value = (m[1] ?? '').trim()
          if (value === PRODUCTION_SOURCE || value === 'RandomSource') continue
          push(
            m.index,
            `插件体传了随机源 ${value}；插件体构造实现类时不传别的随机源，生产路径恒为 ${PRODUCTION_SOURCE}`,
          )
        }
        for (const m of codeMatches(views, /[{,]\s*random\s*[,}]/)) {
          push(m.index, '插件体以简写 { random } 传了随机源，判不出它是不是 cryptoRandomSource')
        }
      }
    }
    return out
  },
}
