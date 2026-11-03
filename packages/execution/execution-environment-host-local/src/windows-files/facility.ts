import { spawn } from 'node:child_process'
import { access, lstat, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import type {
  FileIdentity,
  FileInformation,
  FileRequest,
  FileSystemFacility,
  HandleGeneration,
  ObjectToken,
  ProviderFacts,
} from '@omne-harness/execution-environment-contract'
import type { HostFilesLimits } from '../host-file-tree.ts'
import {
  fail,
  failed,
  mapped,
  ok,
  openCodes,
  reject,
  unknown,
  type Failure,
  type Outcome,
} from '../host-paths.ts'
import { nativeSource } from './native-source.ts'
import { nativeTree } from './native-tree.ts'
import { nativeWrite } from './native-write.ts'

type Metadata = Readonly<{
  token: string
  version: string
  size: number
  modified: number
  type: FileInformation['type']
  name: string
}>
type Reply = Readonly<{ info: Metadata; bytes: string; entries: readonly Metadata[]; next: number }>
type SearchReply = Reply &
  Readonly<{
    hits: readonly { path: string; token: string; offsetBytes: number }[]
    truncated: boolean
    eof: boolean
  }>

function hit(value: unknown): SearchReply['hits'][number] {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('path' in value) ||
    typeof value.path !== 'string' ||
    !('token' in value) ||
    typeof value.token !== 'string' ||
    !('offsetBytes' in value) ||
    typeof value.offsetBytes !== 'number'
  )
    throw new Error('invalid native hit')
  return { path: value.path, token: value.token, offsetBytes: value.offsetBytes }
}

function metadata(value: unknown): Metadata {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('token' in value) ||
    typeof value.token !== 'string' ||
    !('version' in value) ||
    typeof value.version !== 'string' ||
    !('size' in value) ||
    typeof value.size !== 'number' ||
    !('modified' in value) ||
    typeof value.modified !== 'number' ||
    !('type' in value) ||
    (value.type !== 'file' && value.type !== 'directory' && value.type !== 'symlink') ||
    !('name' in value) ||
    typeof value.name !== 'string'
  )
    throw new Error('invalid native metadata')
  return {
    token: value.token,
    version: value.version,
    size: value.size,
    modified: value.modified,
    type: value.type,
    name: value.name,
  }
}

function reply(value: unknown): SearchReply | Failure {
  if (value === null || typeof value !== 'object') return 'unknown'
  if ('failure' in value) {
    switch (value.failure) {
      case 'notAuthorized':
      case 'unresolved':
      case 'unsupported':
      case 'busy':
      case 'invalidInput':
      case 'conflict':
      case 'unavailable':
        return value.failure
      default:
        return 'unknown'
    }
  }
  if (
    !('info' in value) ||
    !('bytes' in value) ||
    typeof value.bytes !== 'string' ||
    !('entries' in value) ||
    !Array.isArray(value.entries) ||
    !('next' in value) ||
    typeof value.next !== 'number'
  )
    return 'unknown'
  const hits = 'hits' in value && Array.isArray(value.hits) ? value.hits.map(hit) : []
  const truncated = 'truncated' in value && value.truncated === true
  return {
    info: metadata(value.info),
    bytes: value.bytes,
    entries: value.entries.map(metadata),
    next: value.next,
    hits,
    truncated,
    eof: 'eof' in value && value.eof === true,
  }
}

const script = String.raw`
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
try {
  $request=[Console]::In.ReadToEnd() | ConvertFrom-Json
  Add-Type -TypeDefinition $request.source
  if($request.operation -eq 'write') {
    $result=[OmneFiles]::Write($request.root,$request.expectedRoot,[string[]]$request.segments,$request.named,$request.version,($null -ne $request.version),[bool]$request.trailingSlash,[bool]$request.create,$request.bytes)
  } elseif($request.operation -in @('mkdir','remove','move')) {
    $result=[OmneFiles]::Change($request.root,$request.expectedRoot,[string[]]$request.segments,$request.named,$request.operation,[bool]$request.recursive,$request.version,($null -ne $request.version),$request.targetRoot,$request.expectedTargetRoot,[string[]]$request.targetSegments,$request.targetNamed,[bool]$request.replace)
  } else {
    $result=[OmneFiles]::Run($request.root,$request.expectedRoot,[string[]]$request.segments,$request.named,$request.operation,[long]$request.offset,[long]$request.limit,$request.pattern,[bool]$request.content,[bool]$request.recursive,[long]$request.entryBudget,[long]$request.byteBudget,[long]$request.fileBytes,$request.path,[bool]$request.rooted)
  }
  [Console]::WriteLine(($result | ConvertTo-Json -Depth 8 -Compress))
} catch {
  $errorObject=$_.Exception
  while($errorObject.InnerException) { $errorObject=$errorObject.InnerException }
  [Console]::WriteLine((@{ failure=$errorObject.Message } | ConvertTo-Json -Compress))
}
`

type NativeInput = Readonly<{
  root: string
  expectedRoot: string
  segments: readonly string[]
  named: string
  operation: 'read' | 'stat' | 'list' | 'search'
  offset: number
  limit: number
  pattern: string
  content: boolean
  recursive: boolean
  entryBudget: number
  byteBudget: number
  fileBytes: number
  path: string
  rooted: boolean
}>
type ChangeInput = Readonly<{
  root: string
  expectedRoot: string
  segments: readonly string[]
  named: string
  operation: 'mkdir' | 'remove' | 'move'
  recursive: boolean
  version: string | null
  targetRoot: string
  expectedTargetRoot: string
  targetSegments: readonly string[]
  targetNamed: string
  replace: boolean
}>

type WriteInput = Pick<NativeInput, 'root' | 'expectedRoot' | 'segments' | 'named'> &
  Readonly<{
    operation: 'write'
    version: string | null
    trailingSlash: boolean
    create: boolean
    bytes: string
  }>

function invoke(
  input: NativeInput | ChangeInput | WriteInput,
  timeout?: number,
): Promise<SearchReply | Failure> {
  return new Promise(resolve => {
    const child = spawn(
      win32.join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(timeout === undefined ? {} : { timeout }),
      },
    )
    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.resume()
    child.stdin.on('error', () => undefined)
    child.on('error', () => resolve('unavailable'))
    child.on('close', code => {
      if (code !== 0) return resolve('unknown')
      try {
        resolve(reply(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
      } catch {
        resolve('unknown')
      }
    })
    child.stdin.end(JSON.stringify({ ...input, source: nativeSource + nativeTree + nativeWrite }))
  })
}

/** Checks handle-relative creation, reading, enumeration and removal in an owned temporary directory. */
export async function probeWindowsFilesPrerequisite(
  directory = tmpdir(),
): Promise<ProviderFacts['prerequisites']> {
  if (process.platform !== 'win32') return 'unsatisfied'
  try {
    await access(
      win32.join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
    )
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? 'unsatisfied'
      : 'unknown'
  }
  let made: string
  try {
    made = await mkdtemp(win32.join(directory, 'omne-files-probe-'))
  } catch {
    return 'unknown'
  }
  let reading: ProviderFacts['prerequisites'] = 'unknown'
  try {
    const root = await realpath(made)
    const info = await lstat(root, { bigint: true })
    const expectedRoot = `${info.dev}:${info.ino}`
    reading = await probeWindowsDirectory(root, expectedRoot)
  } catch {
    reading = 'unknown'
  } finally {
    try {
      await rm(made, { recursive: true, force: true })
    } catch {
      reading = 'unknown'
    }
  }
  return reading
}

async function probeWindowsDirectory(
  root: string,
  expectedRoot: string,
): Promise<ProviderFacts['prerequisites']> {
  const bytes = Buffer.from('omne-file-probe').toString('base64')
  const endpoint = { root, expectedRoot, segments: ['probe'], named: expectedRoot }
  const created = await invoke(
    { ...endpoint, operation: 'write', create: true, version: null, trailingSlash: false, bytes },
    10_000,
  )
  if (typeof created === 'string') return created === 'unsupported' ? 'unsatisfied' : 'unknown'
  const query: NativeInput = {
    ...endpoint,
    named: created.info.token,
    operation: 'read',
    offset: 0,
    limit: 64,
    pattern: '',
    content: false,
    recursive: false,
    entryBudget: 4,
    byteBudget: 64,
    fileBytes: 64,
    path: win32.join(root, 'probe'),
    rooted: true,
  }
  const read = await invoke(query, 10_000)
  if (typeof read === 'string' || read.bytes !== bytes) return 'unknown'
  const listed = await invoke(
    { ...query, operation: 'list', segments: [], named: expectedRoot, path: root },
    10_000,
  )
  if (
    typeof listed === 'string' ||
    listed.entries.length !== 1 ||
    listed.entries[0]?.name !== 'probe' ||
    listed.entries[0].token !== created.info.token
  )
    return 'unknown'
  const removed = await invoke(
    {
      ...endpoint,
      named: created.info.token,
      operation: 'remove',
      recursive: false,
      version: null,
      targetRoot: root,
      expectedTargetRoot: expectedRoot,
      targetSegments: [],
      targetNamed: '',
      replace: false,
    },
    10_000,
  )
  if (typeof removed === 'string') return 'unknown'
  try {
    await lstat(win32.join(root, 'probe'))
    return 'unknown'
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? 'satisfied'
      : 'unknown'
  }
}

/** Reject special namespaces, alternate streams, ambiguous names, and upward traversal before IO. */
export function windowsSegments(root: string, path: string): readonly string[] | undefined {
  if (!/^[a-z]:[\\/]/iu.test(path) || path.includes('\0')) return undefined
  const split = (value: string) => value.replaceAll('/', '\\').split('\\').filter(Boolean)
  const base = split(root),
    parts = split(path)
  if (
    parts.some(
      (part, index) =>
        part === '..' ||
        (index > 0 &&
          (part.includes(':') ||
            /[. ]$/u.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))),
    )
  )
    return undefined
  if (base.some((part, index) => part.toLowerCase() !== parts[index]?.toLowerCase()))
    return undefined
  return parts.slice(base.length)
}

function snapshot<R extends FileRequest<unknown>>(request: R): R {
  return {
    ...request,
    named: request.named === null ? null : { ...request.named },
    binding: { ...request.binding },
  }
}

/** One engine binds one root identity. Failed binding remains retryable without replacing a known root. */
export function createWindowsRootIdentity(root: string): () => Promise<string | undefined> {
  let binding: Promise<string | undefined> | undefined
  return async () => {
    binding ??= lstat(root, { bigint: true }).then(
      info => `${info.dev}:${info.ino}`,
      () => undefined,
    )
    const pending = binding
    const found = await pending
    if (found === undefined && binding === pending) binding = undefined
    return found
  }
}

export function createWindowsFiles(
  options: Readonly<{
    root?: string
    rootIdentity?: () => Promise<string | undefined>
    limits: HostFilesLimits
    issue(object: ObjectToken): HandleGeneration
  }>,
): Pick<
  FileSystemFacility<unknown>,
  'read' | 'stat' | 'list' | 'search' | 'mkdir' | 'remove' | 'move' | 'write' | 'copy'
> {
  const rootIdentity = options.rootIdentity
  const identity = (info: Metadata): FileIdentity => {
    const object = { token: info.token }
    return { object, version: info.version, handle: options.issue(object) }
  }
  const information = (info: Metadata): FileInformation => ({
    ...identity(info),
    type: info.type,
    sizeBytes: info.size,
    modifiedMs: info.modified,
  })
  const rootToken = async (root: string): Promise<Outcome<string>> => {
    if (rootIdentity !== undefined) {
      const token = await rootIdentity()
      return token === undefined ? fail('unavailable') : ok(token)
    }
    try {
      const info = await lstat(root, { bigint: true })
      return ok(`${info.dev}:${info.ino}`)
    } catch (error) {
      return fail(mapped(openCodes, error) ?? 'unknown')
    }
  }
  const endpoint = async (
    path: string,
    parents = false,
  ): Promise<Outcome<Pick<NativeInput, 'root' | 'expectedRoot' | 'segments'>>> => {
    let root = options.root ?? win32.dirname(path)
    if (options.root === undefined && parents) {
      for (;;) {
        const found = await rootToken(root)
        if (found.ok) break
        if (found.failure !== 'unresolved') return found
        const next = win32.dirname(root)
        if (next === root) return fail('unresolved')
        root = next
      }
    }
    const segments = windowsSegments(root, path)
    if (segments === undefined) return fail('notAuthorized')
    const expectedRoot = await rootToken(root)
    return expectedRoot.ok ? ok({ root, expectedRoot: expectedRoot.value, segments }) : expectedRoot
  }
  const change = async (
    request: Parameters<FileSystemFacility<unknown>['remove']>[0],
    operation: ChangeInput['operation'],
    target?: Parameters<FileSystemFacility<unknown>['move']>[0]['target'],
    replace = false,
  ) => {
    if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
    if (
      ![request.path, ...(target === undefined ? [] : [target.path])].every(
        path => win32.isAbsolute(path) && !path.includes('\0'),
      )
    )
      return reject(request.requestId, 'invalidInput')
    if (!request.named?.token || (target !== undefined && !target.named?.token))
      return reject(request.requestId, 'notAuthorized')
    if (
      options.root !== undefined &&
      [request.path, ...(target === undefined ? [] : [target.path])].some(
        path => windowsSegments(options.root ?? '', path) === undefined,
      )
    )
      return reject(request.requestId, 'notAuthorized')
    const source = await endpoint(request.path, operation === 'mkdir' && request.recursive)
    if (!source.ok) return failed(request.requestId, source.failure, 'notFound')
    const destination = target === undefined ? source : await endpoint(target.path)
    if (!destination.ok) return failed(request.requestId, destination.failure, 'notFound')
    const result = await invoke({
      ...source.value,
      named: request.named.token,
      operation,
      recursive: request.recursive,
      version: request.expectedVersion ?? null,
      targetRoot: destination.value.root,
      expectedTargetRoot: destination.value.expectedRoot,
      targetSegments: destination.value.segments,
      targetNamed: target?.named?.token ?? '',
      replace,
    })
    return typeof result === 'string' ? failed(request.requestId, result, 'notFound') : result
  }
  const run = async (
    request: Parameters<FileSystemFacility<unknown>['stat']>[0],
    operation: NativeInput['operation'],
    offset: number,
    limit: number,
    search?: Parameters<FileSystemFacility<unknown>['search']>[0],
  ) => {
    if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
    if (!win32.isAbsolute(request.path) || request.path.includes('\0'))
      return reject(request.requestId, 'invalidInput')
    if (!request.named?.token) return reject(request.requestId, 'notAuthorized')
    const root = options.root ?? win32.dirname(request.path)
    const segments = windowsSegments(root, request.path)
    if (segments === undefined) return reject(request.requestId, 'notAuthorized')
    const expectedRoot = await rootToken(root)
    if (!expectedRoot.ok)
      return failed(
        request.requestId,
        expectedRoot.failure,
        operation === 'search' ? 'notFound' : 'unresolved',
      )
    const result = await invoke({
      root,
      expectedRoot: expectedRoot.value,
      segments,
      named: request.named.token,
      operation,
      offset,
      limit,
      pattern: Buffer.from(search?.pattern ?? []).toString('base64'),
      content: search?.match === 'content',
      recursive: search?.recursive ?? false,
      entryBudget: options.limits.searchEntryBudget,
      byteBudget: options.limits.searchByteBudget,
      fileBytes: options.limits.searchFileBytes,
      path: request.path,
      rooted: options.root !== undefined,
    })
    return typeof result === 'string'
      ? failed(request.requestId, result, operation === 'search' ? 'notFound' : 'unresolved')
      : result
  }
  const facility: Pick<
    FileSystemFacility<unknown>,
    'read' | 'stat' | 'list' | 'search' | 'mkdir' | 'remove' | 'move' | 'write' | 'copy'
  > = {
    async copy(request) {
      request = {
        ...snapshot(request),
        target: {
          ...request.target,
          named: request.target.named === null ? null : { ...request.target.named },
        },
      }
      const source = await facility.read(request)
      if (source.kind === 'unresolved') return reject(request.requestId, 'notFound')
      if (source.kind !== 'done') return source
      if (request.expectedVersion !== undefined && source.value.version !== request.expectedVersion)
        return reject(request.requestId, 'conflict')
      const { expectedVersion: _sourceVersion, ...copyRequest } = request
      const targetRequest = { ...copyRequest, ...request.target }
      const target = await facility.stat(targetRequest)
      if (target.kind !== 'done' && target.kind !== 'unresolved') return target
      if (target.kind === 'done' && !request.replace) return reject(request.requestId, 'conflict')
      const written = await facility.write({
        ...targetRequest,
        bytes: source.value.bytes,
        mode: target.kind === 'done' ? 'replace' : 'create',
        ...(target.kind === 'done' ? { expectedVersion: target.value.version } : {}),
      })
      if (written.kind === 'unresolved') return reject(request.requestId, 'notFound')
      return written.kind === 'done'
        ? {
            kind: 'done',
            requestId: request.requestId,
            value: { source: source.value.object, target: written.value },
          }
        : written
    },
    async write(request) {
      request = { ...snapshot(request), bytes: Uint8Array.from(request.bytes) }
      if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
      if (
        !win32.isAbsolute(request.path) ||
        request.path.includes('\0') ||
        (request.mode === 'create' &&
          (request.expectedVersion !== undefined || /[\\/]$/u.test(request.path)))
      )
        return reject(request.requestId, 'invalidInput')
      if (!request.named?.token) return reject(request.requestId, 'notAuthorized')
      const source = await endpoint(request.path)
      const missing = request.mode === 'create' ? 'notFound' : 'unresolved'
      if (!source.ok) return failed(request.requestId, source.failure, missing)
      const result = await invoke({
        ...source.value,
        named: request.named.token,
        operation: 'write',
        version: request.expectedVersion ?? null,
        trailingSlash: /[\\/]$/u.test(request.path),
        create: request.mode === 'create',
        bytes: Buffer.from(request.bytes).toString('base64'),
      })
      if (typeof result === 'string') return failed(request.requestId, result, missing)
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          ...identity(result.info),
          writeEffect: request.mode === 'create' ? 'created' : 'replaced',
        },
      }
    },
    async read(request) {
      request = snapshot(request)
      const offset = request.offsetBytes ?? 0,
        limit = request.limitBytes ?? -1
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        (request.limitBytes !== undefined && (!Number.isSafeInteger(limit) || limit < 0))
      )
        return reject(request.requestId, 'invalidInput')
      const result = await run(request, 'read', offset, limit)
      if ('kind' in result) return result
      const bytes = Buffer.from(result.bytes, 'base64')
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          ...identity(result.info),
          bytes,
          nextOffsetBytes: offset + bytes.length,
          eof: result.eof,
        },
      }
    },
    async stat(request) {
      request = snapshot(request)
      const result = await run(request, 'stat', 0, 0)
      if ('kind' in result) return result
      return { kind: 'done', requestId: request.requestId, value: information(result.info) }
    },
    async list(request) {
      request = snapshot(request)
      const offset = request.offset ?? 0,
        limit = request.limit ?? options.limits.listPageLimit
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > options.limits.listPageLimit
      )
        return reject(request.requestId, 'invalidInput')
      try {
        const result = await run(request, 'list', offset, limit)
        if ('kind' in result) return result
        return {
          kind: 'done',
          requestId: request.requestId,
          value: {
            directory: identity(result.info),
            entries: result.entries.map(entry => ({ ...information(entry), name: entry.name })),
            ...(result.next < 0 ? {} : { nextOffset: result.next }),
          },
        }
      } catch {
        return unknown(request.requestId)
      }
    },
    async search(request) {
      request = { ...snapshot(request), pattern: Uint8Array.from(request.pattern) }
      const offset = request.offset ?? 0,
        limit = request.limit ?? options.limits.listPageLimit
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > options.limits.listPageLimit ||
        request.pattern.byteLength === 0
      )
        return reject(request.requestId, 'invalidInput')
      const result = await run(
        { ...request, named: request.named === null ? null : { ...request.named } },
        'search',
        offset,
        limit,
        { ...request, pattern: Uint8Array.from(request.pattern) },
      )
      if ('kind' in result) return result
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          root: identity(result.info),
          hits: result.hits.map(found => ({
            path: found.path,
            object: { token: found.token },
            ...(found.offsetBytes < 0 ? {} : { offsetBytes: found.offsetBytes }),
          })),
          truncated: result.truncated,
          ...(result.next < 0 ? {} : { nextOffset: result.next }),
        },
      }
    },
    async mkdir(request) {
      request = snapshot(request)
      const result = await change({ ...request, recursive: request.parents }, 'mkdir')
      return 'kind' in result
        ? result
        : { kind: 'done', requestId: request.requestId, value: identity(result.info) }
    },
    async remove(request) {
      request = snapshot(request)
      const result = await change(request, 'remove')
      return 'kind' in result
        ? result
        : {
            kind: 'done',
            requestId: request.requestId,
            value: { removed: { token: result.info.token } },
          }
    },
    async move(request) {
      request = {
        ...snapshot(request),
        target: {
          path: request.target.path,
          named: request.target.named === null ? null : { ...request.target.named },
        },
      }
      const result = await change(
        { ...request, recursive: false },
        'move',
        request.target,
        request.replace,
      )
      return 'kind' in result
        ? result
        : {
            kind: 'done',
            requestId: request.requestId,
            value: { source: { token: result.info.token }, target: identity(result.info) },
          }
    },
  }
  return facility
}
