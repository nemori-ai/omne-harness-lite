import { randomUUID } from 'node:crypto'
import { Service, type Context as CordisContext } from '@deepseek-ai/cordis'
import { registerInCallerFiber, type Admission } from '@omne-harness/kernel-basis/cordis'
import type { Adoption, ConvertedContent, Reply } from '@omne-harness/model-contract'
import type {
  ConversionFailure,
  ConverterKey,
  ConverterLookup,
  ModelConverter,
  ModelConverterCatalog,
} from '@omne-harness/model-contract/provider'
import { isCanonicalMediaType, judgeModality } from '@omne-harness/modality'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ModelConverterAuthority,
  ModelConverterRegistration,
  ModelConverterRegistrationInput,
  ModelRegistrationFailure,
} from './registration.ts'

type ReleaseResult = Awaited<ReturnType<ModelConverterRegistration['release']>>
const released: ReleaseResult = Object.freeze({ removed: true })
const releaseFailed: ReleaseResult = Object.freeze({
  removed: true,
  failure: Object.freeze({
    kind: 'unavailable',
    diagnostic: 'the release hook of the contribution failed; the provider still owes its release',
  }),
})

type Entry<P> = {
  readonly id: string
  readonly fiber: CordisContext['fiber']
  readonly adoption: Adoption
  readonly converter: ModelConverter<P>
  readonly lent: ModelConverter<P>
  readonly withdrawal: AbortController
  readonly registration: ModelConverterRegistration
  readonly closing: PromiseWithResolvers<ReleaseResult>
  readonly hook: (() => Promise<void>) | undefined
  state: 'active' | 'retiring' | 'releasing' | 'closed'
  leases: number
}

type Slot<P> = { active: Entry<P> | undefined; readonly draining: Set<Entry<P>> }

function slotId(key: ConverterKey): string {
  return key.kind === 'media-type' ? `media-type:${key.mediaType}` : `modality:${key.modality}`
}

function keyFault(key: ConverterKey): string | undefined {
  if (key.kind === 'media-type')
    return isCanonicalMediaType(key.mediaType)
      ? undefined
      : 'the media type key is not in canonical form'
  return 'ok' in judgeModality(key.modality)
    ? undefined
    : 'the modality key is not a known modality'
}

type Conversion<P> = Parameters<ModelConverter<P>['convert']>[0]
type Converted = Outcome<ConvertedContent, ConversionFailure>

const conversionWithdrawn = fail<ConversionFailure>({
  kind: 'unavailable',
  dependency: 'modelConverters',
  diagnostic: 'the converter was withdrawn while the conversion was running',
})

async function convertWhileRegistered<P>(
  entry: Entry<P>,
  request: Conversion<P>,
): Promise<Converted> {
  const { signal } = entry.withdrawal
  if (signal.aborted) return conversionWithdrawn
  const ended = Promise.withResolvers<'withdrawn'>()
  const onWithdrawal = () => ended.resolve('withdrawn')
  signal.addEventListener('abort', onWithdrawal)
  try {
    const answer = await Promise.race([
      entry.converter.convert({ ...request, signal: AbortSignal.any([request.signal, signal]) }),
      ended.promise,
    ])
    return answer === 'withdrawn' ? conversionWithdrawn : answer
  } finally {
    signal.removeEventListener('abort', onWithdrawal)
  }
}

function hookOf<P>(request: ModelConverterRegistrationInput<P>): (() => Promise<void>) | undefined {
  const { release } = request
  return release === undefined ? undefined : () => release.call(request)
}

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function createCatalog<P>(authority: ModelConverterAuthority<P>) {
  const slots = new Map<string, Slot<P>>()

  function settle(entry: Entry<P>, result: ReleaseResult): void {
    entry.state = 'closed'
    const slot = slots.get(entry.id)
    if (slot !== undefined) {
      slot.draining.delete(entry)
      if (slot.active === undefined && slot.draining.size === 0) slots.delete(entry.id)
    }
    entry.closing.resolve(result)
  }

  async function runHook(entry: Entry<P>, hook: () => Promise<void>): Promise<void> {
    try {
      await hook()
      settle(entry, released)
    } catch {
      settle(entry, releaseFailed)
    }
  }

  function finish(entry: Entry<P>): void {
    if (entry.hook === undefined) return settle(entry, released)
    entry.state = 'releasing'
    void runHook(entry, entry.hook)
  }

  function retire(entry: Entry<P>): Promise<ReleaseResult> {
    if (entry.state !== 'active') return entry.closing.promise
    entry.state = 'retiring'
    const slot = slots.get(entry.id)
    if (slot?.active === entry) {
      slot.active = undefined
      slot.draining.add(entry)
    }
    if (entry.leases === 0) finish(entry)
    return entry.closing.promise
  }

  function withdrawSuddenly(entry: Entry<P>): void {
    if (entry.state !== 'active') return
    entry.withdrawal.abort()
    void retire(entry)
  }

  function lend(entry: Entry<P>): () => Promise<void> {
    entry.leases += 1
    let returned = false
    return async () => {
      if (returned) return
      returned = true
      entry.leases -= 1
      if (entry.state === 'retiring' && entry.leases === 0) finish(entry)
    }
  }

  // Runs inside the calling fiber's effect and never yields: the authority is asked, the key is
  // checked and the entry is recorded in one step, so the answer cannot go stale.
  function admit(
    fiber: CordisContext['fiber'],
    request: ModelConverterRegistrationInput<P>,
    removeEffect: () => void,
  ): Admission<Entry<P>, ModelRegistrationFailure> {
    const checked = authority.check(request)
    if ('failure' in checked) return { kind: 'refused', failure: checked.failure }
    if (!sameAdoption(request.adoption, request.converter.adoption))
      return {
        kind: 'refused',
        failure: {
          kind: 'invalid',
          reason: 'adoption does not match the adoption of the converter',
        },
      }
    const fault = keyFault(request.key)
    if (fault !== undefined) return { kind: 'refused', failure: { kind: 'invalid', reason: fault } }
    const id = slotId(request.key)
    const slot = slots.get(id) ?? { active: undefined, draining: new Set<Entry<P>>() }
    const held = slot.active
    if (held !== undefined)
      return held.fiber === fiber &&
        held.converter === request.converter &&
        sameAdoption(held.adoption, request.adoption)
        ? { kind: 'recognised', registration: held.registration }
        : { kind: 'refused', failure: { kind: 'conflict' } }
    const registration: ModelConverterRegistration = Object.freeze({
      token: randomUUID(),
      release: () => {
        const closing = retire(entry)
        removeEffect()
        return closing
      },
    })
    const entry: Entry<P> = {
      id,
      fiber,
      adoption: request.adoption,
      converter: request.converter,
      lent: {
        adoption: request.adoption,
        convert: conversion => convertWhileRegistered(entry, conversion),
      },
      withdrawal: new AbortController(),
      registration,
      closing: Promise.withResolvers<ReleaseResult>(),
      hook: hookOf(request),
      state: 'active',
      leases: 0,
    }
    slot.active = entry
    slots.set(id, slot)
    return { kind: 'entered', entry }
  }

  return {
    acquire: async (
      ...[request]: Parameters<ModelConverterCatalog<P>['acquire']>
    ): Reply<ConverterLookup<P>> => {
      if (!isCanonicalMediaType(request.mediaType))
        return fail({
          kind: 'invalid',
          field: 'mediaType',
          reason: 'the media type is not in canonical form',
        })
      if (request.modality !== null && !('ok' in judgeModality(request.modality)))
        return fail({ kind: 'invalid', field: 'modality', reason: 'the modality is not known' })
      const ids = [slotId({ kind: 'media-type', mediaType: request.mediaType })]
      if (request.modality !== null)
        ids.push(slotId({ kind: 'modality', modality: request.modality }))
      for (const id of ids) {
        const slot = slots.get(id)
        if (slot === undefined) continue
        if (slot.active === undefined)
          return fail({
            kind: 'unavailable',
            dependency: ModelConvertersService.provide,
            diagnostic: 'the converter for this key is being withdrawn',
          })
        return succeed({
          kind: 'selected',
          converter: slot.active.lent,
          release: lend(slot.active),
        })
      }
      return succeed({ kind: 'absent' })
    },

    async register(
      ctx: CordisContext,
      request: ModelConverterRegistrationInput<P>,
    ): Promise<Outcome<ModelConverterRegistration, ModelRegistrationFailure>> {
      return registerInCallerFiber(
        ctx,
        dropEffect => admit(ctx.fiber, request, dropEffect),
        entry => withdrawSuddenly(entry),
      )
    },
  }
}

/**
 * The converter catalog: system plugins contribute converters through `register`, and consumers
 * lend one through `acquire`. The state stays in the closure built by the constructor and not on
 * the instance, because every property of the instance is reachable by any plugin that can read
 * `ctx.modelConverters`. `register` is a plain function so that Cordis binds `this.ctx` to the
 * calling plugin: the registration then ends with the fiber of the caller.
 * @owner packages/model/model-cordis-contract
 */
export class ModelConvertersService<P> extends Service implements ModelConverterCatalog<P> {
  static readonly provide = 'modelConverters'

  readonly acquire: ModelConverterCatalog<P>['acquire']
  readonly register: (
    input: ModelConverterRegistrationInput<P>,
  ) => Promise<Outcome<ModelConverterRegistration, ModelRegistrationFailure>>

  constructor(ctx: CordisContext, authority: ModelConverterAuthority<P>) {
    super(ctx, ModelConvertersService.provide)
    const catalog = createCatalog(authority)
    this.acquire = input => catalog.acquire(input)
    this.register = function (this: ModelConvertersService<P>, request) {
      return catalog.register(this.ctx, request)
    }
  }
}
export const modelConvertersKey = ModelConvertersService.provide
