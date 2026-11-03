import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  calendarSeedMaterialSchema,
  calendarIdSchema,
  instantSchema,
  localDateSchema,
  contentHashSchema,
} from '@omne-harness/calendar-contract'

const file = z.string().regex(/^(?:raw|evidence)\/[a-zA-Z0-9_.-]+$/)
const material = calendarSeedMaterialSchema
  .unwrap()
  .omit({ rawHash: true, contentBase64: true })
  .extend({ file, sha256: contentHashSchema })
const registration = z.strictObject({
  truthSourceId: z.string().min(1),
  oracleSourceId: z.string().min(1),
  independent: z.boolean(),
  evidenceRef: z.string().min(1),
})
const schema = z.strictObject({
  releaseRef: z.string().min(1),
  releaseDate: localDateSchema,
  generatedAt: instantSchema,
  materials: z.array(material).nonempty(),
  calendars: z
    .array(z.strictObject({ calendarId: calendarIdSchema, authorityCoverageEnd: localDateSchema }))
    .nonempty(),
  independenceRegistry: z.array(registration).nonempty(),
})
const provenanceSchema = z.object({
  independence: z.array(
    z.object({ id: z.string(), basis: z.string().min(1), evidence: z.array(file).nonempty() }),
  ),
  evidence: z.array(z.strictObject({ file, sha256: contentHashSchema })).nonempty(),
})
export const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export async function releaseInputs(root) {
  const input = schema.parse(JSON.parse(await readFile(new URL('inputs.json', root), 'utf8')))
  const provenance = provenanceSchema.parse(
    JSON.parse(await readFile(new URL('provenance.json', root), 'utf8')),
  )
  for (const evidence of provenance.evidence) {
    if (hash(await readFile(new URL(evidence.file, root))) !== evidence.sha256)
      throw new Error(`Lineage evidence hash mismatch: ${evidence.file}`)
  }
  for (const registration of input.independenceRegistry) {
    const record = provenance.independence.find(
      evidence => evidence.id === registration.evidenceRef,
    )
    if (
      !record ||
      record.evidence.some(file => !provenance.evidence.some(evidence => evidence.file === file))
    )
      throw new Error(
        `Independence registration lacks retained evidence: ${registration.evidenceRef}`,
      )
  }
  const materials = await Promise.all(
    input.materials.map(async item => {
      const { file, sha256, ...metadata } = item
      const content = await readFile(new URL(file, root))
      if (hash(content) !== sha256) throw new Error(`Input hash mismatch: ${file}`)
      return { ...metadata, content }
    }),
  )
  return { input, materials }
}
