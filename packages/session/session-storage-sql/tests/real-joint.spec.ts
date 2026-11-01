// The joint commit of the Session log combination over the real sqlite-provider: real Workers, real
// files. One commit with an execution-record and a session command is all or nothing on the real
// write Worker; the publication of either side moves the common root that the real read Worker
// reads in one snapshot; after the process is killed, a new provider on the same files answers the
// original identity committed and both sides are there.
// @module-tag slow
// Why slow: real Workers, real files and a killed child process.
import { spawn } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  guard,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import type { SessionCommand } from '@omne-harness/session-contract'
import {
  decodeExecutionRecordReply,
  decodeSessionHistoryRoot,
  decodeSessionReply,
  decodeExecutionRecordState,
  executionRecordFacts,
  sessionCheckFacts,
  sessionCommandFacts,
} from '../src/participants.ts'
import {
  identityOf,
  jointWrite,
  openRealApp,
  queryKindOf,
  TENANT_A,
  textOf,
  type RealApp,
} from './fixtures/real-provider.ts'

const apps: RealApp[] = []
const roots: string[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function open(root?: string): Promise<RealApp> {
  const app = await openRealApp(root === undefined ? {} : { root })
  apps.push(app)
  return app
}

const SESSION = sessionId('session-1')
const accept = (name: string): SessionCommand => ({
  kind: 'accept',
  input: {
    tenant: TENANT_A,
    session: SESSION,
    operation: operationId(`accept-${name}`),
    value: ordinaryInput(name),
  },
})
const login = [guard('login', 'login-entry', 'present')]

async function read(app: RealApp, handler: string) {
  const result = await app.storage.read({
    domain: { scope: { kind: 'tenant', tenant: textOf(TENANT_A) }, transactionDomain: 'dom_0' },
    handler,
    protocol: '1',
    requestKey: 'r',
    input: { tenant: textOf(TENANT_A), session: SESSION },
  })
  if (result.kind !== 'read') throw new Error(`${handler}: ${JSON.stringify(result)}`)
  return result.output
}

describe('the joint commit on the real write Worker', () => {
  it('commits both sides in one receipt and the read Worker reads the moved common root', async () => {
    const app = await open()
    expect('ok' in (await app.create(TENANT_A))).toBe(true)
    const before = decodeSessionHistoryRoot(await read(app, 'session.history-root'))
    const result = await app.storage.commit({
      identity: identityOf(TENANT_A, 'dom_0', 'aop_joint'),
      ...app.combination,
      commands: [executionRecordFacts(jointWrite()), sessionCommandFacts(accept('joint'), login)],
    })
    expect(result.kind).toBe('committed')
    if (result.kind !== 'committed') return
    expect(result.responses.map(item => item.participant)).toEqual(['execution-record', 'session'])
    expect(decodeExecutionRecordReply(result.responses[0]!.reply)).toEqual({
      kind: 'published',
      published: '1',
      digest: expect.any(String),
    })
    const after = decodeSessionHistoryRoot(await read(app, 'session.history-root'))
    expect(after?.published).toBe('1')
    expect(BigInt(after!.position)).toBeGreaterThan(BigInt(before!.position) + 1n)
    expect(decodeExecutionRecordState(await read(app, 'execution-record.state'))).toEqual({
      published: '1',
      state: { records: ['joint'] },
    })
  })

  it('a session conflict rolls the execution-record write back: no count, no state', async () => {
    const app = await open()
    expect('ok' in (await app.create(TENANT_A))).toBe(true)
    const result = await app.storage.commit({
      identity: identityOf(TENANT_A, 'dom_0', 'aop_refused'),
      ...app.combination,
      commands: [
        executionRecordFacts(jointWrite({ operation: 'aop_refused' })),
        sessionCheckFacts({
          kind: 'attach',
          tenant: TENANT_A,
          session: SESSION,
          execution: 'exe_1',
          grant: { owner: 'x', record: 'not-a-grant', revision: '1', digest: 'sha256:x' },
        }),
      ],
    })
    expect(result.kind).toBe('rolled_back')
    if (result.kind !== 'rolled_back') return
    expect(decodeSessionReply(result.responses.at(-1)!.reply)).toEqual({
      kind: 'stopped',
      failure: { kind: 'denied', action: 'attach' },
    })
    expect(decodeExecutionRecordState(await read(app, 'execution-record.state'))).toEqual({
      published: '0',
      state: null,
    })
  })
})

describe('the process is killed after the joint receipt came back', () => {
  it('a new provider on the same files answers committed for the original identity, and both sides are there', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'session-joint-kill-')))
    roots.push(root)
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./fixtures/real-joint-child.ts', import.meta.url)), root],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    )
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
    const line = await new Promise<string>((resolve, reject) => {
      let text = ''
      child.stdout.on('data', (chunk: Buffer) => {
        text += chunk.toString()
        if (text.includes('\n')) resolve(text.trim())
      })
      child.once('exit', () => reject(new Error(`child ended before the receipt: ${text}`)))
    })
    expect(line).toBe('RECEIPT committed')
    child.kill('SIGKILL')
    await exited

    const app = await open(root)
    const found = await app.storage.query(identityOf(TENANT_A, 'dom_0', 'aop_joint'))
    expect(queryKindOf(found)).toBe('committed')
    if (found.kind !== 'committed') return
    expect(found.responses.map(item => item.participant)).toEqual(['execution-record', 'session'])
    expect(decodeExecutionRecordState(await read(app, 'execution-record.state'))).toEqual({
      published: '1',
      state: { records: ['joint'] },
    })
    const input = await app.port.readInput({ ...app.access(TENANT_A), input: 'joint' as never })
    expect('ok' in input).toBe(true)
  })
})
