// The telemetry facade of the `server-entry` row: the member's `ServerEntryDiagnostic` becomes the
// event `omne.entry.diagnostic`. The member does not know the telemetry key; the row binds the
// system scope (the entry's faults are the process's own facts, never a tenant's) and projects the
// diagnostic into the fields the contract allows: an enum code and two optional bounded references.
import { systemScope } from '@omne-harness/legal-identity'
import type { DiagnosticSink, ServerEntryDiagnostic } from '@omne-harness/server-entry'
import {
  defineEvent,
  validateFields,
  type Fields,
  type TelemetryPort,
} from '@omne-harness/telemetry-contract'
import { processInstance } from '../telemetry/instance.ts'

type Code = ServerEntryDiagnostic['code']

/** Every diagnostic code of the member, so the enum and the member's type move together. */
const CODES = [
  'request.fault',
  'identity.fault',
  'model-credential.fault',
  'issuer.fault',
  'session.read-fault',
  'session.commit-fault',
  'session.definition-incomplete',
  'encode.fault',
  'observation.ended',
  'observation.cleanup-failed',
] as const satisfies readonly Code[]
// A code the member adds without this table fails here, not at run time.
const exhaustive: [Code] extends [(typeof CODES)[number]] ? true : never = true
void exhaustive

const OWNER = 'server-entry'

/**
 * The one event of the entry. `path` and `operation` are optional: a diagnostic carries them only
 * when it has them, and the record shows exactly the members the diagnostic had.
 */
export const entryDiagnosticDefinition = defineEvent({
  owner: OWNER,
  name: 'omne.entry.diagnostic',
  version: 1,
  level: 'warn',
  schema: {
    code: { kind: 'enum', values: CODES },
    path: { kind: 'ref', owner: OWNER, maxBytes: 256, optional: true },
    operation: { kind: 'ref', owner: OWNER, maxBytes: 128, optional: true },
  },
})

type EntryFields = Fields<typeof entryDiagnosticDefinition.schema>

/** True when the contract admits this one reference next to the code. */
function admits(fields: EntryFields): boolean {
  return validateFields(entryDiagnosticDefinition, fields).kind === 'ok'
}

/**
 * The path of a request URL, without its query and fragment. `request.fault` carries the URL as the
 * client sent it; a query is client text and may hold a credential, so only the path is a field.
 * An empty text or one that does not parse as a URL gives no path.
 */
function pathOf(text: string): string | undefined {
  if (text === '') return undefined
  try {
    return new URL(text, 'http://localhost').pathname
  } catch {
    return undefined
  }
}

/**
 * The fields of one diagnostic. A reference the contract refuses (empty, too long, not printable
 * ASCII) is left out, so the record keeps the code and the other reference.
 */
function fieldsOf(event: ServerEntryDiagnostic): EntryFields {
  const { code, operation } = event
  const path = event.path === undefined ? undefined : pathOf(event.path)
  return {
    code,
    ...(path !== undefined && admits({ code, path }) && { path }),
    ...(operation !== undefined && admits({ code, operation }) && { operation }),
  }
}

/**
 * The `diagnostics` sink of `createServerEntry`, bound once at row build: system scope, component
 * `server-entry`, the process instance. The member's `emit` already shields a throwing sink, and
 * the port never throws (TC-1).
 */
export function entryDiagnostics(telemetry: TelemetryPort): DiagnosticSink {
  const emitter = telemetry.bind({
    scope: systemScope(),
    component: OWNER,
    instance: processInstance,
  })
  return event => {
    emitter.event(entryDiagnosticDefinition, fieldsOf(event))
  }
}
