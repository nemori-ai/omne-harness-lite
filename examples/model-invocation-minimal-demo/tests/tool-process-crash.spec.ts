import { fixturePayload } from './log-payload-fixture.ts'
import { journalBatchText } from './sql-batches-fixture.ts'
// @module-tag slow
// Each case kills a real demo process at a physical SQL journal boundary and opens a successor.
import assert from 'node:assert/strict'
import { fork, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { createLocalTls } from './local-tls.ts'

const fixture = fileURLToPath(new URL('./tool-process-crash-fixture.mjs', import.meta.url))
const phaseBudget = 90_000
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
function object(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
function value(entry: Record<string, unknown>): Record<string, unknown> {
  return fixturePayload(entry.payload).value
}
function batches(bytes: string) {
  return bytes
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const batch = object(JSON.parse(line))
      assert.ok(Array.isArray(batch.entries))
      return batch.entries.map(object)
    })
}
function records(rows: readonly Record<string, unknown>[], kind: string) {
  return rows.filter(entry => value(entry).kind === kind)
}
function only(rows: readonly Record<string, unknown>[], kind: string) {
  const selected = records(rows, kind)
  assert.equal(selected.length, 1, kind + ' must occur exactly once')
  return value(selected[0]!)
}
async function bounded<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(label + ' exceeded its child phase budget')),
          phaseBudget,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
function child(
  input: string,
  point: 'cut' | 'ready' | 'failure',
  onMessage?: (message: Record<string, unknown>, process: ChildProcess) => void,
) {
  const process = fork(fixture, [input], {
    execArgv: [],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  })
  const notice = Promise.withResolvers<Record<string, unknown>>()
  const exit = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>()
  let stderr = ''
  process.stderr?.on('data', bytes => {
    stderr += String(bytes)
  })
  process.on('message', message => {
    const received = object(message)
    onMessage?.(received, process)
    if (received.kind === point) notice.resolve(received)
    if (received.kind === 'failure') notice.reject(new Error(String(received.reason)))
  })
  process.once('error', error => {
    notice.reject(error)
    exit.reject(error)
  })
  process.once('exit', (code, signal) => {
    exit.resolve({ code, signal })
    notice.reject(new Error('child exited before ' + point + ': ' + stderr))
  })
  return { process, notice: bounded(notice.promise, point), exit: exit.promise }
}
async function stop(process: ChildProcess, exit: Promise<unknown>) {
  if (process.exitCode === null && process.signalCode === null) process.kill('SIGKILL')
  await bounded(exit, 'child exit')
}
async function authors(file: string) {
  const text = await readFile(file, 'utf8').catch(error => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return ''
    throw error
  })
  return text
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map(line => object(JSON.parse(line)))
}

const cuts = [
  { point: 'before_intent', intent: 0, started: 0, author: 0, A: 0, B: 0, C: 0 },
  { point: 'after_intent', intent: 1, started: 0, author: 0, A: 0, B: 0, C: 0 },
  { point: 'after_started', intent: 1, started: 1, author: 0, A: 0, B: 0, C: 0 },
  { point: 'author_returned_before_A', intent: 1, started: 1, author: 1, A: 0, B: 0, C: 0 },
  { point: 'after_A', intent: 1, started: 1, author: 1, A: 1, B: 0, C: 0 },
  { point: 'after_B', intent: 1, started: 1, author: 1, A: 1, B: 1, C: 0 },
  { point: 'before_C', intent: 1, started: 1, author: 1, A: 1, B: 1, C: 0 },
  { point: 'after_C', intent: 1, started: 1, author: 1, A: 1, B: 1, C: 1 },
] as const

for (const cut of cuts)
  test(
    'real process death at ' + cut.point + ' never replays the author',
    { tags: ['slow'], timeout: 210_000 },
    async () => {
      const parent = resolve('tmp/tool-runtime-loop/tool-process-crash')
      await mkdir(parent, { recursive: true, mode: 0o700 })
      const root = await mkdtemp(join(parent, cut.point + '-'))
      const tls = await createLocalTls(join(root, 'tls'))
      tls.setMode('tool_nonce')
      const authorEntries = join(root, 'author-entries.jsonl'),
        owner = randomUUID()
      const common = {
        data: join(root, 'data'),
        authorEntries,
        transport: {
          baseUrl: tls.developmentTransport.baseUrl,
          ca: Buffer.from(tls.developmentTransport.tls.ca).toString('base64'),
        },
      }
      const crashInput = join(root, 'crash-input.json')
      await writeFile(
        crashInput,
        JSON.stringify({ ...common, mode: 'crash', owner, cut: cut.point, confirmedExited: [] }),
        { mode: 0o600 },
      )
      const original = child(crashInput, 'cut')
      let successor: ReturnType<typeof child> | undefined
      try {
        const reached = await original.notice
        expect(reached).toMatchObject({ point: cut.point, owner, pid: original.process.pid })
        assert.ok(typeof reached.session === 'string')
        expect(original.process.kill('SIGKILL')).toBe(true)
        const exited = await bounded(original.exit, 'original process exit')
        expect(exited).toEqual({ code: null, signal: 'SIGKILL' })
        // This observation, not a guessed PID status, authorizes this exact old owner as exited.
        await writeFile(
          join(root, 'observed-exit.json'),
          JSON.stringify({ owner, pid: reached.pid, ...exited }),
          { mode: 0o600 },
        )
        const journal = join(common.data, 'db.sqlite')
        const before = journalBatchText(journal, reached.session),
          originalRows = batches(before).flat()
        expect(
          [
            'execution_intended',
            'execution_started',
            'execution_ended',
            'delivery_ready',
            'delivery_confirmed',
          ].map(kind => records(originalRows, kind).length),
        ).toEqual([cut.intent, cut.started, cut.A, cut.B, cut.C])
        expect((await authors(authorEntries)).filter(row => row.phase === 'entered')).toHaveLength(
          cut.author,
        )
        expect((await authors(authorEntries)).filter(row => row.phase === 'returned')).toHaveLength(
          cut.author,
        )
        const successorInput = join(root, 'successor-input.json')
        await writeFile(
          successorInput,
          JSON.stringify({
            ...common,
            mode: 'recover',
            previousOwner: owner,
            owner: randomUUID(),
            confirmedExited: [owner],
          }),
          { mode: 0o600 },
        )
        successor = child(successorInput, 'ready')
        expect(await successor.notice).toMatchObject({
          session: reached.session,
          executions: cut.intent,
        })
        expect(await bounded(successor.exit, 'successor clean exit')).toEqual({
          code: 0,
          signal: null,
        })
        expect(tls.requests).toHaveLength(1)
        expect((await authors(authorEntries)).filter(row => row.phase === 'entered')).toHaveLength(
          cut.author,
        )
        const after = journalBatchText(journal, reached.session),
          physical = batches(after),
          rows = physical.flat()
        expect(after.startsWith(before)).toBe(true)
        expect(
          [
            'execution_intended',
            'execution_started',
            'execution_ended',
            'delivery_ready',
            'delivery_confirmed',
          ].map(kind => records(rows, kind).length),
        ).toEqual([cut.intent, cut.started, cut.intent, cut.intent, cut.intent])
        const messages = rows.filter(entry => value(entry).type === 'tool')
        expect(messages).toHaveLength(cut.intent)
        if (!cut.intent) return
        const A = only(rows, 'execution_ended'),
          B = only(rows, 'delivery_ready'),
          C = only(rows, 'delivery_confirmed')
        expect(object(A.account).callId).toEqual(object(A.ref).callId)
        expect(object(A.delivery).result).toBeDefined()
        expect(object(C.message)).toEqual(value(messages[0]!))
        expect(
          physical.filter(batch => batch.some(entry => value(entry).kind === 'delivery_confirmed')),
        ).toHaveLength(1)
        expect(
          physical
            .find(batch => batch.some(entry => value(entry).kind === 'delivery_confirmed'))!
            .filter(entry => value(entry).type === 'tool'),
        ).toHaveLength(1)
        if (!cut.A) {
          expect(A.terminal).toEqual({ outcome: 'failed', code: 'abnormal_interruption' })
          expect(object(A.account).cost).toMatchObject({ total_usd: 'unknown' })
          expect(object(A.account).frames).toBe('unknown')
          // This demo selects no each hook: its empty chain is already complete.
          expect(B.basis).toEqual({ kind: 'conclusions', keys: [] })
        } else {
          expect(A).toEqual(only(originalRows, 'execution_ended'))
          const returned = object(A.terminal).result
          assert.ok(typeof returned === 'string')
          const actual = (await authors(authorEntries)).find(row => row.phase === 'returned')!
          expect(digest(returned)).toBe(actual.digest)
          const resultFiles = (await readdir(join(common.data, 'tool-results'))).filter(file =>
            file.endsWith('.json'),
          )
          const results = await Promise.all(
            resultFiles.map(async file =>
              object(JSON.parse(await readFile(join(common.data, 'tool-results', file), 'utf8'))),
            ),
          )
          const stored = results.filter(result => result.kind === 'result')
          expect(stored).toHaveLength(1)
          expect(stored[0]!.value).toMatchObject({
            ref: A.ref,
            result: { content: [{ kind: 'text', text: returned }] },
          })
          if (cut.B) expect(B).toEqual(only(originalRows, 'delivery_ready'))
          else expect(B.basis).toEqual({ kind: 'conclusions', keys: [] })
          if (cut.C) expect(C).toEqual(only(originalRows, 'delivery_confirmed'))
        }
      } finally {
        await stop(original.process, original.exit)
        if (successor) await stop(successor.process, successor.exit)
        await tls.close()
      }
    },
  )

test(
  'real process death retains two owned sessions and recovers both before ready',
  { tags: ['slow'], timeout: 210_000 },
  async () => {
    const parent = resolve('tmp/tool-runtime-loop/tool-process-crash')
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const root = await mkdtemp(join(parent, 'two-owned-')),
      tls = await createLocalTls(join(root, 'tls'))
    tls.setMode('tool_nonce')
    const owner = randomUUID(),
      authorEntries = join(root, 'author-entries.jsonl')
    const common = {
      data: join(root, 'data'),
      authorEntries,
      transport: {
        baseUrl: tls.developmentTransport.baseUrl,
        ca: Buffer.from(tls.developmentTransport.tls.ca).toString('base64'),
      },
    }
    const input = join(root, 'crash-input.json')
    await writeFile(
      input,
      JSON.stringify({ ...common, mode: 'two-crash', owner, cut: 'after_B', confirmedExited: [] }),
      { mode: 0o600 },
    )
    const original = child(input, 'cut', (message, process) => {
      if (message.kind === 'first_pending') {
        tls.setMode('tool_nonce')
        process.send({ continueSecond: true })
      }
    })
    let successor: ReturnType<typeof child> | undefined
    try {
      const reached = await original.notice
      assert.ok(Array.isArray(reached.sessions) && reached.sessions.length === 2)
      const sessions = reached.sessions.map(session => {
        assert.ok(typeof session === 'string')
        return session
      })
      expect(original.process.kill('SIGKILL')).toBe(true)
      expect(await bounded(original.exit, 'two-session original exit')).toEqual({
        code: null,
        signal: 'SIGKILL',
      })
      const files = sessions
      const before = sessions.map(session =>
        journalBatchText(join(common.data, 'db.sqlite'), session),
      )
      expect(before.map(text => records(batches(text).flat(), 'execution_ended').length)).toEqual([
        1, 1,
      ])
      expect(before.map(text => records(batches(text).flat(), 'delivery_ready').length)).toEqual([
        0, 1,
      ])
      expect(
        before.map(text => records(batches(text).flat(), 'delivery_confirmed').length),
      ).toEqual([0, 0])
      expect((await authors(authorEntries)).filter(row => row.phase === 'returned')).toHaveLength(2)
      const recoveryInput = join(root, 'recovery-input.json')
      await writeFile(
        recoveryInput,
        JSON.stringify({
          ...common,
          mode: 'recover',
          previousOwner: owner,
          owner: randomUUID(),
          confirmedExited: [owner],
          sessions,
          holdSession: sessions[1],
        }),
        { mode: 0o600 },
      )
      let blocked = false
      successor = child(recoveryInput, 'ready', (message, process) => {
        if (message.kind !== 'recovery_blocked') return
        expect(message).toMatchObject({ session: sessions[1], gateOpen: false })
        blocked = true
        process.send({ releaseRecovery: true })
      })
      expect((await successor.notice).owned).toEqual(
        sessions.map(session => ({ session, executions: 1 })),
      )
      expect(blocked).toBe(true)
      expect(await bounded(successor.exit, 'two-session successor exit')).toEqual({
        code: 0,
        signal: null,
      })
      expect(tls.requests).toHaveLength(2)
      expect((await authors(authorEntries)).filter(row => row.phase === 'entered')).toHaveLength(2)
      for (const [index, file] of files.entries()) {
        const after = journalBatchText(join(common.data, 'db.sqlite'), file),
          rows = batches(after).flat()
        expect(after.startsWith(before[index]!)).toBe(true)
        const A = only(rows, 'execution_ended')
        expect(A).toEqual(only(batches(before[index]!).flat(), 'execution_ended'))
        expect(object(A.terminal).outcome).toBe('completed')
        only(rows, 'delivery_ready')
        only(rows, 'delivery_confirmed')
        expect(rows.filter(entry => value(entry).type === 'tool')).toHaveLength(1)
      }
    } finally {
      await stop(original.process, original.exit)
      if (successor) await stop(successor.process, successor.exit)
      await tls.close()
    }
  },
)

test(
  'actual live writer and withheld exit observation block tool recovery before ready',
  { tags: ['slow'], timeout: 210_000 },
  async () => {
    const parent = resolve('tmp/tool-runtime-loop/tool-process-crash')
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const root = await mkdtemp(join(parent, 'writer-fence-')),
      tls = await createLocalTls(join(root, 'tls'))
    tls.setMode('tool_nonce')
    const owner = randomUUID(),
      common = {
        data: join(root, 'data'),
        authorEntries: join(root, 'author-entries.jsonl'),
        transport: {
          baseUrl: tls.developmentTransport.baseUrl,
          ca: Buffer.from(tls.developmentTransport.tls.ca).toString('base64'),
        },
      }
    const input = join(root, 'original-input.json')
    await writeFile(
      input,
      JSON.stringify({
        ...common,
        mode: 'crash',
        owner,
        cut: 'after_started',
        confirmedExited: [],
      }),
      { mode: 0o600 },
    )
    const original = child(input, 'cut'),
      contenders: ReturnType<typeof child>[] = []
    const exitedOwners: string[] = []
    try {
      const reached = await original.notice
      assert.ok(typeof reached.session === 'string')
      const journal = join(common.data, 'db.sqlite')
      const before = journalBatchText(journal, reached.session)
      for (const fact of ['alive', 'unknown'] as const) {
        if (fact === 'unknown') {
          expect(original.process.kill('SIGKILL')).toBe(true)
          expect(await bounded(original.exit, 'old writer exit')).toEqual({
            code: null,
            signal: 'SIGKILL',
          })
          exitedOwners.push(owner)
        } else {
          expect(original.process.exitCode).toBeNull()
          expect(original.process.signalCode).toBeNull()
        }
        const contenderOwner = randomUUID(),
          contenderFile = join(root, fact + '-input.json')
        await writeFile(
          contenderFile,
          JSON.stringify({
            ...common,
            mode: 'recover',
            previousOwner: owner,
            owner: contenderOwner,
            confirmedExited: [],
            observedAlive: fact === 'alive' ? [owner] : [],
          }),
          { mode: 0o600 },
        )
        const contender = child(contenderFile, 'failure')
        contenders.push(contender)
        const failure = await contender.notice
        expect(failure.kind).toBe('failure')
        if (fact === 'unknown')
          expect(failure.observations).toContainEqual({ owner, observed: 'unknown' })
        expect(await bounded(contender.exit, 'rejected contender exit')).toEqual({
          code: 1,
          signal: null,
        })
        exitedOwners.push(contenderOwner)
        expect(journalBatchText(journal, reached.session)).toBe(before)
        expect(await authors(common.authorEntries)).toHaveLength(0)
      }
      const recoveryFile = join(root, 'confirmed-input.json')
      await writeFile(
        recoveryFile,
        JSON.stringify({
          ...common,
          mode: 'recover',
          previousOwner: owner,
          owner: randomUUID(),
          confirmedExited: exitedOwners,
        }),
        { mode: 0o600 },
      )
      const successor = child(recoveryFile, 'ready')
      contenders.push(successor)
      expect(await successor.notice).toMatchObject({ executions: 1 })
      expect(await bounded(successor.exit, 'confirmed successor exit')).toEqual({
        code: 0,
        signal: null,
      })
      expect(await authors(common.authorEntries)).toHaveLength(0)
      const rows = batches(journalBatchText(journal, reached.session)).flat()
      expect(only(rows, 'execution_ended').terminal).toEqual({
        outcome: 'failed',
        code: 'abnormal_interruption',
      })
      only(rows, 'delivery_confirmed')
      expect(tls.requests).toHaveLength(1)
    } finally {
      await stop(original.process, original.exit)
      for (const contender of contenders) await stop(contender.process, contender.exit)
      await tls.close()
    }
  },
)
