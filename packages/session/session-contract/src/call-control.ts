import type { ControlProgress, ProducerRef, WorkSnapshot } from './values.ts'
import { equalValue } from './session-validation.ts'

type ToolProducer = Extract<ProducerRef, { kind: 'tool' }>

/** A control Session hands to Tool by the call reference: nobody waits on a backgrounded call. */
export type DirectCallControl = Readonly<{ producer: ToolProducer; intent: 'stop' | 'withdraw' }>

export type ControlRoutes = Readonly<{ agent: boolean; direct: readonly DirectCallControl[] }>

function backgrounded(snapshot: WorkSnapshot, pending: readonly ProducerRef[]): ToolProducer[] {
  const placeholders = new Set<string>(snapshot.backgroundPlaceholders ?? [])
  return snapshot.consumptions.flatMap(item => {
    const { producer } = item.binding
    return producer.kind === 'tool' &&
      placeholders.has(item.id) &&
      pending.some(other => equalValue(other, producer))
      ? [producer]
      : []
  })
}

// A stop of a backgrounded call goes to Tool alone; an archive also withdraws each backgrounded
// call it names. Every other control keeps its route through Agent.
export function controlRoutes(snapshot: WorkSnapshot, progress: ControlProgress): ControlRoutes {
  if (progress.state !== 'propagating') return { agent: false, direct: [] }
  const background = backgrounded(snapshot, progress.pending)
  const { intent } = progress
  if (intent.kind === 'control' && intent.value.kind === 'stop-call') {
    const target = intent.value.producer
    const direct = background.filter(producer => equalValue(producer, target))
    return direct.length === 0
      ? { agent: true, direct: [] }
      : { agent: false, direct: direct.map(producer => ({ producer, intent: 'stop' })) }
  }
  const archive =
    intent.kind === 'auto-archive' || (intent.kind === 'control' && intent.value.kind === 'archive')
  return {
    agent: true,
    direct: archive ? background.map(producer => ({ producer, intent: 'withdraw' })) : [],
  }
}

// A settled backgrounded call leaves the pending of every control; a stop of that call alone is
// reconciled with it (its scope names that one call and no waiting).
export function settledControls(
  controls: readonly ControlProgress[],
  producer: ProducerRef,
): readonly ControlProgress[] {
  return controls.flatMap(control => {
    if (!control.pending.some(item => equalValue(item, producer))) return []
    const pending = control.pending.filter(item => !equalValue(item, producer))
    const { intent } = control
    const alone =
      intent.kind === 'control' &&
      intent.value.kind === 'stop-call' &&
      equalValue(intent.value.producer, producer)
    return [{ ...control, pending, state: alone ? 'reconciled' : control.state }]
  })
}
