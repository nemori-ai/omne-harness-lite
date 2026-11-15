import type {
  Codec,
  GovernanceProvidedOperation,
  GovernanceRequest,
  GovernanceResponse,
  LoginStateId,
} from '@omne-harness/public-contract'
import { expectTypeOf, test } from 'vitest'
import type { IdentityProtocol } from '@omne-harness/identity-protocol'

type Operations = IdentityProtocol['operations']
type Name = keyof Operations
type ValueOf<C> = C extends Codec<infer T> ? T : never
type Field<O extends Name, F extends string> = Operations[O] extends { readonly [K in F]: infer V }
  ? V
  : never
type Outcomes<O extends Name> = Field<O, 'outcomes'>
type RequestOf<O extends Name> = ValueOf<Field<O, 'body'>>
type BodyOf<O extends Name, K extends PropertyKey> = ValueOf<Outcomes<O>[K & keyof Outcomes<O>]>

type OldRequest<O extends GovernanceProvidedOperation> = GovernanceRequest<O>['body']
type OldBody<O extends GovernanceProvidedOperation, K extends PropertyKey> = Extract<
  GovernanceResponse<O>,
  { readonly outcome: K }
>['body']
type OldOutcomes<O extends GovernanceProvidedOperation> = Exclude<
  GovernanceResponse<O>['outcome'],
  'protocol-rejected' | 'stage-not-provided'
>

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type AllTrue<T> = { readonly [K in keyof T]: true }
type Flat<T> = { [K in keyof T]: T[K] } & {}
type Matches<New, Old> =
  Same<New, Flat<Old>> extends true
    ? true
    : Same<New, {}> extends true
      ? Same<Old, Readonly<Record<string, never>>>
      : false

type Pipeline<O extends Name> =
  | 'protocol-rejected'
  | 'basis-unavailable'
  | (Field<O, 'identity'> extends 'none' ? never : 'denied')
  | (Field<O, 'effect'> extends 'commit' ? 'unknown' : never)

type Differs = 'issue-login' | 'query-own-valid-logins'

test('the operations are the governance family minus health, settings and stages', () => {
  type Expected = Exclude<
    GovernanceProvidedOperation,
    'public-health' | 'list-settings' | 'set-setting' | 'describe-setting' | 'clear-setting'
  >
  expectTypeOf<Name>().toEqualTypeOf<Expected>()
})

test('C4: the outcome names are the old business outcomes, the pipeline outcomes and stage-not-provided', () => {
  type Check = {
    readonly [O in Name]: Same<
      keyof Outcomes<O>,
      OldOutcomes<O> | Pipeline<O> | 'stage-not-provided'
    >
  }
  expectTypeOf<Check>().toEqualTypeOf<AllTrue<Check>>()
  expectTypeOf<Field<'query-create-organization', 'effect'>>().toEqualTypeOf<'read'>()
  expectTypeOf<Outcomes<'query-create-organization'>['unknown']>().toEqualTypeOf<true>()
})

test('C4: every commit operation has unknown', () => {
  type Commits = { [O in Name]: Field<O, 'effect'> extends 'commit' ? O : never }[Name]
  expectTypeOf<Commits>().toEqualTypeOf<
    | 'register-and-activate'
    | 'issue-login'
    | 'revoke-login'
    | 'replace-credential'
    | 'issue-member-invitation'
    | 'open-affiliation-request'
    | 'accept-member-invitation'
    | 'reject-member-invitation'
    | 'withdraw-member-invitation'
    | 'create-organization'
    | 'leave-organization'
    | 'remove-member'
    | 'change-member-role'
    | 'switch-current-tenant'
    | 'accept-affiliation-request'
    | 'reject-affiliation-request'
    | 'withdraw-affiliation-request'
    | 'release-affiliation'
    | 'submit-authorization-expression'
    | 'withdraw-authorization-expression'
  >()
  type Check = { readonly [O in Commits]: 'unknown' extends keyof Outcomes<O> ? true : false }
  expectTypeOf<Check>().toEqualTypeOf<AllTrue<Check>>()
})

test('C2: every request body is the old request body', () => {
  type Check = { readonly [O in Name]: Matches<RequestOf<O>, OldRequest<O>> }
  expectTypeOf<Check>().toEqualTypeOf<AllTrue<Check>>()
})

test('C2: every succeeded body is the old one, except the two below', () => {
  type Check = {
    readonly [O in Exclude<Name, Differs>]: Matches<BodyOf<O, 'succeeded'>, OldBody<O, 'succeeded'>>
  }
  expectTypeOf<Check>().toEqualTypeOf<AllTrue<Check>>()
})

test('C2 and decision 9: issue-login answers loginId always; the old body had it optional', () => {
  type Old = OldBody<'issue-login', 'succeeded'>
  type Expected = { readonly [K in keyof Old]-?: Exclude<Old[K], undefined> }
  expectTypeOf<BodyOf<'issue-login', 'succeeded'>>().toEqualTypeOf<Expected>()
  expectTypeOf<BodyOf<'issue-login', 'succeeded'>['loginId']>().toEqualTypeOf<LoginStateId>()
  expectTypeOf<Old['loginId']>().toEqualTypeOf<LoginStateId | undefined>()
})

test('C2: query-own-valid-logins lists logins as an array; a rule cannot type the nonempty tuple', () => {
  type Old = OldBody<'query-own-valid-logins', 'succeeded'>
  type Expected = {
    readonly logins: readonly Old['logins'][number][]
    readonly completeness: Old['completeness']
  }
  expectTypeOf<BodyOf<'query-own-valid-logins', 'succeeded'>>().toEqualTypeOf<Expected>()
  expectTypeOf<Old>().toExtend<BodyOf<'query-own-valid-logins', 'succeeded'>>()
})

test('C2: every other outcome with a body has the old body', () => {
  type Bodied<O extends Name> = {
    [K in keyof Outcomes<O>]: Outcomes<O>[K] extends true ? never : Exclude<K, 'succeeded'>
  }[keyof Outcomes<O>]
  type Check = {
    readonly [O in Name]: {
      readonly [K in Bodied<O>]: Matches<BodyOf<O, K>, OldBody<O, K>>
    }
  }
  type Expected = { readonly [O in Name]: AllTrue<Check[O]> }
  expectTypeOf<Check>().toEqualTypeOf<Expected>()
  expectTypeOf<keyof Check['judge-admission']>().toEqualTypeOf<'not-visible' | 'need-decision'>()
  expectTypeOf<keyof Check['release-affiliation']>().toEqualTypeOf<
    'no-change' | 'not-visible' | 'conflict'
  >()
})

test('C5: only the succeeded body of issue-login carries a login proof', () => {
  type Carriers = {
    [O in Name]: {
      [K in keyof Outcomes<O>]: Outcomes<O>[K] extends true
        ? never
        : 'loginProof' extends keyof BodyOf<O, K>
          ? `${O}:${K & string}`
          : never
    }[keyof Outcomes<O>]
  }[Name]
  expectTypeOf<Carriers>().toEqualTypeOf<'issue-login:succeeded'>()
})

test('C4 and I-13: a fixed outcome is written as true and has no body', () => {
  type Fixed =
    | 'denied'
    | 'unknown'
    | 'basis-unavailable'
    | 'protocol-rejected'
    | 'stage-not-provided'
    | 'uniform-auth-failure'
  type Check = {
    readonly [O in Name]: {
      readonly [K in Fixed & keyof Outcomes<O>]: Same<Outcomes<O>[K], true>
    }
  }
  type Expected = { readonly [O in Name]: AllTrue<Check[O]> }
  expectTypeOf<Check>().toEqualTypeOf<Expected>()
  expectTypeOf<Outcomes<'issue-login'>['uniform-auth-failure']>().toEqualTypeOf<true>()
})
