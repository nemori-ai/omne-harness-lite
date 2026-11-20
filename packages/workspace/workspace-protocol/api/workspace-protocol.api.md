# @omne-harness/workspace-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `WorkspaceInstanceBody` · `workspace-protocol.d.ts`
- `WorkspaceProtocol` · `workspace-protocol.d.ts`
- `WorkspaceSummaryBody` · `workspace-protocol.d.ts`
- `WorkspaceViewBody` · `workspace-protocol.d.ts`
- `workspaceProtocol` · `workspace-protocol.d.ts`

## 声明文件 `index.d.ts`

```ts
export { workspaceProtocol, type WorkspaceInstanceBody, type WorkspaceProtocol, type WorkspaceSummaryBody, type WorkspaceViewBody, } from './workspace-protocol.ts';
```

## 声明文件 `workspace-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const summary: {
    readonly kind: 'object';
    readonly fields: {
        readonly workspace: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly type: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly standing: {
            readonly rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "participant",
                    "admin",
                    "owner"
                ];
            };
        };
    };
};
declare const instance: {
    readonly kind: 'object';
    readonly fields: {
        readonly instance: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly address: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly availability: {
            rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "available"
                                    ];
                                };
                            };
                            readonly directory: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly basis: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    },
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "unavailable"
                                    ];
                                };
                            };
                            readonly reason: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    },
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "unknown"
                                    ];
                                };
                            };
                        };
                    }
                ];
            };
        };
    };
};
declare const view: {
    readonly kind: 'object';
    readonly fields: {
        readonly workspace: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly type: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly standing: {
            readonly rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "participant",
                    "admin",
                    "owner"
                ];
            };
        };
        readonly instances: {
            rule: {
                readonly kind: 'array';
                readonly item: {
                    readonly kind: 'object';
                    readonly fields: {
                        readonly instance: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly address: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly availability: {
                            rule: {
                                readonly kind: 'one-of';
                                readonly rules: readonly [
                                    {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly kind: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "available"
                                                    ];
                                                };
                                            };
                                            readonly directory: {
                                                rule: {
                                                    readonly kind: 'text';
                                                };
                                            };
                                            readonly basis: {
                                                rule: {
                                                    readonly kind: 'text';
                                                };
                                            };
                                        };
                                    },
                                    {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly kind: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "unavailable"
                                                    ];
                                                };
                                            };
                                            readonly reason: {
                                                rule: {
                                                    readonly kind: 'text';
                                                };
                                            };
                                        };
                                    },
                                    {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly kind: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "unknown"
                                                    ];
                                                };
                                            };
                                        };
                                    }
                                ];
                            };
                        };
                    };
                };
            };
        };
    };
};
export declare const workspaceProtocol: {
    readonly operations: {
        readonly register: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly instance: string;
                    readonly type: string;
                    readonly workspace: string;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly instance: string;
                    readonly type: string;
                    readonly workspace: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: string;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly address: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly type?: string;
            }>;
        };
        readonly 'query-register': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly instance: string;
                    readonly type: string;
                    readonly workspace: string;
                }>;
                readonly 'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly address: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly type?: string;
            }>;
        };
        readonly list: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly workspaces: readonly {
                        readonly standing: "admin" | "owner" | "participant";
                        readonly type: string;
                        readonly workspace: string;
                    }[];
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly describe: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly instances: readonly {
                        readonly address: string;
                        readonly availability: {
                            readonly basis: string;
                            readonly directory: string;
                            readonly kind: "available";
                        } | {
                            readonly kind: "unavailable";
                            readonly reason: string;
                        } | {
                            readonly kind: "unknown";
                        };
                        readonly instance: string;
                    }[];
                    readonly standing: "admin" | "owner" | "participant";
                    readonly type: string;
                    readonly workspace: string;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly associate: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly instance: string;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly instance: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: string;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly address: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'query-associate': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly instance: string;
                }>;
                readonly 'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly address: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly dissociate: {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'no-change': import("@omne-harness/public-contract").Codec<{}>;
                invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: string;
                }>;
                conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            identity: 'login';
            effect: 'commit';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly instance: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'query-dissociate': {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            identity: 'login';
            effect: 'read';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly instance: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'grant-participation': {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'no-change': import("@omne-harness/public-contract").Codec<{}>;
                invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: string;
                }>;
                conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            identity: 'login';
            effect: 'commit';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly target: import("@omne-harness/legal-identity").TenantId;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'query-grant-participation': {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            identity: 'login';
            effect: 'read';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly target: import("@omne-harness/legal-identity").TenantId;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'grant-admin': {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'no-change': import("@omne-harness/public-contract").Codec<{}>;
                invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: string;
                }>;
                conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            identity: 'login';
            effect: 'commit';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly target: import("@omne-harness/legal-identity").TenantId;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'query-grant-admin': {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            identity: 'login';
            effect: 'read';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly target: import("@omne-harness/legal-identity").TenantId;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'revoke-admin': {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'no-change': import("@omne-harness/public-contract").Codec<{}>;
                invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: string;
                }>;
                conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            identity: 'login';
            effect: 'commit';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly target: import("@omne-harness/legal-identity").TenantId;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'query-revoke-admin': {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            identity: 'login';
            effect: 'read';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly target: import("@omne-harness/legal-identity").TenantId;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly remove: {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'no-change': import("@omne-harness/public-contract").Codec<{}>;
                invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: string;
                }>;
                conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            identity: 'login';
            effect: 'commit';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly target: import("@omne-harness/legal-identity").TenantId;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'query-remove': {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            identity: 'login';
            effect: 'read';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly target: import("@omne-harness/legal-identity").TenantId;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly leave: {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'no-change': import("@omne-harness/public-contract").Codec<{}>;
                invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: string;
                }>;
                conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            identity: 'login';
            effect: 'commit';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'query-leave': {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            identity: 'login';
            effect: 'read';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly destroy: {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'no-change': import("@omne-harness/public-contract").Codec<{}>;
                invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: string;
                }>;
                conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            identity: 'login';
            effect: 'commit';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
        readonly 'query-destroy': {
            readonly outcomes: {
                succeeded: import("@omne-harness/public-contract").Codec<{}>;
                'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            identity: 'login';
            effect: 'read';
            limit: 'small';
            countsAsAccess: true;
            body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: string;
            }>;
        };
    };
    readonly name: "workspace";
    readonly major: 1;
    readonly observations: {};
};
export type WorkspaceProtocol = typeof workspaceProtocol;
export type WorkspaceSummaryBody = RuleValue<typeof summary>;
export type WorkspaceViewBody = RuleValue<typeof view>;
export type WorkspaceInstanceBody = RuleValue<typeof instance>;
export {};
```
