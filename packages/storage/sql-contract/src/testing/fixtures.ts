// Fixture materials of the conformance suite: real module files in a temporary directory, so a
// subject loads them from `moduleUrl` and checks `codeDigest` the way a provider does. Every
// participant works on facts only. Nothing here needs SQL, so a memory double can run them.
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  FactKey,
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
  SqlMaterialCatalog,
} from '../types.ts'

export const SESSION_REVISION: FactKey = { key: 'session.revision', protocol: '1' }
export const GAMMA_FACT: FactKey = { key: 'gamma.ready', protocol: '1' }

/** Combination that holds every fixture participant. */
export const ALL_PARTICIPANTS = [
  'agent-journal',
  'alpha',
  'beta',
  'gamma',
  'needy',
  'probe',
  'session',
] as const
/** Small combination of two participants. */
export const SMALL_PARTICIPANTS = ['agent-journal', 'session'] as const

/** Source text of the `probe` participant: the facts of the command pick its behavior. */
const PROBE_SOURCE = `
export default {
  participant: 'probe',
  protocol: '1',
  execute(facts, port) {
    switch (facts.mode) {
      case 'conflict': return { kind: 'conflict', basis: { why: 'conflict-basis' } }
      case 'unsupported': return { kind: 'unsupported', basis: { why: 'unsupported-basis' } }
      case 'failed': return { kind: 'failed', diagnostic: 'probe reported failure' }
      case 'throw': throw new Error('probe threw')
      case 'invalid': return { kind: 'participated' }
      case 'unknown-kind': return { kind: 'surprise' }
      case 'big': return { kind: 'participated', response: 'x'.repeat(100000) }
      case 'sql': port.execute('select * from _sql_receipt', []); break
      case 'require-undeclared': port.requireFact({ key: 'not.declared', protocol: '1' }); break
      case 'require-undeclared-existing': port.requireFact({ key: 'gamma.ready', protocol: '1' }); break
      case 'provide-undeclared': port.provideFact({ key: 'not.declared', protocol: '1' }, 1); break
      case 'provide-twice':
        port.provideFact({ key: 'probe.out', protocol: '1' }, 1)
        port.provideFact({ key: 'probe.out', protocol: '1' }, 2)
        break
      case 'provide-bad-json': port.provideFact({ key: 'probe.out', protocol: '1' }, undefined); break
      case 'swallow-violation':
        try { port.requireFact({ key: 'not.declared', protocol: '1' }) } catch {}
        port.provideFact({ key: 'probe.out', protocol: '1' }, 1)
        break
      default: break
    }
    return { kind: 'participated', response: { mode: facts.mode ?? 'ok' } }
  },
}
`

function participantSource(name: string, body: string): string {
  return `export default { participant: '${name}', protocol: '1', execute(facts, port) {\n${body}\n} }\n`
}

const SOURCES: Readonly<Record<string, string>> = {
  session: participantSource(
    'session',
    `const revision = facts.revision ?? 'r1'
port.provideFact({ key: 'session.revision', protocol: '1' }, revision)
return { kind: 'participated', response: { revision } }`,
  ),
  'agent-journal': participantSource(
    'agent-journal',
    `return { kind: 'participated', response: { saw: port.requireFact({ key: 'session.revision', protocol: '1' }) } }`,
  ),
  needy: participantSource(
    'needy',
    `return { kind: 'participated', response: { saw: port.requireFact({ key: 'session.revision', protocol: '1' }) } }`,
  ),
  alpha: participantSource(
    'alpha',
    `return { kind: 'participated', response: { saw: port.requireFact({ key: 'gamma.ready', protocol: '1' }) } }`,
  ),
  beta: participantSource('beta', `return { kind: 'participated', response: { beta: true } }`),
  gamma: participantSource(
    'gamma',
    `port.provideFact({ key: 'gamma.ready', protocol: '1' }, 'g')
return { kind: 'participated', response: { gamma: true } }`,
  ),
  probe: PROBE_SOURCE,
}

function handlerSource(name: string, body: string): string {
  return `export default { handler: '${name}', protocol: '1', read(input, port) {\n${body}\n} }\n`
}

const HANDLER_SOURCES: Readonly<Record<string, string>> = {
  'session.echo': handlerSource('session.echo', `return { kind: 'read', output: { echo: input } }`),
  'session.fail': handlerSource(
    'session.fail',
    `return { kind: 'failed', diagnostic: 'handler failed' }`,
  ),
  'session.big': handlerSource('session.big', `return { kind: 'read', output: 'x'.repeat(5000) }`),
  'session.throw': handlerSource('session.throw', `throw new Error('handler threw')`),
  'extra.echo': handlerSource('extra.echo', `return { kind: 'read', output: null }`),
}

const MIGRATION_SOURCE = (owner: string, id: string): string =>
  `export default { owner: '${owner}', id: '${id}', up() {}, verify() { return { kind: 'verified' } } }\n`

const FACTS: Readonly<
  Record<
    string,
    { requires: readonly FactKey[]; provides: readonly FactKey[]; reads: readonly string[] }
  >
> = {
  session: { requires: [], provides: [SESSION_REVISION], reads: [] },
  'agent-journal': { requires: [SESSION_REVISION], provides: [], reads: ['s_session'] },
  needy: { requires: [SESSION_REVISION], provides: [], reads: [] },
  alpha: { requires: [GAMMA_FACT], provides: [], reads: [] },
  beta: { requires: [], provides: [], reads: [] },
  gamma: { requires: [], provides: [GAMMA_FACT], reads: [] },
  probe: {
    requires: [SESSION_REVISION],
    provides: [{ key: 'probe.out', protocol: '1' }],
    reads: [],
  },
}

export const HANDLER_MAX_OUTPUT_BYTES = 256

export type FixtureMaterials = Readonly<{
  materials: SqlMaterialCatalog
  directory: string
  remove(): Promise<void>
}>

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Writes the module files and returns the catalog that describes them. */
export async function createFixtureMaterials(): Promise<FixtureMaterials> {
  const directory = await mkdtemp(join(tmpdir(), 'sql-conformance-'))
  const write = async (name: string, source: string): Promise<{ url: string; digest: string }> => {
    const file = join(directory, `${name}.mjs`)
    await writeFile(file, source, 'utf8')
    return { url: pathToFileURL(file).href, digest: sha256Hex(source) }
  }
  const participants: ParticipantDescriptor[] = []
  for (const [name, source] of Object.entries(SOURCES)) {
    const { url, digest } = await write(`participant-${name}`, source)
    const facts = FACTS[name]
    if (facts === undefined) throw new Error(`fixture participant ${name} has no fact table`)
    participants.push({
      participant: name,
      protocol: '1',
      moduleUrl: url,
      codeDigest: digest,
      ownedTables: [`s_${name.replace('-', '_')}`],
      readTables: facts.reads,
      requiresFacts: facts.requires,
      providesFacts: facts.provides,
      allowedFunctions: [],
      grouping: 'groupable',
    })
  }
  const migrations: MigrationDescriptor[] = []
  const migrationRows: readonly [string, readonly { owner: string; id: string }[]][] = [
    ['session', []],
    ['agent-journal', [{ owner: 'session', id: '0001-base' }]],
    ['extra', []],
  ]
  for (const [owner, requires] of migrationRows) {
    const source = MIGRATION_SOURCE(owner, '0001-base')
    const { url, digest } = await write(`migration-${owner}`, source)
    migrations.push({ owner, id: '0001-base', moduleUrl: url, checksum: digest, requires })
  }
  const readHandlers: ReadHandlerDescriptor[] = []
  for (const [name, source] of Object.entries(HANDLER_SOURCES)) {
    const { url, digest } = await write(`handler-${name}`, source)
    const owner = name.startsWith('extra') ? 'extra' : 'session'
    readHandlers.push({
      handler: name,
      protocol: '1',
      moduleUrl: url,
      codeDigest: digest,
      ordering: 'snapshot',
      readTables: owner === 'session' ? ['s_session'] : [],
      requiresMigrations: [{ owner, id: '0001-base' }],
      maxOutputBytes: HANDLER_MAX_OUTPUT_BYTES,
      maxRowsRead: 10,
    })
  }
  return {
    materials: {
      catalogProtocol: 'sql-catalog/1',
      participants,
      migrations,
      readHandlers,
      declaredCombinations: {
        tenant: { combinationVersion: 'small-v1', participants: [...SMALL_PARTICIPANTS] },
        system: null,
      },
    },
    directory,
    remove: () => rm(directory, { recursive: true, force: true }),
  }
}
