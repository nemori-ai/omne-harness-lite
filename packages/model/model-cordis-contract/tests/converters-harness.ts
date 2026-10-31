// Shared set-up of the converter catalog tests. Everything runs on a real Cordis Context. The one
// stand-in is the qualification authority: it is the provider of ModelConverterAuthorityService
// in a real assembly and is not part of this package, so `surrogateAuthority` answers in its place.
import { Context } from '@deepseek-ai/cordis'
import type { Adoption, ConvertedContent } from '@omne-harness/model-contract'
import type {
  ConversionFailure,
  ConverterKey,
  ConverterLookup,
  ModelConverter,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import { tenantA } from './identities.ts'
import type {
  ModelConverterAuthority,
  ModelConverterRegistration,
  ModelConverterRegistrationInput,
  ModelRegistrationFailure,
} from '../src/cordis.ts'
import { ModelConvertersService } from '../src/cordis.ts'

export type Input = ModelConverterRegistrationInput<unknown>
export type Registered = Outcome<ModelConverterRegistration, ModelRegistrationFailure>
export type ConvertInput = Parameters<ModelConverter<unknown>['convert']>[0]
export type ConvertResult = Outcome<ConvertedContent, ConversionFailure>

export const mediaType = (value: string): ConverterKey => ({ kind: 'media-type', mediaType: value })
/** Any modality of the shared vocabulary: a converter for a modality that Model does not support is legal. */
export type KeyedModality = Extract<ConverterKey, { kind: 'modality' }>['modality']
export const modality = (value: KeyedModality): ConverterKey => ({
  kind: 'modality',
  modality: value,
})

export function adoption(name: string): Adoption {
  return { owner: 'test', name, revision: '1', digest: `sha256:${name}` }
}

/** A converter that the catalog hands out but never runs: the catalog only lends it. */
export function converter(name: string): ModelConverter<unknown> {
  return {
    adoption: adoption(name),
    async convert() {
      throw new Error('the catalog does not run converters')
    },
  }
}

function isBlock(value: unknown): value is ConvertInput['original'] {
  return typeof value === 'object' && value !== null && 'kind' in value && 'id' in value
}

/**
 * The input of one conversion. The catalog never looks into it, so the block is a plain literal
 * that a type guard lets through; no test depends on what the block holds.
 */
export function conversionInput(signal: AbortSignal = new AbortController().signal): ConvertInput {
  const original: unknown = {
    kind: 'text',
    id: 'block-1',
    visibility: { toHuman: true, toModel: true },
    text: 'to convert',
  }
  if (!isBlock(original)) throw new Error('the fixture block is not a content block')
  return {
    principal: 'principal',
    tenant: tenantA,
    original,
    source: { owner: 'test', record: 'source', revision: '1', digest: 'sha256:source' },
    signal,
  }
}

/** A converter whose conversions stay in flight until the test settles them. */
export function pendingConverter(name: string) {
  const calls: { input: ConvertInput; settle(result: ConvertResult): void }[] = []
  const pending: ModelConverter<unknown> = {
    adoption: adoption(name),
    convert: lent => new Promise<ConvertResult>(settle => calls.push({ input: lent, settle })),
  }
  return { converter: pending, calls }
}

/** The answer of a converter that converted the whole input into itself. */
export function answerOf(asked: ConvertInput, by: ModelConverter<unknown>): ConvertResult {
  return {
    ok: {
      original: asked.original,
      derived: [asked.original],
      transcript: 'converted',
      converter: by.adoption,
    },
  }
}

export function input(key: ConverterKey, lent: ModelConverter<unknown>): Input {
  return {
    key,
    converter: lent,
    adoption: lent.adoption,
    authority: { owner: 'test', record: 'grant', revision: '1', digest: 'sha256:grant' },
  }
}

/** Stands in for the qualification authority and grants every registration. It keeps no record. */
export const grantingAuthority: ModelConverterAuthority<unknown> = {
  check: () => ({ ok: undefined }),
}

export type SurrogateAuthority = ModelConverterAuthority<unknown> &
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

export function lookupOf(outcome: Outcome<ConverterLookup<unknown>, unknown>) {
  if (!('ok' in outcome)) throw new Error(`acquire failed: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

export function selection(outcome: Outcome<ConverterLookup<unknown>, unknown>) {
  const lookup = lookupOf(outcome)
  if (lookup.kind !== 'selected') throw new Error('no converter was selected')
  return lookup
}

export function registrationOf(outcome: Registered): ModelConverterRegistration {
  if (!('ok' in outcome)) throw new Error(`registration failed: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

export type World = Awaited<ReturnType<typeof startCatalog>>

/** Loads the catalog in its own plugin fiber and lets contributor plugins register through it. */
export async function startCatalog(
  authority: ModelConverterAuthority<unknown> = grantingAuthority,
) {
  const root = new Context()
  const host = root.plugin({
    name: 'catalog-host',
    apply(ctx: Context) {
      new ModelConvertersService<unknown>(ctx, authority)
    },
  })
  await host
  const catalog = root.get('modelConverters')
  if (catalog === undefined) throw new Error('the catalog did not load')

  let count = 0
  return {
    root,
    host,
    catalog,
    acquire: catalog.acquire,
    /**
     * Registers from a fresh contributor fiber; its disposal withdraws the contribution. The
     * plugin object stays in the Cordis registry while the fiber lives, so it gives up its
     * references to the request and the answer as soon as it has used them.
     */
    async contribute(request: Input) {
      const call: { request?: Input | undefined; pending?: Promise<Registered> | undefined } = {
        request,
      }
      const fiber = root.plugin({
        name: `contributor-${++count}`,
        inject: ['modelConverters'],
        apply(ctx: Context) {
          const current = call.request
          call.request = undefined
          if (current !== undefined) call.pending = ctx.modelConverters.register(current)
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
