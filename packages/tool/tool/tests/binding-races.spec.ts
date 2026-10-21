import { afterEach, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { readToolInvocationRef, type ToolFailure } from '@omne-harness/tool-contract'
import {
  admission,
  ok,
  operationRefFor,
  principalA,
  request,
  tenantA,
  tenantB,
} from './runtime-values.ts'
import { admitCall, auditQueues, startHarness, toStarting } from './start-values.ts'

const refused = () =>
  fail<ToolFailure>({
    kind: 'unavailable',
    dependency: 'race-port',
    diagnostic: 'paused exclusion',
  })

afterEach(auditQueues)

for (const pause of [
  'negative-marker',
  'prepared-permit',
  'environment',
  'before-start',
] as const) {
  for (const winner of ['consume', 'exclude'] as const) {
    it(`21 race: ${pause}, ${winner} wins the original acceptance order`, async () => {
      const negativeRead = Promise.withResolvers<void>()
      const passNegative = Promise.withResolvers<void>()
      const markerPending = Promise.withResolvers<void>()
      const writeMarker = Promise.withResolvers<void>()
      const checkpoint = Promise.withResolvers<void>()
      const resume = Promise.withResolvers<void>()
      let attempts = 0
      let allowExclusion = false
      const stopHere = async () => {
        checkpoint.resolve()
        await resume.promise
      }
      const first = startHarness({
        driverStepsPerRun: 1,
        authorityPort: base => ({
          ...base,
          exclude: input => (allowExclusion ? base.exclude(input) : Promise.resolve(refused())),
        }),
        bindingPort: base => ({
          ...base,
          start: async (input, environment) => {
            attempts += 1
            if (attempts === 1) return refused()
            if (pause === 'before-start') await stopHere()
            return base.start(input, environment)
          },
        }),
        commands: base => ({
          ...base,
          recordStart: async input => {
            if (input.operation === 'op-c1/start-failed' && pause !== 'negative-marker') {
              markerPending.resolve()
              await writeMarker.promise
            }
            return base.recordStart(input)
          },
        }),
      })
      await admitCall(first, 'c1')
      const original = await toStarting(first, 'c1')
      let read = false
      const second = startHarness({
        memory: first.memory,
        authority: first.authority,
        binding: first.binding,
        driverStepsPerRun: 1,
        readsPort: base => ({
          ...base,
          operation: async input => {
            const answer = await base.operation(input)
            if (!read && input.operation === 'op-c1/start-failed') {
              read = true
              expect(ok(answer).kind).toBe('not-committed')
              negativeRead.resolve()
              await passNegative.promise
            }
            return answer
          },
        }),
        authorityPort: base => ({
          ...base,
          prepare: async input => {
            const permit = await base.prepare(input)
            if (pause === 'prepared-permit') await stopHere()
            return permit
          },
        }),
        environmentsPort: base => ({
          ...base,
          inspectPreparation: async input => {
            const environment = await base.inspectPreparation(input)
            if (pause === 'environment') await stopHere()
            return environment
          },
        }),
      })

      // C430-1 retains the old negative answer while the other driver commits its observation.
      // Later checkpoints let that old reader reach the named port before the marker commits.
      // A marker records failure, while P04 orders actual acceptance against permanent exclusion.
      const oldReader = second.runOnce('c1')
      await negativeRead.promise
      const observer = first.runOnce('c1')
      try {
        if (pause === 'negative-marker') {
          await observer
          await first.runOnce('c1') // Exclusion is unavailable, as in the original red probe.
        } else {
          await markerPending.promise
          passNegative.resolve()
          await checkpoint.promise
          writeMarker.resolve()
          await observer
        }
        const marker = ok(
          await first.runtime.queries.queryOperation({
            principal: principalA,
            tenant: tenantA,
            operation: operationRefFor('c1', 'op-c1', 'op-c1/start-failed'),
          }),
        )
        expect(marker.kind).toBe('committed')
        expect(first.authority.accepted).toEqual([])
        expect(first.binding.controls.launches()).toBe(0)
        expect(await first.state('c1')).toMatchObject({
          phase: 'starting',
          queue: { kind: 'held' },
        })
        if (winner === 'exclude') {
          allowExclusion = true
          await first.runOnce('c1')
        }
        passNegative.resolve()
        resume.resolve()
        await oldReader
        allowExclusion = true
        await first.runOnce('c1')
        await second.runOnce('c1')
        // A reader paused before authority.inspect sees an exclusion before entering start.
        // A reader already past inspect can still enter the method with its revoked permit.
        expect(attempts).toBe(pause === 'negative-marker' && winner === 'exclude' ? 1 : 2)
        expect(first.authority.consumed).toEqual(
          pause === 'negative-marker' && winner === 'exclude' ? [] : ['c1'],
        )
        expect(first.authority.accepted).toEqual(winner === 'consume' ? ['c1'] : [])
        expect(first.binding.controls.launches()).toBe(winner === 'consume' ? 1 : 0)
        const recovery = ok(await first.commands.loadRecovery(admission('c1', 'op-c1')))
        expect(recovery.start).toEqual(original)
        if (winner === 'consume') {
          expect(recovery.state).toMatchObject({ phase: 'running', queue: { kind: 'held' } })
          expect(recovery.result).toBeNull()
          expect(first.authority.excluded).toEqual([])
        } else {
          expect(recovery.state).toMatchObject({
            phase: 'settled',
            terminal: { kind: 'unavailable' },
            effect: { kind: 'not-started' },
            queue: { kind: 'released' },
            delivery: { kind: 'pending' },
          })
          expect(recovery.tasks.map(task => task.kind)).toEqual(['deliver'])
        }
      } finally {
        passNegative.resolve()
        writeMarker.resolve()
        resume.resolve()
        await Promise.allSettled([observer, oldReader])
      }
    })
  }
}

it('21 invoke: distinct consumer positions keep independent references and failure results', async () => {
  let firstCall = ''
  const harness = startHarness({
    bindingPort: base => ({
      ...base,
      start: (input, environment) =>
        input.call === firstCall ? Promise.resolve(refused()) : base.start(input, environment),
    }),
  })
  const payload = request()
  const first = await harness.runtime.invoke({
    principal: principalA,
    tenant: tenantA,
    request: payload,
  })
  if (first.kind !== 'accepted') throw new Error('first invoke was refused')
  firstCall = readToolInvocationRef(first.reference).call
  await harness.drive(firstCall)
  const second = await harness.runtime.invoke({
    principal: principalA,
    tenant: tenantA,
    request: { ...payload, consumer: { ...payload.consumer, position: 'second' } },
  })
  if (second.kind !== 'accepted') throw new Error('second invoke was refused')
  expect(first.reference).not.toBe(second.reference)
  await harness.drive(firstCall, readToolInvocationRef(second.reference).call)
  await harness.drive(firstCall, readToolInvocationRef(second.reference).call)
  expect(harness.authority.accepted).toEqual([readToolInvocationRef(second.reference).call])
  expect(harness.binding.controls.launches()).toBe(1)
  const lookup = (reference: typeof first.reference) =>
    harness.runtime.queries.lookup({ principal: principalA, tenant: tenantA, reference })
  expect(ok(await lookup(first.reference))).toMatchObject({
    kind: 'found',
    state: { phase: 'settled', terminal: { kind: 'unavailable' } },
  })
  expect(ok(await lookup(second.reference))).toMatchObject({
    kind: 'found',
    state: { phase: 'running' },
  })
  const crossTenant = await harness.runtime.queries.lookup({
    principal: principalA,
    tenant: tenantB,
    reference: first.reference,
  })
  expect(crossTenant).toMatchObject({ failure: { kind: 'denied' } })
})
