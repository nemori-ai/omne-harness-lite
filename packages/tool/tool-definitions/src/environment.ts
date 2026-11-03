import type {
  CommandFacility,
  FacilityRequest,
  FacilityResult,
  FileSystemFacility,
  TerminalFacility,
  TerminalRef,
} from '@omne-harness/execution-environment-contract'

type BoundRequest<T> = Omit<T, keyof FacilityRequest<unknown> | 'named'>
type BoundMethod<T> = T extends (request: infer R) => infer Answer
  ? (request: BoundRequest<R>) => Answer
  : never
type BoundFacility<T> = { readonly [K in keyof T]: BoundMethod<T[K]> }

/** Optional consumer projection; old facilities fail closed for retained session operations. */
type BoundTerminal = Omit<BoundFacility<TerminalFacility<unknown>>, 'create'> & {
  create(
    request: BoundRequest<Parameters<TerminalFacility<unknown>['create']>[0]> & {
      readonly retain?: 'session'
    },
  ): ReturnType<TerminalFacility<unknown>['create']>
  attach?(request: {
    readonly terminal: TerminalRef
  }): Promise<FacilityResult<{ readonly terminal: TerminalRef }>>
  detach?(request: {
    readonly terminal: TerminalRef
  }): Promise<FacilityResult<{ readonly status: 'confirmed' | 'unconfirmed' }>>
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
  command: BoundFacility<CommandFacility<unknown>>
  terminal: BoundTerminal
  facts: Readonly<{
    os: string
    release: string
    architecture: string
    facilities: readonly string[]
  }>
}>
