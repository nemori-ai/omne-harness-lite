import type { ControlProgress, ProducerRef, WorkSnapshot } from './values.ts'

type ToolProducer = Extract<ProducerRef, { kind: 'tool' }>

/** A control Session hands to Tool by the call reference: nobody waits on a backgrounded call. */
export type DirectCallControl = Readonly<{ producer: ToolProducer; intent: 'stop' | 'withdraw' }>

export type ControlRoutes = Readonly<{ agent: boolean; direct: readonly DirectCallControl[] }>

const sameProducer = (left: ProducerRef, right: ProducerRef): boolean =>
  left.kind === right.kind && left.call === right.call

function backgrounded(snapshot: WorkSnapshot, pending: readonly ProducerRef[]): ToolProducer[] {
  const placeholders = new Set<string>(snapshot.backgroundPlaceholders ?? [])
  return snapshot.consumptions.flatMap(item => {
    const { producer } = item.binding
    return producer.kind === 'tool' &&
      placeholders.has(item.id) &&
      pending.some(other => sameProducer(other, producer))
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
    const direct = background.filter(producer => sameProducer(producer, target))
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
// reconciled with it.
export function settledControls(
  controls: readonly ControlProgress[],
  producer: ProducerRef,
): readonly ControlProgress[] {
  return controls.flatMap(control => {
    if (
      control.state === 'reconciled' ||
      !control.pending.some(item => sameProducer(item, producer))
    )
      return []
    const pending = control.pending.filter(item => !sameProducer(item, producer))
    const { intent } = control
    const alone =
      intent.kind === 'control' &&
      intent.value.kind === 'stop-call' &&
      sameProducer(intent.value.producer, producer)
    const done =
      alone && pending.length === 0 && (control.pendingUnassociatedWaiting ?? []).length === 0
    return [{ ...control, pending, state: done ? 'reconciled' : control.state }]
  })
}
