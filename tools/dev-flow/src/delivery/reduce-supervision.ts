import { array } from '../integration/parse.ts'
import { collaborationToolRoot } from './collaboration-bootstrap.ts'
import { createReadWorkers } from './collaboration-read-worker.ts'
import { reduceLocalSupervisionSources } from './reduce-supervise-sources.ts'
import { parseReduceSignal } from './reduce-supervise-values.ts'
import { superviseReduce } from './reduce-supervise.ts'
import { parseReduceSupervision } from './reduce-supervision-input.ts'

/** Local subscription and health start before any installed-source or GitHub read. */
export async function runInstalledSupervision(value: unknown, signal?: AbortSignal) {
  collaborationToolRoot()
  const spec = parseReduceSupervision(value)
  const workers = createReadWorkers(
    new URL('./reduce-supervision-worker.ts', import.meta.url),
    value,
  )
  const local = reduceLocalSupervisionSources(spec.input, spec.targets)
  const remote = async (kind: Parameters<typeof workers.probe>[0]) =>
    array(await workers.probe(kind), 'worker signals').map(parseReduceSignal)
  try {
    return await superviseReduce(
      { ...spec.input, ...(signal === undefined ? {} : { signal }) },
      {
        ...local,
        reconcile: () => remote('reconcile'),
        pollActiveRuns: () => remote('runs'),
        deadline: () => remote('deadline'),
        stop: workers.stop,
      },
    )
  } finally {
    await workers.close()
  }
}
