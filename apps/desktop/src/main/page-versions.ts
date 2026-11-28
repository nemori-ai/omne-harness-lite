import { join } from 'node:path'
import {
  installVersion,
  readVersions,
  switchVersion,
  tellVersions,
  verifyVersion,
  VERSIONS_DIR,
  type Told,
} from '@omne-harness/assembly-cordis'

/** The page bundle inside the application: always there, the last one to go back to. */
export const BUILTIN = 'builtin'
export const PAGE_VERSIONS_DIR = 'page-versions'

export type Serving = Readonly<{
  version: string
  root: string
  /** False while the version was switched to and has not stayed up yet. */
  settled: boolean
  /** The version the pointer names, when it cannot be served as it was signed. */
  unusable?: Readonly<{ version: string; reason: string }>
}>

export type Installed =
  | Readonly<{ kind: 'installed'; version: string }>
  | Readonly<{ kind: 'refused'; reason: string; detail: string }>

export type PageVersions = Readonly<{
  serving(): Promise<Serving>
  rootOf(version: string): string
  install(directory: string): Promise<Installed>
  switchTo(version: string): Told
  tell(started: string, kind: 'settled' | 'fell-to-limit'): Told
}>

type Options = Readonly<{ userData: string; builtinRoot: string; publisherKeys: readonly string[] }>

/** The versions of the page bundle under the user data directory, over the one the application ships. */
export function pageVersions(options: Options): PageVersions {
  const root = join(options.userData, PAGE_VERSIONS_DIR)
  const trust = { publisherKeys: options.publisherKeys, named: [] }
  const rootOf = (version: string): string =>
    version === BUILTIN ? options.builtinRoot : join(root, VERSIONS_DIR, version)
  const shipped: Serving = { version: BUILTIN, root: options.builtinRoot, settled: true }
  return {
    rootOf,
    async serving() {
      const pointer = readVersions(root, BUILTIN).pointer
      const version = pointer?.current ?? BUILTIN
      if (version === BUILTIN) return shipped
      // Checked at every start: a bundle changed after it was installed is not the one that was signed.
      const verified = await verifyVersion(rootOf(version), trust)
      if (verified.kind === 'verified')
        return { version, root: rootOf(version), settled: pointer?.settled === true }
      return { ...shipped, unusable: { version, reason: verified.reason } }
    },
    async install(directory) {
      const verified = await verifyVersion(directory, trust)
      if (verified.kind === 'refused') return verified
      return { kind: 'installed', version: installVersion(root, directory, 'page').version }
    },
    switchTo: version => switchVersion(root, version, BUILTIN),
    tell: (started, kind) => tellVersions(root, started, kind, BUILTIN),
  }
}
