import type {
  CommandOutcome,
  FacilityResult,
  ProcessHandle,
  RetainedProcessInformation,
} from '@omne-harness/execution-environment-contract'
import type { ShellAuthorEnvironment } from '@omne-harness/tool-definitions'
import { tree } from '../../src/protocol.ts'

export function shellFixture(output = 'one-shot output') {
  const starts: Parameters<ShellAuthorEnvironment['command']['start']>[0][] = []
  const executions: Parameters<ShellAuthorEnvironment['terminal']['execute']>[0][] = []
  const creates: Parameters<ShellAuthorEnvironment['terminal']['create']>[0][] = []
  const attachments: { id: string; generation: string }[] = []
  const sessions = new Map<string, { cwd: string; closed: boolean }>()
  let drained = false
  const stops: string[] = []
  /** What the optional command retention extension lists; tests add entries. */
  const retained: RetainedProcessInformation[] = []
  const done = <T>(value: T): FacilityResult<T> => ({ kind: 'done', requestId: 'fixture', value })
  const rejected = (reason: 'notFound' | 'closed') =>
    ({ kind: 'rejected', requestId: 'fixture', reason }) as const
  function process(text: string, mode: 'separate' | 'terminal'): ProcessHandle {
    const bytes = new TextEncoder().encode(text)
    const outcome: CommandOutcome = {
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
      durationMs: 1,
      output:
        mode === 'separate'
          ? {
              mode,
              stdout: { observedBytes: bytes.byteLength, discardedBytes: 0 },
              stderr: { observedBytes: 0, discardedBytes: 0 },
            }
          : { mode, terminal: { observedBytes: bytes.byteLength, discardedBytes: 0 } },
    }
    return {
      process: { id: 'process', generation: '1' },
      outputMode: mode,
      outputPolicy: { maxBufferedBytes: 100, maxChunkBytes: 3, overflow: 'discard' },
      output: {
        async *[Symbol.asyncIterator]() {
          for (let offset = 0; offset < bytes.byteLength; offset += 2)
            yield {
              stream: mode === 'terminal' ? 'terminal' : 'stdout',
              observedOffset: offset,
              data: bytes.slice(offset, offset + 2),
            }
          drained = true
        },
      },
      result: Promise.resolve(outcome),
      stop: async requested => {
        stops.push(requested)
        return 'unconfirmed'
      },
    }
  }
  const environment: ShellAuthorEnvironment = {
    facts: {
      os: 'fixtureOS',
      release: 'fixtureRelease',
      architecture: 'fixtureArch',
      facilities: ['command', 'terminal'],
    },
    command: {
      start: async request => {
        starts.push(request)
        return done(process(output, 'separate'))
      },
      retention: { list: async () => done([...retained]) },
    },
    terminal: {
      create: async request => {
        creates.push(request)
        const { cwd } = request
        sessions.set('session', { cwd, closed: false })
        return done({ terminal: { id: 'session', generation: '1' } })
      },
      retention: {
        attach: async ({ terminal }) => {
          attachments.push(terminal)
          const session = sessions.get(terminal.id)
          if (!session || terminal.generation !== '1') return rejected('notFound')
          if (session.closed) return rejected('closed')
          return done({ terminal })
        },
        detach: async () => done({ status: 'confirmed' }),
      },
      execute: async request => {
        executions.push(request)
        const session = sessions.get(request.terminal.id)
        if (!session || request.terminal.generation !== '1') return rejected('notFound')
        if (session.closed) return rejected('closed')
        if (request.script.startsWith('cd ') && request.cwd === undefined)
          session.cwd = request.script.slice(3)
        return done(
          process(request.script === 'pwd' ? (request.cwd ?? session.cwd) : '', 'terminal'),
        )
      },
      close: async ({ terminal }) => {
        const session = sessions.get(terminal.id)
        if (!session) return rejected('notFound')
        session.closed = true
        return done({ status: 'confirmed' })
      },
      list: async () =>
        done(
          [...sessions.entries()].map(([id, session]) => ({
            terminal: { id, generation: '1' },
            state: session.closed ? 'closed' : 'idle',
            observedCwd: session.cwd,
          })),
        ),
    },
  }
  const construction = {
    resultMaxBytes: 32768,
    executable: '/explicit-shell',
    argsPrefix: ['-c'],
    cwd: '/initial',
    env: { A: 'base', BASE: 'yes' },
  }
  return {
    environment,
    config: tree(construction),
    smallConfig: tree({ ...construction, resultMaxBytes: 512 }),
    starts,
    executions,
    creates,
    attachments,
    stops,
    retained,
    drained: () => drained,
    process,
  }
}
