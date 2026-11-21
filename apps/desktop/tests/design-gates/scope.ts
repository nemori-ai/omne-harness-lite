import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

export type SourceKind = 'css' | 'ts' | 'tsx' | 'js' | 'html'

export interface ScannedFile {
  readonly path: string
  readonly member: string
  readonly kind: SourceKind
  readonly text: string
}

const DESKTOP = join(import.meta.dirname, '..', '..')
export const REPOSITORY = join(DESKTOP, '..', '..')

const KINDS: Readonly<Record<string, SourceKind>> = {
  '.css': 'css',
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.html': 'html',
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
  )
}

function memberDirectory(name: string): string {
  return realpathSync(join(DESKTOP, 'node_modules', name))
}

function assembledModules(): string[] {
  const manifest = JSON.parse(readFileSync(join(DESKTOP, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  return Object.keys(manifest.dependencies ?? {})
    .filter(name => name.startsWith('@omne-harness/') && name.endsWith('-ui'))
    .sort()
}

export const KIT_NAME = '@omne-harness/ui-kit'
export const KIT = relative(REPOSITORY, memberDirectory(KIT_NAME))
export const DESKTOP_PAGE = relative(REPOSITORY, join(DESKTOP, 'src', 'page'))
export const TOKENS = join(KIT, 'src', 'styles', 'tokens.css')

export const MODULES: readonly string[] = assembledModules()

function roots(): readonly { readonly member: string; readonly directory: string }[] {
  return [
    { member: KIT_NAME, directory: join(memberDirectory(KIT_NAME), 'src') },
    ...MODULES.map(member => ({ member, directory: join(memberDirectory(member), 'src') })),
    { member: '@omne-harness/desktop', directory: join(DESKTOP, 'src', 'page') },
  ]
}

function scan(): readonly ScannedFile[] {
  return roots().flatMap(({ member, directory }) =>
    walk(directory).flatMap(file => {
      const kind = KINDS[extname(file)]
      if (kind === undefined) return []
      return [{ path: relative(REPOSITORY, file), member, kind, text: readFileSync(file, 'utf8') }]
    }),
  )
}

export const FILES: readonly ScannedFile[] = scan()

export function isKit(path: string): boolean {
  return path.startsWith(`${KIT}/`)
}

export function isTokens(path: string): boolean {
  return path === TOKENS
}
