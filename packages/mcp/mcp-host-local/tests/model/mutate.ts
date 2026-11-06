// Runs the negative controls of `mutants.ts`: for each mutant, puts the defect into `src/`,
// runs the case that must catch it, restores the source byte for byte, and reports whether the
// case went red for the expected reason. The explorer and the line cases import `src/` directly;
// the slow-tier cases import the package through its `dist`, so a mutant in the slow tier builds
// the package before its case runs and again after the source is restored. Run from the package
// root:
//
//   node tests/model/mutate.ts                 every mutant
//   node tests/model/mutate.ts mV4-signal-dead  one or more by name
//   node tests/model/mutate.ts --out <dir>      keep each run's output in <dir>/<name>.log
//
// The mutation is made in place, in the working tree, so three guards hold: every file a mutant
// touches must be clean in Git before the run starts; an interrupt (SIGINT, SIGTERM) restores
// the files before the process ends; and at the end every file is compared byte for byte with
// what it was. Exit code 0 when every mutant ran red for its expected reason; 1 otherwise. A
// mutant whose text is not found exactly as listed is a defect of the table and is reported
// without running anything.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MUTANTS, type Mutant } from './mutants.ts'

type Result = Readonly<{
  mutant: Mutant
  status: 'red' | 'green' | 'red-for-another-reason' | 'not-applicable'
  exitCode: number | null
  output: string
}>

function apply(source: string, mutant: Mutant): string | undefined {
  let mutated = source
  for (const { find, replace, occurrences = 1 } of mutant.replacements) {
    const count = mutated.split(find).length - 1
    if (count !== occurrences) return undefined
    mutated = mutated.split(find).join(replace)
  }
  return mutated
}

/** The original bytes of every file a chosen mutant touches, taken before any mutation. */
type Originals = ReadonlyMap<string, Buffer>

function originalsOf(chosen: readonly Mutant[], root: string): Originals {
  const originals = new Map<string, Buffer>()
  for (const mutant of chosen) {
    const path = join(root, mutant.file)
    if (!originals.has(path)) originals.set(path, readFileSync(path))
  }
  return originals
}

/** The files that Git sees as modified or untracked among those the mutants touch. */
function unclean(originals: Originals, root: string): readonly string[] {
  const status = spawnSync('git', ['status', '--porcelain', '--', ...originals.keys()], {
    cwd: root,
    encoding: 'utf8',
  })
  if (status.status !== 0) throw new Error(`git status failed: ${status.stderr}`)
  return status.stdout
    .split('\n')
    .filter(line => line !== '')
    .map(line => line.slice(3))
}

function restore(originals: Originals): void {
  for (const [path, bytes] of originals) writeFileSync(path, bytes)
}

/** True when every file holds the bytes it held before the run. */
function restored(originals: Originals): boolean {
  return [...originals].every(([path, bytes]) => readFileSync(path).equals(bytes))
}

function build(root: string): string {
  const result = spawnSync('pnpm', ['run', 'build'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`build failed:\n${result.stdout}\n${result.stderr}`)
  return `${result.stdout}\n${result.stderr}`
}

function runCase(
  mutant: Mutant,
  root: string,
): Readonly<{ status: number | null; output: string }> {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--mode',
      mutant.mode,
      '--typecheck.enabled=false',
      mutant.spec,
      '-t',
      mutant.filter,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', VITEST_MAX_WORKERS: '2' },
    },
  )
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` }
}

function run(mutant: Mutant, root: string, originals: Originals): Result {
  const path = join(root, mutant.file)
  const original = originals.get(path)
  if (original === undefined) throw new Error(`${mutant.file} was not read before the run`)
  const mutated = apply(original.toString('utf8'), mutant)
  if (mutated === undefined)
    return { mutant, status: 'not-applicable', exitCode: null, output: 'text not found as listed' }
  writeFileSync(path, mutated)
  try {
    // The slow tier imports the package through `dist`: the mutant has to be built to be seen.
    const built = mutant.mode === 'slow' ? build(root) : ''
    const result = runCase(mutant, root)
    const output = `${built}\n${result.output}`
    const status =
      result.status === 0
        ? 'green'
        : output.includes(mutant.expect)
          ? 'red'
          : 'red-for-another-reason'
    return { mutant, status, exitCode: result.status, output }
  } finally {
    writeFileSync(path, original)
  }
}

function main(): number {
  const args = process.argv.slice(2)
  const outIndex = args.indexOf('--out')
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined
  const names = args.filter((arg, index) => arg !== '--out' && index !== outIndex + 1)
  const chosen = names.length === 0 ? MUTANTS : MUTANTS.filter(item => names.includes(item.name))
  const unknown = names.filter(name => !MUTANTS.some(item => item.name === name))
  if (unknown.length > 0) {
    console.error(`unknown mutants: ${unknown.join(', ')}`)
    return 1
  }
  if (out !== undefined) mkdirSync(out, { recursive: true })
  const root = process.cwd()
  const originals = originalsOf(chosen, root)
  const dirty = unclean(originals, root)
  if (dirty.length > 0) {
    console.error(`the working tree is not clean for: ${dirty.join(', ')}; commit or revert first`)
    return 1
  }
  const onSignal = (signal: NodeJS.Signals) => {
    restore(originals)
    console.error(`interrupted by ${signal}: the sources were restored`)
    process.exit(1)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  let failed = 0
  let builtSlow = false
  console.log('| mutant | breaks | case | result | exit |')
  console.log('| --- | --- | --- | --- | --- |')
  try {
    for (const mutant of chosen) {
      const result = run(mutant, root, originals)
      if (mutant.mode === 'slow') builtSlow = true
      if (result.status !== 'red') failed += 1
      if (out !== undefined) writeFileSync(join(out, `${mutant.name}.log`), result.output)
      console.log(
        `| ${mutant.name} | ${mutant.breaks} | ${mutant.spec} -t "${mutant.filter}" | ${result.status} (${mutant.expect.replaceAll('\n', ' ⏎ ')}) | ${result.exitCode ?? '-'} |`,
      )
    }
  } finally {
    restore(originals)
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
  if (!restored(originals)) {
    console.error('a source file does not hold the bytes it held before the run')
    return 1
  }
  // The last slow mutant left a mutated build behind: build the restored source once more.
  if (builtSlow) build(root)
  return failed === 0 ? 0 : 1
}

process.exitCode = main()
