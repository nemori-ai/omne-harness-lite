import { object, same } from '../integration/parse.ts'
import { routeTarget } from '../integration/sync.ts'
import { collaborationToolRoot, openCollaborationInstallation } from './collaboration-bootstrap.ts'
import { readCollaborationInstallation } from './collaboration-installation.ts'
import type { Evidence, ReleaseRecord } from './collaboration-records.ts'
import { fullSha } from './collaboration-values.ts'
import { verifyCandidateReport, verifyWaveReport } from './collaboration-verification.ts'
import { REST_HEADERS, runGhCommand, type GhCommand } from './github-read.ts'
import { InputError } from './protocol.ts'
import type { ReduceReleasePorts } from './reduce-integration-release.ts'
import { watchAuthority, type ReduceWatchPorts } from './reduce-watch-materials.ts'

/** Report validity alone does not prove that the current integration track contains this wave. */
export function verifyReduceWaveEvidence(
  ports: Pick<ReduceWatchPorts, 'read' | 'authorityFor' | 'readEvidence'>,
  release: ReleaseRecord,
  evidence: Evidence,
): void {
  const { context } = release
  const before = watchAuthority(ports, context.repo, context.reduceIssue)
  same(before.scope.context, context, 'reduce-wave-context-stale')
  const { policy } = ports.authorityFor(context.reduceIssue)
  const target = routeTarget(policy, before.binding.route)
  const readHead = () => {
    const ref = object(
      ports.read(
        [
          'api',
          '--method',
          'GET',
          ...REST_HEADERS,
          `repos/${context.repo}/git/ref/${target.slice('refs/'.length).split('/').map(encodeURIComponent).join('/')}`,
        ],
        15_000,
      ),
      'reduce target ref',
    )
    same(ref.ref, target, 'reduce-wave-target-ref-mismatch')
    const commit = object(ref.object, 'reduce target object')
    same(commit.type, 'commit', 'reduce-wave-target-not-commit')
    same(
      fullSha(commit.sha, 'reduce target head'),
      release.finalHead,
      'reduce-wave-target-head-changed',
    )
  }
  readHead()
  verifyWaveReport(ports, evidence, release)
  same(
    watchAuthority(ports, context.repo, context.reduceIssue),
    before,
    'reduce-wave-authority-changed',
  )
  readHead()
}

/** The gate revision is an operator-adopted installation fact, never a CLI input. */
export function openReduceInstallation(
  root: string,
  repo: string,
  call: GhCommand = runGhCommand,
): ReduceReleasePorts {
  const installed = readCollaborationInstallation(root, repo)
  if (installed.schemaVersion !== 3) throw new InputError('reduce-gate-installation-v3-required')
  const assembly = openCollaborationInstallation(root, repo, call)
  same(assembly.installation, installed, 'reduce-installation-changed')
  const { watch } = assembly
  return {
    ...watch,
    call,
    gateWorkflowHead: installed.gateWorkflow.head,
    verifyCandidateEvidence: (request, record) => verifyCandidateReport(watch, request, record),
    verifyWaveEvidence: (release, evidence) => verifyReduceWaveEvidence(watch, release, evidence),
  }
}

export function deployedReduce(repo: string): ReduceReleasePorts {
  return openReduceInstallation(collaborationToolRoot(), repo)
}
