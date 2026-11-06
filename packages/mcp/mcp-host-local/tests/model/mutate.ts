// Runs the negative controls of `mutants.ts`: for each mutant, puts the defect into `src/`,
// runs the case that must catch it, restores the source byte for byte, and reports whether the
// case went red for the expected reason. The explorer and the line cases import `src/` directly,
// so no build is needed. Run from the package root:
//
//   node tests/model/mutate.ts                 every mutant
//   node tests/model/mutate.ts mV4-signal-dead  one or more by name
//   node tests/model/mutate.ts --out <dir>      keep each run's output in <dir>/<name>.log
//
// Exit code 0 when every mutant ran red for its expected reason; 1 otherwise. The source is
// restored even when a run throws; a mutant whose text is not found exactly once is a defect of
// the table and is reported without running anything.
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

function run(mutant: Mutant, root: string): Result {
  const path = join(root, mutant.file)
  const original = readFileSync(path)
  const mutated = apply(original.toString('utf8'), mutant)
  if (mutated === undefined)
    return { mutant, status: 'not-applicable', exitCode: null, output: 'text not found as listed' }
  writeFileSync(path, mutated)
  try {
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
    const output = `${result.stdout}\n${result.stderr}`
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
  let failed = 0
  console.log('| mutant | breaks | case | result | exit |')
  console.log('| --- | --- | --- | --- | --- |')
  for (const mutant of chosen) {
    const result = run(mutant, root)
    if (result.status !== 'red') failed += 1
    if (out !== undefined) writeFileSync(join(out, `${mutant.name}.log`), result.output)
    console.log(
      `| ${mutant.name} | ${mutant.breaks} | ${mutant.spec} -t "${mutant.filter}" | ${result.status} (${mutant.expect.replaceAll('\n', ' ⏎ ')}) | ${result.exitCode ?? '-'} |`,
    )
  }
  const restored = chosen.every(
    mutant => apply(readFileSync(join(root, mutant.file), 'utf8'), mutant) !== undefined,
  )
  if (!restored) {
    console.error('a source file was not restored as it was')
    return 1
  }
  return failed === 0 ? 0 : 1
}

process.exitCode = main()
