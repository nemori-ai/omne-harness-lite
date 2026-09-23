import type { Rule, Violation } from '../rule.ts'
import { ENTRY_EVENTS, ENTRY_OPS, ENTRY_SRC, productSourceIn } from '../layout.ts'
import { importsOf, lineAt, resolveRelative, withoutExtension } from '../source-text.ts'

/** 非治理的第三方：内核与 config 校验（主线 2026-09-23 裁决纳入白名单）。 */
const THIRD_PARTY = new Set(['@deepseek-ai/cordis', 'zod'])
const OPS_PACKAGES = new Set([
  '@omne-harness-lite/kernel-basis',
  '@omne-harness-lite/storage',
  '@omne-harness-lite/offer-expiry',
  ...THIRD_PARTY,
])
const EVENTS_MODULE = withoutExtension(ENTRY_EVENTS)

/**
 * 入口 verification 契约 SC-2 与 design「本节点约束」第 5 条：运维面源码目录只按白名单导入——
 * `kernel-basis`、`storage`、`offer-expiry`（恰这三个包名，不含子入口）、`@deepseek-ai/cordis`、`zod`
 * （非治理的第三方，主线 2026-09-23 裁决纳入）、Node 内置（`node:*`）、本包事件声明模块，
 * 以及运维面目录自己的文件（白名单要让传递导入图有界，目录内互引不越界）。
 * 事件声明模块只许导入 Node 内置、`@deepseek-ai/cordis` 与 `zod`：不导入任何 `@omne-harness-lite/*`，
 * 也不做相对导入——它在白名单里，这两种导入都会把运维面的传递导入图带出界。
 * 入口层包不存在时本规则无事可查；包存在而运维面目录或事件声明模块缺席 ⇒ 布局偏离，报出（规则会静默失效）。
 */
export const opsImportWhitelist: Rule = {
  id: 'ops-import-whitelist',
  source:
    'composition.governance-center-entry v1 SC-2 · governance-center-entry 节点约束第 5 条与 verification「包布局常量」',
  description:
    '入口层包 src/ops/** 只许导入 kernel-basis、storage、offer-expiry、@deepseek-ai/cordis、zod、node:*、src/events.ts 与 ops 目录内文件；src/events.ts 只许 node:*、cordis、zod',
  check(files) {
    const out: Violation[] = []
    const entryFiles = files.filter(f => productSourceIn(f.path, ENTRY_SRC))
    if (entryFiles.length === 0) return out
    const layoutProblem = (message: string) =>
      out.push({ rule: this.id, path: ENTRY_SRC, line: 0, message })
    if (!entryFiles.some(f => f.path === ENTRY_EVENTS)) {
      layoutProblem(`入口层包缺事件声明模块 ${ENTRY_EVENTS}：包布局偏离常量，SC-2 规则失效`)
    }
    if (!entryFiles.some(f => f.path.startsWith(ENTRY_OPS))) {
      layoutProblem(`入口层包缺运维面目录 ${ENTRY_OPS}：包布局偏离常量，SC-2 规则失效`)
    }
    for (const file of entryFiles) {
      const inOps = file.path.startsWith(ENTRY_OPS)
      const isEvents = file.path === ENTRY_EVENTS
      if (!inOps && !isEvents) continue
      for (const ref of importsOf(file)) {
        const verdict = inOps
          ? judgeOpsImport(file.path, ref.specifier)
          : judgeEventsImport(ref.specifier)
        if (verdict !== undefined) {
          out.push({
            rule: this.id,
            path: file.path,
            line: lineAt(file.text, ref.index),
            message: verdict,
          })
        }
      }
    }
    return out
  },
}

function judgeOpsImport(path: string, specifier: string | undefined): string | undefined {
  if (specifier === undefined) return '运维面里的动态导入说明符不是字面量，白名单判不了'
  if (specifier.startsWith('node:')) return undefined
  if (OPS_PACKAGES.has(specifier)) return undefined
  const resolved = resolveRelative(path, specifier)
  if (resolved !== undefined) {
    if (withoutExtension(resolved) === EVENTS_MODULE || resolved.startsWith(ENTRY_OPS))
      return undefined
    return `运维面导入了 ${specifier}（${resolved}）；本包内只许导入事件声明模块与运维面目录自己的文件`
  }
  return `运维面导入了 ${specifier}；白名单只有 kernel-basis、storage、offer-expiry、@deepseek-ai/cordis、zod、node:* 与本包事件声明模块`
}

function judgeEventsImport(specifier: string | undefined): string | undefined {
  if (specifier === undefined) return '事件声明模块里的动态导入说明符不是字面量，判不了'
  if (specifier.startsWith('node:') || THIRD_PARTY.has(specifier)) return undefined
  if (specifier.startsWith('@omne-harness-lite/')) {
    return `事件声明模块导入了 ${specifier}；它在运维面白名单里，不导入任何 @omne-harness-lite/* 包`
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return `事件声明模块导入了本包模块 ${specifier}；它在运维面白名单里，相对导入会让运维面的传递导入图越界`
  }
  return `事件声明模块导入了 ${specifier}；它只许导入 node:*、@deepseek-ai/cordis 与 zod`
}
