# @omne-harness/authorization 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AdmissionBasis` · `admission.d.ts`
- `AdmissionCheck` · `admission.d.ts`
- `AdmissionDecision` · `admission.d.ts`
- `AdmissionFacts` · `admission.d.ts`
- `AdmissionInput` · `admission.d.ts`
- `AdmissionOperation` · `operation.d.ts`
- `AdmissionTarget` · `operation.d.ts`
- `ConsumeOutcome` · `permit.d.ts`
- `ConsumerPosition` · `permit.d.ts`
- `ConsumptionFact` · `permit.d.ts`
- `DecisionEvidence` · `evidence.d.ts`
- `DenialReason` · `admission.d.ts`
- `DurableEvidence` · 包 `@omne-harness/exchange-refs`
- `EffectiveArguments` · `evidence.d.ts`
- `ExpiryReading` · `system-action.d.ts`
- `GrantOutcome` · `permit.d.ts`
- `MaintenanceGrant` · `system-action.d.ts`
- `MaintenanceGrantReading` · `system-action.d.ts`
- `MaintenanceGrantSource` · `system-reference.d.ts`
- `PERMIT_ID_MAX_LENGTH` · `permit.d.ts`
- `PermitGrant` · `permit.d.ts`
- `PermitGrantor` · `permit.d.ts`
- `PermitId` · `permit.d.ts`
- `PermitIdFailure` · `permit.d.ts`
- `PermitLedger` · `permit.d.ts`
- `PermitLookup` · `permit.d.ts`
- `PermitRef` · `permit.d.ts`
- `PermitState` · `permit.d.ts`
- `ReferenceAdmissionDependencies` · `reference.d.ts`
- `SYSTEM_ACTION_MATRIX` · `system-matrix.d.ts`
- `StandingBasis` · `admission.d.ts`
- `SystemActionAuthorization` · `system-action.d.ts`
- `SystemActionBasis` · `system-action.d.ts`
- `SystemActionClock` · `system-reference.d.ts`
- `SystemActionDecision` · `system-action.d.ts`
- `SystemActionDenial` · `system-action.d.ts`
- `SystemActionDependencies` · `system-reference.d.ts`
- `SystemActionFacts` · `system-action.d.ts`
- `SystemActionRequest` · `system-action.d.ts`
- `SystemActionRow` · `system-matrix.d.ts`
- `SystemActionTarget` · `system-action.d.ts`
- `canonicalText` · `evidence.d.ts`
- `decideAdmission` · `admission.d.ts`
- `decideSystemAction` · `system-action.d.ts`
- `decisionEvidence` · `evidence.d.ts`
- `decodePermitId` · `permit.d.ts`
- `digestOf` · `evidence.d.ts`
- `effectiveArgumentsOf` · `evidence.d.ts`
- `inMemoryPermitLedger` · `permit.d.ts`
- `noArguments` · `evidence.d.ts`
- `operationEquals` · `operation.d.ts`
- `referenceAdmissionCheck` · `reference.d.ts`
- `referenceSystemActionAuthorization` · `system-reference.d.ts`
- `targetEquals` · `operation.d.ts`

## 入口 `./testing` · `testing/index.d.ts`

- `ManualSystemClock` · `testing/clock.d.ts`
- `ScriptedMaintenanceGrants` · `testing/grants.d.ts`
- `manualSystemClock` · `testing/clock.d.ts`
- `scriptedMaintenanceGrants` · `testing/grants.d.ts`

## 声明文件 `admission.d.ts`

```ts
import { type Access, type TenantId } from '@omne-harness/legal-identity';
import type { Principal, PrincipalVerification, Qualification, TenantStandingReading } from '@omne-harness/identity';
import { type DecisionEvidence, type EffectiveArguments } from './evidence.ts';
import { type AdmissionOperation, type AdmissionTarget } from './operation.ts';
import type { PermitLookup, PermitRef } from './permit.ts';
export type AdmissionInput = Readonly<{
    access: Access<Principal>;
    operation: AdmissionOperation;
    target: AdmissionTarget;
    arguments: EffectiveArguments;
    requires: readonly Qualification[];
    permit: PermitRef | null;
}>;
export type AdmissionFacts = Readonly<{
    principal: PrincipalVerification;
    standing: TenantStandingReading | null;
    permit: PermitLookup | null;
}>;
export type StandingBasis = Exclude<TenantStandingReading, {
    kind: 'unavailable';
}>;
export type AdmissionBasis = Readonly<{
    operation: AdmissionOperation;
    target: AdmissionTarget;
    tenant: TenantId;
    arguments: EffectiveArguments;
    principal: Principal | null;
    standing: StandingBasis | null;
    required: readonly Qualification[];
    permit: PermitRef | null;
}>;
export type DenialReason = 'untrusted-principal' | 'scope-mismatch' | 'tenant-mismatch' | 'not-member' | 'qualification-missing' | 'permit-mismatch' | 'permit-unknown' | 'permit-consumed';
export type AdmissionDecision = Readonly<{
    kind: 'allowed';
    evidence: DecisionEvidence;
    basis: AdmissionBasis;
}> | Readonly<{
    kind: 'denied';
    reason: DenialReason;
    evidence: DecisionEvidence;
    basis: AdmissionBasis;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface AdmissionCheck {
    check(input: AdmissionInput): Promise<AdmissionDecision>;
}
export declare function standingSnapshot(standing: StandingBasis): StandingBasis;
export declare function decideAdmission(input: AdmissionInput, facts: AdmissionFacts): AdmissionDecision;
```

## 声明文件 `evidence.d.ts`

```ts
import type { DurableEvidence } from '@omne-harness/exchange-refs';
export type { DurableEvidence } from '@omne-harness/exchange-refs';
export type DecisionEvidence = DurableEvidence & Readonly<{
    owner: 'authorization';
}>;
export declare function canonicalText(value: unknown): string;
export declare function digestOf(value: unknown): string;
export type EffectiveArguments = Readonly<{
    digest: string;
}>;
export declare function effectiveArgumentsOf(value: unknown): EffectiveArguments;
export declare function noArguments(): EffectiveArguments;
export declare function decisionEvidence(record: string, revision: string, content: unknown): DecisionEvidence;
```

## 声明文件 `index.d.ts`

```ts
export { decideAdmission } from './admission.ts';
export type { AdmissionBasis, AdmissionCheck, AdmissionDecision, AdmissionFacts, AdmissionInput, DenialReason, StandingBasis, } from './admission.ts';
export { canonicalText, decisionEvidence, digestOf, effectiveArgumentsOf, noArguments, } from './evidence.ts';
export type { DecisionEvidence, DurableEvidence, EffectiveArguments } from './evidence.ts';
export { operationEquals, targetEquals } from './operation.ts';
export type { AdmissionOperation, AdmissionTarget } from './operation.ts';
export { PERMIT_ID_MAX_LENGTH, decodePermitId, inMemoryPermitLedger } from './permit.ts';
export type { ConsumeOutcome, ConsumerPosition, ConsumptionFact, GrantOutcome, PermitGrant, PermitGrantor, PermitId, PermitIdFailure, PermitLedger, PermitLookup, PermitRef, PermitState, } from './permit.ts';
export { referenceAdmissionCheck } from './reference.ts';
export type { ReferenceAdmissionDependencies } from './reference.ts';
export { decideSystemAction } from './system-action.ts';
export type { ExpiryReading, MaintenanceGrant, MaintenanceGrantReading, SystemActionAuthorization, SystemActionBasis, SystemActionDecision, SystemActionDenial, SystemActionFacts, SystemActionRequest, SystemActionTarget, } from './system-action.ts';
export { SYSTEM_ACTION_MATRIX } from './system-matrix.ts';
export type { SystemActionRow } from './system-matrix.ts';
export { referenceSystemActionAuthorization } from './system-reference.ts';
export type { MaintenanceGrantSource, SystemActionClock, SystemActionDependencies, } from './system-reference.ts';
```

## 声明文件 `operation.d.ts`

```ts
export type AdmissionOperation = Readonly<{
    owner: string;
    name: string;
}>;
export type AdmissionTarget = Readonly<{
    owner: string;
    kind: string;
    key: string;
}>;
export declare function operationEquals(left: AdmissionOperation, right: AdmissionOperation): boolean;
export declare function targetEquals(left: AdmissionTarget, right: AdmissionTarget): boolean;
```

## 声明文件 `permit.d.ts`

```ts
import { type TenantId } from '@omne-harness/legal-identity';
import { type Outcome } from '@omne-harness/operation-result';
import { type DecisionEvidence, type DurableEvidence, type EffectiveArguments } from './evidence.ts';
import type { AdmissionOperation, AdmissionTarget } from './operation.ts';
declare const permitBrand: unique symbol;
export type PermitId = string & {
    readonly [permitBrand]: 'PermitId';
};
export type PermitIdFailure = Readonly<{
    field: 'PermitId';
    reason: 'type' | 'empty' | 'length' | 'character';
}>;
export declare const PERMIT_ID_MAX_LENGTH = 256;
export declare function decodePermitId(value: unknown): Outcome<PermitId, PermitIdFailure>;
export type PermitRef = Readonly<{
    tenant: TenantId;
    permit: PermitId;
}>;
export type ConsumerPosition = Readonly<{
    owner: string;
    work: string;
    position: string;
}>;
export type PermitGrant = Readonly<{
    ref: PermitRef;
    operation: AdmissionOperation;
    target: AdmissionTarget;
    arguments: EffectiveArguments;
    granted: DurableEvidence;
}>;
export type ConsumptionFact = Readonly<{
    permit: PermitRef;
    consumer: ConsumerPosition;
    evidence: DecisionEvidence;
}>;
export type PermitState = Readonly<{
    kind: 'open';
}> | Readonly<{
    kind: 'consumed';
    fact: ConsumptionFact;
}>;
export type PermitLookup = Readonly<{
    kind: 'found';
    grant: PermitGrant;
    state: PermitState;
}> | Readonly<{
    kind: 'unknown';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type ConsumeOutcome = Readonly<{
    kind: 'consumed';
    fact: ConsumptionFact;
}> | Readonly<{
    kind: 'already-consumed';
    fact: ConsumptionFact;
}> | Readonly<{
    kind: 'unknown';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type GrantOutcome = Readonly<{
    kind: 'granted';
    grant: PermitGrant;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface PermitLedger {
    lookup(input: Readonly<{
        permit: PermitRef;
    }>): Promise<PermitLookup>;
    consume(input: Readonly<{
        permit: PermitRef;
        consumer: ConsumerPosition;
    }>): Promise<ConsumeOutcome>;
}
export interface PermitGrantor {
    grant(input: Readonly<{
        tenant: TenantId;
        operation: AdmissionOperation;
        target: AdmissionTarget;
        arguments: EffectiveArguments;
        granted: DurableEvidence;
    }>): Promise<GrantOutcome>;
}
export declare function inMemoryPermitLedger(): Readonly<{
    grantor: PermitGrantor;
    ledger: PermitLedger;
}>;
export {};
```

## 声明文件 `reference.d.ts`

```ts
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity';
import { type AdmissionCheck } from './admission.ts';
import type { PermitLedger } from './permit.ts';
export type ReferenceAdmissionDependencies = Readonly<{
    verifier: PrincipalVerifier;
    standing: TenantStandingSource;
    permits: PermitLedger | null;
}>;
export declare function referenceAdmissionCheck(deps: ReferenceAdmissionDependencies): AdmissionCheck;
```

## 声明文件 `system-action.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { PrincipalVerification, SystemPrincipal } from '@omne-harness/identity';
import { type DecisionEvidence, type EffectiveArguments } from './evidence.ts';
import type { AdmissionOperation, AdmissionTarget } from './operation.ts';
import { type SystemActionRow } from './system-matrix.ts';
export type SystemActionTarget = Readonly<{
    kind: 'system';
    resource: AdmissionTarget;
}> | Readonly<{
    kind: 'tenant';
    tenant: TenantId;
    resource: AdmissionTarget;
}>;
export type SystemActionRequest = Readonly<{
    principal: SystemPrincipal;
    scope: 'system';
    operation: AdmissionOperation;
    target: SystemActionTarget;
    arguments: EffectiveArguments;
}>;
export type SystemActionDenial = 'untrusted-principal' | 'operation-forbidden' | 'binding-mismatch' | 'grant-missing' | 'grant-revoked' | 'grant-expired';
export type MaintenanceGrant = Readonly<{
    source: string;
    record: string;
    revision: string;
    purposes: readonly string[];
    revoked: boolean;
    generation: string;
    expiresAt?: string;
}>;
export type MaintenanceGrantReading = Readonly<{
    kind: 'found';
    grant: MaintenanceGrant;
}> | Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type ExpiryReading = Readonly<{
    kind: 'reached';
}> | Readonly<{
    kind: 'pending';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type SystemActionFacts = Readonly<{
    principal: PrincipalVerification;
    grant: MaintenanceGrantReading | null;
    expiry: ExpiryReading | null;
}>;
export type SystemActionBasis = Readonly<{
    operation: AdmissionOperation;
    target: SystemActionTarget;
    arguments: EffectiveArguments;
    principal: SystemPrincipal | null;
    grant: MaintenanceGrant | null;
}>;
export type SystemActionDecision = Readonly<{
    kind: 'allowed';
    basis: SystemActionBasis;
    evidence: DecisionEvidence;
}> | Readonly<{
    kind: 'denied';
    reason: SystemActionDenial;
    basis: SystemActionBasis;
    evidence: DecisionEvidence;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface SystemActionAuthorization {
    check(input: SystemActionRequest): Promise<SystemActionDecision>;
}
export declare function grantSnapshot(grant: MaintenanceGrant): MaintenanceGrant;
export type MatrixStep = Readonly<{
    kind: 'row';
    row: SystemActionRow;
}> | Readonly<{
    kind: 'denied';
    reason: 'operation-forbidden' | 'binding-mismatch';
}>;
export declare function matrixStep(request: SystemActionRequest): MatrixStep;
export declare function expiryDecides(row: SystemActionRow, grant: MaintenanceGrantReading | null): boolean;
export declare function decideSystemAction(request: SystemActionRequest, facts: SystemActionFacts): SystemActionDecision;
```

## 声明文件 `system-matrix.d.ts`

```ts
import { type AdmissionOperation } from './operation.ts';
export type SystemActionRow = Readonly<{
    purpose: string;
    operation: AdmissionOperation;
    target: 'system' | 'tenant';
    resource: Readonly<{
        owner: string;
        kind: string;
    }>;
    arguments: 'none' | 'request';
}>;
export declare const SYSTEM_ACTION_MATRIX: readonly SystemActionRow[];
export declare function systemActionRowOf(operation: AdmissionOperation): SystemActionRow | null;
```

## 声明文件 `system-reference.d.ts`

```ts
import type { PrincipalVerifier } from '@omne-harness/identity';
import { type ExpiryReading, type MaintenanceGrantReading, type SystemActionAuthorization, type SystemActionRequest, type SystemActionTarget } from './system-action.ts';
export interface SystemActionClock {
    reached(expiresAt: string): Promise<ExpiryReading>;
}
export interface MaintenanceGrantSource {
    read(input: Readonly<{
        principal: SystemActionRequest['principal'];
        operation: SystemActionRequest['operation'];
        target: SystemActionTarget;
    }>): Promise<MaintenanceGrantReading>;
}
export type SystemActionDependencies = Readonly<{
    verifier: PrincipalVerifier;
    grants: MaintenanceGrantSource | null;
    clock: SystemActionClock | null;
}>;
export declare function referenceSystemActionAuthorization(deps: SystemActionDependencies): SystemActionAuthorization;
```

## 声明文件 `testing/clock.d.ts`

```ts
import type { SystemActionClock } from '../system-reference.ts';
export type ManualSystemClock = Readonly<{
    clock: SystemActionClock;
    expire(expiresAt: string): void;
    fail(diagnostic: string): void;
    asked(): readonly string[];
}>;
export declare function manualSystemClock(): ManualSystemClock;
```

## 声明文件 `testing/grants.d.ts`

```ts
import { type MaintenanceGrantReading } from '../system-action.ts';
import type { MaintenanceGrantSource } from '../system-reference.ts';
type GrantRequest = Parameters<MaintenanceGrantSource['read']>[0];
export type ScriptedMaintenanceGrants = Readonly<{
    source: MaintenanceGrantSource;
    script(...answers: readonly MaintenanceGrantReading[]): void;
    calls(): number;
    requests(): readonly GrantRequest[];
}>;
export declare function scriptedMaintenanceGrants(): ScriptedMaintenanceGrants;
export {};
```

## 声明文件 `testing/index.d.ts`

```ts
export { scriptedMaintenanceGrants } from './grants.ts';
export type { ScriptedMaintenanceGrants } from './grants.ts';
export { manualSystemClock } from './clock.ts';
export type { ManualSystemClock } from './clock.ts';
```
