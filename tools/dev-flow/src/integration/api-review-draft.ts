// The card and RI entries of the API semantic review (candidate-r4.md 3.3 and 8.5), and the
// logic of `draft-card` and `draft-ri`. `api-review-cli.ts` calls the draft functions.
//
// One kernel, `semanticReview`, serves both entries: enablement first (3.2), then the raw
// `omne-contract-api` result, the owner identity of each review member, one Comparison per member,
// and in check mode the fold of the carrier records. Each entry only collects its own scope facts.
// The kernel decides nothing about authority itself: it joins the readers of the first wave
// (`api-review-enablement`, `api-review-identity`, `api-semantic-review`, `contract-review`).
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { readOwnerIdentity } from '../delivery/api-review-identity.ts'
import { OWNER_IDENTITY_PATH, parseOwnerIdentityManifest } from '../delivery/api-review-owners.ts'
import {
  evidenceChecker,
  foldSemanticReviews,
  parseRecordComment,
  readCarrier,
} from '../delivery/api-semantic-review.ts'
import { publishReviewers, readCommentByUrl, readComments } from '../delivery/baseline.ts'
import { readTaskBinding, type TaskBinding } from '../delivery/binding.ts'
import {
  cardReviewInput,
  type CardReview,
  type CardReviewInput,
  type CardSemantic,
} from '../delivery/change-scope.ts'
import { fetchIssueCard, GhReadError, REST_HEADERS, type GhRead } from '../delivery/github-read.ts'
import { LINES_PATH, parseDeliveryLines } from '../delivery/lines.ts'
import { InputError, record, text } from '../delivery/protocol.ts'
import { taskWorkspace } from './context.ts'
import { checkUpstream } from './upstream.ts'
import { parseDispatchDecision } from './authority.ts'
import {
  checkEnablement,
  gitEnablementPorts,
  type EnablementPorts,
} from './api-review-enablement.ts'
import {
  anchorFindings,
  composeRunExit,
  enablementFindings,
  hashJson,
  memberSetFindings,
  resolveMember,
  sideSetFindings,
  type AdoptionDiagnostic,
  type ApiSide,
  type BindingInput,
  type Comparison,
  type CommentRef,
  type Enablement,
  type Finding,
  type Issue,
  type Json,
  type MemberResolution,
  type OwnerIdentityFact,
  type Repository,
  type ReviewFailureCode,
  type RunExit,
  type Scope,
  type SourcePr,
  type UnitInput,
} from './contract-review.ts'
import {
  contractApiCommand,
  parseDiffRun,
  rawDiffMembers,
  runDiff,
  snapshotContractDiffWith,
  toolOf,
} from './contract-diff.ts'
import { blob, clean, exactTextBlob, git, GitError } from './git.ts'
import { IntegrationError, json, section } from './parse.ts'
import {
  riNotes,
  riNotesExitCode,
  type ContractDiff,
  type RiInput,
  type RiNotes,
} from './ri-notes.ts'
import { riInput, UNIT_PREFIX } from './ri-source.ts'
import { remoteRefs, targetHead } from './transport.ts'

export type ReviewEnv = {
  /** The running entry module; enablement step 1 checks that it lies under `<root>/tools/dev-flow/src`. */
  entry: string
  /** Every platform read. Tests replace it; the CLIs pass `runGhRead`. */
  call: GhRead
  ports?: EnablementPorts
}
export type ReviewReport = {
  mode: 'draft' | 'check'
  enablement: Enablement
  /** The exit code of the raw CLI run; null when the run did not happen. */
  rawExitCode: number | null
  exit: RunExit
  members: MemberResolution[]
  findings: Finding[]
  ignored: CommentRef[]
}
export type DraftBundle = {
  schemaVersion: 1
  kind: 'draft'
  comparisons: Comparison[]
  raw: { exitCode: number; stdoutSha256: string; report: Json }
  facts: { observedAt: string; carrierIssue: Issue }
}
type Levels = Map<string, 'additive' | 'breaking'>
type Outcome = {
  report: ReviewReport
  comparisons: Comparison[]
  levels: Levels
  records: Map<string, string>
  bundle: DraftBundle | null
}

const TIMEOUT_MS = 15_000
const DIFF_TIMEOUT_MS = 120_000
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const asJson = (value: unknown): Json => value as Json
/** The path in the spelling the platform reports (Windows 8.3 short names expand), or as given. */
function spelled(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}
const finding = (code: ReviewFailureCode, member: string | null, detail: Json): Finding => ({
  code,
  member,
  detail,
})

function knownFailure(error: unknown): string | undefined {
  if (error instanceof IntegrationError || error instanceof InputError) return error.message
  if (error instanceof GhReadError) return error.message
  return undefined
}
const get = (call: GhRead, path: string): unknown =>
  call(['api', '--method', 'GET', ...REST_HEADERS, path], TIMEOUT_MS)

// ---------------------------------------------------------------------------------------------
// Facts shared by the entries
// ---------------------------------------------------------------------------------------------

/** One side of a Comparison: the member tree, its package name and every `*.api.md` snapshot. */
function sideOf(root: string, commit: string, member: string): ApiSide {
  const apiTree = git(root, ['rev-parse', `${commit}:${member}/api`])
  const snapshots = git(root, ['ls-tree', '-r', '--name-only', commit, '--', `${member}/api`])
    .split('\n')
    .filter(path => path.endsWith('.api.md'))
    .sort()
    .map(path => ({ path, sha256: sha256(exactTextBlob(root, commit, path).text) }))
  const manifest = json(exactTextBlob(root, commit, `${member}/package.json`).text, member)
  return {
    commit,
    apiTree,
    packageName: text(record(manifest, `${member}/package.json`).name, `${member} package name`),
    snapshots,
  }
}
/** The dispatch comment of a card as a CommentRef; a mismatch is reported as findings. */
function dispatchOf(
  repository: string,
  binding: TaskBinding,
  call: GhRead,
): { ref: CommentRef; pre: Finding[] } {
  const read = readCommentByUrl(repository, binding.dispatch, call)
  if (read.kind === 'foreign')
    throw new IntegrationError('refused', `Dispatch ${binding.dispatch} is not a comment URL`)
  if (read.kind === 'failed') throw read.error
  if (read.kind === 'unexplained') throw new InputError(read.reason)
  const { comment } = read
  if (comment.htmlUrl !== binding.dispatch)
    throw new IntegrationError('refused', 'The dispatch comment URL differs from the binding')
  const { body, author } = comment
  const login = author.login
  const pre: Finding[] = []
  const decision = parseDispatchDecision(section(body, 'omne-integration-authority:v1'))
  if (hashJson(asJson(decision.task)) !== hashJson(asJson(binding)))
    pre.push(
      finding('api-review-unauthorized', null, { reason: 'dispatch decision names another task' }),
    )
  if (decision.responsible !== login || !publishReviewers(repository, call)(author))
    pre.push(
      finding('api-review-unauthorized', null, {
        reason: 'dispatch author is not a live reviewer',
      }),
    )
  return {
    ref: {
      url: binding.dispatch,
      bodySha256: comment.bodySha256,
      updatedAt: comment.updatedAt,
    },
    pre,
  }
}
/** The live card read as a BindingInput; a binding that differs from `binding` is a finding. */
function bindingInputOf(
  repository: string,
  binding: TaskBinding,
  call: GhRead,
): { input: BindingInput; issue: Issue; pre: Finding[] } {
  const card = fetchIssueCard(repository, binding.issue.number, call)
  const live = readTaskBinding(card.body, card.identity)
  const pre: Finding[] = []
  if (live === undefined || hashJson(asJson(live)) !== hashJson(asJson(binding)))
    pre.push(
      finding('api-review-source-changed', null, {
        reason: 'the live binding differs from the one this review was asked about',
      }),
    )
  const dispatch = dispatchOf(repository, binding, call)
  const issue = { number: binding.issue.number, nodeId: card.identity.id }
  return {
    input: {
      issue,
      revision: binding.revision,
      attempt: binding.attempt,
      bindingSha256: hashJson(asJson(binding)),
      dispatch: dispatch.ref,
    },
    issue,
    pre: [...pre, ...dispatch.pre],
  }
}

// ---------------------------------------------------------------------------------------------
// The kernel
// ---------------------------------------------------------------------------------------------
type Trusted = { candidate: string; targetBase: string }
type Collected = {
  repository: string
  scope: Scope
  /** `before.commit` of every Comparison. */
  base: string
  head: string
  targetBranch: string
  targetBase: string
  raw: { exitCode: number; stdout: string }
  carrier: Issue
  /** The complete sorted checked set. */
  checked: string[]
  /** Contract members of the two line tables; each must appear in the raw result. */
  union?: string[]
  pre: Finding[]
  fingerprint: () => string
}
type Collection = Collected | { unavailable: string }

function semanticReview<T extends Trusted>(o: {
  root: string
  env: ReviewEnv
  mode: 'draft' | 'check'
  resolve: () => T
  collect: (trusted: T) => Collection
}): Outcome {
  const { root, env, mode } = o
  const empty = (report: ReviewReport): Outcome => ({
    report,
    comparisons: [],
    levels: new Map(),
    records: new Map(),
    bundle: null,
  })
  const stopped = (
    enablement: Enablement,
    findings: Finding[],
    rawExitCode: number | null = null,
  ): Outcome =>
    empty({
      mode,
      enablement,
      rawExitCode,
      exit: composeRunExit(findings),
      members: [],
      findings,
      ignored: [],
    })

  let trusted: T | undefined
  const enabled = checkEnablement(
    {
      entry: spelled(env.entry),
      root: spelled(root),
      resolveTrusted: () => (trusted = o.resolve()),
    },
    env.ports ?? gitEnablementPorts(root),
  )
  if (enabled.enablement.kind !== 'enabled' || trusted === undefined)
    return stopped(enabled.enablement, enablementFindings(enabled.enablement))
  const enablement = enabled.enablement
  try {
    const collected = o.collect(trusted)
    if ('unavailable' in collected)
      return stopped(enablement, [
        finding('api-review-input-unknown', null, {
          reason: `the snapshot difference is unavailable: ${collected.unavailable}`,
        }),
      ])
    return review(collected, enablement.authoritySha256)
  } catch (error) {
    const reason = knownFailure(error)
    if (reason === undefined) throw error
    return stopped(enablement, [finding('api-review-input-unknown', null, { reason })])
  }

  function review(c: Collected, authoritySha256: string): Outcome {
    const call = env.call
    const before = c.fingerprint()
    const findings: Finding[] = [...c.pre]
    const resolutions = new Map<string, MemberResolution>()
    const identities = new Map<string, MemberResolution['identity']>()
    const failMember = (
      member: string,
      code: ReviewFailureCode,
      detail: Json,
      raw: MemberResolution['rawClassification'] = 'review',
    ): void => {
      const { resolution } = resolveMember({
        member,
        raw,
        semantic: null,
        record: null,
        authority: null,
        failure: code,
        ...(identities.get(member) === undefined
          ? {}
          : { identity: identities.get(member) ?? null }),
      })
      resolutions.set(member, resolution)
      findings.push(finding(code, member, detail))
    }

    const repositoryNode = text(
      record(get(call, `repos/${c.repository}`), 'repository').node_id,
      'repository.node_id',
    )
    const repository: Repository = { name: c.repository, nodeId: repositoryNode }
    const diff = parseDiffRun(c.raw.stdout)
    const rawMembers = rawDiffMembers(c.raw.stdout)
    if (diff.commit !== c.base)
      findings.push(
        finding('api-review-input-unknown', null, {
          reason: `the CLI compared ${diff.commit}, not ${c.base}`,
        }),
      )

    const reviewMembers: string[] = []
    for (const member of c.checked) {
      const entry = diff.members.find(item => item.directory === member)
      if (entry === undefined)
        failMember(member, 'api-review-input-unknown', { reason: 'not in the diff' })
      else if (entry.status === 'invalid')
        failMember(member, 'api-review-input-unknown', { reason: entry.message })
      else if (entry.change === 'review') reviewMembers.push(member)
      else
        resolutions.set(
          member,
          resolveMember({
            member,
            raw: entry.change,
            semantic: null,
            record: null,
            authority: null,
          }).resolution,
        )
    }
    findings.push(
      ...memberSetFindings({
        checked: c.checked,
        review: reviewMembers,
        rawReview: reviewMembers,
        member: null,
      }),
    )
    const missing = (c.union ?? []).filter(member => !c.checked.includes(member))
    if (missing.length > 0)
      findings.push(
        finding('api-review-input-unknown', null, {
          set: 'checkedMembers',
          problems: missing.map(member => `contract member absent from the raw result: ${member}`),
        }),
      )

    const comparisons: Comparison[] = []
    const facts = new Map<string, OwnerIdentityFact>()
    if (reviewMembers.length > 0) {
      let lines, manifest
      try {
        lines = parseDeliveryLines(json(blob(root, c.targetBase, LINES_PATH).text, LINES_PATH))
        manifest = parseOwnerIdentityManifest(blob(root, c.targetBase, OWNER_IDENTITY_PATH).text)
      } catch (error) {
        findings.push(
          finding('api-review-policy-unavailable', null, {
            reason: error instanceof Error ? error.message : 'unreadable',
          }),
        )
        return finish(c, before, findings, resolutions, comparisons, null, [])
      }
      const tool = toolOf(root, c.head)
      for (const member of reviewMembers) {
        const reading = readOwnerIdentity({ repository, member, lines, manifest, call })
        if (reading.adoption !== null)
          identities.set(member, {
            line: reading.line,
            loginCaseOnly: reading.loginCaseOnly,
            adoption: reading.adoption satisfies AdoptionDiagnostic,
          })
        if (reading.finding !== null || reading.fact === null) {
          failMember(
            member,
            reading.finding?.code ?? 'api-review-owner-identity-missing',
            reading.finding?.detail ?? null,
          )
          continue
        }
        let comparison: Comparison
        try {
          comparison = {
            repository,
            head: c.head,
            targetBranch: c.targetBranch,
            targetBase: c.targetBase,
            authoritySha256,
            ownerIdentity: reading.fact,
            tool,
            scope: c.scope,
            checkedMembers: c.checked,
            reviewMembers,
            member,
            before: sideOf(root, c.base, member),
            after: sideOf(root, c.head, member),
            rawMemberSha256: hashJson(asJson(rawMembers.get(member))),
          }
        } catch (error) {
          if (!(error instanceof GitError) && knownFailure(error) === undefined) throw error
          failMember(member, 'api-review-input-unknown', {
            reason: error instanceof Error ? error.message : 'side unreadable',
          })
          continue
        }
        const problems = [
          ...sideSetFindings('before', comparison.before, member),
          ...sideSetFindings('after', comparison.after, member),
          ...anchorFindings(comparison, {}),
        ]
        if (problems.length > 0) {
          failMember(member, problems[0]?.code ?? 'api-review-input-unknown', asJson(problems))
          continue
        }
        comparisons.push(comparison)
        facts.set(member, reading.fact)
      }
    }
    return finish(c, before, findings, resolutions, comparisons, repository, [...facts])

    function finish(
      cc: Collected,
      fingerprintBefore: string,
      all: Finding[],
      done: Map<string, MemberResolution>,
      list: Comparison[],
      repo: Repository | null,
      ownerFacts: [string, OwnerIdentityFact][],
    ): Outcome {
      const levels: Levels = new Map()
      const records = new Map<string, string>()
      let ignored: CommentRef[] = []
      if (mode === 'check' && repo !== null && list.length > 0) {
        const read = readCarrier(repo.name, cc.carrier.number, call)
        if (read.kind === 'refused') {
          for (const item of list)
            if (!done.has(item.member))
              failMember(item.member, read.code, {
                carrier: cc.carrier.number,
                reason: read.detail,
              })
        } else {
          const owners = new Map(ownerFacts)
          const folded = foldSemanticReviews({
            repository: repo,
            comments: read.comments,
            expected: list,
            authority: {
              isReviewer: publishReviewers(repo.name, call),
              ownerOf: member => owners.get(member),
              checkEvidence: evidenceChecker(repo.name, call),
            },
          })
          ignored = folded.ignored
          for (const verdict of folded.members) {
            if (verdict.kind === 'valid') {
              const resolved = resolveMember({
                member: verdict.member,
                raw: 'review',
                semantic: verdict.conclusion,
                record: verdict.record,
                authority: verdict.authority,
                ...(identities.get(verdict.member) === undefined
                  ? {}
                  : { identity: identities.get(verdict.member) ?? null }),
              })
              done.set(verdict.member, resolved.resolution)
              all.push(...resolved.findings)
              levels.set(verdict.member, verdict.conclusion)
              records.set(verdict.member, verdict.record.url)
            } else failMember(verdict.member, verdict.code, asJson(verdict.problems))
          }
        }
      }
      if (cc.fingerprint() !== fingerprintBefore)
        all.push(
          finding('api-review-source-changed', null, {
            reason: 'HEAD, the working tree or the target head changed during the review',
          }),
        )
      const report: ReviewReport = {
        mode,
        enablement,
        rawExitCode: cc.raw.exitCode,
        exit: composeRunExit(all),
        members: cc.checked.flatMap(member => done.get(member) ?? []),
        findings: all,
        ignored,
      }
      const bundle: DraftBundle | null =
        mode === 'draft' && report.exit === 0
          ? {
              schemaVersion: 1,
              kind: 'draft',
              comparisons: list,
              raw: {
                exitCode: cc.raw.exitCode,
                stdoutSha256: sha256(cc.raw.stdout),
                report: asJson(JSON.parse(cc.raw.stdout)),
              },
              facts: { observedAt: new Date().toISOString(), carrierIssue: cc.carrier },
            }
          : null
      return { report, comparisons: list, levels, records, bundle }
    }
  }
}

const fingerprintOf = (root: string, remoteHead: () => string | null) => () =>
  [
    git(root, ['rev-parse', 'HEAD']),
    git(root, ['status', '--porcelain=v1', '--untracked-files=all']),
    remoteHead() ?? 'absent',
  ].join('|')

// ---------------------------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------------------------
function cardOutcome(input: CardReviewInput, env: ReviewEnv, mode: 'draft' | 'check'): Outcome {
  const { root, binding } = input
  const repository = binding.issue.repository
  return semanticReview({
    root,
    env,
    mode,
    resolve: () => {
      const state = taskWorkspace(root)
      const upstream = checkUpstream(root, state.policy, binding.route)
      return {
        candidate: git(root, ['rev-parse', 'HEAD']),
        targetBase: upstream.head,
        ref: upstream.ref,
        policy: state.policy,
      }
    },
    collect: trusted => {
      clean(root)
      const pre: Finding[] = []
      if (input.context.targetBase !== trusted.targetBase)
        pre.push(
          finding('api-review-source-changed', null, {
            reason:
              'the context targetBase is not the target head; merge the target, then task-sync',
            contextTargetBase: input.context.targetBase,
            targetHead: trusted.targetBase,
          }),
        )
      const bound = bindingInputOf(repository, binding, env.call)
      pre.push(...bound.pre)
      return {
        repository,
        scope: { kind: 'card', card: bound.input, base: binding.taskBase },
        base: binding.taskBase,
        head: trusted.candidate,
        targetBranch: trusted.ref,
        targetBase: trusted.targetBase,
        raw: rawDiff(root, binding.taskBase),
        carrier: bound.issue,
        checked: [...input.touched].sort(),
        pre,
        fingerprint: fingerprintOf(root, () => targetHead(root, trusted.policy, trusted.ref)),
      }
    },
  })
}
function rawDiff(root: string, base: string): { exitCode: number; stdout: string } {
  const command = contractApiCommand()
  if ('kind' in command) throw new IntegrationError('unknown', command.reason)
  const ran = runDiff(command, { root, base, timeoutMs: DIFF_TIMEOUT_MS })
  if (ran.kind === 'unavailable') throw new IntegrationError('unknown', ran.reason)
  return { exitCode: 0, stdout: ran.stdout }
}

function toSemantic(outcome: Outcome): CardSemantic {
  const { report } = outcome
  return {
    exit: report.exit,
    rawExitCode: report.rawExitCode,
    findings: report.findings.map(({ code, member, detail }) => ({ code, member, detail })),
    members: report.members,
    levels: Object.fromEntries(outcome.levels),
  }
}
/**
 * The semantic review path of `changeScope` for a card. It reads the carrier (the card Issue)
 * once to see whether any review record exists. Without one the conservative rule stands
 * (`undefined`). With one the strict path runs, and every record is judged.
 */
export function cardReviewHook(env: ReviewEnv): CardReview {
  return input => {
    const { binding } = input
    const comments = readComments(binding.issue.repository, binding.issue.number, env.call)
    if (comments.every(item => parseRecordComment(item.body).kind === 'none')) return undefined
    return toSemantic(cardOutcome(input, env, 'check'))
  }
}
/** `draft-card`: the Comparison of each review member of this card, for a human to sign. */
export function draftCard(env: ReviewEnv & { root: string }): {
  report: ReviewReport
  bundle: DraftBundle | null
} {
  const outcome = cardOutcome(cardReviewInput(env.root), env, 'draft')
  return { report: outcome.report, bundle: outcome.bundle }
}

// ---------------------------------------------------------------------------------------------
// RI
// ---------------------------------------------------------------------------------------------
type RiRequest = ReviewEnv & { root: string; track: string; reviewIssue: number }
const byNumber = (a: number, b: number) => a - b

function riOutcome(
  request: RiRequest,
  mode: 'draft' | 'check',
): { outcome: Outcome; first: RiNotes | null; once: RiInput | null } {
  const { root } = request
  const env: ReviewEnv = request
  let first: RiNotes | null = null
  let once: RiInput | null = null
  let rawStdout: string | undefined
  const outcome = semanticReview({
    root,
    env,
    mode,
    resolve: () => {
      const facts = riInput({
        root,
        track: request.track,
        read: request.call,
        contractDiffProvider: snapshotContractDiffWith(stdout => {
          rawStdout = stdout
        }),
      })
      return { candidate: facts.head, targetBase: facts.parent.head, facts }
    },
    collect: ({ facts }): Collection => {
      let diff: ContractDiff | undefined
      once = { ...facts, diffContracts: range => (diff ??= facts.diffContracts(range)) }
      first = riNotes(once)
      if (first.contractCheck.kind === 'unavailable')
        return { unavailable: first.contractCheck.reason }
      if (rawStdout === undefined)
        throw new IntegrationError('unknown', 'The raw CLI output was not captured')
      const policy = facts.policy
      if (policy === undefined) throw new IntegrationError('invariant', 'The registry is missing')
      const repository = policy.repository
      const pre: Finding[] = []
      if (first.contractGaps.length > 0)
        throw new IntegrationError(
          'refused',
          `${first.contractGaps.length} unknown contract declarations in the range`,
        )
      // Units: every commit that needs one, with its annotated tag object.
      const tags = remoteRefs(
        root,
        policy.transport.location,
        policy.timeouts.networkMs,
        `${UNIT_PREFIX}*`,
      )
      const units: UnitInput[] = facts.commits
        .filter(commit => commit.coverage === 'checked')
        .map(commit => {
          const tagObject = tags.get(`${UNIT_PREFIX}${commit.commit}`)
          if (
            commit.unit.kind !== 'found' ||
            commit.unit.record.pr === null ||
            tagObject === undefined
          )
            throw new IntegrationError('unknown', `Commit ${commit.commit} has no usable unit`)
          return { commit: commit.commit, tagObject, pr: commit.unit.record.pr }
        })
      const prNumbers = [
        ...new Set(first.commits.flatMap(commit => (commit.pr === null ? [] : [commit.pr.number]))),
      ].sort(byNumber)
      const prs: SourcePr[] = prNumbers.map(number => {
        const raw = record(get(request.call, `repos/${repository}/pulls/${number}`), `PR ${number}`)
        const body = raw.body === null ? '' : text(raw.body, 'PR.body')
        return {
          number,
          nodeId: text(raw.node_id, 'PR.node_id'),
          bodySha256: sha256(body),
          head: text(record(raw.head, 'PR.head').sha, 'PR.head.sha'),
          baseRef: text(record(raw.base, 'PR.base').ref, 'PR.base.ref'),
        }
      })
      const cards: BindingInput[] = []
      let carrier: Issue | undefined
      for (const card of first.cards) {
        if (card.inferred)
          throw new IntegrationError('refused', `Card #${card.issue} was inferred, not declared`)
        const fetched = fetchIssueCard(repository, card.issue, request.call)
        const live = readTaskBinding(fetched.body, fetched.identity)
        if (live === undefined)
          throw new IntegrationError('refused', `Card #${card.issue} has no binding`)
        if (live.revision !== card.revision || live.attempt !== card.attempt)
          pre.push(
            finding('api-review-source-changed', null, {
              reason: 'the declared revision or attempt is not the live binding',
            }),
          )
        const bound = bindingInputOf(repository, live, request.call)
        pre.push(...bound.pre)
        cards.push(bound.input)
        if (card.issue === request.reviewIssue) carrier = bound.issue
      }
      if (carrier === undefined)
        throw new IntegrationError('refused', `#${request.reviewIssue} is not a card of this range`)
      cards.sort(
        (a, b) =>
          a.issue.number - b.issue.number ||
          a.revision - b.revision ||
          (a.attempt < b.attempt ? -1 : a.attempt > b.attempt ? 1 : 0),
      )
      const parsed = parseDiffRun(rawStdout)
      const contractsOf = (table: ReturnType<typeof parseDeliveryLines>) =>
        table.lines.flatMap(line => line.contracts)
      const targetLines = parseDeliveryLines(
        json(blob(root, facts.parent.head, LINES_PATH).text, LINES_PATH),
      )
      const targetRef = `refs/heads/${facts.parent.branch}`
      return {
        repository,
        scope: {
          kind: 'ri',
          track: facts.track.id,
          sourceBranch: `refs/heads/${facts.track.branch}`,
          base: facts.mergeBase,
          carrier,
          units,
          prs,
          cards,
        },
        base: facts.mergeBase,
        head: facts.head,
        targetBranch: targetRef,
        targetBase: facts.parent.head,
        raw: { exitCode: 0, stdout: rawStdout },
        carrier,
        checked: parsed.members.map(member => member.directory).sort(),
        union: [...new Set([...contractsOf(targetLines), ...contractsOf(facts.lines)])].sort(),
        pre,
        fingerprint: fingerprintOf(root, () => targetHead(root, policy, targetRef)),
      }
    },
  })
  return { outcome, first, once }
}

/** `draft-ri`: the Comparison of each review member of this RI, for a human to sign. */
export function draftRi(request: RiRequest): { report: ReviewReport; bundle: DraftBundle | null } {
  const { outcome } = riOutcome(request, 'draft')
  return { report: outcome.report, bundle: outcome.bundle }
}
/**
 * `ri-notes --review-issue`: the original RI report with the semantic review applied. Exit 2 when
 * any fact is unknown, including an unavailable snapshot difference; 1 when the review or the
 * original report refuses; 0 otherwise. `notes` is null when enablement stopped the run first.
 */
export function reviewRi(request: RiRequest): {
  report: ReviewReport
  notes: RiNotes | null
  exit: RunExit
} {
  const { outcome, first, once } = riOutcome(request, 'check')
  const { report } = outcome
  if (first === null || once === null) return { report, notes: null, exit: report.exit }
  // The final report counts each valid conclusion as the level of its review member. The CLI
  // run and the snapshot difference of the first pass are reused, not repeated.
  const notes = riNotes({
    ...once,
    semantic: { levels: outcome.levels, records: outcome.records },
  })
  const exit: RunExit =
    report.exit === 2 ? 2 : report.exit === 1 || riNotesExitCode(notes) === 1 ? 1 : 0
  return { report, notes, exit }
}
