#!/usr/bin/env node
import { resolve } from 'node:path'
import { checkPackageExports, DEFAULT_INVENTORY } from './check.ts'

const HELP = `Usage:
  package-exports <package-directory> [--inventory <path>] [--json]
Compares the built entries of one package with its export inventory (default ${DEFAULT_INVENTORY})
and with the chapters of the public-api page that the inventory names. Build the package first.
Exit 0: no difference. Exit 1: differences, one per line. Exit 2: the check could not run.`

function parse(args: readonly string[]) {
  let directory: string | undefined
  let inventory: string | undefined
  let json = false
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--json' && !json) json = true
    else if (arg === '--inventory' && inventory === undefined) {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) return undefined
      inventory = value
      i += 1
    } else if (arg !== undefined && !arg.startsWith('--') && directory === undefined)
      directory = arg
    else return undefined
  }
  return directory === undefined ? undefined : { directory, inventory, json }
}

const options = parse(process.argv.slice(2))
if (options === undefined) {
  process.stderr.write(`${HELP}\n`)
  process.exitCode = 2
} else {
  const directory = resolve(options.directory)
  const result = checkPackageExports(
    directory,
    options.inventory === undefined ? undefined : resolve(options.inventory),
  )
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (result.kind === 'cannot-check') {
    if (!options.json) process.stderr.write(`${result.reasons.join('\n')}\n`)
    process.exitCode = 2
  } else {
    const { report } = result
    if (!options.json) {
      for (const entry of report.entries)
        process.stdout.write(
          `[exports] ${report.package} ${entry.entry}: ${entry.listed} listed, ${entry.pending} pending\n`,
        )
      for (const problem of report.problems) process.stdout.write(`${problem}\n`)
    }
    process.exitCode = report.problems.length === 0 ? 0 : 1
  }
}
