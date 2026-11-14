import type { Plugin } from '@deepseek-ai/cordis'
import * as cordisExports from './cordis.ts'
import { rowDeclarationOf, type RowDeclaration } from './row.ts'
import { trustedScopes, visibility as s0Visibility } from './s0/rows.ts'
import { rowManifests as s0Manifests } from './s0/stubs.ts'
import type { RowId, RowManifest, ServiceName, Visibility } from './types.ts'

export const STUB_EXPORT = 'stubPlugin'

export type Mode = 's0' | 'serve'

export type DeclaredExport = Readonly<{ plugin: Plugin.Object; declaration: RowDeclaration }>

export type Profile = Readonly<{
  mode: Mode
  allowlist: readonly string[]
  stubManifests: ReadonlyMap<RowId, RowManifest>
  visibility: Visibility
  declarations: ReadonlyMap<string, DeclaredExport>
}>

function isPluginObject(value: unknown): value is Plugin.Object {
  return (
    typeof value === 'object' &&
    value !== null &&
    'apply' in value &&
    typeof value.apply === 'function'
  )
}

const S0_PREFIX = 's0.'

function stripPrefix(name: ServiceName): ServiceName {
  return name.startsWith(S0_PREFIX) ? name.slice(S0_PREFIX.length) : name
}

export const s0Profile: Profile = {
  mode: 's0',
  allowlist: [STUB_EXPORT],
  stubManifests: s0Manifests,
  visibility: s0Visibility,
  declarations: new Map(),
}

const serveManifests: ReadonlyMap<RowId, RowManifest> = new Map(
  [...s0Manifests].map(([row, manifest]) => [
    row,
    {
      ...manifest,
      provides: manifest.provides.map(stripPrefix),
      injects: manifest.injects.map(stripPrefix),
    },
  ]),
)

const serveVisibility: Visibility = new Map(
  trustedScopes.map(scope => [scope.row, [...scope.names]]),
)

export function serveProfile(plugins: Readonly<Record<string, unknown>> = cordisExports): Profile {
  const declarations = new Map<string, DeclaredExport>()
  const allowlist: string[] = []
  for (const [name, plugin] of Object.entries(plugins)) {
    if (name === STUB_EXPORT) {
      allowlist.push(name)
      continue
    }
    const declaration = rowDeclarationOf(plugin)
    if (declaration === undefined || !isPluginObject(plugin)) continue
    declarations.set(name, { plugin, declaration })
    allowlist.push(name)
  }
  return {
    mode: 'serve',
    allowlist,
    stubManifests: serveManifests,
    visibility: serveVisibility,
    declarations,
  }
}
