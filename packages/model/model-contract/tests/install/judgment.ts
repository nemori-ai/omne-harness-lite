// Pure judgments of the install-closure facility. They take plain values, so each one can be fed a
// failing input without packing or installing anything.
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** True when `path` is strictly below `directory` (the directory itself is not inside). */
export function inside(path: string, directory: string): boolean {
  const from = relative(directory, path)
  return from !== '' && from !== '..' && !from.startsWith(`..${sep}`) && !isAbsolute(from)
}

/** Packed files that carry source: `src/`, tsconfig files and `.ts` files that are not declarations. */
export function sourceFiles(files: readonly string[]): string[] {
  return files.filter(
    path => path.startsWith('src/') || path.startsWith('tsconfig') || /(?<!\.d)\.ts$/u.test(path),
  )
}

/** The consumer lockfile must not remember where a package came from inside the workspace. */
export function lockResidue(lock: string): string[] {
  return lock.split('\n').filter(line => /\b(workspace|link):/u.test(line))
}

/** The resolved URLs that the resolve hook of a child process recorded, one JSON line each. */
export function resolutionLog(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => line !== '')
    .map(line => (JSON.parse(line) as { url: string }).url)
}

export type ResolutionVerdict = Readonly<{ outside: string[]; source: string[] }>

/**
 * Judges recorded resolution URLs against the consumer root: `outside` left the directory,
 * `source` resolved to a `src/` path or a non-declaration `.ts` file inside it.
 */
export function judgeResolutions(urls: readonly string[], consumerRoot: string): ResolutionVerdict {
  const root = realpathSync(consumerRoot)
  const outside: string[] = []
  const source: string[] = []
  for (const url of urls) {
    if (!url.startsWith('file:')) continue
    const path = realpathSync(fileURLToPath(url))
    if (!inside(path, root)) outside.push(path)
    // The relative path has the separator of the platform; judge its segments with `/`.
    else if (
      /(^|\/)src\//u.test(relative(root, path).split(sep).join('/')) ||
      /(?<!\.d)\.ts$/u.test(path)
    )
      source.push(path)
  }
  return { outside, source }
}

export type TypeFilesVerdict = Readonly<{ ok: boolean; stray: string[]; detail: string }>

/**
 * Judges the files that tsc loaded. An empty list is a failure: it means the listing format was not
 * understood, and a vacuous pass would hide that.
 */
export function judgeTypeFiles(
  files: readonly string[],
  consumerRoot: string,
  libraryRoot: string,
): TypeFilesVerdict {
  const root = realpathSync(consumerRoot)
  const libraries = realpathSync(libraryRoot)
  const stray = files.filter(path => {
    const real = realpathSync(path)
    return !inside(real, root) && !inside(real, libraries)
  })
  if (files.length === 0) return { ok: false, stray, detail: 'tsc listed no files' }
  return { ok: stray.length === 0, stray, detail: stray.join(', ') || `${files.length} files` }
}

/**
 * Absolute lines of `tsc --listFiles` output, for both POSIX and drive-letter paths, as paths of the
 * platform. On Windows tsc ends its lines with `\r\n` and writes `C:/…` with forward slashes.
 */
export function listedFiles(stdout: string): string[] {
  return stdout
    .split(/\r?\n/u)
    .filter(line => isAbsolute(line))
    .map(line => resolve(line))
}

export const MARKER = '.install-closure-consumer'

/** One step of a facility run and what it found. */
export type Check = Readonly<{ id: string; ok: boolean; detail: string }>

/** The checks of a run that exercises a fixture in place of the member's own entries. */
const FIXTURE_CHECK_IDS = [
  'fixture-compile',
  'fixture-type-resolution-inside-consumer',
  'fixture-run',
  'fixture-resolution-inside-consumer',
  'fixture-resolution-no-source',
  'fixture-report',
  'fixture-paths',
]

/** The checks of a run that imports and type-checks the member's own entries. */
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

/**
 * Every check id that a run reaching the end must have reported. A judgment that is not wired into
 * the report would otherwise leave the report green, so the report is complete only when none of
 * these is missing.
 */
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

/** The required ids that the reported checks do not contain. */
export function missingCheckIds(
  checks: readonly { id: string }[],
  required: readonly string[],
): string[] {
  const reported = new Set(checks.map(item => item.id))
  return required.filter(id => !reported.has(id))
}

/**
 * Refuses a consumer directory that the facility may not delete: it must lie below the member's
 * `tmp/` or the workspace's `tmp/install-closure/`, must not be a symlink, and, when it already
 * has content, must carry the marker that an earlier facility run wrote.
 */
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
