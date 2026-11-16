import type { Context } from '@deepseek-ai/cordis'
import type {
  ModelFailure,
  ModelInputMeter,
  ModelPreparationLease,
  ModelPreparationResources,
  ModelRequestRules,
} from '@omne-harness/model-contract'
import { ModelPreparationResourcesService } from '../cordis.ts'

type Acquire<P> = ModelPreparationResources<P>['acquire']
type Released = Awaited<ReturnType<ModelPreparationLease['release']>>
type PlanInput = Parameters<ModelRequestRules['plan']>[0]

export type ScriptedModelPreparationResourcesScript = Readonly<{
  meter: ModelInputMeter
  plan?: (input: PlanInput) => ReturnType<ModelRequestRules['plan']>
  acquire?: () => ModelFailure | null
  release?: () => Released
}>

export interface ScriptedModelPreparationResources<P> extends ModelPreparationResources<P> {
  readonly durability: 'none'
  outstanding(): number
}

function materialized(input: PlanInput): ReturnType<ModelRequestRules['plan']> {
  const text = JSON.stringify(input.assembled.messages)
  return {
    ok: {
      parameters: [],
      representation: {
        kind: 'materialized',
        adoption: input.assembled.representation,
        tokenInput: { kind: 'string', value: text },
        media: [],
        requestBytes: String(Buffer.byteLength(JSON.stringify(input.assembled))),
      },
    },
  }
}

export function createScriptedModelPreparationResources<P = unknown>(
  script: ScriptedModelPreparationResourcesScript,
): ScriptedModelPreparationResources<P> {
  let open = 0
  const plan = script.plan ?? materialized
  return {
    durability: 'none',
    outstanding: () => open,
    async acquire(input) {
      const refused = script.acquire?.() ?? null
      if (refused !== null) return { failure: refused }
      const bindings = input.profile.definition.suppliers.map(supplier => ({
        supplier: { ...supplier, credential: { layer: 'official' as const } },
        rules: { plan },
        meter: script.meter,
      }))
      const [first, ...rest] = bindings
      if (first === undefined)
        return {
          failure: { kind: 'unavailable', dependency: 'profile', diagnostic: 'no-supplier' },
        }
      open++
      let released: Promise<Released> | undefined
      return {
        ok: {
          bindings: [first, ...rest],
          release() {
            released ??= (async () => {
              open--
              return script.release?.() ?? {}
            })()
            return released
          },
        },
      }
    },
  }
}

class DelegatingModelPreparationResourcesService<P> extends ModelPreparationResourcesService<P> {
  private readonly source: ModelPreparationResources<P>

  constructor(ctx: Context, source: ModelPreparationResources<P>) {
    super(ctx)
    this.source = source
  }

  acquire(...args: Parameters<Acquire<P>>): ReturnType<Acquire<P>> {
    return this.source.acquire(...args)
  }
}

export function createModelPreparationResourcesPlugin<P = unknown>(
  source: ModelPreparationResources<P>,
): Readonly<{ name: string; apply(ctx: Context): void }> {
  return {
    name: 'scripted-model-preparation-resources',
    apply(ctx: Context) {
      new DelegatingModelPreparationResourcesService<P>(ctx, source)
    },
  }
}

export interface ModelPreparationResourcesSubject {
  readonly context: Context
  readonly input: Parameters<Acquire<unknown>>[0]
  dispose(): Promise<void>
}

export interface ModelPreparationResourcesFixture {
  create(): Promise<ModelPreparationResourcesSubject>
  createWithFailingRelease(): Promise<ModelPreparationResourcesSubject>
}

export type ModelPreparationResourcesCase = Readonly<{
  name: string
  clause: string
  run(): Promise<void>
}>

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function consumed(
  subject: ModelPreparationResourcesSubject,
): Promise<ModelPreparationResourcesService<unknown>> {
  let service: ModelPreparationResourcesService<unknown> | undefined
  await subject.context.plugin({
    name: 'preparation-resources-consumer',
    inject: ['modelPreparationResources'],
    apply(ctx: Context) {
      service = ctx.modelPreparationResources
    },
  })
  check(service !== undefined, 'the consumer plugin did not get modelPreparationResources')
  return service
}

async function leaseOf(
  service: ModelPreparationResourcesService<unknown>,
  input: Parameters<Acquire<unknown>>[0],
  what: string,
): Promise<ModelPreparationLease> {
  const acquired = await service.acquire(input)
  check('ok' in acquired, `${what} was refused: ${JSON.stringify(acquired)}`)
  return acquired.ok
}

export function modelPreparationResourcesConformance(
  fixture: ModelPreparationResourcesFixture,
): readonly ModelPreparationResourcesCase[] {
  const over =
    (
      create: () => Promise<ModelPreparationResourcesSubject>,
      run: (
        service: ModelPreparationResourcesService<unknown>,
        subject: ModelPreparationResourcesSubject,
      ) => Promise<void>,
    ) =>
    async () => {
      const subject = await create()
      try {
        await run(await consumed(subject), subject)
      } finally {
        await subject.dispose()
      }
    }
  return [
    {
      name: 'released-lease-gives-way-to-a-new-one',
      clause: 'After a lease is released without failure, acquire gives a new lease',
      run: over(
        () => fixture.create(),
        async (service, subject) => {
          const first = await leaseOf(service, subject.input, 'the first acquire')
          const released = await first.release()
          check(released.failure === undefined, 'a release with working hooks answered failure')
          const second = await leaseOf(service, subject.input, 'the acquire after the release')
          check(second !== first, 'the acquire after the release gave the released lease again')
          await second.release()
        },
      ),
    },
    {
      name: 'failed-release-returns-failure',
      clause: 'A release whose hooks fail resolves with an unavailable failure and does not throw',
      run: over(
        () => fixture.createWithFailingRelease(),
        async (service, subject) => {
          const lease = await leaseOf(service, subject.input, 'the acquire')
          let released: Released
          try {
            released = await lease.release()
          } catch (error) {
            throw new Error(`the release threw instead of answering failure: ${String(error)}`)
          }
          check(
            released.failure?.kind === 'unavailable',
            `a failed release answered ${JSON.stringify(released)}`,
          )
        },
      ),
    },
  ]
}
