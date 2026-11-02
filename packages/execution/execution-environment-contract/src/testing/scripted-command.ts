import type {
  CommandFacility,
  CommandOutcome,
  FacilityReason,
  OutputChunk,
  ProcessHandle,
} from '../index.ts'
import { createScriptedProcess } from './scripted-process.ts'

export type ScriptedCommandAnswer =
  | Readonly<{
      kind: 'started'
      /** Chunks in order. `observedOffset` is counted per stream. Strings are UTF-8 encoded. */
      output?: readonly Readonly<{ stream: OutputChunk['stream']; data: string | Uint8Array }>[]
      /** Default: completed, exit code 0, `durationMs` 0, counts from `output`. */
      outcome?: CommandOutcome
      /** `untilStop`: output stays open and `result` waits until a confirmed stop. Default `exit`. */
      runs?: 'exit' | 'untilStop'
      /** What `stop` answers. Default `confirmed`. */
      stop?: 'confirmed' | 'unconfirmed'
    }>
  | Readonly<{ kind: 'rejected'; reason: FacilityReason }>
  | Readonly<{ kind: 'unknown' }>

type StartRequest<P> = Parameters<CommandFacility<P>['start']>[0]

export type CommandScript<P = unknown> = (
  request: StartRequest<P>,
) => ScriptedCommandAnswer | Promise<ScriptedCommandAnswer>

export type ScriptedCommandFacility<P = unknown> = Readonly<{
  durability: 'none'
  /** The facility to put in a scripted lease: `lease: { command: cmd.facility }`. */
  facility: CommandFacility<P>
  calls: readonly StartRequest<P>[]
  stops: readonly StopRecord[]
  /** After `close`, `start` answers `rejected/closed` without calling the script. Running processes go on. */
  close(): void
}>

type StopRecord = Readonly<{
  process: ProcessHandle['process']
  mode: 'graceful' | 'forced'
  answer: 'confirmed' | 'unconfirmed'
}>

/**
 * A scripted command facility for tests. The script answers each accepted `start`. It starts no real
 * process and reads nothing from the host. Not durable; never assemble in production.
 *
 * To put it in a lease, give the scripted provider `facilities` that include `'command'` and
 * `lease: { command: cmd.facility }`. A given `lease` replaces the whole default facility table, so
 * the lease has no default `command` and no `terminal`. The caller writes the provider's `retire`
 * script and calls `cmd.close()` in it.
 */
export function createScriptedCommandFacility<P = unknown>(
  script: CommandScript<P>,
): ScriptedCommandFacility<P> {
  let processes = 0
  let closed = false
  const calls: StartRequest<P>[] = []
  const stops: StopRecord[] = []

  const facility: CommandFacility<P> = {
    async start(request) {
      if (closed) return { kind: 'rejected', requestId: request.requestId, reason: 'closed' }
      calls.push(request)
      const answer = await script(request)
      switch (answer.kind) {
        case 'started':
          return {
            kind: 'done',
            requestId: request.requestId,
            value: createScriptedProcess({
              mode: request.outputMode,
              answer,
              identity: { id: `scripted-${++processes}`, generation: '1' },
              onStop: record => stops.push(record),
            }).handle,
          }
        case 'rejected':
          return { kind: 'rejected', requestId: request.requestId, reason: answer.reason }
        case 'unknown':
          return { kind: 'unknown', requestId: request.requestId }
        default: {
          const exhaustive: never = answer
          return exhaustive
        }
      }
    },
  }

  return {
    durability: 'none',
    facility,
    calls,
    stops,
    close() {
      closed = true
    },
  }
}
