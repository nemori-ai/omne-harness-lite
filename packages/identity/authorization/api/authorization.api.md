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
- `GrantOutcome` · `permit.d.ts`
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
- `StandingBasis` · `admission.d.ts`
- `canonicalText` · `evidence.d.ts`
- `decideAdmission` · `admission.d.ts`
- `decisionEvidence` · `evidence.d.ts`
- `decodePermitId` · `permit.d.ts`
- `digestOf` · `evidence.d.ts`
- `effectiveArgumentsOf` · `evidence.d.ts`
- `inMemoryPermitLedger` · `permit.d.ts`
- `noArguments` · `evidence.d.ts`
- `operationEquals` · `operation.d.ts`
- `referenceAdmissionCheck` · `reference.d.ts`
- `targetEquals` · `operation.d.ts`

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
