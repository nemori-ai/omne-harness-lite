import { invocationReference } from '../testing/reference-input.ts'
// The checks of who may reach a call and where it is served: other tenants and revoked principals
// are refused without a sign of whether the call exists, a lost or replaced instance ends only the
// observation, and a quiescing provider takes no new call.
import {
  accessOf,
  admitInput,
  callId,
  countOf,
  ended,
  endReason,
  expect,
  hookOf,
  instanceId,
  liveHandle,
  lookup,
  mutationOf,
  observing,
  operationId,
  placed,
  readId,
  refused,
  refusedAs,
  running,
  runtimeOf,
  same,
  show,
  snapshotOf,
  stateOf,
  succeeded,
  targetOf,
  untilEnd,
  versionId,
} from './conformance-kit.ts'
import type { ModelCallId } from '../index.ts'
import type { Check, Scene } from './conformance-types.ts'

const PROBES = [
  'inspect',
  'dispatches',
  'cancel',
  'connect',
  'beginRead',
  'acknowledge',
  'readNext',
  'closeRead',
] as const

const EVIDENCE = { owner: 'conformance', record: 'record', revision: '1', digest: 'digest' }

/** A call that has ended when the subject can end one, so a refusal is not the answer to a call that was not ready. */
async function readyCall<P>(scene: Scene<P>, label: string) {
  const hooks = scene.subject.hooks
  if (hooks?.startRun !== undefined && hooks.settleCall !== undefined) {
    const call = await ended(scene, label)
    return { call, version: call.version }
  }
  return { call: await placed(scene, label), version: versionId(label) }
}

export function routeChecks<P>(): readonly Check<P>[] {
  return [
    {
      name: 'cross-tenant-access-refused',
      requires: [],
      async run(scene) {
        const { calls, consumption } = runtimeOf(scene)
        const { call, version } = await readyCall(scene, 'cross-tenant')
        const other = scene.subject.otherTenant
        const before = await stateOf(scene, call)
        const outcomes = {
          cancel: await calls.cancel(
            mutationOf(scene, call.call, operationId('cross-cancel'), other),
          ),
          beginRead: await consumption.beginRead({
            ...mutationOf(scene, call.call, operationId('cross-read'), other),
            result: version,
          }),
          acknowledge: await consumption.acknowledge({
            ...mutationOf(scene, call.call, operationId('cross-ack'), other),
            result: version,
            evidence: { kind: 'processed', completion: EVIDENCE },
          }),
        }
        refused(outcomes.cancel, 'the cancel from another tenant')
        refused(outcomes.beginRead, 'the read from another tenant')
        refused(outcomes.acknowledge, 'the acknowledgement from another tenant')
        const after = await stateOf(scene, call)
        expect(same(before, after), `the refused requests changed the call: ${show(after)}`)
      },
    },
    {
      name: 'refusal-hides-existence',
      requires: [],
      async run(scene) {
        const { calls, consumption, instances } = runtimeOf(scene)
        const existing = await placed(scene, 'hidden')
        const other = scene.subject.otherTenant
        const operation = operationId('hidden')
        const probes = (call: ModelCallId) => ({
          inspect: calls.inspect({
            ...accessOf(scene, call, other),
            reference: invocationReference({
              ...accessOf(scene, call, other),
              admission: operation,
            }),
          }),
          dispatches: calls.dispatches(accessOf(scene, call, other)),
          cancel: calls.cancel(mutationOf(scene, call, operation, other)),
          connect: instances.connect(accessOf(scene, call, other)),
          beginRead: consumption.beginRead({
            ...mutationOf(scene, call, operation, other),
            result: versionId('hidden'),
          }),
          acknowledge: consumption.acknowledge({
            ...mutationOf(scene, call, operation, other),
            result: versionId('hidden'),
            evidence: { kind: 'processed', completion: EVIDENCE },
          }),
          readNext: consumption.readNext({
            ...accessOf(scene, call, other),
            read: readId('hidden'),
            after: '1',
          }),
          closeRead: consumption.closeRead({
            ...accessOf(scene, call, other),
            read: readId('hidden'),
          }),
        })
        const seen = probes(existing.call)
        const missing = probes(callId('absent'))
        for (const name of PROBES) {
          const [asked, none] = [await seen[name], await missing[name]]
          expect(
            same(asked, none),
            `${name} answers another tenant differently for a call that exists: ${show(asked)} and ${show(none)}`,
          )
        }
      },
    },
    {
      name: 'revoked-principal-gets-denied',
      requires: ['revokeAccess'],
      async run(scene) {
        const { calls, consumption } = runtimeOf(scene)
        const call = await placed(scene, 'revoked')
        await hookOf(
          scene,
          'revokeAccess',
        )({
          ...targetOf(scene, call.call),
          principal: scene.subject.principal,
          action: 'all',
        })
        refusedAs(
          await calls.inspect({
            ...accessOf(scene, call.call),
            reference: invocationReference({
              ...accessOf(scene, call.call),
              admission: call.operation,
            }),
          }),
          'denied',
          'the inspection after the revoke',
        )
        refusedAs(
          await consumption.beginRead({
            ...mutationOf(scene, call.call, operationId('revoked-read')),
            result: versionId('revoked'),
          }),
          'denied',
          'the read after the revoke',
        )
        refusedAs(
          await consumption.acknowledge({
            ...mutationOf(scene, call.call, operationId('revoked-ack')),
            result: versionId('revoked'),
            evidence: { kind: 'processed', completion: EVIDENCE },
          }),
          'denied',
          'the acknowledgement after the revoke',
        )
      },
    },
    {
      name: 'revoked-principal-observation-ends-denied',
      requires: ['revokeAccess'],
      async run(scene) {
        const call = await placed(scene, 'revoked-watch')
        const handle = await liveHandle(scene, call)
        await observing(scene, handle, async watch => {
          snapshotOf(await watch.next(), 'the first observation')
          await hookOf(
            scene,
            'revokeAccess',
          )({
            ...targetOf(scene, call.call),
            principal: scene.subject.principal,
            action: 'observe',
          })
          const reason = await untilEnd(watch, 'the observation after the revoke')
          expect(reason === 'denied', `the observation of a revoked principal ended as ${reason}`)
        })
        await observing(scene, handle, async watch => {
          const reason = endReason(await watch.next(), 'the new observation of a revoked principal')
          expect(
            reason === 'denied',
            `the new observation of a revoked principal ended as ${reason}`,
          )
        })
        const state = await stateOf(scene, call)
        expect(state.phase !== 'settled', `the revoke ended the call: ${show(state)}`)
      },
    },
    {
      name: 'withdrawn-instance-has-no-live-route',
      requires: ['withdrawInstance'],
      async run(scene) {
        const call = await placed(scene, 'withdrawn')
        await liveHandle(scene, call)
        await hookOf(scene, 'withdrawInstance')(targetOf(scene, call.call))
        const route = succeeded(
          await runtimeOf(scene).instances.connect(accessOf(scene, call.call)),
          'the connection after the instance left',
        )
        expect(
          route.kind === 'no-live-route',
          `a call without an instance connects as ${show(route)}`,
        )
        await stateOf(scene, call)
      },
    },
    {
      name: 'directory-failure-is-unavailable',
      requires: ['failDirectory'],
      async run(scene) {
        const call = await placed(scene, 'directory-down')
        await hookOf(scene, 'failDirectory')()
        refusedAs(
          await runtimeOf(scene).instances.connect(accessOf(scene, call.call)),
          'unavailable',
          'the connection while the directory is down',
        )
      },
    },
    {
      name: 'replaced-instance-ends-observation-as-stale',
      requires: ['replaceInstance'],
      async run(scene) {
        const call = await placed(scene, 'replaced')
        const old = await liveHandle(scene, call)
        const next = instanceId('replacement')
        await observing(scene, old, async watch => {
          snapshotOf(await watch.next(), 'the first observation')
          await hookOf(scene, 'replaceInstance')({ ...targetOf(scene, call.call), instance: next })
          const reason = await untilEnd(watch, 'the observation after the replacement')
          expect(
            reason === 'stale-instance',
            `the observation of the old instance ended as ${reason}`,
          )
        })
        await observing(scene, old, async watch => {
          const reason = endReason(await watch.next(), 'the new observation on the old handle')
          expect(
            reason === 'stale-instance',
            `a new observation on the old handle ended as ${reason}`,
          )
        })
        const fresh = await liveHandle(scene, call)
        expect(fresh.instance === next, `the connection gives ${fresh.instance}, not ${next}`)
        await stateOf(scene, call)
      },
    },
    {
      name: 'quiesce-refuses-new-admissions',
      requires: [],
      async run(scene) {
        const accepted = await placed(scene, 'before-quiesce')
        succeeded(await scene.subject.provider.quiesce(), 'the quiesce')
        const input = admitInput(scene, 'after-quiesce')
        refused(await runtimeOf(scene).calls.admit(input), 'an admission after the quiesce')
        const found = await lookup(scene, { input, call: input.call, operation: input.operation })
        expect(found.kind !== 'found', `a refused admission left a call: ${show(found)}`)
        await stateOf(scene, accepted)
      },
    },
    {
      name: 'quiesce-reports-pending-and-running',
      requires: [],
      async run(scene) {
        await placed(scene, 'reported-first')
        const runs = scene.subject.hooks?.startRun !== undefined
        if (runs) await running(scene, 'reported-second')
        const report = succeeded(await scene.subject.provider.quiesce(), 'the quiesce')
        const pending = countOf(report.pending)
        const active = countOf(report.running)
        expect(pending !== null, `the quiesce reports ${show(report.pending)} as pending calls`)
        expect(active !== null, `the quiesce reports ${show(report.running)} as running calls`)
        const known = runs ? 2 : 1
        expect(
          pending + active >= known,
          `the quiesce reports ${show(report)} for ${known} calls that are not ended`,
        )
        expect(!runs || active >= 1, `the quiesce reports no running call: ${show(report)}`)
      },
    },
  ]
}
