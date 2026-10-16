import { isTestPath, type Rule, type Violation } from '../core/rule.ts'
import { OFFER_EXPIRY } from '../layout.ts'
import { codeMatches, lineAt, matchClose, namedFunctionBodies, viewsOf } from '../core/source-text.ts'

const consumerSource = (path: string) => !isTestPath(path) && !path.startsWith(OFFER_EXPIRY)

/**
 * SC-OE-1（offer-expiry 节点 design「静态检查义务怎么承载」；契约 S-7「`expired` 不得被写成存储字段」）：
 * 消费者包内的持久记录类型不得以 `OfferState` 为字段类型，只允许 `SettledState | null`。
 * 文本规则按名字认持久记录类型：名字以 `Record`、`Row` 或 `Table` 结尾的 interface 与对象类型别名
 * （现有消费者的存储行与领域记录都这样命名）；读面的返回类型（如 `InvitationReading`）不在此列。
 */
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

/** 派生状态的四个值；与之逐值比较就绕过了 `acceptable()`。 */
const OFFER_STATE_COMPARISON =
  /(?:===|!==|==|!=)\s*['"](?:pending|accepted|withdrawn|expired)['"]|['"](?:pending|accepted|withdrawn|expired)['"]\s*(?:===|!==|==|!=)|\bcase\s+['"](?:pending|accepted|withdrawn|expired)['"]/

/**
 * SC-OE-2（offer-expiry 节点 design；契约 S-13「接受路径上三种来路给同一个拒绝值」）：
 * 消费者的接受路径不得对 `OfferState` 逐值比较后映射出多于一个失败值，只许经 `acceptable()`。
 * 文本规则认接受路径：名为 `accept` 后接大写字母（`acceptInvitation`、`acceptAffiliationRequest`…；不含 `acceptable`）
 * 的函数、方法与赋给这个名字的箭头函数的块体；块体里与四个派生状态字面量的 `===`／`!==`／`case` 比较一律报出
 * （比较 `'unavailable'` 不是派生状态，不在此列）。撤回路径合法地按状态分派，不在检查范围。
 */
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
