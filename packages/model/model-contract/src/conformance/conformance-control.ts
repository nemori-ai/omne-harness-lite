// The checks of control: a cancel is an intent that the call keeps, that reaches only its own call,
// that does not pretend the model stopped, and that does not acknowledge the result.
import {
  dispatchesOf,
  ending,
  expect,
  hookOf,
  mutationOf,
  operationId,
  placed,
  refusedAs,
  requestedOperation,
  running,
  runtimeOf,
  same,
  show,
  startedCount,
  stateOf,
  succeeded,
  targetOf,
} from './conformance-kit.ts'
import type { Check } from './conformance-types.ts'

export function controlChecks<P>(): readonly Check<P>[] {
  return [
    {
      name: 'repeat-cancel-returns-original-control',
      requires: [],
      async run(scene) {
        const { calls } = runtimeOf(scene)
        const call = await placed(scene, 'repeat-cancel')
        const first = operationId('cancel-first')
        const control = succeeded(
          await calls.cancel(mutationOf(scene, call.call, first)),
          'the first cancel',
        )
        expect(
          requestedOperation(control) === first,
          `the first cancel gives ${show(control)}, not the control of ${first}`,
        )
        const again = succeeded(
          await calls.cancel(mutationOf(scene, call.call, operationId('cancel-second'))),
          'the second cancel',
        )
        expect(
          requestedOperation(again) === first,
          `the second cancel gives ${show(again)}, not the first control`,
        )
      },
    },
    {
      name: 'cancel-does-not-claim-stop',
      requires: [],
      async run(scene) {
        const call = await placed(scene, 'no-stop-claim')
        const control = succeeded(
          await runtimeOf(scene).calls.cancel(
            mutationOf(scene, call.call, operationId('no-stop-claim')),
          ),
          'the cancel',
        )
        expect(control.kind === 'requested', `the cancel gives no control: ${show(control)}`)
        expect(
          control.upstream !== 'stopped',
          `the cancel claims that the model stopped: ${show(control)}`,
        )
      },
    },
    {
      name: 'cancelled-call-ends-interrupted-unacknowledged',
      requires: ['startRun', 'settleCall'],
      async run(scene) {
        const call = await running(scene, 'interrupted')
        const operation = operationId('interrupt')
        succeeded(
          await runtimeOf(scene).calls.cancel(mutationOf(scene, call.call, operation)),
          'the cancel',
        )
        // The termination comes from this suite, through the hook: the provider does not choose
        // it. Only the custody below is the provider's own answer, and the report does not say
        // that the interruption was proven.
        const done = await ending(scene, call, {
          termination: { kind: 'interrupted', control: operation },
        })
        const termination = done.state.settlement.termination
        expect(
          termination.kind === 'interrupted',
          `the call ended as ${show(termination)}, not as interrupted`,
        )
        expect(
          termination.control === operation,
          `the call was interrupted by ${termination.control}, not by ${operation}`,
        )
        const state = await stateOf(scene, call)
        expect(
          state.custody.kind === 'producer',
          `the cancel acknowledged the result: ${show(state.custody)}`,
        )
      },
    },
    {
      name: 'cancel-confined-to-target-call',
      requires: [],
      async run(scene) {
        const target = await placed(scene, 'cancel-target')
        const other = await placed(scene, 'cancel-other')
        const before = await stateOf(scene, other)
        succeeded(
          await runtimeOf(scene).calls.cancel(
            mutationOf(scene, target.call, operationId('cancel-target')),
          ),
          'the cancel',
        )
        const after = await stateOf(scene, other)
        expect(same(before, after), `the cancel of another call changed this one: ${show(after)}`)
      },
    },
    {
      name: 'unauthorised-cancel-denied',
      requires: ['revokeAccess'],
      async run(scene) {
        const call = await placed(scene, 'no-right')
        await hookOf(
          scene,
          'revokeAccess',
        )({
          ...targetOf(scene, call.call),
          principal: scene.subject.principal,
          action: 'cancel',
        })
        refusedAs(
          await runtimeOf(scene).calls.cancel(
            mutationOf(scene, call.call, operationId('no-right')),
          ),
          'denied',
          'the cancel without the right',
        )
        const state = await stateOf(scene, call)
        expect(
          state.control.kind === 'none',
          `a refused cancel left a control: ${show(state.control)}`,
        )
      },
    },
    {
      name: 'cancel-sends-nothing-more',
      requires: ['startRun'],
      async run(scene) {
        const call = await running(scene, 'no-more-sends')
        const before = startedCount(await dispatchesOf(scene, call.call))
        expect(
          before > 0,
          'the running call shows no send that started, so a later one is not seen',
        )
        succeeded(
          await runtimeOf(scene).calls.cancel(
            mutationOf(scene, call.call, operationId('no-more-sends')),
          ),
          'the cancel',
        )
        const after = startedCount(await dispatchesOf(scene, call.call))
        const later = startedCount(await dispatchesOf(scene, call.call))
        expect(after === before, `sends started after the cancel: ${before}, then ${after}`)
        expect(later === before, `sends started later still: ${before}, then ${later}`)
      },
    },
  ]
}
