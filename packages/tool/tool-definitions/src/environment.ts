import type {
  CommandFacility,
  CommandRetention,
  Containment,
  FacilityRequest,
  FilesScope,
  FileSystemFacility,
  ScreenFacility,
  TerminalFacility,
  TerminalRetention,
} from '@omne-harness/execution-environment-contract'
import type { ToolMediaSink } from '@omne-harness/tool-contract/provider'

type BoundRequest<T> = Omit<T, keyof FacilityRequest<unknown> | 'named'>
type BoundMethod<T> = T extends (request: infer R) => infer Answer
  ? (request: BoundRequest<R>) => Answer
  : never
type BoundFacility<T> = { readonly [K in keyof T]: BoundMethod<T[K]> }

type BoundTerminal = Omit<BoundFacility<TerminalFacility<unknown>>, 'retention'> & {
  readonly retention?: BoundFacility<TerminalRetention<unknown>>
}
type BoundCommand = Omit<BoundFacility<CommandFacility<unknown>>, 'retention' | 'containment'> & {
  readonly retention?: BoundFacility<CommandRetention<unknown>>
  readonly containment?: Containment
}
type FileOperations = Omit<
  BoundFacility<FileSystemFacility<unknown>>,
  'move' | 'copy' | 'commitBatch'
>
type Transfer = BoundRequest<Parameters<FileSystemFacility<unknown>['move']>[0]>
type Batch = BoundRequest<Parameters<FileSystemFacility<unknown>['commitBatch']>[0]>

export type FilesAuthorEnvironment = Readonly<{
  /** The working directory of this call: relative paths resolve against it. Absent: it has none. */
  directory?: string
  /** Where a command hands over a product for the model to perceive. */
  media: ToolMediaSink
  /** The files this call may read and write, pinned with its directory; names a refusal outside it. */
  scope?: FilesScope
  files: FileOperations & {
    move(
      request: Omit<Transfer, 'target'> & { readonly target: { readonly path: string } },
    ): ReturnType<FileSystemFacility<unknown>['move']>
    copy(
      request: Omit<Transfer, 'target'> & { readonly target: { readonly path: string } },
    ): ReturnType<FileSystemFacility<unknown>['copy']>
    commitBatch(request: {
      readonly entries: readonly Omit<Batch['entries'][number], 'named'>[]
    }): ReturnType<FileSystemFacility<unknown>['commitBatch']>
  }
}>

export type ShellAuthorEnvironment = Readonly<{
  /** The working directory of this call: where a command or a new terminal starts by default. */
  directory?: string
  /** The files this call may read and write, pinned with its directory; checked before a start. */
  scope?: FilesScope
  command: BoundCommand
  terminal: BoundTerminal
  facts: Readonly<{
    os: string
    release: string
    architecture: string
    facilities: readonly string[]
  }>
}>

export type ScreenAuthorEnvironment = Readonly<{
  screen: BoundFacility<ScreenFacility<unknown>>
  media: ToolMediaSink
}>
