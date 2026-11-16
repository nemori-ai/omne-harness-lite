# @omne-harness/identity-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `IdentityProtocol` · `identity-protocol.d.ts`
- `identityProtocol` · `identity-protocol.d.ts`

## 声明文件 `identity-protocol.d.ts`

```ts
export declare const identityProtocol: {
    readonly operations: {
        readonly 'register-and-activate': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly accountId: import("@omne-harness/legal-identity").AccountId;
                    readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
                    readonly tenantId: import("@omne-harness/legal-identity").TenantId;
                }>;
                readonly 'not-loginable': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "none";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly credential: string;
                readonly loginIdentifier: string;
            }>;
        };
        readonly 'issue-login': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly issuedAt: import("@omne-harness/utc-instant").Instant;
                    readonly loginId: import("@omne-harness/legal-identity").LoginStateId;
                    readonly loginIdentifier: string;
                    readonly loginProof: string;
                    readonly tenantId: import("@omne-harness/legal-identity").TenantId;
                }>;
                readonly 'uniform-auth-failure': true;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "none";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly credential: string;
                readonly loginIdentifier: string;
            }>;
            readonly carriesCredential: true;
        };
        readonly 'revoke-login': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly targetLoginId: import("@omne-harness/legal-identity").LoginStateId;
            }>;
        };
        readonly 'replace-credential': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly currentCredential: string;
                readonly newCredential: string;
            }>;
        };
        readonly 'query-own-valid-logins': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete";
                    readonly logins: readonly {
                        readonly idleDeadline: import("@omne-harness/utc-instant").Instant;
                        readonly issuedAt: import("@omne-harness/utc-instant").Instant;
                        readonly loginId: import("@omne-harness/legal-identity").LoginStateId;
                        readonly maxDeadline: import("@omne-harness/utc-instant").Instant;
                    }[];
                }>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{}>;
        };
        readonly 'query-current-tenant': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly tenantId: import("@omne-harness/legal-identity").TenantId;
                }>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{}>;
        };
        readonly 'query-own-memberships': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete";
                    readonly memberships: readonly {
                        readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
                        readonly role: string;
                        readonly tenantId: import("@omne-harness/legal-identity").TenantId;
                    }[];
                }>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{}>;
        };
        readonly 'query-received-invitations': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete";
                    readonly invitations: readonly {
                        readonly expiresAt: import("@omne-harness/utc-instant").Instant;
                        readonly invitationId: string;
                        readonly invitedAccountId: import("@omne-harness/legal-identity").AccountId;
                        readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
                        readonly state: "accepted" | "expired" | "open" | "rejected" | "withdrawn";
                    }[];
                }>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{}>;
        };
        readonly 'query-create-organization': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
                    readonly tenantId: import("@omne-harness/legal-identity").TenantId;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly unknown: true;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly governanceModelId: string;
                readonly name: string;
                readonly targetCreateCallId: string;
            }>;
        };
        readonly 'issue-member-invitation': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly expiresAt: import("@omne-harness/utc-instant").Instant;
                    readonly invitationId: string;
                    readonly state: "open";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly duration?: string;
                readonly invitedLoginIdentifier: string;
            }>;
        };
        readonly 'open-affiliation-request': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly expiresAt: import("@omne-harness/utc-instant").Instant;
                    readonly requestId: string;
                    readonly state: "pending";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly duration?: string;
                readonly subordinateOrganizationId: import("@omne-harness/legal-identity").OrganizationId;
                readonly superiorOrganizationId: import("@omne-harness/legal-identity").OrganizationId;
            }>;
        };
        readonly 'query-organization-members': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete";
                    readonly members: readonly {
                        readonly accountId: import("@omne-harness/legal-identity").AccountId;
                        readonly role: string;
                    }[];
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly includeRemoved?: boolean;
                readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
            }>;
        };
        readonly 'accept-member-invitation': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly invitationId: string;
                    readonly state: "accepted";
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly invitationId: string;
                    readonly state: "accepted" | "expired" | "rejected" | "withdrawn";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly expectedState: "open";
                readonly invitationId: string;
            }>;
        };
        readonly 'reject-member-invitation': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly invitationId: string;
                    readonly state: "rejected";
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly invitationId: string;
                    readonly state: "accepted" | "expired" | "rejected" | "withdrawn";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly expectedState: "open";
                readonly invitationId: string;
            }>;
        };
        readonly 'withdraw-member-invitation': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly invitationId: string;
                    readonly state: "withdrawn";
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly invitationId: string;
                    readonly state: "accepted" | "expired" | "rejected" | "withdrawn";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly expectedState: "open";
                readonly invitationId: string;
            }>;
        };
        readonly 'query-invitation': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly expiresAt: import("@omne-harness/utc-instant").Instant;
                    readonly invitationId: string;
                    readonly invitedAccountId: import("@omne-harness/legal-identity").AccountId;
                    readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
                    readonly state: "accepted" | "expired" | "open" | "rejected" | "withdrawn";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly invitationId: string;
            }>;
        };
        readonly 'create-organization': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
                    readonly tenantId: import("@omne-harness/legal-identity").TenantId;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly createCallId: string;
                readonly governanceModelId: string;
                readonly name: string;
            }>;
        };
        readonly 'leave-organization': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{}>;
        };
        readonly 'remove-member': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly accountId: import("@omne-harness/legal-identity").AccountId;
                readonly expectedRole: string;
                readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
            }>;
        };
        readonly 'change-member-role': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly accountId: import("@omne-harness/legal-identity").AccountId;
                readonly expectedRole: string;
                readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
                readonly targetRole: string;
            }>;
        };
        readonly 'switch-current-tenant': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly tenantId: import("@omne-harness/legal-identity").TenantId;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly tenantId: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'query-organization': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly kind: string;
                    readonly name: string;
                    readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
                    readonly superiorOrganizationId?: import("@omne-harness/legal-identity").OrganizationId;
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
            }>;
        };
        readonly 'query-issued-invitations': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete";
                    readonly invitations: readonly {
                        readonly expiresAt: import("@omne-harness/utc-instant").Instant;
                        readonly invitationId: string;
                        readonly invitedAccountId: import("@omne-harness/legal-identity").AccountId;
                        readonly organizationId: import("@omne-harness/legal-identity").OrganizationId;
                        readonly state: "accepted" | "expired" | "open" | "rejected" | "withdrawn";
                    }[];
                }>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{}>;
        };
        readonly 'accept-affiliation-request': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly affiliationId: string;
                    readonly state: "effective";
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly requestId: string;
                    readonly state: "accepted" | "expired" | "invalid" | "rejected" | "withdrawn";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly expectedState: "pending";
                readonly requestId: string;
            }>;
        };
        readonly 'reject-affiliation-request': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly requestId: string;
                    readonly state: "rejected";
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly requestId: string;
                    readonly state: "accepted" | "expired" | "invalid" | "rejected" | "withdrawn";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly expectedState: "pending";
                readonly requestId: string;
            }>;
        };
        readonly 'withdraw-affiliation-request': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly requestId: string;
                    readonly state: "withdrawn";
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly requestId: string;
                    readonly state: "accepted" | "expired" | "invalid" | "rejected" | "withdrawn";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly expectedState: "pending";
                readonly requestId: string;
            }>;
        };
        readonly 'release-affiliation': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly affiliationId: string;
                    readonly state: "released";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly affiliationId: string;
                readonly expectedState: "effective";
            }>;
        };
        readonly 'query-received-affiliation-requests': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly affiliationRequests: readonly {
                        readonly expiresAt: import("@omne-harness/utc-instant").Instant;
                        readonly requestId: string;
                        readonly state: "accepted" | "expired" | "invalid" | "pending" | "rejected" | "withdrawn";
                        readonly subordinateOrganizationId: import("@omne-harness/legal-identity").OrganizationId;
                        readonly superiorOrganizationId: import("@omne-harness/legal-identity").OrganizationId;
                    }[];
                    readonly completeness: "complete";
                }>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{}>;
        };
        readonly 'query-issued-affiliation-requests': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly affiliationRequests: readonly {
                        readonly expiresAt: import("@omne-harness/utc-instant").Instant;
                        readonly requestId: string;
                        readonly state: "accepted" | "expired" | "invalid" | "pending" | "rejected" | "withdrawn";
                        readonly subordinateOrganizationId: import("@omne-harness/legal-identity").OrganizationId;
                        readonly superiorOrganizationId: import("@omne-harness/legal-identity").OrganizationId;
                    }[];
                    readonly completeness: "complete";
                }>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{}>;
        };
        readonly 'query-affiliation-request': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly expiresAt: import("@omne-harness/utc-instant").Instant;
                    readonly requestId: string;
                    readonly state: "accepted" | "expired" | "invalid" | "pending" | "rejected" | "withdrawn";
                    readonly subordinateOrganizationId: import("@omne-harness/legal-identity").OrganizationId;
                    readonly superiorOrganizationId: import("@omne-harness/legal-identity").OrganizationId;
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly requestId: string;
            }>;
        };
        readonly 'judge-admission': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly admitted: true;
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'need-decision': import("@omne-harness/public-contract").Codec<{
                    readonly decisionRequestId: string;
                }>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly action: string;
                readonly parameters: {
                    readonly kind: 'object';
                    readonly entries: readonly import("@omne-harness/json-text").JsonEntry[];
                };
                readonly resource: string;
                readonly scopeId: string;
            }>;
        };
        readonly 'submit-authorization-expression': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly expressionId: string;
                    readonly persistentSettingsUpdated: false;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly expressionId: string;
                }>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly action: string;
                readonly expression: string;
                readonly object: string;
                readonly parameters: {
                    readonly kind: 'object';
                    readonly entries: readonly import("@omne-harness/json-text").JsonEntry[];
                };
            }>;
        };
        readonly 'withdraw-authorization-expression': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'stage-not-provided': true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "acting-tenant";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly expressionId: string;
            }>;
        };
    };
    readonly name: "identity";
    readonly major: 1;
    readonly observations: {};
};
export type IdentityProtocol = typeof identityProtocol;
```

## 声明文件 `index.d.ts`

```ts
export { identityProtocol } from './identity-protocol.ts';
export type { IdentityProtocol } from './identity-protocol.ts';
```

## 声明文件 `rules.d.ts`

```ts
export declare const empty: {
    readonly kind: 'object';
    readonly fields: {};
};
export declare const requests: {
    readonly 'register-and-activate': {
        readonly kind: 'object';
        readonly fields: {
            readonly loginIdentifier: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly credential: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'issue-login': {
        readonly kind: 'object';
        readonly fields: {
            readonly loginIdentifier: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly credential: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'revoke-login': {
        readonly kind: 'object';
        readonly fields: {
            readonly targetLoginId: {
                readonly rule: {
                    readonly kind: 'login';
                };
            };
        };
    };
    readonly 'replace-credential': {
        readonly kind: 'object';
        readonly fields: {
            readonly currentCredential: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly newCredential: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'query-own-valid-logins': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'query-current-tenant': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'query-own-memberships': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'query-received-invitations': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'query-create-organization': {
        readonly kind: 'object';
        readonly fields: {
            readonly name: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly governanceModelId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly targetCreateCallId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'issue-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitedLoginIdentifier: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly duration: {
                readonly rule: {
                    readonly kind: 'text';
                };
                readonly optional: true;
            };
        };
    };
    readonly 'open-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly superiorOrganizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly subordinateOrganizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly duration: {
                readonly rule: {
                    readonly kind: 'text';
                };
                readonly optional: true;
            };
        };
    };
    readonly 'query-organization-members': {
        readonly kind: 'object';
        readonly fields: {
            readonly organizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly includeRemoved: {
                readonly rule: {
                    readonly kind: 'boolean';
                };
                readonly optional: true;
            };
        };
    };
    readonly 'accept-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly expectedState: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'open'
                    ];
                };
            };
        };
    };
    readonly 'reject-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly expectedState: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'open'
                    ];
                };
            };
        };
    };
    readonly 'withdraw-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly expectedState: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'open'
                    ];
                };
            };
        };
    };
    readonly 'query-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'create-organization': {
        readonly kind: 'object';
        readonly fields: {
            readonly name: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly governanceModelId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly createCallId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'leave-organization': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'remove-member': {
        readonly kind: 'object';
        readonly fields: {
            readonly organizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly accountId: {
                readonly rule: {
                    readonly kind: 'account';
                };
            };
            readonly expectedRole: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'change-member-role': {
        readonly kind: 'object';
        readonly fields: {
            readonly organizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly accountId: {
                readonly rule: {
                    readonly kind: 'account';
                };
            };
            readonly expectedRole: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly targetRole: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'switch-current-tenant': {
        readonly kind: 'object';
        readonly fields: {
            readonly tenantId: {
                readonly rule: {
                    readonly kind: 'tenant';
                };
            };
        };
    };
    readonly 'query-organization': {
        readonly kind: 'object';
        readonly fields: {
            readonly organizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
        };
    };
    readonly 'query-issued-invitations': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'accept-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly expectedState: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'pending'
                    ];
                };
            };
        };
    };
    readonly 'reject-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly expectedState: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'pending'
                    ];
                };
            };
        };
    };
    readonly 'withdraw-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly expectedState: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'pending'
                    ];
                };
            };
        };
    };
    readonly 'release-affiliation': {
        readonly kind: 'object';
        readonly fields: {
            readonly affiliationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly expectedState: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        "effective"
                    ];
                };
            };
        };
    };
    readonly 'query-received-affiliation-requests': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'query-issued-affiliation-requests': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'query-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'judge-admission': {
        readonly kind: 'object';
        readonly fields: {
            readonly resource: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly action: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly parameters: {
                readonly rule: {
                    readonly kind: 'parameters';
                };
            };
            readonly scopeId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'submit-authorization-expression': {
        readonly kind: 'object';
        readonly fields: {
            readonly expression: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly action: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly object: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly parameters: {
                readonly rule: {
                    readonly kind: 'parameters';
                };
            };
        };
    };
    readonly 'withdraw-authorization-expression': {
        readonly kind: 'object';
        readonly fields: {
            readonly expressionId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
};
export declare const successes: {
    readonly 'register-and-activate': {
        readonly kind: 'object';
        readonly fields: {
            readonly accountId: {
                readonly rule: {
                    readonly kind: 'account';
                };
            };
            readonly organizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly tenantId: {
                readonly rule: {
                    readonly kind: 'tenant';
                };
            };
        };
    };
    readonly 'issue-login': {
        readonly kind: 'object';
        readonly fields: {
            readonly loginIdentifier: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly issuedAt: {
                readonly rule: {
                    readonly kind: 'instant';
                };
            };
            readonly tenantId: {
                readonly rule: {
                    readonly kind: 'tenant';
                };
            };
            readonly loginProof: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly loginId: {
                readonly rule: {
                    readonly kind: 'login';
                };
            };
        };
    };
    readonly 'revoke-login': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'replace-credential': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'query-own-valid-logins': {
        readonly kind: 'object';
        readonly fields: {
            readonly logins: {
                readonly rule: {
                    readonly kind: 'array';
                    readonly item: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly loginId: {
                                readonly rule: {
                                    readonly kind: 'login';
                                };
                            };
                            readonly issuedAt: {
                                readonly rule: {
                                    readonly kind: 'instant';
                                };
                            };
                            readonly maxDeadline: {
                                readonly rule: {
                                    readonly kind: 'instant';
                                };
                            };
                            readonly idleDeadline: {
                                readonly rule: {
                                    readonly kind: 'instant';
                                };
                            };
                        };
                    };
                    readonly nonempty: true;
                };
            };
            readonly completeness: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'complete'
                    ];
                };
            };
        };
    };
    readonly 'query-current-tenant': {
        readonly kind: 'object';
        readonly fields: {
            readonly tenantId: {
                readonly rule: {
                    readonly kind: 'tenant';
                };
            };
        };
    };
    readonly 'query-own-memberships': {
        readonly kind: 'object';
        readonly fields: {
            readonly memberships: {
                readonly rule: {
                    readonly kind: 'array';
                    readonly item: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly organizationId: {
                                readonly rule: {
                                    readonly kind: 'organization';
                                };
                            };
                            readonly tenantId: {
                                readonly rule: {
                                    readonly kind: 'tenant';
                                };
                            };
                            readonly role: {
                                readonly rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    };
                };
            };
            readonly completeness: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'complete'
                    ];
                };
            };
        };
    };
    readonly 'query-received-invitations': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitations: {
                readonly rule: {
                    readonly kind: 'array';
                    readonly item: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly invitationId: {
                                readonly rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly state: {
                                readonly rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        'open',
                                        'accepted',
                                        'rejected',
                                        'withdrawn',
                                        'expired'
                                    ];
                                };
                            };
                            readonly expiresAt: {
                                readonly rule: {
                                    readonly kind: 'instant';
                                };
                            };
                            readonly organizationId: {
                                readonly rule: {
                                    readonly kind: 'organization';
                                };
                            };
                            readonly invitedAccountId: {
                                readonly rule: {
                                    readonly kind: 'account';
                                };
                            };
                        };
                    };
                };
            };
            readonly completeness: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'complete'
                    ];
                };
            };
        };
    };
    readonly 'query-create-organization': {
        readonly kind: 'object';
        readonly fields: {
            readonly organizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly tenantId: {
                readonly rule: {
                    readonly kind: 'tenant';
                };
            };
        };
    };
    readonly 'issue-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        "open"
                    ];
                };
            };
            readonly expiresAt: {
                readonly rule: {
                    readonly kind: 'instant';
                };
            };
        };
    };
    readonly 'open-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        "pending"
                    ];
                };
            };
            readonly expiresAt: {
                readonly rule: {
                    readonly kind: 'instant';
                };
            };
        };
    };
    readonly 'query-organization-members': {
        readonly kind: 'object';
        readonly fields: {
            readonly members: {
                readonly rule: {
                    readonly kind: 'array';
                    readonly item: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly accountId: {
                                readonly rule: {
                                    readonly kind: 'account';
                                };
                            };
                            readonly role: {
                                readonly rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    };
                };
            };
            readonly completeness: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'complete'
                    ];
                };
            };
        };
    };
    readonly 'accept-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        "accepted"
                    ];
                };
            };
        };
    };
    readonly 'reject-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        "rejected"
                    ];
                };
            };
        };
    };
    readonly 'withdraw-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        "withdrawn"
                    ];
                };
            };
        };
    };
    readonly 'query-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'open',
                        'accepted',
                        'rejected',
                        'withdrawn',
                        'expired'
                    ];
                };
            };
            readonly expiresAt: {
                readonly rule: {
                    readonly kind: 'instant';
                };
            };
            readonly organizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly invitedAccountId: {
                readonly rule: {
                    readonly kind: 'account';
                };
            };
        };
    };
    readonly 'create-organization': {
        readonly kind: 'object';
        readonly fields: {
            readonly organizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly tenantId: {
                readonly rule: {
                    readonly kind: 'tenant';
                };
            };
        };
    };
    readonly 'leave-organization': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'remove-member': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'change-member-role': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'switch-current-tenant': {
        readonly kind: 'object';
        readonly fields: {
            readonly tenantId: {
                readonly rule: {
                    readonly kind: 'tenant';
                };
            };
        };
    };
    readonly 'query-organization': {
        readonly kind: 'object';
        readonly fields: {
            readonly organizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly name: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly kind: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly superiorOrganizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
                readonly optional: true;
            };
        };
    };
    readonly 'query-issued-invitations': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitations: {
                readonly rule: {
                    readonly kind: 'array';
                    readonly item: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly invitationId: {
                                readonly rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly state: {
                                readonly rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        'open',
                                        'accepted',
                                        'rejected',
                                        'withdrawn',
                                        'expired'
                                    ];
                                };
                            };
                            readonly expiresAt: {
                                readonly rule: {
                                    readonly kind: 'instant';
                                };
                            };
                            readonly organizationId: {
                                readonly rule: {
                                    readonly kind: 'organization';
                                };
                            };
                            readonly invitedAccountId: {
                                readonly rule: {
                                    readonly kind: 'account';
                                };
                            };
                        };
                    };
                };
            };
            readonly completeness: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'complete'
                    ];
                };
            };
        };
    };
    readonly 'accept-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly affiliationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        "effective"
                    ];
                };
            };
        };
    };
    readonly 'reject-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        "rejected"
                    ];
                };
            };
        };
    };
    readonly 'withdraw-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        "withdrawn"
                    ];
                };
            };
        };
    };
    readonly 'release-affiliation': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'query-received-affiliation-requests': {
        readonly kind: 'object';
        readonly fields: {
            readonly affiliationRequests: {
                readonly rule: {
                    readonly kind: 'array';
                    readonly item: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly requestId: {
                                readonly rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly state: {
                                readonly rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        'pending',
                                        'accepted',
                                        'rejected',
                                        'withdrawn',
                                        'invalid',
                                        'expired'
                                    ];
                                };
                            };
                            readonly expiresAt: {
                                readonly rule: {
                                    readonly kind: 'instant';
                                };
                            };
                            readonly superiorOrganizationId: {
                                readonly rule: {
                                    readonly kind: 'organization';
                                };
                            };
                            readonly subordinateOrganizationId: {
                                readonly rule: {
                                    readonly kind: 'organization';
                                };
                            };
                        };
                    };
                };
            };
            readonly completeness: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'complete'
                    ];
                };
            };
        };
    };
    readonly 'query-issued-affiliation-requests': {
        readonly kind: 'object';
        readonly fields: {
            readonly affiliationRequests: {
                readonly rule: {
                    readonly kind: 'array';
                    readonly item: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly requestId: {
                                readonly rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly state: {
                                readonly rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        'pending',
                                        'accepted',
                                        'rejected',
                                        'withdrawn',
                                        'invalid',
                                        'expired'
                                    ];
                                };
                            };
                            readonly expiresAt: {
                                readonly rule: {
                                    readonly kind: 'instant';
                                };
                            };
                            readonly superiorOrganizationId: {
                                readonly rule: {
                                    readonly kind: 'organization';
                                };
                            };
                            readonly subordinateOrganizationId: {
                                readonly rule: {
                                    readonly kind: 'organization';
                                };
                            };
                        };
                    };
                };
            };
            readonly completeness: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'complete'
                    ];
                };
            };
        };
    };
    readonly 'query-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'pending',
                        'accepted',
                        'rejected',
                        'withdrawn',
                        'invalid',
                        'expired'
                    ];
                };
            };
            readonly expiresAt: {
                readonly rule: {
                    readonly kind: 'instant';
                };
            };
            readonly superiorOrganizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
            readonly subordinateOrganizationId: {
                readonly rule: {
                    readonly kind: 'organization';
                };
            };
        };
    };
    readonly 'judge-admission': {
        readonly kind: 'object';
        readonly fields: {
            readonly admitted: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        true
                    ];
                };
            };
        };
    };
    readonly 'submit-authorization-expression': {
        readonly kind: 'object';
        readonly fields: {
            readonly expressionId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly persistentSettingsUpdated: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        false
                    ];
                };
            };
        };
    };
    readonly 'withdraw-authorization-expression': {
        readonly kind: 'object';
        readonly fields: {};
    };
};
export declare const noChanges: {
    readonly 'revoke-login': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'switch-current-tenant': {
        readonly kind: 'object';
        readonly fields: {};
    };
    readonly 'release-affiliation': {
        readonly kind: 'object';
        readonly fields: {
            readonly affiliationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        "released"
                    ];
                };
            };
        };
    };
    readonly 'submit-authorization-expression': {
        readonly kind: 'object';
        readonly fields: {
            readonly expressionId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
        };
    };
    readonly 'accept-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'accepted',
                        'rejected',
                        'withdrawn',
                        'expired'
                    ];
                };
            };
        };
    };
    readonly 'reject-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'accepted',
                        'rejected',
                        'withdrawn',
                        'expired'
                    ];
                };
            };
        };
    };
    readonly 'withdraw-member-invitation': {
        readonly kind: 'object';
        readonly fields: {
            readonly invitationId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'accepted',
                        'rejected',
                        'withdrawn',
                        'expired'
                    ];
                };
            };
        };
    };
    readonly 'accept-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'accepted',
                        'rejected',
                        'withdrawn',
                        'invalid',
                        'expired'
                    ];
                };
            };
        };
    };
    readonly 'reject-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'accepted',
                        'rejected',
                        'withdrawn',
                        'invalid',
                        'expired'
                    ];
                };
            };
        };
    };
    readonly 'withdraw-affiliation-request': {
        readonly kind: 'object';
        readonly fields: {
            readonly requestId: {
                readonly rule: {
                    readonly kind: 'text';
                };
            };
            readonly state: {
                readonly rule: {
                    readonly kind: 'literal';
                    readonly values: readonly [
                        'accepted',
                        'rejected',
                        'withdrawn',
                        'invalid',
                        'expired'
                    ];
                };
            };
        };
    };
};
export declare const needDecision: {
    readonly kind: 'object';
    readonly fields: {
        readonly decisionRequestId: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
    };
};
```
