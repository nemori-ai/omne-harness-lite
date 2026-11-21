import { createHash } from 'node:crypto'
import { readBodyText, type AssetLayerSource, type JsonValue } from '@omne-harness/assets'
import { tenantLayerSource, type AssetsLocal } from '@omne-harness/assets-local'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  CONVERTER_CATEGORY,
  parseConverterBody,
  type ConverterLayers,
} from '@omne-harness/media-adapters'
import { officialAssetRef } from './official-holdings.ts'

const RELEASE_CONVERTER_TEXTS: readonly string[] = [
  '{"kind":"voice","engine":"voice.transcribe","parameters":{},"egress":{"kind":"remote","destination":"openrouter.ai"}}',
  '{"kind":"application-pdf","engine":"pdf.extract-text","parameters":{},"egress":{"kind":"in-process"}}',
]

const BODY_LIMITS = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 32,
  maxStringLength: 512,
  maxNumberLength: 20,
}

export type ReleaseConverter = Readonly<{ name: string; version: string; body: JsonValue }>

function readConverter(text: string): ReleaseConverter {
  const read = readBodyText(text, BODY_LIMITS)
  if (read.kind !== 'ok') throw new Error(`a release converter is not a document: ${read.kind}`)
  const parsed = parseConverterBody(read.value)
  if (!('ok' in parsed)) throw new Error(`a release converter is refused: ${parsed.failure}`)
  const version = createHash('sha256').update(text, 'utf8').digest('hex')
  return { name: parsed.ok.kind, version, body: read.value }
}

let converters: readonly ReleaseConverter[] | undefined

/** The converter definitions the release carries, read and judged once. */
export function releaseConverters(): readonly ReleaseConverter[] {
  converters ??= Object.freeze(RELEASE_CONVERTER_TEXTS.map(readConverter))
  return converters
}

const byRef = (asset: string) =>
  releaseConverters().find(item => officialAssetRef(CONVERTER_CATEGORY, item.name) === asset)

/** The body of an official converter candidate; undefined for any other. */
export function officialConverterBody(asset: string): JsonValue | undefined {
  return byRef(asset)?.body
}

/** The official layer of `converter`, for evaluating definitions only: the asset page lists none of it. */
export function officialConverterSource(): AssetLayerSource {
  return Object.freeze({
    layer: 'official',
    list: async () => ({ layer: 'official', state: 'not-applicable' }),
    async candidates(capability) {
      const held =
        capability.category === CONVERTER_CATEGORY
          ? releaseConverters().find(item => item.name === capability.name)
          : undefined
      if (held === undefined) return { layer: 'official', state: 'read', candidates: [] }
      const candidate = {
        asset: officialAssetRef(CONVERTER_CATEGORY, held.name),
        version: held.version,
        disabled: false,
        immutable: false,
        replaceLocked: false,
      }
      return { layer: 'official', state: 'read', candidates: [candidate] }
    },
  } satisfies AssetLayerSource)
}

type TenantAssets = Pick<AssetsLocal, 'listHeld' | 'readHeldCapability' | 'readVersion'>

/** The layers a tenant's converter definitions are evaluated over: the release's, then its own. */
export function converterLayersOf(open: (tenantRef: string) => Promise<TenantAssets | undefined>) {
  const official = officialConverterSource()
  return async (tenant: TenantId): Promise<ConverterLayers | undefined> => {
    const ref = tenantCodec.encode(tenant)
    const assets = ref.ok ? await open(ref.value) : undefined
    if (assets === undefined) return undefined
    return {
      sources: [official, tenantLayerSource(assets)],
      async body(candidate) {
        const shipped = officialConverterBody(candidate.asset)
        if (shipped !== undefined) return shipped
        const read = await assets.readVersion({
          assetRef: candidate.asset,
          version: candidate.version,
        })
        return read.kind === 'version' ? read.version.body : undefined
      },
    }
  }
}
