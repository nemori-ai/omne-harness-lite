import type { Rule, SourceFile, Violation } from '../rule.ts'
import { ENTRY_EVENTS, ENTRY_OPS, productSourceIn } from '../layout.ts'
import {
  codeMatches,
  firstArgument,
  lineAt,
  namedImportsOf,
  resolveRelative,
  viewsOf,
  withoutExtension,
} from '../source-text.ts'

const SUBSCRIBE = new Set(['serving', 'stopped', 'defect'])
const DISPATCH = new Set(['listening'])
const EVENTS_MODULE = withoutExtension(ENTRY_EVENTS)

/**
 * 入口 verification 契约 SC-2「事件订阅白名单」与 design「本节点约束」第 5 条：运维面源码里
 * Cordis 事件总线上的 `on`／`once` 第一个实参只能是从事件声明模块导入的 `serving`、`stopped`、`defect`，
 * 派发（`emit`，以及同为派发的 `parallel`、`serial`）只能是 `listening`；字符串字面量、计算出的名字一律不许——
 * 按字符串名订阅 `login.revoked` 一类治理事件不经导入，导入白名单挡不住。
 *
 * 接收者：调用对象的成员链里有名为 `ctx`／`context` 的一段，或本文件里标注为 `Context` 类型、
 * 或由它们直接赋值得来的名字。Node 的 `server.on('error', …)` 这类发射器不是 Cordis 事件总线，不在此列。
 * 允许的实参写法：具名导入（可改名，按原名判）与命名空间导入的成员（`events.serving`）。
 */
export const opsEventWhitelist: Rule = {
  id: 'ops-event-whitelist',
  source:
    'composition.governance-center-entry v1 SC-2 · governance-center-entry 节点约束第 5 条（事件订阅白名单）',
  description:
    '入口层包 src/ops/** 里 Cordis 的 on/once 只许 serving、stopped、defect，emit/parallel/serial 只许 listening，且都须是从 src/events.ts 导入的标识符',
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
  // 本文件里从事件声明模块导入的名字：本地名 → 原名；命名空间别名单列
  const fromEvents = new Map<string, string>()
  const namespaces = new Set<string>()
  for (const imp of namedImportsOf(file)) {
    const resolved = resolveRelative(file.path, imp.specifier)
    if (resolved === undefined || withoutExtension(resolved) !== EVENTS_MODULE) continue
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

/** 实参若是从事件声明模块导入的常量，返回它在该模块里的原名。 */
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

/** Cordis 上下文的名字：`ctx`、`context`，标注为 `Context` 的名字，以及由它们直接赋值得来的名字。 */
function contextNames(code: string): Set<string> {
  const names = new Set(['ctx', 'context'])
  for (const m of code.matchAll(/([\w$]+)\s*\??\s*:\s*Context\b/g))
    if (m[1] !== undefined) names.add(m[1])
  // 别名：`const bus = ctx` 一类；反复做到不再增加
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
