import type { Rule, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { ENTRY_SRC, productSourceIn } from '../layout.ts'
import {
  codeMatches,
  firstArgument,
  lineAt,
  stringLiteralValue,
  viewsOf,
} from '@omne-harness/repo-toolchain/core/source-text'

const TABLE = 'governance_center'

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
