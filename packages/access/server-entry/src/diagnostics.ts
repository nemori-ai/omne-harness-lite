// Structured diagnostics of the entry. An event names what happened and where; it never carries a
// request body, a response body, a login proof, a credential, a principal or a dependency's error
// text (SPEC「服务端的 HTTP 层责任」).
export type ServerEntryDiagnostic = Readonly<{
  code:
    | 'request.fault'
    | 'identity.fault'
    | 'issuer.fault'
    | 'session.read-fault'
    | 'session.commit-fault'
    | 'encode.fault'
    | 'observation.ended'
    | 'observation.cleanup-failed'
  path?: string
  operation?: string
}>

export type DiagnosticSink = (event: ServerEntryDiagnostic) => void

/** Emits one event. A sink that throws does not change the answer of a request. */
export function emit(sink: DiagnosticSink | undefined, event: ServerEntryDiagnostic): void {
  if (sink === undefined) return
  try {
    sink(event)
  } catch {
    // The sink is the host's; its failure is not this member's to report.
  }
}
