import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JournalRecord } from '../src/ports.ts'
import { openRequestJournal } from '../src/request-journal.ts'
import type { QueuedRequest } from '../src/request-queue.ts'

let directory: string
let file: string

beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'request-journal-')))
  file = join(directory, 'state', 'request-queue.jsonl')
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(directory, { recursive: true, force: true })
})

function request(acceptId: string, seq: number, session = 'session-1'): QueuedRequest {
  return {
    tenant: 'tenant-a',
    session,
    acceptId,
    inputId: `input-${acceptId}`,
    message: `{"text":"${acceptId}\\n"}`,
    login: 'login-a',
    seq,
  }
}

const enqueued = (queued: QueuedRequest): JournalRecord => ({ kind: 'enqueued', ...queued })
const left = ({ tenant, session, acceptId }: QueuedRequest): JournalRecord => ({
  kind: 'left',
  tenant,
  session,
  acceptId,
})

const linesOf = (): unknown[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(line => line !== '')
    .map(line => JSON.parse(line) as unknown)

async function syncOfFileHandles() {
  const handle = await open(file, 'r')
  const prototype = Object.getPrototypeOf(handle) as { sync(): Promise<void> }
  await handle.close()
  return vi.spyOn(prototype, 'sync')
}

describe('the request journal file', () => {
  it('opens empty where there is no file yet', async () => {
    const journal = await openRequestJournal(file)
    expect(journal.pending).toEqual([])
    await journal.close()
    expect(readFileSync(file, 'utf8')).toBe('')
  })

  it('reads back after a reopen what was appended, in order', async () => {
    const journal = await openRequestJournal(file)
    const requests = [request('a', 0), request('b', 1), request('c', 0, 'session-2')]
    for (const each of requests) expect(await journal.append(enqueued(each))).toBe(true)
    await journal.close()
    const reopened = await openRequestJournal(file)
    expect(reopened.pending).toEqual(requests)
    await reopened.close()
  })

  it('does not read back a request that left, and reads one queued again after it left', async () => {
    const journal = await openRequestJournal(file)
    const again = { ...request('a', 2), message: '{"text":"again"}' }
    for (const record of [
      enqueued(request('a', 0)),
      enqueued(request('b', 1)),
      left(request('a', 0)),
      enqueued(again),
    ])
      expect(await journal.append(record)).toBe(true)
    await journal.close()
    const reopened = await openRequestJournal(file)
    expect(reopened.pending).toEqual([request('b', 1), again])
    await reopened.close()
  })

  it('takes a leave only from the session and the tenant it names (R5)', async () => {
    const journal = await openRequestJournal(file)
    const elsewhere = { ...request('a', 0), tenant: 'tenant-b' }
    for (const record of [
      enqueued(request('a', 0)),
      enqueued(request('a', 0, 'session-2')),
      enqueued(elsewhere),
      left(request('a', 0, 'session-2')),
    ])
      expect(await journal.append(record)).toBe(true)
    await journal.close()
    const reopened = await openRequestJournal(file)
    expect(reopened.pending).toEqual([request('a', 0), elsewhere])
    await reopened.close()
  })

  it('drops a last line that was written by half and keeps the lines before it', async () => {
    const journal = await openRequestJournal(file)
    await journal.append(enqueued(request('a', 0)))
    await journal.append(enqueued(request('b', 1)))
    await journal.close()
    const whole = readFileSync(file, 'utf8')
    const half = JSON.stringify(enqueued(request('c', 2))).slice(0, 40)
    writeFileSync(file, whole + half)
    const reopened = await openRequestJournal(file)
    expect(reopened.pending).toEqual([request('a', 0), request('b', 1)])
    expect(readFileSync(file, 'utf8')).toBe(whole)
    await reopened.close()
  })

  it('rewrites the file on open to the requests that are still queued', async () => {
    const journal = await openRequestJournal(file)
    await journal.append(enqueued(request('a', 0)))
    await journal.append(enqueued(request('b', 1)))
    await journal.append(left(request('a', 0)))
    await journal.close()
    expect(linesOf()).toHaveLength(3)
    const reopened = await openRequestJournal(file)
    expect(linesOf()).toEqual([enqueued(request('b', 1))])
    expect(await reopened.append(enqueued(request('c', 2)))).toBe(true)
    await reopened.close()
    expect(linesOf()).toEqual([enqueued(request('b', 1)), enqueued(request('c', 2))])
  })

  it('answers an append only after the line is synced', async () => {
    const journal = await openRequestJournal(file)
    let release = (): void => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const sync = (await syncOfFileHandles()).mockImplementation(() => gate)
    let answered = false
    const appended = journal.append(enqueued(request('a', 0))).then(durable => {
      answered = true
      return durable
    })
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(linesOf()).toEqual([enqueued(request('a', 0))])
    expect(answered).toBe(false)
    release()
    expect(await appended).toBe(true)
    await journal.close()
  })

  it('answers false and leaves no part of the line when the file cannot be written', async () => {
    const journal = await openRequestJournal(file)
    await journal.append(enqueued(request('a', 0)))
    const whole = readFileSync(file, 'utf8')
    ;(await syncOfFileHandles()).mockRejectedValueOnce(new Error('EIO'))
    expect(await journal.append(enqueued(request('b', 1)))).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(whole)
    expect(await journal.append(enqueued(request('c', 1)))).toBe(true)
    await journal.close()
    const reopened = await openRequestJournal(file)
    expect(reopened.pending).toEqual([request('a', 0), request('c', 1)])
    await reopened.close()
  })

  it('lands appends made at the same moment in the order they were made', async () => {
    const journal = await openRequestJournal(file)
    const requests = Array.from({ length: 20 }, (_, seq) => request(`r${seq}`, seq))
    const landed = await Promise.all(requests.map(each => journal.append(enqueued(each))))
    expect(landed).toEqual(requests.map(() => true))
    expect(linesOf()).toEqual(requests.map(enqueued))
    await journal.close()
  })

  it('waits on close for the appends on their way and refuses the ones after it', async () => {
    const journal = await openRequestJournal(file)
    const appended = journal.append(enqueued(request('a', 0)))
    await journal.close()
    expect(linesOf()).toEqual([enqueued(request('a', 0))])
    expect(await appended).toBe(true)
    expect(await journal.append(enqueued(request('b', 1)))).toBe(false)
    expect(linesOf()).toEqual([enqueued(request('a', 0))])
  })

  it('refuses an append made after the close began, while an earlier one is still landing', async () => {
    const journal = await openRequestJournal(file)
    let release = (): void => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const sync = (await syncOfFileHandles()).mockImplementationOnce(() => gate)
    const appended = journal.append(enqueued(request('a', 0)))
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1))
    const closing = journal.close()
    const late = journal.append(enqueued(request('b', 1)))
    release()
    await closing
    expect(await appended).toBe(true)
    expect(await late).toBe(false)
    expect(linesOf()).toEqual([enqueued(request('a', 0))])
  })
})

describe('what the file holds of a record (R6)', () => {
  const SENTINEL = 'login-proof-sentinel-3f9c'

  it('writes the named fields of a record and nothing else it carries', async () => {
    const journal = await openRequestJournal(file)
    const carried = { loginProof: SENTINEL, credential: { secret: SENTINEL } }
    await journal.append({ ...enqueued(request('a', 0)), ...carried })
    await journal.append({ ...left(request('a', 0)), ...carried })
    await journal.append({ ...enqueued(request('b', 1)), ...carried })
    await journal.close()
    expect(readFileSync(file, 'utf8')).not.toContain(SENTINEL)
    expect(linesOf()).toEqual([
      enqueued(request('a', 0)),
      left(request('a', 0)),
      enqueued(request('b', 1)),
    ])
    const reopened = await openRequestJournal(file)
    expect(reopened.pending).toEqual([request('b', 1)])
    expect(readFileSync(file, 'utf8')).not.toContain(SENTINEL)
    await reopened.close()
  })
})
