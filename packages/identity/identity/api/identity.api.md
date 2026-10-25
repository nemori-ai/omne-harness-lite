# @omne-harness/identity 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ActingForTenantPrincipal` · `principal.d.ts`
- `DEFAULT_TEAM_MODEL` · `qualification.d.ts`
- `DEFAULT_TEAM_ROLES` · `qualification.d.ts`
- `DEFAULT_TEAM_ROLE_MAPPING` · `qualification.d.ts`
- `GovernanceModelRef` · `qualification.d.ts`
- `IssueFailure` · `principal.d.ts`
- `Principal` · `principal.d.ts`
- `PrincipalAuthority` · `principal.d.ts`
- `PrincipalIssuer` · `principal.d.ts`
- `PrincipalVerification` · `principal.d.ts`
- `PrincipalVerifier` · `principal.d.ts`
- `QUALIFICATIONS` · `qualification.d.ts`
- `Qualification` · `qualification.d.ts`
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

## 声明文件 `index.d.ts`

```ts
export { inProcessPrincipalAuthority, scopeOf } from './principal.ts';
export type { ActingForTenantPrincipal, IssueFailure, Principal, PrincipalAuthority, PrincipalIssuer, PrincipalVerification, PrincipalVerifier, SystemPrincipal, WorkRef, } from './principal.ts';
export { DEFAULT_TEAM_MODEL, DEFAULT_TEAM_ROLES, DEFAULT_TEAM_ROLE_MAPPING, QUALIFICATIONS, governanceModelEquals, isQualification, qualificationsOf, } from './qualification.ts';
export type { GovernanceModelRef, Qualification, RoleMapping, RoleQualifications, RoleRef, RoleResolutionFailure, } from './qualification.ts';
export type { StandingEvidence, TenantStandingReading, TenantStandingSource } from './standing.ts';
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
