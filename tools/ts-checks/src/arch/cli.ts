#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { readActualArchitecture } from './actual.ts'

function argumentsOf(args: readonly string[]): {
  root: string
  revision?: string
  base?: string
  out?: string
} {
  const values = new Map<string, string>()
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i],
      value = args[i + 1]
    if (
      flag === undefined ||
      !['--root', '--revision', '--base', '--out'].includes(flag) ||
      value === undefined ||
      value === '' ||
      value.startsWith('--') ||
      values.has(flag)
    )
      throw new Error(
        'Usage: omne-architecture --root <git-root> [--revision <ref>] [--base <ref>] [--out <json-file>]',
      )
    values.set(flag, value)
  }
  const revision = values.get('--revision'),
    base = values.get('--base'),
    out = values.get('--out')
  return {
    root: resolve(values.get('--root') ?? '.'),
    ...(revision === undefined ? {} : { revision }),
    ...(base === undefined ? {} : { base }),
    ...(out === undefined ? {} : { out }),
  }
}
try {
  const args = argumentsOf(process.argv.slice(2))
  const json = `${JSON.stringify(readActualArchitecture(args), null, 2)}\n`
  if (args.out !== undefined) {
    mkdirSync(dirname(args.out), { recursive: true })
    writeFileSync(args.out, json)
  }
  process.stdout.write(json)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}
