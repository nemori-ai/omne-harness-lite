import { CronExpression } from 'cron-parser'
import { cronIterator, nearestWeekday } from './cron.ts'
import type { CronBranch, ParsedCron } from './cron.ts'
import { EnumerationState } from './enumeration-state.ts'
import { civilFromDate, fakeUtc } from './civil.ts'

type Stream = { branch: CronBranch; iterator: CronExpression; next: Date | null }
function advance(stream: Stream, state: EnumerationState): void {
  try {
    const next = stream.iterator.next().toDate()
    if (!state.charge()) return
    stream.next = next
  } catch (error) {
    if (error instanceof Error && error.message === 'Out of the time span range') stream.next = null
    else throw error
  }
}
export function enumerateCron(parsed: ParsedCron, state: EnumerationState): void {
  if (parsed.branches.length === 0) {
    state.page.exhausted = true
    return
  }
  const lower = fakeUtc(state.lower)
  if (state.input.after === null || state.lower > state.input.after || state.input.inclusive)
    lower.setTime(lower.getTime() - 1000)
  const streams: Stream[] = parsed.branches.map(branch => ({
    branch,
    iterator: cronIterator(branch, lower, fakeUtc(state.through)),
    next: null,
  }))
  for (const stream of streams) {
    advance(stream, state)
    if (state.page.limitReason !== null) return
  }
  while (!state.stopped) {
    const dates = streams.flatMap(stream => (stream.next ? [stream.next.getTime()] : []))
    if (dates.length === 0) break
    const epoch = Math.min(...dates)
    const matching = streams.filter(stream => stream.next?.getTime() === epoch)
    const date = new Date(epoch)
    const local = civilFromDate(date)
    state.page.scannedPeriods = date.getUTCFullYear() - Number(state.lower.slice(0, 4)) + 1
    state.observe(local)
    if (
      state.accepts(local) &&
      matching.some(
        stream => stream.branch.nearest === null || nearestWeekday(date, stream.branch.nearest),
      )
    )
      state.emit({ kind: 'civil', local }, local)
    if (state.stopped) return
    state.page.resumeAfter = local
    for (const stream of matching) {
      advance(stream, state)
      if (state.page.limitReason !== null) return
    }
  }
  if (!state.stopped)
    state.page.scannedPeriods = Math.max(
      0,
      Number(state.through.slice(0, 4)) - Number(state.lower.slice(0, 4)) + 1,
    )
}
