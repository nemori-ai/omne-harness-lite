import { reservedReference } from './reference-input.ts'
// The checks of acceptance: recognising a repeat, refusing a conflict or a reserved operation, and
// keeping the identity of an operation whose commit is not known.
import { variantOf } from './conformance-defaults.ts'
import {
  ackInput,
  acknowledgedOperation,
  admitInput,
  callId,
  copyOfAdmit,
  dispatchesOf,
  ended,
  evidenceFor,
  expect,
  hookOf,
  lookup,
  mutationOf,
  operationId,
  placed,
  refused,
  refusedAs,
  requestedOperation,
  reservedOperationId,
  runtimeOf,
  same,
  show,
  stateOf,
  succeeded,
  versionId,
} from './conformance-kit.ts'
import type { Check } from './conformance-types.ts'

const WRITE_EFFECTS = ['applied', 'dropped'] as const

export function admissionChecks<P>(): readonly Check<P>[] {
  return [
    {
      name: 'admission-repeat-recognised',
      requires: [],
      async run(scene) {
        const { calls } = runtimeOf(scene)
        const input = admitInput(scene, 'repeat')
        const first = succeeded(await calls.admit(input), 'the first admission')
        const again = succeeded(await calls.admit(copyOfAdmit(input)), 'the repeated admission')
        expect(again.call === first.call, `the repeat names ${again.call}, not ${first.call}`)
        expect(
          again.revision === first.revision,
          `the repeat has revision ${again.revision}, not ${first.revision}`,
        )
        expect(again.recovered, 'the repeat is not marked as recovered')
      },
    },
    {
      name: 'admission-conflict-on-different-input',
      requires: [],
      async run(scene) {
        const { calls } = runtimeOf(scene)
        const input = admitInput(scene, 'conflict')
        succeeded(await calls.admit(input), 'the first admission')
        const other = { ...input, request: variantOf(input.request) }
        const failure = refusedAs(await calls.admit(other), 'conflict', 'the changed admission')
        expect(
          failure.operation === input.operation,
          `the conflict names another operation: ${show(failure)}`,
        )
      },
    },
    {
      name: 'operation-not-reused-across-methods',
      requires: [],
      async run(scene) {
        const { calls } = runtimeOf(scene)
        const call = await placed(scene, 'cross-method')
        const before = await stateOf(scene, call)
        refused(
          await calls.cancel(mutationOf(scene, call.call, call.operation)),
          'a cancel that reuses the admission operation',
        )
        const after = await stateOf(scene, call)
        expect(same(before, after), `the refused cancel changed the call: ${show(after)}`)
      },
    },
    {
      name: 'admission-is-not-a-send',
      requires: [],
      async run(scene) {
        const call = await placed(scene, 'unsent')
        const records = await dispatchesOf(scene, call.call)
        const sent = records.filter(record => record.send === 'started')
        expect(sent.length === 0, `an accepted call shows a started send: ${show(sent)}`)
      },
    },
    {
      name: 'reserved-operation-refused',
      requires: [],
      async run(scene) {
        const { calls, consumption } = runtimeOf(scene)
        const call = await placed(scene, 'reserved')
        const reserved = reservedOperationId('use')
        const access = mutationOf(scene, call.call, reserved)
        const evidence = { owner: 'conformance', record: 'r', revision: '1', digest: 'd' }
        const attempts = [
          {
            what: 'admit',
            field: '/operation',
            outcome: await calls.admit({
              ...admitInput(scene, 'reserved-new'),
              operation: reserved,
            }),
          },
          { what: 'cancel', field: 'operation', outcome: await calls.cancel(access) },
          {
            what: 'inspect',
            field: 'reference',
            outcome: await Reflect.apply(calls.inspect, calls, [
              {
                ...access,
                reference: reservedReference({ ...access, admission: reserved }),
              },
            ]),
          },
          {
            what: 'beginRead',
            field: 'operation',
            outcome: await consumption.beginRead({ ...access, result: versionId('any') }),
          },
          {
            what: 'acknowledge',
            field: 'operation',
            outcome: await consumption.acknowledge({
              ...access,
              result: versionId('any'),
              evidence: { kind: 'processed', completion: evidence },
            }),
          },
        ]
        for (const { what, field, outcome } of attempts) {
          const failure = refusedAs(outcome, 'invalid', `${what} with a reserved operation`)
          expect(failure.field === field, `${what} names the field ${show(failure)}, not ${field}`)
        }
      },
    },
    {
      name: 'refused-admission-forms-no-call',
      requires: [],
      async run(scene) {
        const { calls } = runtimeOf(scene)
        const reservedInput = {
          ...admitInput(scene, 'refused'),
          operation: reservedOperationId('refused'),
        }
        refused(await calls.admit(reservedInput), 'the admission with a reserved operation')
        const again = succeeded(
          await calls.admit({ ...reservedInput, operation: operationId('after-refusal') }),
          'the admission of the same call after the refusal',
        )
        expect(!again.recovered, 'the refused admission left a call behind')
      },
    },
    {
      name: 'commit-unknown-keeps-operation',
      requires: ['failNextWrite'],
      async run(scene) {
        const { calls } = runtimeOf(scene)
        for (const effect of WRITE_EFFECTS) {
          const input = admitInput(scene, `unknown-${effect}`)
          await hookOf(
            scene,
            'failNextWrite',
          )({
            tenant: input.tenant,
            action: 'admit',
            operation: input.operation,
            effect,
          })
          const failure = refusedAs(
            await calls.admit(input),
            'commit-unknown',
            `the ${effect} admission`,
          )
          expect(
            failure.operation === input.operation,
            `the unknown commit names another operation: ${show(failure)}`,
          )
          const retry = succeeded(
            await calls.admit(copyOfAdmit(input)),
            `the retry after ${effect}`,
          )
          expect(retry.call === input.call, `the retry names ${retry.call}, not ${input.call}`)
          const other = { ...input, call: callId(`unknown-${effect}-other`) }
          refused(
            await calls.admit(other),
            `another call that reuses the operation after ${effect}`,
          )
        }
      },
    },
    {
      name: 'commit-unknown-not-reported-as-refusal',
      requires: ['failNextWrite'],
      async run(scene) {
        const { calls } = runtimeOf(scene)
        const input = admitInput(scene, 'unknown-visible')
        await hookOf(
          scene,
          'failNextWrite',
        )({
          tenant: input.tenant,
          action: 'admit',
          operation: input.operation,
          effect: 'applied',
        })
        refusedAs(await calls.admit(input), 'commit-unknown', 'the admission')
        const found = await lookup(scene, { input, call: input.call, operation: input.operation })
        expect(
          found.kind !== 'not-accepted',
          `an applied write is reported as not accepted: ${show(found)}`,
        )
      },
    },
    {
      name: 'commit-unknown-cancel-recovers-original',
      requires: ['failNextWrite'],
      async run(scene) {
        const { calls } = runtimeOf(scene)
        const call = await placed(scene, 'unknown-cancel')
        const operation = operationId('unknown-cancel')
        await hookOf(
          scene,
          'failNextWrite',
        )({
          tenant: call.input.tenant,
          action: 'cancel',
          operation,
          effect: 'applied',
        })
        const input = mutationOf(scene, call.call, operation)
        const failure = refusedAs(await calls.cancel(input), 'commit-unknown', 'the cancel')
        expect(
          failure.operation === operation,
          `the unknown cancel names another operation: ${show(failure)}`,
        )
        const control = succeeded(await calls.cancel(input), 'the retry of the cancel')
        expect(
          requestedOperation(control) === operation,
          `the retry gives another control: ${show(control)}`,
        )
      },
    },
    {
      name: 'commit-unknown-acknowledge-recovers-original',
      requires: ['failNextWrite', 'startRun', 'settleCall', 'provideEvidence'],
      async run(scene) {
        const { consumption } = runtimeOf(scene)
        const call = await ended(scene, 'unknown-ack')
        const operation = operationId('unknown-ack')
        const evidence = await evidenceFor(scene, call, 'ack')
        await hookOf(
          scene,
          'failNextWrite',
        )({
          tenant: call.input.tenant,
          action: 'acknowledge',
          operation,
          effect: 'applied',
        })
        const input = ackInput(scene, call, operation, evidence)
        refusedAs(await consumption.acknowledge(input), 'commit-unknown', 'the acknowledgement')
        succeeded(await consumption.acknowledge(input), 'the retry of the acknowledgement')
        const state = await stateOf(scene, call)
        expect(
          acknowledgedOperation(state.custody) === operation,
          `the call does not show the acknowledgement of the retry: ${show(state.custody)}`,
        )
      },
    },
  ]
}
