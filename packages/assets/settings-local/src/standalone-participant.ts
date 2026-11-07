import { writePublication } from './standalone-publication-record.ts'
import { isIndependentTargetInDomain } from './standalone-records.ts'
import { sourceWriteIsOpen, sourceTargetWriteBinding } from './source-write.ts'
import { readStandaloneSettingsRecord as row } from './standalone-records.ts'
import { defineSettings } from '@omne-harness/settings'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest, stateKey, withinBudget } from './encoding.ts'
import { domainSchema } from './schema.ts'
import {
  StandaloneMutationSchema,
  STANDALONE_PARTICIPANT,
  STANDALONE_PROTOCOL,
} from './standalone-schema.ts'
const fail = (reason: string) => ({
  kind: 'conflict' as const,
  basis: { kind: 'rejected', reason },
})
function adoptDefinition(
  port: ParticipantPort,
  record: Extract<
    ReturnType<typeof StandaloneMutationSchema.parse>,
    { kind: 'provision' }
  >['record'],
) {
  const defined = defineSettings(record.definition)
  if (defined.kind !== 'defined') return fail('invalid_input')
  if (record.grants.some(g => !record.sources.some(source => source.sourceId === g.sourceId)))
    return fail('invalid_input')
  const definition = defined.definition
  const definitionRef = {
    providerId: definition.providerId,
    definitionId: definition.definitionId,
    version: definition.version,
    digest: digest(definition),
  }
  const definitionKey = canonical([
    definition.providerId,
    definition.definitionId,
    definition.version,
  ])
  const existing = port.execute(
    'SELECT digest FROM st_definitions WHERE definition_key = ? LIMIT 1',
    [definitionKey],
  ).rows[0]?.[0]
  if (existing !== undefined && existing !== definitionRef.digest) return fail('definition_changed')
  port.execute(
    'INSERT INTO st_definitions (definition_key, digest) VALUES (?, ?) ON CONFLICT(definition_key) DO NOTHING',
    [definitionKey, definitionRef.digest],
  )
  return { definition, definitionRef }
}
function nextOwnerRevision(previous: ReturnType<typeof row>, expectedRevision: number | null) {
  if (previous?.projection.ownerRevision !== (expectedRevision ?? undefined))
    return fail('revision_conflict')
  if (previous?.retired) return fail('forbidden')
  if ((previous?.projection.ownerRevision ?? 0) >= Number.MAX_SAFE_INTEGER - 1)
    return fail('limit_exceeded')
  const revision = (previous?.projection.ownerRevision ?? 0) + 1
  return { kind: 'revision' as const, revision }
}
function mutate(facts: Readonly<Record<string, unknown>>, port: ParticipantPort) {
  const domain = domainSchema.parse(facts['domain'])
  const command = StandaloneMutationSchema.parse(facts['command'])
  if (!sourceWriteIsOpen(port, sourceTargetWriteBinding(domain, command))) return fail('forbidden')
  const target = command.kind === 'provision' ? command.record.target : command.target
  if (!isIndependentTargetInDomain(domain, target)) return fail('forbidden')
  const key = stateKey(domain.scope, target)
  const previous = row(port, key)
  const nextRevision = nextOwnerRevision(previous, command.expectedRevision)
  if (nextRevision.kind === 'conflict') return nextRevision
  const revision = nextRevision.revision
  let next
  if (command.kind === 'retire') {
    if (!previous) return fail('forbidden')
    next = {
      ...previous,
      retired: true,
      projection: { ...previous.projection, ownerRevision: revision },
    }
  } else {
    const record = command.record
    const adopted = adoptDefinition(port, record)
    if ('kind' in adopted) return adopted
    const { definition, definitionRef } = adopted
    next = {
      retired: false,
      projection: {
        target,
        enabled: true,
        definition,
        definitionRef,
        sourceLayout: { kind: 'bound', sources: record.sources },
        grants: record.grants,
        ownerRevision: revision,
      },
    }
  }
  port.execute(
    'INSERT INTO st_targets (target_key, scope_ref, retired, record) VALUES (?, ?, ?, ?) ON CONFLICT(target_key) DO UPDATE SET retired=excluded.retired, record=excluded.record',
    [key, target.scopeRef, next.retired ? 1 : 0, canonical(next)],
  )
  if (command.kind === 'provision') writePublication(port, key, command.record.publicationRef)
  return { kind: 'participated' as const, response: { kind: 'changed', revision } }
}
export default {
  participant: STANDALONE_PARTICIPANT,
  protocol: STANDALONE_PROTOCOL,
  execute(facts, port) {
    if (!withinBudget(facts)) return fail('limit_exceeded')
    try {
      if (facts['kind'] === 'mutate') return mutate(facts, port)
      return fail('invalid_input')
    } catch {
      return { kind: 'failed', diagnostic: 'settings_target_invalid_data' }
    }
  },
} satisfies ParticipantModule
