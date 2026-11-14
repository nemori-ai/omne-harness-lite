import type { Rule, SourceFile, Violation } from '@omne-harness/repo-toolchain/core/rule'
import {
  ACCOUNT_REGISTRATION_SRC,
  ACCOUNT_REGISTRATION_DEFINITION_SRC,
  productSourceIn,
} from '../layout.ts'
import {
  blockBodies,
  codeMatches,
  inOwnBody,
  lineAt,
  matchClose,
  namedFunctionBodies,
  stringLiteralValue,
  viewsOf,
} from '@omne-harness/repo-toolchain/core/source-text'

const S5_OUTCOMES = [
  'registered',
  'identifier-taken',
  'credential-rejected',
  'interrupted',
] as const

export const terminalOutcomeClosed: Rule = {
  id: 'terminal-outcome-closed',
  source:
    'composition.account-registration v1 S-5 · account-registration 节点 verification「S-5 四值闭合」',
  description:
    'account-registration 的 TERMINAL_OUTCOMES 恰为 S-5 四值，TerminalOutcome 只由它派生，源码里不出现第五个终结结果',
  check(files) {
    const arFiles = files.filter(
      f =>
        productSourceIn(f.path, ACCOUNT_REGISTRATION_SRC) ||
        productSourceIn(f.path, ACCOUNT_REGISTRATION_DEFINITION_SRC),
    )
    if (arFiles.length === 0) return []
    const out: Violation[] = []
    const push = (file: SourceFile | undefined, index: number, message: string) =>
      out.push({
        rule: this.id,
        path: file?.path ?? ACCOUNT_REGISTRATION_SRC,
        line: file === undefined ? 0 : lineAt(file.text, index),
        message,
      })

    let declared: Set<string> | undefined
    for (const file of arFiles) {
      const views = viewsOf(file)
      for (const m of codeMatches(views, /\bconst\s+TERMINAL_OUTCOMES\s*(?::[^=]+)?=\s*\[/)) {
        const open = m.index + m[0].length - 1
        const close = matchClose(views.skeleton, open)
        const items = views.code
          .slice(open + 1, close)
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0)
        const values = items.map(stringLiteralValue)
        const literals = values.filter((v): v is string => v !== undefined)
        const set = new Set(literals)
        const expected = new Set<string>(S5_OUTCOMES)
        if (
          literals.length !== items.length ||
          literals.length !== S5_OUTCOMES.length ||
          set.size !== literals.length ||
          [...set].some(v => !expected.has(v))
        ) {
          push(
            file,
            m.index,
            `TERMINAL_OUTCOMES 不是恰好 S-5 的四个字面量（实为 ${items.join(', ')}）；应为 ${S5_OUTCOMES.join(', ')}`,
          )
        }
        declared = set
      }
      for (const m of codeMatches(views, /\btype\s+TerminalOutcome\s*=\s*([^\n;]*)/)) {
        const rhs = (m[1] ?? '').replace(/\s+/g, '')
        if (
          rhs !== '(typeofTERMINAL_OUTCOMES)[number]' &&
          rhs !== 'typeofTERMINAL_OUTCOMES[number]'
        ) {
          push(
            file,
            m.index,
            `TerminalOutcome 不是只由 TERMINAL_OUTCOMES 派生（= ${m[1]?.trim()}）；结果值类型上不留开放分支`,
          )
        }
      }
    }
    if (declared === undefined) {
      push(undefined, 0, '注册组合包里找不到 TERMINAL_OUTCOMES 常量；S-5 四值闭合无从比对')
      return out
    }

    const allowed = declared
    for (const file of arFiles) {
      const views = viewsOf(file)
      for (const m of codeMatches(
        views,
        /\bas\s+TerminalOutcome\b|(?:^|[^\w$)\]>\s])\s*<\s*TerminalOutcome\s*>/m,
      )) {
        push(file, m.index, `出现了 ${m[0].trim()} 断言；断言能把第五个值塞进终结结果`)
      }
      const nested = blockBodies(file)
      const typed = namedFunctionBodies(file).filter(f => /\bTerminalOutcome\b/.test(f.returnType))
      for (const m of codeMatches(views, /\breturn\s+((['"])(?:\\.|(?!\2)[^\\\n])*\2)/)) {
        if (!typed.some(body => inOwnBody(body, nested, m.index))) continue
        const value = stringLiteralValue(m[1] ?? '')
        if (value !== undefined && !allowed.has(value)) {
          push(
            file,
            m.index,
            `终结结果出现了第五个值 '${value}'；S-5 只有 ${[...allowed].join('、')}`,
          )
        }
      }
    }
    return out
  },
}
