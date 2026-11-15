import { open } from 'node:fs/promises'
import { z } from 'zod'
import {
  calendarSeedMaterialSchema,
  calendarSeedPackSchema,
  contentHashSchema,
  type CalendarSeedPack,
} from '@omne-harness/calendar-contract'
import type {
  CalendarReadResult,
  CalendarSourceMaterial,
  CalendarSourceMaterialStore,
  CalendarStoredMaterial,
  CalendarJournalResult,
} from '@omne-harness/calendar'
import { canonical, digest, hash } from './encoding.ts'
import { read, write, type AccessOptions } from './access.ts'
import { MAX_MATERIAL_BYTES, storedSchema, text } from './schema.ts'

export type CalendarSeedPackSource =
  | Readonly<{ kind: 'file'; path: string }>
  | Readonly<{ kind: 'bytes'; read(): Promise<Uint8Array> }>
export type CalendarSeedPackRegistry = ReadonlyMap<string, CalendarSeedPackSource>
const sourceSchema = calendarSeedMaterialSchema
  .unwrap()
  .omit({ rawHash: true, contentBase64: true })
  .extend({ content: z.instanceof(Uint8Array) })
function result<T>(value: CalendarJournalResult<T>): CalendarReadResult<T> {
  return value.kind === 'ok' ? value : { kind: 'unavailable', reason: value.reason }
}
function decode(
  stored: z.infer<typeof storedSchema>,
  scope: string,
  limit: number,
): CalendarStoredMaterial {
  const material = stored.material,
    content = Buffer.from(material.contentBase64, 'base64')
  if (
    content.length > limit ||
    hash(content) !== material.rawHash ||
    content.toString('base64') !== material.contentBase64 ||
    stored.reference !== `calendar-material:${digest({ scope, material })}`
  )
    throw new Error('materialIntegrity')
  const { rawHash, contentBase64: _base64, transportEvidence, ...metadata } = material
  return {
    reference: stored.reference,
    rawHash,
    material: {
      ...metadata,
      content: new Uint8Array(content),
      ...(transportEvidence === undefined ? {} : { transportEvidence }),
    },
  }
}
async function fileBytes(path: string, limit: number): Promise<Uint8Array> {
  const handle = await open(path, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > limit) throw new Error('seedCapacityExceeded')
    const chunks: Buffer[] = []
    let size = 0
    while (true) {
      const chunk = Buffer.alloc(Math.min(65536, limit - size + 1))
      const { bytesRead } = await handle.read(chunk)
      if (bytesRead === 0) break
      size += bytesRead
      if (size > limit) throw new Error('seedCapacityExceeded')
      chunks.push(chunk.subarray(0, bytesRead))
    }
    return Buffer.concat(chunks, size)
  } finally {
    await handle.close()
  }
}
function seed(bytes: Uint8Array): CalendarReadResult<CalendarSeedPack> {
  const pack = calendarSeedPackSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  )
  canonical(pack)
  for (const entry of pack.calendars)
    for (const material of entry.materials) {
      const content = Buffer.from(material.contentBase64, 'base64')
      if (
        hash(content) !== material.rawHash ||
        content.toString('base64') !== material.contentBase64
      )
        return { kind: 'unavailable', reason: 'seedMaterialHashMismatch' }
    }
  return { kind: 'ok', value: pack }
}
export function custody(
  options: AccessOptions,
  registry: CalendarSeedPackRegistry,
  limit: number,
): CalendarSourceMaterialStore {
  return {
    async preserve(input: CalendarSourceMaterial) {
      const parsed = sourceSchema.safeParse(input)
      if (!parsed.success) return { kind: 'invalid', message: 'invalidMaterial' }
      if (parsed.data.content.byteLength > limit)
        return { kind: 'unavailable', reason: 'materialCapacityExceeded' }
      const { content, ...metadata } = parsed.data
      const material = {
        ...metadata,
        rawHash: hash(content),
        contentBase64: Buffer.from(content).toString('base64'),
      }
      try {
        calendarSeedMaterialSchema.parse(material)
        canonical(material)
        const stored = {
          reference: `calendar-material:${digest({ scope: options.systemScopeRef, material })}`,
          material,
        }
        const saved = await write(
          options,
          { action: 'material.preserve', systemScopeRef: options.systemScopeRef, payload: stored },
          storedSchema,
        )
        return saved.kind === 'ok'
          ? { kind: 'ok', value: decode(saved.value, options.systemScopeRef, limit) }
          : result(saved)
      } catch {
        return { kind: 'unavailable', reason: 'materialIntegrity' }
      }
    },
    async read(input) {
      if (!z.strictObject({ reference: text }).safeParse(input).success)
        return { kind: 'invalid', message: 'invalidReference' }
      const found = await read(
        options,
        { kind: 'material', systemScopeRef: options.systemScopeRef, reference: input.reference },
        storedSchema.nullable(),
      )
      if (found.kind !== 'ok') return result(found)
      try {
        return {
          kind: 'ok',
          value: found.value === null ? null : decode(found.value, options.systemScopeRef, limit),
        }
      } catch {
        return { kind: 'unavailable', reason: 'materialIntegrity' }
      }
    },
    async readSeed(input) {
      if (!z.strictObject({ packRef: text, packHash: contentHashSchema }).safeParse(input).success)
        return { kind: 'invalid', message: 'invalidSeedReference' }
      const source = registry.get(input.packRef)
      if (source === undefined) return { kind: 'unavailable', reason: 'unregisteredSeedPack' }
      try {
        const bytes =
          source.kind === 'file' ? await fileBytes(source.path, limit) : await source.read()
        if (!(bytes instanceof Uint8Array) || bytes.byteLength > limit)
          return { kind: 'unavailable', reason: 'seedCapacityExceeded' }
        if (hash(bytes) !== input.packHash)
          return { kind: 'unavailable', reason: 'seedHashMismatch' }
        return seed(bytes)
      } catch {
        return { kind: 'unavailable', reason: 'seedReadFailed' }
      }
    },
  }
}
export function materialLimit(value: number | undefined): number {
  return z
    .int()
    .min(1)
    .max(MAX_MATERIAL_BYTES)
    .parse(value ?? MAX_MATERIAL_BYTES)
}
