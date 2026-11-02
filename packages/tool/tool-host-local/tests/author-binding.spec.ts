import { describe, expect, it } from 'vitest'
import {
  runConformanceCase,
  toolExecutorBindingConformance,
} from '@omne-harness/tool-contract/testing'
import { bindingFixture, unbox } from './author-values.ts'
import { fail, succeed } from '@omne-harness/operation-result'
import { adoption, callId, evidence, instanceId, operationId } from './coordinator-values.ts'

describe('real author binding N7', () => {
  it('stopping one author leaves another invocation live', async () => {
    const fixture = await bindingFixture()
    if (fixture.request?.availability.kind !== 'available' || fixture.permit === undefined)
      throw new Error('missing fixture request')
    const fixed = fixture.request
    const permitFor = fixture.permit
    const executor = fixture.request.availability.executor
    const startOf = (id: string) => ({
      kind: 'start' as const,
      operation: operationId(`start-${id}`),
      executor,
      execution: {
        tenant: fixture.access.tenant,
        call: callId(id),
        instance: instanceId,
        generation: '1',
      },
    })
    const first = startOf('call-1')
    const second = startOf('call-2')
    const begin = async (start: ReturnType<typeof startOf>) =>
      unbox(
        await fixture.binding.start(
          {
            ...fixture.access,
            call: start.execution.call,
            start,
            request: fixed,
            permit: await permitFor(start),
          },
          fixture.environment,
        ),
      )
    const live = await begin(first)
    await begin(second)
    const control = {
      tenant: first.execution.tenant,
      call: first.execution.call,
      operation: operationId('stop-one'),
      adoption: adoption('stop'),
      inputDigest: 'sha256:stop-one',
      start: first,
      intent: { kind: 'stop' as const },
      source: evidence('stop'),
    }
    expect(unbox(await live.stop(control)).kind).toBe('accepted')
    await fixture.completeStop?.(first)
    expect(unbox(await live.inspectControl(control)).kind).toBe('stopped')
    expect(
      unbox(
        await fixture.binding.inspectStart({
          ...fixture.access,
          call: second.execution.call,
          start: second,
        }),
      ).kind,
    ).toBe('live')
    expect(fixture.launches?.()).toBe(2)
  })
  it.each(toolExecutorBindingConformance<string, unknown>())('$clause $name', async conformance => {
    expect(await runConformanceCase(conformance, await bindingFixture())).toEqual({
      kind: 'passed',
    })
  })
  it('does not enter the author or replay when consume has an unknown outcome', async () => {
    let consumed = 0
    const fixture = await bindingFixture(async () => {
      consumed += 1
      return succeed({ kind: 'unknown', diagnostic: 'receipt lost' })
    })
    if (fixture.request?.availability.kind !== 'available' || fixture.permit === undefined)
      throw new Error('missing fixture request')
    const start = {
      kind: 'start' as const,
      operation: operationId('unknown-start'),
      executor: fixture.request.availability.executor,
      execution: {
        tenant: fixture.access.tenant,
        call: callId('call-1'),
        instance: instanceId,
        generation: '1',
      },
    }
    const input = {
      ...fixture.access,
      call: start.execution.call,
      start,
      request: fixture.request,
      permit: await fixture.permit(start),
    }
    expect(await fixture.binding.start(input, fixture.environment)).toHaveProperty(
      'failure.kind',
      'commit-unknown',
    )
    expect(await fixture.binding.start(input, fixture.environment)).toHaveProperty(
      'failure.kind',
      'commit-unknown',
    )
    expect(unbox(await fixture.binding.inspectStart(input)).kind).toBe('unknown')
    expect(fixture.launches?.()).toBe(0)
    expect(consumed).toBe(1)
    expect(fixture.pins()).toBe('1')
  })
  it('releases the pin after a definite start denial', async () => {
    const fixture = await bindingFixture(async () => fail({ kind: 'denied', action: 'start' }))
    if (fixture.request?.availability.kind !== 'available' || fixture.permit === undefined)
      throw new Error('missing fixture request')
    const start = {
      kind: 'start' as const,
      operation: operationId('denied-start'),
      executor: fixture.request.availability.executor,
      execution: {
        tenant: fixture.access.tenant,
        call: callId('call-1'),
        instance: instanceId,
        generation: '1',
      },
    }
    expect(
      await fixture.binding.start(
        {
          ...fixture.access,
          call: start.execution.call,
          start,
          request: fixture.request,
          permit: await fixture.permit(start),
        },
        fixture.environment,
      ),
    ).toHaveProperty('failure.kind', 'denied')
    expect(fixture.launches?.()).toBe(0)
    expect(fixture.pins()).toBe('0')
  })
})
