import { RESULT_CONTEXT_KEY } from './session-result-reader.ts'
import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { FILES_CONTEXT_KEY } from '@omne-harness-lite/meta-files'
import { SHELL_CONTEXT_KEY } from '@omne-harness-lite/meta-shell'
import { readSessionFact } from '@omne-harness-lite/session-runtime'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  RuntimeContextOperations,
  ContextSourceRegistrations,
} from '@omne-harness-lite/runtime-context'
import type { BorrowedRunJournal } from '@omne-harness-lite/session-runtime-local'

/** Workspace comes from the durable Session creation, never from the daemon's cwd. */
export async function registerSessionWorkspace(
  context: RuntimeContextOperations & ContextSourceRegistrations,
  journal: Pick<BorrowedRunJournal, 'scope' | 'readPrefix'>,
) {
  const prefix = await journal.readPrefix()
  if ('failure' in prefix) throw new Error('Session workspace source unavailable')
  const created = prefix.entries.flatMap(entry => {
    const read = readSessionFact(entry)
    return 'fact' in read && read.fact.kind === 'session_created' ? [read.fact] : []
  })
  const original = created[0]
  if (created.length !== 1 || !original?.workspace || !isAbsolute(original.workspace))
    throw new Error('An absolute original Session workspace is required')
  const value = { cwd: original.workspace, envs: { PATH: '/usr/bin:/bin' } }
  const content = {
    key: SHELL_CONTEXT_KEY,
    revision: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
    observedAt: original.at,
    value,
  }
  return context.registerSource({
    name: 'session-workspace',
    consumers: ['tool'],
    requiredKeys: [SHELL_CONTEXT_KEY],
    recovery: 'reread_source',
    read: async scope =>
      scope.session === journal.scope.session && tenantIdEquals(scope.tenant, journal.scope.tenant)
        ? {
            kind: 'values',
            values: [
              content,
              {
                key: RESULT_CONTEXT_KEY,
                revision: journal.scope.session,
                observedAt: original.at,
                value: journal.scope.session,
              },
              {
                key: FILES_CONTEXT_KEY,
                revision: createHash('sha256')
                  .update(JSON.stringify({ cwd: original.workspace }))
                  .digest('hex'),
                observedAt: original.at,
                value: { cwd: original.workspace },
              },
            ],
          }
        : { kind: 'rejected', reason: 'notAuthorized' },
  })
}

export async function ensureSessionFilesRegistration(
  context: RuntimeContextOperations,
  access: import('@omne-harness-lite/session-tenancy').SessionAccess,
  scope: import('@omne-harness-lite/session-tenancy').SessionScope,
) {
  for (const key of [FILES_CONTEXT_KEY, RESULT_CONTEXT_KEY]) {
    const declaration = {
      key,
      source: 'session-workspace',
      config: null,
      consumers: ['tool'] as const,
      required: false,
      recovery: 'reread_source' as const,
    }
    function matches(entry: import('@omne-harness-lite/runtime-context').ContextRegistration) {
      return (
        entry.key === declaration.key &&
        entry.source === declaration.source &&
        entry.config === null &&
        entry.consumers.length === 1 &&
        entry.consumers[0] === 'tool' &&
        entry.required === false &&
        entry.recovery === declaration.recovery
      )
    }
    const current = await context.registrations(access, scope)
    if (current.kind !== 'registrations') throw new Error('Files registration unavailable')
    const existing = current.entries.find(entry => entry.key === key)
    if (existing) {
      if (!matches(existing)) throw new Error('Conflicting Files registration')
      continue
    }
    const result = await context.register(access, scope, declaration, current.revision)
    if (result.kind === 'applied') continue
    const recognized = await context.registrations(access, scope)
    if (recognized.kind === 'registrations' && recognized.entries.some(matches)) continue
    throw new Error('Files registration not confirmed')
  }
}
