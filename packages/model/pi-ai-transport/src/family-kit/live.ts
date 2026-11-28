import type { Adoption, ModelModality, ModelProfileDefinition } from '@omne-harness/model-contract'
import type { LiveEndpoint } from '../config.ts'
import type { PiLiveBinding } from '../family.ts'
import {
  defineFamily,
  recordAdoption,
  recordProvider,
  type PiFamily,
  type PiModelRecordHead,
} from '../family-table.ts'

/** A live record: where it is served, what it takes and gives, its voices and audio, and the evidence. */
export type LiveRecord = PiModelRecordHead &
  Readonly<{
    live: Readonly<{
      voices: readonly string[]
      audioFormats: readonly [string, ...string[]]
      maxSessionSeconds: string | null
    }>
    profile: Readonly<{
      input: readonly [ModelModality, ...ModelModality[]]
      output: readonly [ModelModality, ...ModelModality[]]
      evidence: string
    }>
  }>

/** A family of live records on one interface. A record is data: binding one holds no resource. */
export function defineLiveFamily(
  spec: Readonly<{ owner: string; endpoint: LiveEndpoint; records: readonly LiveRecord[] }>,
): PiFamily<PiLiveBinding> {
  const { owner, endpoint, records } = spec
  return defineFamily({
    owner,
    records,
    acquire: async (record, supplier) => ({
      ok: Object.freeze({
        supplier,
        adoption: recordAdoption(owner, record),
        endpoint,
        release: async () => {},
      }),
    }),
  })
}

/** The official profile of every current live record. */
export function officialLiveProfilesOf(
  owner: string,
  records: readonly LiveRecord[],
  input: Readonly<{ retryPolicy: Adoption }>,
): readonly ModelProfileDefinition<'live'>[] {
  return records
    .filter(record => record.status === 'current')
    .map(record => ({
      kind: 'live',
      suppliers: [
        {
          adoption: recordAdoption(owner, record),
          provider: recordProvider(record),
          model: record.route.model,
        },
      ],
      fallback: false,
      input: record.profile.input,
      output: record.profile.output,
      voices: record.live.voices,
      audioFormats: record.live.audioFormats,
      maxSessionSeconds: record.live.maxSessionSeconds,
      retryPolicy: input.retryPolicy,
    }))
}
