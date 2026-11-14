export type ServerEntryDiagnostic = Readonly<{
  code:
    | 'request.fault'
    | 'identity.fault'
    | 'settings.fault'
    | 'issuer.fault'
    | 'session.read-fault'
    | 'session.commit-fault'
    | 'session.definition-incomplete'
    | 'hitl.read-fault'
    | 'encode.fault'
    | 'observation.ended'
    | 'observation.cleanup-failed'
  path?: string
  operation?: string
}>

export type DiagnosticSink = (event: ServerEntryDiagnostic) => void

export function emit(sink: DiagnosticSink | undefined, event: ServerEntryDiagnostic): void {
  if (sink === undefined) return
  try {
    sink(event)
  } catch {}
}
