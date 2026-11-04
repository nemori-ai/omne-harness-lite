import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { judgeStreamCursor, type StreamFrame, type StreamRef } from '@omne-harness/stream-arrival'
import {
  applyModelStreamDelta,
  diffModelStream,
  type ModelStreamDelta,
  type ModelStreamSnapshot,
} from '../model-stream-values.ts'
import { equalStreamValues } from '../model-stream-values-tree.ts'
import type { ModelStreamSelection } from '../model-stream.ts'
import type { ModelFailure } from '../result.ts'
import type {
  ModelStreamConformanceInput,
  ModelStreamConformanceReport,
  ModelStreamConformanceResult,
  ModelStreamConformanceSubject,
} from './conformance-stream-types.ts'

type Frame = StreamFrame<ModelStreamSnapshot, ModelStreamDelta>
type Subject<P> = ModelStreamConformanceSubject<P>
type Reader = Readonly<{ next(): Promise<IteratorResult<Frame>>; abort(): void }>
type Scene<P> = Readonly<{
  subject: Subject<P>
  wait<T>(operation: PromiseLike<T> | T): Promise<T>
  watch(ref?: StreamRef, access?: Access<P>): Reader
}>
type Check<P> = Readonly<{ obligation: string; run(scene: Scene<P>): Promise<void> }>

class Violation extends Error {}

function requireThat(value: boolean, detail: string): asserts value {
  if (!value) throw new Violation(detail)
}
function same(actual: unknown, expected: unknown, detail: string): void {
  requireThat(equalStreamValues(actual, expected), detail)
}
function successful<T, F>(value: Outcome<T, F>): T {
  if ('failure' in value) throw new Violation('Expected a successful public result.')
  return value.ok
}
function selection(snapshot: ModelStreamSnapshot): ModelStreamSelection {
  return {
    state: snapshot.value.state,
    current: { ref: snapshot.ref, dispatch: snapshot.dispatch, projection: 'model-output-v1' },
  }
}
function failure(value: Outcome<unknown, ModelFailure>, expected: Partial<ModelFailure>): void {
  requireThat('failure' in value, 'A failure became a successful selection.')
  for (const [key, item] of Object.entries(expected))
    same(
      Reflect.get(value.failure, key),
      item,
      'The failure kind or public classification differs.',
    )
}
async function current<P>({ subject, wait }: Scene<P>) {
  return wait(subject.references.current({ access: subject.access, reference: subject.reference }))
}
async function publish<P>(scene: Scene<P>): Promise<void> {
  await scene.wait(scene.subject.controls.publish(scene.subject.snapshots.initial))
  await scene.wait(scene.subject.controls.confirm(selection(scene.subject.snapshots.initial)))
}
async function frame(reader: Reader): Promise<Frame> {
  const step = await reader.next()
  requireThat(step.done !== true, 'EOF arrived without the required frame.')
  return step.value
}
async function snapshot(reader: Reader, expected: ModelStreamSnapshot) {
  const value = await frame(reader)
  requireThat(value.kind === 'snapshot', 'The first frame must be a snapshot.')
  same(value.value, expected, 'The snapshot differs from the confirmed projection.')
  successful(judgeStreamCursor({ value: value.cursor, ref: expected.ref }))
  return value
}
async function terminal(
  reader: Reader,
  reason: 'denied' | 'unavailable' | 'stale-stream' | 'source-closed' | 'observer-closed',
) {
  same(
    await frame(reader),
    { kind: 'ended', reason },
    'The observation did not disclose the required end.',
  )
  requireThat((await reader.next()).done === true, 'A terminal frame was not final.')
}
async function delta<P>(
  scene: Scene<P>,
  reader: Reader,
  before: Extract<Frame, { kind: 'snapshot' }>,
  after: ModelStreamSnapshot,
) {
  const value = await frame(reader)
  requireThat(value.kind === 'delta', 'A confirmed change did not produce a delta.')
  same(value.from, before.cursor, 'The public from cursor differs from the last delivered cursor.')
  requireThat(value.cursor !== before.cursor, 'The public cursor did not advance.')
  successful(judgeStreamCursor({ value: value.cursor, ref: after.ref }))
  same(
    successful(
      applyModelStreamDelta({
        tenant: scene.subject.access.tenant,
        before: before.value,
        delta: value.value,
      }),
    ),
    after,
    'The delta does not reconstruct the confirmed projection.',
  )
  return value
}

function currentChecks<P>(): Check<P>[] {
  return [
    {
      obligation: 'current-confirmation',
      async run(scene) {
        await publish(scene)
        same(
          successful(await current(scene)),
          selection(scene.subject.snapshots.initial),
          'State and target did not come from the confirmed selection.',
        )
        await scene.wait(scene.subject.controls.publish(scene.subject.snapshots.successor))
        await scene.wait(
          scene.subject.controls.confirm(selection(scene.subject.snapshots.successor)),
        )
        same(
          successful(await current(scene)),
          selection(scene.subject.snapshots.successor),
          'The replacement state and target were torn.',
        )
      },
    },
    {
      obligation: 'current-null-windows',
      async run(scene) {
        const { subject, wait } = scene
        const empty = { state: subject.snapshots.initial.value.state, current: null }
        await wait(subject.controls.confirm(empty))
        same(
          successful(await current(scene)),
          empty,
          'An unpublished invocation must retain its state with null target.',
        )
        await publish(scene)
        await wait(subject.controls.withdrawTarget())
        same(
          successful(await current(scene)),
          empty,
          'A withdrawn target must be null with its state retained.',
        )
      },
    },
    {
      obligation: 'settled-projection',
      async run(scene) {
        const { subject, wait, watch } = scene
        requireThat(
          subject.snapshots.settled.value.state.phase === 'settled',
          'The settled fixture is not settled.',
        )
        await wait(subject.controls.publish(subject.snapshots.settled))
        await wait(subject.controls.confirm(selection(subject.snapshots.settled)))
        same(
          successful(await current(scene)),
          selection(subject.snapshots.settled),
          'Settlement cleared an available target.',
        )
        await snapshot(watch(), subject.snapshots.settled)
      },
    },
    {
      obligation: 'current-reference-failures',
      async run(scene) {
        const { subject, wait } = scene
        await publish(scene)
        // The reference carries no tenant (R2-D357): another tenant's partition has no such call,
        // so it gets the answer for a call that was never accepted, byte for byte.
        const foreign = await wait(
          subject.references.current({
            access: subject.otherAccess,
            reference: subject.reference,
          }),
        )
        const unaccepted = await wait(
          subject.references.current({
            access: subject.otherAccess,
            reference: subject.unknownReference,
          }),
        )
        failure(foreign, { kind: 'invalid', field: 'reference', reason: 'not-accepted' })
        same(
          JSON.stringify(foreign),
          JSON.stringify(unaccepted),
          'Another tenant learned that the call exists.',
        )
        failure(
          await wait(
            subject.references.current({
              access: subject.access,
              reference: subject.wrongAdmission,
            }),
          ),
          { kind: 'invalid', field: 'admission', reason: 'not-original' },
        )
        failure(
          await wait(
            subject.references.current({
              access: subject.access,
              reference: subject.unknownReference,
            }),
          ),
          { kind: 'invalid', field: 'reference', reason: 'not-accepted' },
        )
        failure(
          // @ts-expect-error Exercise the runtime boundary with unminted reference text.
          await wait(subject.references.current({ access: subject.access, reference: 'invalid' })),
          { kind: 'invalid', field: 'reference' },
        )
        failure(
          await wait(
            subject.references.current({
              // @ts-expect-error Exercise the runtime tenant guard, not a typed caller.
              access: { ...subject.access, tenant: {} },
              reference: subject.reference,
            }),
          ),
          { kind: 'denied', action: 'tenant' },
        )
      },
    },
    {
      obligation: 'current-source-failure',
      async run(scene) {
        await publish(scene)
        await scene.wait(scene.subject.controls.setSource('unavailable'))
        failure(await current(scene), { kind: 'unavailable', dependency: 'stream-references' })
      },
    },
    {
      obligation: 'current-failure-order',
      async run(scene) {
        const { subject, wait } = scene
        await publish(scene)
        await wait(subject.controls.setSource('unavailable'))
        await wait(subject.controls.setAccess(subject.access, 'deny'))
        for (const reference of [
          subject.reference,
          subject.wrongAdmission,
          subject.unknownReference,
        ])
          failure(await wait(subject.references.current({ access: subject.access, reference })), {
            kind: 'denied',
            action: 'current',
          })
        await wait(subject.controls.setAccess(subject.access, 'unavailable'))
        failure(await current(scene), { kind: 'unavailable', dependency: 'stream-references' })
      },
    },
    ...(['deny', 'unavailable', 'source', 'selection'] as const).map(change => ({
      obligation: `current-wait-${change}`,
      async run(scene: Scene<P>) {
        const { subject, wait } = scene
        await publish(scene)
        const hold = subject.controls.holdCurrent()
        const pending = current(scene)
        // Attach a rejection handler while the separately bounded barrier is awaited.
        void pending.catch(() => undefined)
        try {
          await wait(hold.reached)
          if (change === 'source') await wait(subject.controls.setSource('unavailable'))
          else if (change === 'selection') {
            await wait(subject.controls.publish(subject.snapshots.successor))
            await wait(subject.controls.confirm(selection(subject.snapshots.successor)))
          } else await wait(subject.controls.setAccess(subject.access, change))
        } finally {
          hold.release()
        }
        const response = await pending
        if (change === 'selection')
          same(
            successful(response),
            selection(subject.snapshots.successor),
            'A held current response reused an old confirmation.',
          )
        else failure(response, { kind: change === 'deny' ? 'denied' : 'unavailable' })
      },
    })),
  ]
}

function observationChecks<P>(): Check<P>[] {
  return [
    {
      obligation: 'snapshot-delta',
      async run(scene) {
        await publish(scene)
        const reader = scene.watch()
        const first = await snapshot(reader, scene.subject.snapshots.initial)
        await scene.wait(scene.subject.controls.advance(scene.subject.snapshots.next))
        await delta(scene, reader, first, scene.subject.snapshots.next)
      },
    },
    {
      obligation: 'state-only-cursor',
      async run(scene) {
        const { subject, wait, watch } = scene
        requireThat(
          subject.snapshots.initial.value.cursor === subject.snapshots.stateOnly.value.cursor &&
            subject.snapshots.initial.value.state.revision !==
              subject.snapshots.stateOnly.value.state.revision,
          'The state-only fixture must change revision without changing output cursor.',
        )
        await publish(scene)
        const reader = watch()
        const first = await snapshot(reader, subject.snapshots.initial)
        await wait(subject.controls.advance(subject.snapshots.stateOnly))
        const change = await delta(scene, reader, first, subject.snapshots.stateOnly)
        same(change.value.blocks, [], 'A state-only change unexpectedly changed blocks.')
      },
    },
    {
      obligation: 'snapshot-registration',
      async run(scene) {
        await publish(scene)
        await scene.wait(scene.subject.controls.commitOnObserve(scene.subject.snapshots.next))
        const reader = scene.watch()
        const first = await frame(reader)
        requireThat(
          first.kind === 'snapshot',
          'The boundary observation did not start with a snapshot.',
        )
        if (equalStreamValues(first.value, scene.subject.snapshots.next)) return
        same(
          first.value,
          scene.subject.snapshots.initial,
          'The boundary returned an unconfirmed snapshot.',
        )
        await delta(scene, reader, first, scene.subject.snapshots.next)
      },
    },
    {
      obligation: 'observation-reference-failures',
      async run(scene) {
        await publish(scene)
        // Another tenant's partition has no such stream: the end of an unpublished stream.
        await terminal(scene.watch(undefined, scene.subject.otherAccess), 'stale-stream')
        await terminal(scene.watch(scene.subject.wrongProducer), 'stale-stream')
        await terminal(scene.watch(scene.subject.snapshots.successor.ref), 'stale-stream')
        // @ts-expect-error Exercise unreadable reference syntax at the public boundary.
        await terminal(scene.watch('invalid'), 'stale-stream')
        // @ts-expect-error Exercise an unminted tenant at the public boundary.
        await terminal(scene.watch(undefined, { ...scene.subject.access, tenant: {} }), 'denied')
      },
    },
    {
      obligation: 'observation-failure-order',
      async run(scene) {
        const { subject, wait, watch } = scene
        await wait(subject.controls.setAccess(subject.access, 'deny'))
        await terminal(watch(subject.wrongProducer), 'denied')
        await terminal(watch(subject.snapshots.successor.ref), 'denied')
        await wait(subject.controls.setAccess(subject.access, 'unavailable'))
        await terminal(watch(subject.wrongProducer), 'unavailable')
        await terminal(watch(subject.snapshots.successor.ref), 'unavailable')
      },
    },
    {
      obligation: 'queued-revocation',
      async run(scene) {
        await publish(scene)
        const reader = scene.watch()
        await snapshot(reader, scene.subject.snapshots.initial)
        await scene.wait(scene.subject.controls.advance(scene.subject.snapshots.next))
        await scene.wait(scene.subject.controls.setAccess(scene.subject.access, 'deny'))
        await terminal(reader, 'denied')
      },
    },
    {
      obligation: 'retired-reference',
      async run(scene) {
        const { subject, wait, watch } = scene
        await publish(scene)
        const old = watch()
        const first = await snapshot(old, subject.snapshots.initial)
        await wait(subject.controls.withdrawTarget())
        await wait(subject.controls.retire(subject.snapshots.initial.ref))
        await wait(subject.controls.publish(subject.snapshots.successor))
        await wait(subject.controls.confirm(selection(subject.snapshots.successor)))
        await terminal(old, 'stale-stream')
        await terminal(watch(), 'stale-stream')
        const successor = await snapshot(
          watch(subject.snapshots.successor.ref),
          subject.snapshots.successor,
        )
        same(
          judgeStreamCursor({ value: first.cursor, ref: successor.value.ref }),
          { failure: { kind: 'foreign-stream' } },
          'A predecessor cursor was accepted by a successor.',
        )
      },
    },
    {
      obligation: 'slow-reader-gap',
      async run(scene) {
        await publish(scene)
        const reader = scene.watch()
        const first = await snapshot(reader, scene.subject.snapshots.initial)
        await scene.wait(scene.subject.controls.overflow())
        same(
          await frame(reader),
          { kind: 'gap', reason: 'buffer', after: first.cursor },
          'Overflow must discard queued content and retain the last delivered cursor.',
        )
        requireThat((await reader.next()).done === true, 'The gap was not final.')
      },
    },
    ...(['gap', 'abort'] as const).map(held => ({
      obligation: `held-${held}-retirement`,
      async run(scene: Scene<P>) {
        await publish(scene)
        const reader = scene.watch()
        await snapshot(reader, scene.subject.snapshots.initial)
        if (held === 'gap') await scene.wait(scene.subject.controls.overflow())
        else reader.abort()
        await scene.wait(scene.subject.controls.retire(scene.subject.snapshots.initial.ref))
        await terminal(reader, 'stale-stream')
      },
    })),
    {
      obligation: 'explicit-terminal',
      async run(scene) {
        await publish(scene)
        const reader = scene.watch()
        await snapshot(reader, scene.subject.snapshots.initial)
        await scene.wait(scene.subject.controls.closeSource(scene.subject.snapshots.initial.ref))
        await terminal(reader, 'source-closed')
      },
    },
    {
      obligation: 'observer-close',
      async run(scene) {
        await publish(scene)
        const reader = scene.watch()
        await snapshot(reader, scene.subject.snapshots.initial)
        reader.abort()
        await terminal(reader, 'observer-closed')
        same(
          successful(await current(scene)),
          selection(scene.subject.snapshots.initial),
          'Closing an observer changed the current target.',
        )
      },
    },
    {
      obligation: 'projection-rejections',
      async run({ subject }) {
        const tenant = subject.access.tenant
        const { initial, next, sealed, changedSealed } = subject.snapshots
        same(
          diffModelStream({ tenant, before: sealed, after: changedSealed }),
          { failure: { kind: 'block-conflict' } },
          'A sealed block was mutable.',
        )
        const change = successful(diffModelStream({ tenant, before: initial, after: next }))
        same(
          applyModelStreamDelta({
            tenant,
            before: initial,
            delta: {
              ...change,
              from: { outputCursor: next.value.cursor, revision: next.value.state.revision },
            },
          }),
          { failure: { kind: 'base-mismatch' } },
          'The same target accepted a different from baseline.',
        )
      },
    },
  ]
}

function bounded<T>(operation: PromiseLike<T> | T, waitMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Violation('The operation exceeded waitMs.')), waitMs)
    Promise.resolve(operation).then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function run<P>(
  input: ModelStreamConformanceInput<P>,
  check: Check<P>,
): Promise<ModelStreamConformanceResult> {
  let subject: Subject<P> | undefined
  const readers: { controller: AbortController; iterator: AsyncIterator<Frame> }[] = []
  const wait = <T>(value: PromiseLike<T> | T) => bounded(value, input.waitMs)
  let detail = ''
  const describeFailure = (error: unknown) =>
    error instanceof Violation ? error.message : 'The subject operation failed.'
  try {
    const creating = Promise.resolve(input.subject())
    try {
      subject = await wait(creating)
    } catch (error) {
      // A late factory result still owns resources. Release it without exposing its error.
      void creating.then(value => wait(value.dispose())).catch(() => undefined)
      throw error
    }
    const active = subject
    await wait(active.controls.setAccess(active.access, 'allow'))
    await wait(active.controls.setAccess(active.otherAccess, 'allow'))
    await check.run({
      subject: active,
      wait,
      watch(ref = active.snapshots.initial.ref, access = active.access) {
        const controller = new AbortController()
        const iterator = active.observation
          .observe({ ref, access, signal: controller.signal })
          [Symbol.asyncIterator]()
        readers.push({ controller, iterator })
        return { next: () => wait(iterator.next()), abort: () => controller.abort() }
      },
    })
  } catch (error) {
    detail = describeFailure(error)
  } finally {
    for (const { controller, iterator } of readers) {
      try {
        controller.abort()
        if (iterator.return !== undefined) await wait(iterator.return())
      } catch {
        detail = 'Observation cleanup failed or exceeded waitMs.'
      }
    }
    if (subject !== undefined) {
      try {
        await wait(subject.dispose())
      } catch {
        detail = 'Subject cleanup failed or exceeded waitMs.'
      }
    }
  }
  return { obligation: check.obligation, status: detail === '' ? 'pass' : 'fail', detail }
}

/** Exercises public stream obligations with a fresh controlled subject for each check. */
export async function checkModelStreamConformance<P>(
  input: ModelStreamConformanceInput<P>,
): Promise<ModelStreamConformanceReport> {
  if (!Number.isFinite(input.waitMs) || input.waitMs <= 0)
    throw new RangeError('waitMs must be positive and finite')
  const results: ModelStreamConformanceResult[] = []
  for (const check of [...currentChecks<P>(), ...observationChecks<P>()])
    results.push(await run(input, check))
  return { ok: results.every(result => result.status === 'pass'), results }
}
