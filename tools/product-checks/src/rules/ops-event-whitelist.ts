import type { Rule, SourceFile, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { ENTRY_EVENTS_PACKAGE, ENTRY_OPS, productSourceIn } from '../layout.ts'
import {
  codeMatches,
  firstArgument,
  lineAt,
  namedImportsOf,
  viewsOf,
} from '@omne-harness/repo-toolchain/core/source-text'

const SUBSCRIBE = new Set(['SERVING_EVENT', 'STOPPED_EVENT', 'DEFECT_EVENT'])
const DISPATCH = new Set(['LISTENING_EVENT'])

export const opsEventWhitelist: Rule = {
  id: 'ops-event-whitelist',
  source:
    'composition.governance-center-entry v3 SC-2 / identity-t4-host-coordinates · 服务端 SPEC 事件边界',
  description:
    '运维面 Cordis 只订阅公共 SERVING_EVENT/STOPPED_EVENT/DEFECT_EVENT，只派发 LISTENING_EVENT；必须从公共定义入口导入',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (!productSourceIn(file.path, ENTRY_OPS)) continue
      out.push(...checkFile(this.id, file))
    }
    return out
  },
}

function checkFile(rule: string, file: SourceFile): Violation[] {
  const views = viewsOf(file)
  const out: Violation[] = []
  const fromEvents = new Map<string, string>()
  const namespaces = new Set<string>()
  for (const imp of namedImportsOf(file)) {
    if (imp.specifier !== ENTRY_EVENTS_PACKAGE) continue
    if (imp.imported === '*') namespaces.add(imp.local)
    else fromEvents.set(imp.local, imp.imported)
  }
  const contexts = contextNames(views.code)
  const call = /((?:[\w$#]+\s*(?:\?\.|\.)\s*)+)(on|once|emit|parallel|serial)\s*\(/
  for (const m of codeMatches(views, call)) {
    const receiver = (m[1] ?? '').split(/\s*\??\.\s*/).filter(s => s.length > 0)
    if (!receiver.some(segment => contexts.has(segment.replace(/^#/, '')))) continue
    const method = m[2] ?? ''
    const allowed = method === 'on' || method === 'once' ? SUBSCRIBE : DISPATCH
    const arg = firstArgument(views, m.index + m[0].length - 1)
    const name = arg === undefined ? undefined : eventConstant(arg.text, fromEvents, namespaces)
    if (name !== undefined && allowed.has(name)) continue
    const shown = arg?.text ?? '（无实参）'
    out.push({
      rule,
      path: file.path,
      line: lineAt(file.text, m.index),
      message:
        name === undefined
          ? `运维面 ${method}(${shown}, …) 的事件名不是从事件声明模块导入的常量（字符串字面量与计算出的名字不许）`
          : `运维面 ${method}(${shown}, …)：${method} 只许 ${[...allowed].join('、')}`,
    })
  }
  return out
}

function eventConstant(
  text: string,
  fromEvents: ReadonlyMap<string, string>,
  namespaces: ReadonlySet<string>,
): string | undefined {
  if (/^[\w$]+$/.test(text)) return fromEvents.get(text)
  const member = /^([\w$]+)\s*\.\s*([\w$]+)$/.exec(text)
  if (member?.[1] !== undefined && namespaces.has(member[1])) return member[2]
  return undefined
}

function contextNames(code: string): Set<string> {
  const names = new Set(['ctx', 'context'])
  for (const m of code.matchAll(/([\w$]+)\s*\??\s*:\s*Context\b/g))
    if (m[1] !== undefined) names.add(m[1])
  for (let grew = true; grew;) {
    grew = false
    for (const m of code.matchAll(
      /\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*([\w$.#]+)[ \t]*(?:;|\n|$)/g,
    )) {
      const alias = m[1]
      const source = (m[2] ?? '').split('.')
      if (
        alias !== undefined &&
        !names.has(alias) &&
        source.some(s => names.has(s.replace(/^#/, '')))
      ) {
        names.add(alias)
        grew = true
      }
    }
  }
  return names
}
