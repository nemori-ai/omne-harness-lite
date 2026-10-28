import { afterEach, describe, expect, it } from 'vitest'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type { PreparationRecord } from '@omne-harness/tool-contract/provider'
import { adoption, admission, fixedOf, functionDefinition, ok } from './runtime-values.ts'
import { admitCall, auditQueues, startHarness, writeContext } from './start-values.ts'

afterEach(auditQueues)

describe('fixed environment request through the real ledger and driver', () => {
  it('forwards the explicit scope and declaration and commits the adapter adoption separately', async () => {
    const scope = decodeScopeRef({
      ref: 'holder-generation-1',
      parent: { ref: 'parent-generation-1' },
    })
    if ('failure' in scope) throw new Error('invalid fixture scope')
    const environment = {
      adoption: adoption('environment-schema'),
      value: { kind: 'string' as const, value: 'requirement' },
    }
    const original = functionDefinition()
    const definition = { ...original, declarations: { ...original.declarations, environment } }
    const prepared: PreparationRecord[] = []
    const adapter = adoption('environment-adapter')
    const harness = startHarness({
      environmentsPort: base => ({
        ...base,
        adoption: adapter,
        prepare: input => {
          prepared.push(input.preparation)
          return base.prepare(input)
        },
      }),
    })
    await admitCall(harness, 'scope-call', {
      availability: {
        kind: 'available',
        layer: { kind: 'official' },
        executor: adoption('executor'),
        definition,
      },
      environment,
      requesterScope: scope.ok,
    })
    await harness.drive('scope-call')
    expect(prepared).toHaveLength(1)
    expect(prepared[0]).toMatchObject({
      adoption: adapter,
      request: { requesterScope: scope.ok, environment },
    })
    expect(harness.binding.executions).toEqual(['scope-call'])
  })

  it('refuses a replacement adapter after unknown preparation and keeps the original task', async () => {
    let current = adoption('environment')
    const harness = startHarness({
      environment: new Map([['original', 'unknown']]),
      environmentsPort: base => ({
        ...base,
        get adoption() {
          return current
        },
      }),
    })
    await admitCall(harness, 'original')
    await harness.drive('original')
    current = adoption('replacement')
    await harness.drive('original')
    expect(harness.environments.prepared).toEqual(['original'])
    expect(harness.environments.inspected).toEqual([])
    expect(harness.binding.executions).toEqual([])
    const recovery = ok(await harness.commands.loadRecovery(admission('original', 'op-original')))
    expect(recovery.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'prepare',
          preparation: expect.objectContaining({ adoption: adoption('environment') }),
        }),
      ]),
    )
    current = adoption('environment')
    harness.environments.answer('original', 'prepared')
    await harness.drive('original')
    expect(harness.environments.prepared).toEqual(['original'])
    expect(harness.environments.inspected).toEqual(['original'])
    expect(harness.binding.executions).toEqual(['original'])
  })

  it('includes the adapter adoption in planning idempotency and rejects malformed adoptions', async () => {
    const harness = startHarness()
    await admitCall(harness, 'plan')
    const input = {
      ...(await writeContext(harness, 'plan', 'plan-preparation')),
      request: fixedOf(harness.internalRequests, 'plan'),
      purpose: 'initial' as const,
      environmentAdoption: adoption('environment'),
    }
    const first = ok(await harness.commands.planPreparation(input))
    expect(first.adoption).toEqual(input.environmentAdoption)
    expect(
      await harness.commands.planPreparation({
        ...input,
        environmentAdoption: adoption('replacement'),
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    const missing = { ...input }
    Reflect.deleteProperty(missing, 'environmentAdoption')
    expect(await harness.commands.planPreparation(missing)).toMatchObject({
      failure: { kind: 'invalid', field: 'environmentAdoption' },
    })
  })
})
