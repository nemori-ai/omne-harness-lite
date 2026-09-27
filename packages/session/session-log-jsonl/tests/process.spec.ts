import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { openJsonlSessionLog } from '../src/index.ts'
import {
  processOwnership,
  registerPhysicalProcess,
  paths,
  root,
  session,
  entry,
  unfenced,
  unconditional,
  deferred,
} from './support.ts'
import { openWithIo } from '../src/open.ts'
import { fileIo, IoFailure } from '../src/file-io.ts'
import { isOk, parseTenantId } from '@omne-harness-lite/identity-values'

interface Child {
  readonly process: ChildProcessWithoutNullStreams
  readonly wait: (message: string) => Promise<void>
  readonly exit: Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>
  readonly output: () => string
  readonly errors: () => string
  readonly directory: string
  readonly mode: string
}
const children: Child[] = []
function child(dir: string, mode: string): Child {
  const identity = `child-life:${randomUUID()}`
  const process = spawn(
    globalThis.process.execPath,
    [
      '--expose-gc',
      fileURLToPath(new URL('./fixtures/physical-owner.mjs', import.meta.url)),
      dir,
      mode,
      identity,
    ],
    { env: { PATH: globalThis.process.env.PATH ?? '' } },
  )
  let output = ''
  let errors = ''
  const waiters: { message: string; resolve: () => void; reject: (error: unknown) => void }[] = []
  process.stdout.setEncoding('utf8')
  process.stderr.setEncoding('utf8')
  process.stdout.on('data', (chunk: string) => {
    output += chunk
    for (const pending of [...waiters])
      if (output.split('\n').includes(pending.message)) {
        waiters.splice(waiters.indexOf(pending), 1)
        pending.resolve()
      }
  })
  process.stderr.on('data', (chunk: string) => {
    errors += chunk
  })
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      process.on('error', reject)
      process.on('exit', (code, signal) => {
        for (const pending of waiters.splice(0))
          pending.reject(new Error(`child exited before ${pending.message}; ${errors}`))
        resolve({ code, signal })
      })
    },
  )
  const result: Child = {
    directory: dir,
    mode,
    process,
    exit,
    output: () => output,
    errors: () => errors,
    wait(message) {
      if (output.split('\n').includes(message)) return Promise.resolve()
      if (process.exitCode !== null || process.signalCode !== null)
        return Promise.reject(new Error('child already exited'))
      return new Promise<void>((resolve, reject) => {
        waiters.push({ message, resolve, reject })
      })
    },
  }
  registerPhysicalProcess(identity, exit)
  children.push(result)
  return result
}
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.process.exitCode === null && child.process.signalCode === null)
      child.process.kill('SIGKILL')
    const actualExit = await child.exit
    await writeFile(
      `${child.directory}/process-fixture-output.json`,
      JSON.stringify(
        {
          mode: child.mode,
          pid: child.process.pid,
          output: child.output(),
          errors: child.errors(),
          actualExit,
        },
        null,
        2,
      ),
    )
  }
})
describe('actual physical process ownership and exit', () => {
  it.each(['hold', 'gc'])('cross-process owner remains exclusive during %s', async mode => {
    const dir = await root()
    const actor = child(dir, mode)
    await actor.wait(mode === 'hold' ? 'acquired' : 'gc-complete-held')
    await expect(openJsonlSessionLog({ processOwnership, dir })).rejects.toThrow()
    actor.process.kill('SIGKILL')
    expect(await actor.exit).toEqual({ code: null, signal: 'SIGKILL' })
    const next = await openJsonlSessionLog({ processOwnership, dir })
    await next.close()
  })
  it.each(['full', 'half'])(
    'actual kill ends the old task before reopening a %s row',
    async mode => {
      const dir = await root()
      const actor = child(dir, mode)
      await actor.wait(`${mode}-written`)
      await expect(openJsonlSessionLog({ processOwnership, dir })).rejects.toThrow()
      const oldBytes = await readFile(paths(dir).entries)
      expect(oldBytes.length).toBeGreaterThan(0)
      actor.process.kill('SIGKILL')
      expect(await actor.exit).toEqual({ code: null, signal: 'SIGKILL' })
      const next = await openJsonlSessionLog({ processOwnership, dir })
      try {
        const read = await next.readSince(session(), 0)
        if ('failure' in read) throw new Error('reopen failed')
        expect(read.tail).toBe(mode === 'full' ? 2 : 0)
        expect(read.entries.map(entry => entry.position)).toEqual(mode === 'full' ? [1, 2] : [])
        expect([...(await readFile(paths(dir).entries))]).toEqual(
          mode === 'full' ? [...oldBytes] : [],
        )
      } finally {
        await next.close()
      }
      // The saved active owner is observed through this supervisor's real exit promise.
    },
  )
  it('confirmed whole batch persists after SIGKILL with its original positions', async () => {
    const dir = await root()
    const actor = child(dir, 'confirmed')
    await actor.wait('confirmed')
    actor.process.kill('SIGKILL')
    await actor.exit
    const next = await openJsonlSessionLog({ processOwnership, dir })
    try {
      const read = await next.readByKey(session(), 'batch')
      if ('failure' in read) throw new Error('read')
      expect(read.entries.map(entry => entry.position)).toEqual([1, 2])
      expect(read.entries.map(entry => entry.payload)).toEqual([
        { original: 'one' },
        { original: 'two' },
      ])
    } finally {
      await next.close()
    }
  })
  it('failed handle close exposes incomplete ownership until actual process exit', async () => {
    const dir = await root()
    const actor = child(dir, 'close-failure')
    await actor.wait('confirmed')
    actor.process.stdin.write('close\n')
    await actor.wait('close-failed-held')
    await expect(openJsonlSessionLog({ processOwnership, dir })).rejects.toThrow()
    actor.process.kill('SIGKILL')
    await actor.exit
    const next = await openJsonlSessionLog({ processOwnership, dir })
    await next.close()
  })
  it('an external wait boundary cannot release owner while a real write task remains blocked', async () => {
    const dir = await root()
    const actor = child(dir, 'close-blocked')
    await actor.wait('close-blocked-written')
    actor.process.stdin.write('close\n')
    await actor.wait('closing')
    expect(actor.output()).not.toContain('closed\n')
    await expect(openJsonlSessionLog({ processOwnership, dir })).rejects.toThrow()
    actor.process.stdin.write('release\n')
    await actor.wait('closed')
    expect(await actor.exit).toEqual({ code: 0, signal: null })
    const next = await openJsonlSessionLog({ processOwnership, dir })
    try {
      expect(await next.readSince(session(), 0)).toHaveProperty('tail', 2)
    } finally {
      await next.close()
    }
  })
  it.each(['open', 'write', 'datasync', 'close', 'rename', 'sync'])(
    'SIGKILL at active %s cannot mutate entries before the durable gate',
    async stage => {
      const dir = await root()
      const first = await openJsonlSessionLog({ dir, processOwnership })
      await first.append(session(), [entry('seed')], unfenced, unconditional)
      await first.close()
      const before = await readFile(paths(dir).entries)
      const actor = child(dir, `active:${stage}`)
      await actor.wait(`active-${stage}`)
      expect(await readFile(paths(dir).entries)).toEqual(before)
      actor.process.kill('SIGKILL')
      await actor.exit
      const next = await openJsonlSessionLog({ dir, processOwnership })
      try {
        expect(await next.readSince(session(), 0)).toHaveProperty('tail', 1)
      } finally {
        await next.close()
      }
    },
  )
  it.each(['open', 'write', 'datasync', 'close', 'rename', 'sync'])(
    'SIGKILL at clean %s keeps the stopped batch and never unlocks early',
    async stage => {
      const dir = await root()
      const actor = child(dir, `clean:${stage}`)
      await actor.wait('confirmed')
      actor.process.stdin.write('close\n')
      await actor.wait(`clean-${stage}`)
      expect(actor.output()).not.toContain('closed\n')
      if (stage === 'sync')
        expect(await readFile(`${paths(dir).directory}/recovery.json`, 'utf8')).toBe(
          '{"v":1,"state":"clean"}',
        )
      await expect(openJsonlSessionLog({ dir, processOwnership })).rejects.toThrow()
      actor.process.kill('SIGKILL')
      await actor.exit
      const next = await openJsonlSessionLog({ dir, processOwnership })
      try {
        expect(await next.readSince(session(), 0)).toHaveProperty('tail', 2)
      } finally {
        await next.close()
      }
    },
  )
  it('alive after untrusted close stays blocked; actual exit forces zero-byte scan and restores all folds', async () => {
    const dir = await root()
    const seed = await openJsonlSessionLog({ dir, processOwnership })
    await seed.append(session(), [entry('seed')], unfenced, unconditional)
    await seed.close()
    const damaged = (await readFile(paths(dir).index, 'utf8')).replace(
      '"dedupe":["seed"]',
      '"dedupe":[]',
    )
    await writeFile(paths(dir).index, damaged)
    const actor = child(dir, 'untrusted')
    await actor.wait('untrusted')
    actor.process.stdin.write('close\n')
    await actor.wait('closed')
    const alive = await openJsonlSessionLog({ dir, processOwnership })
    try {
      expect(await alive.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
      expect(await alive.readByKey(session(), 'batch')).toEqual({ failure: 'unavailable' })
      expect(await alive.append(session(), [entry('new')], unfenced, unconditional)).toEqual({
        failure: 'unavailable',
      })
    } finally {
      await alive.close()
    }
    actor.process.stdin.write('exit\n')
    await writeFile(`${dir}/untrusted-step.txt`, 'requested actual exit')
    expect(await actor.exit).toEqual({ code: 0, signal: null })
    await writeFile(`${dir}/untrusted-step.txt`, 'observed actual exit')
    const offsets: number[] = []
    const io = {
      ...fileIo,
      async open(path: string, flags: Parameters<typeof fileIo.open>[1]) {
        const file = await fileIo.open(path, flags)
        return path === paths(dir).entries
          ? {
              ...file,
              async read(offset: number, length: number) {
                offsets.push(offset)
                return file.read(offset, length)
              },
            }
          : file
      },
    }
    const next = await openWithIo({ dir, processOwnership }, io)
    try {
      const read = await next.readSince(session(), 0)
      expect(read).toHaveProperty('tail', 3)
      expect(offsets[0]).toBe(0)
      expect(await next.readByKey(session(), 'batch')).toHaveProperty('entries.length', 2)
      expect(await next.append(session(), [entry('seed')], unfenced, unconditional)).toEqual({
        failure: 'alreadyRecorded',
        keys: ['seed'],
      })
      const wrongTenant = parseTenantId({ organization: 'other', account: 'other' })
      if (!isOk(wrongTenant)) throw new Error('tenant fixture')
      expect(
        await next.append(
          session(),
          [{ ...entry('other'), tenant: wrongTenant.ok }],
          unfenced,
          unconditional,
        ),
      ).toEqual({ failure: 'tenantMismatch' })
      const fenced = { kind: 'fenced' as const, run: 'run', attempt: 6 }
      expect(
        await next.append(
          session(),
          [{ ...entry('late'), run: 'run', attempt: 6 }],
          fenced,
          unconditional,
        ),
      ).toEqual({ failure: 'attemptSuperseded' })
    } finally {
      await next.close()
    }
  })
  it('legacy migration requires real exit of all recorded old writers', async () => {
    const dir = await root()
    const actor = child(dir, 'confirmed')
    await actor.wait('confirmed')
    actor.process.kill('SIGKILL')
    await actor.exit
    await rm(`${paths(dir).directory}/recovery.json`)
    const unknown = await openJsonlSessionLog({ dir, processOwnership })
    try {
      expect(await unknown.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
    } finally {
      await unknown.close()
    }
    const migrated = await openJsonlSessionLog({
      dir,
      processOwnership: {
        ...processOwnership,
        async observeLegacyExit() {
          const actual = await actor.exit
          return actual.signal === 'SIGKILL' ? 'exited' : 'unknown'
        },
      },
    })
    try {
      expect(await migrated.readSince(session(), 0)).toHaveProperty('tail', 2)
    } finally {
      await migrated.close()
    }
  })
  it.each(['replace', 'delete', 'both-fail'])(
    'recovered old index is safe before clean through %s branch',
    async branch => {
      const dir = await root()
      const actor = child(dir, 'confirmed')
      await actor.wait('confirmed')
      actor.process.kill('SIGKILL')
      await actor.exit
      const oldIndex = (await readFile(paths(dir).index, 'utf8')).replace(
        '"dedupe":["one","two"]',
        '"dedupe":[]',
      )
      await writeFile(paths(dir).index, oldIndex)
      let writes = 0
      let deletes = 0
      const io = {
        ...fileIo,
        async unlink(path: string) {
          if (path === paths(dir).index) {
            deletes++
            if (branch === 'both-fail') throw new IoFailure('delete-index')
          }
          await fileIo.unlink(path)
        },
        async open(path: string, flags: Parameters<typeof fileIo.open>[1]) {
          const file = await fileIo.open(path, flags)
          if (!path.endsWith('index.tmp')) return file
          return {
            ...file,
            async write(bytes: Uint8Array) {
              writes++
              if (writes === 1 || branch !== 'replace') throw new IoFailure('replace-index')
              return file.write(bytes)
            },
          }
        },
      }
      const next = await openWithIo({ dir, processOwnership }, io)
      expect(await next.readSince(session(), 0)).toHaveProperty('tail', 2)
      expect(await next.append(session(), [entry('one')], unfenced, unconditional)).toHaveProperty(
        'failure',
        'alreadyRecorded',
      )
      if (branch === 'both-fail') {
        await expect(next.close()).rejects.toThrow('close')
        expect(await readFile(`${paths(dir).directory}/recovery.json`, 'utf8')).toContain(
          '"state":"active"',
        )
        await expect(openJsonlSessionLog({ dir, processOwnership })).rejects.toThrow()
      } else {
        await next.close()
        expect(await readFile(`${paths(dir).directory}/recovery.json`, 'utf8')).toBe(
          '{"v":1,"state":"clean"}',
        )
        expect(deletes).toBe(branch === 'delete' ? 1 : 0)
        const reopened = await openJsonlSessionLog({ dir, processOwnership })
        try {
          expect(
            await reopened.append(session(), [entry('one')], unfenced, unconditional),
          ).toHaveProperty('failure', 'alreadyRecorded')
        } finally {
          await reopened.close()
        }
      }
      expect(writes).toBe(2)
    },
  )
  it('real exit recovery owns a paused tail repair: no old snapshot, no early close or unlock', async () => {
    const dir = await root()
    const actor = child(dir, 'half')
    await actor.wait('half-written')
    actor.process.kill('SIGKILL')
    await actor.exit
    const entered = deferred()
    const release = deferred()
    const io = {
      ...fileIo,
      async open(path: string, flags: Parameters<typeof fileIo.open>[1]) {
        const file = await fileIo.open(path, flags)
        return path === paths(dir).entries
          ? {
              ...file,
              async truncate(size: number) {
                entered.resolve()
                await release.promise
                await file.truncate(size)
              },
            }
          : file
      },
    }
    const next = await openWithIo({ dir, processOwnership }, io)
    let answered = false
    let closed = false
    const read = next.readSince(session(), 0).then(result => {
      answered = true
      return result
    })
    await entered.promise
    const closing = next.close().then(() => {
      closed = true
    })
    try {
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(answered).toBe(false)
      expect(closed).toBe(false)
      expect(await readFile(`${paths(dir).directory}/recovery.json`, 'utf8')).toContain(
        '"state":"active"',
      )
      await expect(openJsonlSessionLog({ dir, processOwnership })).rejects.toThrow()
    } finally {
      release.resolve()
    }
    expect(await read).toEqual({ entries: [], tail: 0 })
    await closing
    expect(await readFile(`${paths(dir).directory}/recovery.json`, 'utf8')).toBe(
      '{"v":1,"state":"clean"}',
    )
  })
  it('S26 real kill after three-entry datasync and before delivery recognizes the complete original batch', async () => {
    const dir = await root()
    const actor = child(dir, 'ack-before-delivery')
    await actor.wait('batch-datasync-confirmed')
    expect(actor.output().split('\n')).not.toContain('confirmed')
    actor.process.kill('SIGKILL')
    expect(await actor.exit).toEqual({ code: null, signal: 'SIGKILL' })
    const next = await openJsonlSessionLog({ dir, processOwnership })
    try {
      const read = await next.readByKey(session(), 'batch')
      if ('failure' in read) throw new Error('batch read unavailable')
      expect(read.entries.map(item => item.position)).toEqual([1, 2, 3])
      expect(
        await next.append(
          session(),
          [entry('one'), entry('two'), entry('three')],
          unfenced,
          unconditional,
        ),
      ).toEqual({ failure: 'alreadyRecorded', keys: ['one', 'two', 'three'] })
      expect((await readFile(paths(dir).entries, 'utf8')).trim().split('\n')).toHaveLength(1)
    } finally {
      await next.close()
    }
  })
})
