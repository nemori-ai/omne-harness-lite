# @omne-harness/session-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ObserveSessionFrame` · `session-protocol.d.ts`
- `ObserveSessionOpen` · `session-protocol.d.ts`
- `SessionProtocol` · `session-protocol.d.ts`
- `sessionProtocol` · `session-protocol.d.ts`

## 声明文件 `index.d.ts`

```ts
export { sessionProtocol, type ObserveSessionFrame, type ObserveSessionOpen, type SessionProtocol, } from './session-protocol.ts';
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
                readonly purpose: string;
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
