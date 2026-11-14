import type { JournalRecord, RequestJournal } from '../../src/ports.ts'
import type { QueuedRequest } from '../../src/request-queue.ts'

export type JournalDouble = Readonly<{
  open(): RequestJournal
  records(): readonly JournalRecord[]
  refuse(refused: ((record: JournalRecord) => boolean) | undefined): void
}>

function pendingOf(records: readonly JournalRecord[]): QueuedRequest[] {
  const queued = new Map<string, QueuedRequest>()
  for (const record of records) {
    const key = JSON.stringify([record.tenant, record.session, record.acceptId])
    if (record.kind === 'left') queued.delete(key)
    else {
      const { kind: _kind, ...request } = record
      queued.set(key, request)
    }
  }
  return [...queued.values()]
}

export function createJournalDouble(): JournalDouble {
  const records: JournalRecord[] = []
  let refused: ((record: JournalRecord) => boolean) | undefined
  return {
    open() {
      let closed = false
      return {
        pending: pendingOf(records),
        async append(record) {
          if (closed || refused?.(record) === true) return false
          records.push(record)
          return true
        },
        async close() {
          closed = true
        },
      }
    },
    records: () => [...records],
    refuse: next => {
      refused = next
    },
  }
}
