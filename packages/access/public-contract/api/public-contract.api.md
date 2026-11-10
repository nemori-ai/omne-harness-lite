# @omne-harness/public-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AccountId` · 包 `@omne-harness/legal-identity`
- `GovernanceCodecLimits` · `messages.d.ts`
- `GovernanceDiagnostic` · `messages.d.ts`
- `GovernanceEncodeResult` · `messages.d.ts`
- `GovernanceOperation` · `messages.d.ts`
- `GovernanceProtocolRejected` · `messages.d.ts`
- `GovernanceProtocolResult` · `messages.d.ts`
- `GovernanceProvidedOperation` · `messages.d.ts`
- `GovernanceRequest` · `messages.d.ts`
- `GovernanceRequestRead` · `messages.d.ts`
- `GovernanceResponse` · `messages.d.ts`
- `GovernanceResponseEncodeInput` · `messages.d.ts`
- `GovernanceResponseRead` · `messages.d.ts`
- `GovernanceStageNotProvided` · `messages.d.ts`
- `GovernanceStageOperation` · `messages.d.ts`
- `LoginStateId` · 包 `@omne-harness/legal-identity`
- `ModelCredentialState` · `messages.d.ts`
- `OrganizationId` · 包 `@omne-harness/legal-identity`
- `ProofInput` · `messages.d.ts`
- `SessionAdoptionRef` · `session-messages.d.ts`
- `SessionCallAccountView` · `session-messages.d.ts`
- `SessionCodecLimits` · `session-messages.d.ts`
- `SessionDiagnostic` · `session-messages.d.ts`
- `SessionDiagnosticGap` · `session-messages.d.ts`
- `SessionDiagnosticGapReason` · `session-messages.d.ts`
- `SessionDiagnosticGapSource` · `session-messages.d.ts`
- `SessionDiagnosticInstant` · `session-messages.d.ts`
- `SessionDiagnosticMilliseconds` · `session-messages.d.ts`
- `SessionDiagnosticUnknown` · `session-messages.d.ts`
- `SessionDiagnosticsPage` · `session-messages.d.ts`
- `SessionEncodeResult` · `session-messages.d.ts`
- `SessionFactCount` · `session-messages.d.ts`
- `SessionHistoryEntry` · `session-messages.d.ts`
- `SessionHistoryPage` · `session-messages.d.ts`
- `SessionModelAttemptDiagnostic` · `session-messages.d.ts`
- `SessionModelCallDiagnostic` · `session-messages.d.ts`
- `SessionOperation` · `session-messages.d.ts`
- `SessionOutcomes` · `session-messages.d.ts`
- `SessionProducerRef` · `session-messages.d.ts`
- `SessionProtocolRejected` · `session-messages.d.ts`
- `SessionRequest` · `session-messages.d.ts`
- `SessionRequestBodies` · `session-messages.d.ts`
- `SessionRequestRead` · `session-messages.d.ts`
- `SessionResponse` · `session-messages.d.ts`
- `SessionResponseEncodeInput` · `session-messages.d.ts`
- `SessionResponseRead` · `session-messages.d.ts`
- `SessionRunAttempts` · `session-messages.d.ts`
- `SessionRunCause` · `session-messages.d.ts`
- `SessionRunControl` · `session-messages.d.ts`
- `SessionRunDiagnostic` · `session-messages.d.ts`
- `SessionRunTerminal` · `session-messages.d.ts`
- `SessionSuccessBodies` · `session-messages.d.ts`
- `SessionTerminalSource` · `session-messages.d.ts`
- `SessionToolCallDiagnostic` · `session-messages.d.ts`
- `SessionToolDiagnosticEntry` · `session-messages.d.ts`
- `SettingAssetSelector` · `messages.d.ts`
- `SettingItemView` · `messages.d.ts`
- `SettingState` · `messages.d.ts`
- `TenantId` · 包 `@omne-harness/legal-identity`
- `encodeAccountIdText` · `identity-text.d.ts`
- `encodeGovernanceRequest` · `codec.d.ts`
- `encodeGovernanceResponse` · `codec.d.ts`
- `encodeLoginStateIdText` · `identity-text.d.ts`
- `encodeOrganizationIdText` · `identity-text.d.ts`
- `encodeSessionRequest` · `session-codec.d.ts`
- `encodeSessionResponse` · `session-codec.d.ts`
- `encodeTenantText` · `identity-text.d.ts`
- `readAccountIdText` · `identity-text.d.ts`
- `readGovernanceRequest` · `codec.d.ts`
- `readGovernanceResponse` · `codec.d.ts`
- `readLoginStateIdText` · `identity-text.d.ts`
- `readOrganizationIdText` · `identity-text.d.ts`
- `readSessionRequest` · `session-codec.d.ts`
- `readSessionResponse` · `session-codec.d.ts`
- `readTenantText` · `identity-text.d.ts`

## 声明文件 `codec.d.ts`

```ts
import { type Family } from './operation-rules.ts';
import type { EmptyBody, GovernanceCodecLimits, GovernanceDiagnostic, GovernanceEncodeResult, GovernanceOperation, GovernanceProtocolResult, GovernanceRequest, GovernanceRequestRead, GovernanceResponseEncodeInput, GovernanceResponseRead } from './messages.ts';
type RefusalOutcome = 'protocol-rejected' | 'stage-not-provided';
type Refusal<V extends string, K extends RefusalOutcome> = {
    readonly protocolVersion: V;
    readonly messageId?: string;
    readonly outcome: K;
    readonly body: EmptyBody;
};
type StageRead<V extends string, S extends string> = [
    S
] extends [
    never
] ? never : {
    readonly kind: 'stage-not-provided';
    readonly response: Refusal<V, 'stage-not-provided'>;
};
export type RequestRead<V extends string, S extends string> = {
    readonly kind: 'request';
    readonly request: unknown;
} | {
    readonly kind: 'protocol-rejected';
    readonly response: Refusal<V, 'protocol-rejected'>;
    readonly diagnostic: GovernanceDiagnostic;
} | StageRead<V, S>;
export type ResponseRead = {
    readonly kind: 'response';
    readonly response: unknown;
} | {
    readonly kind: 'unmatched';
} | {
    readonly kind: 'unreadable';
    readonly diagnostic: GovernanceDiagnostic;
};
export declare function readRequest<V extends string, P extends string, S extends string>(family: Family<V, P, S>, input: unknown): RequestRead<V, S>;
export declare function readGovernanceRequest(input: {
    readonly bytes: Uint8Array;
    readonly limits: GovernanceCodecLimits;
}): GovernanceRequestRead;
export declare function encodeRequest<V extends string, P extends string, S extends string>(family: Family<V, P, S>, input: unknown): GovernanceEncodeResult;
export declare function encodeGovernanceRequest(input: {
    readonly request: GovernanceRequest;
    readonly limits: GovernanceCodecLimits;
}): GovernanceEncodeResult;
export declare function readResponse<V extends string, P extends string, S extends string>(family: Family<V, P, S>, input: unknown): ResponseRead;
export declare function readGovernanceResponse<O extends GovernanceOperation>(input: {
    readonly bytes: Uint8Array;
    readonly operation: O;
    readonly expectedMessageId: string;
    readonly limits: GovernanceCodecLimits;
}): GovernanceResponseRead<O>;
export declare function encodeResponse<V extends string, P extends string, S extends string>(family: Family<V, P, S>, input: unknown): GovernanceEncodeResult;
export declare function encodeGovernanceResponse(input: {
    readonly response: GovernanceProtocolResult;
    readonly limits: GovernanceCodecLimits;
}): GovernanceEncodeResult;
export declare function encodeGovernanceResponse<O extends GovernanceOperation>(input: GovernanceResponseEncodeInput<O>): GovernanceEncodeResult;
export {};
```

## 声明文件 `correlation.d.ts`

```ts
import { type JsonLimits, type JsonRead } from '@omne-harness/json-text';
export declare function readRequestDocument(bytes: Uint8Array, limits: JsonLimits): {
    read: JsonRead;
    messageId: string | undefined;
};
```

## 声明文件 `identity-text.d.ts`

```ts
import { type AccountId, type LoginStateId, type OrganizationId, type TenantId } from '@omne-harness/legal-identity';
export type { AccountId, LoginStateId, OrganizationId, TenantId };
export declare function readTenantText(text: string): TenantId | undefined;
export declare function encodeTenantText(value: TenantId): string;
export declare function readOrganizationIdText(text: string): OrganizationId | undefined;
export declare function encodeOrganizationIdText(value: OrganizationId): string;
export declare function readAccountIdText(text: string): AccountId | undefined;
export declare function encodeAccountIdText(value: AccountId): string;
export declare function readLoginStateIdText(text: string): LoginStateId | undefined;
export declare function encodeLoginStateIdText(value: LoginStateId): string;
```

## 声明文件 `index.d.ts`

```ts
export { readGovernanceRequest, readGovernanceResponse, encodeGovernanceRequest, encodeGovernanceResponse, } from './codec.ts';
export { readSessionRequest, readSessionResponse, encodeSessionRequest, encodeSessionResponse, } from './session-codec.ts';
export type { GovernanceProvidedOperation, GovernanceStageOperation, GovernanceOperation, GovernanceRequest, GovernanceResponse, GovernanceCodecLimits, ProofInput, GovernanceProtocolRejected, GovernanceStageNotProvided, GovernanceProtocolResult, GovernanceDiagnostic, GovernanceRequestRead, GovernanceResponseRead, GovernanceEncodeResult, GovernanceResponseEncodeInput, ModelCredentialState, SettingAssetSelector, SettingItemView, SettingState, } from './messages.ts';
export type { SessionOperation, SessionRequestBodies, SessionProducerRef, SessionTerminalSource, SessionRequest, SessionOutcomes, SessionSuccessBodies, SessionResponse, SessionProtocolRejected, SessionHistoryEntry, SessionHistoryPage, SessionDiagnosticsPage, SessionDiagnosticGap, SessionDiagnosticGapSource, SessionDiagnosticGapReason, SessionDiagnosticUnknown, SessionDiagnosticInstant, SessionDiagnosticMilliseconds, SessionAdoptionRef, SessionRunDiagnostic, SessionRunAttempts, SessionRunTerminal, SessionRunCause, SessionRunControl, SessionModelCallDiagnostic, SessionModelAttemptDiagnostic, SessionToolCallDiagnostic, SessionToolDiagnosticEntry, SessionFactCount, SessionCallAccountView, SessionCodecLimits, SessionDiagnostic, SessionRequestRead, SessionResponseRead, SessionEncodeResult, SessionResponseEncodeInput, } from './session-messages.ts';
export { readTenantText, encodeTenantText, readOrganizationIdText, encodeOrganizationIdText, readAccountIdText, encodeAccountIdText, readLoginStateIdText, encodeLoginStateIdText, } from './identity-text.ts';
export type { AccountId, LoginStateId, OrganizationId, TenantId } from './identity-text.ts';
```

## 声明文件 `messages.d.ts`

```ts
import type { JsonLimits, JsonValue } from '@omne-harness/json-text';
import type { AccountId, OrganizationId, LoginStateId, TenantId } from '@omne-harness/legal-identity';
import type { Instant } from '@omne-harness/utc-instant';
export type EmptyBody = Readonly<Record<string, never>>;
export type JsonObject = Extract<JsonValue, {
    readonly kind: 'object';
}>;
export type GovernanceCodecLimits = JsonLimits;
export type ProofInput = {
    readonly kind: 'missing';
} | {
    readonly kind: 'empty';
} | {
    readonly kind: 'present';
    readonly value: string;
};
export type RequestBodies = {
    'public-health': EmptyBody;
    'register-and-activate': {
        readonly loginIdentifier: string;
        readonly credential: string;
    };
    'issue-login': {
        readonly loginIdentifier: string;
        readonly credential: string;
    };
    'revoke-login': {
        readonly targetLoginId: LoginStateId;
    };
    'replace-credential': {
        readonly currentCredential: string;
        readonly newCredential: string;
    };
    'query-own-valid-logins': EmptyBody;
    'query-current-tenant': EmptyBody;
    'query-own-memberships': EmptyBody;
    'query-received-invitations': EmptyBody;
    'query-create-organization': {
        readonly targetCreateCallId: string;
        readonly name: string;
        readonly governanceModelId: string;
    };
    'issue-member-invitation': {
        readonly invitedLoginIdentifier: string;
        readonly duration?: string;
    };
    'open-affiliation-request': {
        readonly superiorOrganizationId: OrganizationId;
        readonly subordinateOrganizationId: OrganizationId;
        readonly duration?: string;
    };
    'query-organization-members': {
        readonly organizationId: OrganizationId;
        readonly includeRemoved?: boolean;
    };
    'accept-member-invitation': {
        readonly invitationId: string;
        readonly expectedState: 'open';
    };
    'reject-member-invitation': {
        readonly invitationId: string;
        readonly expectedState: 'open';
    };
    'withdraw-member-invitation': {
        readonly invitationId: string;
        readonly expectedState: 'open';
    };
    'query-invitation': {
        readonly invitationId: string;
    };
    'create-organization': {
        readonly createCallId: string;
        readonly name: string;
        readonly governanceModelId: string;
    };
    'leave-organization': EmptyBody;
    'remove-member': {
        readonly organizationId: OrganizationId;
        readonly accountId: AccountId;
        readonly expectedRole: string;
    };
    'change-member-role': {
        readonly organizationId: OrganizationId;
        readonly accountId: AccountId;
        readonly expectedRole: string;
        readonly targetRole: string;
    };
    'switch-current-tenant': {
        readonly tenantId: TenantId;
    };
    'query-organization': {
        readonly organizationId: OrganizationId;
    };
    'query-issued-invitations': EmptyBody;
    'accept-affiliation-request': {
        readonly requestId: string;
        readonly expectedState: 'pending';
    };
    'reject-affiliation-request': {
        readonly requestId: string;
        readonly expectedState: 'pending';
    };
    'withdraw-affiliation-request': {
        readonly requestId: string;
        readonly expectedState: 'pending';
    };
    'release-affiliation': {
        readonly affiliationId: string;
        readonly expectedState: 'effective';
    };
    'query-received-affiliation-requests': EmptyBody;
    'query-issued-affiliation-requests': EmptyBody;
    'query-affiliation-request': {
        readonly requestId: string;
    };
    'judge-admission': {
        readonly resource: string;
        readonly action: string;
        readonly parameters: JsonObject;
        readonly scopeId: string;
    };
    'submit-authorization-expression': {
        readonly expression: string;
        readonly action: string;
        readonly object: string;
        readonly parameters: JsonObject;
    };
    'withdraw-authorization-expression': {
        readonly expressionId: string;
    };
    'bind-model-credential': {
        readonly secret: string;
    };
    'unbind-model-credential': EmptyBody;
    'describe-model-credential': EmptyBody;
    'list-settings': {
        readonly asset?: SettingAssetSelector;
    };
    'set-setting': {
        readonly asset: SettingAssetSelector;
        readonly item: string;
        readonly secret: string;
    };
    'describe-setting': {
        readonly asset: SettingAssetSelector;
        readonly item: string;
    };
    'clear-setting': {
        readonly asset: SettingAssetSelector;
        readonly item: string;
    };
};
export type GovernanceProvidedOperation = keyof RequestBodies;
export type GovernanceStageOperation = 'disable-subject' | 'restore-subject' | 'end-subject' | 'reopen-after-media-loss';
export type GovernanceOperation = GovernanceProvidedOperation | GovernanceStageOperation;
export type ProofOperations = 'revoke-login' | 'replace-credential' | 'query-own-valid-logins' | 'query-current-tenant' | 'query-own-memberships' | 'query-received-invitations' | 'query-create-organization' | 'issue-member-invitation' | 'open-affiliation-request' | 'query-organization-members' | 'accept-member-invitation' | 'reject-member-invitation' | 'withdraw-member-invitation' | 'query-invitation' | 'create-organization' | 'leave-organization' | 'remove-member' | 'change-member-role' | 'switch-current-tenant' | 'query-organization' | 'query-issued-invitations' | 'accept-affiliation-request' | 'reject-affiliation-request' | 'withdraw-affiliation-request' | 'release-affiliation' | 'query-received-affiliation-requests' | 'query-issued-affiliation-requests' | 'query-affiliation-request' | 'judge-admission' | 'submit-authorization-expression' | 'withdraw-authorization-expression' | 'bind-model-credential' | 'unbind-model-credential' | 'describe-model-credential' | 'list-settings' | 'set-setting' | 'describe-setting' | 'clear-setting';
export type TenantOperations = 'issue-member-invitation' | 'open-affiliation-request' | 'query-organization-members' | 'accept-member-invitation' | 'reject-member-invitation' | 'withdraw-member-invitation' | 'query-invitation' | 'create-organization' | 'leave-organization' | 'remove-member' | 'change-member-role' | 'switch-current-tenant' | 'query-organization' | 'query-issued-invitations' | 'accept-affiliation-request' | 'reject-affiliation-request' | 'withdraw-affiliation-request' | 'release-affiliation' | 'query-received-affiliation-requests' | 'query-issued-affiliation-requests' | 'query-affiliation-request' | 'judge-admission' | 'submit-authorization-expression' | 'withdraw-authorization-expression' | 'bind-model-credential' | 'unbind-model-credential' | 'describe-model-credential' | 'list-settings' | 'set-setting' | 'describe-setting' | 'clear-setting';
export type RequestByOperation = {
    readonly [O in GovernanceProvidedOperation]: {
        readonly protocolVersion: 'governance-public/1';
        readonly messageId: string;
        readonly operation: O;
        readonly body: RequestBodies[O];
    } & (O extends ProofOperations ? {
        readonly proof: ProofInput;
    } : {}) & (O extends TenantOperations ? {
        readonly actingTenant: TenantId;
    } : {});
};
export type GovernanceRequest<O extends GovernanceProvidedOperation = GovernanceProvidedOperation> = RequestByOperation[O];
export type InvitationState = 'open' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
export type InvitationTerminal = Exclude<InvitationState, 'open'>;
export type AffiliationRequestState = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'invalid' | 'expired';
export type AffiliationRequestTerminal = Exclude<AffiliationRequestState, 'pending'>;
export type LoginItem = {
    readonly loginId: LoginStateId;
    readonly issuedAt: Instant;
    readonly maxDeadline: Instant;
    readonly idleDeadline: Instant;
};
export type MembershipItem = {
    readonly organizationId: OrganizationId;
    readonly tenantId: TenantId;
    readonly role: string;
};
export type MemberItem = {
    readonly accountId: AccountId;
    readonly role: string;
};
export type InvitationItem = {
    readonly invitationId: string;
    readonly state: InvitationState;
    readonly expiresAt: Instant;
    readonly organizationId: OrganizationId;
    readonly invitedAccountId: AccountId;
};
export type AffiliationRequestItem = {
    readonly requestId: string;
    readonly state: AffiliationRequestState;
    readonly expiresAt: Instant;
    readonly superiorOrganizationId: OrganizationId;
    readonly subordinateOrganizationId: OrganizationId;
};
export type Complete<K extends string, T> = {
    readonly [P in K]: readonly T[];
} & {
    readonly completeness: 'complete';
};
export type ModelCredentialState = {
    readonly state: 'unbound';
} | {
    readonly state: 'usable' | 'unreadable';
    readonly tenantId: TenantId;
    readonly configuredAt?: Instant;
};
export type SettingAssetSelector = {
    readonly category?: string;
    readonly name: string;
};
export type SettingState = {
    readonly state: 'unbound';
} | {
    readonly state: 'usable' | 'revoked' | 'unreadable';
    readonly tenantId: TenantId;
    readonly configuredAt?: Instant;
};
export type SettingItemView = {
    readonly asset: {
        readonly category: string;
        readonly name: string;
    };
    readonly item: string;
    readonly title: string;
    readonly sensitivity: 'secret' | 'ordinary';
    readonly state: SettingState | {
        readonly state: 'not-writable';
    };
};
export type LoginList = {
    readonly logins: readonly [
        LoginItem,
        ...LoginItem[]
    ];
    readonly completeness: 'complete';
};
export type SuccessBodies = {
    'public-health': {
        readonly protocolVersion: 'governance-public/1';
    };
    'register-and-activate': {
        readonly accountId: AccountId;
        readonly organizationId: OrganizationId;
        readonly tenantId: TenantId;
    };
    'issue-login': {
        readonly loginIdentifier: string;
        readonly issuedAt: Instant;
        readonly tenantId: TenantId;
        readonly loginProof: string;
        readonly loginId?: LoginStateId;
    };
    'revoke-login': EmptyBody;
    'replace-credential': EmptyBody;
    'query-own-valid-logins': LoginList;
    'query-current-tenant': {
        readonly tenantId: TenantId;
    };
    'query-own-memberships': Complete<'memberships', MembershipItem>;
    'query-received-invitations': Complete<'invitations', InvitationItem>;
    'query-create-organization': {
        readonly organizationId: OrganizationId;
        readonly tenantId: TenantId;
    };
    'issue-member-invitation': {
        readonly invitationId: string;
        readonly state: 'open';
        readonly expiresAt: Instant;
    };
    'open-affiliation-request': {
        readonly requestId: string;
        readonly state: 'pending';
        readonly expiresAt: Instant;
    };
    'query-organization-members': Complete<'members', MemberItem>;
    'accept-member-invitation': {
        readonly invitationId: string;
        readonly state: 'accepted';
    };
    'reject-member-invitation': {
        readonly invitationId: string;
        readonly state: 'rejected';
    };
    'withdraw-member-invitation': {
        readonly invitationId: string;
        readonly state: 'withdrawn';
    };
    'query-invitation': InvitationItem;
    'create-organization': {
        readonly organizationId: OrganizationId;
        readonly tenantId: TenantId;
    };
    'leave-organization': EmptyBody;
    'remove-member': EmptyBody;
    'change-member-role': EmptyBody;
    'switch-current-tenant': {
        readonly tenantId: TenantId;
    };
    'query-organization': {
        readonly organizationId: OrganizationId;
        readonly name: string;
        readonly kind: string;
        readonly superiorOrganizationId?: OrganizationId;
    };
    'query-issued-invitations': Complete<'invitations', InvitationItem>;
    'accept-affiliation-request': {
        readonly affiliationId: string;
        readonly state: 'effective';
    };
    'reject-affiliation-request': {
        readonly requestId: string;
        readonly state: 'rejected';
    };
    'withdraw-affiliation-request': {
        readonly requestId: string;
        readonly state: 'withdrawn';
    };
    'release-affiliation': EmptyBody;
    'query-received-affiliation-requests': Complete<'affiliationRequests', AffiliationRequestItem>;
    'query-issued-affiliation-requests': Complete<'affiliationRequests', AffiliationRequestItem>;
    'query-affiliation-request': AffiliationRequestItem;
    'judge-admission': {
        readonly admitted: true;
    };
    'submit-authorization-expression': {
        readonly expressionId: string;
        readonly persistentSettingsUpdated: false;
    };
    'withdraw-authorization-expression': EmptyBody;
    'bind-model-credential': {
        readonly configuredAt: Instant;
    };
    'unbind-model-credential': EmptyBody;
    'describe-model-credential': ModelCredentialState;
    'list-settings': {
        readonly items: readonly SettingItemView[];
        readonly completeness: 'complete';
    };
    'set-setting': {
        readonly configuredAt: Instant;
    };
    'describe-setting': SettingState;
    'clear-setting': EmptyBody;
};
export type NoChangeBodies = {
    'revoke-login': EmptyBody;
    'unbind-model-credential': EmptyBody;
    'clear-setting': EmptyBody;
    'switch-current-tenant': EmptyBody;
    'release-affiliation': {
        readonly affiliationId: string;
        readonly state: 'released';
    };
    'submit-authorization-expression': {
        readonly expressionId: string;
    };
    'accept-member-invitation': {
        readonly invitationId: string;
        readonly state: InvitationTerminal;
    };
    'reject-member-invitation': {
        readonly invitationId: string;
        readonly state: InvitationTerminal;
    };
    'withdraw-member-invitation': {
        readonly invitationId: string;
        readonly state: InvitationTerminal;
    };
    'accept-affiliation-request': {
        readonly requestId: string;
        readonly state: AffiliationRequestTerminal;
    };
    'reject-affiliation-request': {
        readonly requestId: string;
        readonly state: AffiliationRequestTerminal;
    };
    'withdraw-affiliation-request': {
        readonly requestId: string;
        readonly state: AffiliationRequestTerminal;
    };
};
export type BusinessOutcomes = {
    'public-health': 'succeeded';
    'register-and-activate': 'succeeded' | 'not-loginable';
    'issue-login': 'succeeded' | 'uniform-auth-failure' | 'basis-unavailable';
    'revoke-login': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable';
    'replace-credential': 'succeeded' | 'denied' | 'basis-unavailable';
    'query-own-valid-logins': 'succeeded' | 'denied' | 'basis-unavailable';
    'query-current-tenant': 'succeeded' | 'denied' | 'basis-unavailable';
    'query-own-memberships': 'succeeded' | 'denied' | 'basis-unavailable';
    'query-received-invitations': 'succeeded' | 'denied' | 'basis-unavailable';
    'query-create-organization': 'succeeded' | 'denied' | 'basis-unavailable' | 'conflict' | 'unknown';
    'issue-member-invitation': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable';
    'open-affiliation-request': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable';
    'query-organization-members': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable';
    'accept-member-invitation': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable';
    'reject-member-invitation': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable';
    'withdraw-member-invitation': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable';
    'query-invitation': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable';
    'create-organization': 'succeeded' | 'denied' | 'basis-unavailable' | 'conflict' | 'unknown';
    'leave-organization': 'succeeded' | 'denied' | 'basis-unavailable';
    'remove-member': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable' | 'conflict';
    'change-member-role': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable' | 'conflict';
    'switch-current-tenant': 'succeeded' | 'no-change' | 'denied' | 'basis-unavailable';
    'query-organization': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable';
    'query-issued-invitations': 'succeeded' | 'denied' | 'basis-unavailable';
    'accept-affiliation-request': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable';
    'reject-affiliation-request': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable';
    'withdraw-affiliation-request': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable';
    'release-affiliation': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'basis-unavailable' | 'conflict';
    'query-received-affiliation-requests': 'succeeded' | 'denied' | 'basis-unavailable';
    'query-issued-affiliation-requests': 'succeeded' | 'denied' | 'basis-unavailable';
    'query-affiliation-request': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable';
    'judge-admission': 'succeeded' | 'denied' | 'not-visible' | 'basis-unavailable' | 'need-decision';
    'submit-authorization-expression': 'succeeded' | 'no-change' | 'denied' | 'basis-unavailable' | 'unknown';
    'withdraw-authorization-expression': 'succeeded' | 'denied' | 'basis-unavailable' | 'unknown';
    'bind-model-credential': 'succeeded' | 'denied' | 'basis-unavailable' | 'unknown';
    'unbind-model-credential': 'succeeded' | 'no-change' | 'denied' | 'basis-unavailable' | 'unknown';
    'describe-model-credential': 'succeeded' | 'denied' | 'basis-unavailable';
    'list-settings': 'succeeded' | 'denied' | 'basis-unavailable';
    'set-setting': 'succeeded' | 'denied' | 'not-visible' | 'conflict' | 'not-writable' | 'basis-unavailable' | 'unknown';
    'describe-setting': 'succeeded' | 'denied' | 'not-visible' | 'conflict' | 'not-writable' | 'basis-unavailable';
    'clear-setting': 'succeeded' | 'no-change' | 'denied' | 'not-visible' | 'conflict' | 'not-writable' | 'basis-unavailable' | 'unknown';
};
export type Correlated<K extends string, B> = {
    readonly protocolVersion: 'governance-public/1';
    readonly messageId: string;
    readonly outcome: K;
    readonly body: B;
};
export type GovernanceProtocolRejected = {
    readonly protocolVersion: 'governance-public/1';
    readonly messageId?: string;
    readonly outcome: 'protocol-rejected';
    readonly body: EmptyBody;
};
export type GovernanceStageNotProvided = {
    readonly protocolVersion: 'governance-public/1';
    readonly messageId?: string;
    readonly outcome: 'stage-not-provided';
    readonly body: EmptyBody;
};
export type GovernanceProtocolResult = GovernanceProtocolRejected | GovernanceStageNotProvided;
export type BusinessBody<O extends GovernanceProvidedOperation, K extends BusinessOutcomes[O]> = K extends 'succeeded' ? SuccessBodies[O] : K extends 'no-change' ? O extends keyof NoChangeBodies ? NoChangeBodies[O] : never : K extends 'need-decision' ? {
    readonly decisionRequestId: string;
} : EmptyBody;
export type BusinessResponse<O extends GovernanceProvidedOperation> = {
    readonly [K in BusinessOutcomes[O]]: Correlated<K, BusinessBody<O, K>>;
}[BusinessOutcomes[O]];
export type ResponseByOperation = {
    readonly [O in GovernanceOperation]: GovernanceProtocolRejected | GovernanceStageNotProvided | (O extends GovernanceProvidedOperation ? BusinessResponse<O> : never);
};
export type GovernanceResponse<O extends GovernanceOperation = GovernanceOperation> = ResponseByOperation[O];
export type GovernanceDiagnostic = {
    readonly code: 'json' | 'version' | 'operation' | 'field' | 'budget';
};
export type GovernanceRequestRead = {
    readonly kind: 'request';
    readonly request: GovernanceRequest;
} | {
    readonly kind: 'protocol-rejected';
    readonly response: GovernanceProtocolRejected;
    readonly diagnostic: GovernanceDiagnostic;
} | {
    readonly kind: 'stage-not-provided';
    readonly response: GovernanceStageNotProvided;
};
export type GovernanceResponseRead<O extends GovernanceOperation> = {
    readonly kind: 'response';
    readonly response: GovernanceResponse<O>;
} | {
    readonly kind: 'unmatched';
} | {
    readonly kind: 'unreadable';
    readonly diagnostic: GovernanceDiagnostic;
};
export type GovernanceEncodeResult = {
    readonly kind: 'encoded';
    readonly bytes: Uint8Array;
} | {
    readonly kind: 'invalid';
    readonly diagnostic: GovernanceDiagnostic;
};
export type GovernanceResponseEncodeInput<O extends GovernanceOperation = GovernanceOperation> = {
    readonly [K in O]: {
        readonly operation: K;
        readonly response: GovernanceResponse<K>;
        readonly limits: GovernanceCodecLimits;
    };
}[O];
```

## 声明文件 `operation-rules.d.ts`

```ts
import type { GovernanceProvidedOperation, GovernanceStageOperation } from './messages.ts';
export type LeafKind = 'text' | 'string' | 'boolean' | 'null' | 'account' | 'organization' | 'login' | 'tenant' | 'instant' | 'session' | 'page-bytes' | 'positive-integer' | 'parameters' | 'json' | 'user-message';
export type Rule = {
    readonly kind: LeafKind;
} | {
    readonly kind: 'literal';
    readonly values: readonly (string | boolean)[];
} | {
    readonly kind: 'object';
    readonly fields: Readonly<Record<string, {
        readonly rule: Rule;
        readonly optional?: true;
    }>>;
} | {
    readonly kind: 'array';
    readonly item: Rule;
    readonly nonempty?: true;
} | {
    readonly kind: 'one-of';
    readonly rules: readonly Rule[];
};
export type RequestRule = {
    readonly body: Rule;
    readonly proof: boolean;
    readonly tenant: boolean;
};
export type Family<V extends string, P extends string, S extends string> = {
    readonly version: V;
    readonly error: string;
    readonly stages: readonly S[];
    readonly isProvided: (value: unknown) => value is P;
    readonly requestRule: (operation: P) => RequestRule;
    readonly responseRule: (operation: P, outcome: string) => Rule | undefined;
};
export declare const empty: Rule;
export declare const stages: readonly [
    "disable-subject",
    "restore-subject",
    "end-subject",
    "reopen-after-media-loss"
];
export declare function isProvided(value: unknown): value is GovernanceProvidedOperation;
export declare function requestRule(operation: GovernanceProvidedOperation): RequestRule;
export declare function responseRule(operation: GovernanceProvidedOperation, outcome: string): Rule | undefined;
export declare const governanceFamily: Family<'governance-public/1', GovernanceProvidedOperation, GovernanceStageOperation>;
```

## 声明文件 `session-codec.d.ts`

```ts
import type { SessionCodecLimits, SessionEncodeResult, SessionOperation, SessionProtocolRejected, SessionRequest, SessionRequestRead, SessionResponseEncodeInput, SessionResponseRead } from './session-messages.ts';
export declare function readSessionRequest(input: {
    readonly bytes: Uint8Array;
    readonly limits: SessionCodecLimits;
}): SessionRequestRead;
export declare function readSessionResponse<O extends SessionOperation>(input: {
    readonly bytes: Uint8Array;
    readonly operation: O;
    readonly expectedMessageId: string;
    readonly limits: SessionCodecLimits;
}): SessionResponseRead<O>;
export declare function encodeSessionRequest(input: {
    readonly request: SessionRequest;
    readonly limits: SessionCodecLimits;
}): SessionEncodeResult;
export declare function encodeSessionResponse(input: {
    readonly response: SessionProtocolRejected;
    readonly limits: SessionCodecLimits;
}): SessionEncodeResult;
export declare function encodeSessionResponse<O extends SessionOperation>(input: SessionResponseEncodeInput<O>): SessionEncodeResult;
```

## 声明文件 `session-messages.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { TenantId } from '@omne-harness/legal-identity';
import type { EmptyBody, GovernanceCodecLimits, GovernanceDiagnostic, GovernanceEncodeResult, JsonObject, ProofInput } from './messages.ts';
export type SessionCodecLimits = GovernanceCodecLimits;
export type SessionDiagnostic = GovernanceDiagnostic;
export type SessionEncodeResult = GovernanceEncodeResult;
export type SessionTarget = {
    readonly tenant: TenantId;
    readonly session: string;
};
export type SessionProducerRef = {
    readonly kind: 'model' | 'tool';
    readonly call: string;
};
export type SessionTerminalSource = {
    readonly owner: string;
    readonly record: string;
    readonly revision: string;
    readonly digest: string;
};
export type SessionRequestBodies = {
    'create-session': {
        readonly createCallId: string;
        readonly definition: string;
        readonly purpose: string;
    };
    'query-create-session': {
        readonly tenant: TenantId;
        readonly createCallId: string;
    };
    'send-input': SessionTarget & {
        readonly acceptId: string;
        readonly inputId: string;
        readonly message: JsonObject;
    };
    'query-send-input': SessionTarget & {
        readonly acceptId: string;
    };
    'read-history': (SessionTarget & {
        readonly cursor: null;
        readonly direction: 'forward' | 'backward';
        readonly pageBytes: string;
    }) | (SessionTarget & {
        readonly cursor: string;
    });
    'cancel-run': SessionTarget & {
        readonly controlId: string;
        readonly run: string;
        readonly urgency: 'graceful' | 'force';
    };
    'stop-call': SessionTarget & {
        readonly controlId: string;
        readonly producer: SessionProducerRef;
    };
    'read-session-diagnostics': (SessionTarget & {
        readonly cursor: null;
        readonly run: string | null;
        readonly pageBytes: string;
    }) | (SessionTarget & {
        readonly cursor: string;
    });
};
export type SessionOperation = keyof SessionRequestBodies;
export type SessionRequestByOperation = {
    readonly [O in SessionOperation]: {
        readonly protocolVersion: 'session-public/1';
        readonly messageId: string;
        readonly operation: O;
        readonly proof: ProofInput;
        readonly body: SessionRequestBodies[O];
    } & (O extends 'create-session' ? {
        readonly actingTenant: TenantId;
    } : {});
};
export type SessionRequest<O extends SessionOperation = SessionOperation> = SessionRequestByOperation[O];
export type SessionHistoryEntry = {
    readonly entryId: string;
    readonly revision: string;
    readonly kind: string;
    readonly payload: JsonValue;
};
export type SessionHistoryPage = {
    readonly entries: readonly SessionHistoryEntry[];
    readonly next: string | null;
    readonly exhausted: boolean;
    readonly scannedThrough: string;
};
export type SessionDiagnosticGapSource = 'session' | 'agent' | 'model' | 'tool';
export type SessionDiagnosticGapReason = 'unsupported' | 'unavailable' | 'denied' | 'not-disclosed' | 'not-accepted' | 'not-found' | 'not-recorded' | 'retention-expired' | 'truncated';
export type SessionDiagnosticGap = {
    readonly source: SessionDiagnosticGapSource;
    readonly subject: string;
    readonly reason: SessionDiagnosticGapReason;
};
export type SessionDiagnosticUnknown = {
    readonly kind: 'unknown';
    readonly reason: Exclude<SessionDiagnosticGapReason, 'not-disclosed' | 'truncated'>;
};
export type SessionDiagnosticInstant = {
    readonly kind: 'known';
    readonly instant: string;
} | {
    readonly kind: 'unknown';
};
export type SessionDiagnosticMilliseconds = {
    readonly kind: 'known';
    readonly milliseconds: string;
} | {
    readonly kind: 'unknown';
};
export type SessionAdoptionRef = {
    readonly owner: string;
    readonly name: string;
    readonly revision: string;
    readonly digest: string;
};
export type SessionRunCause = {
    readonly kind: 'node-failed';
    readonly node: string;
    readonly category: 'exception' | 'invariant' | 'unsupported-path' | 'rejected';
    readonly failureKind: string;
} | SessionDiagnosticUnknown | {
    readonly kind: 'none';
} | {
    readonly kind: 'no-failure';
    readonly conclusion: 'complete' | 'fail' | 'cancelled';
} | {
    readonly kind: 'model-refused';
    readonly failure: 'denied' | 'invalid' | 'unsupported' | 'capacity' | SessionDiagnosticUnknown;
} | {
    readonly kind: 'no-reply';
    readonly cause: string | null;
    readonly upstreamStatus: string | null;
} | {
    readonly kind: 'request-rejected';
} | {
    readonly kind: 'cannot-fit';
    readonly reason: 'fixed' | 'after-compaction' | SessionDiagnosticUnknown;
} | {
    readonly kind: 'compaction-invalid';
} | {
    readonly kind: 'message-rejected';
} | {
    readonly kind: 'extension-stop';
} | {
    readonly kind: 'guard';
};
export type SessionRunTerminal = {
    readonly outcome: 'completed' | 'failed' | 'cancelled';
    readonly cause: {
        readonly record: string | null;
        readonly structured: SessionRunCause;
    };
};
export type SessionRunControl = {
    readonly position: string;
    readonly kind: 'requested' | 'progress';
    readonly target: 'run' | 'producer' | 'session' | null;
    readonly intent: 'control' | 'interrupt' | 'auto-archive' | null;
    readonly state: 'committed' | 'propagating' | 'reconciled' | null;
};
export type SessionRunAttempts = {
    readonly started: string;
    readonly released: {
        readonly ended: string;
        readonly bounded: string;
        readonly cancelled: string;
        readonly released: string;
        readonly superseded: string;
    };
    readonly exited: string;
};
export type SessionFactCount = {
    readonly kind: string;
    readonly count: string;
};
export type SessionToolDiagnosticEntry = {
    readonly operation: string;
    readonly phase: string;
    readonly code: string;
};
export type SessionCallAccountView = {
    readonly kind: 'account';
    readonly usage: readonly {
        readonly name: string;
        readonly unit: string;
        readonly state: 'unknown' | 'known' | 'provisional';
        readonly lexeme: string | null;
    }[];
    readonly cost: readonly {
        readonly source: string;
        readonly unit: string;
        readonly state: 'unknown' | 'known' | 'provisional';
        readonly lexeme: string | null;
    }[];
    readonly duration: {
        readonly kind: 'known';
        readonly value: string;
    } | {
        readonly kind: 'unknown';
    };
    readonly receipt: 'received' | 'late';
};
export type SessionModelAttemptDiagnostic = {
    readonly dispatch: string;
    readonly revision: string;
    readonly adapter: SessionAdoptionRef;
    readonly send: 'not-sent' | 'sent' | 'unknown';
    readonly firstContent: 'none-proven' | 'observed' | 'uncertain';
    readonly outcome: {
        readonly kind: 'pending';
    } | {
        readonly kind: 'completed';
        readonly reason: 'stop' | 'limit' | 'tool-suggestions';
    } | {
        readonly kind: 'interrupted';
    } | {
        readonly kind: 'failed';
        readonly cause: string;
        readonly upstreamStatus: string | null;
    };
    readonly timing: {
        readonly materialize: SessionDiagnosticMilliseconds;
        readonly sendToFirstContent: SessionDiagnosticMilliseconds;
        readonly execution: SessionDiagnosticMilliseconds;
    };
    readonly account: SessionCallAccountView | SessionDiagnosticUnknown;
};
export type SessionModelCallDiagnostic = {
    readonly reference: string;
    readonly purpose: string;
    readonly call: {
        readonly kind: 'found';
        readonly call: string;
        readonly phase: 'accepted' | 'running' | 'retry-decision' | 'settled';
    } | SessionDiagnosticUnknown;
    readonly dispatches: readonly SessionModelAttemptDiagnostic[];
    readonly coverage: 'complete-through-snapshot' | 'expired-prefix' | 'unknown';
    readonly facts: readonly SessionFactCount[];
};
export type SessionToolCallDiagnostic = {
    readonly reference: string;
    readonly state: {
        readonly kind: 'found';
        readonly call: string;
        readonly phase: 'accepted' | 'preparing' | 'queued' | 'starting' | 'running' | 'suspended' | 'settled';
        readonly relation: 'foreground' | 'background';
        readonly terminal: {
            readonly kind: 'completed' | 'failed' | 'unavailable' | 'interrupted' | 'no-response';
            readonly cause: string | null;
        } | null;
    } | SessionDiagnosticUnknown;
    readonly account: SessionCallAccountView | SessionDiagnosticUnknown;
    readonly facts: readonly SessionFactCount[];
    readonly diagnostics: readonly SessionToolDiagnosticEntry[] | SessionDiagnosticUnknown;
};
export type SessionRunDiagnostic = {
    readonly run: string;
    readonly entry: 'interactive' | 'dispatch';
    readonly execution: string;
    readonly started: {
        readonly position: string;
        readonly at: SessionDiagnosticInstant;
    };
    readonly attempts: SessionRunAttempts;
    readonly controls: readonly SessionRunControl[];
    readonly terminal: SessionRunTerminal | null;
    readonly calls: {
        readonly registered: string;
        readonly projected: string;
    };
    readonly modelCalls: readonly SessionModelCallDiagnostic[];
    readonly toolCalls: readonly SessionToolCallDiagnostic[];
    readonly messages: readonly {
        readonly kind: string;
        readonly count: string;
    }[];
    readonly facts: readonly SessionFactCount[];
};
export type SessionDiagnosticsPage = {
    readonly runs: readonly SessionRunDiagnostic[];
    readonly next: string | null;
    readonly exhausted: boolean;
    readonly scannedThrough: string;
    readonly basis: {
        readonly upper: string;
    };
    readonly gaps: readonly SessionDiagnosticGap[];
};
export type SessionSuccessBodies = {
    'create-session': {
        readonly session: string;
        readonly recovered: boolean;
    };
    'query-create-session': {
        readonly session: string;
    };
    'send-input': {
        readonly recovered: boolean;
    };
    'query-send-input': EmptyBody;
    'read-history': SessionHistoryPage;
    'cancel-run': {
        readonly kind: 'requested';
        readonly controlId: string;
        readonly run: string;
    } | {
        readonly kind: 'ended';
        readonly controlId: string;
        readonly run: string;
        readonly terminal: {
            readonly outcome: 'completed' | 'failed' | 'cancelled';
            readonly source: SessionTerminalSource;
        };
    };
    'stop-call': {
        readonly kind: 'requested';
        readonly controlId: string;
        readonly producer: SessionProducerRef;
    } | {
        readonly kind: 'ended';
        readonly controlId: string;
        readonly producer: SessionProducerRef;
        readonly terminal: {
            readonly version: string;
            readonly outcome: 'completed' | 'failed' | 'interrupted' | 'unavailable' | 'no-response';
            readonly source: SessionTerminalSource;
        };
    };
    'read-session-diagnostics': SessionDiagnosticsPage;
};
export type SessionOutcomes = {
    'create-session': 'limited' | 'succeeded' | 'denied' | 'invalid' | 'conflict' | 'basis-unavailable' | 'unknown';
    'query-create-session': 'succeeded' | 'denied' | 'basis-unavailable' | 'unknown';
    'send-input': 'limited' | 'succeeded' | 'denied' | 'invalid' | 'archived' | 'frozen' | 'conflict' | 'basis-unavailable' | 'unknown';
    'query-send-input': 'succeeded' | 'not-committed' | 'denied' | 'basis-unavailable' | 'unknown';
    'read-history': 'succeeded' | 'denied' | 'invalid' | 'basis-unavailable';
    'cancel-run': 'succeeded' | 'denied' | 'invalid' | 'conflict' | 'not-found' | 'basis-unavailable' | 'unknown';
    'stop-call': 'succeeded' | 'denied' | 'invalid' | 'conflict' | 'not-found' | 'basis-unavailable' | 'unknown' | 'unsupported';
    'read-session-diagnostics': 'succeeded' | 'denied' | 'invalid' | 'basis-unavailable';
};
export type SessionProtocolRejected = {
    readonly protocolVersion: 'session-public/1';
    readonly messageId?: string;
    readonly outcome: 'protocol-rejected';
    readonly body: EmptyBody;
};
export type SessionBusinessResponse<O extends SessionOperation> = {
    readonly [K in SessionOutcomes[O]]: {
        readonly protocolVersion: 'session-public/1';
        readonly messageId: string;
        readonly outcome: K;
        readonly body: K extends 'succeeded' ? SessionSuccessBodies[O] : K extends 'limited' ? {
            readonly resource: 'pending-inputs' | 'input-bytes';
            readonly limit: number;
        } : EmptyBody;
    };
}[SessionOutcomes[O]];
export type SessionResponseByOperation = {
    readonly [O in SessionOperation]: SessionProtocolRejected | SessionBusinessResponse<O>;
};
export type SessionResponse<O extends SessionOperation = SessionOperation> = SessionResponseByOperation[O];
export type SessionRequestRead = {
    readonly kind: 'request';
    readonly request: SessionRequest;
} | {
    readonly kind: 'protocol-rejected';
    readonly response: SessionProtocolRejected;
    readonly diagnostic: SessionDiagnostic;
};
export type SessionResponseRead<O extends SessionOperation> = {
    readonly kind: 'response';
    readonly response: SessionResponse<O>;
} | {
    readonly kind: 'unmatched';
} | {
    readonly kind: 'unreadable';
    readonly diagnostic: SessionDiagnostic;
};
export type SessionResponseEncodeInput<O extends SessionOperation = SessionOperation> = {
    readonly [K in O]: {
        readonly operation: K;
        readonly response: SessionResponse<K>;
        readonly limits: SessionCodecLimits;
    };
}[O];
```

## 声明文件 `session-rules.d.ts`

```ts
import { type Family } from './operation-rules.ts';
import type { SessionOperation, SessionOutcomes } from './session-messages.ts';
declare const outcomes: {
    readonly 'create-session': readonly [
        "limited",
        "succeeded",
        "denied",
        "invalid",
        "conflict",
        "basis-unavailable",
        "unknown"
    ];
    readonly 'query-create-session': readonly [
        "succeeded",
        "denied",
        "basis-unavailable",
        "unknown"
    ];
    readonly 'send-input': readonly [
        "limited",
        "succeeded",
        "denied",
        "invalid",
        "archived",
        "frozen",
        "conflict",
        "basis-unavailable",
        "unknown"
    ];
    readonly 'query-send-input': readonly [
        "succeeded",
        "not-committed",
        "denied",
        "basis-unavailable",
        "unknown"
    ];
    readonly 'read-history': readonly [
        "succeeded",
        "denied",
        "invalid",
        "basis-unavailable"
    ];
    readonly 'cancel-run': readonly [
        "succeeded",
        "denied",
        "invalid",
        "conflict",
        "not-found",
        "basis-unavailable",
        "unknown"
    ];
    readonly 'stop-call': readonly [
        "succeeded",
        "denied",
        "invalid",
        "conflict",
        "not-found",
        "basis-unavailable",
        "unknown",
        "unsupported"
    ];
    readonly 'read-session-diagnostics': readonly [
        "succeeded",
        "denied",
        "invalid",
        "basis-unavailable"
    ];
};
type MissingOutcomes = {
    readonly [O in SessionOperation]: Exclude<SessionOutcomes[O], (typeof outcomes)[O][number]>;
}[SessionOperation];
type OutcomesComplete<Missing extends never> = Missing;
export type SessionOutcomeTableComplete = OutcomesComplete<MissingOutcomes>;
export declare const sessionFamily: Family<'session-public/1', SessionOperation, never>;
export {};
```
