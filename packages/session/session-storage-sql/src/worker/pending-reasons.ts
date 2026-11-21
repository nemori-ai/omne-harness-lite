// Why a session is in the pending index: the reasons its snapshot gives.
import { runStartInputs, type WorkSnapshot } from '@omne-harness/session-contract'

export function pendingReasons(snapshot: WorkSnapshot | null): readonly string[] {
  if (snapshot === null) return []
  const reasons: string[] = []
  if (snapshot.tasks.some(task => task.kind === 'initialization')) reasons.push('initialization')
  if (snapshot.unresolved.length > 0) reasons.push('unresolved')
  if (snapshot.controls.some(control => control.state === 'propagating')) reasons.push('controls')
  if (snapshot.tasks.length > 0) reasons.push('tasks')
  if (runStartInputs(snapshot).length > 0) reasons.push('inputs')
  if (snapshot.run.kind === 'active') reasons.push('run')
  else if (
    snapshot.lifecycle !== 'archived' &&
    snapshot.autoArchive?.kind === 'enabled' &&
    !(snapshot.resident === true)
  )
    reasons.push('idle-armed')
  return reasons
}
