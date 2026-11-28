import type {
  ModelCommands,
  ModelDriveInput,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import type { LiveEnd, LiveRunner } from './runner.ts'

/** What the end of a live body gives the receive window: the usage of a close it saw, then the ending. */
export type LiveEnding = Readonly<{ last: number; facts: AsyncIterable<TransportFact> }>

async function* streamOf(facts: readonly TransportFact[]): AsyncGenerator<TransportFact> {
  yield* facts
}

// A cancel recorded before the body was held reaches it here; a planned stop asks it to close.
export async function endLive<P>(
  commands: ModelCommands<P>,
  claim: ModelDriveInput<P>,
  runner: LiveRunner,
  ending: Promise<LiveEnd>,
  signal: AbortSignal,
): Promise<LiveEnding> {
  const known = await commands.loadRecovery(claim).catch(() => null)
  const control = known !== null && 'ok' in known ? known.ok.state.control : null
  if (control?.kind === 'requested' && control.intent === 'cancel')
    runner.feed({ kind: 'cancel', control: control.operation })
  const stop = () => runner.feed({ kind: 'stop' })
  signal.addEventListener('abort', stop)
  if (signal.aborted) stop()
  const ended = await ending
  signal.removeEventListener('abort', stop)
  const { termination, account } = ended
  const usage: TransportFact[] = account === null ? [] : [{ kind: 'account', ...account }]
  const end: TransportFact = {
    kind: 'ended',
    termination:
      termination.kind === 'interrupted' ? { kind: 'interrupted', stop: 'confirmed' } : termination,
  }
  return { last: ended.last, facts: streamOf([...usage, end]) }
}
