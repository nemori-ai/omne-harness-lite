import { randomUUID } from 'node:crypto'
import { open, link, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { ClockCheckpoint } from '@omne-harness-lite/offer-expiry'

const floorSchema = z
  .object({
    writtenAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    upperBound: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine(value => value.writtenAt <= value.upperBound)
const manifestSchema = z
  .object({
    format: z.literal('omne-clock/1'),
    id: z.uuid(),
    phase: z.enum(['prepared', 'ready']),
    floor: floorSchema,
  })
  .strict()
export type ClockManifest = z.infer<typeof manifestSchema>

export function checkedFloor(value: ClockCheckpoint) {
  return floorSchema.parse(value)
}

export function newManifest(floor: ClockCheckpoint): ClockManifest {
  return { format: 'omne-clock/1', id: randomUUID(), phase: 'prepared', floor: checkedFloor(floor) }
}

export async function readManifest(file: string): Promise<ClockManifest | undefined> {
  const handle = await open(file, 'r').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (!handle) return undefined
  try {
    const buffer = Buffer.alloc(4097)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead > 4096) throw new Error('clock manifest exceeds its size limit')
    return manifestSchema.parse(JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')))
  } finally {
    await handle.close()
  }
}

export async function writeManifest(file: string, value: ClockManifest, create: boolean) {
  const temporary = `${file}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx', 0o600)
  try {
    try {
      await handle.writeFile(JSON.stringify(value))
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (create) await link(temporary, file)
    else await rename(temporary, file)
    const directory = await open(dirname(file), 'r')
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}
