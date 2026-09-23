import type { Rule, SourceFile, Violation } from '../rule.ts'
import { ACCOUNT_IDENTITY_SRC, productSourceIn } from '../layout.ts'
import { codeMatches, lineAt, matchClose, viewsOf } from '../source-text.ts'

/**
 * 诊断输出的调用：日志方法（Cordis logger 与本包 `diagnostics` 外观的同名方法）、事件派发、错误构造。
 * 文本规则不知道接收者的类型，所以按方法名认。
 */
const DIAGNOSTIC_CALL =
  /\.\s*(?:info|warn|error|debug|success|emit|parallel|serial)\s*\(|\bnew\s+[\w$]*Error\s*\(|\bdefect\s*\(/

/**
 * AI verification「出示物不作诊断输出的实参」（包内规则 `no-presentation-in-diagnostics`）、
 * AI design v2 S-45 行「出示物只交到调用方手里、不进事件载荷、日志与错误说明」：
 * 账号能力包源码里，上述调用的实参列表（含其中的模板字符串插值）不得出现出示物——可判的写法是：
 * 名为 `presentation` 的标识符、`LoginStatePresentation` 字样、本文件里标注为 `LoginStatePresentation`
 * 类型的名字、由 `generatePresentation(`／`parseLoginStatePresentation(` 直接赋值得来的名字。
 * 判不了的（经别的变量转手、经辅助函数拼进消息）写在 README「不覆盖」，由 S-46 ② 的动态翻查兜底。
 */
export const noPresentationInDiagnostics: Rule = {
  id: 'no-presentation-in-diagnostics',
  source:
    'capability.account-identity v2 S-45／S-46 · account-identity 节点 verification「出示物不作诊断输出的实参」',
  description:
    '账号能力包源码里日志、emit、new Error(、defect( 的实参不出现出示物（presentation、LoginStatePresentation 类型的名字）',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (!productSourceIn(file.path, ACCOUNT_IDENTITY_SRC)) continue
      out.push(...checkFile(this.id, file))
    }
    return out
  },
}

function checkFile(rule: string, file: SourceFile): Violation[] {
  const views = viewsOf(file)
  // 本文件里持有出示物的局部名字（只按裸名认，`x.名字` 是别的对象的成员）
  const locals = new Set<string>()
  for (const m of views.code.matchAll(
    /([\w$]+)\s*\??\s*:\s*(?:[\w$<>|\s]*\|\s*)?LoginStatePresentation\b/g,
  )) {
    if (m[1] !== undefined) locals.add(m[1])
  }
  for (const m of views.code.matchAll(
    /\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:await\s+)?(?:generatePresentation|parseLoginStatePresentation)\s*\(/g,
  )) {
    if (m[1] !== undefined) locals.add(m[1])
  }
  // `presentation` 作裸名、作成员（`issued.presentation`）或作对象键都算
  const always = '(?<![\\w$])(presentation|LoginStatePresentation)(?![\\w$])'
  const mention = new RegExp(
    locals.size === 0 ? always : `${always}|(?<![\\w$.])(${[...locals].join('|')})(?![\\w$])`,
  )
  const out: Violation[] = []
  for (const m of codeMatches(views, DIAGNOSTIC_CALL)) {
    const open = m.index + m[0].length - 1
    const close = matchClose(views.skeleton, open)
    if (close === -1) continue
    // 在骨架上找：字面量内容已抹掉，模板插值 `${…}` 里的代码仍在
    const hit = mention.exec(views.skeleton.slice(open + 1, close))
    if (hit === null) continue
    out.push({
      rule,
      path: file.path,
      line: lineAt(file.text, m.index),
      message: `诊断输出 ${m[0].replace(/\s+/g, '')}…) 的实参里有出示物（${hit[1] ?? hit[2]}）；出示物只交到调用方手里`,
    })
  }
  return out
}
