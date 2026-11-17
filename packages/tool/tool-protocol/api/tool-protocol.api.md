# @omne-harness/tool-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ObserveCallFrame` · `tool-protocol.d.ts`
- `ToolCallOutputView` · `tool-protocol.d.ts`
- `ToolCallResultPage` · `tool-protocol.d.ts`
- `ToolCallView` · `tool-protocol.d.ts`
- `ToolProtocol` · `tool-protocol.d.ts`
- `toolProtocol` · `tool-protocol.d.ts`

## 声明文件 `index.d.ts`

```ts
export { toolProtocol, type ObserveCallFrame, type ToolCallOutputView, type ToolCallResultPage, type ToolCallView, type ToolProtocol, } from './tool-protocol.ts';
```

## 声明文件 `tool-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const call: {
    readonly kind: 'object';
    readonly fields: {
        readonly phase: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "accepted",
                    "preparing",
                    "queued",
                    "starting",
                    "running",
                    "suspended",
                    "settled"
                ];
            };
        };
        readonly relation: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "foreground",
                    "background"
                ];
            };
        };
        readonly result: {
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
        readonly terminal: {
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
                                        "completed",
                                        "failed",
                                        "unavailable",
                                        "interrupted",
                                        "no-response"
                                    ];
                                };
                            };
                            readonly detail: {
                                rule: {
                                    readonly kind: 'one-of';
                                    readonly rules: readonly [
                                        {
                                            readonly kind: 'string';
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
        readonly effect: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "not-started",
                    "not-occurred",
                    "occurred",
                    "unknown"
                ];
            };
        };
        readonly controls: {
            rule: {
                readonly kind: 'array';
                readonly item: {
                    readonly kind: 'object';
                    readonly fields: {
                        readonly operation: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly intent: {
                            rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "stop",
                                    "withdraw",
                                    "background"
                                ];
                            };
                        };
                        readonly progress: {
                            rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "pending",
                                    "unknown",
                                    "accepted",
                                    "stopped",
                                    "already-ended",
                                    "relation-changed",
                                    "rejected"
                                ];
                            };
                        };
                    };
                };
            };
        };
    };
};
declare const resultPage: {
    readonly kind: 'object';
    readonly fields: {
        readonly result: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly terminal: {
            rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly kind: {
                        rule: {
                            readonly kind: 'literal';
                            readonly values: readonly [
                                "completed",
                                "failed",
                                "unavailable",
                                "interrupted",
                                "no-response"
                            ];
                        };
                    };
                    readonly detail: {
                        rule: {
                            readonly kind: 'one-of';
                            readonly rules: readonly [
                                {
                                    readonly kind: 'string';
                                },
                                {
                                    readonly kind: 'null';
                                }
                            ];
                        };
                    };
                };
            };
        };
        readonly effect: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "not-started",
                    "not-occurred",
                    "occurred",
                    "unknown"
                ];
            };
        };
        readonly content: {
            rule: {
                readonly kind: 'json';
            };
        };
        readonly next: {
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
declare const callOutput: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "none"
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
                            "open",
                            "sealed"
                        ];
                    };
                };
                readonly from: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
                readonly through: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
                readonly total: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
                readonly text: {
                    rule: {
                        readonly kind: 'string';
                    };
                };
            };
        }
    ];
};
declare const observeCallFrame: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "snapshot"
                        ];
                    };
                };
                readonly call: {
                    rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly phase: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "accepted",
                                        "preparing",
                                        "queued",
                                        "starting",
                                        "running",
                                        "suspended",
                                        "settled"
                                    ];
                                };
                            };
                            readonly relation: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "foreground",
                                        "background"
                                    ];
                                };
                            };
                            readonly result: {
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
                            readonly terminal: {
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
                                                            "completed",
                                                            "failed",
                                                            "unavailable",
                                                            "interrupted",
                                                            "no-response"
                                                        ];
                                                    };
                                                };
                                                readonly detail: {
                                                    rule: {
                                                        readonly kind: 'one-of';
                                                        readonly rules: readonly [
                                                            {
                                                                readonly kind: 'string';
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
                            readonly effect: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "not-started",
                                        "not-occurred",
                                        "occurred",
                                        "unknown"
                                    ];
                                };
                            };
                            readonly controls: {
                                rule: {
                                    readonly kind: 'array';
                                    readonly item: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly operation: {
                                                rule: {
                                                    readonly kind: 'text';
                                                };
                                            };
                                            readonly intent: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "stop",
                                                        "withdraw",
                                                        "background"
                                                    ];
                                                };
                                            };
                                            readonly progress: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "pending",
                                                        "unknown",
                                                        "accepted",
                                                        "stopped",
                                                        "already-ended",
                                                        "relation-changed",
                                                        "rejected"
                                                    ];
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
                readonly process: {
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
                            "delta"
                        ];
                    };
                };
                readonly call: {
                    rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly phase: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "accepted",
                                        "preparing",
                                        "queued",
                                        "starting",
                                        "running",
                                        "suspended",
                                        "settled"
                                    ];
                                };
                            };
                            readonly relation: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "foreground",
                                        "background"
                                    ];
                                };
                            };
                            readonly result: {
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
                            readonly terminal: {
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
                                                            "completed",
                                                            "failed",
                                                            "unavailable",
                                                            "interrupted",
                                                            "no-response"
                                                        ];
                                                    };
                                                };
                                                readonly detail: {
                                                    rule: {
                                                        readonly kind: 'one-of';
                                                        readonly rules: readonly [
                                                            {
                                                                readonly kind: 'string';
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
                            readonly effect: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "not-started",
                                        "not-occurred",
                                        "occurred",
                                        "unknown"
                                    ];
                                };
                            };
                            readonly controls: {
                                rule: {
                                    readonly kind: 'array';
                                    readonly item: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly operation: {
                                                rule: {
                                                    readonly kind: 'text';
                                                };
                                            };
                                            readonly intent: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "stop",
                                                        "withdraw",
                                                        "background"
                                                    ];
                                                };
                                            };
                                            readonly progress: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "pending",
                                                        "unknown",
                                                        "accepted",
                                                        "stopped",
                                                        "already-ended",
                                                        "relation-changed",
                                                        "rejected"
                                                    ];
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
                readonly process: {
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
            };
        }
    ];
};
export declare const toolProtocol: {
    readonly operations: {
        readonly 'read-call': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly call: {
                        readonly controls: readonly {
                            readonly intent: "background" | "stop" | "withdraw";
                            readonly operation: string;
                            readonly progress: "accepted" | "already-ended" | "pending" | "rejected" | "relation-changed" | "stopped" | "unknown";
                        }[];
                        readonly effect: "not-occurred" | "not-started" | "occurred" | "unknown";
                        readonly phase: "accepted" | "preparing" | "queued" | "running" | "settled" | "starting" | "suspended";
                        readonly relation: "background" | "foreground";
                        readonly result: string | null;
                        readonly terminal: {
                            readonly detail: string | null;
                            readonly kind: "completed" | "failed" | "interrupted" | "no-response" | "unavailable";
                        } | null;
                    };
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly reference: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'read-call-result': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly content: import("@omne-harness/json-text").JsonValue;
                    readonly effect: "not-occurred" | "not-started" | "occurred" | "unknown";
                    readonly next: string | null;
                    readonly result: string;
                    readonly terminal: {
                        readonly detail: string | null;
                        readonly kind: "completed" | "failed" | "interrupted" | "no-response" | "unavailable";
                    };
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly cursor: string | null;
                readonly reference: string;
                readonly result: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
        readonly 'read-call-output': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly kind: "none";
                } | {
                    readonly from: string;
                    readonly kind: "open" | "sealed";
                    readonly text: string;
                    readonly through: string;
                    readonly total: string;
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly after: string | null;
                readonly reference: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
    };
    readonly name: "tool";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-call': {
            readonly identity: "login";
            readonly open: import("@omne-harness/public-contract").Codec<{
                readonly reference: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly frame: import("@omne-harness/public-contract").Codec<{
                readonly call: {
                    readonly controls: readonly {
                        readonly intent: "background" | "stop" | "withdraw";
                        readonly operation: string;
                        readonly progress: "accepted" | "already-ended" | "pending" | "rejected" | "relation-changed" | "stopped" | "unknown";
                    }[];
                    readonly effect: "not-occurred" | "not-started" | "occurred" | "unknown";
                    readonly phase: "accepted" | "preparing" | "queued" | "running" | "settled" | "starting" | "suspended";
                    readonly relation: "background" | "foreground";
                    readonly result: string | null;
                    readonly terminal: {
                        readonly detail: string | null;
                        readonly kind: "completed" | "failed" | "interrupted" | "no-response" | "unavailable";
                    } | null;
                };
                readonly kind: "snapshot";
                readonly process: import("@omne-harness/json-text").JsonValue;
            } | {
                readonly call: {
                    readonly controls: readonly {
                        readonly intent: "background" | "stop" | "withdraw";
                        readonly operation: string;
                        readonly progress: "accepted" | "already-ended" | "pending" | "rejected" | "relation-changed" | "stopped" | "unknown";
                    }[];
                    readonly effect: "not-occurred" | "not-started" | "occurred" | "unknown";
                    readonly phase: "accepted" | "preparing" | "queued" | "running" | "settled" | "starting" | "suspended";
                    readonly relation: "background" | "foreground";
                    readonly result: string | null;
                    readonly terminal: {
                        readonly detail: string | null;
                        readonly kind: "completed" | "failed" | "interrupted" | "no-response" | "unavailable";
                    } | null;
                };
                readonly kind: "delta";
                readonly process: import("@omne-harness/json-text").JsonValue;
            } | {
                readonly kind: "gap";
            }>;
            readonly ends: readonly [
                "closed",
                "stale-instance"
            ];
            readonly countsAsAccess: true;
        };
    };
};
export type ToolProtocol = typeof toolProtocol;
export type ToolCallView = RuleValue<typeof call>;
export type ToolCallResultPage = RuleValue<typeof resultPage>;
export type ObserveCallFrame = RuleValue<typeof observeCallFrame>;
export type ToolCallOutputView = RuleValue<typeof callOutput>;
export {};
```
