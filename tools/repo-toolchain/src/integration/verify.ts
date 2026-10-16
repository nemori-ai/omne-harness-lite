import { scopeViolations } from './audit.ts'
import { repositoryEnv } from '../core/git-environment.ts'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { requireCurrentAdoption, BOOTSTRAP_CHECK_ENV, type BootstrapCheck } from './context.ts'
import { clean, git, parents, requireAncestor } from './git.ts'
import { array, fields, string, sha, canonical, digest, same, IntegrationError } from './parse.ts'
import { operationHome, readCandidate, readRecord, writeRecord, type Candidate } from './records.ts'
import { targetHead } from './transport.ts'
import { captureDigest, currentCapture, deliveryConfig } from './authority.ts'
import { requireCheckpointCoverage, type Policy } from './policy.ts'

export type CommandResult = {
  id: string
  argv: string[]
  cwd: string
  startedAt: string
  finishedAt: string
  exitCode: number | null
  signal: string | null
  log: string
  digest: string
}
export type Receipt = {
  schemaVersion: 1
  candidateDigest: string
  candidate: Candidate
  captureDigest: string
  commands: CommandResult[]
  runner: string
  runnerTree: string
  node: string
  git: string
  verifiedAt: string
}
export function candidateStillExact(candidate: Candidate): void {
  same(
    clean(candidate.subject),
    { head: candidate.candidate, tree: candidate.tree },
    'Candidate changed since it was sealed',
  )
  same(
    parents(candidate.subject, candidate.candidate),
    candidate.parents,
    'Candidate parents changed',
  )
  requireAncestor(candidate.subject, candidate.auditBase, candidate.candidate)
}
export function materializeRunner(root: string, home: string, commit: string): string {
  const runner = join(home, 'runner')
  if (!existsSync(runner)) git(root, ['worktree', 'add', '--detach', runner, commit])
  same(clean(runner).head, commit, 'Trusted runner changed')
  return runner
}
export function runCommands(
  policy: Policy,
  profile: 'integration' | 'full',
  runner: string,
  subject: string,
  home: string,
  candidate: Candidate | null,
  extra: string[] = [],
  bootstrapCheck?: BootstrapCheck,
): CommandResult[] {
  const required = new Set([...policy.profiles[profile], ...extra]),
    results: CommandResult[] = []
  mkdirSync(join(home, 'logs'), { recursive: true })
  for (const id of required) {
    const command = policy.commands.find(item => item.id === id)
    if (command === undefined)
      throw new IntegrationError('unknown', `Required command ${id} is missing`)
    const argv = command.argv.map(arg =>
      arg.replaceAll('{runner}', runner).replaceAll('{subject}', subject),
    )
    const executable = argv[0]
    if (executable === undefined) throw new IntegrationError('input-error', 'Empty command')
    const cwd = command.cwd === 'runner' ? runner : subject
    const startedAt = new Date().toISOString()
    const env: NodeJS.ProcessEnv = {
      ...repositoryEnv(process.env),
      OMNE_SUBJECT_ROOT: subject,
      OMNE_RUNNER_ROOT: runner,
      FULL: profile === 'full' ? '1' : '',
      ...(candidate === null
        ? {}
        : { BASELINE: candidate.auditBase, OMNE_INTEGRATION_OPERATION: candidate.operation }),
    }
    delete env['NODE_OPTIONS']
    delete env[BOOTSTRAP_CHECK_ENV]
    if (bootstrapCheck !== undefined) env[BOOTSTRAP_CHECK_ENV] = JSON.stringify(bootstrapCheck)
    const result = spawnSync(executable, argv.slice(1), {
      cwd,
      env,
      encoding: 'utf8',
      timeout: policy.timeouts.commandMs,
      maxBuffer: 64 * 1024 * 1024,
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error === undefined ? '' : `\n${result.error.message}`}`
    const log = join(home, 'logs', `${results.length}.log`)
    writeFileSync(log, output, { flag: 'wx' })
    results.push({
      id,
      argv,
      cwd,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: result.status,
      signal: result.signal,
      log,
      digest: digest(output),
    })
    if (result.error !== undefined || result.status !== 0) {
      writeRecord(home, 'failed-commands.json', results)
      throw new IntegrationError('refused', `Required command ${id} failed; see ${log}`)
    }
  }
  return results
}
export function verify(
  root: string,
  operation: string,
): { kind: 'verified'; operation: string; receiptDigest: string; receipt: Receipt } {
  const state = requireCurrentAdoption(root),
    candidate = readCandidate(root, operation),
    home = operationHome(root, operation)
  if (candidate.mode === 'checkpoint') requireCheckpointCoverage(state.policy)
  same(state.anchor, candidate.anchor, 'Adoption changed')
  same(state.source, candidate.policy, 'Policy changed')
  same(
    targetHead(root, state.policy, candidate.target),
    candidate.expectedBase,
    'Target base changed',
  )
  candidateStillExact(candidate)
  const scope = scopeViolations(candidate.subject)
  if (scope.length > 0) throw new IntegrationError('refused', scope.join('\n'))
  const config = deliveryConfig(root, state.policy, state.source),
    capture = currentCapture(config)
  const runner = materializeRunner(root, home, candidate.policy.commit)
  const runnerBefore = clean(runner)
  const track = state.policy.tracks.find(track => `refs/heads/${track.branch}` === candidate.target)
  const commands = runCommands(
    state.policy,
    candidate.mode === 'checkpoint' ? 'full' : 'integration',
    runner,
    candidate.subject,
    home,
    candidate,
    track?.checks ?? [],
  )
  candidateStillExact(candidate)
  same(clean(runner), runnerBefore, 'Trusted runner changed during verification')
  same(
    targetHead(root, state.policy, candidate.target),
    candidate.expectedBase,
    'Target changed during verification',
  )
  const receipt: Receipt = {
    schemaVersion: 1,
    candidateDigest: digest(canonical(candidate)),
    candidate,
    captureDigest: captureDigest(capture),
    commands,
    runner,
    runnerTree: runnerBefore.tree,
    node: process.version,
    git: git(root, ['--version']),
    verifiedAt: new Date().toISOString(),
  }
  const receiptDigest = writeRecord(home, 'receipt.json', receipt)
  writeFileSync(join(repositoryReceiptHome(root), operation), receiptDigest, {
    flag: 'wx',
    mode: 0o600,
  })
  return { kind: 'verified', operation, receiptDigest, receipt }
}
import { repository } from './git.ts'
function repositoryReceiptHome(root: string): string {
  const path = join(repository(root).commonDir, 'omne-integration', 'verified')
  mkdirSync(path, { recursive: true })
  return path
}
export function verifiedReceipt(
  root: string,
  candidate: Candidate,
): { digest: string; value: unknown } {
  const record = readRecord(operationHome(root, candidate.operation), 'receipt.json')
  const pin = readFileSync(join(repositoryReceiptHome(root), candidate.operation), 'utf8')
  same(record.digest, pin, 'Receipt does not match verified engine record')
  const value = fields(
    record.value,
    [
      'schemaVersion',
      'candidateDigest',
      'candidate',
      'captureDigest',
      'commands',
      'runner',
      'runnerTree',
      'node',
      'git',
      'verifiedAt',
    ],
    'verified receipt',
  )
  same(value.candidateDigest, digest(canonical(candidate)), 'Receipt belongs to another candidate')
  checkCommandEvidence(value.commands)
  same(
    clean(string(value.runner, 'receipt.runner')),
    { head: candidate.policy.commit, tree: sha(value.runnerTree, 'receipt.runnerTree') },
    'Trusted runner changed since verification',
  )
  candidateStillExact(candidate)
  return record
}
export function checkCommandEvidence(value: unknown): void {
  const commands = array(value, 'commands')
  if (commands.length === 0) throw new IntegrationError('refused', 'Receipt has no commands')
  for (const item of commands) {
    const command = fields(
      item,
      ['id', 'argv', 'cwd', 'startedAt', 'finishedAt', 'exitCode', 'signal', 'log', 'digest'],
      'command evidence',
    )
    same(command.exitCode, 0, 'Required command did not pass')
    same(
      digest(readFileSync(string(command.log, 'command.log'), 'utf8')),
      command.digest,
      'Verification log changed',
    )
  }
}
