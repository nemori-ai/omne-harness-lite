import type { CompactionPolicy, RepresentationPolicyConfig } from './ports.js'
import type { Coverage } from './values.js'
import {
  standardSchema,
  record,
  decimal,
  integer,
  reject,
  type Decoder,
} from './schema-primitives.js'
import { isCoverage } from './coverage-validation.js'
export type { Path, Decoded, Decoder } from './schema-primitives.js'
export { standardSchema, record, decimal } from './schema-primitives.js'
const decodeCompactionPolicy: Decoder<CompactionPolicy> = (v, path) => {
  if (
    !record(v) ||
    Object.keys(v).some(key => key !== 'triggerPercent' && key !== 'headroomTokens') ||
    !(
      v.triggerPercent === null ||
      (decimal(v.triggerPercent) && Number(v.triggerPercent) <= 100)
    ) ||
    !(v.headroomTokens === null || integer(v.headroomTokens))
  )
    return reject(path)
  return { ok: true, value: { triggerPercent: v.triggerPercent, headroomTokens: v.headroomTokens } }
}
export const compactionPolicySchema = standardSchema(decodeCompactionPolicy)
function choices(v: unknown): v is readonly ('original' | 'derived' | 'transcript')[] {
  return Array.isArray(v) && v.every(x => x === 'original' || x === 'derived' || x === 'transcript')
}
const decodeRepresentationPolicy: Decoder<RepresentationPolicyConfig> = (v, path) => {
  if (
    !record(v) ||
    !record(v.preferences) ||
    !choices(v.preferences.text) ||
    !choices(v.preferences.image) ||
    !choices(v.preferences.voice)
  )
    return reject(path)
  return {
    ok: true,
    value: {
      preferences: {
        text: [...v.preferences.text],
        image: [...v.preferences.image],
        voice: [...v.preferences.voice],
      },
    },
  }
}
export const representationPolicyConfigSchema = standardSchema(decodeRepresentationPolicy)
export const coverageSchema = standardSchema<Coverage>((v, p) =>
  isCoverage(v) ? { ok: true, value: structuredClone(v) } : reject(p),
)
