import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  ReadHandlerDescriptor,
  ReadOrdering,
  ReadRequest,
  ReadResult,
} from '@omne-harness/sql-contract'
import {
  DOMAIN,
  TENANT_A,
  buildMaterials,
  commitRequest,
  createProvider,
  identity,
  registration,
  type Built,
  type MaterialsOptions,
  type Provider,
  type Workspace,
} from './support.ts'
import type { SqliteStorageConfig } from '../src/index.ts'
import { HOLD, gate, openGates, type Gate } from './gate.ts'

const COUNT_PAIR = `${HOLD}
export default {
  handler: 'NAME', protocol: '1',
  read(input, port) {
    const a = port.execute('select count(*) from t_ledger limit 1', []).rows[0][0]
    hold(input.gate)
    const b = port.execute('select count(*) from t_ledger limit 1', []).rows[0][0]
    return { kind: 'read', output: { a: String(a), b: String(b) } }
  },
}
`

const LOAD_HELD = ['slowload', 'slowserial'] as const
type LoadHeld = (typeof LOAD_HELD)[number]

const heldAtLoad = (name: string, path: string): string => `${HOLD}hold(${JSON.stringify(path)})
export default {
  handler: '${name}', protocol: '1',
  read() { return { kind: 'read', output: { loaded: true } } },
}`

const loadGates = new WeakMap<Workspace, Readonly<Record<LoadHeld, Gate>>>()

export function loadGateOf(workspace: Workspace, handler: LoadHeld): Gate {
  const gates = loadGates.get(workspace)
  if (gates === undefined) throw new Error('the read materials of this workspace are not built')
  return gates[handler]
}

const HANDLERS: Readonly<Record<string, string>> = {
  page: COUNT_PAIR.replace('NAME', 'page'),
  serial: COUNT_PAIR.replace('NAME', 'serial'),
  rows: `export default {
  handler: 'rows', protocol: '1',
  read(input, port) {
    const result = port.execute('select id from t_ledger order by id limit ?', [input.limit])
    return { kind: 'read', output: { count: result.rows.length } }
  },
}`,
  swallow: `export default {
  handler: 'swallow', protocol: '1',
  read(input, port) {
    try { port.execute('select id from t_ledger order by id limit 1000', []) } catch {}
    return { kind: 'read', output: { swallowed: true } }
  },
}`,
  bigout: `export default {
  handler: 'bigout', protocol: '1',
  read(input) { return { kind: 'read', output: 'x'.repeat(input.n) } },
}`,
  nolimit: `export default {
  handler: 'nolimit', protocol: '1',
  read(input, port) { port.execute('select id from t_ledger', []); return { kind: 'read', output: {} } },
}`,
  writer: `export default {
  handler: 'writer', protocol: '1',
  read(input, port) { port.execute("insert into t_ledger(note) values ('sneaky')", []); return { kind: 'read', output: {} } },
}`,
  foreign: `export default {
  handler: 'foreign', protocol: '1',
  read(input, port) { port.execute('select * from _sql_receipt limit 1', []); return { kind: 'read', output: {} } },
}`,
  crash: `export default {
  handler: 'crash', protocol: '1',
  read() { process.exit(3) },
}`,
  fail: `export default {
  handler: 'fail', protocol: '1',
  read() { return { kind: 'failed', diagnostic: 'handler says no' } },
}`,
  notjson: `export default {
  handler: 'notjson', protocol: '1',
  read() { return { kind: 'read', output: { fn() {} } } },
}`,
  held: `${HOLD}
export default {
  handler: 'held', protocol: '1',
  read(input) { hold(input.gate); return { kind: 'read', output: {} } },
}`,
  ghost: `export default {
  handler: 'ghost', protocol: '1',
  read() { return { kind: 'read', output: {} } },
}`,
}

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

const ORDERING: Readonly<Record<string, ReadOrdering>> = {
  serial: 'domain-serial',
  slowserial: 'domain-serial',
}

export type ReadFixture = Readonly<{ built: Built; handlers: readonly ReadHandlerDescriptor[] }>

export async function buildReadMaterials(
  workspace: Workspace,
  overrides: Readonly<Record<string, Partial<ReadHandlerDescriptor>>> = {},
  materials: MaterialsOptions = {},
): Promise<Built> {
  const base = await buildMaterials(workspace, materials)
  const handlers: ReadHandlerDescriptor[] = []
  const held = { slowload: gate(workspace.root), slowserial: gate(workspace.root) }
  loadGates.set(workspace, held)
  const sources = {
    ...HANDLERS,
    slowload: heldAtLoad('slowload', held.slowload.path),
    slowserial: heldAtLoad('slowserial', held.slowserial.path),
  }
  for (const [name, source] of Object.entries(sources)) {
    const file = join(workspace.materialsDir, `handler-${name}.mjs`)
    await writeFile(file, source, 'utf8')
    handlers.push({
      handler: name,
      protocol: '1',
      moduleUrl: pathToFileURL(file).href,
      codeDigest: sha(source),
      ordering: ORDERING[name] ?? 'snapshot',
      readTables: ['t_ledger'],
      requiresMigrations: [
        name === 'ghost'
          ? { owner: 'ghost', id: '0001-missing' }
          : { owner: 'ledger', id: '0001-base' },
      ],
      maxOutputBytes: 4096,
      maxRowsRead: 100,
      ...overrides[name],
    })
  }
  return { ...base, catalog: { ...base.catalog, readHandlers: handlers } }
}

export const providers: Provider[] = []

export async function readyProvider(
  workspace: Workspace,
  built: Built,
  config: Partial<SqliteStorageConfig> = {},
  rows = 0,
): Promise<Provider> {
  const provider = await createProvider(workspace, built, config)
  providers.push(provider)
  await provider.storage.registerCombination(registration(built))
  for (let index = 0; index < rows; index += 1)
    await provider.storage.commit(
      commitRequest(built, { identity: identity({ operationKey: `seed-${String(index)}` }) }),
    )
  return provider
}

export async function closeProviders(): Promise<void> {
  openGates()
  for (const provider of providers.splice(0))
    await provider.control.close({ initiator: 'disposal' }).catch(() => undefined)
}

let counter = 0

export function readRequest(handler: string, input: ReadRequest['input'] = {}): ReadRequest {
  counter += 1
  return {
    domain: { scope: TENANT_A, transactionDomain: DOMAIN },
    handler,
    protocol: '1',
    requestKey: `req-${String(counter)}`,
    input,
  }
}

export function summary(result: ReadResult): string {
  return result.kind === 'unavailable' ? `unavailable/${result.reason}` : result.kind
}

export const commitOf = (built: Built, key: string): ReturnType<typeof commitRequest> =>
  commitRequest(built, { identity: identity({ operationKey: key }) })

export type HeldRead = Readonly<{ gate: Gate; result: Promise<ReadResult> }>

export async function heldRead(
  storage: Provider['storage'],
  workspace: Workspace,
  handler: 'held' | 'page' | 'serial' = 'held',
  options?: Parameters<Provider['storage']['read']>[1],
): Promise<HeldRead> {
  const held = gate(workspace.root)
  const result = storage.read(readRequest(handler, { gate: held.path }), options)
  await held.entered()
  return { gate: held, result }
}
