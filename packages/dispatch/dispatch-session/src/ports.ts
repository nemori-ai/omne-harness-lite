import type { PortRead } from '@omne-harness/dispatch'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ForkPoint,
  HistoryPage,
  InputFate,
  InputId,
  Modes,
  RoutedInput,
  RunId,
  SessionCreation,
  SessionFailure,
  SessionId,
  SessionOperationId,
  WorkSnapshot,
  WorkspaceSelection,
} from '@omne-harness/session-contract'

export type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>
/** The answer of a call of Session. `unknown`: it is not known whether the call was committed. */
export type Called<T> = Readonly<{ ok: T }> | Readonly<{ failure: SessionFailure }> | 'unknown'
type At = Readonly<{ tenant: TenantId; session: SessionId }>
type Write = At & Readonly<{ operation: SessionOperationId }>

/** What a dispatch fixes of the session it creates. The assembly adds what the definition and the release fix. */
export type CreationOfDispatch = Readonly<{
  agent: string
  standing: Required<Pick<SessionCreation, 'relation' | 'attendance' | 'initial'>> &
    Pick<SessionCreation, 'fork'>
  workspace: WorkspaceSelection | null
  /** The whole modes of a child session. Null: the session takes the defaults of its tenant. */
  modes: Modes | null
}>

/** The calls of Session a dispatch makes. The first three are made as the system principal of dispatch;
 * the rest as the work principal of the session they read or control, which the assembly issues. */
export type SessionCalls = Readonly<{
  create(input: Write & Readonly<{ creation: CreationOfDispatch }>): Promise<Called<unknown>>
  accept(input: Write & Readonly<{ value: Ordinary }>): Promise<Called<unknown>>
  fate(input: At & Readonly<{ input: InputId }>): Promise<Called<InputFate>>
  work(input: At): Promise<PortRead<WorkSnapshot | null>>
  modes(input: At): Promise<PortRead<Modes>>
  cancelRun(input: Write & Readonly<{ run: RunId }>): Promise<Called<unknown>>
  history(
    input: At & Readonly<{ kinds: readonly string[]; cursor: string | null; pageBytes: number }>,
  ): Promise<Called<HistoryPage>>
  /** The point the session can be forked at now, read as the session itself; null when it has none. */
  forkPoint(input: At): Promise<PortRead<ForkPoint | null>>
}>
