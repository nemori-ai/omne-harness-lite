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
export type KeyedModality = Extract<ConverterKey, { kind: 'modality' }>['modality']
export const modality = (value: KeyedModality): ConverterKey => ({
  kind: 'modality',
  modality: value,
})

export function adoption(name: string): Adoption {
  return { owner: 'test', name, revision: '1', digest: `sha256:${name}` }
}

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

export function pendingConverter(name: string) {
  const calls: { input: ConvertInput; settle(result: ConvertResult): void }[] = []
  const pending: ModelConverter<unknown> = {
    adoption: adoption(name),
    convert: lent => new Promise<ConvertResult>(settle => calls.push({ input: lent, settle })),
  }
  return { converter: pending, calls }
}

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

export const grantingAuthority: ModelConverterAuthority<unknown> = {
  check: () => ({ ok: undefined }),
}

export type SurrogateAuthority = ModelConverterAuthority<unknown> &
  Readonly<{ seen: Input[]; deny(failure: ModelRegistrationFailure | undefined): void }>

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
