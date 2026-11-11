import type { HistoryEntry, WorkSnapshot } from '@omne-harness/session-contract'
import { z } from 'zod'
import { PermissionDefinitionRefSchema, PermissionRuleSchema } from '@omne-harness/permissions'
import { encodeValue, plainOf } from '../codec.ts'
import {
  SessionPermissionCurrentSchema,
  SessionPermissionHeadSchema,
  type SessionPermissionRead,
  type SessionPermissionReadResult,
} from '../permission-current.ts'
import { big, oneRow, text, type Executor, type Scope } from './support.ts'

const json = (value: unknown): string => JSON.stringify(encodeValue(value))
const assignmentChange = z.object({
  declaration: z.object({
    capabilityId: z.string().min(1),
    enforcementKey: z.string().min(1),
    definition: PermissionDefinitionRefSchema,
    rule: PermissionRuleSchema.nullable(),
  }),
})
const modeChange = z.object({
  declaration: z.object({
    kind: z.literal('permission-mode'),
    value: z.enum(['never', 'auto_permission', 'bypass-permissions']),
  }),
})

export function readPermissionHead(
  port: Executor,
  input: Pick<SessionPermissionRead, 'tenant' | 'session'>,
): z.infer<typeof SessionPermissionHeadSchema> | Readonly<{ kind: 'not-ready' }> {
  const { tenant, session } = input
  const head = oneRow(
    port,
    'SELECT revision, adopted, override, source FROM sl_permission_head WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  if (head === undefined) return { kind: 'not-ready' }
  return SessionPermissionHeadSchema.parse({
    kind: 'current',
    tenant,
    session,
    revision: String(big(head['revision'])),
    source: JSON.parse(text(head['source'])),
    mode: {
      adopted: JSON.parse(text(head['adopted'])),
      override: head['override'] === null ? null : JSON.parse(text(head['override'])),
    },
  })
}

/** Two exact-key reads; no snapshot or history scan is part of current permission lookup. */
export function readPermissionCurrent(
  port: Executor,
  input: SessionPermissionRead,
): SessionPermissionReadResult {
  const head = readPermissionHead(port, input)
  if (head.kind === 'not-ready') return head
  const { tenant, session, capabilityId, enforcementKey } = input
  const assignment = oneRow(
    port,
    'SELECT definition, rule, source FROM sl_permission_assignment WHERE tenant = ? AND session = ? AND capability = ? AND enforcement = ? LIMIT 1',
    [tenant, session, capabilityId, enforcementKey],
  )
  return SessionPermissionCurrentSchema.parse({
    ...head,
    capabilityId,
    enforcementKey,
    assignment:
      assignment === undefined
        ? null
        : {
            capabilityId,
            enforcementKey,
            definition: JSON.parse(text(assignment['definition'])),
            rule: JSON.parse(text(assignment['rule'])),
            source: JSON.parse(text(assignment['source'])),
          },
  })
}

function applyEvent(port: Executor, scope: Scope, row: HistoryEntry): void {
  if (row.kind !== 'session.permission-assigned' && row.kind !== 'session.mode-changed') return
  const payload = plainOf(row.payload)
  if (row.kind === 'session.mode-changed') {
    const parsed = modeChange.safeParse(payload)
    if (parsed.success)
      port.execute('UPDATE sl_permission_head SET override = ? WHERE tenant = ? AND session = ?', [
        json({ value: parsed.data.declaration.value, source: row.origin.source }),
        scope.tenant,
        scope.session,
      ])
    return
  }
  const { capabilityId, enforcementKey, rule, definition } =
    assignmentChange.parse(payload).declaration
  const key = [scope.tenant, scope.session, capabilityId, enforcementKey]
  if (rule === null) {
    port.execute(
      'DELETE FROM sl_permission_assignment WHERE tenant = ? AND session = ? AND capability = ? AND enforcement = ?',
      key,
    )
  } else {
    port.execute(
      `INSERT INTO sl_permission_assignment (tenant, session, capability, enforcement, definition, rule, source)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (tenant, session, capability, enforcement)
      DO UPDATE SET definition = excluded.definition, rule = excluded.rule, source = excluded.source`,
      [...key, json(definition), json(rule), json(row.origin.source)],
    )
  }
}

/** Called only by the original Session event writer in its existing transaction. */
export function writePermissionCurrent(
  port: Executor,
  scope: Scope,
  previous: WorkSnapshot | null,
  snapshot: WorkSnapshot,
  entries: readonly HistoryEntry[],
): void {
  if (previous === null) {
    port.execute(
      'INSERT INTO sl_permission_head (tenant, session, revision, adopted, override, source) VALUES (?, ?, ?, ?, NULL, ?)',
      [
        scope.tenant,
        scope.session,
        BigInt(snapshot.permissions.revision),
        json(snapshot.creation.modes),
        json(snapshot.source),
      ],
    )
  } else {
    if (previous.permissions.revision === snapshot.permissions.revision) return
    const result = port.execute(
      'UPDATE sl_permission_head SET revision = ?, source = ? WHERE tenant = ? AND session = ? AND revision = ?',
      [
        BigInt(snapshot.permissions.revision),
        json(snapshot.source),
        scope.tenant,
        scope.session,
        BigInt(previous.permissions.revision),
      ],
    )
    if (result.changes !== 1n) throw new Error('Session permission projection is not current')
  }
  for (const row of entries) applyEvent(port, scope, row)
}
