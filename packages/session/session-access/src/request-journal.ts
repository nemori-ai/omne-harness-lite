import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { JournalRecord, RequestJournal } from './ports.ts'
import type { QueuedRequest } from './request-queue.ts'

type Waiting = Readonly<{ line: string; change: number; landed: (durable: boolean) => void }>

function lineOf(record: JournalRecord): string {
  const { kind, tenant, session, acceptId } = record
  if (kind === 'left') return `${JSON.stringify({ kind, tenant, session, acceptId })}\n`
  const { inputId, message, login, seq } = record
  return `${JSON.stringify({ kind, tenant, session, acceptId, inputId, message, login, seq })}\n`
}

function replay(text: string): QueuedRequest[] {
  const lines = text.split('\n')
  lines.pop()
  const queued = new Map<string, QueuedRequest>()
  for (const line of lines) {
    const record = JSON.parse(line) as JournalRecord
    const key = JSON.stringify([record.tenant, record.session, record.acceptId])
    if (record.kind === 'left') queued.delete(key)
    else {
      const { tenant, session, acceptId, inputId, message, login, seq } = record
      queued.set(key, { tenant, session, acceptId, inputId, message, login, seq })
    }
  }
  return [...queued.values()]
}

async function recorded(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function rewrite(file: string, requests: readonly QueuedRequest[]): Promise<number> {
  const text = requests.map(request => lineOf({ kind: 'enqueued', ...request })).join('')
  const staged = `${file}.tmp`
  const handle = await open(staged, 'w')
  try {
    await handle.writeFile(text)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(staged, file)
  await syncDirectory(dirname(file))
  return Buffer.byteLength(text)
}

export async function openRequestJournal(file: string): Promise<RequestJournal> {
  await mkdir(dirname(file), { recursive: true })
  const pending = replay(await recorded(file))
  let size = await rewrite(file, pending)
  const handle = await open(file, 'a')
  const waiting: Waiting[] = []
  let flushing: Promise<void> | undefined
  let closed = false
  let queued = pending.length

  async function land(text: string): Promise<boolean> {
    try {
      await handle.appendFile(text)
      await handle.sync()
      size += Buffer.byteLength(text)
      return true
    } catch {
      await handle.truncate(size).catch(() => {
        closed = true
      })
      return false
    }
  }

  async function cut(): Promise<void> {
    await handle.truncate(0)
    size = 0
    await handle.sync()
  }

  async function flush(): Promise<void> {
    while (waiting.length > 0) {
      const batch = waiting.splice(0)
      const durable = await land(batch.map(entry => entry.line).join(''))
      for (const entry of batch) {
        if (durable) queued += entry.change
        entry.landed(durable)
      }
      if (queued === 0 && size > 0 && waiting.length === 0) await cut().catch(() => undefined)
    }
    flushing = undefined
  }

  return {
    pending,
    append(record) {
      if (closed) return Promise.resolve(false)
      return new Promise<boolean>(landed => {
        waiting.push({ line: lineOf(record), change: record.kind === 'left' ? -1 : 1, landed })
        flushing ??= flush()
      })
    },
    async close() {
      closed = true
      await flushing
      await handle.close()
    },
  }
}
