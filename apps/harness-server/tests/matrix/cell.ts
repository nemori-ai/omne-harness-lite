import { createEnvironment, type Environment } from '../support/matrix/environment.ts'
import { createProtocolDriver, type Account, type HistoryEntry, type ProtocolDriver } from '../support/matrix/protocol-driver.ts'
import { startProviderStub, type ProviderStub } from '../support/matrix/provider-stub.ts'
import { blocksText, readSessionLog, type SessionLog } from '../support/matrix/session-log.ts'

export type Block = 'K' | 'H' | 'R' | 'G' | 'Q' | 'X' | 'D'
export type Layer = 'protocol' | 'page'
export type Verdict = 'pass' | 'fail' | 'untestable'

export type Check = Readonly<{ name: string; ok: boolean; detail: string }>

export type CellTools = Readonly<{
  env: Environment
  stub: ProviderStub
  driver(account?: Account): ProtocolDriver
  log(session: string): SessionLog | null
  waitLog(session: string, what: string, satisfied: (log: SessionLog) => boolean, timeoutMs: number): Promise<SessionLog | null>
  check(name: string, ok: boolean, detail?: string): void
  note(text: string): void
  sleep(ms: number): Promise<void>
}>

export type ProtocolCell = Readonly<{
  id: string
  block: Block
  layer: 'protocol'
  run(tools: CellTools): Promise<void>
}>

export type PageCell = Readonly<{ id: string; block: Block; layer: 'page'; probe: string }>

export type UntestableCell = Readonly<{ id: string; block: Block; layer: 'protocol'; untestable: string }>

export type Cell = ProtocolCell | PageCell | UntestableCell

export type CellOutcome = Readonly<{
  id: string
  block: Block
  layer: Layer
  actual: Verdict | 'not-run'
  checks: readonly Check[]
  notes: readonly string[]
  tookMs: number
  stoppedUnits: readonly string[]
}>

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export const TURN_MS = 60_000

type JsonTree =
  | { kind: 'object'; entries: { key: string; value: JsonTree }[] }
  | { kind: 'array'; items: JsonTree[] }
  | { kind: 'string' | 'number' | 'boolean' | 'null'; value?: unknown }

export function plain(tree: unknown): unknown {
  const node = tree as JsonTree
  if (node === null || typeof node !== 'object' || !('kind' in node)) return tree
  if (node.kind === 'object') return Object.fromEntries(node.entries.map(entry => [entry.key, plain(entry.value)]))
  if (node.kind === 'array') return node.items.map(plain)
  if (node.kind === 'null') return null
  return node.value
}

export function messageText(entry: HistoryEntry): string {
  const payload = plain(entry.payload)
  if (payload === null || typeof payload !== 'object') return ''
  return blocksText(payload as Record<string, unknown>)
}

export function sameHistory(log: SessionLog, entries: readonly HistoryEntry[]): { ok: boolean; detail: string } {
  const messageKinds = new Set(['message.user', 'message.assistant', 'message.tool'])
  const fromLog = log.entries.filter(entry => messageKinds.has(entry.kind)).map(entry => `${entry.kind}:${blocksText(entry.body)}`)
  const fromProtocol = entries.filter(entry => messageKinds.has(entry.kind)).map(entry => `${entry.kind}:${messageText(entry)}`)
  const ok = JSON.stringify(fromLog) === JSON.stringify(fromProtocol)
  return {
    ok,
    detail: ok ? `${String(fromLog.length)} messages` : `log ${JSON.stringify(fromLog).slice(0, 300)} protocol ${JSON.stringify(fromProtocol).slice(0, 300)}`,
  }
}

export function shellCommand(script: string) {
  return { command: 'execute', params: { script } }
}

export async function runProtocolCell(cell: ProtocolCell, budgetMs: number): Promise<Omit<CellOutcome, 'tookMs'>> {
  const checks: Check[] = []
  const notes: string[] = []
  const stub = await startProviderStub()
  let env: Environment | undefined
  const drivers: ProtocolDriver[] = []
  let stoppedUnits: string[] = []
  try {
    const t0 = Date.now()
    env = await createEnvironment({ modelUrl: stub.url, certPath: stub.certPath })
    const t1 = Date.now()
    await env.start()
    notes.push(`setup ${String(t1 - t0)} ms, start ${String(Date.now() - t1)} ms`)
    const current = env
    const tools: CellTools = {
      env: current,
      stub,
      driver: account => {
        const made = createProtocolDriver(current.origin, account)
        drivers.push(made)
        return made
      },
      log: session => readSessionLog(current.domainsDir, session),
      waitLog: async (session, what, satisfied, timeoutMs) => {
        const until = Date.now() + timeoutMs
        let last: SessionLog | null = null
        for (;;) {
          last = readSessionLog(current.domainsDir, session)
          if (last !== null && satisfied(last)) return last
          if (Date.now() > until) {
            notes.push(`timeout after ${String(timeoutMs)} ms waiting for: ${what}`)
            return last
          }
          await sleep(200)
        }
      },
      check: (name, ok, detail = '') => {
        checks.push({ name, ok, detail })
      },
      note: text => {
        notes.push(text)
      },
      sleep,
    }
    let timer: NodeJS.Timeout | undefined
    const budget = new Promise<'budget'>(resolve => {
      timer = setTimeout(() => resolve('budget'), budgetMs)
    })
    const ran = await Promise.race([cell.run(tools).then(() => 'done' as const), budget])
    clearTimeout(timer)
    if (ran === 'budget') checks.push({ name: 'cell finished within its budget', ok: false, detail: `${String(budgetMs)} ms` })
  } catch (error: unknown) {
    checks.push({ name: 'cell ran to the end', ok: false, detail: String(error instanceof Error ? error.message : error).slice(0, 500) })
  } finally {
    for (const made of drivers) made.close()
    const t2 = Date.now()
    if (env !== undefined) stoppedUnits = await env.dispose()
    notes.push(`dispose ${String(Date.now() - t2)} ms`)
    await stub.close()
  }
  return {
    id: cell.id,
    block: cell.block,
    layer: 'protocol',
    actual: checks.length > 0 && checks.every(check => check.ok) ? 'pass' : 'fail',
    checks,
    notes,
    stoppedUnits,
  }
}
