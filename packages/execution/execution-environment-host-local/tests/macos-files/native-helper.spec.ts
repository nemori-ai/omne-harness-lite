// @module-tag slow
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { macosFilesSource } from '../../src/macos-files/native-source.ts'

type Reply = {
  failure?: string
  info?: { token: string; version: string; type: string }
  bytes?: string
  entries?: { name: string }[]
  next?: number
  hits?: { path: string; offsetBytes: number }[]
  truncated?: boolean
}
type Event = { fn: string; paths: string[] }
const token = (path: string) => {
  const value = lstatSync(path, { bigint: true })
  return `${value.dev}:${value.ino}`
}
const version = (path: string) => {
  const value = statSync(path, { bigint: true })
  return `${value.mtimeMs}:${value.size}`
}

describe('macOS native files protocol', () => {
  let work: string
  let root: string
  let executable: string
  beforeAll(() => {
    if (process.platform !== 'darwin') return
    work = realpathSync(mkdtempSync(join(tmpdir(), 'omne-native-compile-')))
    const source = join(work, 'helper.c')
    executable = join(work, 'helper')
    writeFileSync(source, macosFilesSource)
    execFileSync('/usr/bin/cc', [
      '-std=c11',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-DOMNE_FILES_TESTING',
      '-o',
      executable,
      source,
    ])
    execFileSync('/usr/bin/cc', [
      '-std=c11',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-o',
      join(work, 'production'),
      source,
    ])
  })
  afterAll(() => {
    if (work !== undefined) rmSync(work, { recursive: true, force: true })
  })
  beforeEach(({ skip }) => {
    skip(process.platform !== 'darwin')
    root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-native-fixture-')))
  })
  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true })
  })

  const query = (
    operation: string,
    segments: string[],
    extra: Record<string, unknown> = {},
    hook?: (event: Event) => number,
  ): Promise<Reply> => {
    const path = join(root, ...segments)
    const input = {
      operation,
      root,
      expectedRoot: token(root),
      rooted: true,
      segments,
      path,
      named: existsSync(path) ? token(path) : token(root),
      offset: 0,
      limit: -1,
      ...extra,
    }
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'] })
      const events = child.stdio[3]
      const replies = child.stdio[4]
      if (!events || !replies || !('readable' in events) || !('write' in replies))
        throw new Error('test pipes unavailable')
      const lines = createInterface({ input: events })
      lines.on('line', text => {
        try {
          replies.write(`${hook?.(JSON.parse(text) as Event) ?? 0}\n`)
        } catch (error) {
          child.kill()
          reject(error)
        }
      })
      let output = '',
        errors = ''
      child.stdout.on('data', chunk => {
        output += String(chunk)
      })
      child.stderr.on('data', chunk => {
        errors += String(chunk)
      })
      child.on('error', reject)
      child.on('close', code => {
        lines.close()
        if (code !== 0) reject(new Error(`helper exit ${code}: ${errors}`))
        else {
          try {
            const reply = JSON.parse(output) as Reply
            if (!reply.failure) {
              expect(reply.bytes).toBeTypeOf('string')
              expect(reply.entries).toBeInstanceOf(Array)
              expect(reply.hits).toBeInstanceOf(Array)
              expect(reply.next).toBeTypeOf('number')
              expect(reply.truncated).toBeTypeOf('boolean')
            }
            resolve(reply)
          } catch (error) {
            reject(error)
          }
        }
      })
      child.stdin.end(JSON.stringify(input))
    })
  }
  const destination = (name: string, replace = false) => ({
    targetRoot: root,
    expectedTargetRoot: token(root),
    targetSegments: [name],
    targetNamed: existsSync(join(root, name)) ? token(join(root, name)) : token(root),
    replace,
  })

  it('reads byte ranges and matches the Node bigint version exactly', async () => {
    const path = join(root, 'unicode')
    writeFileSync(path, 'hello 世界')
    const read = await query('read', ['unicode'], { offset: 6, limit: 3 })
    expect(Buffer.from(read.bytes ?? '', 'base64').toString()).toBe('世')
    expect(read.info?.version).toBe(version(path))
    expect(read.next).toBe(9)
    expect((await query('stat', ['unicode'])).info?.token).toBe(token(path))
    expect((await query('write', ['unicode'], { bytes: 'eA==', version: 'stale' })).failure).toBe(
      'conflict',
    )
    expect(readFileSync(path, 'utf8')).toBe('hello 世界')
  })
  it('rejects final links, intermediate links, hard-linked content and changed root identity', async () => {
    writeFileSync(join(root, 'file'), 'untouched')
    symlinkSync('file', join(root, 'link'))
    expect((await query('read', ['link'])).failure).toBe('unsupported')
    mkdirSync(join(root, 'directory'))
    symlinkSync('directory', join(root, 'alias'))
    expect((await query('read', ['alias', 'absent'])).failure).toBe('notAuthorized')
    linkSync(join(root, 'file'), join(root, 'hard'))
    expect((await query('write', ['file'], { bytes: 'eA==' })).failure).toBe('notAuthorized')
    expect((await query('copy', ['file'], destination('copy'))).failure).toBe('notAuthorized')
    expect((await query('read', ['file'], { expectedRoot: '0:0' })).failure).toBe('notAuthorized')
    expect(readFileSync(join(root, 'file'), 'utf8')).toBe('untouched')
  })
  it('creates in the held parent after its name becomes a symlink', async () => {
    mkdirSync(join(root, 'parent'))
    mkdirSync(join(root, 'outside'))
    const named = token(join(root, 'parent'))
    let swapped = false
    const result = await query(
      'write',
      ['parent', 'new'],
      { create: true, named, bytes: 'bmV3' },
      event => {
        if (!swapped && event.fn === 'open' && event.paths[0]?.endsWith('/new')) {
          swapped = true
          renameSync(join(root, 'parent'), join(root, 'held'))
          symlinkSync('outside', join(root, 'parent'))
        }
        return 0
      },
    )
    expect(result.failure).toBeUndefined()
    expect(swapped).toBe(true)
    expect(readFileSync(join(root, 'held', 'new'), 'utf8')).toBe('new')
    expect(existsSync(join(root, 'outside', 'new'))).toBe(false)
  })
  it('skips invalid UTF-8 names in lists and refuses recursive deletion before any effect', async ({
    skip,
  }) => {
    mkdirSync(join(root, 'tree'))
    writeFileSync(join(root, 'tree', 'safe'), 'keep')
    const invalid = Buffer.concat([Buffer.from(join(root, 'tree') + '/'), Buffer.from([0xff])])
    try {
      writeFileSync(invalid, 'keep')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EILSEQ') {
        skip('the mounted filesystem rejects invalid UTF-8 names')
        return
      }
      throw error
    }
    expect(
      (await query('list', ['tree'], { limit: 100 })).entries?.map(entry => entry.name),
    ).toEqual(['safe'])
    expect((await query('remove', ['tree'], { recursive: true })).failure).toBe('unsupported')
    expect(readFileSync(join(root, 'tree', 'safe'), 'utf8')).toBe('keep')
    expect(readFileSync(invalid, 'utf8')).toBe('keep')
  })
  it('searches in byte order with depth first traversal and reports budgets', async () => {
    mkdirSync(join(root, 'a'))
    writeFileSync(join(root, 'a', 'match'), 'xx needle')
    writeFileSync(join(root, 'b-match'), 'needle')
    const common = {
      pattern: Buffer.from('match').toString('base64'),
      recursive: true,
      limit: 10,
      entryBudget: 10,
      byteBudget: 100,
      fileBytes: 100,
    }
    expect((await query('search', [], common)).hits?.map(hit => hit.path)).toEqual([
      join(root, 'a', 'match'),
      join(root, 'b-match'),
    ])
    expect(
      (
        await query('search', [], {
          ...common,
          pattern: Buffer.from('needle').toString('base64'),
          content: true,
        })
      ).hits?.map(hit => hit.offsetBytes),
    ).toEqual([3, 0])
    expect((await query('search', [], { ...common, entryBudget: 1 })).truncated).toBe(true)
  })
  it('reports unknown after partial mkdir, remove and move effects', async () => {
    const mkdir = await query('mkdir', ['one', 'two'], { recursive: true }, event =>
      event.fn === 'mkdir' && event.paths[0]?.endsWith('/two') ? 13 : 0,
    )
    expect(mkdir.failure).toBe('unknown')
    expect(existsSync(join(root, 'one'))).toBe(true)
    writeFileSync(join(root, 'one', 'a'), 'a')
    writeFileSync(join(root, 'one', 'b'), 'b')
    const remove = await query('remove', ['one'], { recursive: true }, event =>
      event.fn === 'unlink' && event.paths[0]?.endsWith('/b') ? 13 : 0,
    )
    expect(remove.failure).toBe('unknown')
    expect(existsSync(join(root, 'one', 'a'))).toBe(false)
    writeFileSync(join(root, 'source'), 'source')
    const move = await query('move', ['source'], destination('target'), event =>
      event.fn === 'unlink' ? 13 : 0,
    )
    expect(move.failure).toBe('unknown')
    expect(token(join(root, 'source'))).toBe(token(join(root, 'target')))
  })
  it('replaces copies with new inodes and cleans failed temporary writes', async () => {
    writeFileSync(join(root, 'source'), 'new')
    writeFileSync(join(root, 'target'), 'old')
    const original = token(join(root, 'target'))
    const failure = await query('copy', ['source'], destination('target', true), event =>
      event.fn === 'write' ? 13 : 0,
    )
    expect(failure.failure).toBe('notAuthorized')
    expect(readFileSync(join(root, 'target'), 'utf8')).toBe('old')
    expect((await query('list', [], { limit: 100 })).entries?.map(entry => entry.name)).toEqual([
      'source',
      'target',
    ])
    expect((await query('copy', ['source'], destination('target', true))).failure).toBeUndefined()
    expect(token(join(root, 'target'))).not.toBe(original)
    expect(readFileSync(join(root, 'target'), 'utf8')).toBe('new')
  })
  type BatchEvent = {
    event?: string
    kind?: string
    reason?: string
    index?: number
    failure?: string
    cleaned?: boolean
    cleanupError?: { temp: string; code: string }
  }
  const batchEntry = (name: string, replace = false) => ({
    root,
    expectedRoot: token(root),
    segments: [name],
    path: join(root, name),
    named: token(replace ? join(root, name) : root),
    version: replace ? version(join(root, name)) : null,
    bytes: Buffer.from(`new ${name}`).toString('base64'),
    temp: `.omne-batch-test-${name}`,
  })
  const batchQuery = (
    entries: ReturnType<typeof batchEntry>[],
    ack: (event: BatchEvent) => string = () => 'continue',
    fault: (event: Event) => number = () => 0,
  ): Promise<BatchEvent[]> =>
    new Promise((resolve, reject) => {
      const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'] })
      const events = child.stdio[3],
        replies = child.stdio[4]
      if (!events || !replies || !('readable' in events) || !('write' in replies))
        throw new Error('test pipes unavailable')
      const syscalls = createInterface({ input: events })
      syscalls.on('line', text => {
        try {
          replies.write(`${fault(JSON.parse(text) as Event)}\n`)
        } catch (error) {
          child.kill()
          reject(error)
        }
      })
      const result: BatchEvent[] = []
      const lines = createInterface({ input: child.stdout })
      lines.on('line', text => {
        try {
          const event = JSON.parse(text) as BatchEvent
          result.push(event)
          if (event.event && event.event !== 'result' && event.event !== 'stageFailure')
            child.stdin.write(`${ack(event)}\n`)
        } catch (error) {
          child.kill()
          reject(error)
        }
      })
      child.on('error', reject)
      child.on('close', code => {
        lines.close()
        syscalls.close()
        if (code === 0) resolve(result)
        else reject(new Error(`batch exit ${code}`))
      })
      child.stdin.write(`${JSON.stringify({ operation: 'batch', rooted: true, entries })}\n`)
    })

  it('publishes a batch only through acknowledged events and stops before the next sealed publication', async () => {
    const result = await batchQuery([batchEntry('first'), batchEntry('second')], event =>
      event.event === 'beforePublish' && event.index === 1 ? 'closed' : 'continue',
    )
    expect(result.map(event => event.event)).toEqual([
      'checked',
      'staged',
      'beforePublish',
      'published',
      'beforePublish',
      'result',
    ])
    expect(result.at(-1)).toEqual({ event: 'result', kind: 'unknown', reason: 'closed' })
    expect(readFileSync(join(root, 'first'), 'utf8')).toBe('new first')
    expect(existsSync(join(root, 'second'))).toBe(false)
    expect((await query('list', [], { limit: 100 })).entries?.map(entry => entry.name)).toEqual([
      'first',
    ])
  })
  it('keeps all batch parents fixed after checked even when their names move', async () => {
    mkdirSync(join(root, 'parent'))
    mkdirSync(join(root, 'outside'))
    const entries = ['a', 'b'].map(name => ({
      ...batchEntry(name),
      segments: ['parent', name],
      named: token(join(root, 'parent')),
    }))
    const result = await batchQuery(entries, event => {
      if (event.event === 'checked') {
        renameSync(join(root, 'parent'), join(root, 'held'))
        symlinkSync('outside', join(root, 'parent'))
      }
      return 'continue'
    })
    expect(result.at(-1)).toEqual({ event: 'result', kind: 'committed' })
    expect(readFileSync(join(root, 'held', 'a'), 'utf8')).toBe('new a')
    expect(readFileSync(join(root, 'held', 'b'), 'utf8')).toBe('new b')
    expect(existsSync(join(root, 'outside', 'a'))).toBe(false)
  })
  it('cleans a staging write failure before reporting it and reports cleanup failure honestly', async () => {
    const clean = await batchQuery([batchEntry('target')], undefined, event =>
      event.fn === 'write' ? 13 : 0,
    )
    expect(clean.at(-1)).toEqual({ event: 'stageFailure', failure: 'notAuthorized', cleaned: true })
    expect((await query('list', [], { limit: 100 })).entries).toEqual([])
    const unclean = await batchQuery([batchEntry('target')], undefined, event =>
      event.fn === 'write' || event.fn === 'unlink' ? 13 : 0,
    )
    expect(unclean.at(-1)).toEqual({
      event: 'stageFailure',
      failure: 'notAuthorized',
      cleaned: false,
    })
    expect(existsSync(join(root, 'target'))).toBe(false)
    expect(existsSync(join(root, '.omne-batch-test-target'))).toBe(true)
  })
  it('reports a publication despite temporary unlink failure and waits for the receipt ack', async () => {
    const result = await batchQuery([batchEntry('target')], undefined, event =>
      event.fn === 'unlink' ? 13 : 0,
    )
    expect(result.find(event => event.event === 'published')).toEqual({
      event: 'published',
      index: 0,
      cleanupError: { temp: '.omne-batch-test-target', code: 'EACCES' },
    })
    expect(result.at(-1)).toEqual({ event: 'result', kind: 'committed' })
    expect(token(join(root, 'target'))).toBe(token(join(root, '.omne-batch-test-target')))
  })
})
