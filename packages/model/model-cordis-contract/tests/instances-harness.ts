// Shared set-up of the instance directory tests. Everything runs on a real Cordis Context. The one
// stand-in is the qualification authority: it is the provider of ModelPublicationAuthorityService
// in a real assembly and is not part of this package, so `surrogateAuthority` answers in its place.
import { Context } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  DurableEvidence,
  ExecutionRef,
  LiveRoute,
  ModelCallId,
  ModelHandle,
  ModelInstanceId,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ModelPublicationAuthority,
  ModelRegistration,
  ModelRegistrationFailure,
  ModelRegistrationInput,
} from '../src/cordis.ts'
import { ModelInstancesService } from '../src/cordis.ts'

export type Input = ModelRegistrationInput<unknown>
export type Registered = Outcome<ModelRegistration, ModelRegistrationFailure>

export function execution(
  tenant: TenantId,
  call: ModelCallId,
  instance: ModelInstanceId,
  generation = '1',
): ExecutionRef {
  return { tenant, call, instance, generation }
}

/** A handle that the directory only passes on: nothing in these tests observes through it. */
export function handleOf(instance: ModelInstanceId): ModelHandle<unknown> {
  return {
    instance,
    async *observe() {},
  }
}

export function evidence(record = 'grant'): DurableEvidence {
  return { owner: 'test', record, revision: '1', digest: `sha256:${record}` }
}

export function input(
  from: ExecutionRef,
  handle: ModelHandle<unknown>,
  authority = evidence(),
): Input {
  return { publication: [from, handle], authority }
}

/** Stands in for the qualification authority and grants every registration. It keeps no record. */
export const grantingAuthority: ModelPublicationAuthority<unknown> = {
  check: () => ({ ok: undefined }),
}

export type SurrogateAuthority = ModelPublicationAuthority<unknown> &
  Readonly<{ seen: Input[]; deny(failure: ModelRegistrationFailure | undefined): void }>

/**
 * Stands in for the qualification authority: grants every registration unless told to deny, and
 * records what it was asked. The record keeps the requests alive, so a test that watches for
 * collection uses `grantingAuthority`.
 */
export function surrogateAuthority(): SurrogateAuthority {
  const seen: Input[] = []
  let denial: ModelRegistrationFailure | undefined
  return {
    seen,
    deny(failure) {
      denial = failure
    },
    check(request) {
      seen.push(request)
      return denial === undefined ? { ok: undefined } : { failure: denial }
    },
  }
}

export function registrationOf(outcome: Registered): ModelRegistration {
  if (!('ok' in outcome)) throw new Error(`registration failed: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

export function routeOf(outcome: Outcome<LiveRoute<unknown>, unknown>): LiveRoute<unknown> {
  if (!('ok' in outcome)) throw new Error(`connect failed: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

export type World = Awaited<ReturnType<typeof startDirectory>>

/** Loads the directory in its own plugin fiber and lets contributor plugins register through it. */
export async function startDirectory(
  authority: ModelPublicationAuthority<unknown> = grantingAuthority,
) {
  const root = new Context()
  const host = root.plugin({
    name: 'directory-host',
    apply(ctx: Context) {
      new ModelInstancesService<unknown>(ctx, authority)
    },
  })
  await host
  const directory = root.get('modelInstances')
  if (directory === undefined) throw new Error('the directory did not load')

  let count = 0
  return {
    root,
    host,
    directory,
    connect: directory.connect,
    /** Asks the directory for the live route of one call, with a stand-in principal. */
    async routeOfCall(tenant: TenantId, call: ModelCallId) {
      return routeOf(await directory.connect({ principal: 'principal', tenant, call }))
    },
    /**
     * Registers from a fresh contributor fiber; its disposal withdraws the registration. The
     * plugin object stays in the Cordis registry while the fiber lives, so it gives up its
     * references to the request and the answer as soon as it has used them.
     */
    async contribute(request: Input) {
      const call: { request?: Input | undefined; pending?: Promise<Registered> | undefined } = {
        request,
      }
      const fiber = root.plugin({
        name: `contributor-${++count}`,
        inject: ['modelInstances'],
        apply(ctx: Context) {
          const current = call.request
          call.request = undefined
          if (current !== undefined) call.pending = ctx.modelInstances.register(current)
        },
      })
      await fiber
      const { pending } = call
      call.pending = undefined
      if (pending === undefined) throw new Error('the contributor did not load')
      return { fiber, outcome: await pending }
    },
  }
}
