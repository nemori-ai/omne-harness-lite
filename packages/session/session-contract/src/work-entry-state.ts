import type { SessionEntry } from './entries.ts'
import type { HistoryEntry } from './faces.ts'
import type { EntryId } from './identity.ts'
import type { SessionCallWait } from './call-values.ts'
import type { ControlProgress, WorkSnapshot } from './values.ts'
import type { SessionWorkEntryIndex, SessionControlEntryReferences } from './work-entry-values.ts'
import { nonempty, unavailableAt, unique } from './session-validation.ts'

export function unsettled(control: ControlProgress): boolean {
  return (
    control.state !== 'reconciled' ||
    control.pending.length > 0 ||
    (control.pendingUnassociatedWaiting?.length ?? 0) > 0
  )
}
function selectedWait(index: SessionWorkEntryIndex, wait: SessionCallWait) {
  const call = index.calls.find(item => item.consumption === wait.consumption)
  const waiting = call?.waits.find(item => item.position === wait.position)
  if (call === undefined || waiting === undefined)
    unavailableAt(`workEntryIndex.wait.${wait.consumption}/${wait.position}`)
  return {
    consumption: wait.consumption,
    position: wait.position,
    registered: call.registered,
    waiting: waiting.entry,
    association: call.association,
  }
}

/** Computes the lower bound from trusted projections, before inspecting caller compaction reads. */
export function requiredWorkEntries(snapshot: WorkSnapshot): readonly EntryId[] {
  const waits = (snapshot.callWaits ?? []).filter(wait =>
    snapshot.callRegistrations?.some(
      call => call.consumption === wait.consumption && call.registration.kind === 'tool-intent',
    ),
  )
  if (
    snapshot.callWaits === undefined &&
    snapshot.callRegistrations?.some(call => call.registration.kind === 'tool-intent')
  )
    unavailableAt('workEntryIndex.originalWaiting')
  const controls = snapshot.controls.filter(unsettled)
  if (waits.length === 0 && controls.length === 0) return []
  const index = snapshot.workEntryIndex
  if (index === undefined) unavailableAt('workEntryIndex')
  unique(index.calls, item => item.consumption, 'workEntryIndex.calls')
  unique(index.controls, item => item.operation, 'workEntryIndex.controls')
  const refs: EntryId[] = []
  const addSelected = (item: SessionControlEntryReferences['selected'][number]) => {
    refs.push(item.registered, item.waiting)
    if (item.association !== null) refs.push(item.association)
  }
  for (const wait of waits) addSelected(selectedWait(index, wait))
  for (const control of controls) {
    const original = index.controls.find(item => item.operation === control.operation)
    if (original === undefined) unavailableAt(`workEntryIndex.control.${control.operation}`)
    refs.push(original.intent)
    if (original.progress !== null) refs.push(original.progress)
    unique(
      original.selected,
      item => `${item.consumption}\0${item.position}`,
      'workEntryIndex.control.selected',
    )
    for (const wait of control.pendingUnassociatedWaiting ?? [])
      if (
        !original.selected.some(
          item => item.consumption === wait.consumption && item.position === wait.position,
        )
      )
        unavailableAt('workEntryIndex.control.selected')
    for (const selected of original.selected) addSelected(selected)
  }
  for (const ref of refs) nonempty(ref, 'workEntryIndex.reference')
  return [...new Set(refs)]
}

/** Only actual committed row IDs enter the index. The temporary preparation never mints them. */
export function projectWorkEntries(
  before: WorkSnapshot,
  after: WorkSnapshot,
  entry: SessionEntry,
  row: HistoryEntry,
): SessionWorkEntryIndex | undefined {
  const relevant = [
    'call.bound',
    'extension.passage',
    'control.requested',
    'control.progress',
    'run.terminal',
    'session.archived',
    'call.result-processed',
  ].includes(entry.kind)
  if (!relevant) return before.workEntryIndex
  requiredWorkEntries(before)
  nonempty(row.id, 'entry.id')
  const index = before.workEntryIndex ?? { calls: [], controls: [] }
  let calls = [...index.calls]
  let controls = [...index.controls]
  if (entry.kind === 'call.bound') {
    const prior = calls.find(item => item.consumption === entry.consumption)
    const old = before.callRegistrations?.find(item => item.consumption === entry.consumption)
    const association =
      old?.registration.kind === 'tool-intent' &&
      'registration' in entry &&
      entry.registration.kind === 'associated'
    if (prior === undefined && old !== undefined) return before.workEntryIndex
    const next = {
      consumption: entry.consumption,
      registered: prior?.registered ?? row.id,
      association: association ? row.id : (prior?.association ?? null),
      waits: prior?.waits ?? [],
    }
    calls = [...calls.filter(item => item.consumption !== entry.consumption), next]
    if (association)
      controls = controls.map(control => ({
        ...control,
        selected: control.selected.map(item =>
          item.consumption === entry.consumption ? { ...item, association: row.id } : item,
        ),
      }))
  }
  if (entry.kind === 'control.requested') {
    const selected = (entry.progress.pendingUnassociatedWaiting ?? []).map(wait =>
      selectedWait(index, wait),
    )
    controls.push({ operation: entry.progress.operation, intent: row.id, progress: null, selected })
  }
  if (entry.kind === 'control.progress' && entry.progress !== null) {
    const operation = entry.progress.operation
    if (!controls.some(item => item.operation === operation) && unsettled(entry.progress))
      unavailableAt('workEntryIndex.control.intent')
    controls = controls.map(item =>
      item.operation === operation ? { ...item, progress: row.id } : item,
    )
  }
  if (
    entry.kind === 'extension.passage' &&
    after.run.kind === 'active' &&
    after.run.run === entry.run
  ) {
    const current = after.callWaits ?? []
    for (const wait of current)
      if (!calls.some(item => item.consumption === wait.consumption))
        unavailableAt('workEntryIndex.wait.registered')
    calls = calls.map(call => ({
      ...call,
      waits: current
        .filter(wait => wait.consumption === call.consumption)
        .map(wait => ({ position: wait.position, entry: row.id })),
    }))
  } else {
    calls = calls.map(call => ({
      ...call,
      waits: call.waits.filter(wait =>
        (after.callWaits ?? []).some(
          item => item.consumption === call.consumption && item.position === wait.position,
        ),
      ),
    }))
  }
  return { calls, controls }
}
