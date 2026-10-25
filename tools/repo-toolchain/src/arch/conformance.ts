import { extractArchitecture } from './extract.ts'
import { readArchitectureSource, type ArchitectureSource } from './source.ts'
import {
  readBaselineConstraints,
  readConstraints,
  roleAt,
  semanticConstraints,
} from './constraints.ts'
import { activeRoles } from './conformance-model.ts'
import type { ActualExtraction, PackageImport, Fact } from './actual-model.ts'
import type { ActualArchitectureInput } from './actual.ts'
import { publicEntries, StaticResolver, type PublicEntry } from './resolve.ts'
import type { Snapshot } from './actual-model.ts'
import { directionConformance } from './directions.ts'
import type { DependencyGraph } from '../deps/graph.ts'
import type {
  ArchitectureConstraints,
  Conformance,
  ConformanceRow,
  ConstraintChange,
  ConstraintInput,
  RuleId,
} from './conformance-model.ts'

const coverage: Conformance['coverage'] = [
  ...['LAYER-ENTRY', 'LAYER-DIP', 'IC-1', 'IC-2', 'IC-3', 'IC-4', 'IC-5'].map(id => ({
    id,
    evidence: 'static-subset' as const,
    scope: '仅已解析声明/入口；converged 不表示整体符合',
  })),
  ...['IC-6', 'IC-9', 'IC-10', 'IC-11', 'IC-13', 'IC-14', 'IC-18', 'IC-19', 'LSP'].map(id => ({
    id,
    evidence: 'behavior' as const,
    scope: '须在实际契约/探针/测试提供行为证据；本报告未执行，类型同形不证明行为替换',
  })),
  ...['IC-7', 'SRP', 'OCP', 'ISP'].map(id => ({
    id,
    evidence: 'human' as const,
    scope: '责任、变化及实际消费由人判断；没有静态总分',
  })),
  ...['IC-8', 'IC-12'].map(id => ({
    id,
    evidence: 'not-implemented' as const,
    scope: '静态抽取可用，规则尚未接入',
  })),
  ...['IC-15', 'IC-16'].map(id => ({
    id,
    evidence: 'not-implemented' as const,
    scope: '插件树加载器已交付；本静态规则尚未覆盖最终配置，须核对真实组合证据',
  })),
  { id: 'IC-17', evidence: 'undecided', scope: '会话作用域机制待设计；图框不证明隔离' },
  {
    id: 'DIRECTION',
    evidence: 'static-subset',
    scope:
      '只覆盖 dependency-cruiser 已解析的源码导入（schema 3 的方向行）；converged 不表示整体符合',
  },
]
const limitations = [
  '完整两版解析后筛选；新增偏离对 BASE 预期比较。',
  '规则只报告，不增加合并硬线。未映射、候选及不可解析关系保留 unknown。',
  '静态 AST 不证明生命周期、租户、同提交、恢复或 LSP。既有行为义务未撤销。',
]
const role = (path: string, intent: ArchitectureConstraints | null) =>
  roleAt(path, intent?.roles ?? [])
const adopted = (path: string, intent: ArchitectureConstraints | null) => {
  const result = role(path, intent)
  return result?.status === 'adopted' && result.layer !== 'unknown' ? result : undefined
}
function exceptionAt(edge: PackageImport, input: ConstraintInput, extraction: ActualExtraction) {
  const members = new Set(extraction.members.map(member => member.path))
  const exception = input.value?.importExceptions?.find(
    item =>
      edge.target.kind === 'workspace' &&
      item.member === edge.member &&
      item.target === edge.target.member &&
      edge.symbol !== '*' &&
      item.symbols.includes(edge.symbol) &&
      members.has(item.member) &&
      members.has(item.target),
  )
  return exception === undefined ? undefined : { ...exception, path: input.path }
}

function rowsOf(
  extraction: ActualExtraction,
  input: ConstraintInput,
  snapshot: Snapshot,
): ConformanceRow[] {
  const rows: ConformanceRow[] = [],
    intent = input.value === null ? null : { ...input.value, roles: activeRoles(input) }
  const rules = new Map(intent?.rules.map(rule => [rule.id, rule]) ?? [])
  const entries = publicEntries(snapshot)
  const bySource = new Map<string, PackageImport[]>()
  for (const edge of extraction.packageImports)
    bySource.set(edge.path, [...(bySource.get(edge.path) ?? []), edge])
  const closureOf = (entry: PublicEntry, valueOnly = false) => {
    const seen = new Set<string>(),
      edges: PackageImport[] = []
    const pending = entry.sourcePath === undefined ? [] : [entry.sourcePath]
    while (pending.length > 0) {
      const path = pending.pop()
      if (path === undefined || seen.has(path)) continue
      seen.add(path)
      for (const edge of bySource.get(path) ?? []) {
        if (valueOnly && edge.type) continue
        edges.push(edge)
        if (edge.resolvedPath !== undefined) pending.push(edge.resolvedPath)
      }
    }
    return { paths: seen, edges }
  }
  const add = (
    id: string,
    rule: ConformanceRow['rule'],
    state: ConformanceRow['state'],
    member: string,
    key: string,
    reason: string,
    sites: ConformanceRow['sites'],
    extra: Partial<ConformanceRow> = {},
  ) => {
    rows.push({
      id,
      rule,
      state,
      member,
      key,
      reason,
      sites,
      expected: rules.get(rule as RuleId)?.source ?? input.path,
      age: 'unjudged',
      ...extra,
    })
  }
  const imported = (
    edge: PackageImport,
    rule: RuleId,
    state: ConformanceRow['state'],
    reason: string,
    origin?: { readonly member: string; readonly path: string },
  ) =>
    add(
      JSON.stringify([
        rule,
        origin?.path ?? edge.path,
        edge.path,
        edge.resolvedPath ?? edge.specifier,
        edge.symbol,
        edge.type,
        edge.form,
      ]),
      rule,
      state,
      origin?.member ?? edge.member,
      `${edge.specifier}#${edge.symbol}`,
      reason,
      [edge],
      {
        relation: edge,
        ...(edge.target.kind === 'workspace' ? { targetMember: edge.target.member } : {}),
      },
    )
  function checkRoles(): void {
    for (const member of extraction.members) {
      const paths = [
        ...new Set(
          extraction.packageImports
            .filter(edge => edge.member === member.path)
            .map(edge => edge.path),
        ),
      ]
      if (paths.length === 0) paths.push(`${member.path}/src/`)
      for (const path of paths) {
        const located = adopted(path, intent)
        if (located === undefined)
          add(
            JSON.stringify(['ROLE', path]),
            'ROLE',
            'unknown',
            member.path,
            role(path, intent)?.id ?? path,
            '入口责任未采用、冲突或未映射；不作为分层符合证据',
            [{ path, line: 1 }],
          )
      }
    }
  }
  function checkLayers(edge: PackageImport): void {
    const from = adopted(edge.path, intent),
      target = edge.resolvedPath === undefined ? undefined : adopted(edge.resolvedPath, intent)
    for (const id of ['LAYER-ENTRY', 'LAYER-DIP'] as const) {
      if (!rules.has(id)) continue
      if (from === undefined || (edge.target.kind === 'workspace' && target === undefined)) {
        imported(edge, id, 'unknown', '源或目标入口责任未采用，不能判分层符合')
        continue
      }
      if (edge.target.kind !== 'workspace') continue
      const violates =
        id === 'LAYER-ENTRY'
          ? from.layer === 'interaction' &&
            (target?.layer === 'storage-port' || target?.layer === 'storage-adapter')
          : from.layer === 'policy' &&
            ['interaction', 'storage-adapter', 'assembly'].includes(target?.layer ?? '')
      const conflict = violates ? exceptionAt(edge, input, extraction) : undefined
      imported(
        edge,
        id,
        conflict === undefined ? (violates ? 'deviation' : 'converged') : 'unknown',
        conflict === undefined
          ? violates
            ? id === 'LAYER-ENTRY'
              ? '交互入口绕过业务能力，直接依赖业务存储；泛化契约不构成豁免'
              : '业务策略依赖外侧实现'
            : '该已定位直接依赖未违反本条静态子集'
          : `待裁定：分层要求与已接受 IC-5 例外冲突，原出处 ${conflict.path} ${conflict.source}，共同存储 ${conflict.sharedStorage}`,
      )
    }
  }
  function checkPeer(edge: PackageImport): void {
    const from = adopted(edge.path, intent)
    if (
      rules.has('IC-5') &&
      edge.target.kind === 'workspace' &&
      edge.target.member !== edge.member
    ) {
      if (from?.layer === 'assembly') {
        imported(edge, 'IC-5', 'converged', '明确的装配入口选择实现')
        return
      }
      if (from === undefined) {
        imported(
          edge,
          'IC-5',
          'unknown',
          '没有采用的非装配入口责任；不能给 apps 或候选入口通用豁免',
        )
        return
      }
      const exception = exceptionAt(edge, input, extraction)
      const targetMember = edge.target.member
      const target =
        edge.resolvedPath === undefined ? undefined : adopted(edge.resolvedPath, intent)
      const named = entries.filter(
        entry => entry.member === targetMember && entry.specifier === edge.specifier,
      )
      const publicTargets =
        named.length > 0
          ? named
          : entries.filter(
              entry => entry.member === targetMember && entry.sourcePath === edge.resolvedPath,
            )
      const closures = publicTargets.map(entry => ({ entry, ...closureOf(entry, true) }))
      const privateTarget = publicTargets.length === 0
      const unknown =
        target === undefined ||
        closures.some(
          item =>
            item.entry.sourcePath === undefined ||
            !snapshot.texts.has(item.entry.sourcePath) ||
            item.edges.some(
              link =>
                link.target.kind === 'unresolved-local' ||
                (link.target.kind === 'workspace' && link.resolvedPath === undefined),
            ) ||
            extraction.importUnknown.some(itemUnknown => item.paths.has(itemUnknown.path)),
        )
      const provider = closures.some(item =>
        [...item.paths].some(path => {
          const definitions = extraction.facts.filter(
            fact =>
              fact.path === path &&
              fact.kind === 'defines' &&
              fact.definitionForm === 'service-class',
          )
          return extraction.facts.some(
            fact =>
              (fact.kind === 'provides' && fact.provideForm === 'class-plugin'
                ? (fact.serviceDefinition?.path ?? fact.path)
                : fact.path) === path &&
              ['plugin', 'provides'].includes(fact.kind) &&
              !definitions.some(
                definition =>
                  fact.serviceDefinition !== undefined &&
                  definition.serviceDefinition?.path === fact.serviceDefinition.path &&
                  definition.serviceDefinition.offset === fact.serviceDefinition.offset &&
                  definition.serviceDefinition.symbol === fact.serviceDefinition.symbol,
              ),
          )
        }),
      )
      const targetImplementation =
        target?.layer === 'assembly' ||
        target?.layer === 'interaction' ||
        (target?.layer === 'storage-adapter' &&
          !closures.every(
            item =>
              item.entry.subpath !== '.' &&
              extraction.facts.some(fact => item.paths.has(fact.path) && fact.kind === 'defines'),
          ))
      const violates = privateTarget || provider || targetImplementation
      imported(
        edge,
        'IC-5',
        exception !== undefined
          ? 'converged'
          : violates
            ? 'deviation'
            : unknown
              ? 'unknown'
              : 'converged',
        exception === undefined
          ? violates
            ? '非装配消费者引用私有入口或提供者实现，BASE无精确符号同提交例外'
            : unknown
              ? '目标责任或公开入口值闭包未完整解析，不能证明消费隔离'
              : '消费已采用公开契约或定义入口，未观察到独立提供者值依赖'
          : `静态例外：${exception.path} ${exception.source}；共同存储 ${exception.sharedStorage}，事务行为仍需证据`,
      )
    }
  }
  function checkDefinitions(): void {
    const definitions = extraction.facts.filter(fact => fact.kind === 'defines')
    const serviceDefinition = (fact: Fact): Fact | undefined =>
      fact.definitionForm === 'context-augmentation' && fact.serviceDefinition !== undefined
        ? definitions.find(
            item =>
              item.definitionForm === 'service-class' &&
              item.key === fact.key &&
              item.member === fact.member &&
              item.serviceDefinition?.path === fact.serviceDefinition?.path &&
              item.serviceDefinition?.line === fact.serviceDefinition?.line &&
              item.serviceDefinition?.offset === fact.serviceDefinition?.offset &&
              item.serviceDefinition?.symbol === fact.serviceDefinition?.symbol,
          )
        : undefined
    const declarations = definitions.filter(fact => serviceDefinition(fact) === undefined)
    const resolver = new StaticResolver(snapshot)
    const publicDeclarations = entries.flatMap(entry =>
      entry.sourcePath === undefined
        ? []
        : resolver
            .publicDeclarations(entry.sourcePath)
            .map(site => ({ ...site, member: entry.member })),
    )
    const uncertainPublicMembers = new Set(
      entries
        .filter(entry => entry.sourcePath === undefined || !snapshot.texts.has(entry.sourcePath))
        .map(entry => entry.member),
    )
    const factRow = (rule: RuleId, fact: Fact, state: ConformanceRow['state'], reason: string) =>
      add(
        JSON.stringify([rule, fact.path, fact.plugin, fact.kind, fact.key, fact.scope]),
        rule,
        state,
        fact.member,
        fact.key,
        reason,
        extraction.factOccurrences.filter(item => item.id === fact.id),
      )
    for (const fact of extraction.facts) {
      if (rules.has('IC-1') && fact.kind === 'defines')
        factRow(
          'IC-1',
          fact,
          declarations.filter(
            item => item.key === fact.key && item.id !== (serviceDefinition(fact) ?? fact).id,
          ).length > 0 ||
            extraction.factOccurrences.filter(
              item =>
                item.kind === 'defines' &&
                item.key === fact.key &&
                serviceDefinition(item) === undefined,
            ).length > 1
            ? 'deviation'
            : adopted(fact.path, intent) === undefined
              ? 'unknown'
              : publicDeclarations.some(
                    site =>
                      site.member === fact.member &&
                      site.path === (serviceDefinition(fact) ?? fact).serviceDefinition?.path &&
                      site.offset === (serviceDefinition(fact) ?? fact).serviceDefinition?.offset,
                  )
                ? 'converged'
                : uncertainPublicMembers.has(fact.member)
                  ? 'unknown'
                  : 'deviation',
          '仅检查采用的定义责任、实际公开导出与同键重复；不按core许可，不证明动态唯一性',
        )
      if (rules.has('IC-2') && fact.kind === 'provides')
        factRow(
          'IC-2',
          fact,
          fact.provideForm === 'ctx.provide' ? 'deviation' : 'converged',
          '直接 ctx.provide 不满足 Service 子类形状；子类生命周期仍需行为证据',
        )
      if (rules.has('IC-3') && fact.kind === 'defines')
        factRow(
          'IC-3',
          fact,
          (fact.definitionForm === 'context-augmentation' &&
            serviceDefinition(fact) === undefined) ||
            ((serviceDefinition(fact) ?? fact).contract === undefined &&
              (serviceDefinition(fact) ?? fact).owner === undefined)
            ? 'deviation'
            : 'converged',
          'Service 形状及 contract/owner 元数据子集；不证明签名或行为',
        )
    }
  }
  checkRoles()
  for (const edge of extraction.packageImports) {
    checkLayers(edge)
    checkPeer(edge)
  }
  checkDefinitions()
  for (const unknown of [...extraction.unknown, ...extraction.importUnknown])
    add(
      JSON.stringify(['unknown', unknown.path, unknown.kind, unknown.expression]),
      'ROLE',
      'unknown',
      unknown.member,
      unknown.expression,
      unknown.reason,
      [unknown],
    )
  if (rules.has('IC-4')) checkRoots(extraction, imported, entries, snapshot)
  return rows.sort((a, b) => a.id.localeCompare(b.id))
}
function checkRoots(
  extraction: ActualExtraction,
  add: (
    edge: PackageImport,
    rule: RuleId,
    state: ConformanceRow['state'],
    reason: string,
    origin: { readonly member: string; readonly path: string },
  ) => void,
  entries: readonly PublicEntry[],
  snapshot: Snapshot,
): void {
  const bySource = new Map<string, PackageImport[]>()
  for (const edge of extraction.packageImports)
    bySource.set(edge.path, [...(bySource.get(edge.path) ?? []), edge])
  for (const member of extraction.members) {
    if (member.path.startsWith('apps/') || member.path === 'packages/core/kernel-basis') continue
    const reported = new Set<string>()
    for (const root of entries.filter(
      entry => entry.member === member.path && entry.subpath === '.',
    )) {
      if (root.sourcePath === undefined || !snapshot.texts.has(root.sourcePath)) {
        const edge: PackageImport = {
          id: JSON.stringify(['root', member.path, root.specifier]),
          member: member.path,
          path: `${member.path}/package.json`,
          line: 1,
          specifier: root.specifier,
          symbol: '*',
          type: false,
          form: 'export',
          target: { kind: 'unresolved-local' },
        }
        add(edge, 'IC-4', 'unknown', '公开根exports不能映射到本版源码', {
          member: member.path,
          path: edge.path,
        })
        continue
      }
      const entry = root.sourcePath,
        seen = new Set<string>(),
        pending = [entry]
      while (pending.length > 0) {
        const path = pending.pop()
        if (path === undefined || seen.has(path)) continue
        seen.add(path)
        for (const edge of bySource.get(path) ?? []) {
          if (
            edge.specifier === '@deepseek-ai/cordis' ||
            edge.specifier.startsWith('@deepseek-ai/cordis/') ||
            edge.resolvedPath === `${member.path}/src/cordis.ts` ||
            edge.resolvedPath?.startsWith(`${member.path}/src/cordis/`)
          ) {
            const mark = `${path}\0${edge.specifier}\0${edge.symbol}`
            if (reported.has(mark)) continue
            reported.add(mark)
            add(edge, 'IC-4', 'deviation', `公开根 ${entry} 的源码依赖闭包引入 Cordis 绑定`, {
              member: member.path,
              path: entry,
            })
          } else if (edge.resolvedPath !== undefined) pending.push(edge.resolvedPath)
          else if (edge.target.kind === 'workspace' || edge.target.kind === 'unresolved-local')
            add(edge, 'IC-4', 'unknown', `公开根 ${entry} 的源码依赖闭包存在未解析目标`, {
              member: member.path,
              path: entry,
            })
        }
      }
    }
  }
}
export function conformanceOf(
  root: string,
  current: ArchitectureSource,
  baseline?: ArchitectureSource,
  graph?: DependencyGraph,
): Conformance {
  return analyzeConformance(root, current, baseline, graph).conformance
}
/**
 * One extraction per source version for constraints and actual assembly observations.
 * 方向行一节另从可信 runner 读（arch/directions.ts）；调用方已经算过当前版本的依赖图时传进来，
 * 免得再跑一次 dependency-cruiser；没传就按版本自己取，而且只在 runner 有方向行时才取。
 */
export function analyzeConformance(
  root: string,
  current: ArchitectureSource,
  baseline?: ArchitectureSource,
  graph?: DependencyGraph,
) {
  const head = readConstraints(root, current.source),
    base = baseline === undefined ? undefined : readBaselineConstraints(root, baseline)
  const headActual = extractArchitecture(current.snapshot),
    baseActual = baseline === undefined ? undefined : extractArchitecture(baseline.snapshot)
  const rows = rowsOf(headActual, base ?? head, current.snapshot)
  for (const [version, input] of [
    ['current', head],
    ['baseline', base],
  ] as const) {
    if (input !== undefined && input.value === null)
      rows.push({
        id: JSON.stringify(['INPUT', version, input.source.commit]),
        rule: 'INPUT',
        state: 'unknown',
        age: 'unjudged',
        member: '',
        key: version,
        reason: `${version} 架构预期缺失；不能以空规则或另一版本证明符合`,
        expected: input.path,
        sites: [{ path: input.path, line: 1 }],
      })
  }
  const stock = new Set(
    baseActual === undefined
      ? []
      : rowsOf(baseActual, base ?? head, baseline?.snapshot ?? current.snapshot)
          .filter(row => row.state === 'deviation')
          .map(row => row.id),
  )
  const changes: ConstraintChange[] = []
  const before = semanticConstraints(base?.value ?? null),
    after = semanticConstraints(head.value)
  if (base !== undefined && before !== after)
    changes.push({
      id: 'global-architecture',
      path: head.value === null ? (base?.path ?? head.path) : head.path,
      before,
      after,
    })
  const sourceChanges: ConstraintChange[] = []
  if (base !== undefined) {
    const previous = new Map(base.sources.map(item => [item.path, item.digest]))
    const next = new Map(head.sources.map(item => [item.path, item.digest]))
    for (const path of [...new Set([...previous.keys(), ...next.keys()])].sort()) {
      const before = previous.get(path) ?? null,
        after = next.get(path) ?? null
      if (before !== after)
        sourceChanges.push({ id: `architecture-source:${path}`, path, before, after })
    }
  }
  const conformance: Conformance = {
    schemaVersion: 1,
    kind: 'architecture-conformance',
    current: head,
    ...(base === undefined ? {} : { baseline: base }),
    comparedWith: base === undefined ? 'current' : 'baseline',
    rows: [
      ...rows.map((row): ConformanceRow => ({
        ...row,
        age:
          row.state !== 'deviation' || baseline === undefined
            ? 'unjudged'
            : stock.has(row.id)
              ? 'stock'
              : 'new',
      })),
      ...directionConformance({ root, current: current.source, baseline: baseline?.source, graph }),
    ],
    changes,
    sourceChanges,
    changeState: base === undefined ? 'no-baseline' : 'compared',
    coverage,
    limitations,
  }
  return { conformance, headActual, baseActual }
}
export function readConformance(
  input: ActualArchitectureInput & { readonly member?: string; readonly graph?: DependencyGraph },
): Conformance {
  const current = readArchitectureSource(input.root, input.revision),
    baseline = input.base === undefined ? undefined : readArchitectureSource(input.root, input.base)
  const result = conformanceOf(input.root, current, baseline, input.graph)
  return input.member === undefined
    ? result
    : projectConformance(
        result,
        input.member,
        [...current.members, ...(baseline?.members ?? [])].map(member => member.path),
      )
}
export function projectConformance(
  result: Conformance,
  member: string,
  members: readonly string[],
): Conformance {
  return {
    ...result,
    projection: { member, matched: members.includes(member) },
    rows: result.rows.filter(row => row.member === member || row.targetMember === member),
  }
}
