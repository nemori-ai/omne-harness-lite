import type { Comparison, ComparisonResult, Extraction, Fact, IntentNode } from './model.ts'

function identity(
  fact: Pick<Fact, 'member' | 'plugin' | 'scope' | 'kind' | 'key' | 'mode' | 'target' | 'layer'>,
): string {
  return [
    fact.member,
    fact.plugin ?? '',
    fact.scope,
    fact.kind,
    fact.key,
    fact.mode ?? '',
    fact.target ?? '',
    fact.layer ?? '',
  ].join('|')
}
interface Expected {
  readonly fact: Fact
  readonly declaration: { readonly path: string; readonly source: string }
}
function expected(nodes: readonly IntentNode[]): Expected[] {
  const out: Expected[] = []
  for (const node of nodes) {
    const add = (
      kind: Fact['kind'],
      key: string,
      source: string,
      plugin?: string,
      extra: Partial<Fact> = {},
    ) => {
      const item = {
        member: node.member,
        scope: 'top',
        kind,
        key,
        path: node.path,
        line: 1,
        ...(plugin === undefined ? {} : { plugin }),
        ...extra,
      }
      out.push({ fact: { ...item, id: identity(item) }, declaration: { path: node.path, source } })
    }
    for (const plugin of node.assembly?.plugins ?? []) {
      add('plugin', plugin.name, plugin.source)
      for (const kind of ['provides', 'injects', 'optional', 'listens', 'contributes'] as const)
        for (const key of plugin[kind]) add(kind, key, plugin.source, plugin.name)
      for (const event of plugin.emits)
        add('emits', event.event, plugin.source, plugin.name, { mode: event.mode })
    }
    for (const definition of node.assembly?.defines ?? [])
      add('defines', definition.key, definition.source, undefined, {
        ...(definition.contract === undefined ? {} : { contract: definition.contract }),
        ...(definition.owner === undefined ? {} : { owner: definition.owner }),
      })
    for (const row of node.composition?.plugins ?? [])
      add('composition', row.id, row.source, row.plugin, { target: row.node, layer: row.layer })
  }
  return out
}

/** Only an explicit current statement on the source-location line describes package presence. */
function sourceLocationState(readme: string | undefined): 'built' | 'not-built' | 'unknown' {
  const line = readme?.match(/^[-*]\s*源码位置[：:]\s*(.*)$/mu)?.[1]
  if (line === undefined) return 'unknown'
  const statement =
    line
      .replace(/`[^`]+`/gu, '')
      .replace(/[“「"][^”」"]*[”」"]/gu, '')
      .replaceAll('**', '')
      .split(/[。；;]/u)[0] ?? ''
  if (/(?:初稿|历史|当时|起草|曾经|记录为)/u.test(statement)) return 'unknown'
  if (/(?:尚未建包|尚未建应用|尚无源码)/u.test(statement)) return 'not-built'
  if (/(?:已实现|已建包|已建应用|已有源码)/u.test(statement)) return 'built'
  return 'unknown'
}

/** Static presence comparison; unknown values never provide evidence of absence. */
export function compareArchitecture(
  extraction: Extraction,
  nodes: readonly IntentNode[],
): ComparisonResult {
  const members = new Set(extraction.members.map(member => member.path)),
    byMember = new Map(nodes.map(node => [node.member, node]))
  const expectations = expected(nodes).filter(item => members.has(item.fact.member))
  const wants = new Map(expectations.map(item => [item.fact.id, item]))
  const actual = extraction.facts.filter(
    fact => fact.kind !== 'event-declaration' && fact.scope === 'top',
  )
  const has = new Map(actual.map(fact => [identity(fact), fact]))
  const comparisons: Comparison[] = []
  for (const fact of actual) {
    const id = identity(fact),
      wanted = wants.get(id)
    const metadataMatches =
      wanted === undefined ||
      fact.kind !== 'defines' ||
      (wanted.fact.contract === fact.contract && wanted.fact.owner === fact.owner)
    comparisons.push({
      id,
      member: fact.member,
      kind: fact.kind,
      key: fact.key,
      state: wanted === undefined || !metadataMatches ? 'deviation' : 'converged',
      ...(fact.plugin === undefined ? {} : { plugin: fact.plugin }),
      implementation: { path: fact.path, line: fact.line },
      ...(wanted === undefined ? {} : { declaration: wanted.declaration }),
      ...(!metadataMatches
        ? { reason: 'Service definition contract/owner differs from intent' }
        : {}),
    })
  }
  for (const wanted of expectations) {
    if (has.has(wanted.fact.id)) continue
    const { fact } = wanted
    const uncertain = extraction.unknown.some(
      item =>
        item.member === fact.member &&
        item.scope === fact.scope &&
        (item.kind === fact.kind || item.kind === 'plugin') &&
        (item.plugin === undefined || item.plugin === fact.plugin),
    )
    comparisons.push({
      id: fact.id,
      member: fact.member,
      kind: fact.kind,
      key: fact.key,
      state: uncertain ? 'unknown' : 'missing',
      ...(fact.plugin === undefined ? {} : { plugin: fact.plugin }),
      declaration: wanted.declaration,
      ...(uncertain ? { reason: 'Unresolved source may contain this relationship' } : {}),
    })
  }
  const exceptions: ComparisonResult['exceptions'][number][] = []
  for (const imported of extraction.imports) {
    if (
      imported.member.startsWith('apps/') ||
      imported.target.startsWith('packages/core/') ||
      imported.target.startsWith('packages/util/')
    )
      continue
    const exception = byMember
      .get(imported.member)
      ?.assembly?.importExceptions.find(
        item =>
          item.target === imported.target &&
          item.symbols.includes(imported.symbol) &&
          imported.symbol !== '*' &&
          byMember.has(item.target),
      )
    if (exception !== undefined)
      exceptions.push({
        import: imported,
        declaration: {
          path: byMember.get(imported.member)?.path ?? '',
          source: exception.source,
          sharedStorage: exception.sharedStorage,
        },
      })
    else
      comparisons.push({
        id: `import|${imported.id}`,
        state: 'deviation',
        member: imported.member,
        kind: 'import',
        key: `${imported.target}#${imported.symbol}${imported.type ? ' (type)' : ''}`,
        implementation: { path: imported.path, line: imported.line },
        reason:
          'IC-5: cross-member import outside core/util has no exact-symbol baseline exception',
      })
  }
  const lifecycle: ComparisonResult['lifecycle'][number][] = []
  for (const member of extraction.members) {
    const node = byMember.get(member.path)
    if (node === undefined) lifecycle.push({ member: member.path, kind: 'no-design' })
    else {
      if (node.assembly === undefined && node.composition === undefined)
        lifecycle.push({ member: member.path, kind: 'undeclared', path: node.path })
    }
  }
  for (const node of nodes) {
    const exists = members.has(node.member)
    if (!exists) lifecycle.push({ member: node.member, kind: 'not-built', path: node.path })
    const state = sourceLocationState(node.readme)
    if ((exists && state === 'not-built') || (!exists && state === 'built'))
      lifecycle.push({
        member: node.member,
        kind: 'source-location-mismatch',
        path: node.path.replace(/bindings\.yaml$/u, 'README.md'),
      })
  }
  return {
    comparisons: comparisons.sort((a, b) => a.id.localeCompare(b.id)),
    lifecycle,
    exceptions,
  }
}
export interface IntentChange {
  readonly member: string
  readonly path: string
  readonly before: string | null
  readonly after: string | null
}
