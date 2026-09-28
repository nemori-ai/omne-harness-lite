import { describe, expect, it } from 'vitest'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import {
  CURRENT_EVALUATION_INPUTS_SERVICE,
  type CurrentEvaluationInputs,
} from '@omne-harness-lite/evaluation-input-store'
import {
  createAcceptanceApplication,
  MODEL_REQUEST_FIBERS,
  type AcceptanceEvent,
  type AcceptanceHooks,
} from '../src/index.ts'
import { actor, latch } from './support.ts'
import { callDeployment, ROOT } from './model-request-support.ts'

function currentFace(value: unknown): value is CurrentEvaluationInputs {
  return (
    typeof value === 'object' &&
    value !== null &&
    'read' in value &&
    typeof value.read === 'function'
  )
}
function app(
  config: Awaited<ReturnType<typeof callDeployment>>,
  hooks?: AcceptanceHooks,
  events: AcceptanceEvent[] = [],
) {
  return createAcceptanceApplication(config, {
    stage: 'modelRequest',
    diagnostics: { record: e => events.push(e) },
    ...(hooks === undefined ? {} : { hooks }),
  })
}

describe('A2b source and transport preparation', () => {
  it('opens actual eleven-fiber stage, publishes all three scopes, captures and evaluates real inputs, then reopens', async () => {
    const config = await callDeployment('call-source'),
      events: AcceptanceEvent[] = []
    let reader: CurrentEvaluationInputs | undefined
    const first = app(
      config,
      {
        beforeConfirm() {
          expect(Object.keys(first.status().fibers)).toHaveLength(6)
        },
        async fiberCreated(name, fiber) {
          if (name === 'evaluationInputs') {
            await fiber
            const value: unknown = fiber.ctx.get(CURRENT_EVALUATION_INPUTS_SERVICE)
            if (!currentFace(value)) throw new Error('real current evaluation inputs absent')
            reader = value
          }
        },
      },
      events,
    )
    await first.ready
    const who = await actor(first)
    try {
      expect(Object.isFrozen(MODEL_REQUEST_FIBERS)).toBe(true)
      expect(Object.keys(first.status().fibers)).toEqual([...MODEL_REQUEST_FIBERS])
      expect(await first.prepareModelInputs(who, 'not-seeded')).toEqual({
        step: 'holdingTenant',
        result: { failure: 'sessionNotFound' },
      })
      expect(await first.prepareSession(who, 's1')).toEqual({ session: 's1', tenant: who.tenant })
      expect(await first.prepareModelInputs(who, 's1')).toEqual({ prepared: true })
      const actual = await reader?.read('s1', who.tenant)
      if (actual === undefined || !('input' in actual)) throw new Error('actual source read failed')
      const result = evaluate(actual.input)
      if (!('ok' in result)) throw new Error('actual evaluation failed')
      expect(result.ok.root).toEqual(ROOT)
      expect(result.ok.values.find(v => v.item === 'first_token_wait_limit')?.value).toBe('PT15S')
      expect(result.ok.values.find(v => v.item === 'post_first_token_stall_limit')?.value).toBe(
        'PT120S',
      )
      expect(await first.prepareModelInputs(who, 's1')).toEqual({
        step: 'publishLocalInputs',
        result: { failure: 'conflict' },
      })
      expect((await first.close()).complete).toBe(true)
      let reopenedReader: CurrentEvaluationInputs | undefined
      const next = app(config, {
        async fiberCreated(name, fiber) {
          if (name === 'evaluationInputs') {
            await fiber
            const value: unknown = fiber.ctx.get(CURRENT_EVALUATION_INPUTS_SERVICE)
            if (!currentFace(value)) throw new Error('reader absent')
            reopenedReader = value
          }
        },
      })
      try {
        await next.ready
        expect(await reopenedReader?.read('s1', who.tenant)).toEqual(actual)
        expect(await next.readSessionLog(who, 's1')).toEqual({ entries: [], tail: 0 })
      } finally {
        expect((await next.close()).complete).toBe(true)
      }
      const closed = events.filter(e => e.event === 'close').map(e => e.phase)
      expect(closed.indexOf('modelContributions')).toBeLessThan(closed.indexOf('modelTransport'))
      expect(closed.indexOf('modelTransport')).toBeLessThan(closed.indexOf('evaluationInputs'))
      expect(closed.indexOf('evaluationInputs')).toBeLessThan(closed.indexOf('sessionLogOwner'))
    } finally {
      await first.close()
    }
  })

  it('rejects cross actor/session and missing scope sources without filling them', async () => {
    const config = await callDeployment('call-missing-scope')
    const source = config.modelRequest.evaluationInputs.prepare
    const broken = {
      ...config,
      modelRequest: {
        ...config.modelRequest,
        evaluationInputs: {
          ...config.modelRequest.evaluationInputs,
          async prepare(...args: Parameters<typeof source>) {
            const value = await source(...args)
            return {
              ...value,
              publication: {
                ...value.publication,
                scopes: value.publication.scopes.filter(s => s.holder.layer !== 'organization'),
              },
            }
          },
        },
      },
    }
    const instance = app(broken)
    try {
      await instance.ready
      const alice = await actor(instance),
        bob = await actor(instance, 'bob')
      await instance.prepareSession(alice, 's1')
      expect(await instance.prepareModelInputs(bob, 's1')).toEqual({ failure: 'identityMismatch' })
      expect(await instance.prepareModelInputs(alice, 's1')).toEqual({
        step: 'captureSessionRecipe',
        result: { failure: 'unavailable' },
      })
    } finally {
      expect((await instance.close()).complete).toBe(true)
    }
  })

  it('drains trusted source preparation before withdrawing real services and rejects new admission', async () => {
    const config = await callDeployment('call-source-close'),
      entered = latch(),
      release = latch()
    const original = config.modelRequest.evaluationInputs.prepare
    const instance = app({
      ...config,
      modelRequest: {
        ...config.modelRequest,
        evaluationInputs: {
          ...config.modelRequest.evaluationInputs,
          async prepare(...args: Parameters<typeof original>) {
            entered.resolve()
            await release.promise
            return original(...args)
          },
        },
      },
    })
    await instance.ready
    const who = await actor(instance)
    await instance.prepareSession(who, 's1')
    const work = instance.prepareModelInputs(who, 's1')
    await entered.promise
    const close = instance.close()
    expect(await instance.prepareModelInputs(who, 's1')).toEqual({ failure: 'stageClosed' })
    expect(instance.status().inFlight).toBe(1)
    release.resolve()
    expect(await work).toEqual({ prepared: true })
    expect((await close).complete).toBe(true)
  })
})
