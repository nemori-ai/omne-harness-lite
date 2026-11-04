import assert from 'node:assert/strict'
import { lstat, readFile, readdir, readlink, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { readToolInvocationRef } from '@omne-harness/tool-contract/provider'
import type { CompletedInvocation, Invocation, ScenarioResult, WindowsAssembly } from './types.ts'

const ORIGINAL = '\uFEFF标题\r\nalpha=旧\r\n结尾'
const EDITED = '\uFEFF标题\r\nalpha=新\r\n结尾'

async function boundedWait<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Files invocation exceeded 30 seconds')), 30_000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function verifyCompletion(invocation: Invocation, completed: CompletedInvocation): string {
  // A v2 reference carries no tenant (R2-D357); the tenant is the invocation's own Access.
  const { call } = readToolInvocationRef(invocation.reference)
  assert.deepEqual(completed.invocation, invocation, 'settle must return the original invocation')
  assert.equal(completed.state.call, call)
  assert.equal(completed.state.phase, 'settled')
  assert.equal(completed.state.terminal.kind, 'completed')
  assert.equal(completed.result.result, completed.state.result)
  assert.equal(completed.result.next, null, 'the complete Files result must be observed')
  assert.equal(completed.delivery.kind, 'result')
  if (completed.delivery.kind !== 'result') throw new Error('Missing original result delivery')
  assert.equal(completed.delivery.key.producer, 'tool')
  assert.equal(completed.delivery.key.reference, invocation.reference)
  assert.equal(completed.delivery.key.result, completed.state.result)
  assert.deepEqual(completed.delivery.consumer, invocation.request.consumer)
  assert.equal(completed.delivery.delivery, completed.result.delivery)
  assert.deepEqual(completed.delivery.value, completed.result.value)
  assert.deepEqual(completed.delivery.terminal, completed.result.terminal)
  assert.deepEqual(completed.delivery.actualTerminal, completed.result.actualTerminal)
  assert.deepEqual(completed.delivery.effect, completed.result.effect)
  assert.deepEqual(completed.delivery.source, completed.result.source)
  assert.equal(completed.delivery.relation, completed.result.relation)
  assert.deepEqual(completed.result.terminal, completed.state.terminal)
  assert.equal(completed.result.relation, 'original')
  assert.ok(completed.state.delivery, 'the original consumer must have saved its delivery')
  assert.equal(completed.state.delivery.kind, 'released')
  assert.equal(completed.state.delivery.delivery, completed.result.delivery)
  assert.deepEqual(completed.state.delivery.consumer, invocation.request.consumer)
  const content = completed.result.value.content
  assert.equal(content.length, 1)
  const block = content[0]
  assert.ok(block && block.kind === 'text', 'Files must deliver its actual text block')
  assert.equal(block.visibility.toModel, true)
  assert.equal(block.text, completed.text, 'the measured text must be the consumer payload')
  return block.text
}

function versionOf(text: string): string {
  const match = /\bversion=("(?:[^"\\]|\\.)*")/u.exec(text)
  assert.ok(match?.[1], 'Files must preserve the observed version')
  const version: unknown = JSON.parse(match[1])
  assert.equal(typeof version, 'string')
  if (typeof version !== 'string') throw new Error('Files returned a non-text version')
  assert.notEqual(version, '')
  return version
}

function readBody(text: string, expected: string): string {
  assert.match(text, /^done request=/u)
  const bytes = Buffer.byteLength(expected, 'utf8')
  const metadata = new RegExp(`\noffset_bytes=0 next_offset_bytes=${bytes} eof=true\n`, 'u')
  const match = metadata.exec(text)
  assert.ok(match, 'Files read must report the complete UTF-8 page')
  const body = text.slice(match.index + match[0].length)
  assert.deepEqual(Buffer.from(body, 'utf8'), Buffer.from(expected, 'utf8'))
  return versionOf(text)
}

async function snapshot(root: string) {
  const entries: unknown[] = []
  async function visit(path: string): Promise<void> {
    const stat = await lstat(path, { bigint: true })
    const type = stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'directory' : 'file'
    entries.push({
      path: relative(root, path).replaceAll('\\', '/'),
      type,
      dev: String(stat.dev),
      ino: String(stat.ino),
      nlink: String(stat.nlink),
      mode: String(stat.mode),
      size: String(stat.size),
      modified: String(stat.mtimeNs),
      changed: String(stat.ctimeNs),
      bytes: type === 'file' ? (await readFile(path)).toString('base64') : null,
      target: type === 'link' ? await readlink(path) : null,
    })
    if (type === 'directory') {
      for (const name of (await readdir(path)).sort()) await visit(join(path, name))
    }
  }
  await visit(root)
  return entries
}

function verifyTruncation(text: string, input: string, maximum: number) {
  assert.ok(Buffer.byteLength(text, 'utf8') <= maximum, 'complete consumer text exceeds its budget')
  assert.match(text, /^done request=/u)
  const page = /\noffset_bytes=0 next_offset_bytes=(\d+) eof=true\n/u.exec(text)
  assert.ok(page, 'bounded read must retain the real page metadata')
  assert.equal(Number(page[1]), Buffer.byteLength(input, 'utf8'))
  const original = Buffer.from(text.slice(0, page.index + page[0].length) + input, 'utf8')
  assert.ok(original.byteLength > maximum)
  const marker = /\n\[tool truncated bytes (\d+)\.\.(\d+) of (\d+)\]\n/u.exec(text)
  assert.ok(marker, 'an oversized Files result must report its omitted byte interval')
  const start = Number(marker[1])
  const end = Number(marker[2])
  const total = Number(marker[3])
  assert.equal(total, original.byteLength)
  assert.ok(start > 0 && end > start && end < total)
  assert.deepEqual(Buffer.from(text.slice(0, marker.index), 'utf8'), original.subarray(0, start))
  assert.deepEqual(
    Buffer.from(text.slice(marker.index + marker[0].length), 'utf8'),
    original.subarray(end),
  )
  assert.ok(text.includes('预算首段') && text.endsWith('预算尾段'))
  return { maximum, bytes: Buffer.byteLength(text, 'utf8'), omitted: { start, end, total } }
}

export async function runFilesScenario(assembly: WindowsAssembly): Promise<ScenarioResult> {
  const checks: Record<string, boolean> = {}
  const invocations: Invocation[] = []
  const path = join(assembly.workspace, 'files-roundtrip.txt')
  const decoy = join(assembly.outside, 'files-external-decoy.txt')
  const originalBytes = Buffer.from(ORIGINAL, 'utf8')
  const editedBytes = Buffer.from(EDITED, 'utf8')
  const observeBytes = async (event: string, expected: Buffer) => {
    const actual = await readFile(path)
    await assembly.record(event, {
      path,
      expected: expected.toString('hex'),
      actual: actual.toString('hex'),
    })
    assert.deepEqual(actual, expected, 'Files must preserve the complete disk bytes')
  }
  const invoke = async (command: string, args: Readonly<Record<string, unknown>>) => {
    const invocation = await boundedWait(assembly.invoke('Files', command, args))
    invocations.push(invocation)
    await assembly.record('files.invoked', { command, args, invocation })
    assert.equal(invocation.request.command, command)
    assert.deepEqual(JSON.parse(invocation.request.arguments.effective), args)
    const completed = await boundedWait(assembly.settle(invocation))
    await assembly.record('files.completed', completed)
    const text = verifyCompletion(invocation, completed)
    assert.ok(Buffer.byteLength(text, 'utf8') <= assembly.resultMaxBytes)
    return text
  }
  try {
    assert.equal(process.platform, 'win32', 'this scenario requires the real Windows assembly')
    assert.ok(Number.isSafeInteger(assembly.resultMaxBytes) && assembly.resultMaxBytes >= 4096)
    await writeFile(decoy, '\uFEFF外部诱饵\r\n不得改变')
    await assembly.record('files.input', {
      path,
      original: ORIGINAL,
      edited: EDITED,
      originalHex: originalBytes.toString('hex'),
      editedHex: editedBytes.toString('hex'),
      maximum: assembly.resultMaxBytes,
    })
    const write = await invoke('write', { path, text: ORIGINAL, mode: 'create' })
    assert.match(write, /^done request=/u)
    await observeBytes('files.written-bytes', originalBytes)
    checks['write-complete-bytes'] = true

    const read = await invoke('read', {
      path,
      offset_bytes: 0,
      limit_bytes: originalBytes.byteLength,
    })
    const originalVersion = readBody(read, ORIGINAL)
    assert.equal(originalVersion, versionOf(write))
    checks['read-bom-crlf-no-final-newline'] = true

    const edit = await invoke('edit', { path, old_text: '旧', new_text: '新' })
    assert.match(edit, /^done request=/u)
    assert.ok(edit.includes(`--- ${path} version=${JSON.stringify(originalVersion)}\n`))
    assert.ok(edit.includes('applied diff\n'))
    assert.ok(edit.includes('-alpha=旧\r\n') && edit.includes('+alpha=新\r\n'))
    assert.ok(edit.includes('\\ No newline at end of file\n'))
    await observeBytes('files.edited-bytes', editedBytes)
    const editedRead = await invoke('read', {
      path,
      offset_bytes: 0,
      limit_bytes: editedBytes.byteLength,
    })
    const editedVersion = readBody(editedRead, EDITED)
    assert.equal(editedVersion, versionOf(edit))
    assert.notEqual(editedVersion, originalVersion)
    checks['exact-edit-preserves-other-bytes'] = true

    const beforeStale = {
      workspace: await snapshot(assembly.workspace),
      outside: await snapshot(assembly.outside),
    }
    const stale = await invoke('write', {
      path,
      text: 'stale write must not appear',
      mode: 'replace',
      expected_version: originalVersion,
    })
    assert.match(stale, /^rejected request=.* reason=conflict$/u)
    const afterStale = {
      workspace: await snapshot(assembly.workspace),
      outside: await snapshot(assembly.outside),
    }
    await assembly.record('files.stale-version', {
      originalVersion,
      editedVersion,
      before: beforeStale,
      after: afterStale,
      text: stale,
    })
    assert.deepEqual(afterStale, beforeStale)
    await observeBytes('files.after-stale-bytes', editedBytes)
    checks['stale-version-zero-effects'] = true

    for (const deniedPath of [decoy, relative(assembly.workspace, decoy)]) {
      const before = {
        workspace: await snapshot(assembly.workspace),
        outside: await snapshot(assembly.outside),
      }
      const denied = await invoke('write', {
        path: deniedPath,
        text: 'escape must not appear',
        mode: 'replace',
      })
      const after = {
        workspace: await snapshot(assembly.workspace),
        outside: await snapshot(assembly.outside),
      }
      await assembly.record('files.denied-path', { path: deniedPath, before, after, text: denied })
      assert.match(denied, /^rejected request=.* reason=notAuthorized$/u)
      assert.deepEqual(after, before, 'denied Files requests must not alter either complete tree')
    }
    checks['absolute-and-parent-escape-zero-effects'] = true

    const budgetPath = join(assembly.workspace, 'files-budget.txt')
    const budgetInput = `预算首段\n${'中文🙂'.repeat(assembly.resultMaxBytes)}\n预算尾段`
    assert.match(
      await invoke('write', { path: budgetPath, text: budgetInput, mode: 'create' }),
      /^done request=/u,
    )
    const budgetRead = await invoke('read', {
      path: budgetPath,
      offset_bytes: 0,
      limit_bytes: Buffer.byteLength(budgetInput, 'utf8'),
    })
    const budget = verifyTruncation(budgetRead, budgetInput, assembly.resultMaxBytes)
    const budgetDisk = await readFile(budgetPath)
    await assembly.record('files.budget', {
      path: budgetPath,
      input: budgetInput,
      actualDisk: budgetDisk.toString('base64'),
      text: budgetRead,
      ...budget,
    })
    assert.deepEqual(budgetDisk, Buffer.from(budgetInput, 'utf8'))
    checks['consumer-utf8-budget-head-tail-interval'] = true

    const acquisitions = assembly
      .acquisitions()
      .filter(item =>
        invocations.some(
          invocation => readToolInvocationRef(invocation.reference).call === item.call,
        ),
      )
    await assembly.record('files.acquisitions', acquisitions)
    const owners = new Map<string, string>()
    for (const invocation of invocations) {
      const call = readToolInvocationRef(invocation.reference).call
      const own = acquisitions.filter(item => item.call === call)
      assert.ok(own.length > 0, `Missing actual acquisition for ${call}`)
      for (const item of own) {
        assert.ok(item.origin && item.preparation && item.acquisition && item.sessionScope)
        assert.equal(item.sessionScope, invocation.request.requesterScope.ref)
        for (const identity of [
          `origin:${item.origin}`,
          `preparation:${item.preparation}`,
          `acquisition:${item.acquisition}`,
        ]) {
          const owner = owners.get(identity)
          assert.ok(
            owner === undefined || owner === call,
            'another Files call reused an old acquisition or origin',
          )
          owners.set(identity, call)
        }
      }
    }
    assert.equal(new Set(invocations.map(item => item.reference)).size, invocations.length)
    assert.equal(new Set(acquisitions.map(item => item.sessionScope)).size, 1)
    checks['original-call-delivery-and-fresh-acquisition'] = true
    return {
      checks,
      observations: {
        invocations,
        acquisitions,
        budget,
        coldEnumeration: 'not-verified-known-resources-only',
        cleanupOwner: 'runner-finally',
      },
    }
  } catch (error) {
    await assembly.record('files.failure', {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : String(error),
      checks,
      invocations,
      knownResources: assembly.resources(),
    })
    throw error
  } finally {
    await assembly.record('files.resources-before-runner-cleanup', {
      knownResources: assembly.resources(),
      acquisitions: assembly.acquisitions(),
      coldEnumeration: 'not-verified-known-resources-only',
      cleanupOwner: 'runner-finally',
    })
  }
}
