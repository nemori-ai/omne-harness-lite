// Public entry of server-entry: the constructor of the loopback HTTP JSON and SSE entry and the
// shapes of its configuration and dependencies. Behavior is in SPEC.md; the HTTP carriage is the
// public contract's binding page.
export { createServerEntry } from './http.ts'
export type { Listening, ServerEntry, ServerEntryDependencies } from './http.ts'
export type { JsonBudgets, ServerEntryConfig } from './config.ts'
export { ServerEntryConfigError } from './config.ts'
export type { DefinitionResolver, ResolvedDefinition, SessionIngressFaces } from './faces.ts'
export type { DiagnosticSink, ServerEntryDiagnostic } from './diagnostics.ts'
