import type { Rule, Violation } from '../core/rule.ts'
import {
  ACCOUNT_IDENTITY_PLUGIN_MODULE,
  ACCOUNT_IDENTITY_RANDOM_MODULE,
  ACCOUNT_IDENTITY_SRC,
  productSourceIn,
} from '../layout.ts'
import { codeMatches, lineAt, viewsOf } from '../core/source-text.ts'

/** 生产路径的随机源（出示物模块导出的那一个）；插件体要么不传，要么传的就是它。 */
const PRODUCTION_SOURCE = 'cryptoRandomSource'

/**
 * AI verification S-45「熵下限」行的两条文本规则（AI design「随机源的故障怎么注入」：生产代码里唯一的可替换点由文本规则守）：
 * ① 账号能力包源码不出现 `Math.random`；`node:crypto` 的随机函数（`randomBytes` 等）只在出示物模块出现。
 * ② 插件体构造服务实现类时不传别的随机源：插件体模块里 `random:` 的值只能是出示物模块导出的 `cryptoRandomSource`，
 *    简写 `{ random }` 判不出值，一并报出。插件体模块缺席而包存在 ⇒ 布局偏离，报出（② 会静默失效）。
 */
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
          // 类型位置（`random: RandomSource`）不是传参；只看对象字面量里的值
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
