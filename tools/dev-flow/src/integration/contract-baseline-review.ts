// The cumulative (milestone) entry of the API semantic review (candidate-r4.md 8.1 to 8.3).
//
// `observeMilestone` reads and fixes the facts: the enablement check, the trusted target, the
// baseline registrations, the real `omne-contract-api --baseline` run and one Comparison per raw
// review member. `checkMilestone` judges them with the predicates of 8.2; `draftMilestone` turns
// them into a draft for a human to sign. Without `--semantic-review` the check keeps the raw
// conservative result unchanged.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  ApiSide,
  Comparison,
  DraftBundle,
  Finding,
  Issue,
  Json,
  MemberResolution,
  MilestonePredicates,
  Repository,
  ReviewFailureCode,
  RunExit,
} from '../delivery/api-review-types.ts'
import { readOwnerIdentity, type OwnerIdentityReading } from '../delivery/api-review-identity.ts'
import { OWNER_IDENTITY_PATH, parseOwnerIdentityManifest } from '../delivery/api-review-owners.ts'
import {
  commentRefOf,
  evidenceChecker,
  foldSemanticReviews,
  readCarrier,
  type RecordAuthority,
} from '../delivery/api-semantic-review.ts'
import {
  mergeRegistrations,
  publishReviewers,
  type BaselineComment,
  type ContractBaseline,
} from '../delivery/baseline.ts'
import { GhReadError, REST_HEADERS, type GhRead } from '../delivery/github-read.ts'
import { LINES_PATH, parseDeliveryLines } from '../delivery/lines.ts'
import { InputError, record as asRecord, text as asText } from '../delivery/protocol.ts'
import { checkEnablement, gitEnablementPorts } from './api-review-enablement.ts'
import {
  anchorFindings,
  composeRunExit,
  enablementFindings,
  hashJson,
  memberSetFindings,
  milestonePredicates,
  resolveMember,
  sideSetFindings,
} from './contract-review.ts'
import { contractApiCommand, contractApiEnv, type ContractApiCommand } from './contract-diff.ts'
import { clean, exactTextBlob, git, GitError } from './git.ts'
import { array, choice, IntegrationError, json, object, string } from './parse.ts'

const POLICY_PATH = 'docs/engineering/integration-policy.json'
const LOCK_PATH = 'pnpm-lock.yaml'
const TOOL_PACKAGE = '@omne-harness/repo-toolchain'
const BASELINE_TIMEOUT_MS = 300_000
const READ_TIMEOUT_MS = 15_000

/** The trusted candidate and direct target of one run (candidate-r4.md 3). */
export type TrustedTarget = { candidate: string; targetBase: string; targetBranch: string }
export type RawRun = { exitCode: number; stdout: string; report: Json }
/** Runs the baseline check on a read-back registration file; `exitCode` is the process status. */
export type BaselineRunner = (file: string) => { exitCode: number | null; stdout: string }

export type MilestoneInput = {
  /** The candidate checkout root. */
  root: string
  /** Path of the running entry module. */
  entry: string
  baselineIssue: number
  call: GhRead
  resolveTrusted(): TrustedTarget
  /** Replaces the installed CLI run. Tests only; the command line never sets it. */
  runBaseline?: BaselineRunner
  now?: () => Date
}

export function installedBaselineRunner(root: string): BaselineRunner {
  return file => {
    const command: ContractApiCommand | { kind: 'unavailable'; reason: string } =
      contractApiCommand()
    if ('kind' in command) throw new IntegrationError('unknown', command.reason)
    const result = spawnSync(
      command.file,
      [...command.args, '--baseline', file, '--json', '--root', root],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: BASELINE_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
        env: contractApiEnv(root),
      },
    )
    if (result.error !== undefined)
      throw new IntegrationError('unknown', `omne-contract-api failed: ${result.error.message}`)
    return { exitCode: result.status, stdout: result.stdout }
  }
}

const sha256 = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex')
const finding = (code: ReviewFailureCode, member: string | null, detail: Json): Finding => ({
  code,
  member,
  detail,
})
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))
/** An error whose cause is a missing or unreadable input, not a defect of this program. */
function isInputFailure(error: unknown): boolean {
  return (
    error instanceof IntegrationError ||
    error instanceof InputError ||
    error instanceof GhReadError ||
    error instanceof SyntaxError
  )
}

type RawMember = {
  directory: string
  status: 'compared' | 'invalid'
  change: 'none' | 'additive' | 'review' | null
  json: Json
}
type RawBaseline = {
  refused: boolean
  undetermined: Json[]
  registration: Json[]
  members: RawMember[]
}
/** The strict read of the fields of `omne-contract-api --baseline --json` that 8.1 names. */
function parseRawBaseline(stdout: string): RawBaseline {
  const v = object(json(stdout, 'omne-contract-api --baseline --json'), 'baseline')
  for (const key of [
    'milestone',
    'change',
    'breakingCards',
    'refused',
    'members',
    'registration',
    'undetermined',
  ])
    if (!(key in v)) throw new IntegrationError('input-error', `baseline.${key} is missing`)
  if (typeof v.refused !== 'boolean')
    throw new IntegrationError('input-error', 'baseline.refused must be a boolean')
  choice(v.change, ['none', 'additive', 'review'], 'baseline.change')
  array(v.breakingCards, 'baseline.breakingCards').forEach((card, index) =>
    string(card, `baseline.breakingCards[${index}]`),
  )
  const members = array(v.members, 'baseline.members').map((item, index): RawMember => {
    const at = `baseline.members[${index}]`
    const m = object(item, at)
    const status = choice(m.status, ['compared', 'invalid'], `${at}.status`)
    return {
      directory: string(m.directory, `${at}.directory`),
      status,
      change:
        status === 'compared'
          ? choice(m.change, ['none', 'additive', 'review'], `${at}.change`)
          : null,
      json: item as Json,
    }
  })
  return {
    refused: v.refused,
    undetermined: array(v.undetermined, 'baseline.undetermined') as Json[],
    registration: array(v.registration, 'baseline.registration') as Json[],
    members,
  }
}

/** Writes the read-back registration to a temporary file, runs the check, removes the file. */
function runOnRegistration(baseline: ContractBaseline, runner: BaselineRunner): RawRun {
  const directory = mkdtempSync(join(tmpdir(), 'omne-baseline-'))
  try {
    const file = join(directory, 'baseline.json')
    writeFileSync(file, JSON.stringify(baseline))
    const result = runner(file)
    if (result.exitCode === null)
      throw new IntegrationError('unknown', 'omne-contract-api ended without an exit code')
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      report: JSON.parse(result.stdout) as Json,
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function typescriptVersion(): string {
  try {
    const toolchain = findPackageJSON(TOOL_PACKAGE, import.meta.url)
    if (toolchain === undefined) throw new Error(`${TOOL_PACKAGE} is not resolvable`)
    const manifest = findPackageJSON('@typescript/typescript6', pathToFileURL(toolchain).href)
    if (manifest === undefined) throw new Error('@typescript/typescript6 is not resolvable')
    return string(object(JSON.parse(readFileSync(manifest, 'utf8')), manifest).version, 'version')
  } catch (error) {
    throw new IntegrationError('unknown', `TypeScript version unreadable: ${message(error)}`)
  }
}

function apiSide(root: string, commit: string, member: string): ApiSide {
  const directory = `${member}/api`
  const apiTree = git(root, ['rev-parse', `${commit}:${directory}`])
  const snapshots = git(root, ['ls-tree', apiTree])
    .split('\n')
    .flatMap(line => {
      const match = /^100644 blob [0-9a-f]{40}\t(.+\.api\.md)$/.exec(line)
      return match?.[1] === undefined ? [] : [match[1]]
    })
    .sort()
    .map(name => ({
      path: `${directory}/${name}`,
      sha256: sha256(exactTextBlob(root, commit, `${directory}/${name}`).text),
    }))
  const manifest = JSON.parse(exactTextBlob(root, commit, `${member}/package.json`).text) as {
    name?: unknown
  }
  if (typeof manifest.name !== 'string' || manifest.name === '')
    throw new IntegrationError('unknown', `${member}/package.json has no name at ${commit}`)
  return { commit, apiTree, packageName: manifest.name, snapshots }
}

export type Observation =
  | { kind: 'blocked'; findings: Finding[] }
  | {
      kind: 'observed'
      raw: RawRun
      refused: boolean
      undetermined: Json[]
      statusesValid: boolean
      registrationsMatch: boolean
      membersComplete: boolean
      members: RawMember[]
      comparisons: Comparison[]
      readings: Map<string, OwnerIdentityReading>
      /** Findings fixed while observing: set checks, identity and anchors. */
      findings: Finding[]
      comments: BaselineComment[]
      repository: Repository
      carrierIssue: Issue
      authority: RecordAuthority
      authoritySha256: string
      /** Reads the trusted target and the checkout again; true when both equal the first read. */
      stable(): boolean
    }

const blocked = (findings: Finding[]): Observation => ({ kind: 'blocked', findings })

function policyFile<T>(root: string, commit: string, path: string, parse: (text: string) => T): T {
  try {
    return parse(exactTextBlob(root, commit, path).text)
  } catch (error) {
    throw new PolicyUnavailable(path, message(error))
  }
}
class PolicyUnavailable extends Error {
  readonly path: string
  constructor(path: string, reason: string) {
    super(reason)
    this.path = path
  }
}

export function observeMilestone(input: MilestoneInput): Observation {
  try {
    return observe(input)
  } catch (error) {
    if (error instanceof PolicyUnavailable)
      return blocked([
        finding('api-review-policy-unavailable', null, { path: error.path, reason: error.message }),
      ])
    if (isInputFailure(error))
      return blocked([finding('api-review-input-unknown', null, { reason: message(error) })])
    throw error
  }
}

function observe(input: MilestoneInput): Observation {
  const { root, call } = input
  let trusted: TrustedTarget | undefined
  const readTrusted = (): TrustedTarget => {
    const target = input.resolveTrusted()
    if (clean(root).head !== target.candidate)
      throw new IntegrationError('refused', 'The checkout HEAD is not the candidate head')
    return target
  }
  const enabled = checkEnablement(
    {
      entry: input.entry,
      root,
      resolveTrusted: () => {
        trusted = readTrusted()
        return { candidate: trusted.candidate, targetBase: trusted.targetBase }
      },
    },
    gitEnablementPorts(root),
  )
  if (trusted === undefined || enabled.enablement.kind !== 'enabled')
    return blocked(enablementFindings(enabled.enablement))
  const { candidate, targetBase, targetBranch } = trusted
  const authoritySha256 = enabled.enablement.authoritySha256

  const lines = policyFile(root, targetBase, LINES_PATH, text =>
    parseDeliveryLines(JSON.parse(text) as unknown),
  )
  const manifest = policyFile(root, targetBase, OWNER_IDENTITY_PATH, parseOwnerIdentityManifest)
  const policyRepository = policyFile(
    root,
    targetBase,
    POLICY_PATH,
    text => (JSON.parse(text) as { repository?: unknown }).repository,
  )
  if (policyRepository !== manifest.repository.name)
    throw new PolicyUnavailable(OWNER_IDENTITY_PATH, 'identity file names another repository')
  const repository = manifest.repository

  const carrier = readCarrier(repository.name, input.baselineIssue, call)
  if (carrier.kind === 'refused')
    return blocked([finding(carrier.code, null, { reason: carrier.detail })])
  const issue = asRecord(
    call(
      [
        'api',
        '--method',
        'GET',
        ...REST_HEADERS,
        `repos/${repository.name}/issues/${input.baselineIssue}`,
      ],
      READ_TIMEOUT_MS,
    ),
    'baseline Issue',
  )
  const milestone = asRecord(issue.milestone, 'baseline Issue milestone')
  const carrierIssue: Issue = {
    number: input.baselineIssue,
    nodeId: asText(issue.node_id, 'Issue.node_id'),
  }
  const number = milestone.number
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1)
    throw new InputError('Milestone number is not a positive integer')
  const milestoneScope = {
    number,
    nodeId: asText(milestone.node_id, 'milestone.node_id'),
    title: asText(milestone.title, 'milestone.title'),
  }

  const isReviewer = publishReviewers(repository.name, call)
  const merged = mergeRegistrations(carrier.comments, isReviewer)
  if (merged.kind === 'refused')
    return blocked([
      finding('api-review-input-unknown', null, { problems: merged.problems.map(p => ({ ...p })) }),
    ])
  if (merged.baseline.milestone !== null && merged.baseline.milestone !== milestoneScope.title)
    return blocked([
      finding('api-review-input-unknown', null, {
        problem: 'registered milestone differs from the Milestone of the baseline Issue',
      }),
    ])
  const registrations = merged.registrations.map(item => {
    const comment = carrier.comments.find(candidateComment => candidateComment.url === item.url)
    if (comment === undefined)
      throw new IntegrationError('unknown', `registration ${item.url} not read`)
    return commentRefOf(comment)
  })

  const raw = runOnRegistration(merged.baseline, input.runBaseline ?? installedBaselineRunner(root))
  const baseline = (() => {
    try {
      return parseRawBaseline(raw.stdout)
    } catch (error) {
      if (!isInputFailure(error)) throw error
      throw new IntegrationError(
        'unknown',
        `baseline output unusable (exit ${raw.exitCode}): ${message(error)}`,
      )
    }
  })()

  const checked = baseline.members.map(item => item.directory)
  const rawReview = baseline.members
    .filter(item => item.change === 'review')
    .map(item => item.directory)
  const review = [...rawReview].sort()
  const setFindings = memberSetFindings({ checked, review, rawReview, member: null })
  const findings: Finding[] = [...setFindings]
  const statusesValid = baseline.members.every(item => item.status === 'compared')

  const readings = new Map<string, OwnerIdentityReading>()
  const comparisons: Comparison[] = []
  const tool = {
    packageName: '@omne-harness/repo-toolchain' as const,
    version: '0.0.18' as const,
    typescriptVersion: typescriptVersion(),
    lockSha256: review.length === 0 ? '' : sha256(exactTextBlob(root, candidate, LOCK_PATH).text),
  }
  for (const member of review) {
    const registered = merged.baseline.members.find(item => item.path === member)
    const rawMember = baseline.members.find(item => item.directory === member)
    const reading = readOwnerIdentity({ repository, member, lines, manifest, call })
    readings.set(member, reading)
    if (reading.finding !== null) {
      findings.push(reading.finding)
      continue
    }
    if (registered === undefined || rawMember === undefined || reading.fact === null) {
      findings.push(
        finding('api-review-input-unknown', member, { problem: 'no registered commit' }),
      )
      continue
    }
    const comparison: Comparison = {
      repository,
      head: candidate,
      targetBranch,
      targetBase,
      authoritySha256,
      ownerIdentity: reading.fact,
      tool,
      scope: {
        kind: 'milestone',
        milestone: milestoneScope,
        baselineIssue: carrierIssue,
        baselineSha256: hashJson(merged.baseline as unknown as Json),
        registrations,
      },
      checkedMembers: checked,
      reviewMembers: review,
      member,
      before: apiSide(root, registered.commit, member),
      after: apiSide(root, candidate, member),
      rawMemberSha256: hashJson(rawMember.json),
    }
    const problems = [
      ...sideSetFindings('before', comparison.before, member),
      ...sideSetFindings('after', comparison.after, member),
      ...anchorFindings(comparison, { registeredCommit: registered.commit }),
    ]
    if (problems.length > 0) findings.push(...problems)
    else comparisons.push(comparison)
  }

  const authority: RecordAuthority = {
    isReviewer,
    ownerOf: member => {
      const reading = readings.get(member)
      return reading !== undefined && reading.finding === null
        ? (reading.fact ?? undefined)
        : undefined
    },
    checkEvidence: evidenceChecker(repository.name, call),
  }
  return {
    kind: 'observed',
    raw,
    refused: baseline.refused,
    undetermined: baseline.undetermined,
    statusesValid,
    registrationsMatch: baseline.registration.length === 0,
    membersComplete: setFindings.length === 0,
    members: baseline.members,
    comparisons,
    readings,
    findings,
    comments: carrier.comments,
    repository,
    carrierIssue,
    authority,
    authoritySha256,
    stable: () => {
      try {
        const again = readTrusted()
        return (
          again.candidate === candidate &&
          again.targetBase === targetBase &&
          again.targetBranch === targetBranch
        )
      } catch (error) {
        if (error instanceof GitError || isInputFailure(error)) return false
        throw error
      }
    },
  }
}

/** Findings for predicates 1 and 2 of 8.2, shared by the check and the draft. */
function inputFindings(observed: Extract<Observation, { kind: 'observed' }>): Finding[] {
  const found: Finding[] = []
  const p = milestonePredicates({
    rawExitCode: observed.raw.exitCode,
    refused: observed.refused,
    undetermined: observed.undetermined as string[],
    statusesValid: observed.statusesValid,
    registrationsMatch: observed.registrationsMatch,
    membersComplete: observed.membersComplete,
    members: [],
    findings: [],
    readsStable: true,
  }).predicates
  if (!p.rawExitMatchesRefused)
    found.push(
      finding('api-review-input-unknown', null, {
        problem: 'raw exit code does not match refused',
        rawExitCode: observed.raw.exitCode,
        refused: observed.refused,
      }),
    )
  if (!p.inputComplete)
    found.push(
      finding('api-review-input-unknown', null, {
        problem: 'baseline input is incomplete',
        undetermined: observed.undetermined,
        statusesValid: observed.statusesValid,
        registrationsMatch: observed.registrationsMatch,
        membersComplete: observed.membersComplete,
      }),
    )
  return found
}

export type MilestoneReport = {
  semanticReview: boolean
  exit: RunExit
  pass: boolean
  /** The exit code of the installed CLI, kept apart from `exit`. */
  rawExitCode: number | null
  refused: boolean | null
  raw: RawRun | null
  predicates: MilestonePredicates | null
  members: MemberResolution[]
  findings: Finding[]
}

function failedReport(semanticReview: boolean, findings: Finding[]): MilestoneReport {
  return {
    semanticReview,
    exit: composeRunExit(findings),
    pass: false,
    rawExitCode: null,
    refused: null,
    raw: null,
    predicates: null,
    members: [],
    findings,
  }
}

/** Without `--semantic-review`: the raw conservative result, reported unchanged. */
function conservative(input: MilestoneInput): MilestoneReport {
  const repository = readRepositoryName(input)
  const carrier = readCarrier(repository, input.baselineIssue, input.call)
  if (carrier.kind === 'refused')
    return failedReport(false, [finding(carrier.code, null, { reason: carrier.detail })])
  const merged = mergeRegistrations(carrier.comments, publishReviewers(repository, input.call))
  if (merged.kind === 'refused')
    return failedReport(false, [
      finding('api-review-input-unknown', null, { problems: merged.problems.map(p => ({ ...p })) }),
    ])
  const raw = runOnRegistration(
    merged.baseline,
    input.runBaseline ?? installedBaselineRunner(input.root),
  )
  const exit: RunExit = raw.exitCode === 0 ? 0 : raw.exitCode === 1 ? 1 : 2
  const refused = (raw.report as { refused?: unknown } | null)?.refused
  return {
    semanticReview: false,
    exit,
    pass: exit === 0,
    rawExitCode: raw.exitCode,
    refused: typeof refused === 'boolean' ? refused : null,
    raw,
    predicates: null,
    members: [],
    findings:
      exit === 2 ? [finding('api-review-input-unknown', null, { rawExitCode: raw.exitCode })] : [],
  }
}
function readRepositoryName(input: MilestoneInput): string {
  const head = git(input.root, ['rev-parse', 'HEAD'])
  const policy = JSON.parse(exactTextBlob(input.root, head, POLICY_PATH).text) as {
    repository?: unknown
  }
  if (typeof policy.repository !== 'string')
    throw new IntegrationError('unknown', `${POLICY_PATH} has no repository`)
  return policy.repository
}

/** `check-milestone`. `semanticReview` false keeps the raw conservative cumulative result. */
export function checkMilestone(
  input: MilestoneInput & { semanticReview: boolean },
): MilestoneReport {
  if (!input.semanticReview) {
    try {
      return conservative(input)
    } catch (error) {
      if (!isInputFailure(error)) throw error
      return failedReport(false, [
        finding('api-review-input-unknown', null, { reason: message(error) }),
      ])
    }
  }
  const observed = observeMilestone(input)
  if (observed.kind === 'blocked') return failedReport(true, observed.findings)
  try {
    return judge(observed)
  } catch (error) {
    if (!isInputFailure(error)) throw error
    return failedReport(true, [
      finding('api-review-input-unknown', null, { reason: message(error) }),
    ])
  }
}

function judge(observed: Extract<Observation, { kind: 'observed' }>): MilestoneReport {
  const findings = [...observed.findings]
  const folded = foldSemanticReviews({
    repository: observed.repository,
    comments: observed.comments,
    expected: observed.comparisons,
    authority: observed.authority,
  })
  const members: MemberResolution[] = []
  for (const member of observed.members) {
    const raw = member.change ?? 'review'
    const reading = observed.readings.get(member.directory)
    const identity =
      reading === undefined
        ? null
        : {
            line: reading.line,
            loginCaseOnly: reading.loginCaseOnly,
            adoption: reading.adoption ?? ({ kind: 'unreadable', reason: 'not read' } as const),
          }
    const verdict = folded.members.find(item => item.member === member.directory)
    if (raw !== 'review' || verdict === undefined) {
      // Raw none and additive need no record. A review member without a Comparison (identity or
      // anchor failure) or an invalid member already has its finding in this run; it gets the
      // strictest level, so no binding can consume it.
      members.push(
        resolveMember({
          member: member.directory,
          raw,
          semantic: null,
          record: null,
          authority: null,
          identity,
        }).resolution,
      )
      continue
    }
    if (verdict.kind === 'valid') {
      members.push(
        resolveMember({
          member: member.directory,
          raw,
          semantic: verdict.conclusion,
          record: verdict.record,
          authority: verdict.authority,
          identity,
        }).resolution,
      )
      continue
    }
    members.push(
      resolveMember({
        member: member.directory,
        raw,
        semantic: null,
        record: null,
        authority: null,
        identity,
        failure: verdict.code,
      }).resolution,
    )
    findings.push(
      finding(
        verdict.code,
        member.directory,
        verdict.problems.map(problem => ({ ...problem })),
      ),
    )
  }

  const stable = observed.stable()
  const { pass, predicates } = milestonePredicates({
    rawExitCode: observed.raw.exitCode,
    refused: observed.refused,
    undetermined: observed.undetermined as string[],
    statusesValid: observed.statusesValid,
    registrationsMatch: observed.registrationsMatch,
    membersComplete: observed.membersComplete,
    members,
    findings,
    readsStable: stable,
  })
  findings.push(...inputFindings(observed))
  if (!predicates.noBreakingConclusion)
    for (const member of members)
      if (member.semanticClassification === 'breaking')
        findings.push(finding('api-review-breaking-route-required', member.member, null))
  if (!stable)
    findings.push(
      finding('api-review-source-changed', null, {
        problem: 'the trusted target or the checkout changed between the two reads',
      }),
    )
  return {
    semanticReview: true,
    exit: pass ? 0 : (Math.max(1, composeRunExit(findings)) as RunExit),
    pass,
    rawExitCode: observed.raw.exitCode,
    refused: observed.refused,
    raw: observed.raw,
    predicates,
    members,
    findings,
  }
}

export type DraftOutcome = { exit: RunExit; findings: Finding[]; bundle: DraftBundle | null }

/** `draft-milestone`: the comparisons to sign, or the findings that stop a draft. */
export function draftMilestone(input: MilestoneInput): DraftOutcome {
  const observed = observeMilestone(input)
  if (observed.kind === 'blocked')
    return { exit: composeRunExit(observed.findings), findings: observed.findings, bundle: null }
  const findings = [...observed.findings, ...inputFindings(observed)]
  if (findings.length > 0) return { exit: composeRunExit(findings), findings, bundle: null }
  return {
    exit: 0,
    findings,
    bundle: {
      schemaVersion: 1,
      kind: 'draft',
      comparisons: observed.comparisons,
      raw: {
        exitCode: observed.raw.exitCode,
        stdoutSha256: sha256(observed.raw.stdout),
        report: observed.raw.report,
      },
      facts: {
        observedAt: (input.now ?? (() => new Date()))().toISOString(),
        carrierIssue: observed.carrierIssue,
      },
    },
  }
}
