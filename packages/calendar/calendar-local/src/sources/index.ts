import {
  shippedCalendarSupplyPolicies,
  type CalendarSourceAdapter,
  type CalendarSourceMaterial,
  type SupplySourcePolicy,
} from '@omne-harness/calendar'
import { type CalendarProbeObservation, type Instant } from '@omne-harness/calendar-contract'
import {
  createSourceHttp,
  digest,
  encode,
  failureReason,
  sourceLimits,
  transportEvidence,
  type SourceHttp,
} from './http.ts'
import {
  acquireCg,
  acquireLanceliao,
  acquireFederalRegister,
  acquireSingle,
  type SourcePayload,
} from './network.ts'
import { computedMaterial, vacanzaMaterial } from './offline.ts'
import type { CalendarSourceAdapterOptions } from './types.ts'

export { calendarSourceUrls } from './network.ts'
export { defaultCalendarSourceLimits } from './types.ts'
export type {
  CalendarSourceAdapterOptions,
  CalendarSourceLimits,
  CalendarHttpClient,
  CalendarSourceKnowledge,
  CalendarSourceResponseEvidence,
  CalendarVacanzaArtifact,
} from './types.ts'

function transportString(policy: SupplySourcePolicy, key: string): string {
  const value = policy.transport[key]
  if (typeof value !== 'string' || !value) throw new Error(`Source policy lacks ${key}`)
  return value
}
function httpConfiguration(policy: SupplySourcePolicy) {
  switch (policy.adapterKind) {
    case 'lanceliao_holiday_api_json':
    case 'cg_zhou_holiday_calendar_json':
    case 'cg_zhou_index_json':
      return {
        allowedOrigins: ['https://raw.githubusercontent.com'],
        timeoutMs: policy.adapterKind === 'cg_zhou_index_json' ? 10_000 : 30_000,
      }
    case 'cao_syukujitsu_csv':
      return { allowedOrigins: ['https://www8.cao.go.jp'], timeoutMs: 30_000 }
    case 'opm_holidays_ics':
      return { allowedOrigins: ['https://www.opm.gov'], timeoutMs: 30_000 }
    case 'federal_register_eo_api':
      return { allowedOrigins: ['https://www.federalregister.gov'], timeoutMs: 30_000 }
    default:
      return { allowedOrigins: [], timeoutMs: 30_000 }
  }
}
function acquireNetwork(
  policy: SupplySourcePolicy,
  options: CalendarSourceAdapterOptions,
  http: SourceHttp,
): Promise<SourcePayload> {
  switch (policy.adapterKind) {
    case 'lanceliao_holiday_api_json':
      return acquireLanceliao(http, options)
    case 'cao_syukujitsu_csv':
      return acquireSingle(http, { url: transportString(policy, 'url'), kind: 'csv' })
    case 'opm_holidays_ics':
      return acquireSingle(http, {
        url: transportString(policy, 'url'),
        kind: 'ics',
        userAgent: transportString(policy, 'userAgent'),
      })
    case 'cg_zhou_holiday_calendar_json':
      return acquireCg(http, false)
    case 'cg_zhou_index_json':
      return acquireCg(http, true)
    case 'federal_register_eo_api':
      return acquireFederalRegister(http, options)
    default:
      throw new Error(`Unsupported shipped source adapter ${policy.adapterKind}`)
  }
}
function createAdapter(
  policy: SupplySourcePolicy,
  options: CalendarSourceAdapterOptions,
): CalendarSourceAdapter {
  const limits = sourceLimits(options)
  async function acquire(
    acquiredAt: Instant,
    signal: AbortSignal,
  ): Promise<{
    material: CalendarSourceMaterial
    marker: string
    authorityCoverageEnd: CalendarProbeObservation['authorityCoverageEnd']
  }> {
    signal.throwIfAborted()
    if (
      policy.adapterKind === 'us_federal_rules_computed' ||
      policy.adapterKind === 'vacanza_holidays_library'
    ) {
      const material =
        policy.adapterKind === 'us_federal_rules_computed'
          ? computedMaterial(options, acquiredAt, limits)
          : await vacanzaMaterial(options, acquiredAt, limits, signal)
      signal.throwIfAborted()
      return {
        material: {
          ...material,
          sourceId: policy.sourceId,
          acquiredAt,
          lineageRef: policy.lineage,
          mediaType: 'application/json',
        },
        marker: digest(
          encode([digest(material.content), material.knowledgeAsOf, material.authorityRef]),
        ),
        authorityCoverageEnd: null,
      }
    }
    const http = createSourceHttp({
      sourceId: policy.sourceId,
      acquiredAt,
      options,
      signal,
      ...httpConfiguration(policy),
    })
    const payload = await acquireNetwork(policy, options, http)
    signal.throwIfAborted()
    if (payload.content.byteLength > limits.maxBundleBytes)
      throw new Error('Encoded source bundle byte limit exceeded')
    const knowledgeAsOf = http.responses
      .map(response => response.knowledge.knowledgeAsOf)
      .sort()
      .at(0)
    if (!knowledgeAsOf) throw new Error('Source has no knowledge evidence')
    return {
      material: {
        sourceId: policy.sourceId,
        content: payload.content,
        mediaType: payload.mediaType,
        acquiredAt,
        knowledgeAsOf,
        lineageRef: policy.lineage,
        authorityRef: payload.authorityRef,
        transportEvidence: transportEvidence(http.responses),
      },
      marker: payload.marker,
      authorityCoverageEnd: payload.authorityCoverageEnd,
    }
  }
  return {
    sourceId: policy.sourceId,
    async acquire(input, callOptions) {
      try {
        const result = await acquire(
          input.acquiredAt,
          callOptions?.signal ?? new AbortController().signal,
        )
        return { kind: 'acquired', material: result.material }
      } catch (error) {
        return { kind: 'unavailable', reason: failureReason(error) }
      }
    },
    async probe(input, callOptions) {
      const base = { sourceId: policy.sourceId, observedAt: input.observedAt }
      try {
        const signal = callOptions?.signal ?? new AbortController().signal
        let marker: string
        let authorityCoverageEnd: CalendarProbeObservation['authorityCoverageEnd'] = null
        if (policy.adapterKind === 'cao_syukujitsu_csv') {
          const http = createSourceHttp({
            sourceId: policy.sourceId,
            acquiredAt: input.observedAt,
            options,
            signal,
            ...httpConfiguration(policy),
          })
          const response = await http.read(transportString(policy, 'url'), 'HEAD')
          if (response.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'text/csv')
            throw new Error('Cabinet Office HEAD response is not CSV')
          marker = digest(
            encode(
              ['last-modified', 'etag', 'content-length'].map(key => response.headers[key] ?? null),
            ),
          )
        } else {
          const result = await acquire(input.observedAt, signal)
          marker = result.marker
          authorityCoverageEnd = result.authorityCoverageEnd
        }
        const unchanged =
          input.previous?.sourceId === policy.sourceId &&
          input.previous.kind !== 'failed' &&
          input.previous.marker === marker
        return {
          ...base,
          kind: unchanged ? 'unchanged' : 'changed',
          marker,
          authorityCoverageEnd,
          reason: null,
        }
      } catch (error) {
        return {
          ...base,
          kind: 'failed',
          marker: null,
          authorityCoverageEnd: null,
          reason: failureReason(error),
        }
      }
    },
  }
}
export function createCalendarSourceAdapters(
  options: CalendarSourceAdapterOptions = {},
): readonly CalendarSourceAdapter[] {
  return shippedCalendarSupplyPolicies.flatMap(policy =>
    policy.sources.map(source => createAdapter(source, options)),
  )
}
