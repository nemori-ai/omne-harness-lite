import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { openIntegration, type Command } from './engine.ts'
import { fields, integer, json, sha, string, IntegrationError } from './parse.ts'
import { TaskContextError } from '@omne-harness/repo-toolchain/core/task-context'

export function parseCommand(value: unknown): Command {
  const v = fields(
    value,
    ['kind', 'authority', 'issue', 'revision', 'attempt', 'target'],
    'command',
  )
  switch (v.kind) {
    case 'register':
    case 'start':
      fields(v, ['kind', 'authority', 'issue', 'revision', 'attempt'], v.kind)
      return {
        kind: v.kind,
        authority: string(v.authority, 'authority'),
        issue: string(v.issue, 'issue'),
        revision: integer(v.revision, 'revision'),
        attempt: string(v.attempt, 'attempt'),
      }
    case 'task-sync':
      fields(v, ['kind', 'target'], v.kind)
      return { kind: v.kind, target: sha(v.target, 'target') }
    default:
      throw new IntegrationError('input-error', 'Unsupported integration command')
  }
}
async function main(argv: string[]): Promise<void> {
  const [kind, ...args] = argv
  if (kind === '--help' || kind === undefined) {
    process.stdout.write(
      'integration status|baselines|execute [--root PATH] [--base REF] [--input JSON_FILE]\nexecute reads a strict command union; see integration/README.md\n',
    )
    return
  }
  const options = new Map<string, string>()
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i],
      value = args[i + 1]
    if (
      key === undefined ||
      !['--root', '--base', '--input'].includes(key) ||
      value === undefined ||
      options.has(key)
    )
      throw new IntegrationError('input-error', 'Invalid or repeated option')
    options.set(key, value)
  }
  const engine = await openIntegration({ root: resolve(options.get('--root') ?? process.cwd()) })
  let result: unknown
  if (kind === 'status') result = await engine.inspect({ kind: 'status' })
  else if (kind === 'baselines') {
    const base = options.get('--base')
    result = await engine.inspect({
      kind: 'baselines',
      purpose: 'task-check',
      ...(base === undefined ? {} : { explicitBase: base }),
    })
  } else if (kind === 'execute') {
    const path = options.get('--input')
    if (path === undefined) throw new IntegrationError('input-error', 'execute requires --input')
    result = await engine.execute(parseCommand(json(readFileSync(path, 'utf8'), path)))
  } else throw new IntegrationError('input-error', 'Unknown command')
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(
      `${JSON.stringify({ code: error instanceof IntegrationError || error instanceof TaskContextError ? error.code : 'unknown', message: error instanceof Error ? error.message : String(error) })}\n`,
    )
    process.exitCode = 2
  })
}
