// Representative entries of one session log, sized like the 2026-11-04 e2e sample
// (parallel-handover/sl-shrink-design.md section 0): a creation batch with two resident tools whose
// shapes hold JSON Schema texts, and the producer facts and a tool message of one model call. The
// evidence records embed the tenant text the way the Journal stub mints them today, so the byte
// counts of `fact.source` are of the real order of magnitude.
import { tenantCodec } from '@omne-harness/legal-identity'
import type { HistoryEntry } from '../src/faces.ts'
import type { DurableEvidence, SessionOperationId, SessionId } from '../src/identity.ts'
import type { SessionEntry } from '../src/entries.ts'
import { toJsonValue } from '../src/entries.ts'
import type { InitialAdoption, ResidentTool } from '../src/values.ts'
import { adoption, creation, testingTenant } from '../src/testing-values.ts'

export const TENANT = testingTenant(
  'org_c0nf0rmance000000000000000',
  'acc_c0nf0rmance000000000000000',
)
const TENANT_TEXT = (() => {
  const encoded = tenantCodec.encode(TENANT)
  if (!encoded.ok) throw new Error('unencodable tenant')
  return encoded.value
})()
export const SESSION = 'a'.repeat(64) as SessionId
export const OPERATION = `sop_${'b'.repeat(64)}` as SessionOperationId

const hex = (seed: string): string => seed.repeat(64).slice(0, 64)

/** One command table of a resident tool: names, descriptions and a JSON Schema text per command. */
function shapeOf(tool: string, commands: readonly string[]): HistoryEntry['payload'] {
  return toJsonValue({
    tool,
    commands: commands.map(name => ({
      name,
      description: `${tool}.${name}: performs the ${name} operation on the workspace of the session`,
      parameters: JSON.stringify({
        type: 'object',
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: { type: 'string', minLength: 1, description: 'A path relative to the workspace' },
          offset: { type: 'integer', minimum: 0, description: 'The first line to read' },
          limit: { type: 'integer', minimum: 1, maximum: 2000, description: 'Lines to read' },
          pattern: { type: 'string', description: 'A glob or regular expression' },
          content: { type: 'string', description: 'The new content of the file' },
        },
      }),
    })),
  })
}

function assetEvidence(name: string): DurableEvidence {
  return {
    owner: '@omne-harness/harness-server',
    record: `tool-release.json#${name}/asset`,
    revision: '1',
    digest: `sha256:${hex(name.slice(0, 1).toLowerCase())}`,
  }
}

export const RESIDENTS: readonly ResidentTool[] = [
  {
    capability: 'Files',
    version: '1.0.0',
    shape: shapeOf('Files', ['read', 'write', 'edit', 'list', 'glob', 'grep']),
    admitted: assetEvidence('Files'),
  },
  {
    capability: 'Shell',
    version: '1.0.0',
    shape: shapeOf('Shell', ['run', 'background', 'output', 'kill', 'list']),
    admitted: assetEvidence('Shell'),
  },
]

const distribution = (record: string): DurableEvidence => ({
  owner: '@omne-harness/harness-server',
  record: `serve.distribution.json#${record}`,
  revision: '1',
  digest: `sha256:${hex('d')}`,
})

export const INITIAL_ADOPTION: InitialAdoption = {
  definitionName: 'coding',
  adopted: adoption('coding@1'),
  source: distribution('coding/source'),
  boundary: distribution('coding/boundary'),
  inputSnapshot: { kind: 'json', value: toJsonValue({ definition: 'coding' }) } as never,
  capabilities: {
    kind: 'json',
    value: toJsonValue({
      definition: 'coding',
      execution: 'agent-loop',
      entryContract: 'interactive@1',
      modes: ['default', 'plan'],
      initialModel: { route: 'default', model: 'deepseek-chat' },
      residents: ['Files', 'Shell'],
    }),
  } as never,
  residentBindings: [
    { capability: 'Files', key: `rk1:${hex('f')}` as never },
    { capability: 'Shell', key: `rk1:${hex('5')}` as never },
  ],
  newResidents: RESIDENTS,
  candidate: adoption('coding@1'),
}

const CREATION = creation({
  definition: { name: 'coding', candidate: adoption('coding@1') },
  purpose: 'coding session of the e2e sample',
})

const createdInput = toJsonValue({
  tenant: TENANT_TEXT,
  session: SESSION,
  operation: OPERATION,
  creation: { ...CREATION, workspace: null },
})

/** The Journal evidence of one received material, with the tenant nested the way it is today. */
function journalEvidence(what: string): DurableEvidence {
  const namespace = JSON.stringify([TENANT_TEXT, SESSION])
  const reference = JSON.stringify(['model-invocation', 1, TENANT_TEXT, `call_${what}`, 'adm_1'])
  const record = JSON.stringify([
    namespace,
    'received-material',
    JSON.stringify([TENANT_TEXT, `run_${hex('9')}/execution`]),
    { key: reference },
    { consumer: reference },
    `consumption_${what}`,
  ])
  return {
    owner: 'session-memory-journal',
    record,
    revision: '7',
    digest: `memory:${record}@7`,
  }
}

const PRODUCER = {
  kind: 'model' as const,
  call: JSON.stringify(['model-invocation', 1, TENANT_TEXT, 'call_main_1', 'adm_1']),
}

export type Sample = Readonly<{
  name: string
  entry: SessionEntry
  origin: HistoryEntry['origin']
}>

const origin = (source: DurableEvidence): HistoryEntry['origin'] => ({
  owner: 'session',
  via: null,
  source,
})

const executionSource = journalEvidence('exec')
const accountSource = journalEvidence('account')
const releaseSource = journalEvidence('release')
const toolSource = journalEvidence('tool-result')
const { candidate: _candidate, ...adoptionWithoutCandidate } = INITIAL_ADOPTION

/** The creation batch in commit order, then the entries of one model call. */
export const SAMPLES: readonly Sample[] = [
  {
    name: 'session.created (SE01)',
    entry: {
      kind: 'session.created',
      tenant: TENANT,
      session: SESSION,
      operation: OPERATION,
      creation: CREATION,
      initializationProtocol: 1,
      initialAdoption: INITIAL_ADOPTION,
      requirements: [],
      plan: [],
      input: createdInput,
      items: [],
    },
    origin: origin(INITIAL_ADOPTION.source),
  },
  {
    name: 'session.adoption (SE08)',
    entry: {
      kind: 'session.adoption',
      adopted: INITIAL_ADOPTION.adopted,
      residentKeys: INITIAL_ADOPTION.residentBindings,
      initialization: {
        createOperation: OPERATION,
        item: null,
        adoption: adoptionWithoutCandidate,
      },
    },
    origin: origin(INITIAL_ADOPTION.source),
  },
  ...RESIDENTS.map(resident => ({
    name: `session.tool-resident-admitted (SE36 ${resident.capability})`,
    entry: { kind: 'session.tool-resident-admitted' as const, resident },
    origin: origin(INITIAL_ADOPTION.source),
  })),
  {
    name: 'call.execution-fact (SE19 execution)',
    entry: {
      kind: 'call.execution-fact',
      fact: { kind: 'execution', producer: PRODUCER, source: executionSource },
    },
    origin: origin(executionSource),
  },
  {
    name: 'account.linked (SE32)',
    entry: {
      kind: 'account.linked',
      fact: { kind: 'account', producer: PRODUCER, source: accountSource },
    },
    origin: origin(accountSource),
  },
  {
    name: 'call.execution-fact (SE19 release)',
    entry: {
      kind: 'call.execution-fact',
      fact: {
        kind: 'release',
        consumption: `consumption_${hex('c')}` as never,
        result: {
          producer: PRODUCER,
          version: '1',
          delivery: null,
          source: journalEvidence('result'),
        },
        source: releaseSource,
      },
    },
    origin: origin(releaseSource),
  },
  {
    name: 'message.tool (SE10)',
    entry: {
      kind: 'message.tool',
      message: {
        id: 'msg_c0nf0rmance0000000000002',
        role: 'tool',
        call: 'call_main_1',
        blocks: [{ kind: 'text', text: 'file contents '.repeat(40) }],
      } as never,
      source: toolSource,
      admission: journalEvidence('admission'),
      consumption: null,
      participation: null,
    },
    origin: origin(toolSource),
  },
]
