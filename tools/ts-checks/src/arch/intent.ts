import { parse } from 'yaml'
import type { IntentNode, IntentPlugin } from './model.ts'
import type { ActualExtraction, Snapshot } from './actual-model.ts'
import { extractArchitecture } from './extract.ts'

function object(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${at}: expected an object`)
  return value as Record<string, unknown>
}
function text(value: unknown, at: string): string {
  if (typeof value !== 'string' || value === '')
    throw new Error(`${at}: expected a nonempty string`)
  return value
}
function array(value: unknown, at: string): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${at}: expected an array`)
  return value
}
const strings = (value: unknown, at: string): string[] =>
  array(value, at).map(item => text(item, at))
function plugin(value: unknown, at: string): IntentPlugin {
  const raw = object(value, at)
  return {
    name: text(raw['name'], `${at}.name`),
    source: text(raw['source'], `${at}.source`),
    provides: strings(raw['provides'], `${at}.provides`),
    injects: strings(raw['injects'], `${at}.injects`),
    optional: strings(raw['optional'], `${at}.optional`),
    listens: strings(raw['listens'], `${at}.listens`),
    contributes: strings(raw['contributes'], `${at}.contributes`),
    emits: array(raw['emits'], `${at}.emits`).map(value => {
      const event = object(value, `${at}.emits`)
      const mode = text(event['mode'], `${at}.emits.mode`)
      if (!['emit', 'parallel', 'serial', 'bail', 'waterfall'].includes(mode))
        throw new Error(`${at}.emits.mode: unknown mode ${mode}`)
      return { event: text(event['event'], `${at}.emits.event`), mode }
    }),
  }
}
export function readIntents(snapshot: Snapshot, nodeRoot: string): IntentNode[] {
  const nodes = new Map<string, { path: string; readme?: string; yaml?: string }>()
  for (const [path, content] of snapshot.texts) {
    if (!path.startsWith(`${nodeRoot}/`)) continue
    const local = path.slice(nodeRoot.length + 1)
    if (!/^(packages\/[^/]+\/[^/]+|apps\/[^/]+)\/(bindings\.yaml|README\.md)$/u.test(local))
      continue
    const member = local.slice(0, local.lastIndexOf('/'))
    const node = nodes.get(member) ?? { path: `${nodeRoot}/${member}/bindings.yaml` }
    nodes.set(member, node)
    if (local.endsWith('README.md')) node.readme = content
    else node.yaml = content
  }
  return [...nodes]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([member, node]) => {
      const raw = node.yaml === undefined ? {} : object(parse(node.yaml), node.path)
      const result: IntentNode = {
        member,
        path: node.path,
        ...(node.readme === undefined ? {} : { readme: node.readme }),
      }
      const assembly =
        raw['assembly'] === undefined ? undefined : object(raw['assembly'], `${node.path}.assembly`)
      const composition =
        raw['composition'] === undefined
          ? undefined
          : object(raw['composition'], `${node.path}.composition`)
      return {
        ...result,
        ...(assembly === undefined
          ? {}
          : {
              assembly: {
                plugins: array(assembly['plugins'], node.path).map(value =>
                  plugin(value, node.path),
                ),
                defines: array(assembly['defines'], node.path).map(value => {
                  const definition = object(value, node.path)
                  const contract = definition['contract'],
                    owner = definition['owner']
                  if ((contract === undefined) === (owner === undefined))
                    throw new Error(
                      `${node.path}.defines: exactly one of contract or owner is required`,
                    )
                  return {
                    key: text(definition['key'], node.path),
                    source: text(definition['source'], node.path),
                    ...(contract === undefined ? {} : { contract: text(contract, node.path) }),
                    ...(owner === undefined ? {} : { owner: text(owner, node.path) }),
                  }
                }),
                importExceptions: array(assembly['importExceptions'], node.path).map(value => {
                  const exception = object(value, node.path),
                    symbols = strings(exception['symbols'], node.path)
                  if (symbols.length === 0 || symbols.includes('*'))
                    throw new Error(
                      `${node.path}.importExceptions: exact nonempty symbols are required`,
                    )
                  return {
                    target: text(exception['target'], node.path),
                    symbols,
                    sharedStorage: text(exception['sharedStorage'], node.path),
                    source: text(exception['source'], node.path),
                  }
                }),
              },
            }),
        ...(composition === undefined
          ? {}
          : {
              composition: {
                plugins: array(composition['plugins'], node.path).map(value => {
                  const row = object(value, node.path),
                    layer = text(row['layer'], node.path)
                  if (!['distribution', 'operator'].includes(layer))
                    throw new Error(`${node.path}.composition: unknown layer ${layer}`)
                  return {
                    id: text(row['id'], node.path),
                    node: text(row['node'], node.path),
                    plugin: text(row['plugin'], node.path),
                    layer,
                    source: text(row['source'], node.path),
                  }
                }),
              },
            }),
      }
    })
}
/** YAML formatting, comments and mapping order do not alter intent. List order is retained for composition. */
export function semanticIntent(node: IntentNode): string {
  const sort = <T>(items: readonly T[], key: (item: T) => string) =>
    [...items].sort((a, b) => key(a).localeCompare(key(b)))
  return JSON.stringify({
    assembly:
      node.assembly === undefined
        ? null
        : {
            plugins: sort(node.assembly.plugins, item => item.name).map(item => ({
              ...item,
              provides: [...item.provides].sort(),
              injects: [...item.injects].sort(),
              optional: [...item.optional].sort(),
              listens: [...item.listens].sort(),
              contributes: [...item.contributes].sort(),
              emits: sort(item.emits, event => `${event.event}|${event.mode}`),
            })),
            defines: sort(node.assembly.defines, item => item.key),
            importExceptions: sort(
              node.assembly.importExceptions.map(item => ({
                ...item,
                symbols: [...item.symbols].sort(),
              })),
              item => `${item.target}|${item.symbols.join('|')}`,
            ),
          },
    composition: node.composition ?? null,
  })
}

/** Project observed facts into the still-active intent comparison protocol. */
export type IntentImplementation = Pick<
  ActualExtraction,
  'facts' | 'unknown' | 'imports' | 'edges' | 'members' | 'serviceIdentifiers'
>
export function extractIntentImplementation(snapshot: Snapshot): IntentImplementation {
  const { facts, unknown, imports, edges, members, serviceIdentifiers } =
    extractArchitecture(snapshot)
  return { facts, unknown, imports, edges, members, serviceIdentifiers }
}
