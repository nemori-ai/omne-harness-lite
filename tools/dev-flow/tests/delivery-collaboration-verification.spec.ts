import { describe, expect, it } from 'vitest'
import { digest } from '../src/integration/parse.ts'
import {
  encodeVerificationReport,
  verifyCandidateReport,
  verifyWaveReport,
} from '../src/delivery/collaboration-verification.ts'
import { githubRequestEvidence } from '../src/delivery/integration-request-evidence.ts'
import { backend, policy, rawComment, taskBinding } from './fixtures/collaboration-authority.ts'
import { context, request, state, release, TIME, UUID } from './fixtures/collaboration.ts'
import { verifyReduceWaveEvidence } from '../src/delivery/reduce-bootstrap.ts'
import { routeTarget } from '../src/integration/sync.ts'

function fixture(wave = false) {
  const b = backend()
  const log = rawComment(20, 'Actual fixture check transcript: all selected checks passed.', TIME)
  b.comments.push(log)
  const evidence = {
    url: log.html_url,
    sha256: digest(log.body),
    description: 'Exact check transcript',
  }
  const writer = { login: 'owner', epoch: UUID, authorization: taskBinding().dispatch }
  const candidate = state(),
    released = release()
  candidate.writer = writer
  released.writer = writer
  const { lineParent, requestId, requestHead, candidateHead, targetBase } = candidate
  const { finalHead, expectedRequests, results, lines, next } = released
  const subject = wave
    ? { kind: 'wave', context, finalHead, expectedRequests, results, lines, next }
    : { kind: 'candidate', context, lineParent, requestId, requestHead, candidateHead, targetBase }
  const command = (area: string) => ({
    name: area,
    kind: 'command',
    area,
    command: ['pnpm', area],
    exitCode: 0,
    log: evidence,
  })
  const judgment = (area: string) => ({
    name: area,
    kind: 'judgment',
    area,
    conclusion: 'pass',
    reason: 'Fixture owner inspected the attached scope and report.',
    evidence: [evidence],
    remaining: [],
  })
  const report = {
    schemaVersion: 1,
    subject,
    writer,
    recordedAt: TIME,
    checks: wave
      ? [
          command('whole-wave'),
          judgment('reduce-work'),
          judgment('integration-defects'),
          judgment('pending-writes'),
        ]
      : [judgment('impact'), command('tests'), judgment('review'), command('admission')],
  }
  const comment = rawComment(21, encodeVerificationReport(report), TIME)
  b.comments.push(comment)
  const source = {
    url: comment.html_url,
    sha256: digest(comment.body),
    description: 'Owner verification report',
  }
  candidate.verification = [source]
  const readEvidence = githubRequestEvidence(b.read)
  const ports = {
    read: b.read,
    authorityFor: () => ({ policy }),
    readEvidence: (item: typeof evidence) => readEvidence(context.repo, item),
  }
  const refresh = () => {
    comment.body = encodeVerificationReport(report)
    source.sha256 = digest(comment.body)
  }
  const verify = () =>
    wave
      ? verifyWaveReport(ports, source, released)
      : verifyCandidateReport(ports, request(), candidate)
  return { ...b, candidate, released, report, comment, log, source, ports, refresh, verify }
}

describe('owner-attributed verification reports', () => {
  it.each(['valid', 'head', 'ref', 'type', 'moves', 'authority'] as const)(
    'checks the actual bound track around wave verification: %s',
    change => {
      const f = fixture(true)
      const target = routeTarget(policy, taskBinding().route)
      let reads = 0
      const read: typeof f.read = (args, timeout) => {
        if (args.at(-1) === `repos/${context.repo}/git/ref/${target.slice(5)}`) {
          reads += 1
          if (change === 'authority') f.data.state = 'closed'
          return {
            ref: change === 'ref' ? 'refs/heads/main' : target,
            object: {
              type: change === 'type' ? 'tag' : 'commit',
              sha:
                change === 'head' || (change === 'moves' && reads === 2)
                  ? 'f'.repeat(40)
                  : f.released.finalHead,
            },
          }
        }
        return f.read(args, timeout)
      }
      const verify = () => verifyReduceWaveEvidence({ ...f.ports, read }, f.released, f.source)
      if (change === 'valid') {
        expect(verify).not.toThrow()
        expect(reads).toBe(2)
      } else {
        const errors = {
          head: 'reduce-wave-target-head-changed',
          ref: 'reduce-wave-target-ref-mismatch',
          type: 'reduce-wave-target-not-commit',
          moves: 'reduce-wave-target-head-changed',
          authority: 'reduce-wave-authority-changed',
        }
        expect(verify).toThrow(errors[change])
      }
    },
  )
  it.each([false, true])('reads exact %s subjects and all required evidence twice', wave => {
    const f = fixture(wave)
    expect(f.verify).not.toThrow()
    expect(f.calls.filter(path => path.endsWith('/issues/comments/21'))).toHaveLength(wave ? 2 : 4)
  })
  it('rejects changed candidate head with previous green evidence', () => {
    const f = fixture()
    f.candidate.candidateHead = 'f'.repeat(40)
    expect(f.verify).toThrow('verification-subject-mismatch')
  })
  it('rejects changed target baseline with previous green evidence', () => {
    const f = fixture()
    f.candidate.targetBase = 'f'.repeat(40)
    expect(f.verify).toThrow('verification-subject-mismatch')
  })
  it('rejects another wave head even if all checks passed', () => {
    const f = fixture(true)
    f.released.finalHead = 'f'.repeat(40)
    expect(f.verify).toThrow('verification-subject-mismatch')
  })
  it.each([
    'author',
    'edit',
    'epoch',
    'coverage',
    'log',
    'failed',
    'remaining',
    'duplicate',
  ] as const)('rejects invalid %s evidence', failure => {
    const f = fixture()
    if (failure === 'author') f.comment.user.login = 'someone-else'
    if (failure === 'edit') f.comment.updated_at = '2026-10-27T11:00:00Z'
    if (failure === 'epoch') f.report.writer.epoch = '22222222-2222-4222-8222-222222222222'
    if (failure === 'coverage') f.report.checks.pop()
    if (failure === 'log') f.log.body = 'changed output'
    if (failure === 'failed') {
      const check = f.report.checks.find(item => 'exitCode' in item)
      if (check === undefined || !('exitCode' in check)) throw new Error('command fixture')
      check.exitCode = 1
    }
    if (failure === 'remaining') {
      const check = f.report.checks.find(item => 'remaining' in item)
      if (check === undefined || !('remaining' in check)) throw new Error('judgment fixture')
      Object.assign(check, { remaining: ['unresolved integration defect'] })
    }
    if (failure === 'duplicate') f.report.checks.push({ ...f.report.checks[0]! })
    f.refresh()
    const diagnostic = {
      author: 'verification-report-author-or-edit',
      edit: 'verification-report-author-or-edit',
      epoch: 'verification-writer-stale',
      coverage: 'verification-coverage-incomplete',
      log: 'watch-material-digest-mismatch',
      failed: 'verification command.exitCode',
      remaining: 'verification-unresolved-work',
      duplicate: 'verification-check-duplicate',
    }
    expect(f.verify).toThrow(diagnostic[failure])
  })
  it('does not treat a prose report or digest alone as passed checks', () => {
    const f = fixture()
    f.comment.body = 'all tests are green'
    f.source.sha256 = digest(f.comment.body)
    expect(f.verify).toThrow('verification-one-report-required')
  })
  it('requires a report on the current reduce card', () => {
    const f = fixture(true)
    f.source.url = f.source.url.replace('/issues/100#', '/issues/999#')
    expect(f.verify).toThrow('verification-report-reduce-comment-required')
  })
})
