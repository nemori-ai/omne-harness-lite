import type { Rule, SourceFile, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { ACCOUNT_IDENTITY_SRC, productSourceIn } from '../layout.ts'
import {
  codeMatches,
  lineAt,
  matchClose,
  viewsOf,
} from '@omne-harness/repo-toolchain/core/source-text'

const DIAGNOSTIC_CALL =
  /\.\s*(?:info|warn|error|debug|success|emit|parallel|serial)\s*\(|\bnew\s+[\w$]*Error\s*\(|\bdefect\s*\(/

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
  const always = '(?<![\\w$])(presentation|LoginStatePresentation)(?![\\w$])'
  const mention = new RegExp(
    locals.size === 0 ? always : `${always}|(?<![\\w$.])(${[...locals].join('|')})(?![\\w$])`,
  )
  const out: Violation[] = []
  for (const m of codeMatches(views, DIAGNOSTIC_CALL)) {
    const open = m.index + m[0].length - 1
    const close = matchClose(views.skeleton, open)
    if (close === -1) continue
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
