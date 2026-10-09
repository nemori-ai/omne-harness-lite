import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileAt } from '../metrics/git.ts'
import {
  RULE_IDS,
  type ArchitectureConstraints,
  type ArchitectureImportException,
  type ArchitectureRole,
  type ConstraintInput,
  type Layer,
} from './conformance-model.ts'
import type { SourceCoordinates } from './source.ts'

export const CONSTRAINT_PATH = '.meta_harness/design/architecture/constraints.json'
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
function obj(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!record(v) || Object.keys(v).some(key => !keys.includes(key)))
    throw new Error('Architecture constraints contain invalid object fields')
  return v
}
function str(v: unknown): string {
  if (typeof v !== 'string' || v.trim() === '')
    throw new Error('Architecture constraints require nonempty strings')
  return v
}
function strings(v: unknown): string[] {
  if (!Array.isArray(v)) throw new Error('Architecture constraints require string arrays')
  const out = v.map(str)
  if (new Set(out).size !== out.length)
    throw new Error('Architecture constraints contain duplicate values')
  return out
}
function list(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error('Architecture constraints require arrays')
  return v
}
function unique<T extends { readonly id: string }>(values: T[]): T[] {
  if (new Set(values.map(v => v.id)).size !== values.length)
    throw new Error('Architecture constraints contain duplicate identities')
  return values
}
export function safePath(path: string): string {
  if (
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some(part => part === '..' || part === '.' || part === '') ||
    /[?\[\]{}]/u.test(path) ||
    (path.includes('*') && !path.endsWith('/**')) ||
    path.slice(0, -3).includes('*')
  )
    throw new Error(`Invalid architecture path: ${path}`)
  return path
}
function memberPath(value: unknown): string {
  const path = safePath(str(value))
  if (!/^(packages\/[^/]+\/[^/]+|apps\/[^/]+)$/u.test(path))
    throw new Error(`Architecture exceptions require exact members: ${path}`)
  return path
}
function importException(value: unknown): ArchitectureImportException {
  const row = obj(value, ['id', 'member', 'target', 'symbols', 'sharedStorage', 'source'])
  const symbols = strings(row['symbols'])
  if (symbols.length === 0 || symbols.some(symbol => symbol.includes('*')))
    throw new Error('Architecture exceptions require exact nonempty symbols')
  return {
    id: str(row['id']),
    member: memberPath(row['member']),
    target: memberPath(row['target']),
    symbols,
    sharedStorage: str(row['sharedStorage']),
    source: str(row['source']),
  }
}
function importExceptions(value: unknown): ArchitectureImportException[] {
  const rows = unique(list(value === undefined ? [] : value).map(importException))
  const seen = new Set<string>()
  for (const row of rows)
    for (const symbol of row.symbols) {
      const key = JSON.stringify([row.member, row.target, symbol])
      if (seen.has(key)) throw new Error('Architecture exceptions repeat a member/target/symbol')
      seen.add(key)
    }
  return rows
}
export function parseConstraints(text: string): ArchitectureConstraints {
  const value = obj(JSON.parse(text), [
    'schemaVersion',
    'domains',
    'roles',
    'rules',
    'importExceptions',
  ])
  if (value['schemaVersion'] !== 1) throw new Error('Unsupported architecture constraint schema')
  const domains = unique(
    list(value['domains']).map(item => {
      const row = obj(item, ['id', 'label', 'source'])
      return { id: str(row['id']), label: str(row['label']), source: str(row['source']) }
    }),
  )
  const domainIds = new Set(domains.map(d => d.id))
  const layers: readonly Layer[] = [
    'interaction',
    'policy',
    'contract',
    'storage-port',
    'storage-adapter',
    'assembly',
    'unknown',
  ]
  const roles = unique(
    list(value['roles']).map((item): ArchitectureRole => {
      const row = obj(item, ['id', 'paths', 'layer', 'domains', 'status', 'source'])
      const paths = strings(row['paths']).map(safePath),
        layer = str(row['layer']),
        status = str(row['status']),
        related = strings(row['domains'])
      if (
        paths.length === 0 ||
        !layers.some(v => v === layer) ||
        !['adopted', 'candidate', 'unknown'].includes(status) ||
        related.some(id => !domainIds.has(id))
      )
        throw new Error('Invalid architecture role')
      return {
        id: str(row['id']),
        paths,
        layer: layer as Layer,
        domains: related,
        status: status as ArchitectureRole['status'],
        source: str(row['source']),
      }
    }),
  )
  const rules = unique(
    list(value['rules']).map(item => {
      const row = obj(item, ['id', 'source']),
        id = str(row['id'])
      const known = RULE_IDS.find(rule => rule === id)
      if (known === undefined) throw new Error(`Unknown architecture rule ${id}`)
      return { id: known, source: str(row['source']) }
    }),
  )
  return {
    schemaVersion: 1,
    domains,
    roles,
    rules,
    importExceptions: importExceptions(value['importExceptions']),
  }
}
export function readConstraints(
  root: string,
  source: SourceCoordinates,
  path = CONSTRAINT_PATH,
): ConstraintInput {
  safePath(path)
  const text =
    source.kind === 'revision'
      ? fileAt(root, source.commit, path)
      : existsSync(join(root, path))
        ? readFileSync(join(root, path), 'utf8')
        : undefined
  return { path, source, value: text === undefined ? null : parseConstraints(text) }
}
export function semanticConstraints(value: ArchitectureConstraints | null): string | null {
  if (value === null) return null
  const sorted = <T extends { readonly id: string }>(items: readonly T[]) =>
    [...items].sort((a, b) => a.id.localeCompare(b.id))
  return JSON.stringify({
    schemaVersion: 1,
    domains: sorted(value.domains),
    ...(value.importExceptions?.length
      ? {
          importExceptions: sorted(
            value.importExceptions.map(row => ({ ...row, symbols: [...row.symbols].sort() })),
          ),
        }
      : {}),
    rules: sorted(value.rules),
    roles: sorted(
      value.roles.map(row => ({
        id: row.id,
        paths: [...row.paths].sort(),
        layer: row.layer,
        domains: [...row.domains].sort(),
        status: row.status,
        source: row.source,
      })),
    ),
  })
}
export function roleAt(
  path: string,
  roles: readonly ArchitectureRole[],
): ArchitectureRole | undefined {
  const matches = roles
    .flatMap(role =>
      role.paths.flatMap(pattern => {
        const prefix = pattern.endsWith('/**') ? pattern.slice(0, -2) : undefined
        return (prefix === undefined ? path === pattern : path.startsWith(prefix))
          ? [{ role, precision: prefix?.length ?? pattern.length + 1 }]
          : []
      }),
    )
    .sort((a, b) => b.precision - a.precision)
  const top = matches[0]
  if (
    top === undefined ||
    matches.some(item => item.precision === top.precision && item.role.id !== top.role.id)
  )
    return undefined
  return top.role
}
