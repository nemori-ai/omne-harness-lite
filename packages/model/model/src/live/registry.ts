import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  CallState,
  ControlState,
  LiveCommand,
  LiveMedia,
  MediaFrame,
  ModelCallId,
  ModelFailure,
  ModelLiveCalls,
  ModelModality,
  Reply,
} from '@omne-harness/model-contract'
import type { FixedRequestHead, ModelCommands } from '@omne-harness/model-contract/provider'
import type { LiveRunner } from './runner.ts'

type Target = Readonly<{ tenant: TenantId; call: ModelCallId }>
const keyOf = ({ tenant, call }: Target) => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('invalid tenant')
  return JSON.stringify([encoded.value, call])
}

/** The live bodies this process holds, by tenant and call. */
export class LiveBodies {
  private readonly bodies = new Map<string, LiveRunner>()

  /** Holds the body until it exits. */
  hold(target: Target, runner: LiveRunner): void {
    const key = keyOf(target)
    this.bodies.set(key, runner)
    void runner.exited.then(() => {
      if (this.bodies.get(key) === runner) this.bodies.delete(key)
    })
  }
  get(target: Target): LiveRunner | undefined {
    return this.bodies.get(keyOf(target))
  }
  holds(target: Target): boolean {
    return this.bodies.has(keyOf(target))
  }
  /** A cancel of the call was recorded: the body, if this process holds it, asks the upstream to close. */
  cancelled(target: Target, control: ControlState): void {
    if (control.kind === 'requested' && control.intent === 'cancel')
      this.get(target)?.feed({ kind: 'cancel', control: control.operation })
  }
}

const ELSEWHERE: ModelFailure = {
  kind: 'unavailable',
  dependency: 'live-call',
  diagnostic: 'not-in-this-process',
}
const phase = (reason: 'not-open' | 'closing' | 'settled'): { failure: ModelFailure } => ({
  failure: { kind: 'invalid', field: 'phase', reason },
})
/** No body here: a settled call says so, one still running is somewhere else. */
const absent = (state: CallState): { failure: ModelFailure } =>
  state.phase === 'settled' ? phase('settled') : { failure: ELSEWHERE }
const MODALITY: { failure: ModelFailure } = {
  failure: { kind: 'invalid', field: 'content', reason: 'modality' },
}
const MODALITY_OF: Readonly<Record<ContentBlock['kind'], ModelModality | null>> = {
  text: 'text',
  thinking: 'text',
  image: 'image',
  voice: 'voice',
  file: null,
}
/** Whether the call takes every block of the command in: a live call, by the modalities fixed with it. */
function takes(request: FixedRequestHead, command: LiveCommand): boolean {
  if (request.kind !== 'live') return true
  return command.content.every(block => {
    const modality = MODALITY_OF[block.kind]
    return modality !== null && request.input.includes(modality)
  })
}

/** The three entries of a running live call; each reads the call first with the caller's own access. */
export function createLiveCalls<P>(
  commands: ModelCommands<P>,
  bodies: LiveBodies,
): ModelLiveCalls<P> {
  return {
    async command(input) {
      const known = await commands.loadRecovery(input)
      if ('failure' in known) return known
      if (!takes(known.ok.request, input.command)) return MODALITY
      const runner = bodies.get(input)
      if (runner === undefined) return absent(known.ok.state)
      const answer = runner.command(input.operation, input.command)
      return answer.kind === 'refused' ? phase(answer.reason) : { ok: answer.receipt }
    },
    async end(input): Reply<ControlState> {
      const known = await commands.loadRecovery(input)
      if ('failure' in known) return known
      const runner = bodies.get(input)
      if (runner === undefined)
        return known.ok.state.phase === 'settled'
          ? { ok: known.ok.state.control }
          : { failure: ELSEWHERE }
      if (runner.phase === 'connecting') return phase('not-open')
      if (runner.phase !== 'open') return { ok: known.ok.state.control }
      const recorded = await commands.control({ ...input, intent: 'end' })
      if ('ok' in recorded && recorded.ok.kind === 'requested' && recorded.ok.intent === 'end')
        runner.feed({ kind: 'end' })
      return recorded
    },
    async media(input): Reply<LiveMedia> {
      const known = await commands.loadRecovery(input)
      if ('failure' in known) return known
      const runner = bodies.get(input)
      if (runner === undefined) return absent(known.ok.state)
      const queued: MediaFrame[] = []
      const waiting: ((frame: IteratorResult<MediaFrame>) => void)[] = []
      let released = false
      const stop = runner.onMedia(frame => {
        const next = waiting.shift()
        if (next === undefined) queued.push(frame)
        else next({ done: false, value: frame })
      })
      const release = () => {
        released = true
        stop()
        for (const next of waiting.splice(0)) next({ done: true, value: undefined })
      }
      void runner.exited.then(release)
      return {
        ok: {
          write: frame => runner.writeMedia(frame),
          frames: {
            [Symbol.asyncIterator]: () => ({
              next: () => {
                const frame = queued.shift()
                if (frame !== undefined) return Promise.resolve({ done: false, value: frame })
                if (released) return Promise.resolve({ done: true, value: undefined })
                return new Promise(resolve => waiting.push(resolve))
              },
            }),
          },
          release,
        },
      }
    },
  }
}
