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
  '@omne-harness/governance-center-entry',
  '@omne-harness/governance-center-entry/cordis',
  '@omne-harness/assembly-lifecycle/cordis',
  '@omne-harness/kernel-basis',
  // 原根入口的同一组 Cordis 助手；只跟随入口迁移，不开放其他子路径。
  '@omne-harness/kernel-basis/cordis',
  '@omne-harness/storage',
  '@omne-harness/storage/cordis',
  '@omne-harness/offer-expiry',
  '@omne-harness/offer-expiry/cordis',
  ...THIRD_PARTY,
])
const MAINTENANCE = `${ENTRY_SRC}maintenance/`
const JSON_MODULE = `${ENTRY_SRC}json`
const JSON_SHAPES = `${ENTRY_SRC}json-shapes`
const MAINTENANCE_LEAVES = new Set([
  JSON_MODULE,
  `${ENTRY_SRC}routing/schema`,
  `${ENTRY_SRC}center-id/snapshot`,
])
const READONLY_LEAVES = new Set([
  ...MAINTENANCE_LEAVES,
  JSON_SHAPES,
  `${ENTRY_SRC}schema-inputs`,
  `${ENTRY_SRC}center-id/table`,
  `${ENTRY_SRC}center-id/snapshot-structure`,
])
const MAINTENANCE_PACKAGES = new Set([
  '@omne-harness/storage',
  '@omne-harness/offer-expiry',
  '@omne-harness/identity-values',
])
const WORK_MODULE = `${ENTRY_SRC}work`

/**
 * SC-2 和既有维护叶子保持。T4 只增添无导入的共有生命周期叶子、
 * AssemblyDeclaration 类型及迁到公共拥有者的纯事件叶子。
 * 包存在而运维面或公共事件叶子缺席时报告布局偏离，不静默失效。
 */
export const opsImportWhitelist: Rule = {
  id: 'ops-import-whitelist',
  source:
    'composition.governance-center-entry v3 SC-2 / D055-D056 / D-116 / identity-t4-host-coordinates · 服务端 SPEC 静态边界',
  description:
    '运维面仅消费已采用的ops/maintenance/严格JSON路径；维护及其只读叶子逐项受白名单约束，不得传递导入治理服务或写入口',
  check(files) {
    const out: Violation[] = []
    const entryFiles = files.filter(f => productSourceIn(f.path, ENTRY_SRC))
    if (entryFiles.length === 0) return out
    const layoutProblem = (message: string) =>
      out.push({ rule: this.id, path: ENTRY_SRC, line: 0, message })
    if (!files.some(f => f.path === ENTRY_EVENTS)) {
      layoutProblem(`入口层包缺事件声明模块 ${ENTRY_EVENTS}：包布局偏离常量，SC-2 规则失效`)
    }
    if (!entryFiles.some(f => f.path.startsWith(ENTRY_OPS))) {
      layoutProblem(`入口层包缺运维面目录 ${ENTRY_OPS}：包布局偏离常量，SC-2 规则失效`)
    }
    for (const file of files) {
      const inOps = file.path.startsWith(ENTRY_OPS)
      const isEvents = file.path === ENTRY_EVENTS
      const inMaintenance = file.path.startsWith(MAINTENANCE)
      const inReadonlyLeaf = READONLY_LEAVES.has(withoutExtension(file.path))
      const isWork = withoutExtension(file.path) === WORK_MODULE
      if (!inOps && !isEvents && !inMaintenance && !inReadonlyLeaf && !isWork) continue
      if (withoutExtension(file.path) === JSON_SHAPES) {
        const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true)
        if (
          source.statements.some(
            node => !ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node),
          )
        ) {
          out.push({
            rule: this.id,
            path: file.path,
            line: 1,
            message: '严格JSON形状叶子只许interface/type声明，不得承载运行时语句或重导出',
          })
        }
      }
      for (const ref of importsOf(file)) {
        const verdict = inOps
          ? judgeOpsImport(file, ref)
          : inMaintenance
            ? judgeMaintenanceImport(file.path, ref.specifier)
            : inReadonlyLeaf
              ? judgeReadonlyLeaf(file, ref)
              : isWork
                ? '共享生命周期叶子不得导入其他模块，防止运维面经此绕入治理逻辑'
                : judgeEventsImport(file, ref)
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

function judgeOpsImport(file: SourceFile, ref: ImportRef): string | undefined {
  const { path } = file
  const { specifier } = ref
  if (specifier === undefined) return '运维面里的动态导入说明符不是字面量，白名单判不了'
  if (specifier.startsWith('node:')) return undefined
  if (OPS_PACKAGES.has(specifier)) return undefined
  if (
    specifier === '@omne-harness/cordis-plugin-tree' &&
    pureTypeOnly(file, ref.index, ['AssemblyDeclaration'])
  )
    return undefined
  const resolved = resolveRelative(path, specifier)
  if (resolved !== undefined) {
    if (
      withoutExtension(resolved) === WORK_MODULE ||
      withoutExtension(resolved) === JSON_MODULE ||
      resolved.startsWith(ENTRY_OPS) ||
      resolved.startsWith(MAINTENANCE)
    )
      return undefined
    return `运维面导入了 ${specifier}（${resolved}）；本包内只许事件、严格JSON、维护与运维目录`
  }
  return `运维面导入了 ${specifier}；白名单只有 kernel-basis 根与 ./cordis、storage 根与 ./cordis、offer-expiry 根与 ./cordis、@deepseek-ai/cordis、zod、node:* 与本包事件声明模块`
}

function judgeEventsImport(file: SourceFile, ref: ImportRef): string | undefined {
  if (
    ref.specifier === '@omne-harness/offer-expiry' &&
    pureTypeOnly(file, ref.index, ['Instant'])
  )
    return undefined
  return `事件声明模块导入了 ${ref.specifier}；仅允许 offer-expiry 的 Instant 类型，绑定及治理逻辑不得进入纯事件叶子`
}

function pureTypeOnly(file: SourceFile, index: number, allowed: readonly string[]): boolean {
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true)
  const statement = source.statements.find(node => node.pos <= index && index < node.end)
  if (!statement || !ts.isImportDeclaration(statement)) return false
  const clause = statement.importClause,
    bindings = clause?.namedBindings
  return (
    !!clause &&
    !clause.name &&
    !!bindings &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every(
      element =>
        (clause.isTypeOnly || element.isTypeOnly) &&
        allowed.includes((element.propertyName ?? element.name).text),
    )
  )
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
  // R1-T5 moved the same three JSON types to their sole dependency-free owner.
  // Only the original reader may import them, and only as named types.
  if (
    module === JSON_MODULE &&
    resolved !== undefined &&
    withoutExtension(resolved) === JSON_SHAPES &&
    pureTypeOnly(file, ref.index, ['JsonLimits', 'DuplicateMember', 'JsonReading'])
  )
    return undefined
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
        '@omne-harness/identity-values/schema',
        '@omne-harness/offer-expiry/schema',
        '@omne-harness/governance-center-entry/schema',
      ].includes(specifier)
    )
      return undefined
    // The async Clock backup envelope is a separate, fixed resource of this same owner.
    if (
      module === `${ENTRY_SRC}schema-inputs` &&
      resolved === 'tenancy/governance-center-entry-node/schema/governance-maintenance.schema.json'
    )
      return undefined
  }
  if (module === `${ENTRY_SRC}center-id/snapshot`) {
    if (specifier === '@omne-harness/storage') return undefined
    if (
      specifier === '@omne-harness/governance-center-entry' &&
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
    specifier === '@omne-harness/storage'
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
