export type EnvironmentBinding =
  | { readonly kind: 'host_machine' }
  | { readonly kind: 'stateless_sandbox'; readonly callId: string }
  | { readonly kind: 'session_sandbox'; readonly sessionId: string }
  | { readonly kind: 'tenant_sandbox'; readonly tenantId: string }

export type EnvironmentContinuity =
  | { readonly kind: 'not_guaranteed' }
  | { readonly kind: 'continuous'; readonly dataId: string; readonly revision: string }
  | { readonly kind: 'lost'; readonly previous: string }

export type FacilityReason =
  | 'invalidInput'
  | 'notAuthorized'
  | 'notFound'
  | 'conflict'
  | 'unsupported'
  | 'closed'
  | 'unavailable'
  | 'effectUnknown'

export type FacilityResult<T> =
  | { readonly kind: 'done'; readonly requestId: string; readonly value: T }
  | { readonly kind: 'unresolved'; readonly requestId: string }
  | { readonly kind: 'rejected'; readonly requestId: string; readonly reason: FacilityReason }
  | { readonly kind: 'unknown'; readonly requestId: string }

export type ObjectToken = { readonly token: string }

export type HandleGeneration = {
  readonly object: ObjectToken
  readonly generation: string
}

export type FileRequest = {
  readonly requestId: string
  readonly originalCallId: string
  readonly subjectId: string
  readonly binding: EnvironmentBinding
  readonly path: string
  readonly named: ObjectToken | null
}

export type FileReadValue = {
  readonly object: ObjectToken
  readonly handle: HandleGeneration
  readonly bytes: Uint8Array
}

export type FileIdentityValue = {
  readonly object: ObjectToken
  readonly handle: HandleGeneration
}

export type FileCloseValue = {
  readonly handle: HandleGeneration
}

export type FileFacility = {
  readonly read: (request: FileRequest) => Promise<FacilityResult<FileReadValue>>
  readonly stat: (request: FileRequest) => Promise<FacilityResult<FileIdentityValue>>
  readonly write: (
    request: FileRequest & { readonly bytes: Uint8Array },
  ) => Promise<FacilityResult<FileIdentityValue>>
  readonly close: (
    request: FileRequest & { readonly handle: HandleGeneration },
  ) => Promise<FacilityResult<FileCloseValue>>
}

export type CommandRequest = {
  readonly requestId: string
  readonly originalCallId: string
  readonly subjectId: string
  readonly binding: EnvironmentBinding
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
}

export type CommandFacility = {
  readonly start: (request: CommandRequest) => Promise<FacilityResult<{ readonly processId: string }>>
}

export type EnvironmentProvider = {
  readonly name: string
  readonly bindingKinds: readonly EnvironmentBinding['kind'][]
  readonly facilities: ReadonlyMap<string, unknown>
  readonly acquire: (placement: {
    readonly binding: EnvironmentBinding
    readonly continuity: EnvironmentContinuity
    readonly tenantId: string
    readonly callId: string
  }) => Promise<
    | { readonly kind: 'acquired'; readonly lease: EnvironmentLease }
    | { readonly kind: 'rejected'; readonly reason: 'missingFacility' }
  >
}

export type EnvironmentLease = {
  readonly binding: EnvironmentBinding
  readonly continuity: EnvironmentContinuity
  readonly instance: { readonly id: string; readonly generation: string }
  readonly facility: (name: string) => unknown | undefined
  readonly release: () => Promise<
    { readonly kind: 'released' } | { readonly kind: 'pending' }
  >
}

export type PlacementInput = {
  readonly tenantId: string
  readonly callId: string
  readonly binding: EnvironmentBinding
  readonly facilities: readonly string[]
}

export type PlacementResult =
  | {
      readonly kind: 'placement'
      readonly binding: EnvironmentBinding
      readonly continuity: EnvironmentContinuity
    }
  | { readonly kind: 'rejected'; readonly reason: 'notAuthorized' | 'noMatchingEnvironment' }

export type AcquireResult =
  | { readonly kind: 'acquired'; readonly lease: EnvironmentLease }
  | {
      readonly kind: 'rejected'
      readonly reason: 'missingFacility' | 'noMatchingEnvironment' | 'notAuthorized'
    }

export type ExecutionEnvironment = {
  readonly resolvePlacement: (input: PlacementInput) => Promise<PlacementResult>
  readonly acquire: (input: PlacementInput) => Promise<AcquireResult>
  readonly registerProvider: (provider: EnvironmentProvider) => () => Promise<void>
}
