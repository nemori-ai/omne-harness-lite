import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonical, choice, fields, same } from '../integration/parse.ts'
import { collaborationToolRoot } from './collaboration-bootstrap.ts'
import { runGhRead, type GhCommand } from './github-read.ts'
import { InputError } from './protocol.ts'
import { openReduceInstallation } from './reduce-bootstrap.ts'
import { checkReduceRelease } from './reduce-integration-release.ts'
import { reduceSupervisionSources } from './reduce-supervise-sources.ts'
import type { ReduceSignal, SupervisePorts } from './reduce-supervise.ts'
import { parseReduceSupervision } from './reduce-supervision-input.ts'
import { readReleasedWave } from './reduce-watch-release.ts'

function remoteSources(value: unknown): SupervisePorts {
  const spec = parseReduceSupervision(value)
  const { input } = spec
  const readOnly: GhCommand = (args, timeout) => {
    if (
      args[0] !== 'api' ||
      args[args.indexOf('--method') + 1] !== 'GET' ||
      args.includes('graphql')
    )
      throw new InputError('reduce-worker-read-only')
    return runGhRead(args, timeout)
  }
  const ports = openReduceInstallation(collaborationToolRoot(), input.context.repo, readOnly)
  const runs = spec.targets.runs.map(run =>
    run.kind === 'gate'
      ? { ...run, correlation: { ...run.correlation, adoptedWorkflowHead: ports.gateWorkflowHead } }
      : run,
  )
  return reduceSupervisionSources(input, ports, {
    ...spec.targets,
    runs,
    async release(): Promise<ReduceSignal[]> {
      const target = spec.release
      if (target === null) throw new InputError('supervision-release-target-required')
      const first = target.record.lines[0]
      if (first === undefined) throw new InputError('supervision-release-lines-required')
      const released = readReleasedWave(ports, input.context, first.lineParent)
      if (released === undefined) checkReduceRelease(ports, target.record, target.readinessEvidence)
      else same(released.release, target.record, 'supervision-release-target-stale')
      return [
        {
          signalKind: 'release',
          identity: String(input.context.reduceIssue),
          phase: input.phase,
          eventCursor: null,
          observed: canonical(released?.releaseReference ?? target.record),
          evidence: [released?.releaseReference ?? target.readinessEvidence],
          reasonCode: released === undefined ? 'wave-ready-not-released' : 'wave-release-confirmed',
        },
      ]
    },
  })
}

/** Internal IPC driver. Its only remote transport permits REST GET; CLI input cannot replace it. */
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let saved: unknown
  let ports: SupervisePorts | undefined
  let active = false
  process.on('disconnect', () => process.exit(0))
  process.on('message', async value => {
    let kind: string | undefined
    try {
      const v = fields(value, ['kind', 'input'], 'worker message')
      kind = choice(v.kind, ['reconcile', 'runs', 'deadline'], 'probe')
      if (active) throw new InputError('reduce-worker-probe-overlap')
      active = true
      if (ports === undefined) {
        saved = v.input
        ports = remoteSources(v.input)
      } else same(saved, v.input, 'reduce-worker-input-changed')
      const probe =
        kind === 'runs'
          ? ports.pollActiveRuns
          : kind === 'deadline'
            ? ports.deadline
            : ports.reconcile
      const signals = await probe()
      process.send?.({ kind, ok: true, signals })
    } catch {
      process.send?.({ kind, ok: false })
    } finally {
      active = false
    }
  })
}
