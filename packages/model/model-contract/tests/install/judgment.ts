import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export function inside(path: string, directory: string): boolean {
  const from = relative(directory, path)
  return from !== '' && from !== '..' && !from.startsWith(`..${sep}`) && !isAbsolute(from)
}

export function sourceFiles(files: readonly string[]): string[] {
  return files.filter(
    path => path.startsWith('src/') || path.startsWith('tsconfig') || /(?<!\.d)\.ts$/u.test(path),
  )
}

export function lockResidue(lock: string): string[] {
  return lock.split('\n').filter(line => /\b(workspace|link):/u.test(line))
}

export function resolutionLog(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => line !== '')
    .map(line => (JSON.parse(line) as { url: string }).url)
}

export type ResolutionVerdict = Readonly<{ outside: string[]; source: string[] }>

export function judgeResolutions(urls: readonly string[], consumerRoot: string): ResolutionVerdict {
  const root = realpathSync(consumerRoot)
  const outside: string[] = []
  const source: string[] = []
  for (const url of urls) {
    if (!url.startsWith('file:')) continue
    const path = realpathSync(fileURLToPath(url))
    if (!inside(path, root)) outside.push(path)
    else if (
      /(^|\/)src\//u.test(relative(root, path).split(sep).join('/')) ||
      /(?<!\.d)\.ts$/u.test(path)
    )
      source.push(path)
  }
  return { outside, source }
}

export type TypeFilesVerdict = Readonly<{ ok: boolean; stray: string[]; detail: string }>

export function judgeTypeFiles(
  files: readonly string[],
  consumerRoot: string,
  libraryRoot: string,
): TypeFilesVerdict {
  const root = realpathSync.native(consumerRoot)
  const libraries = realpathSync.native(libraryRoot)
  const stray = files.filter(path => {
    const real = realpathSync.native(path)
    return !inside(real, root) && !inside(real, libraries)
  })
  if (files.length === 0) return { ok: false, stray, detail: 'tsc listed no files' }
  return { ok: stray.length === 0, stray, detail: stray.join(', ') || `${files.length} files` }
}

export function listedFiles(stdout: string): string[] {
  return stdout
    .split(/\r?\n/u)
    .filter(line => isAbsolute(line))
    .map(line => resolve(line))
}

export const MARKER = '.install-closure-consumer'

export type Check = Readonly<{ id: string; ok: boolean; detail: string }>

const FIXTURE_CHECK_IDS = [
  'fixture-compile',
  'fixture-type-resolution-inside-consumer',
  'fixture-run',
  'fixture-resolution-inside-consumer',
  'fixture-resolution-no-source',
  'fixture-report',
  'fixture-paths',
]

function memberCheckIds(scenario: boolean): string[] {
  return [
    'probe-run',
    'resolution-inside-consumer',
    'resolution-no-source',
    ...(scenario ? ['scenario-run'] : []),
    'type-check',
    'type-resolution-inside-consumer',
  ]
}

export function requiredCheckIds(
  workspaceMembers: readonly string[],
  options: Readonly<{ scenario?: boolean; fixture?: boolean }> = {},
): string[] {
  const fixture = options.fixture === true
  return [
    'node-path-unset',
    ...(fixture ? ['fixture-dependencies'] : []),
    'forbidden-declared',
    'members-built',
    ...workspaceMembers.flatMap(name => [
      `pack:${name}`,
      `tarball-no-source:${name}`,
      `tarball-no-workspace-protocol:${name}`,
    ]),
    ...(fixture ? ['fixture-pins'] : []),
    'install',
    'consumer-lock-no-workspace',
    'installed-listed',
    'forbidden-installed',
    ...(fixture ? FIXTURE_CHECK_IDS : memberCheckIds(options.scenario === true)),
  ]
}

export function missingCheckIds(
  checks: readonly { id: string }[],
  required: readonly string[],
): string[] {
  const reported = new Set(checks.map(item => item.id))
  return required.filter(id => !reported.has(id))
}

export function assertWorkDirectory(
  directory: string,
  memberDirectory: string,
  workspaceRoot: string,
): void {
  const target = resolve(directory)
  const roots = [join(memberDirectory, 'tmp'), join(workspaceRoot, 'tmp', 'install-closure')]
  if (!roots.some(root => inside(target, resolve(root))))
    throw new Error(`refusing work directory ${target}: it must be below ${roots.join(' or ')}`)
  let stat
  try {
    stat = lstatSync(target)
  } catch {
    return
  }
  if (stat.isSymbolicLink()) throw new Error(`refusing work directory ${target}: it is a symlink`)
  if (!stat.isDirectory())
    throw new Error(`refusing work directory ${target}: it is not a directory`)
  const entries = readdirSync(target)
  if (entries.length > 0 && !entries.includes(MARKER))
    throw new Error(`refusing work directory ${target}: not empty and without ${MARKER}`)
}
