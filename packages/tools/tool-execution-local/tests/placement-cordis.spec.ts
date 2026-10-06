import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import { CurrentEvaluationInputsService } from '@omne-harness-lite/asset-evaluation/cordis'
import { ExecutionEnvironmentsService } from '@omne-harness-lite/execution-environments/cordis'
import { ToolRuntimeRegistryService } from '@omne-harness-lite/tool-execution-runtime/cordis'
import type {
  EnvironmentPlacement,
  EnvironmentPlacementSource,
} from '@omne-harness-lite/execution-environments'
import { toolEnvironmentPlacement } from '../src/cordis.ts'
import { description, placementFixture, scope } from './placement-fixture.ts'

async function fixture(
  selection: { kind: 'unique' } | { kind: 'reference'; reference: typeof description.reference },
) {
  const root = new Context(),
    h = placementFixture()
  let registered: EnvironmentPlacementSource | undefined
  class Inputs extends CurrentEvaluationInputsService {
    read = h.inputs
  }
  class Tools extends ToolRuntimeRegistryService {
    acquire = h.acquire
    async submit() {
      return { kind: 'rejected', reason: 'runtimeUnavailable' } as const
    }
    async stop() {
      return 'unavailable' as const
    }
    async answer() {
      return 'unavailable' as const
    }
    register() {
      return async () => {}
    }
  }
  class Environments extends ExecutionEnvironmentsService {
    async resolvePlacement() {
      return { kind: 'notApplicable' } as const
    }
    async describe() {
      return { kind: 'rejected', reason: 'unavailable' } as const
    }
    async acquire() {
      return { kind: 'rejected', reason: 'unavailable' } as const
    }
    async recover() {
      return { kind: 'rejected', reason: 'unavailable' } as const
    }
    registerProvider() {
      return async () => {}
    }
    registerPlacementSource(source: EnvironmentPlacementSource) {
      const dispose = this.ctx.effect(() => {
        registered = source
        return () => {
          registered = undefined
        }
      })
      return async () => {
        await dispose()
      }
    }
  }
  const providers = await root.plugin({
    name: 'placement-public-ports',
    apply(ctx: Context) {
      new Inputs(ctx)
      new Tools(ctx)
      new Environments(ctx)
    },
  })
  const contributor = await root.plugin(toolEnvironmentPlacement, {
    name: 'tools',
    factoryPermission: 'always-allow',
    selection,
  })
  if (!registered) throw new Error('placement contributor did not register')
  const source = registered
  const placement: EnvironmentPlacement = {
    scope,
    ...h.call,
    permission: 'always-allow',
    revision: 'one',
    evidence: null,
    requirement: { bindingLayer: 'host_machine', facilities: ['command'] },
  }
  return {
    h,
    source,
    placement,
    contributor,
    registered: () => registered,
    async close() {
      await contributor.dispose()
      await providers.dispose()
      await root.fiber.dispose()
    },
  }
}
test('the static Cordis contributor uses public injected ports and its caller owns withdrawal', async () => {
  const h = await fixture({ kind: 'unique' })
  try {
    const { settings: _settings, ...pure } = h.h.selected.definition
    h.h.read.mockResolvedValue({
      kind: 'found',
      snapshot: {
        ref: { ...scope, callId: h.h.call.execution },
        origin: { run: 'run', attempt: 1, assistantMessage: 'reply' },
        selected: { ...h.h.selected, definition: pure },
        adoptedContext: [],
        state: { phase: 'queued' },
      },
    })
    expect(await h.source.read(scope, h.h.token, h.h.call)).toEqual({ kind: 'notApplicable' })
    expect(h.h.acquire).toHaveBeenCalledOnce()
    expect(h.h.release).toHaveBeenCalledOnce()
    expect(h.h.inputs).not.toHaveBeenCalled()
    await h.contributor.dispose()
    expect(h.registered()).toBeUndefined()
  } finally {
    await h.close()
  }
})
test('explicit unique selection accepts one candidate and rejects both none and ambiguity', async () => {
  const h = await fixture({ kind: 'unique' })
  try {
    expect(await h.source.select(h.placement, [description])).toEqual({
      kind: 'selected',
      reference: description.reference,
    })
    expect(await h.source.select(h.placement, [])).toEqual({
      kind: 'rejected',
      reason: 'ambiguousEnvironment',
    })
    expect(
      await h.source.select(h.placement, [
        description,
        { ...description, reference: { ...description.reference, reference: 'second' } },
      ]),
    ).toEqual({ kind: 'rejected', reason: 'ambiguousEnvironment' })
  } finally {
    await h.close()
  }
})
test('explicit reference selection cannot return a reference outside the matched set', async () => {
  const h = await fixture({ kind: 'reference', reference: description.reference })
  try {
    expect(
      await h.source.select(h.placement, [
        { ...description, reference: { ...description.reference, reference: 'other' } },
        description,
      ]),
    ).toEqual({ kind: 'selected', reference: description.reference })
    expect(await h.source.select(h.placement, [])).toEqual({
      kind: 'rejected',
      reason: 'noMatchingEnvironment',
    })
  } finally {
    await h.close()
  }
})
