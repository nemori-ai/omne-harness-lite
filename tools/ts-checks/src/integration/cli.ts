import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { openIntegration, type Command } from './engine.ts'
import { array, choice, fields, integer, json, sha, string, IntegrationError } from './parse.ts'
import { TaskContextError } from '../core/task-context.ts'
import { modes } from './policy.ts'
import { parseAudit } from './context.ts'
import { validatePrepare, type Source } from './candidate.ts'

function parseProvenance(value: unknown) {
  const v = fields(value, ['harness', 'role'], 'provenance')
  return { harness: string(v.harness, 'harness'), role: string(v.role, 'role') }
}
export function parseCommand(value: unknown): Command {
  const v = fields(
    value,
    [
      'kind',
      'mode',
      'sources',
      'track',
      'checkpoint',
      'declaredTasks',
      'initialAudit',
      'authority',
      'issue',
      'revision',
      'attempt',
      'operation',
      'legacy',
      'entry',
      'title',
      'provenance',
    ],
    'command',
  )
  switch (v.kind) {
    case 'policy-handoff':
    case 'policy-check':
    case 'bootstrap':
      fields(v, ['kind'], 'bootstrap')
      return { kind: v.kind }
    case 'register':
    case 'start':
      fields(v, ['kind', 'authority', 'issue', 'revision', 'attempt'], 'start')
      return {
        kind: v.kind,
        authority: string(v.authority, 'authority'),
        issue: string(v.issue, 'issue'),
        revision: integer(v.revision, 'revision'),
        attempt: string(v.attempt, 'attempt'),
      }
    case 'prepare':
      fields(
        v,
        [
          'kind',
          'mode',
          'sources',
          'track',
          'checkpoint',
          'declaredTasks',
          'initialAudit',
          'title',
          'provenance',
        ],
        'prepare',
      )
      return validatePrepare({
        kind: 'prepare',
        ...(v.title === undefined ? {} : { title: string(v.title, 'title') }),
        ...(v.provenance === undefined ? {} : { provenance: parseProvenance(v.provenance) }),
        mode: choice(v.mode, modes, 'mode'),
        sources: array(v.sources, 'sources').map((item): Source => {
          const s = fields(item, ['kind', 'source', 'track'], 'source'),
            kind = choice(s.kind, ['main', 'track', 'work'], 'source.kind')
          if (kind !== 'track') fields(s, ['kind', 'source'], 'source')
          return kind === 'track'
            ? { kind, source: sha(s.source), track: string(s.track, 'track') }
            : { kind, source: sha(s.source) }
        }),
        ...(v.track === undefined ? {} : { track: string(v.track, 'track') }),
        ...(v.checkpoint === undefined ? {} : { checkpoint: string(v.checkpoint, 'checkpoint') }),
        ...(v.initialAudit === undefined ? {} : { initialAudit: sha(v.initialAudit) }),
        ...(v.declaredTasks === undefined
          ? {}
          : { declaredTasks: array(v.declaredTasks, 'declaredTasks').map(parseAudit) }),
      })
    case 'seal':
    case 'verify':
    case 'resume':
      fields(v, ['kind', 'operation'], v.kind)
      return { kind: v.kind, operation: string(v.operation, 'operation') }
    case 'publish':
    case 'policy-adopt':
    case 'activate':
    case 'track-bootstrap':
      fields(v, ['kind', 'operation', 'authority'], v.kind)
      return {
        kind: v.kind,
        operation: string(v.operation, 'operation'),
        authority: string(v.authority, 'authority'),
      }
    case 'activation-check': {
      fields(v, ['kind', 'legacy'], v.kind)
      const legacy = array(v.legacy, 'legacy').map(item => {
        const l = fields(item, ['root', 'gitDir', 'branch', 'head', 'task'], 'legacy')
        return {
          root: string(l.root, 'root'),
          gitDir: string(l.gitDir, 'gitDir'),
          branch: string(l.branch, 'branch'),
          head: sha(l.head),
          task: string(l.task, 'task'),
        }
      })
      return { kind: v.kind, legacy }
    }
    case 'track-register':
      fields(v, ['kind', 'entry'], v.kind)
      return { kind: v.kind, entry: v.entry }
    case 'track-bootstrap-plan':
    case 'track-retire':
      fields(v, ['kind', 'track'], v.kind)
      return { kind: v.kind, track: string(v.track, 'track') }
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
