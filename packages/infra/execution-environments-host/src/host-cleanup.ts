import { clearHostBatchStages, recognizeHostFileBatch } from './file-batch.ts'
import { clearHostGateEntry } from './native-evidence.ts'
import { clearHostTerminalDirectory } from './terminal-directory.ts'
import type { NativeRecord, createNativeStore } from './native-store.ts'
import type { HostNativePolicy } from './native-policy.ts'
import type { ResourceRecoveryResult } from '@omne-harness-lite/execution-environments'

async function cleanupProcess(record: NativeRecord) {
  const reference = record.resource.reference as { unit?: string; boot?: string }
  if (!reference.unit || !reference.boot || record.kind === 'leg') return true
  const coordinate = { unit: reference.unit, boot: reference.boot }
  const cleared = await clearHostGateEntry(coordinate)
  return record.kind === 'terminal'
    ? (await clearHostTerminalDirectory(coordinate)) && cleared
    : cleared
}
/** Physical stop and disposal are separate durable obligations. The manifest survives both. */
export async function finishHostCleanup(
  record: NativeRecord,
  store: ReturnType<typeof createNativeStore>,
  policy: HostNativePolicy,
): Promise<ResourceRecoveryResult> {
  const current = await store.load(record.resource.key)
  if (!current?.stopped) return { status: 'pending' }
  let cleared = await cleanupProcess(current)
  if (current.manifest)
    cleared =
      (await clearHostBatchStages(current.manifest, policy, current.stageOwners)) === 'cleared' &&
      cleared
  if (cleared)
    await store.change(current.resource.key, basis => ({ ...basis!, cleanupPending: false }))
  const status = cleared ? 'confirmedStopped' : 'pending'
  if (!current.manifest) return { status }
  const evidence = await recognizeHostFileBatch(
    current.manifest,
    current.receipts ?? { published: [], complete: false },
    policy,
  )
  return { status, evidence: { kind: 'fileBatch', batch: current.manifest.id, ...evidence } }
}
