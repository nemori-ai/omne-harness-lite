import { availableParallelism, loadavg } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { isUnknown, taken, trimmed, unknown, type Field, type Sources } from './field.ts'
import { machineOf, type Machine, type Runtime } from './machine.ts'
import { probe, type CommitSettings, type Probe } from './probes.ts'
import { momentOf, stateBetween, type State } from './state.ts'

const HEAP_OPTIONS = /^--(max-old-space-size|max-semi-space-size|max-heap-size)(=|$)/

/** The runtime this process is: the one that measures is the one the measured object is built for. */
export function runtimeOf(): Runtime {
  const sqlite = (): Pick<Runtime, 'sqlite' | 'sqliteOptions'> => {
    try {
      const database = new DatabaseSync(':memory:')
      try {
        const version = database.prepare('select sqlite_version() as version').get()?.['version']
        const options = database
          .prepare('pragma compile_options')
          .all()
          .map(row => String(Object.values(row)[0]))
          .sort()
        return {
          sqlite: typeof version === 'string' ? version : unknown('SQLite gave no version'),
          sqliteOptions: createHash('sha256').update(options.join('\n')).digest('hex').slice(0, 16),
        }
      } finally {
        database.close()
      }
    } catch {
      const none = unknown('node:sqlite is not usable')
      return { sqlite: none, sqliteOptions: none }
    }
  }
  return {
    node: process.versions.node,
    v8: process.versions.v8,
    ...sqlite(),
    heapOptions: process.execArgv.filter(option => HEAP_OPTIONS.test(option)).sort(),
    threadPool: Number(process.env['UV_THREADPOOL_SIZE'] ?? 4),
  }
}

export type Checkout = Readonly<{ commit: Field<string>; dirty: Field<boolean> }>

/** The commit a directory is at, and whether anything tracked differs from it. */
export function checkoutOf(sources: Sources, root: string): Checkout {
  const commit = sources.run('git', ['-C', root, 'rev-parse', 'HEAD'])?.trim()
  const status = sources.run('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'])
  return {
    commit: commit || unknown('not a Git checkout'),
    dirty: status === null ? unknown('git status did not run') : status.trim() !== '',
  }
}

/** Read once and kept beside the identity: useful to a reader, part of no identifier. */
export function besideOf(sources: Sources): Readonly<Record<string, Field>> {
  return {
    kernelRelease: taken(sources, '/proc/sys/kernel/osrelease', trimmed),
    microcode: taken(
      sources,
      '/proc/cpuinfo',
      text => /^microcode\s*:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null,
    ),
  }
}

export type Watch = Readonly<{
  machine: Machine
  first: Probe
  /** takes the last probe and the last moment; call once, when the work is over */
  end: () => Readonly<{ state: State; last: Probe }>
}>

const WATCH_MS = 1000

/** Takes the identity of the machine, the first probe and the first moment, and keeps an eye on the memory until the end. */
export function watch(
  sources: Sources,
  input: Readonly<{
    dataDirectory: string
    settings: CommitSettings
    /** the probe to take first and last; the real one writes under the data directory */
    probe?: (dataDirectory: string, settings: CommitSettings) => Probe
  }>,
): Watch {
  const machine = machineOf(sources, {
    dataDirectory: input.dataDirectory,
    usable: availableParallelism(),
    runtime: runtimeOf(),
  })
  const take = input.probe ?? probe
  const first = take(input.dataDirectory, input.settings)
  const load = (): [number, number, number] => loadavg() as [number, number, number]
  const from = momentOf(sources, new Date(), load())
  let low = from.availableMiB
  const timer = setInterval(() => {
    const now = momentOf(sources, new Date(), load()).availableMiB
    if (!isUnknown(now) && (isUnknown(low) || now < low)) low = now
  }, WATCH_MS)
  timer.unref()
  return {
    machine,
    first,
    end: () => {
      clearInterval(timer)
      const to = momentOf(sources, new Date(), load())
      if (!isUnknown(to.availableMiB) && (isUnknown(low) || to.availableMiB < low))
        low = to.availableMiB
      const used = sources.used(input.dataDirectory)
      return {
        state: stateBetween(from, to, {
          self: process.pid,
          availableLowMiB: low,
          diskUsedShare: used ?? unknown('cannot stat the data directory'),
          heldSlot: Boolean(process.env['OMNE_TEST_SLOT_HELD']),
        }),
        last: take(input.dataDirectory, input.settings),
      }
    },
  }
}
