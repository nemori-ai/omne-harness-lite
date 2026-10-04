import { join } from 'node:path'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { object } from '@omne-harness-lite/session-log'
import { IoFailure, isMissing, syncDirectory, type FileIo } from './file-io.ts'
import type { ProcessExit, ProcessOwnership, SessionLogDiagnostic } from './policy.ts'

type Marker =
  | { readonly v: 1; readonly state: 'clean' }
  | { readonly v: 1; readonly state: 'active'; readonly owner: string }
export function decodeRecoveryMarker(bytes: Uint8Array): Marker | undefined {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
  const decoded = readJsonStrict(text)
  if ('failed' in decoded || !object(decoded.ok)) return undefined
  const value = decoded.ok
  if (value.v !== 1) return undefined
  if (value.state === 'clean' && Object.keys(value).length === 2) return { v: 1, state: 'clean' }
  if (
    value.state === 'active' &&
    typeof value.owner === 'string' &&
    value.owner.length > 0 &&
    Object.keys(value).length === 3
  )
    return { v: 1, state: 'active', owner: value.owner }
  return undefined
}
async function observe(callback: (() => Promise<ProcessExit>) | undefined): Promise<ProcessExit> {
  if (callback === undefined) return 'unknown'
  // This foreign fact port may throw; errors are explicitly unknown, never evidence of exit.
  try {
    const result = await callback()
    return result === 'exited' || result === 'alive' ? result : 'unknown'
  } catch {
    return 'unknown'
  }
}
export async function enterRecovery(
  io: FileIo,
  dir: string,
  hash: string,
  ownership: ProcessOwnership,
  diagnostic: (event: SessionLogDiagnostic) => void,
): Promise<'clean' | 'recover' | undefined> {
  let marker: Marker | undefined
  let missing = false
  try {
    marker = decodeRecoveryMarker(await io.readFile(join(dir, 'recovery.json')))
  } catch (error) {
    if (!isMissing(error)) throw error
    missing = true
  }
  if (marker === undefined && !missing) return undefined
  const source = missing ? 'legacy' : marker?.state
  if (source === undefined) throw new Error('recovery source missing')
  const ownerObserved =
    marker?.state === 'clean'
      ? undefined
      : marker?.state === 'active'
        ? marker.owner === ownership.current
          ? 'alive'
          : await observe(() => ownership.observeExit(marker.owner))
        : await observe(
            ownership.observeLegacyExit === undefined
              ? undefined
              : () => ownership.observeLegacyExit?.(dir) ?? Promise.resolve('unknown'),
          )
  diagnostic(
    Object.freeze({
      level: ownerObserved === undefined || ownerObserved === 'exited' ? 'warn' : 'error',
      stage: 'recovery',
      sessionHash: hash,
      recoverySource: source,
      ...(ownerObserved === undefined ? {} : { ownerObserved }),
    }),
  )
  if (source !== 'clean' && ownerObserved !== 'exited') return undefined
  try {
    await io.unlink(join(dir, 'recovery.json.next'))
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  await replaceRecovery(io, dir, { v: 1, state: 'active', owner: ownership.current })
  return source === 'clean' ? 'clean' : 'recover'
}
export async function replaceRecovery(io: FileIo, dir: string, marker: Marker): Promise<void> {
  const next = join(dir, 'recovery.json.next')
  const file = await io.open(next, 'wx')
  try {
    const bytes = new TextEncoder().encode(writeJsonLossless(marker))
    if ((await file.write(bytes)) !== bytes.length) throw new IoFailure('recovery-write')
    await file.datasync()
  } finally {
    await file.close()
  }
  await io.rename(next, join(dir, 'recovery.json'))
  await syncDirectory(io, dir)
}
