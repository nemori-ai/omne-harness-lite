import {
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  lstatSync,
  existsSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseTaskBinding, type TaskBinding } from '../delivery/binding.ts'
import { repository } from './git.ts'
import { parseAudit, parseSource, type PolicySource, type TaskAudit } from './context.ts'
import { modes, type Mode } from './policy.ts'
import {
  array,
  branch,
  canonical,
  choice,
  digest,
  fields,
  json,
  literal,
  sha,
  string,
  IntegrationError,
} from './parse.ts'

export type Candidate = {
  schemaVersion: 1
  operation: string
  mode: Mode
  target: string
  expectedBase: string | null
  auditBase: string
  sources: string[]
  candidate: string
  tree: string
  parents: string[]
  tasks: TaskAudit[]
  policy: PolicySource
  anchor: string
  subject: string
  units: string[]
  checkpoint: string | null
  ownerTask: TaskBinding | null
}
export function parseCandidate(value: unknown): Candidate {
  const v = fields(
    value,
    [
      'schemaVersion',
      'operation',
      'mode',
      'target',
      'expectedBase',
      'auditBase',
      'sources',
      'candidate',
      'tree',
      'parents',
      'tasks',
      'policy',
      'anchor',
      'subject',
      'units',
      'checkpoint',
      'ownerTask',
    ],
    'candidate',
  )
  const target = string(v.target, 'target')
  if (!target.startsWith('refs/heads/'))
    throw new IntegrationError('input-error', 'Candidate target must be a branch ref')
  branch(target.slice(11))
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    operation: operationId(v.operation),
    mode: choice(v.mode, modes, 'mode'),
    target,
    expectedBase: v.expectedBase === null ? null : sha(v.expectedBase),
    auditBase: sha(v.auditBase),
    sources: array(v.sources, 'sources').map(item => sha(item)),
    candidate: sha(v.candidate),
    tree: sha(v.tree),
    parents: array(v.parents, 'parents').map(item => sha(item)),
    tasks: array(v.tasks, 'tasks').map(parseAudit),
    policy: parseSource(v.policy),
    anchor: sha(v.anchor),
    subject: string(v.subject, 'subject'),
    units: array(v.units, 'units').map(item => sha(item)),
    checkpoint: v.checkpoint === null ? null : branch(v.checkpoint, 'checkpoint'),
    ownerTask: v.ownerTask === null ? null : parseTaskBinding(v.ownerTask),
  }
}
export function operationId(value: unknown): string {
  const result = string(value, 'operation')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result))
    throw new IntegrationError('input-error', 'Invalid operation ID')
  return result
}
export function operationHome(root: string, operation: string): string {
  const temporary = join(repository(root).root, 'tmp')
  const operations = join(temporary, 'integration')
  const path = join(operations, operationId(operation))
  for (const directory of [temporary, operations, path]) {
    if (!existsSync(directory)) continue
    if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory())
      throw new IntegrationError(
        'refused',
        'Operation output directory is an alias or not a directory',
      )
  }
  return path
}
export function newOperation(root: string): { operation: string; home: string } {
  const operation = randomUUID(),
    home = operationHome(root, operation)
  mkdirSync(home, { recursive: true })
  return { operation, home }
}
export function writeRecord(home: string, name: string, value: unknown): string {
  if (!/^[a-z0-9-]+\.json$/.test(name))
    throw new IntegrationError('input-error', 'Invalid record name')
  const text = canonical(value),
    hash = digest(text)
  writeFileSync(join(home, name), `${JSON.stringify({ digest: hash, value }, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  return hash
}
export function readRecord(home: string, name: string): { value: unknown; digest: string } {
  const path = join(home, name)
  if (realpathSync(path) !== resolve(path) || !lstatSync(path).isFile())
    throw new IntegrationError('refused', 'Record is not a regular owned file')
  const v = fields(json(readFileSync(path, 'utf8'), name), ['digest', 'value'], name)
  const hash = digest(canonical(v.value))
  if (hash !== v.digest) throw new IntegrationError('refused', `Record ${name} was modified`)
  return { value: v.value, digest: hash }
}
export function readCandidate(root: string, operation: string): Candidate {
  return parseCandidate(readRecord(operationHome(root, operation), 'candidate.json').value)
}
