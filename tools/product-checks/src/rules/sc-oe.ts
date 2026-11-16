import { isTestPath, type Rule, type Violation } from '@omne-harness/repo-toolchain/core/rule'
import { OFFER_EXPIRY } from '../layout.ts'
import {
  codeMatches,
  lineAt,
  matchClose,
  namedFunctionBodies,
  viewsOf,
} from '@omne-harness/repo-toolchain/core/source-text'

const consumerSource = (path: string) => !isTestPath(path) && !path.startsWith(OFFER_EXPIRY)

export const scOe1: Rule = {
  id: 'sc-oe-1',
  source: 'data.offer-expiry v1 S-7 · offer-expiry 节点 SC-OE-1',
  description: '消费者包里名为 *Record／*Row／*Table 的记录类型不以 OfferState 为字段类型',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (!consumerSource(file.path)) continue
      const views = viewsOf(file)
      const decl =
        /\b(?:interface\s+([\w$]*(?:Record|Row|Table))\b[^{]*|type\s+([\w$]*(?:Record|Row|Table))\b[^=]*=[^{;]*)\{/
      for (const m of codeMatches(views, decl)) {
        const open = m.index + m[0].length - 1
        const close = matchClose(views.skeleton, open)
        if (close === -1) continue
        const body = views.code.slice(open, close)
        for (const field of body.matchAll(/\bOfferState\b/g)) {
          out.push({
            rule: this.id,
            path: file.path,
            line: lineAt(file.text, open + (field.index ?? 0)),
            message: `持久记录类型 ${m[1] ?? m[2]} 以 OfferState 为字段类型；存储里只许 SettledState | null（expired 是读时派生的，不存）`,
          })
        }
      }
    }
    return out
  },
}

const OFFER_STATE_COMPARISON =
  /(?:===|!==|==|!=)\s*['"](?:pending|accepted|withdrawn|expired)['"]|['"](?:pending|accepted|withdrawn|expired)['"]\s*(?:===|!==|==|!=)|\bcase\s+['"](?:pending|accepted|withdrawn|expired)['"]/

export const scOe2: Rule = {
  id: 'sc-oe-2',
  source: 'data.offer-expiry v1 S-13 · offer-expiry 节点 SC-OE-2',
  description:
    '消费者的接受路径（accept* 函数体）里不对 pending/accepted/withdrawn/expired 逐值比较，只经 acceptable()',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (!consumerSource(file.path)) continue
      const views = viewsOf(file)
      const bodies = namedFunctionBodies(file).filter(f => /^accept[A-Z]/.test(f.name))
      if (bodies.length === 0) continue
      for (const m of codeMatches(views, OFFER_STATE_COMPARISON)) {
        const owner = bodies.find(b => b.open < m.index && m.index < b.close)
        if (owner === undefined) continue
        out.push({
          rule: this.id,
          path: file.path,
          line: lineAt(file.text, m.index),
          message: `接受路径 ${owner.name} 对派生状态逐值比较（${m[0].trim()}）；三种来路只许经 acceptable() 折成一个拒绝值`,
        })
      }
    }
    return out
  },
}
