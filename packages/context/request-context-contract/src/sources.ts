import type * as M from '@omne-harness/model-contract'
import type {
  Access,
  Adoption,
  ContextTarget,
  GroupToken,
  PrincipalKey,
  RegistrationRef,
  SourceGeneration,
} from './refs.js'
import type {
  AdoptedRequestFact,
  AssemblyCall,
  GroupName,
  InputGroups,
  InvalidReason,
} from './values.js'
import type {
  AssemblyOperations,
  AssemblyPolicies,
  ConversionResultSource,
  HistorySource,
} from './ports.js'

export type SourceRead<T> =
  | Readonly<{ kind: 'value'; value: T }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; field: string; reason: InvalidReason }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type SourceGroupValue<P, K extends GroupName> = K extends 'context'
  ? Omit<InputGroups<P>['context'], 'adopted'>
  : InputGroups<P>[K]
export interface GroupSource<P, K extends GroupName> {
  readCount(call: AssemblyCall<P>): Promise<SourceRead<GroupToken>>
  readSource(call: AssemblyCall<P>): Promise<SourceRead<SourceGroupValue<P, K>>>
}
export type ContextGroupSources<P> = Readonly<{
  [K in Exclude<GroupName, 'identity'>]: GroupSource<P, K>
}>

export type AdoptedRead<P> = Readonly<{ access: Access<P>; target: ContextTarget }>
export interface AdoptedRequestSource<P> {
  readonly authority: Adoption
  readCount(input: AdoptedRead<P>): Promise<SourceRead<GroupToken>>
  readSource(input: AdoptedRead<P>): Promise<SourceRead<AdoptedRequestFact | null>>
}

export type SourceDecision =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export interface ContextReadEligibility<P> {
  check(
    input: Readonly<{
      access: Access<P>
      target: ContextTarget
      operation: 'history' | 'conversions' | 'assembly' | 'accounts'
    }>,
  ): Promise<
    | Readonly<{ kind: 'allowed'; revision: GroupToken }>
    | Readonly<{ kind: 'denied' }>
    | Readonly<{ kind: 'unknown' }>
    | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  >
}
export interface PrincipalBinding<P> {
  key(access: Access<P>): Promise<SourceRead<PrincipalKey>>
}

export type ContextSources<P> = Readonly<{
  groups: ContextGroupSources<P>
  adopted: AdoptedRequestSource<P>
  history: HistorySource<P>
  conversions: ConversionResultSource<P>
  eligibility: ContextReadEligibility<P>
  preparation: M.ModelPreparationResources<P>
}>

export interface SourceRegistrationAuthority<P> {
  check(
    input: Readonly<{
      access: Access<P>
      target: ContextTarget
      owner: Adoption
      action: 'register' | 'replace'
    }>,
  ): Promise<SourceDecision>
}
export type SourceSettlement =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'unavailable'; outstanding: readonly Adoption[] }>
export interface ContextRegistration {
  readonly ref: RegistrationRef
  readonly generation: SourceGeneration
  withdraw(): Readonly<{ kind: 'withdrawn'; settled: Promise<SourceSettlement> }>
}
export type RegistrationResult =
  | Readonly<{ kind: 'registered'; handle: ContextRegistration }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'invalid'; field: string; reason: InvalidReason }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export interface ContextSourceRegistry<P> {
  register(
    input: Readonly<{
      access: Access<P>
      target: ContextTarget
      owner: Adoption
      sources: ContextSources<P>
    }>,
  ): Promise<RegistrationResult>
  replace(
    input: Readonly<{ access: Access<P>; expected: RegistrationRef; sources: ContextSources<P> }>,
  ): Promise<RegistrationResult>
  assembly(target: ContextTarget): AssemblyOperations<P>
  close(): Promise<SourceSettlement>
}
export type ContextRegistryOptions<P> = Readonly<{
  principalBinding: PrincipalBinding<P>
  registrationAuthority: SourceRegistrationAuthority<P>
  policies: AssemblyPolicies
}>
