// The adoption source of Session over the deployment mapping. It reads the table that the
// `agent-adoptions` row provides and no other data. It prepares guard material only: it holds no
// transaction port and writes nothing. A definition that the table does not hold gets a failure and
// no material, so the caller has nothing to commit.
import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import { SessionAdoptionSourceService } from '@omne-harness/session-cordis-contract/cordis'
import {
  canonicalText,
  contentDigest,
  modesAdoptionOf,
  type DefinitionMappingEntry,
  type DefinitionMappings,
} from '@omne-harness/server-entry/cordis'
import type {
  AdoptionEvidenceCommand,
  GuardCommand,
  SessionAdoptionSource,
  SessionCreation,
} from '@omne-harness/session-contract'

/** The protocol of the material of this source. It names the shape of `facts`, not an authority. */
export const MAPPING_EVIDENCE_PROTOCOL = Object.freeze({
  owner: '@omne-harness/harness-server',
  name: 'definition-mapping-evidence',
  revision: '1',
  digest: 'harness-server:definition-mapping-evidence/1',
})

type Facts = GuardCommand['facts']
type Prepared = Awaited<ReturnType<SessionAdoptionSource['prepare']>>

const same = (a: unknown, b: unknown): boolean => canonicalText(a) === canonicalText(b)

function jsonOf(plain: unknown): Facts {
  if (plain === null || plain === undefined) return { kind: 'null' }
  if (typeof plain === 'string') return { kind: 'string', value: plain }
  if (typeof plain === 'boolean') return { kind: 'boolean', value: plain }
  if (typeof plain === 'number') return { kind: 'number', lexeme: String(plain) }
  if (Array.isArray(plain)) return { kind: 'array', items: plain.map(jsonOf) }
  const entries = Object.entries(plain as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: jsonOf(value) }))
  return { kind: 'object', entries }
}

function invalid(field: string, reason: string): Prepared {
  return fail({ kind: 'invalid', field, reason })
}

/** The first part of a created session that disagrees with the entry, or `undefined`. */
function creationMismatch(
  entry: DefinitionMappingEntry,
  creation: SessionCreation,
): string | undefined {
  if (!same(creation.definition.candidate, entry.candidate)) return 'definition.candidate'
  if (!same(creation.execution, entry.execution)) return 'execution'
  if (!same(creation.entryContract, entry.entryContract)) return 'entryContract'
  if (!same(creation.requiredIdentities, entry.requiredIdentities)) return 'requiredIdentities'
  const modes = creation.modes
  const expected =
    modes.kind === 'tenant-default'
      ? same(modes.source, modesAdoptionOf(entry))
      : same(modes.value, entry.modes)
  return expected ? undefined : 'modes'
}

function materialOf(
  mappings: DefinitionMappings,
  command: AdoptionEvidenceCommand['kind'],
  entry: DefinitionMappingEntry,
): GuardCommand {
  return {
    owner: 'definition-mapping',
    participant: 'session-evidence',
    protocol: MAPPING_EVIDENCE_PROTOCOL,
    facts: jsonOf({
      version: 1,
      command,
      definition: entry.name,
      candidate: entry.candidate,
      table: mappings.identity,
      entry: contentDigest(entry),
    }),
  }
}

function prepareFrom(mappings: DefinitionMappings, command: AdoptionEvidenceCommand): Prepared {
  switch (command.kind) {
    case 'create': {
      const { creation } = command.input
      const entry = mappings.byName(creation.definition.name)
      if (entry === undefined)
        return invalid('definition', 'the definition name is not in the deployment mapping')
      const mismatch = creationMismatch(entry, creation)
      if (mismatch !== undefined)
        return invalid(mismatch, 'the creation does not match the mapping entry of its definition')
      return succeed([materialOf(mappings, command.kind, entry)])
    }
    case 'startRun':
    case 'reload': {
      const entry = mappings.byCandidate(command.input.candidate)
      if (entry === undefined)
        return invalid('candidate', 'the candidate is not a definition adoption of this deployment')
      return succeed([materialOf(mappings, command.kind, entry)])
    }
    // These commands carry no definition to evaluate. The adoption that they rely on was recorded
    // when the session was created or the run started, and is not read again from the table.
    case 'completeInitialization':
    case 'change':
    case 'freeze':
      return succeed([])
  }
}

export class AdoptionSourcesImpl extends SessionAdoptionSourceService {
  /** The table that this source reads. It is the `definitionMappings` service of the same row tree. */
  readonly mappings: DefinitionMappings

  constructor(ctx: Context, mappings: DefinitionMappings) {
    super(ctx)
    this.mappings = mappings
  }

  readonly prepare: SessionAdoptionSource['prepare'] = async command =>
    prepareFrom(this.mappings, command)
}
