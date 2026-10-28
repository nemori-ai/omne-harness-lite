import {
  array,
  canonical,
  choice,
  fields,
  literal,
  same,
  string,
  strings,
} from '../integration/parse.ts'
import { strictJson } from './strict-json.ts'
import { readReferencedComment } from './collaboration-read.ts'
import type {
  Evidence,
  ReleaseRecord,
  RequestInput,
  RequestStateRecord,
  WaveIdentity,
} from './collaboration-records.ts'
import {
  evidenceList,
  nonempty,
  parseEvidence,
  parseWriter,
  utcTime,
} from './collaboration-values.ts'
import { InputError } from './protocol.ts'
import { verifyMaterial, watchAuthority, type ReduceWatchPorts } from './reduce-watch-materials.ts'

export const VERIFICATION_MARKER = '<!-- omne-collaboration-verification:v1 -->\n'

type CandidateSubject = Pick<
  RequestStateRecord,
  'context' | 'lineParent' | 'requestId' | 'requestHead' | 'candidateHead' | 'targetBase'
> & { kind: 'candidate' }
type WaveSubject = Pick<
  ReleaseRecord,
  'context' | 'finalHead' | 'expectedRequests' | 'results' | 'lines' | 'next'
> & { kind: 'wave' }
type VerificationSubject = CandidateSubject | WaveSubject
type VerificationPorts = Pick<ReduceWatchPorts, 'read' | 'authorityFor' | 'readEvidence'>
const COMMAND_AREAS = ['tests', 'admission', 'whole-wave'] as const
const JUDGMENT_AREAS = [
  'impact',
  'review',
  'reduce-work',
  'integration-defects',
  'pending-writes',
] as const

/** Reports preserve the responsible owner's evidence judgment; they do not execute checks or grant acceptance. */
export function verifyCollaborationReport(
  ports: VerificationPorts,
  source: Evidence,
  subject: VerificationSubject,
): void {
  const context = subject.context
  const authority = watchAuthority(ports, context.repo, context.reduceIssue)
  same(authority.scope.context, context, 'verification-context-stale')
  const reference = reportReference(source, context)
  const comment = readReferencedComment(context.repo, reference, ports.read)
  if (
    comment.authorType !== 'User' ||
    comment.author !== authority.binding.responsible ||
    comment.createdAt !== comment.updatedAt
  )
    throw new InputError('verification-report-author-or-edit')
  if (!comment.body.startsWith(VERIFICATION_MARKER))
    throw new InputError('verification-report-marker')
  const report = fields(
    strictJson(comment.body.slice(VERIFICATION_MARKER.length)),
    ['schemaVersion', 'subject', 'writer', 'checks', 'recordedAt'],
    'verification report',
  )
  literal(report.schemaVersion, 1, 'verification schemaVersion')
  same(report.subject, subject, 'verification-subject-mismatch')
  same(
    parseWriter(report.writer),
    {
      login: authority.binding.responsible,
      epoch: authority.scope.epoch,
      authorization: authority.binding.dispatch,
    },
    'verification-writer-stale',
  )
  if (
    Date.parse(utcTime(report.recordedAt, 'verification.recordedAt')) >
    Date.parse(comment.createdAt)
  )
    throw new InputError('verification-report-time')
  const names = new Set<string>(),
    areas = new Set<string>()
  for (const value of nonempty(
    array(report.checks, 'verification.checks'),
    'verification.checks',
  )) {
    const check = fields(
      value,
      [
        'name',
        'kind',
        'area',
        'command',
        'exitCode',
        'log',
        'conclusion',
        'reason',
        'evidence',
        'remaining',
      ],
      'verification check',
    )
    const name = string(check.name, 'verification check.name')
    if (names.has(name)) throw new InputError('verification-check-duplicate')
    names.add(name)
    if (check.kind === 'command') {
      fields(value, ['name', 'kind', 'area', 'command', 'exitCode', 'log'], 'verification command')
      areas.add(choice(check.area, COMMAND_AREAS, 'verification command.area'))
      nonempty(
        strings(check.command, 'verification command.command'),
        'verification command.command',
      )
      literal(check.exitCode, 0, 'verification command.exitCode')
      verifyMaterial(ports, parseEvidence(check.log))
    } else {
      fields(
        value,
        ['name', 'kind', 'area', 'conclusion', 'reason', 'evidence', 'remaining'],
        'verification judgment',
      )
      literal(check.kind, 'judgment', 'verification judgment.kind')
      const area = choice(check.area, JUDGMENT_AREAS, 'verification judgment.area')
      areas.add(area)
      const conclusion = choice(
        check.conclusion,
        ['pass', 'not-applicable'],
        'verification judgment.conclusion',
      )
      if (conclusion === 'not-applicable' && area !== 'review')
        throw new InputError('verification-required-judgment')
      string(check.reason, 'verification judgment.reason')
      if (strings(check.remaining, 'verification judgment.remaining').length !== 0)
        throw new InputError('verification-unresolved-work')
      for (const evidence of nonempty(
        evidenceList(check.evidence),
        'verification judgment.evidence',
      ))
        verifyMaterial(ports, evidence)
    }
  }
  const required =
    subject.kind === 'candidate'
      ? ['impact', 'tests', 'review', 'admission']
      : ['whole-wave', 'reduce-work', 'integration-defects', 'pending-writes']
  if (required.some(area => !areas.has(area)))
    throw new InputError('verification-coverage-incomplete')
  same(
    comment,
    readReferencedComment(context.repo, reference, ports.read),
    'verification-report-changed',
  )
  same(
    authority,
    watchAuthority(ports, context.repo, context.reduceIssue),
    'verification-authority-changed',
  )
}

function reportReference(source: Evidence, context: WaveIdentity) {
  const prefix = `https://github.com/${context.repo}/issues/${context.reduceIssue}#issuecomment-`
  const id = source.url.startsWith(prefix) ? source.url.slice(prefix.length) : ''
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
    throw new InputError('verification-report-reduce-comment-required')
  return { issue: context.reduceIssue, commentId: Number(id), sha256: source.sha256 }
}

export function verifyCandidateReport(
  ports: VerificationPorts,
  request: { input: RequestInput },
  record: RequestStateRecord,
): void {
  same(record.context, request.input.context, 'verification-request-context')
  same(
    { lineParent: record.lineParent, requestId: record.requestId, requestHead: record.requestHead },
    {
      lineParent: request.input.lineParent,
      requestId: request.input.requestId,
      requestHead: request.input.pull?.head ?? null,
    },
    'verification-request-identity',
  )
  if (record.candidateHead === null || record.targetBase === null)
    throw new InputError('verification-candidate-required')
  const sources = record.verification.filter(source => {
    verifyMaterial(ports, source)
    return ports.readEvidence(source).startsWith(VERIFICATION_MARKER)
  })
  if (sources.length !== 1 || sources[0] === undefined)
    throw new InputError('verification-one-report-required')
  const { context, lineParent, requestId, requestHead, candidateHead, targetBase } = record
  verifyCollaborationReport(ports, sources[0], {
    kind: 'candidate',
    context,
    lineParent,
    requestId,
    requestHead,
    candidateHead,
    targetBase,
  })
}

export function verifyWaveReport(
  ports: VerificationPorts,
  source: Evidence,
  release: ReleaseRecord,
): void {
  const { context, finalHead, expectedRequests, results, lines, next } = release
  verifyCollaborationReport(ports, source, {
    kind: 'wave',
    context,
    finalHead,
    expectedRequests,
    results,
    lines,
    next,
  })
}

export function encodeVerificationReport(report: unknown): string {
  return VERIFICATION_MARKER + canonical(report) + '\n'
}
