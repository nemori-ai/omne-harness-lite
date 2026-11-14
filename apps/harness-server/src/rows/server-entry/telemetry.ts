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

const CODES = [
  'request.fault',
  'identity.fault',
  'settings.fault',
  'issuer.fault',
  'session.read-fault',
  'session.commit-fault',
  'session.definition-incomplete',
  'hitl.read-fault',
  'encode.fault',
  'observation.ended',
  'observation.cleanup-failed',
] as const satisfies readonly Code[]
const exhaustive: [Code] extends [(typeof CODES)[number]] ? true : never = true
void exhaustive

const OWNER = 'server-entry'

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

function admits(fields: EntryFields): boolean {
  return validateFields(entryDiagnosticDefinition, fields).kind === 'ok'
}

function pathOf(text: string): string | undefined {
  if (text === '') return undefined
  try {
    return new URL(text, 'http://localhost').pathname
  } catch {
    return undefined
  }
}

function fieldsOf(event: ServerEntryDiagnostic): EntryFields {
  const { code, operation } = event
  const path = event.path === undefined ? undefined : pathOf(event.path)
  return {
    code,
    ...(path !== undefined && admits({ code, path }) && { path }),
    ...(operation !== undefined && admits({ code, operation }) && { operation }),
  }
}

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
