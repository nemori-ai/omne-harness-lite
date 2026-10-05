import ts from 'typescript'
import type { Rule, Violation, SourceFile } from '../rule.ts'
import { ENTRY_EVENTS, ENTRY_OPS, ENTRY_SRC, productSourceIn } from '../layout.ts'
import {
  importsOf,
  lineAt,
  resolveRelative,
  withoutExtension,
  type ImportRef,
} from '../source-text.ts'

/** 非治理的第三方：内核与 config 校验（主线 2026-09-23 裁决纳入白名单）。 */
const THIRD_PARTY = new Set(['@deepseek-ai/cordis', 'zod'])
const OPS_PACKAGES = new Set([
  // Adopted identity T2: admission signal and owned-work protocol; no governance operations.
  '@omne-harness-lite/governance-center-entry',
  '@omne-harness-lite/governance-center-entry/cordis',
  '@omne-harness-lite/assembly-lifecycle/cordis',
  '@omne-harness-lite/kernel-basis',
  // 原根入口的同一组 Cordis 助手；只跟随入口迁移，不开放其他子路径。
  '@omne-harness-lite/kernel-basis/cordis',
  '@omne-harness-lite/storage',
  '@omne-harness-lite/storage/cordis',
  '@omne-harness-lite/offer-expiry',
  '@omne-harness-lite/offer-expiry/cordis',
  ...THIRD_PARTY,
])
const MAINTENANCE = `${ENTRY_SRC}maintenance/`
const JSON_MODULE = `${ENTRY_SRC}json`
const MAINTENANCE_LEAVES = new Set([
  JSON_MODULE,
  `${ENTRY_SRC}routing/schema`,
  `${ENTRY_SRC}center-id/snapshot`,
])
const READONLY_LEAVES = new Set([
  ...MAINTENANCE_LEAVES,
  `${ENTRY_SRC}schema-inputs`,
  `${ENTRY_SRC}center-id/table`,
  `${ENTRY_SRC}center-id/snapshot-structure`,
])
const MAINTENANCE_PACKAGES = new Set([
  '@omne-harness-lite/storage',
  '@omne-harness-lite/offer-expiry',
  '@omne-harness-lite/identity-values',
])
const EVENTS_MODULE = withoutExtension(ENTRY_EVENTS)

/**
 * 入口 verification 契约 SC-2 与 design「本节点约束」第 5 条：运维面源码目录只按白名单导入——
 * `kernel-basis` 的根与 `./cordis`、`storage` 与 `offer-expiry` 的根和 `./cordis`、`@deepseek-ai/cordis`、`zod`
 * （非治理的第三方，主线 2026-09-23 裁决纳入）、Node 内置（`node:*`）、本包事件声明模块，
 * 以及运维面目录自己的文件（白名单要让传递导入图有界，目录内互引不越界）。
 * 事件声明模块只许导入 Node 内置、`@deepseek-ai/cordis` 与 `zod`：不导入任何 `@omne-harness-lite/*`，
 * 也不做相对导入——它在白名单里，这两种导入都会把运维面的传递导入图带出界。
 * 入口层包不存在时本规则无事可查；包存在而运维面目录或事件声明模块缺席 ⇒ 布局偏离，报出（规则会静默失效）。
 */
export const opsImportWhitelist: Rule = {
  id: 'ops-import-whitelist',
  source:
    'composition.governance-center-entry v3 SC-2 / D055-D056 / D-116 · governance-center-entry 节点约束第 5 条与 verification「包布局常量」',
  description:
    '运维面仅消费已采用的ops/maintenance/严格JSON路径；维护及其只读叶子逐项受白名单约束，不得传递导入治理服务或写入口',
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
      const inMaintenance = file.path.startsWith(MAINTENANCE)
      const inReadonlyLeaf = READONLY_LEAVES.has(withoutExtension(file.path))
      if (!inOps && !isEvents && !inMaintenance && !inReadonlyLeaf) continue
      for (const ref of importsOf(file)) {
        const verdict = inOps
          ? judgeOpsImport(file.path, ref.specifier)
          : inMaintenance
            ? judgeMaintenanceImport(file.path, ref.specifier)
            : inReadonlyLeaf
              ? judgeReadonlyLeaf(file, ref)
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
    if (
      withoutExtension(resolved) === EVENTS_MODULE ||
      withoutExtension(resolved) === JSON_MODULE ||
      resolved.startsWith(ENTRY_OPS) ||
      resolved.startsWith(MAINTENANCE)
    )
      return undefined
    return `运维面导入了 ${specifier}（${resolved}）；本包内只许事件、严格JSON、维护与运维目录`
  }
  return `运维面导入了 ${specifier}；白名单只有 kernel-basis 根与 ./cordis、storage 根与 ./cordis、offer-expiry 根与 ./cordis、@deepseek-ai/cordis、zod、node:* 与本包事件声明模块`
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

function judgeMaintenanceImport(path: string, specifier: string | undefined): string | undefined {
  if (specifier === undefined) return '维护模块的动态导入说明符不是字面量'
  if (specifier.startsWith('node:') || MAINTENANCE_PACKAGES.has(specifier)) return undefined
  const resolved = resolveRelative(path, specifier)
  if (
    resolved !== undefined &&
    (resolved.startsWith(MAINTENANCE) || MAINTENANCE_LEAVES.has(withoutExtension(resolved)))
  )
    return undefined
  return `维护模块导入了 ${specifier}；仅允许本维护目录、存储/时间/身份值协议、严格JSON、Schema校验及中心身份只读检查`
}

function judgeReadonlyLeaf(file: SourceFile, ref: ImportRef): string | undefined {
  const { path } = file
  const { specifier } = ref
  if (specifier === undefined) return '运维只读叶子的动态导入说明符不是字面量'
  const module = withoutExtension(path)
  const resolved = resolveRelative(path, specifier)
  if (module === `${ENTRY_SRC}routing/schema`) {
    if (
      (resolved !== undefined && withoutExtension(resolved) === `${ENTRY_SRC}schema-inputs`) ||
      specifier === './generated/ordinary.cjs'
    )
      return undefined
  }
  // D-116 moves resource assembly into this checked readonly leaf. The native
  // generated module is resolved by routing/schema's package-root createRequire.
  if (module === `${ENTRY_SRC}routing/schema` || module === `${ENTRY_SRC}schema-inputs`) {
    if (
      [
        'node:module',
        'ajv/dist/2020.js',
        '@omne-harness-lite/identity-values/schema',
        '@omne-harness-lite/offer-expiry/schema',
      ].includes(specifier)
    )
      return undefined
    if (
      resolved === 'tenancy/governance-center-entry-node/schema/governance-center-entry.schema.json'
    )
      return undefined
  }
  if (module === `${ENTRY_SRC}center-id/snapshot`) {
    if (specifier === '@omne-harness-lite/storage') return undefined
    if (
      specifier === '@omne-harness-lite/governance-center-entry' &&
      centerIdentityOnly(file, ref.index)
    )
      return undefined
    if (
      resolved !== undefined &&
      [`${ENTRY_SRC}center-id/table`, `${ENTRY_SRC}center-id/snapshot-structure`].includes(
        withoutExtension(resolved),
      )
    )
      return undefined
  }
  if (
    module === `${ENTRY_SRC}center-id/snapshot-structure` &&
    specifier === '@omne-harness-lite/storage'
  )
    return undefined
  return `运维只读叶子导入了 ${specifier}；不得经叶子绕过治理与写入口边界`
}

/** T3 moved these two readonly definitions out of the local table module. */
function centerIdentityOnly(file: SourceFile, index: number): boolean {
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true)
  const statement = source.statements.find(node => node.pos <= index && index < node.end)
  if (!statement || !ts.isImportDeclaration(statement)) return false
  const clause = statement.importClause
  const bindings = clause?.namedBindings
  return (
    !!clause &&
    !clause.name &&
    !!bindings &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every(element =>
      ['GovernanceCenterId', 'isGovernanceCenterId'].includes(
        (element.propertyName ?? element.name).text,
      ),
    )
  )
}
