import { it, expect } from 'vitest'
import {
  decodeActionId,
  decodeStepId,
  type PendingCall,
  type ModelReplyAdmission,
} from '@omne-harness/agent-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { deriveDriveOperation } from '@omne-harness/session-contract'
import { scene, ok, operation, operationId, evidence } from './fixtures/common-journal.ts'

async function modelScene(name: string) {
  const s = await scene(name),
    entry = sampleReceivedModelResult(s.access.tenant, name)
  if (entry.delivery.producer !== 'model') throw new Error('model expected')
  const call = ok(resolveModelInvocationRef(entry.delivery.key.reference, s.access.tenant)).call,
    pending: Extract<PendingCall, { kind: 'model' }> = {
      kind: 'model',
      purpose: 'main',
      action: ok(decodeActionId('action')),
      reference: entry.delivery.key.reference,
      consumption: entry.consumption,
      position: entry.consumer,
      fixed: evidence('request'),
    },
    result = {
      producer: { kind: 'model' as const, call },
      version: 'original-result',
      delivery: 'delivery',
      source: evidence('settlement-source'),
    },
    waits = [{ kind: 'producer' as const, pending }]
  let receipt = ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('pending'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.input.checkpoint, calls: [pending] },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [{ pending, action: pending.action, authority: s.opened.authority }],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('waiting'),
    }),
  )
  receipt = ok(
    await s.view.journal.recordResult({
      ...s.access,
      execution: s.execution,
      operation: operation('result'),
      consumption: pending.consumption,
      result,
      transfer: { kind: 'none' },
      release: { kind: 'pending' },
    }),
  )
  const admission: ModelReplyAdmission = {
    step: s.input.checkpoint.step,
    action: pending.action,
    call,
    resultVersion: result.version,
    decision: 'admitted',
    source: evidence('admission-source'),
  }
  async function admit(value: ModelReplyAdmission) {
    const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
    return s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('admission'),
      authority: s.opened.authority,
      expected: loaded.revision,
      checkpoint: s.input.checkpoint,
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: value,
    })
  }
  async function stop() {
    const control = operationId('stop'),
      target = operation(deriveDriveOperation({ kind: 'control', execution: s.execution, control }))
    ok(
      await s.backend.transactions.commit({
        access: s.access,
        command: {
          kind: 'control',
          input: {
            tenant: s.access.tenant,
            session: s.access.session,
            operation: control,
            intent: { kind: 'stop-call', producer: { kind: 'model', call: pending.reference } },
          },
        },
        guards: [],
      }),
    )
    ok(
      await s.view.journal.control({
        ...s.access,
        execution: s.execution,
        operation: target,
        command: { kind: 'interrupt-model', call, reason: evidence('stop') },
      }),
    )
    ok(
      await s.view.journal.recordControl({
        ...s.access,
        execution: s.execution,
        operation: operation('intent'),
        target,
        stage: 'intent-established',
        state: 'reached',
        source: evidence('intent'),
      }),
    )
    return target
  }
  return { ...s, admission, admit, stop, call, receipt }
}
for (const decision of ['admitted', 'rejected'] as const)
  it(`uses an original ${decision} reply admission before the named stop, with separate admission and settlement evidence`, async () => {
    const s = await modelScene(`settlement-${decision}`)
    ok(await s.admit({ ...s.admission, decision }))
    await s.stop()
    const input = { ...s.access, execution: s.execution, operation: operationId('snapshot') }
    s.backend.controls.faultSession(input, 'after-publish')
    expect(await s.backend.controls.reconcile(input)).toMatchObject({
      failure: { kind: 'commit-unknown' },
    })
    const root = s.view.controls.root()
    ok(await s.backend.controls.reconcile(input))
    expect(s.view.controls.root()).toBe(root)
    expect(ok(await s.backend.transactions.readWork(s.access)).controls[0]).toMatchObject({
      pending: [],
      state: 'reconciled',
    })
    expect(
      ok(await s.view.journal.load({ ...s.access, execution: s.execution })).results[0]?.release
        .kind,
    ).toBe('pending')
  })
for (const variant of [
  'none',
  'late',
  'missing-version',
  'missing-action',
  'wrong-step',
  'wrong-call',
  'incomplete-source',
] as const)
  it(`keeps direct stopping unresolved for ${variant} original admission evidence`, async () => {
    const s = await modelScene(`unproven-${variant}`)
    if (variant === 'late') await s.stop()
    if (variant !== 'none') {
      const result = await s.admit({
        ...s.admission,
        ...(variant === 'missing-version' ? { resultVersion: 'not-stored' } : {}),
        ...(variant === 'wrong-step' ? { step: ok(decodeStepId('other-step')) } : {}),
        ...(variant === 'wrong-call'
          ? {
              call: ok(
                resolveModelInvocationRef(
                  sampleReceivedModelResult(s.access.tenant, 'other').delivery.key.reference,
                  s.access.tenant,
                ),
              ).call,
            }
          : {}),
        ...(variant === 'missing-action' ? { action: ok(decodeActionId('not-original')) } : {}),
        ...(variant === 'incomplete-source'
          ? { source: { ...s.admission.source, digest: '' } }
          : {}),
      })
      if (variant === 'incomplete-source')
        expect(result).toMatchObject({ failure: { kind: 'invalid' } })
      else ok(result)
    }
    if (variant !== 'late') await s.stop()
    ok(
      await s.backend.controls.reconcile({
        ...s.access,
        execution: s.execution,
        operation: operationId('snapshot'),
      }),
    )
    expect(ok(await s.backend.transactions.readWork(s.access)).controls[0]?.pending).toHaveLength(1)
  })
it('another same-call control cannot satisfy K producer confirmation', async () => {
  const s = await modelScene('wrong-original-K')
  await s.stop()
  const target = operation('independent-stop')
  ok(
    await s.view.journal.control({
      ...s.access,
      execution: s.execution,
      operation: target,
      command: { kind: 'interrupt-model', call: s.call, reason: evidence('independent') },
    }),
  )
  ok(
    await s.view.journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation('independent-confirmed'),
      target,
      stage: 'producer-confirmed',
      state: 'reached',
      source: evidence('confirmed'),
    }),
  )
  ok(
    await s.backend.controls.reconcile({
      ...s.access,
      execution: s.execution,
      operation: operationId('snapshot'),
    }),
  )
  expect(ok(await s.backend.transactions.readWork(s.access)).controls[0]?.pending).toHaveLength(1)
})
