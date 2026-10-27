import { accessSync, constants, existsSync, readFileSync, statSync, watch } from 'node:fs'
import { basename, dirname } from 'node:path'
import { array, canonical, integer, object, same } from '../integration/parse.ts'
import { readGateRun, type GateCorrelation } from '../integration/gate-correlation.ts'
import { recordAuthorityFor } from './collaboration-authority.ts'
import type {
  RequestInput,
  RequestStateRecord,
  WaveIdentity,
  WorkflowEvidence,
} from './collaboration-records.ts'
import { parseEventLine } from './events.ts'
import { processIdentity, readReceiverHealth } from './events-receiver-state.ts'
import { REST_HEADERS } from './github-read.ts'
import { readRequestRun, requireRunActors } from './integration-request-runs.ts'
import { InputError } from './protocol.ts'
import { readCandidateFacts } from './reduce-integration-facts.ts'
import { readReduceQueue } from './reduce-integration-read.ts'
import type { ReduceIntegrationPorts } from './reduce-integration.ts'
import type { ReduceSignal, SuperviseInput, SupervisePorts } from './reduce-supervise.ts'

export type ActiveReduceRun =
  | { kind: 'request-run'; input: RequestInput; workflow: WorkflowEvidence }
  | { kind: 'gate'; correlation: GateCorrelation }
export type LocalReduceWork = {
  id: string
  pid: number
  processStartedAt: string
  resultFile: string
  deadline: string
}
export type ReduceSupervisionTargets = {
  file: string
  runs: ActiveReduceRun[]
  candidates: { request: RequestInput; record: RequestStateRecord }[]
  local: LocalReduceWork[]
  /** Root's accepted release/next-material readers return facts only. No publication or approval. */
  release: () => Promise<ReduceSignal[]>
}

function reduceSignalFactory(input: SuperviseInput) {
  return (
    signalKind: ReduceSignal['signalKind'],
    identity: string,
    observed: string,
    reasonCode: string,
    evidence: unknown[] = [],
  ): ReduceSignal => ({
    signalKind,
    identity,
    observed,
    reasonCode,
    evidence,
    phase: input.phase,
    eventCursor: null,
  })
}

/** Uses only local files and process identity; safe before remote bootstrap completes. */
export function reduceLocalSupervisionSources(
  input: SuperviseInput,
  targets: Omit<ReduceSupervisionTargets, 'release'>,
): Pick<SupervisePorts, 'subscribe' | 'health'> {
  const signal = reduceSignalFactory(input)
  return {
    subscribe: (notify, fail) => subscribeReduceEvents(targets, input.context, notify, fail),
    async health() {
      const signals: ReduceSignal[] = []
      try {
        const health = readReceiverHealth({ file: targets.file, repository: input.context.repo })
        if (!health.healthy)
          signals.push(
            signal(
              'infrastructure',
              targets.file,
              canonical({
                state: health.state,
                reason: health.reasonCode,
                alive: health.processAlive,
              }),
              health.reasonCode ?? 'receiver-unhealthy',
              [health],
            ),
          )
      } catch (error) {
        signals.push(
          signal(
            'infrastructure',
            targets.file,
            error instanceof Error ? error.message : 'receiver-health-error',
            'receiver-health-unavailable',
          ),
        )
      }
      for (const work of targets.local) {
        if (existsSync(work.resultFile)) {
          accessSync(work.resultFile, constants.R_OK)
          signals.push(
            signal(
              'local-work',
              work.id,
              readFileSync(work.resultFile, 'utf8'),
              'local-work-result',
              [{ resultFile: work.resultFile }],
            ),
          )
        } else if (processIdentity(work.pid) !== work.processStartedAt) {
          signals.push(
            signal(
              'local-work',
              work.id,
              'process-ended-without-result',
              'local-work-output-unavailable',
            ),
          )
        } else if (Date.now() >= Date.parse(work.deadline)) {
          signals.push(signal('local-work', work.id, work.deadline, 'local-work-deadline'))
        }
      }
      return signals
    },
  }
}

/** Production reads share the installed authority and evidence sources used by request and watch. */
export function reduceSupervisionSources(
  input: SuperviseInput,
  ports: ReduceIntegrationPorts,
  targets: ReduceSupervisionTargets,
): SupervisePorts {
  const active = [...targets.runs]
  let cachedQueue: ReturnType<typeof readReduceQueue> | undefined
  const signal = reduceSignalFactory(input)
  const authority = () => {
    const queue = readReduceQueue(ports, input.context)
    if (
      queue.authority.binding.responsible !== input.owner ||
      queue.authority.scope.epoch !== input.epoch
    )
      throw new InputError('reduce-supervise-owner-epoch-conflict')
    cachedQueue = queue
    return queue
  }
  return {
    ...reduceLocalSupervisionSources(input, targets),
    async reconcile() {
      const queue = authority()
      const signals = queue.requests.flatMap(request => {
        const state = request.current?.record.state ?? 'registered'
        return state === 'registered' || state === 'blocked' || state === 'reverted'
          ? [
              signal(
                'handoff',
                request.input.requestId,
                `${request.input.outcome}:${state}:${request.current?.record.revision ?? 0}`,
                'handoff-needs-disposition',
                [request.receipt.url, request.current?.url ?? null],
              ),
            ]
          : []
      })
      for (const { request, record } of targets.candidates) {
        const registered = queue.requests.find(
          item =>
            item.input.requestId === request.requestId &&
            item.input.lineParent === request.lineParent,
        )
        if (registered === undefined)
          throw new InputError('reduce-supervise-candidate-not-registered')
        same(registered.input, request, 'reduce-supervise-candidate-request-mismatch')
        same(registered.current?.record, record, 'reduce-supervise-candidate-state-stale')
        const facts = readCandidateFacts(ports.read, request)
        signals.push(...candidateChecks(ports, request, record, signal))
        const reason =
          facts.head !== record.candidateHead
            ? 'candidate-external-head'
            : facts.merged
              ? 'candidate-merged-readback'
              : facts.state === 'closed'
                ? 'candidate-closed-unmerged'
                : facts.targetHead !== record.targetBase
                  ? 'candidate-target-base-changed'
                  : null
        if (reason !== null)
          signals.push(signal('candidate', request.requestId, canonical(facts), reason, [facts]))
      }
      if (input.phase === 'RELEASE_WAVE' || input.phase === 'FINALIZE')
        signals.push(...(await targets.release()))
      return signals
    },
    async pollActiveRuns() {
      if (active.length === 0) return []
      const queue = cachedQueue ?? authority()
      const signals: ReduceSignal[] = []
      for (const target of active.slice()) {
        if (target.kind === 'request-run') {
          same(target.input.context, input.context, 'reduce-supervise-request-context')
          const grant = recordAuthorityFor(queue.authority, input.context)
          same(
            { path: target.workflow.path, ref: target.workflow.ref, head: target.workflow.head },
            grant.workflow,
            'reduce-supervise-request-workflow',
          )
          const run = readRequestRun(target.input, target.workflow, ports.read)
          requireRunActors(run, target.input, grant)
          const current = object(
            ports.read(
              [
                'api',
                '--method',
                'GET',
                ...REST_HEADERS,
                `repos/${input.context.repo}/actions/runs/${run.runId}`,
              ],
              15_000,
            ),
            'current run',
          )
          if (current.run_attempt !== run.runAttempt) {
            signals.push(
              signal(
                'request-run',
                target.input.requestId,
                canonical(current.run_attempt),
                'request-run-rerun',
                [run],
              ),
            )
            active.splice(active.indexOf(target), 1)
          } else if (run.status === 'completed') {
            active.splice(active.indexOf(target), 1)
            const registered = queue.requests.some(
              item => item.input.requestId === target.input.requestId,
            )
            signals.push(
              signal(
                'request-run',
                target.input.requestId,
                canonical(run),
                run.conclusion === 'success'
                  ? registered
                    ? 'request-registered'
                    : 'request-success-receipt-missing'
                  : `request-${run.conclusion}`,
                [run],
              ),
            )
          }
        } else {
          same(target.correlation.repo, input.context.repo, 'reduce-supervise-gate-repository')
          same(
            target.correlation.adoptedWorkflowHead,
            ports.gateWorkflowHead,
            'reduce-supervise-gate-workflow',
          )
          const run = readGateRun(ports.read, target.correlation)
          if (run.status === 'completed') {
            active.splice(active.indexOf(target), 1)
            signals.push(
              signal('gate', String(run.runId), canonical(run), `gate-${run.conclusion}`, [run]),
            )
          } else {
            const pending = array(
              ports.read(
                [
                  'api',
                  '--method',
                  'GET',
                  ...REST_HEADERS,
                  `repos/${input.context.repo}/actions/runs/${run.runId}/pending_deployments`,
                ],
                15_000,
              ),
              'pending deployments',
            )
            if (pending.length > 0)
              signals.push(
                signal(
                  'gate',
                  String(run.runId),
                  canonical(pending),
                  'gate-approval-required',
                  pending,
                ),
              )
            const approvals = array(
              ports.read(
                [
                  'api',
                  '--method',
                  'GET',
                  ...REST_HEADERS,
                  `repos/${input.context.repo}/actions/runs/${run.runId}/approvals`,
                ],
                15_000,
              ),
              'gate approvals',
            ).filter(item => object(item, 'approval').state === 'approved')
            if (approvals.length > 0)
              signals.push(
                signal(
                  'gate',
                  String(run.runId),
                  canonical(approvals),
                  'gate-approved-readback',
                  approvals,
                ),
              )
          }
        }
      }
      return signals
    },
    async deadline() {
      const queue = authority()
      return [
        signal(
          'deadline',
          String(input.context.reduceIssue),
          input.deadline,
          'configured-deadline-reached',
          queue.requests.map(item => ({
            requestId: item.input.requestId,
            state: item.current?.record.state ?? 'registered',
          })),
        ),
      ]
    },
  }
}

function subscribeReduceEvents(
  targets: Omit<ReduceSupervisionTargets, 'release'>,
  context: WaveIdentity,
  notify: (cursor: string | null) => void,
  fail: (error: unknown) => void,
) {
  const file = targets.file,
    repo = context.repo
  const runs = new Set(
    targets.runs.map(run =>
      run.kind === 'gate' ? run.correlation.workflow.runId : run.workflow.runId,
    ),
  )
  const pulls = new Set(
    targets.candidates.flatMap(item =>
      item.request.pull === null ? [] : [item.request.pull.number],
    ),
  )
  const refs = new Set(targets.candidates.map(item => `refs/heads/${item.request.targetRef}`))
  let offset = 0,
    inode: number | undefined
  const scan = () => {
    try {
      const stat = statSync(file)
      if ((inode !== undefined && inode !== stat.ino) || stat.size < offset)
        throw new InputError('reduce-supervise-event-coverage-gap')
      inode = stat.ino
      const bytes = readFileSync(file).subarray(offset)
      const end = bytes.lastIndexOf(0x0a)
      if (end < 0) return
      offset += end + 1
      for (const line of bytes.subarray(0, end).toString('utf8').split('\n')) {
        if (line.trim() === '') continue
        const event = parseEventLine(line)
        if (event === undefined) throw new InputError('reduce-supervise-event-log-corrupt')
        if (event.receiver !== undefined && event.receiver.repository !== repo)
          throw new InputError('reduce-supervise-event-repository')
        if (
          event.event === 'issue_comment' &&
          ![
            'integration-request:v1',
            'integration-state:v1',
            'reduce-release:v1',
            'line-delta:v1',
          ].some(marker => event.marker?.startsWith(marker.split(':')[0] ?? '') === true)
        )
          continue
        const relevant =
          event.event === 'receiver' ||
          event.number === context.reduceIssue ||
          (event.number !== null && pulls.has(event.number)) ||
          (event.subject?.runId != null && runs.has(event.subject.runId)) ||
          (event.subject?.pullNumber != null && pulls.has(event.subject.pullNumber)) ||
          (event.subject?.ref != null && refs.has(event.subject.ref)) ||
          targets.candidates.some(item => item.record.candidateHead === event.subject?.headSha)
        if (relevant) notify(event.delivery ?? event.receivedAt)
      }
    } catch (error) {
      fail(error)
    }
  }
  const watcher = watch(dirname(file), (_, name) => {
    if (name === null || name === basename(file)) scan()
  })
  watcher.on('error', fail)
  const fallback = setInterval(scan, 5000)
  scan()
  return {
    close() {
      watcher.close()
      clearInterval(fallback)
    },
  }
}

function candidateChecks(
  ports: ReduceIntegrationPorts,
  request: RequestInput,
  record: RequestStateRecord,
  signal: (
    kind: ReduceSignal['signalKind'],
    identity: string,
    observed: string,
    reason: string,
    evidence?: unknown[],
  ) => ReduceSignal,
) {
  if (record.candidateHead === null || request.pull === null) return []
  const prefix = `repos/${request.context.repo}`
  const get = (path: string) =>
    ports.read(['api', '--method', 'GET', ...REST_HEADERS, `${prefix}/${path}`], 15_000)
  const signals: ReduceSignal[] = [],
    ids = new Set<number>()
  let expected: number | undefined
  for (let page = 1; ; page++) {
    const result = object(
      get(`commits/${record.candidateHead}/check-runs?per_page=100&page=${page}`),
      'check runs',
    )
    const count = result.total_count
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      (expected !== undefined && count !== expected)
    )
      throw new InputError('reduce-supervise-checks-incomplete')
    expected = count
    const checks = array(result.check_runs, 'check runs')
    if (checks.length > 100) throw new InputError('reduce-supervise-check-page-invalid')
    for (const raw of checks) {
      const check = object(raw, 'check'),
        id = integer(check.id, 'check.id')
      if (ids.has(id)) throw new InputError('reduce-supervise-check-page-duplicate')
      ids.add(id)
      if (check.head_sha !== record.candidateHead)
        throw new InputError('reduce-supervise-check-head-mismatch')
      if (
        check.status === 'completed' &&
        !['success', 'neutral', 'skipped'].includes(String(check.conclusion))
      )
        signals.push(
          signal(
            'candidate',
            `${request.requestId}:check:${id}`,
            canonical([check.status, check.conclusion, check.head_sha]),
            'candidate-check-failed',
            [check.html_url],
          ),
        )
    }
    if (checks.length < 100) break
  }
  if (ids.size !== expected) throw new InputError('reduce-supervise-checks-incomplete')
  const reviews = new Set<number>()
  for (let page = 1; ; page++) {
    const rows = array(
      get(`pulls/${request.pull.number}/reviews?per_page=100&page=${page}`),
      'reviews',
    )
    if (rows.length > 100) throw new InputError('reduce-supervise-review-page-invalid')
    for (const raw of rows) {
      const review = object(raw, 'review'),
        id = integer(review.id, 'review.id')
      if (reviews.has(id)) throw new InputError('reduce-supervise-review-page-duplicate')
      reviews.add(id)
      if (review.commit_id === record.candidateHead && review.state === 'CHANGES_REQUESTED')
        signals.push(
          signal(
            'candidate',
            `${request.requestId}:review:${id}`,
            canonical([review.state, review.commit_id]),
            'candidate-review-requires-disposition',
            [review.html_url],
          ),
        )
    }
    if (rows.length < 100) break
  }
  return signals
}
