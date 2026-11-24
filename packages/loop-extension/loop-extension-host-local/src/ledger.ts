import { createHash } from 'node:crypto'
import { mkdir, open, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Adoption, DurableEvidence } from '@omne-harness/agent-contract'
import type { ManagedResource } from '@omne-harness/execution-environment-contract'

export type CallStop = 'confirmed' | 'unconfirmed' | 'none'

/** One physical run of a command implementation. The intent is on disk before the start is asked for. */
export type CallRecord = Readonly<{
  key: string
  tenant: string
  passage: string
  ordinal: number
  implementation: Adoption
  mode: 'fresh' | 'replay'
  scope: string
  state: 'intended' | 'started' | 'ended' | 'settled'
  process: Readonly<{ id: string; generation: string }> | null
  resources: readonly ManagedResource[]
  end: Readonly<{ outcome: string; stop: CallStop; stderrBytes: number }> | null
}>

export type CallEvent =
  | Readonly<{ at: 'started'; process: NonNullable<CallRecord['process']> }>
  | Readonly<{ at: 'resource'; resource: ManagedResource }>
  | Readonly<{ at: 'ended'; end: NonNullable<CallRecord['end']> }>
  | Readonly<{ at: 'settled'; stop: CallStop }>

type Line = Readonly<{ at: 'intended'; record: CallRecord }> | (CallEvent & { key: string })

export type CallIntent = Pick<
  CallRecord,
  'tenant' | 'passage' | 'implementation' | 'mode' | 'scope'
>

export interface CommandLedger {
  intend(intent: CallIntent): Promise<CallRecord | 'unavailable'>
  mark(key: string, event: CallEvent): Promise<'recorded' | 'unavailable'>
  get(key: string): CallRecord | undefined
  /** The calls with an intent and no end: after a restart nobody can say they did not start. */
  unfinished(): readonly CallRecord[]
  close(): Promise<void>
}

function applied(record: CallRecord, event: CallEvent): CallRecord {
  switch (event.at) {
    case 'started':
      return { ...record, state: 'started', process: event.process }
    case 'resource':
      return { ...record, resources: [...record.resources, event.resource] }
    case 'ended':
      return { ...record, state: 'ended', end: event.end }
    case 'settled':
      return {
        ...record,
        state: 'settled',
        end: { outcome: 'unknown', stop: event.stop, stderrBytes: 0 },
      }
  }
}

// A line the process died while writing is the last one and does not parse: it never took effect.
function replay(text: string): Map<string, CallRecord> {
  const records = new Map<string, CallRecord>()
  for (const raw of text.split('\n')) {
    let line: Line
    try {
      line = JSON.parse(raw) as Line
    } catch {
      continue
    }
    if (line.at === 'intended') records.set(line.record.key, line.record)
    else {
      const known = records.get(line.key)
      if (known !== undefined) records.set(line.key, applied(known, line))
    }
  }
  return records
}

export const callEvidence = (record: CallRecord): DurableEvidence => ({
  owner: 'loop-extension',
  record: record.key,
  revision: record.state,
  digest: createHash('sha256').update(JSON.stringify(record)).digest('hex'),
})

/** The ledger of one tenant: a file of appended lines, each on disk before its write answers. */
export async function openCommandLedger(file: string): Promise<CommandLedger | 'unavailable'> {
  let records: Map<string, CallRecord>
  let handle: Awaited<ReturnType<typeof open>>
  try {
    await mkdir(dirname(file), { recursive: true })
    handle = await open(file, 'a+')
    records = replay(await readFile(file, 'utf8'))
  } catch {
    return 'unavailable'
  }
  let writing: Promise<unknown> = Promise.resolve()
  function append(line: Line): Promise<boolean> {
    const next = writing.then(async () => {
      await handle.appendFile(`${JSON.stringify(line)}\n`)
      await handle.sync()
      return true
    })
    writing = next.catch(() => undefined)
    return next.catch(() => false)
  }
  return {
    async intend(intent) {
      const earlier = [...records.values()].filter(record => record.passage === intent.passage)
      const ordinal = earlier.length + 1
      const record: CallRecord = {
        ...intent,
        key: `${intent.passage}#${ordinal}`,
        ordinal,
        state: 'intended',
        process: null,
        resources: [],
        end: null,
      }
      records.set(record.key, record)
      if (await append({ at: 'intended', record })) return record
      records.delete(record.key)
      return 'unavailable'
    },
    async mark(key, event) {
      const known = records.get(key)
      if (known === undefined || !(await append({ ...event, key }))) return 'unavailable'
      records.set(key, applied(records.get(key) ?? known, event))
      return 'recorded'
    },
    get: key => records.get(key),
    unfinished: () =>
      [...records.values()].filter(
        record => record.state === 'intended' || record.state === 'started',
      ),
    async close() {
      await writing
      await handle.close().catch(() => undefined)
    },
  }
}
