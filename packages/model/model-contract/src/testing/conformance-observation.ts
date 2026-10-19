// The checks of observation: the stream starts from a snapshot, closing it does not stop the call,
// a cut connection ends only the observation, and in-flight blocks show their accumulated value.
import type { JsonValue } from '@omne-harness/json-text'
import { compareOutputCursors } from '../identity-values.ts'
import {
  blockAt,
  deltaFact,
  expect,
  firstSnapshot,
  growingState,
  hookOf,
  isSealedToolCall,
  kindOf,
  liveHandle,
  mutationOf,
  observing,
  openFact,
  operationId,
  placed,
  replaceFact,
  running,
  runtimeOf,
  same,
  sealFact,
  show,
  snapshotOf,
  stateOf,
  succeeded,
  targetOf,
  textBlock,
  toolCallBlock,
  untilEnd,
} from './conformance-kit.ts'
import type { Check } from './conformance-types.ts'

/** The tree form of the JSON document {"a":1}. */
const ARGUMENTS: JsonValue = {
  kind: 'object',
  entries: [{ key: 'a', value: { kind: 'number', lexeme: '1' } }],
}

export function observationChecks<P>(): readonly Check<P>[] {
  return [
    {
      name: 'observation-opens-with-snapshot',
      requires: [],
      async run(scene) {
        const call = await placed(scene, 'observe-order')
        const handle = await liveHandle(scene, call)
        await observing(scene, handle, async watch => {
          const first = await watch.next()
          expect(
            kindOf(first) === 'snapshot',
            `the first observation is not a snapshot: ${show(first)}`,
          )
          const opening = snapshotOf(first, 'the first observation')
          succeeded(
            await runtimeOf(scene).calls.cancel(
              mutationOf(scene, call.call, operationId('observe-order')),
            ),
            'the cancel that changes the call',
          )
          const second = await watch.next()
          expect(
            kindOf(second) === 'changed',
            `the observation after a change is not a changed snapshot: ${show(second)}`,
          )
          const changed = snapshotOf(second, 'the observation after the change')
          expect(
            compareOutputCursors(opening.cursor, changed.cursor) <= 0,
            `the cursor went back from ${opening.cursor} to ${changed.cursor}`,
          )
        })
      },
    },
    {
      name: 'stopping-observation-keeps-call-running',
      requires: ['startRun'],
      async run(scene) {
        const call = await running(scene, 'stop-watching')
        const handle = await liveHandle(scene, call)
        await observing(scene, handle, async watch => {
          snapshotOf(await watch.next(), 'the first observation')
          watch.abort()
          const reason = await untilEnd(watch, 'the observation after the abort')
          expect(reason === 'observer-closed', `the aborted observation ended as ${reason}`)
        })
        const state = await stateOf(scene, call)
        expect(state.phase === 'running', `closing the observation ended the run: ${show(state)}`)
        expect(
          state.control.kind === 'none',
          `closing the observation asked for a control: ${show(state.control)}`,
        )
      },
    },
    {
      name: 'disconnect-ends-observation-as-unavailable',
      requires: ['disconnectObservers'],
      async run(scene) {
        const call = await placed(scene, 'disconnected')
        const handle = await liveHandle(scene, call)
        await observing(scene, handle, async watch => {
          snapshotOf(await watch.next(), 'the first observation')
          await hookOf(scene, 'disconnectObservers')(targetOf(scene, call.call))
          const reason = await untilEnd(watch, 'the observation after the disconnect')
          expect(reason === 'unavailable', `the cut observation ended as ${reason}`)
        })
        const state = await stateOf(scene, call)
        expect(state.phase !== 'settled', `the disconnect ended the call: ${show(state)}`)
      },
    },
    {
      name: 'new-observer-starts-from-snapshot',
      requires: ['startRun', 'showFacts'],
      async run(scene) {
        const call = await running(scene, 'late-observer')
        await hookOf(
          scene,
          'showFacts',
        )({
          ...targetOf(scene, call.call),
          facts: [openFact('0', 'text'), deltaFact('0', 'x')],
        })
        const snapshot = await firstSnapshot(
          scene,
          await liveHandle(scene, call),
          'the first observation',
        )
        expect(
          snapshot.state.phase === 'running',
          `the snapshot of a running call shows the phase ${snapshot.state.phase}`,
        )
        expect(
          snapshot.state.custody.kind === 'producer',
          `the snapshot of a running call shows the custody ${show(snapshot.state.custody)}`,
        )
        expect(
          same(growingState(blockAt(snapshot, '0')), {
            content: 'text',
            mode: 'append',
            value: 'x',
          }),
          `the snapshot lacks the block in flight: ${show(snapshot.blocks)}`,
        )
      },
    },
    {
      name: 'growing-block-holds-accumulated-value',
      requires: ['startRun', 'showFacts'],
      async run(scene) {
        const call = await running(scene, 'accumulated')
        await hookOf(
          scene,
          'showFacts',
        )({
          ...targetOf(scene, call.call),
          facts: [
            openFact('0', 'text'),
            deltaFact('0', 'a'),
            deltaFact('0', 'b'),
            openFact('1', 'text', 'replace'),
            replaceFact('1', 'x'),
            replaceFact('1', 'y'),
          ],
        })
        const snapshot = await firstSnapshot(
          scene,
          await liveHandle(scene, call),
          'the first observation',
        )
        const appended = growingState(blockAt(snapshot, '0'))
        expect(
          same(appended, { content: 'text', mode: 'append', value: 'ab' }),
          `the appended block shows ${show(appended)}, not the value ab`,
        )
        const replaced = growingState(blockAt(snapshot, '1'))
        expect(
          same(replaced, { content: 'text', mode: 'replace', value: 'y' }),
          `the replaced block shows ${show(replaced)}, not the value y`,
        )
      },
    },
    {
      name: 'sealed-block-takes-no-more-fill',
      requires: ['startRun', 'showFacts'],
      async run(scene) {
        const call = await running(scene, 'sealed')
        const sealed = textBlock('sealed-1', 'ab')
        const target = targetOf(scene, call.call)
        await hookOf(
          scene,
          'showFacts',
        )({
          ...target,
          facts: [openFact('0', 'text'), deltaFact('0', 'ab'), sealFact('0', sealed)],
        })
        await hookOf(scene, 'showFacts')({ ...target, facts: [deltaFact('0', 'c')] })
        const snapshot = await firstSnapshot(
          scene,
          await liveHandle(scene, call),
          'the first observation',
        )
        expect(
          same(blockAt(snapshot, '0'), { kind: 'sealed', index: '0', block: sealed }),
          `the sealed block shows ${show(blockAt(snapshot, '0'))} after a later fill`,
        )
      },
    },
    {
      name: 'unsealed-tool-arguments-not-executable',
      requires: ['startRun', 'showFacts'],
      async run(scene) {
        const growing = await running(scene, 'tool-growing')
        await hookOf(
          scene,
          'showFacts',
        )({
          ...targetOf(scene, growing.call),
          facts: [openFact('0', 'tool-arguments'), deltaFact('0', '{"city":"Pa')],
        })
        const shown = await firstSnapshot(
          scene,
          await liveHandle(scene, growing),
          'the first observation',
        )
        expect(
          !isSealedToolCall(blockAt(shown, '0')),
          `arguments that are still arriving became a tool suggestion: ${show(blockAt(shown, '0'))}`,
        )
        const cut = await running(scene, 'tool-cut')
        await hookOf(
          scene,
          'showFacts',
        )({
          ...targetOf(scene, cut.call),
          facts: [
            openFact('0', 'tool-arguments'),
            deltaFact('0', '{"a":1}'),
            { kind: 'trim', index: '0', removed: '', reason: 'length' },
            sealFact('0', toolCallBlock('t1', ARGUMENTS)),
          ],
        })
        const trimmed = await firstSnapshot(
          scene,
          await liveHandle(scene, cut),
          'the first observation',
        )
        expect(
          !isSealedToolCall(blockAt(trimmed, '0')),
          `arguments that were cut off became a tool suggestion: ${show(blockAt(trimmed, '0'))}`,
        )
      },
    },
  ]
}
