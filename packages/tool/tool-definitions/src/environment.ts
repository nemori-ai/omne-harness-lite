import type {
  CommandFacility,
  CommandRetention,
  Containment,
  FacilityRequest,
  FileSystemFacility,
  TerminalFacility,
  TerminalRetention,
} from '@omne-harness/execution-environment-contract'

type BoundRequest<T> = Omit<T, keyof FacilityRequest<unknown> | 'named'>
type BoundMethod<T> = T extends (request: infer R) => infer Answer
  ? (request: BoundRequest<R>) => Answer
  : never
type BoundFacility<T> = { readonly [K in keyof T]: BoundMethod<T[K]> }

/** Optional consumer projection; old facilities fail closed for retained session operations. */
type BoundTerminal = Omit<BoundFacility<TerminalFacility<unknown>>, 'retention'> & {
  readonly retention?: BoundFacility<TerminalRetention<unknown>>
}
/**
 * Optional consumer projection; without it the retained processes cannot be read. `containment`
 * is the provider's declared containment; absent is not `sealed`.
 */
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

/** The host adds current authorization, fresh request identities and authorized object names. */
export type FilesAuthorEnvironment = Readonly<{
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
  command: BoundCommand
  terminal: BoundTerminal
  facts: Readonly<{
    os: string
    release: string
    architecture: string
    facilities: readonly string[]
  }>
}>
