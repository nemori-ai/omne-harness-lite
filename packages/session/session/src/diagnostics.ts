import type { RunId, SessionId, WorkSnapshot } from '@omne-harness/session-contract'

export type SessionDiagnostic = Readonly<{
  owner: 'S1' | 'C2'
  step:
    | 'read'
    | 'startRun'
    | 'replay'
    | 'invoke'
    | 'submit'
    | 'receive'
    | 'finishRun'
    | 'freeze'
    | 'detach'
    | 'claim'
    | 'resume'
  tenant: WorkSnapshot['tenant']
  session: SessionId
  run: RunId | null
  reason: string
  detail: string
}>

// Called synchronously; a throw changes nothing. It must not call back into the instance.
export type SessionDiagnose = (diagnostic: SessionDiagnostic) => void
