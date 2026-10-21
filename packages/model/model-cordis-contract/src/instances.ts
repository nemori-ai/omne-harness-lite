import { randomUUID } from 'node:crypto'
import { Service, type Context as CordisContext } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  DurableEvidence,
  ExecutionRef,
  LiveRoute,
  ModelCallId,
  ModelInstanceDirectory,
  ModelHandle,
  Reply,
} from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { registerInCallerFiber, type Admission } from './caller-fiber.ts'
import type {
  ModelPublicationAuthority,
  ModelRegistration,
  ModelRegistrationFailure,
  ModelRegistrationInput,
} from './registration.ts'

type ReleaseResult = Awaited<ReturnType<ModelRegistration['release']>>
const removed: ReleaseResult = Object.freeze({ removed: true })
const alreadyGone: ReleaseResult = Object.freeze({ removed: false })

// The entry keeps its own copies of the identity and the evidence, so a caller that changes the
// objects it passed in cannot change what the directory recognises later.
type Entry<P> = {
  readonly key: string
  readonly token: string
  readonly fiber: CordisContext['fiber']
  readonly execution: ExecutionRef
  readonly authority: DurableEvidence
  readonly handle: ModelHandle<P>
  readonly registration: ModelRegistration
}

// One entry per tenant and call. Equal tenants give equal text, and the text never contains the
// raw separator of the pair, so two pairs cannot collide. A tenant that did not come from the
// identity parser has no text and so no key.
function keyOf(tenant: TenantId, call: ModelCallId): string | undefined {
  const text = tenantCodec.encode(tenant)
  return text.ok ? JSON.stringify([text.value, call]) : undefined
}

// Under one key the tenant and the call are equal by construction.
function sameExecution(left: ExecutionRef, right: ExecutionRef): boolean {
  return left.instance === right.instance && left.generation === right.generation
}

function sameEvidence(left: DurableEvidence, right: DurableEvidence): boolean {
  return (
    left.owner === right.owner &&
    left.record === right.record &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function createDirectory<P>(authority: ModelPublicationAuthority<P>) {
  const entries = new Map<string, Entry<P>>()

  // Removes the entry only while it is still the one that holds its key: a late call of an old
  // registration finds a successor under the key and leaves it alone.
  function remove(entry: Entry<P>): boolean {
    if (entries.get(entry.key)?.token !== entry.token) return false
    entries.delete(entry.key)
    return true
  }

  // Runs inside the effect of the calling fiber and never yields: the authority is asked, the key
  // is checked and the entry is recorded in one step, so the answer cannot go stale in between.
  function admit(
    fiber: CordisContext['fiber'],
    request: ModelRegistrationInput<P>,
    dropEffect: () => void,
  ): Admission<ModelRegistration, Entry<P>> {
    const checked = authority.check(request)
    if ('failure' in checked) return { kind: 'refused', failure: checked.failure }
    const [from, handle] = request.publication
    const key = keyOf(from.tenant, from.call)
    if (key === undefined)
      return {
        kind: 'refused',
        failure: {
          kind: 'invalid',
          reason: 'the tenant of the publication is not a parsed identity',
        },
      }
    const held = entries.get(key)
    if (held !== undefined)
      return held.fiber === fiber &&
        held.handle === handle &&
        sameExecution(held.execution, from) &&
        sameEvidence(held.authority, request.authority)
        ? { kind: 'recognised', registration: held.registration }
        : { kind: 'refused', failure: { kind: 'conflict' } }
    const token = randomUUID()
    const execution: ExecutionRef = Object.freeze({
      tenant: from.tenant,
      call: from.call,
      instance: from.instance,
      generation: from.generation,
    })
    const entry: Entry<P> = {
      key,
      token,
      fiber,
      execution,
      authority: Object.freeze({ ...request.authority }),
      handle,
      registration: Object.freeze({
        receipt: Object.freeze({ execution, registration: token }),
        release: async () => {
          const gone = remove(entry)
          dropEffect()
          return gone ? removed : alreadyGone
        },
      }),
    }
    entries.set(key, entry)
    return { kind: 'entered', entry }
  }

  return {
    connect: async ({
      tenant,
      call,
    }: Parameters<ModelInstanceDirectory<P>['connect']>[0]): Reply<LiveRoute<P>> => {
      const key = keyOf(tenant, call)
      if (key === undefined)
        return fail({
          kind: 'invalid',
          field: 'tenant',
          reason: 'the tenant is not a parsed identity',
        })
      const entry = entries.get(key)
      return succeed(
        entry === undefined ? { kind: 'no-live-route' } : { kind: 'live', handle: entry.handle },
      )
    },

    async register(
      ctx: CordisContext,
      request: ModelRegistrationInput<P>,
    ): Promise<Outcome<ModelRegistration, ModelRegistrationFailure>> {
      return registerInCallerFiber(
        ctx,
        dropEffect => admit(ctx.fiber, request, dropEffect),
        entry => () => void remove(entry),
      )
    },
  }
}

/**
 * The directory of live model instances: the host that runs an instance registers its handle for
 * one tenant and call through `register`, and `connect` serves that handle. The state stays in
 * the closure built by the constructor and not on the instance, because every property of the
 * instance is reachable by any plugin that can read `ctx.modelInstances`. `register` is a plain
 * function so that Cordis binds `this.ctx` to the calling plugin: the registration then ends with
 * the fiber of the caller.
 * @owner packages/model/model-cordis-contract
 */
export class ModelInstancesService<P> extends Service implements ModelInstanceDirectory<P> {
  static readonly provide = 'modelInstances'

  readonly connect: ModelInstanceDirectory<P>['connect']
  readonly register: (
    input: ModelRegistrationInput<P>,
  ) => Promise<Outcome<ModelRegistration, ModelRegistrationFailure>>

  constructor(ctx: CordisContext, authority: ModelPublicationAuthority<P>) {
    super(ctx, ModelInstancesService.provide)
    const directory = createDirectory(authority)
    this.connect = input => directory.connect(input)
    this.register = function (this: ModelInstancesService<P>, request) {
      return directory.register(this.ctx, request)
    }
  }
}
export const modelInstancesKey = ModelInstancesService.provide
