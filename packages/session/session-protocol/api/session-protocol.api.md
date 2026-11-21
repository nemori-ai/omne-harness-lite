# @omne-harness/session-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ObserveSessionFrame` · `session-protocol.d.ts`
- `ObserveSessionOpen` · `session-protocol.d.ts`
- `SessionProtocol` · `session-protocol.d.ts`
- `UserAttachment` · `user-message.d.ts`
- `UserMessage` · `user-message.d.ts`
- `sessionProtocol` · `session-protocol.d.ts`
- `userMessage` · `user-message.d.ts`
- `userMessageId` · `user-message.d.ts`
- `userTextMessage` · `user-message.d.ts`

## 声明文件 `index.d.ts`

```ts
export { sessionProtocol, type ObserveSessionFrame, type ObserveSessionOpen, type SessionProtocol, } from './session-protocol.ts';
export { userMessage, userMessageId, userTextMessage, type UserAttachment, type UserMessage, } from './user-message.ts';
```

## 声明文件 `session-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const observeSessionOpen: {
    readonly kind: 'object';
    readonly fields: {
        readonly tenant: {
            readonly rule: {
                readonly kind: 'tenant';
            };
        };
        readonly session: {
            readonly rule: {
                readonly kind: 'session';
            };
        };
    };
};
declare const observeSessionFrame: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "state"
                        ];
                    };
                };
                readonly run: {
                    rule: {
                        readonly kind: 'one-of';
                        readonly rules: readonly [
                            {
                                readonly kind: 'text';
                            },
                            {
                                readonly kind: 'null';
                            }
                        ];
                    };
                };
                readonly revision: {
                    rule: {
                        readonly kind: 'string';
                    };
                };
                readonly phase: {
                    rule: {
                        readonly kind: 'one-of';
                        readonly rules: readonly [
                            {
                                readonly kind: 'text';
                            },
                            {
                                readonly kind: 'null';
                            }
                        ];
                    };
                };
                readonly attempts: {
                    readonly rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly allowed: {
                                readonly rule: {
                                    readonly kind: "count";
                                };
                            };
                            readonly made: {
                                readonly rule: {
                                    readonly kind: "count";
                                };
                            };
                            readonly last: {
                                rule: {
                                    readonly kind: 'one-of';
                                    readonly rules: readonly [
                                        {
                                            readonly kind: 'object';
                                            readonly fields: {
                                                readonly cause: {
                                                    rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly upstreamStatus: {
                                                    rule: {
                                                        readonly kind: 'one-of';
                                                        readonly rules: readonly [
                                                            {
                                                                readonly kind: 'text';
                                                            },
                                                            {
                                                                readonly kind: 'null';
                                                            }
                                                        ];
                                                    };
                                                };
                                            };
                                        },
                                        {
                                            readonly kind: 'null';
                                        }
                                    ];
                                };
                            };
                            readonly notBefore: {
                                rule: {
                                    readonly kind: 'one-of';
                                    readonly rules: readonly [
                                        {
                                            readonly kind: 'text';
                                        },
                                        {
                                            readonly kind: 'null';
                                        }
                                    ];
                                };
                            };
                        };
                    };
                    readonly optional: true;
                };
                readonly target: {
                    rule: {
                        readonly kind: 'one-of';
                        readonly rules: readonly [
                            {
                                readonly kind: 'object';
                                readonly fields: {
                                    readonly projection: {
                                        readonly rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "model-output-v1"
                                            ];
                                        };
                                    };
                                };
                            },
                            {
                                readonly kind: 'null';
                            }
                        ];
                    };
                };
            };
        },
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    readonly rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "snapshot"
                        ];
                    };
                };
                readonly projection: {
                    readonly rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "model-output-v1"
                        ];
                    };
                };
                readonly value: {
                    rule: {
                        readonly kind: 'json';
                    };
                };
            };
        },
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    readonly rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "delta"
                        ];
                    };
                };
                readonly projection: {
                    readonly rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "model-output-v1"
                        ];
                    };
                };
                readonly value: {
                    rule: {
                        readonly kind: 'json';
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
                            "gap"
                        ];
                    };
                };
                readonly reason: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "buffer",
                            "source-history"
                        ];
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
                            "refreshing"
                        ];
                    };
                };
            };
        }
    ];
};
export type ObserveSessionOpen = RuleValue<typeof observeSessionOpen>;
export type ObserveSessionFrame = RuleValue<typeof observeSessionFrame>;
export declare const sessionProtocol: {
    readonly operations: {
        readonly 'create-session': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly recovered: boolean;
                    readonly session: string;
                }>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: number;
                    readonly resource: "input-bytes" | "pending-inputs";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
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
                readonly definition?: string;
                readonly model?: string;
                readonly purpose: string;
                readonly workspace?: {
                    readonly instance: string;
                    readonly workspace: string;
                };
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'query-create-session': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly session: string;
                }>;
                readonly unknown: true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly createCallId: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'send-input': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly recovered: boolean;
                }>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: number;
                    readonly resource: "input-bytes" | "pending-inputs";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly archived: import("@omne-harness/public-contract").Codec<{}>;
                readonly frozen: import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "input";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly acceptId: string;
                readonly inputId: string;
                readonly message: {
                    readonly kind: 'object';
                    readonly entries: readonly import("@omne-harness/json-text").JsonEntry[];
                };
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'interrupt-input': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly as: "interrupt" | "ordinary";
                    readonly recovered: boolean;
                }>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: number;
                    readonly resource: "input-bytes" | "pending-inputs";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly archived: import("@omne-harness/public-contract").Codec<{}>;
                readonly frozen: import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "input";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly acceptId: string;
                readonly inputId: string;
                readonly message: {
                    readonly kind: 'object';
                    readonly entries: readonly import("@omne-harness/json-text").JsonEntry[];
                };
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'query-send-input': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly unknown: true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly acceptId: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'read-history': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly entries: readonly {
                        readonly entryId: string;
                        readonly kind: string;
                        readonly payload: import("@omne-harness/json-text").JsonValue;
                        readonly revision: string;
                    }[];
                    readonly exhausted: boolean;
                    readonly next: string | null;
                    readonly scannedThrough: string;
                    readonly upper: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly cursor: null;
                readonly direction: "backward" | "forward";
                readonly pageBytes: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            } | {
                readonly cursor: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'read-waiting': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly waiting: {
                        readonly cause: {
                            readonly detail: string | null;
                            readonly kind: string;
                        } | null;
                        readonly pending: number;
                        readonly run: string;
                    } | null;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'read-pending': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly inputs: readonly {
                        readonly input: string;
                        readonly position: string;
                        readonly preview: string;
                        readonly role: "system_reminder" | "user";
                        readonly source: {
                            readonly label: string;
                            readonly name: string;
                        };
                        readonly wakes: boolean;
                    }[];
                    readonly next: string | null;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly after: string | null;
                readonly limit: number;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'read-waiting-calls': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly calls: readonly {
                        readonly action: string | null;
                        readonly card: {
                            readonly digest: string;
                            readonly owner: string;
                            readonly record: string;
                            readonly revision: string;
                        };
                        readonly passage: string;
                        readonly position: string;
                        readonly run: string | null;
                    }[];
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'read-input-fate': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly fate: {
                        readonly kind: "pending";
                        readonly returnedFrom: string | null;
                    } | {
                        readonly kind: "taken";
                        readonly run: string;
                    } | {
                        readonly kind: "answered";
                        readonly run: string;
                        readonly terminal: "active" | "cancelled" | "completed" | "failed";
                    } | {
                        readonly by: "archived" | "cancelled" | "frozen";
                        readonly kind: "settled";
                        readonly run: string | null;
                    } | {
                        readonly kind: "refused";
                        readonly reason: string;
                    };
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly inputId: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'search-history': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly complete: boolean;
                    readonly hits: readonly {
                        readonly at: import("@omne-harness/utc-instant").Instant | null;
                        readonly kind: "message.assistant" | "message.compaction" | "message.system_reminder" | "message.tool" | "message.tool_internal" | "message.user";
                        readonly position: string;
                        readonly session: string;
                        readonly snippet: {
                            readonly after: string;
                            readonly before: string;
                            readonly match: string;
                        };
                    }[];
                    readonly incomplete: {
                        readonly behind: number;
                        readonly progress: {
                            readonly indexed: number;
                            readonly total: number;
                        } | null;
                        readonly reason: "budget" | "rebuilding" | "tail-budget";
                    } | null;
                    readonly next: string | null;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly field: "cursor" | "limit" | "query";
                    readonly reason: string;
                }>;
                readonly limited: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly archived?: "all" | "archived" | "unarchived";
                readonly content: {
                    readonly all: readonly string[];
                    readonly caseSensitive: boolean;
                    readonly kind: "literals";
                } | {
                    readonly caseSensitive: boolean;
                    readonly kind: "regex";
                    readonly pattern: string;
                };
                readonly cursor: string | null;
                readonly from?: import("@omne-harness/utc-instant").Instant | null;
                readonly kinds?: readonly ("message.assistant" | "message.compaction" | "message.system_reminder" | "message.tool" | "message.tool_internal" | "message.user")[];
                readonly limit?: number;
                readonly modelReadable?: "any" | "only";
                readonly sessions?: readonly string[] | null;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly to?: import("@omne-harness/utc-instant").Instant | null;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'list-sessions': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete" | "partial";
                    readonly next: string | null;
                    readonly sessions: readonly {
                        readonly attendance?: "attended" | "unattended";
                        readonly createdAt: import("@omne-harness/utc-instant").Instant | null;
                        readonly definition?: string;
                        readonly depth?: number;
                        readonly lastActivityAt: import("@omne-harness/utc-instant").Instant | null;
                        readonly lifecycle: "active" | "archived" | "dormant" | "frozen" | "initializing";
                        readonly origin?: string | null;
                        readonly parent?: string | null;
                        readonly relation?: "child" | "handoff" | "main";
                        readonly root?: string;
                        readonly session: string;
                        readonly title: string | null;
                    }[];
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly attendance?: "attended" | "unattended" | null;
                readonly cursor: string | null;
                readonly definition?: string | null;
                readonly limit?: number;
                readonly parent?: string | null;
                readonly relation?: "child" | "handoff" | "main" | null;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'list-archived-sessions': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete" | "partial";
                    readonly next: string | null;
                    readonly sessions: readonly {
                        readonly archivedAt: import("@omne-harness/utc-instant").Instant | null;
                        readonly archivedBy: "auto" | "parent" | "person" | null;
                        readonly attendance?: "attended" | "unattended";
                        readonly createdAt: import("@omne-harness/utc-instant").Instant | null;
                        readonly definition?: string;
                        readonly depth?: number;
                        readonly lastActivityAt: import("@omne-harness/utc-instant").Instant | null;
                        readonly lifecycle: "active" | "archived" | "dormant" | "frozen" | "initializing";
                        readonly origin?: string | null;
                        readonly parent?: string | null;
                        readonly relation?: "child" | "handoff" | "main";
                        readonly root?: string;
                        readonly session: string;
                        readonly title: string | null;
                    }[];
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly attendance?: "attended" | "unattended" | null;
                readonly by?: "auto" | "parent" | "person" | null;
                readonly cursor: string | null;
                readonly definition?: string | null;
                readonly from?: import("@omne-harness/utc-instant").Instant | null;
                readonly limit?: number;
                readonly parent?: string | null;
                readonly relation?: "child" | "handoff" | "main" | null;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly titleContains?: string | null;
                readonly to?: import("@omne-harness/utc-instant").Instant | null;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'archive-session': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly backgroundCalls: number;
                    readonly controlId: string;
                    readonly kind: "archived";
                    readonly runs: number;
                } | {
                    readonly controlId: string;
                    readonly kind: "already-archived";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly controlId: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'unarchive-session': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly controlId: string;
                    readonly kind: "not-archived" | "unarchived";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly controlId: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'read-permission-mode': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly mode: "auto_permission" | "bypass-permissions" | "never";
                    readonly revision: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'change-permission-mode': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly mode: "auto_permission" | "bypass-permissions" | "never";
                    readonly revision: string;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly mode: "auto_permission" | "bypass-permissions" | "never";
                    readonly revision: string;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly expectedRevision: string;
                readonly mode: "auto_permission" | "bypass-permissions" | "never";
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'cancel-run': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly controlId: string;
                    readonly kind: "requested";
                    readonly run: string;
                } | {
                    readonly controlId: string;
                    readonly kind: "ended";
                    readonly run: string;
                    readonly terminal: {
                        readonly outcome: "cancelled" | "completed" | "failed";
                        readonly source: {
                            readonly digest: string;
                            readonly owner: string;
                            readonly record: string;
                            readonly revision: string;
                        };
                    };
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly controlId: string;
                readonly run: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly urgency: "force" | "graceful";
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'stop-call': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly controlId: string;
                    readonly kind: "requested";
                    readonly producer: {
                        readonly call: string;
                        readonly kind: "model" | "tool";
                    };
                } | {
                    readonly controlId: string;
                    readonly kind: "ended";
                    readonly producer: {
                        readonly call: string;
                        readonly kind: "model" | "tool";
                    };
                    readonly terminal: {
                        readonly outcome: "completed" | "failed" | "interrupted" | "no-response" | "unavailable";
                        readonly source: {
                            readonly digest: string;
                            readonly owner: string;
                            readonly record: string;
                            readonly revision: string;
                        };
                        readonly version: string;
                    };
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly controlId: string;
                readonly producer: {
                    readonly call: string;
                    readonly kind: "model" | "tool";
                };
                readonly reason?: string | null;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'background-call': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly controlId: string;
                    readonly kind: "background" | "requested";
                    readonly producer: {
                        readonly call: string;
                        readonly kind: "tool";
                    };
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly controlId: string;
                readonly producer: {
                    readonly call: string;
                    readonly kind: "tool";
                };
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'list-background-calls': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly calls: readonly {
                        readonly id: string;
                        readonly label: {
                            readonly command: string | null;
                            readonly intent: string | null;
                            readonly preview: string;
                            readonly tool: string;
                        };
                        readonly lastLine: string | null;
                        readonly producer: {
                            readonly call: string;
                            readonly kind: "tool";
                        };
                        readonly source: "control" | "foreground-limit" | "launched" | "threshold";
                        readonly status: "ended-pending" | "queued" | "running" | "stopping" | "unknown";
                        readonly stop: {
                            readonly initiator: "agent" | "system" | "user";
                            readonly progress: "accepted" | "proven" | "requested";
                            readonly reason: string | null;
                        } | null;
                    }[];
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'retry-run': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly recovered: boolean;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly archived: import("@omne-harness/public-contract").Codec<{}>;
                readonly frozen: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly controlId: string;
                readonly run: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'select-model': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly controlId: string;
                    readonly credential: "available" | "missing" | "unknown";
                    readonly model: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly blocks?: readonly {
                        readonly block: string;
                        readonly message: string;
                    }[];
                    readonly reason: "excluded" | "locked" | "modality" | "scope" | "unknown-name" | "withdrawn";
                }>;
                readonly archived: import("@omne-harness/public-contract").Codec<{}>;
                readonly frozen: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly controlId: string;
                readonly model: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'select-workspace': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly controlId: string;
                    readonly directory: string | null;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "instance-unavailable" | "not-permitted";
                }>;
                readonly archived: import("@omne-harness/public-contract").Codec<{}>;
                readonly frozen: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly controlId: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly workspace: {
                    readonly instance: string;
                    readonly workspace: string;
                } | null;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'read-workspace-selection': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly directory: string | null;
                    readonly reason: string | null;
                    readonly revision: string;
                    readonly state: "attached" | "default" | "unusable";
                    readonly workspace: {
                        readonly instance: string;
                        readonly workspace: string;
                    } | null;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'read-model-selection': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly model: string;
                    readonly revision: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
    };
    readonly name: "session";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-session': {
            readonly identity: "login";
            readonly open: import("@omne-harness/public-contract").Codec<{
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly frame: import("@omne-harness/public-contract").Codec<{
                readonly kind: "delta";
                readonly projection: "model-output-v1";
                readonly value: import("@omne-harness/json-text").JsonValue;
            } | {
                readonly kind: "snapshot";
                readonly projection: "model-output-v1";
                readonly value: import("@omne-harness/json-text").JsonValue;
            } | {
                readonly attempts?: {
                    readonly allowed: number;
                    readonly last: {
                        readonly cause: string;
                        readonly upstreamStatus: string | null;
                    } | null;
                    readonly made: number;
                    readonly notBefore: string | null;
                };
                readonly kind: "state";
                readonly phase: string | null;
                readonly revision: string;
                readonly run: string | null;
                readonly target: {
                    readonly projection: "model-output-v1";
                } | null;
            } | {
                readonly kind: "gap";
                readonly reason: "buffer" | "source-history";
            } | {
                readonly kind: "refreshing";
            }>;
            readonly ends: readonly [
                "refresh-exhausted"
            ];
            readonly countsAsAccess: true;
        };
    };
};
export type SessionProtocol = typeof sessionProtocol;
export {};
```

## 声明文件 `user-message.d.ts`

```ts
import type { Codec } from '@omne-harness/public-contract';
import type { SessionProtocol } from './session-protocol.ts';
type SendInputBody = SessionProtocol['operations']['send-input']['body'] extends Codec<infer Body> ? Body : never;
export type UserMessage = SendInputBody['message'];
export declare function userMessageId(inputId: string): Promise<string>;
export type UserAttachment = Readonly<{
    kind: 'image' | 'voice' | 'file';
    ref: Readonly<Record<'storage' | 'key' | 'mediaType' | 'bytes' | 'digest', string>>;
}>;
export declare function userMessage(input: Readonly<{
    inputId: string;
    text: string;
    attachments: readonly UserAttachment[];
}>): Promise<UserMessage>;
export declare function userTextMessage(text: string, inputId: string): Promise<UserMessage>;
export {};
```
