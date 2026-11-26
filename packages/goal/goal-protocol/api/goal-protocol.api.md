# @omne-harness/goal-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `GoalGapRow` · `goal-protocol.d.ts`
- `GoalIssue` · `goal-protocol.d.ts`
- `GoalPanelCommand` · `goal-protocol.d.ts`
- `GoalProposal` · `goal-protocol.d.ts`
- `GoalProvenance` · `goal-protocol.d.ts`
- `GoalStateView` · `goal-protocol.d.ts`
- `GoalView` · `goal-protocol.d.ts`
- `goalProtocol` · `goal-protocol.d.ts`

## 声明文件 `goal-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const state: {
    readonly kind: 'object';
    readonly fields: {
        readonly status: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "active",
                    "paused",
                    "settled"
                ];
            };
        };
        readonly attendance: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "attended",
                    "unattended"
                ];
            };
        };
        readonly generation: {
            rule: {
                readonly kind: 'positive-integer';
            };
        };
        readonly revision: {
            rule: {
                readonly kind: 'positive-integer';
            };
        };
        readonly rounds: {
            rule: {
                readonly kind: 'count';
            };
        };
        readonly pause: {
            rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly by: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "person",
                                        "verdict"
                                    ];
                                };
                            };
                            readonly row: {
                                readonly rule: {
                                    readonly kind: 'positive-integer';
                                };
                                readonly optional: true;
                            };
                            readonly exit: {
                                readonly rule: {
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
                                readonly optional: true;
                            };
                        };
                    },
                    {
                        readonly kind: 'null';
                    }
                ];
            };
        };
        readonly outcome: {
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
                                        "achieved",
                                        "exit",
                                        "unattainable",
                                        "stalled",
                                        "judge-unavailable",
                                        "aborted",
                                        "cancelled"
                                    ];
                                };
                            };
                            readonly exit: {
                                readonly rule: {
                                    readonly kind: 'text';
                                };
                                readonly optional: true;
                            };
                            readonly counts: {
                                readonly rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "success",
                                        "failure"
                                    ];
                                };
                                readonly optional: true;
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
};
declare const gapRow: {
    readonly kind: 'object';
    readonly fields: {
        readonly id: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly ought: {
            rule: {
                readonly kind: 'string';
            };
        };
        readonly reading: {
            rule: {
                readonly kind: 'string';
            };
        };
        readonly source: {
            rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "system",
                            "judge",
                            "agent"
                        ];
                    },
                    {
                        readonly kind: 'null';
                    }
                ];
            };
        };
        readonly ref: {
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
        readonly open: {
            rule: {
                readonly kind: 'boolean';
            };
        };
        readonly short: {
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
declare const provenance: {
    readonly kind: 'object';
    readonly fields: {
        readonly revision: {
            rule: {
                readonly kind: 'positive-integer';
            };
        };
        readonly via: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "card",
                    "direct"
                ];
            };
        };
        readonly words: {
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
        readonly draftedBy: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "agent",
                    "person",
                    "creator"
                ];
            };
        };
        readonly confirmedBy: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly operation: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly at: {
            rule: {
                readonly kind: 'text';
            };
        };
    };
};
declare const goal: {
    readonly kind: 'object';
    readonly fields: {
        readonly state: {
            rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly status: {
                        rule: {
                            readonly kind: 'literal';
                            readonly values: readonly [
                                "active",
                                "paused",
                                "settled"
                            ];
                        };
                    };
                    readonly attendance: {
                        rule: {
                            readonly kind: 'literal';
                            readonly values: readonly [
                                "attended",
                                "unattended"
                            ];
                        };
                    };
                    readonly generation: {
                        rule: {
                            readonly kind: 'positive-integer';
                        };
                    };
                    readonly revision: {
                        rule: {
                            readonly kind: 'positive-integer';
                        };
                    };
                    readonly rounds: {
                        rule: {
                            readonly kind: 'count';
                        };
                    };
                    readonly pause: {
                        rule: {
                            readonly kind: 'one-of';
                            readonly rules: readonly [
                                {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly by: {
                                            rule: {
                                                readonly kind: 'literal';
                                                readonly values: readonly [
                                                    "person",
                                                    "verdict"
                                                ];
                                            };
                                        };
                                        readonly row: {
                                            readonly rule: {
                                                readonly kind: 'positive-integer';
                                            };
                                            readonly optional: true;
                                        };
                                        readonly exit: {
                                            readonly rule: {
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
                                            readonly optional: true;
                                        };
                                    };
                                },
                                {
                                    readonly kind: 'null';
                                }
                            ];
                        };
                    };
                    readonly outcome: {
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
                                                    "achieved",
                                                    "exit",
                                                    "unattainable",
                                                    "stalled",
                                                    "judge-unavailable",
                                                    "aborted",
                                                    "cancelled"
                                                ];
                                            };
                                        };
                                        readonly exit: {
                                            readonly rule: {
                                                readonly kind: 'text';
                                            };
                                            readonly optional: true;
                                        };
                                        readonly counts: {
                                            readonly rule: {
                                                readonly kind: 'literal';
                                                readonly values: readonly [
                                                    "success",
                                                    "failure"
                                                ];
                                            };
                                            readonly optional: true;
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
            };
        };
        readonly rendered: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly body: {
            rule: {
                readonly kind: 'json';
            };
        };
        readonly gap: {
            rule: {
                readonly kind: 'array';
                readonly item: {
                    readonly kind: 'object';
                    readonly fields: {
                        readonly id: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly ought: {
                            rule: {
                                readonly kind: 'string';
                            };
                        };
                        readonly reading: {
                            rule: {
                                readonly kind: 'string';
                            };
                        };
                        readonly source: {
                            rule: {
                                readonly kind: 'one-of';
                                readonly rules: readonly [
                                    {
                                        readonly kind: 'literal';
                                        readonly values: readonly [
                                            "system",
                                            "judge",
                                            "agent"
                                        ];
                                    },
                                    {
                                        readonly kind: 'null';
                                    }
                                ];
                            };
                        };
                        readonly ref: {
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
                        readonly open: {
                            rule: {
                                readonly kind: 'boolean';
                            };
                        };
                        readonly short: {
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
        };
        readonly progress: {
            rule: {
                readonly kind: 'json';
            };
        };
        readonly history: {
            rule: {
                readonly kind: 'array';
                readonly item: {
                    readonly kind: 'object';
                    readonly fields: {
                        readonly revision: {
                            rule: {
                                readonly kind: 'positive-integer';
                            };
                        };
                        readonly via: {
                            rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "card",
                                    "direct"
                                ];
                            };
                        };
                        readonly words: {
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
                        readonly draftedBy: {
                            rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "agent",
                                    "person",
                                    "creator"
                                ];
                            };
                        };
                        readonly confirmedBy: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly operation: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly at: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                    };
                };
            };
        };
    };
};
declare const proposal: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "set"
                        ];
                    };
                };
                readonly draft: {
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
                            "revise"
                        ];
                    };
                };
                readonly changes: {
                    rule: {
                        readonly kind: 'json';
                    };
                };
            };
        }
    ];
};
declare const command: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "pause",
                            "resume",
                            "cancel"
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
                            "settle-by-exit"
                        ];
                    };
                };
                readonly exit: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
            };
        }
    ];
};
declare const issue: {
    readonly kind: 'object';
    readonly fields: {
        readonly entry: {
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
        readonly field: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly problem: {
            rule: {
                readonly kind: 'text';
            };
        };
    };
};
export declare const goalProtocol: {
    readonly operations: {
        readonly 'read-goal': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly goal: {
                        readonly body: import("@omne-harness/json-text").JsonValue;
                        readonly gap: readonly {
                            readonly id: string;
                            readonly open: boolean;
                            readonly ought: string;
                            readonly reading: string;
                            readonly ref: string | null;
                            readonly short: string | null;
                            readonly source: "agent" | "judge" | "system" | null;
                        }[];
                        readonly history: readonly {
                            readonly at: string;
                            readonly confirmedBy: string;
                            readonly draftedBy: "agent" | "creator" | "person";
                            readonly operation: string;
                            readonly revision: number;
                            readonly via: "card" | "direct";
                            readonly words: string | null;
                        }[];
                        readonly progress: import("@omne-harness/json-text").JsonValue;
                        readonly rendered: string;
                        readonly state: {
                            readonly attendance: "attended" | "unattended";
                            readonly generation: number;
                            readonly outcome: {
                                readonly counts?: "failure" | "success";
                                readonly exit?: string;
                                readonly kind: "aborted" | "achieved" | "cancelled" | "exit" | "judge-unavailable" | "stalled" | "unattainable";
                            } | null;
                            readonly pause: {
                                readonly by: "person" | "verdict";
                                readonly exit?: string | null;
                                readonly row?: number;
                            } | null;
                            readonly revision: number;
                            readonly rounds: number;
                            readonly status: "active" | "paused" | "settled";
                        };
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
        };
        readonly 'write-goal': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly goal: {
                        readonly body: import("@omne-harness/json-text").JsonValue;
                        readonly gap: readonly {
                            readonly id: string;
                            readonly open: boolean;
                            readonly ought: string;
                            readonly reading: string;
                            readonly ref: string | null;
                            readonly short: string | null;
                            readonly source: "agent" | "judge" | "system" | null;
                        }[];
                        readonly history: readonly {
                            readonly at: string;
                            readonly confirmedBy: string;
                            readonly draftedBy: "agent" | "creator" | "person";
                            readonly operation: string;
                            readonly revision: number;
                            readonly via: "card" | "direct";
                            readonly words: string | null;
                        }[];
                        readonly progress: import("@omne-harness/json-text").JsonValue;
                        readonly rendered: string;
                        readonly state: {
                            readonly attendance: "attended" | "unattended";
                            readonly generation: number;
                            readonly outcome: {
                                readonly counts?: "failure" | "success";
                                readonly exit?: string;
                                readonly kind: "aborted" | "achieved" | "cancelled" | "exit" | "judge-unavailable" | "stalled" | "unattainable";
                            } | null;
                            readonly pause: {
                                readonly by: "person" | "verdict";
                                readonly exit?: string | null;
                                readonly row?: number;
                            } | null;
                            readonly revision: number;
                            readonly rounds: number;
                            readonly status: "active" | "paused" | "settled";
                        };
                    };
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly issues: readonly {
                        readonly entry: string | null;
                        readonly field: string;
                        readonly problem: string;
                    }[];
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "another-goal" | "attended" | "goal-in-progress" | "no-live-goal" | "nobody-attends" | "not-its-cause";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "input";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly proposal: {
                    readonly draft: import("@omne-harness/json-text").JsonValue;
                    readonly kind: "set";
                } | {
                    readonly changes: import("@omne-harness/json-text").JsonValue;
                    readonly kind: "revise";
                };
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly words: string | null;
            }>;
        };
        readonly 'query-write-goal': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly goal: {
                        readonly body: import("@omne-harness/json-text").JsonValue;
                        readonly gap: readonly {
                            readonly id: string;
                            readonly open: boolean;
                            readonly ought: string;
                            readonly reading: string;
                            readonly ref: string | null;
                            readonly short: string | null;
                            readonly source: "agent" | "judge" | "system" | null;
                        }[];
                        readonly history: readonly {
                            readonly at: string;
                            readonly confirmedBy: string;
                            readonly draftedBy: "agent" | "creator" | "person";
                            readonly operation: string;
                            readonly revision: number;
                            readonly via: "card" | "direct";
                            readonly words: string | null;
                        }[];
                        readonly progress: import("@omne-harness/json-text").JsonValue;
                        readonly rendered: string;
                        readonly state: {
                            readonly attendance: "attended" | "unattended";
                            readonly generation: number;
                            readonly outcome: {
                                readonly counts?: "failure" | "success";
                                readonly exit?: string;
                                readonly kind: "aborted" | "achieved" | "cancelled" | "exit" | "judge-unavailable" | "stalled" | "unattainable";
                            } | null;
                            readonly pause: {
                                readonly by: "person" | "verdict";
                                readonly exit?: string | null;
                                readonly row?: number;
                            } | null;
                            readonly revision: number;
                            readonly rounds: number;
                            readonly status: "active" | "paused" | "settled";
                        };
                    };
                }>;
                readonly 'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "input";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly proposal: {
                    readonly draft: import("@omne-harness/json-text").JsonValue;
                    readonly kind: "set";
                } | {
                    readonly changes: import("@omne-harness/json-text").JsonValue;
                    readonly kind: "revise";
                };
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly words: string | null;
            }>;
        };
        readonly 'command-goal': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly goal: {
                        readonly body: import("@omne-harness/json-text").JsonValue;
                        readonly gap: readonly {
                            readonly id: string;
                            readonly open: boolean;
                            readonly ought: string;
                            readonly reading: string;
                            readonly ref: string | null;
                            readonly short: string | null;
                            readonly source: "agent" | "judge" | "system" | null;
                        }[];
                        readonly history: readonly {
                            readonly at: string;
                            readonly confirmedBy: string;
                            readonly draftedBy: "agent" | "creator" | "person";
                            readonly operation: string;
                            readonly revision: number;
                            readonly via: "card" | "direct";
                            readonly words: string | null;
                        }[];
                        readonly progress: import("@omne-harness/json-text").JsonValue;
                        readonly rendered: string;
                        readonly state: {
                            readonly attendance: "attended" | "unattended";
                            readonly generation: number;
                            readonly outcome: {
                                readonly counts?: "failure" | "success";
                                readonly exit?: string;
                                readonly kind: "aborted" | "achieved" | "cancelled" | "exit" | "judge-unavailable" | "stalled" | "unattainable";
                            } | null;
                            readonly pause: {
                                readonly by: "person" | "verdict";
                                readonly exit?: string | null;
                                readonly row?: number;
                            } | null;
                            readonly revision: number;
                            readonly rounds: number;
                            readonly status: "active" | "paused" | "settled";
                        };
                    } | null;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "another-goal" | "attended" | "goal-in-progress" | "no-live-goal" | "nobody-attends" | "not-its-cause";
                }>;
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
                readonly command: {
                    readonly kind: "cancel" | "pause" | "resume";
                } | {
                    readonly exit: string;
                    readonly kind: "settle-by-exit";
                };
                readonly generation: number;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "goal";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-goal': {
            readonly identity: "login";
            readonly open: import("@omne-harness/public-contract").Codec<{
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly frame: import("@omne-harness/public-contract").Codec<{
                readonly kind: "changed";
            }>;
            readonly ends: readonly [
            ];
        };
    };
};
export type GoalView = RuleValue<typeof goal>;
export type GoalStateView = RuleValue<typeof state>;
export type GoalGapRow = RuleValue<typeof gapRow>;
export type GoalProvenance = RuleValue<typeof provenance>;
export type GoalProposal = RuleValue<typeof proposal>;
export type GoalPanelCommand = RuleValue<typeof command>;
export type GoalIssue = RuleValue<typeof issue>;
export {};
```

## 声明文件 `index.d.ts`

```ts
export { goalProtocol, type GoalGapRow, type GoalIssue, type GoalPanelCommand, type GoalProposal, type GoalProvenance, type GoalStateView, type GoalView, } from './goal-protocol.ts';
```
