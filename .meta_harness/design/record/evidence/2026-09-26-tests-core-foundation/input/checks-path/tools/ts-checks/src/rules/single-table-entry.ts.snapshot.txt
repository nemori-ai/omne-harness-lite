import type { Rule, Violation } from '../rule.ts'
import { ENTRY_SRC, productSourceIn } from '../layout.ts'
import { codeMatches, firstArgument, lineAt, stringLiteralValue, viewsOf } from '../source-text.ts'

const TABLE = 'governance_center'

/**
 * 查询构建器上点名表的方法。verification 点名的是前四个；其余几个点名的也是「碰哪张表」，
 * 同一条约束（本包只碰一张表）的同一种文本形式，一并查。
 */
const TABLE_METHODS = [
  'selectFrom',
  'insertInto',
  'updateTable',
  'deleteFrom',
  'replaceInto',
  'mergeInto',
  'innerJoin',
  'leftJoin',
  'rightJoin',
  'fullJoin',
  'crossJoin',
  'createTable',
  'alterTable',
  'dropTable',
  'lockRow',
]

/**
 * 入口 verification「只碰一张表」、design「本节点约束」第 4 条（契约 S-28）：入口层包源码里
 * 点名表的调用，表名只能是 `governance_center`，写法限两种——字面量（可带 `as 别名`），
 * 或本包源码里定义为这个字面量的常量名（`const X = 'governance_center'`）。
 * 成员表达式、拼接、数组等判不出是哪张表的写法一律报出；不出现 `sql` 模板与 `sql.raw(`（不写原始 SQL）。
 */
export const singleTableEntry: Rule = {
  id: 'single-table-entry',
  source:
    'composition.governance-center-entry v1 S-28 · governance-center-entry 节点约束第 4 条与 verification「只碰一张表」',
  description:
    '入口层包源码里 selectFrom/insertInto/updateTable/deleteFrom（及 join、DDL、lockRow）的表名只能是 governance_center；不出现 sql 模板',
  check(files) {
    const entryFiles = files.filter(f => productSourceIn(f.path, ENTRY_SRC))
    const tableConstants = new Set<string>()
    for (const file of entryFiles) {
      const constant = new RegExp(
        `\\bconst\\s+([\\w$]+)\\s*(?::[^=]+)?=\\s*(['"])${TABLE}\\2(?:\\s+as\\s+const)?[ \\t]*(?:;|\\n|$)`,
      )
      for (const m of codeMatches(viewsOf(file), constant))
        if (m[1] !== undefined) tableConstants.add(m[1])
    }
    const out: Violation[] = []
    for (const file of entryFiles) {
      const views = viewsOf(file)
      const push = (index: number, message: string) =>
        out.push({ rule: this.id, path: file.path, line: lineAt(file.text, index), message })
      for (const m of codeMatches(
        views,
        new RegExp(`\\.\\s*(${TABLE_METHODS.join('|')})\\s*(?:<[^>(]*>)?\\s*\\(`),
      )) {
        const arg = firstArgument(views, m.index + m[0].length - 1)
        const text = arg?.text ?? ''
        const literal = stringLiteralValue(text)
        const ok =
          literal !== undefined
            ? new RegExp(`^${TABLE}(?:\\s+as\\s+[\\w$]+)?$`).test(literal)
            : tableConstants.has(text)
        if (!ok) {
          push(
            m.index,
            `${m[1]}(${text}) 点名的不是 ${TABLE}（或判不出是哪张表）；入口层包只碰这一张表`,
          )
        }
      }
      for (const m of codeMatches(views, /\bsql\s*(?:<[^>`]*>)?\s*`|\bsql\s*\.\s*raw\s*\(/)) {
        push(m.index, '出现了 sql 模板／sql.raw；入口层包不写原始 SQL')
      }
    }
    return out
  },
}
