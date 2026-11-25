// @module-tag slow
// Starts production server and CLI processes over persistent SQLite and a local TLS model endpoint.
import { DEFAULT_READINESS_TIMEOUT_MS } from '../../src/local/operator-defaults.ts'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { startModelGateway } from '../fixtures/model-gateway.ts'
import {
  processFillerText,
  processModelReply,
} from '../support/workspace-guidance-process-model.ts'
import {
  savedClients,
  readHistoryPage,
  readHistoryFrom,
  type HistoryEntry,
} from '../support/protocol-clients.ts'
import {
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  savedTenant,
  startServer,
  writeOperator,
  type ServerHandle,
} from '../r9/support.ts'

function evidence(name: string, value: unknown) {
  const directory = process.env['OMNE_GUIDANCE_OS_EVIDENCE']
  if (!directory) return
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n')
}

async function processRestart(guidance: boolean, compacted = false) {
  const scratch = newScratch('guidance-serve-os-')
  const home = join(scratch.base, 'cli-home')
  const workspace = join(scratch.base, 'project')
  const pay = join(workspace, 'pay')
  mkdirSync(pay, { recursive: true })
  writeFileSync(join(workspace, 'AGENTS.md'), 'ROOT_OS_RETAINED_711')
  writeFileSync(join(pay, 'AGENTS.md'), 'PAY_OS_ORIGINAL_485')
  const requests: {
    phase: string
    purpose: 'summary' | 'work'
    body: string
    rawBody: string
    path: string
  }[] = []
  const cliRecords: unknown[] = []
  const processes: unknown[] = []
  const histories: { phase: string; entries: readonly HistoryEntry[] }[] = []
  let phase = 'a'
  let requestInPhase = 0
  let fillerReplies = 0
  const script = () => {
    requestInPhase++
    if (!guidance || requestInPhase !== 1) return []
    return [
      {
        id: phase === 'a' ? 'os_original_write' : 'os_revisit_read',
        tool: 'Files',
        arguments: JSON.stringify(
          phase === 'a'
            ? {
                command: 'write',
                intent: 'record payment once',
                params: { path: 'pay/note', mode: 'create', text: 'once' },
              }
            : { command: 'read', intent: 'revisit committed note', params: { path: 'pay/note' } },
        ),
      },
    ]
  }
  const gateway = await startModelGateway(request => {
    const decoded = JSON.parse(request.body) as { messages?: readonly unknown[] }
    const summary = JSON.stringify(decoded.messages?.at(-1) ?? '').includes(
      'Summarize the conversation so far for a later request.',
    )
    requests.push({
      phase,
      purpose: summary ? 'summary' : 'work',
      body: request.body,
      rawBody: request.rawBody,
      path: request.path,
    })
    if (compacted)
      console.log(
        'C5_OS_MODEL',
        JSON.stringify({
          phase,
          purpose: summary ? 'summary' : 'work',
          requestBytes: Buffer.byteLength(request.rawBody),
          request: requests.length,
        }),
      )
    if (summary)
      return processModelReply(
        request.body,
        [],
        'SUMMARY_OS_936 Continue payment work. The note was committed once.',
      )
    const calls = script()
    let text = 'done'
    if (compacted && phase === 'a' && calls.length === 0 && fillerReplies < 7) {
      fillerReplies++
      text = processFillerText(fillerReplies)
    }
    return processModelReply(request.body, calls, text)
  })
  const port = await freePort()
  const operatorPath = join(scratch.base, 'operator.json')
  const layer = operatorLayer({
    storageRoot: scratch.storageRoot,
    port,
    modelRoute: gateway.url,
  }) as { ops: { id: string; config?: Record<string, unknown> }[] }
  for (const op of layer.ops)
    if (op.id === 'session-access')
      op.config = {
        ...op.config,
        historyKinds: [
          'message.user',
          'message.assistant',
          'message.tool',
          'message.system_reminder',
          'message.compaction',
          'run.started',
          'run.terminal',
          'call.bound',
          'call.execution-fact',
        ],
      }
  writeOperator(operatorPath, layer)
  let server: ServerHandle | undefined
  let session = ''
  let completed = false
  let retainedFailureState: string | undefined
  const cli = async (args: string[], credential?: string) => {
    const answer = await runOmne({
      args,
      home,
      server: `http://127.0.0.1:${port}`,
      cwd: scratch.base,
      ...(credential === undefined ? {} : { credential }),
    })
    cliRecords.push({ ...answer, pid: server?.pid, phase })
    expect(answer.status, answer.stderr + answer.stdout).toBe(0)
    return (JSON.parse(answer.stdout) as { body: Record<string, string> }).body
  }
  const history = async () => {
    const clients = savedClients(port, home)
    const tenant = savedTenant(home)
    let answer = await readHistoryPage(clients, tenant, session, '1000000')
    const entries: HistoryEntry[] = []
    for (;;) {
      expect(answer.outcome).toBe('succeeded')
      entries.push(...answer.body.entries)
      if (answer.body.next === null) return entries
      answer = await readHistoryFrom(clients, tenant, session, answer.body.next)
    }
  }
  const run = async (ordinal: number) => {
    await cli([
      'send-input',
      '--session',
      session,
      '--text',
      ordinal === 1
        ? 'OS_BEGIN_225'
        : phase === 'a'
          ? `OS_FILLER_CONTINUE_${ordinal}`
          : 'OS_CONTINUE_448',
    ])
    const deadline = Date.now() + 90000
    for (;;) {
      const entries = await history()
      const terminals = entries.filter(entry => entry.kind === 'run.terminal')
      if (terminals.length >= ordinal) {
        expect(terminals.at(-1)?.payload).toMatchObject({
          terminal: { outcome: 'completed' },
          end: { conclusion: 'complete', failure: null },
        })
        if (compacted)
          console.log(
            'C5_OS_RUN',
            JSON.stringify({
              phase,
              ordinal,
              entries: entries.length,
              compactions: entries.filter(entry => entry.kind === 'message.compaction').length,
            }),
          )
        return entries
      }
      if (Date.now() > deadline)
        throw new Error(
          `run ${ordinal} did not end: ${JSON.stringify(entries)}\n${server?.stderr()}\n${server?.stdout()}`,
        )
      await sleep(250)
    }
  }
  const start = async () => {
    const handle = await startServer({
      stateRoot: scratch.stateRoot,
      operatorPath,
      port,
      extraCaPath: gateway.certPath,
      startupTimeoutMs: 45000,
      ...(compacted ? { readinessTimeoutMs: DEFAULT_READINESS_TIMEOUT_MS } : {}),
    })
    server = handle
    if (compacted)
      console.log(
        'C5_OS_STARTED',
        JSON.stringify({ phase, pid: handle.pid, command: handle.command }),
      )
    processes.push({
      phase,
      event: 'started',
      pid: handle.pid,
      command: handle.command,
      stateRoot: scratch.stateRoot,
      stdout: handle.stdout(),
      stderr: handle.stderr(),
    })
    const records = handle.records()
    expect(
      records.find(record => record.kind === 'startup-result'),
      JSON.stringify({
        pending: records.filter(
          record => record.kind === 'row-state' && record['state'] !== 'ACTIVE',
        ),
        stderr: handle.stderr(),
      }),
    ).toMatchObject({ accepting: true })
    return handle.pid
  }
  const stop = async () => {
    if (!server) throw new Error('no server')
    const pid = server.pid
    const answer = await server.stop()
    processes.push({ phase, event: 'exited', pid, ...answer })
    if (compacted) console.log('C5_OS_EXITED', JSON.stringify({ phase, pid, code: answer.code }))
    server = undefined
    expect(answer.code, answer.stderr).toBe(0)
    expect(answer.records.findLast(record => record.kind === 'shutdown-result')).toMatchObject({
      overall: 'settled',
    })
    if (pid !== undefined) expect(() => process.kill(pid, 0)).toThrow()
  }
  let diskBefore: unknown
  let diskAfter: unknown
  const note = () => {
    const file = join(pay, 'note')
    const info = statSync(file)
    return {
      text: readFileSync(file, 'utf8'),
      ino: info.ino,
      size: info.size,
      mtimeMs: info.mtimeMs,
    }
  }
  try {
    const aPid = await start()
    await cli(['register', '--login-identifier', 'os-restart'], 'os-restart-test-credential')
    await cli(['login', '--login-identifier', 'os-restart'], 'os-restart-test-credential')
    const selected: string[] = []
    if (guidance) {
      const bound = await cli(['workspace', 'register', workspace])
      selected.push('--workspace', bound.workspace!, '--instance', bound.instance!)
    }
    session = (await cli(['create-session', '--definition', 'coding', ...selected])).session!
    let first = await run(1)
    if (compacted) for (let ordinal = 2; ordinal <= 8; ordinal++) first = await run(ordinal)
    histories.push({ phase, entries: first })
    expect(
      requests.filter(request => request.phase === 'a' && request.purpose === 'work'),
    ).toHaveLength(compacted ? 9 : guidance ? 2 : 1)
    if (compacted) {
      expect(first.filter(entry => entry.kind === 'message.compaction')).toHaveLength(1)
      expect(
        requests.filter(request => request.phase === 'a' && request.purpose === 'summary'),
      ).toHaveLength(1)
      const last = requests
        .filter(request => request.phase === 'a' && request.purpose === 'work')
        .at(-1)!
      expect(last.body).toContain('SUMMARY_OS_936')
      expect(last.body).toContain(processFillerText(7))
      expect(last.body).not.toContain('FILLER_OS_1_START')
    }
    if (guidance) {
      expect(requests.at(-1)?.body).toContain('PAY_OS_ORIGINAL_485')
      diskBefore = note()
      expect(diskBefore).toMatchObject({ text: 'once' })
    }
    await stop()
    phase = 'b'
    requestInPhase = 0
    writeFileSync(join(pay, 'AGENTS.md'), 'PAY_OS_REVISED_862')
    const bPid = await start()
    expect(bPid).not.toBe(aPid)
    expect(await history()).toEqual(first)
    expect(requests.filter(request => request.phase === 'b')).toHaveLength(0)
    const second = await run(compacted ? 9 : 2)
    histories.push({ phase, entries: second })
    expect(second.slice(0, first.length)).toEqual(first)
    expect(requests.filter(request => request.phase === 'b')).toHaveLength(guidance ? 2 : 1)
    if (compacted)
      for (const request of requests.filter(request => request.phase === 'b')) {
        expect(request.body.split('SUMMARY_OS_936').length - 1).toBe(1)
        expect(request.body).toContain(processFillerText(7))
        expect(request.body).not.toContain('FILLER_OS_1_START')
      }
    if (guidance) {
      for (const request of requests.filter(request => request.phase === 'b'))
        for (const marker of ['ROOT_OS_RETAINED_711', 'PAY_OS_ORIGINAL_485', 'PAY_OS_REVISED_862'])
          expect(request.body.split(marker).length - 1, marker).toBe(1)
      const revised = second.filter(
        entry =>
          entry.kind === 'message.system_reminder' &&
          JSON.stringify(entry).includes('PAY_OS_REVISED_862'),
      )
      expect(revised).toHaveLength(1)
      expect(JSON.stringify(revised)).not.toMatch(/ROOT_OS_RETAINED_711|PAY_OS_ORIGINAL_485/)
      expect(first.filter(entry => entry.kind === 'message.tool')).toHaveLength(1)
      expect(second.filter(entry => entry.kind === 'message.tool')).toHaveLength(2)
      diskAfter = note()
      expect(diskAfter).toEqual(diskBefore)
    } else expect(requests.at(-1)?.body).toContain('OS_BEGIN_225')
    await stop()
    completed = true
  } finally {
    if (server) {
      const pid = server.pid
      const result = await server.stop()
      processes.push({ phase, event: 'cleanup-exit', pid, ...result })
      server = undefined
    }
    const artifacts = process.env['OMNE_GUIDANCE_OS_EVIDENCE']
    if (!completed && artifacts) {
      retainedFailureState = scratch.base
    }
    evidence(
      `journal-release-os-${compacted ? 'compacted' : guidance ? 'guidance' : 'control'}.json`,
      {
        session,
        compacted,
        readinessTimeoutMs: compacted ? DEFAULT_READINESS_TIMEOUT_MS : 15000,
        fillerReplies,
        requests,
        cliRecords,
        processes,
        histories,
        diskBefore,
        diskAfter,
        retainedFailureState,
        limits: [
          'Real production serve/CLI binaries and local TLS model endpoint.',
          'Clean terminal completion and graceful process exit; no SIGKILL/power loss.',
          compacted
            ? 'Production default budget and compaction provider are unchanged. Long scripted replies fill the history; actual summary model calls return a short scripted summary.'
            : 'No injected compaction provider; post-compaction restart is not covered by this case.',
        ],
      },
    )
    await gateway.close()
    if (completed || !artifacts) scratch.remove()
  }
}

it.each([false, true])(
  'C5 real serve processes restart with guidance=%s and keep the committed history',
  { timeout: 360000 },
  guidance => processRestart(guidance),
)

it('C5 real production compaction in A survives an OS restart into B', { timeout: 900000 }, () =>
  processRestart(true, true),
)
