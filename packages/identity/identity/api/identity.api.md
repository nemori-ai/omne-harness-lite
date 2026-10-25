# @omne-harness/identity 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ActingForTenantPrincipal` · `principal.d.ts`
- `ClockReading` · `operations.d.ts`
- `DEFAULT_TEAM_MODEL` · `qualification.d.ts`
- `DEFAULT_TEAM_ROLES` · `qualification.d.ts`
- `DEFAULT_TEAM_ROLE_MAPPING` · `qualification.d.ts`
- `GovernanceModelRef` · `qualification.d.ts`
- `IdentityClock` · `operations.d.ts`
- `IdentityOperations` · `operations.d.ts`
- `IdentityOperationsOptions` · `operations.d.ts`
- `IssueFailure` · `principal.d.ts`
- `IssueLoginInput` · `operations.d.ts`
- `IssueLoginOutcome` · `operations.d.ts`
- `IssuedLogin` · `operations.d.ts`
- `LoginCredentialInput` · `operations.d.ts`
- `LoginRecognition` · `operations.d.ts`
- `LoginTerms` · `operations.d.ts`
- `LoginTermsReading` · `operations.d.ts`
- `LoginTermsSource` · `operations.d.ts`
- `Principal` · `principal.d.ts`
- `PrincipalAuthority` · `principal.d.ts`
- `PrincipalIssuer` · `principal.d.ts`
- `PrincipalVerification` · `principal.d.ts`
- `PrincipalVerifier` · `principal.d.ts`
- `QUALIFICATIONS` · `qualification.d.ts`
- `Qualification` · `qualification.d.ts`
- `RecognizeLoginInput` · `operations.d.ts`
- `RegisterAndActivateInput` · `operations.d.ts`
- `RegisterAndActivateOutcome` · `operations.d.ts`
- `RoleMapping` · `qualification.d.ts`
- `RoleQualifications` · `qualification.d.ts`
- `RoleRef` · `qualification.d.ts`
- `RoleResolutionFailure` · `qualification.d.ts`
- `StandingEvidence` · `standing.d.ts`
- `SystemPrincipal` · `principal.d.ts`
- `TenantStandingReading` · `standing.d.ts`
- `TenantStandingSource` · `standing.d.ts`
- `WorkRef` · `principal.d.ts`
- `governanceModelEquals` · `qualification.d.ts`
- `inProcessPrincipalAuthority` · `principal.d.ts`
- `isQualification` · `qualification.d.ts`
- `qualificationsOf` · `qualification.d.ts`
- `scopeOf` · `principal.d.ts`

## 入口 `./testing` · `testing/index.d.ts`

- `AdjustableLoginTerms` · `testing/controls.d.ts`
- `IDENTITY_CONTRACT_CASES` · `testing/contract.d.ts`
- `IdentityContractCaseResult` · `testing/contract.d.ts`
- `IdentityContractFixture` · `testing/contract.d.ts`
- `IdentityContractOptions` · `testing/contract.d.ts`
- `IdentityContractReport` · `testing/contract.d.ts`
- `ManualIdentityClock` · `testing/controls.d.ts`
- `adjustableLoginTerms` · `testing/controls.d.ts`
- `checkIdentityOperationsContract` · `testing/contract.d.ts`
- `inProcessIdentityOperations` · `testing/double.d.ts`
- `manualIdentityClock` · `testing/controls.d.ts`

## 声明文件 `index.d.ts`

```ts
export { inProcessPrincipalAuthority, scopeOf } from './principal.ts';
export type { ActingForTenantPrincipal, IssueFailure, Principal, PrincipalAuthority, PrincipalIssuer, PrincipalVerification, PrincipalVerifier, SystemPrincipal, WorkRef, } from './principal.ts';
export { DEFAULT_TEAM_MODEL, DEFAULT_TEAM_ROLES, DEFAULT_TEAM_ROLE_MAPPING, QUALIFICATIONS, governanceModelEquals, isQualification, qualificationsOf, } from './qualification.ts';
export type { GovernanceModelRef, Qualification, RoleMapping, RoleQualifications, RoleRef, RoleResolutionFailure, } from './qualification.ts';
export type { StandingEvidence, TenantStandingReading, TenantStandingSource } from './standing.ts';
export type { ClockReading, IdentityClock, IdentityOperations, IdentityOperationsOptions, IssuedLogin, IssueLoginInput, IssueLoginOutcome, LoginCredentialInput, LoginRecognition, LoginTerms, LoginTermsReading, LoginTermsSource, RecognizeLoginInput, RegisterAndActivateInput, RegisterAndActivateOutcome, } from './operations.ts';
```

## 声明文件 `operations.d.ts`

```ts
import type { AccountId, LoginStateId, OrganizationId, TenantId } from '@omne-harness/legal-identity';
import type { Duration, Instant } from '@omne-harness/utc-instant';
export type LoginCredentialInput = Readonly<{
    loginIdentifier: string;
    credential: string;
}>;
export type RegisterAndActivateInput = LoginCredentialInput;
export type RegisterAndActivateOutcome = Readonly<{
    kind: 'succeeded';
    account: AccountId;
    organization: OrganizationId;
    tenant: TenantId;
}> | Readonly<{
    kind: 'not-loginable';
}>;
export type IssueLoginInput = LoginCredentialInput;
export type IssuedLogin = Readonly<{
    login: LoginStateId;
    account: AccountId;
    loginIdentifier: string;
    issuedAt: Instant;
    maxDeadline: Instant;
    idleDeadline: Instant;
    tenant: TenantId;
    loginProof: string;
}>;
export type IssueLoginOutcome = (Readonly<{
    kind: 'succeeded';
}> & IssuedLogin) | Readonly<{
    kind: 'uniform-auth-failure';
}> | Readonly<{
    kind: 'basis-unavailable';
    diagnostic: string;
}>;
export type RecognizeLoginInput = Readonly<{
    loginProof: string;
}>;
export type LoginRecognition = Readonly<{
    kind: 'recognized';
    account: AccountId;
    login: LoginStateId;
    tenant: TenantId;
}> | Readonly<{
    kind: 'invalid';
}> | Readonly<{
    kind: 'basis-unavailable';
    diagnostic: string;
}>;
export interface IdentityOperations {
    registerAndActivate(input: RegisterAndActivateInput): Promise<RegisterAndActivateOutcome>;
    issueLogin(input: IssueLoginInput): Promise<IssueLoginOutcome>;
    recognizeLogin(input: RecognizeLoginInput): Promise<LoginRecognition>;
}
export type ClockReading = Readonly<{
    kind: 'read';
    instant: Instant;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface IdentityClock {
    now(): Promise<ClockReading>;
}
export type LoginTerms = Readonly<{
    maxLifetime: Duration;
    idlePeriod: Duration;
}>;
export type LoginTermsReading = Readonly<{
    kind: 'read';
    terms: LoginTerms;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface LoginTermsSource {
    read(): Promise<LoginTermsReading>;
}
export type IdentityOperationsOptions = Readonly<{
    clock: IdentityClock;
    terms: LoginTermsSource;
}>;
```

## 声明文件 `principal.d.ts`

```ts
import { type ActingScope, type TenantId } from '@omne-harness/legal-identity';
import { type Outcome } from '@omne-harness/operation-result';
export type SystemPrincipal = Readonly<{
    kind: 'system';
    component: string;
}>;
export type WorkRef = Readonly<{
    owner: string;
    work: string;
}>;
export type ActingForTenantPrincipal = Readonly<{
    kind: 'acting-for-tenant';
    actor: SystemPrincipal;
    tenant: TenantId;
    work: WorkRef;
}>;
export type Principal = SystemPrincipal | ActingForTenantPrincipal;
export type IssueFailure = Readonly<{
    field: 'component' | 'actor' | 'tenant' | 'work.owner' | 'work.work';
    reason: 'type' | 'empty' | 'unissued' | 'unminted';
}>;
export interface PrincipalIssuer {
    issueSystem(input: Readonly<{
        component: string;
    }>): Outcome<SystemPrincipal, IssueFailure>;
    issueActingForTenant(input: Readonly<{
        actor: SystemPrincipal;
        tenant: TenantId;
        work: WorkRef;
    }>): Outcome<ActingForTenantPrincipal, IssueFailure>;
}
export type PrincipalVerification = Readonly<{
    kind: 'verified';
    principal: Principal;
}> | Readonly<{
    kind: 'rejected';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface PrincipalVerifier {
    verify(value: unknown): Promise<PrincipalVerification>;
}
export type PrincipalAuthority = Readonly<{
    issuer: PrincipalIssuer;
    verifier: PrincipalVerifier;
}>;
export declare function scopeOf(principal: Principal): ActingScope;
export declare function inProcessPrincipalAuthority(): PrincipalAuthority;
```

## 声明文件 `qualification.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
export declare const QUALIFICATIONS: readonly [
    "organization-cost-ledger-read"
];
export type Qualification = (typeof QUALIFICATIONS)[number];
export declare function isQualification(value: unknown): value is Qualification;
export type GovernanceModelRef = Readonly<{
    model: string;
    revision: string;
}>;
export type RoleRef = Readonly<{
    model: GovernanceModelRef;
    role: string;
}>;
export type RoleQualifications = Readonly<{
    role: string;
    qualifications: readonly Qualification[];
}>;
export type RoleMapping = Readonly<{
    model: GovernanceModelRef;
    roles: readonly RoleQualifications[];
}>;
export type RoleResolutionFailure = Readonly<{
    reason: 'model-mismatch' | 'unknown-role';
}>;
export declare const DEFAULT_TEAM_MODEL: GovernanceModelRef;
export declare const DEFAULT_TEAM_ROLES: Readonly<{
    readonly superAdmin: 'super-admin';
    readonly member: 'member';
}>;
export declare const DEFAULT_TEAM_ROLE_MAPPING: RoleMapping;
export declare function governanceModelEquals(left: GovernanceModelRef, right: GovernanceModelRef): boolean;
export declare function qualificationsOf(mapping: RoleMapping, role: RoleRef): Outcome<readonly Qualification[], RoleResolutionFailure>;
```

## 声明文件 `standing.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { Qualification, RoleRef } from './qualification.ts';
export type StandingEvidence = Readonly<{
    record: string;
    revision: string;
}>;
export type TenantStandingReading = Readonly<{
    kind: 'member';
    role: RoleRef;
    qualifications: readonly Qualification[];
    evidence: StandingEvidence;
}> | Readonly<{
    kind: 'not-member';
    evidence: StandingEvidence;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface TenantStandingSource {
    read(input: Readonly<{
        tenant: TenantId;
    }>): Promise<TenantStandingReading>;
}
```

## 声明文件 `testing/contract.d.ts`

```ts
import { type Duration, type Instant } from '@omne-harness/utc-instant';
import type { IdentityOperations, IdentityOperationsOptions, LoginCredentialInput } from '../operations.ts';
export interface IdentityContractFixture {
    create(options: IdentityOperationsOptions): IdentityOperations | Promise<IdentityOperations>;
    registerWithoutActivation?(operations: IdentityOperations, input: LoginCredentialInput): Promise<void>;
}
export type IdentityContractOptions = Readonly<{
    start: Instant;
    short: Duration;
    long: Duration;
}>;
export type IdentityContractCaseResult = Readonly<{
    id: string;
    rule: string;
    status: 'passed' | 'failed' | 'not-applicable';
    detail?: string;
}>;
export type IdentityContractReport = Readonly<{
    passed: boolean;
    cases: readonly IdentityContractCaseResult[];
}>;
export declare const IDENTITY_CONTRACT_CASES: readonly Readonly<{
    id: string;
    rule: string;
}>[];
export declare function checkIdentityOperationsContract(fixture: IdentityContractFixture, options: IdentityContractOptions): Promise<IdentityContractReport>;
```

## 声明文件 `testing/controls.d.ts`

```ts
import type { Duration, Instant } from '@omne-harness/utc-instant';
import type { IdentityClock, LoginTerms, LoginTermsSource } from '../operations.ts';
export type ManualIdentityClock = Readonly<{
    clock: IdentityClock;
    current(): Instant;
    advanceBy(duration: Duration): void;
    setTo(instant: Instant): void;
    makeUnavailable(diagnostic: string): void;
    restore(): void;
}>;
export declare function manualIdentityClock(start: Instant): ManualIdentityClock;
export type AdjustableLoginTerms = Readonly<{
    source: LoginTermsSource;
    set(terms: LoginTerms): void;
    makeUnavailable(diagnostic: string): void;
    restore(): void;
}>;
export declare function adjustableLoginTerms(initial: LoginTerms): AdjustableLoginTerms;
```

## 声明文件 `testing/double.d.ts`

```ts
import type { IdentityOperations, IdentityOperationsOptions } from '../operations.ts';
export declare function inProcessIdentityOperations(options: IdentityOperationsOptions): IdentityOperations;
```

## 声明文件 `testing/index.d.ts`

```ts
export { checkIdentityOperationsContract, IDENTITY_CONTRACT_CASES } from './contract.ts';
export type { IdentityContractCaseResult, IdentityContractFixture, IdentityContractOptions, IdentityContractReport, } from './contract.ts';
export { adjustableLoginTerms, manualIdentityClock } from './controls.ts';
export type { AdjustableLoginTerms, ManualIdentityClock } from './controls.ts';
export { inProcessIdentityOperations } from './double.ts';
```

## 声明文件 `testing/time.d.ts`

```ts
import { type Duration, type Instant } from '@omne-harness/utc-instant';
export declare function addDuration(instant: Instant, duration: Duration): Instant | undefined;
export declare function isPositive(duration: Duration): boolean;
export declare function justBefore(instant: Instant): Instant | undefined;
```
