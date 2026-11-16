# @omne-harness/human-intervention-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `HumanInterventionCardItem` · `human-intervention-protocol.d.ts`
- `HumanInterventionCardPage` · `human-intervention-protocol.d.ts`
- `HumanInterventionProtocol` · `human-intervention-protocol.d.ts`
- `HumanInterventionReplyResult` · `human-intervention-protocol.d.ts`
- `humanInterventionProtocol` · `human-intervention-protocol.d.ts`

## 声明文件 `human-intervention-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const item: {
    readonly kind: 'object';
    readonly fields: {
        readonly card: {
            rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly ref: {
                                readonly rule: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly request: {
                                            rule: {
                                                readonly kind: 'object';
                                                readonly fields: {
                                                    readonly tenantRef: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                    readonly requestId: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                        readonly cardId: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                    };
                                };
                            };
                            readonly revision: {
                                readonly rule: {
                                    readonly kind: 'revision';
                                };
                            };
                            readonly question: {
                                readonly rule: {
                                    readonly kind: 'one-of';
                                    readonly rules: readonly [
                                        {
                                            readonly kind: 'object';
                                            readonly fields: {
                                                readonly cardId: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly title: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly description: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly declineConsequence: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly kind: {
                                                    rule: {
                                                        readonly kind: 'literal';
                                                        readonly values: readonly [
                                                            "question",
                                                            "extension"
                                                        ];
                                                    };
                                                };
                                                readonly options: {
                                                    readonly rule: {
                                                        readonly kind: "array";
                                                        readonly item: {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly id: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly label: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                        },
                                        {
                                            readonly kind: 'object';
                                            readonly fields: {
                                                readonly cardId: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly title: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly description: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly declineConsequence: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly kind: {
                                                    rule: {
                                                        readonly kind: 'literal';
                                                        readonly values: readonly [
                                                            "approval",
                                                            "admission"
                                                        ];
                                                    };
                                                };
                                                readonly options: {
                                                    readonly rule: {
                                                        readonly kind: "array";
                                                        readonly item: {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly id: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly label: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly effectRef: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                    readonly optional: true;
                                                                };
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                        }
                                    ];
                                };
                            };
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "pending"
                                    ];
                                };
                            };
                        };
                    },
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly ref: {
                                readonly rule: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly request: {
                                            rule: {
                                                readonly kind: 'object';
                                                readonly fields: {
                                                    readonly tenantRef: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                    readonly requestId: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                        readonly cardId: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                    };
                                };
                            };
                            readonly revision: {
                                readonly rule: {
                                    readonly kind: 'revision';
                                };
                            };
                            readonly question: {
                                readonly rule: {
                                    readonly kind: 'one-of';
                                    readonly rules: readonly [
                                        {
                                            readonly kind: 'object';
                                            readonly fields: {
                                                readonly cardId: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly title: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly description: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly declineConsequence: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly kind: {
                                                    rule: {
                                                        readonly kind: 'literal';
                                                        readonly values: readonly [
                                                            "question",
                                                            "extension"
                                                        ];
                                                    };
                                                };
                                                readonly options: {
                                                    readonly rule: {
                                                        readonly kind: "array";
                                                        readonly item: {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly id: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly label: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                        },
                                        {
                                            readonly kind: 'object';
                                            readonly fields: {
                                                readonly cardId: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly title: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly description: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly declineConsequence: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly kind: {
                                                    rule: {
                                                        readonly kind: 'literal';
                                                        readonly values: readonly [
                                                            "approval",
                                                            "admission"
                                                        ];
                                                    };
                                                };
                                                readonly options: {
                                                    readonly rule: {
                                                        readonly kind: "array";
                                                        readonly item: {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly id: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly label: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly effectRef: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                    readonly optional: true;
                                                                };
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                        }
                                    ];
                                };
                            };
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "decided"
                                    ];
                                };
                            };
                            readonly decision: {
                                rule: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly ref: {
                                            rule: {
                                                readonly kind: 'object';
                                                readonly fields: {
                                                    readonly card: {
                                                        rule: {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly request: {
                                                                    rule: {
                                                                        readonly kind: 'object';
                                                                        readonly fields: {
                                                                            readonly tenantRef: {
                                                                                rule: {
                                                                                    readonly kind: 'text';
                                                                                };
                                                                            };
                                                                            readonly requestId: {
                                                                                rule: {
                                                                                    readonly kind: 'text';
                                                                                };
                                                                            };
                                                                        };
                                                                    };
                                                                };
                                                                readonly cardId: {
                                                                    rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                            };
                                                        };
                                                    };
                                                    readonly decisionId: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                    readonly submission: {
                                                        rule: {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly tenantRef: {
                                                                    rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly actorRef: {
                                                                    rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly operationId: {
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
                                        readonly reply: {
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
                                                                        "selection"
                                                                    ];
                                                                };
                                                            };
                                                            readonly optionId: {
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
                                                                        "text"
                                                                    ];
                                                                };
                                                            };
                                                            readonly text: {
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
                                                                        "decline"
                                                                    ];
                                                                };
                                                            };
                                                        };
                                                    }
                                                ];
                                            };
                                        };
                                        readonly basisRef: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                        readonly commitReceipt: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                    };
                                };
                            };
                            readonly delivery: {
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
                                                            "pending"
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
                                                            "accepted",
                                                            "superseded"
                                                        ];
                                                    };
                                                };
                                                readonly receiptRef: {
                                                    rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                            };
                                        }
                                    ];
                                };
                            };
                        };
                    },
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly ref: {
                                readonly rule: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly request: {
                                            rule: {
                                                readonly kind: 'object';
                                                readonly fields: {
                                                    readonly tenantRef: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                    readonly requestId: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                        readonly cardId: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                    };
                                };
                            };
                            readonly revision: {
                                readonly rule: {
                                    readonly kind: 'revision';
                                };
                            };
                            readonly question: {
                                readonly rule: {
                                    readonly kind: 'one-of';
                                    readonly rules: readonly [
                                        {
                                            readonly kind: 'object';
                                            readonly fields: {
                                                readonly cardId: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly title: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly description: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly declineConsequence: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly kind: {
                                                    rule: {
                                                        readonly kind: 'literal';
                                                        readonly values: readonly [
                                                            "question",
                                                            "extension"
                                                        ];
                                                    };
                                                };
                                                readonly options: {
                                                    readonly rule: {
                                                        readonly kind: "array";
                                                        readonly item: {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly id: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly label: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                        },
                                        {
                                            readonly kind: 'object';
                                            readonly fields: {
                                                readonly cardId: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly title: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly description: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly declineConsequence: {
                                                    readonly rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                                readonly kind: {
                                                    rule: {
                                                        readonly kind: 'literal';
                                                        readonly values: readonly [
                                                            "approval",
                                                            "admission"
                                                        ];
                                                    };
                                                };
                                                readonly options: {
                                                    readonly rule: {
                                                        readonly kind: "array";
                                                        readonly item: {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly id: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly label: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly effectRef: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                    readonly optional: true;
                                                                };
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                        }
                                    ];
                                };
                            };
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "invalidated"
                                    ];
                                };
                            };
                            readonly reason: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "cancelled",
                                        "archived",
                                        "origin-terminal",
                                        "continuity-lost"
                                    ];
                                };
                            };
                            readonly terminalEvidenceRef: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    }
                ];
            };
        };
        readonly origin: {
            rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly kind: {
                        rule: {
                            readonly kind: 'literal';
                            readonly values: readonly [
                                "tool",
                                "agent-extension",
                                "admission",
                                "independent"
                            ];
                        };
                    };
                    readonly sessionRef: {
                        readonly rule: {
                            readonly kind: 'text';
                        };
                        readonly optional: true;
                    };
                    readonly runRef: {
                        readonly rule: {
                            readonly kind: 'text';
                        };
                        readonly optional: true;
                    };
                    readonly toolCallRef: {
                        readonly rule: {
                            readonly kind: 'text';
                        };
                        readonly optional: true;
                    };
                };
            };
        };
        readonly displayContext: {
            rule: {
                readonly kind: 'text';
            };
        };
    };
};
declare const cardPage: {
    readonly kind: 'object';
    readonly fields: {
        readonly items: {
            readonly rule: {
                readonly kind: "array";
                readonly item: {
                    readonly kind: 'object';
                    readonly fields: {
                        readonly card: {
                            rule: {
                                readonly kind: 'one-of';
                                readonly rules: readonly [
                                    {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly ref: {
                                                readonly rule: {
                                                    readonly kind: 'object';
                                                    readonly fields: {
                                                        readonly request: {
                                                            rule: {
                                                                readonly kind: 'object';
                                                                readonly fields: {
                                                                    readonly tenantRef: {
                                                                        rule: {
                                                                            readonly kind: 'text';
                                                                        };
                                                                    };
                                                                    readonly requestId: {
                                                                        rule: {
                                                                            readonly kind: 'text';
                                                                        };
                                                                    };
                                                                };
                                                            };
                                                        };
                                                        readonly cardId: {
                                                            rule: {
                                                                readonly kind: 'text';
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                            readonly revision: {
                                                readonly rule: {
                                                    readonly kind: 'revision';
                                                };
                                            };
                                            readonly question: {
                                                readonly rule: {
                                                    readonly kind: 'one-of';
                                                    readonly rules: readonly [
                                                        {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly cardId: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly title: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly declineConsequence: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly kind: {
                                                                    rule: {
                                                                        readonly kind: 'literal';
                                                                        readonly values: readonly [
                                                                            "question",
                                                                            "extension"
                                                                        ];
                                                                    };
                                                                };
                                                                readonly options: {
                                                                    readonly rule: {
                                                                        readonly kind: "array";
                                                                        readonly item: {
                                                                            readonly kind: 'object';
                                                                            readonly fields: {
                                                                                readonly id: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly label: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly description: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                            };
                                                                        };
                                                                    };
                                                                };
                                                            };
                                                        },
                                                        {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly cardId: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly title: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly declineConsequence: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly kind: {
                                                                    rule: {
                                                                        readonly kind: 'literal';
                                                                        readonly values: readonly [
                                                                            "approval",
                                                                            "admission"
                                                                        ];
                                                                    };
                                                                };
                                                                readonly options: {
                                                                    readonly rule: {
                                                                        readonly kind: "array";
                                                                        readonly item: {
                                                                            readonly kind: 'object';
                                                                            readonly fields: {
                                                                                readonly id: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly label: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly description: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly effectRef: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                    readonly optional: true;
                                                                                };
                                                                            };
                                                                        };
                                                                    };
                                                                };
                                                            };
                                                        }
                                                    ];
                                                };
                                            };
                                            readonly kind: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "pending"
                                                    ];
                                                };
                                            };
                                        };
                                    },
                                    {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly ref: {
                                                readonly rule: {
                                                    readonly kind: 'object';
                                                    readonly fields: {
                                                        readonly request: {
                                                            rule: {
                                                                readonly kind: 'object';
                                                                readonly fields: {
                                                                    readonly tenantRef: {
                                                                        rule: {
                                                                            readonly kind: 'text';
                                                                        };
                                                                    };
                                                                    readonly requestId: {
                                                                        rule: {
                                                                            readonly kind: 'text';
                                                                        };
                                                                    };
                                                                };
                                                            };
                                                        };
                                                        readonly cardId: {
                                                            rule: {
                                                                readonly kind: 'text';
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                            readonly revision: {
                                                readonly rule: {
                                                    readonly kind: 'revision';
                                                };
                                            };
                                            readonly question: {
                                                readonly rule: {
                                                    readonly kind: 'one-of';
                                                    readonly rules: readonly [
                                                        {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly cardId: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly title: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly declineConsequence: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly kind: {
                                                                    rule: {
                                                                        readonly kind: 'literal';
                                                                        readonly values: readonly [
                                                                            "question",
                                                                            "extension"
                                                                        ];
                                                                    };
                                                                };
                                                                readonly options: {
                                                                    readonly rule: {
                                                                        readonly kind: "array";
                                                                        readonly item: {
                                                                            readonly kind: 'object';
                                                                            readonly fields: {
                                                                                readonly id: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly label: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly description: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                            };
                                                                        };
                                                                    };
                                                                };
                                                            };
                                                        },
                                                        {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly cardId: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly title: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly declineConsequence: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly kind: {
                                                                    rule: {
                                                                        readonly kind: 'literal';
                                                                        readonly values: readonly [
                                                                            "approval",
                                                                            "admission"
                                                                        ];
                                                                    };
                                                                };
                                                                readonly options: {
                                                                    readonly rule: {
                                                                        readonly kind: "array";
                                                                        readonly item: {
                                                                            readonly kind: 'object';
                                                                            readonly fields: {
                                                                                readonly id: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly label: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly description: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly effectRef: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                    readonly optional: true;
                                                                                };
                                                                            };
                                                                        };
                                                                    };
                                                                };
                                                            };
                                                        }
                                                    ];
                                                };
                                            };
                                            readonly kind: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "decided"
                                                    ];
                                                };
                                            };
                                            readonly decision: {
                                                rule: {
                                                    readonly kind: 'object';
                                                    readonly fields: {
                                                        readonly ref: {
                                                            rule: {
                                                                readonly kind: 'object';
                                                                readonly fields: {
                                                                    readonly card: {
                                                                        rule: {
                                                                            readonly kind: 'object';
                                                                            readonly fields: {
                                                                                readonly request: {
                                                                                    rule: {
                                                                                        readonly kind: 'object';
                                                                                        readonly fields: {
                                                                                            readonly tenantRef: {
                                                                                                rule: {
                                                                                                    readonly kind: 'text';
                                                                                                };
                                                                                            };
                                                                                            readonly requestId: {
                                                                                                rule: {
                                                                                                    readonly kind: 'text';
                                                                                                };
                                                                                            };
                                                                                        };
                                                                                    };
                                                                                };
                                                                                readonly cardId: {
                                                                                    rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                            };
                                                                        };
                                                                    };
                                                                    readonly decisionId: {
                                                                        rule: {
                                                                            readonly kind: 'text';
                                                                        };
                                                                    };
                                                                    readonly submission: {
                                                                        rule: {
                                                                            readonly kind: 'object';
                                                                            readonly fields: {
                                                                                readonly tenantRef: {
                                                                                    rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly actorRef: {
                                                                                    rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly operationId: {
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
                                                        readonly reply: {
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
                                                                                        "selection"
                                                                                    ];
                                                                                };
                                                                            };
                                                                            readonly optionId: {
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
                                                                                        "text"
                                                                                    ];
                                                                                };
                                                                            };
                                                                            readonly text: {
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
                                                                                        "decline"
                                                                                    ];
                                                                                };
                                                                            };
                                                                        };
                                                                    }
                                                                ];
                                                            };
                                                        };
                                                        readonly basisRef: {
                                                            rule: {
                                                                readonly kind: 'text';
                                                            };
                                                        };
                                                        readonly commitReceipt: {
                                                            rule: {
                                                                readonly kind: 'text';
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                            readonly delivery: {
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
                                                                            "pending"
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
                                                                            "accepted",
                                                                            "superseded"
                                                                        ];
                                                                    };
                                                                };
                                                                readonly receiptRef: {
                                                                    rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                            };
                                                        }
                                                    ];
                                                };
                                            };
                                        };
                                    },
                                    {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly ref: {
                                                readonly rule: {
                                                    readonly kind: 'object';
                                                    readonly fields: {
                                                        readonly request: {
                                                            rule: {
                                                                readonly kind: 'object';
                                                                readonly fields: {
                                                                    readonly tenantRef: {
                                                                        rule: {
                                                                            readonly kind: 'text';
                                                                        };
                                                                    };
                                                                    readonly requestId: {
                                                                        rule: {
                                                                            readonly kind: 'text';
                                                                        };
                                                                    };
                                                                };
                                                            };
                                                        };
                                                        readonly cardId: {
                                                            rule: {
                                                                readonly kind: 'text';
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                            readonly revision: {
                                                readonly rule: {
                                                    readonly kind: 'revision';
                                                };
                                            };
                                            readonly question: {
                                                readonly rule: {
                                                    readonly kind: 'one-of';
                                                    readonly rules: readonly [
                                                        {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly cardId: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly title: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly declineConsequence: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly kind: {
                                                                    rule: {
                                                                        readonly kind: 'literal';
                                                                        readonly values: readonly [
                                                                            "question",
                                                                            "extension"
                                                                        ];
                                                                    };
                                                                };
                                                                readonly options: {
                                                                    readonly rule: {
                                                                        readonly kind: "array";
                                                                        readonly item: {
                                                                            readonly kind: 'object';
                                                                            readonly fields: {
                                                                                readonly id: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly label: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly description: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                            };
                                                                        };
                                                                    };
                                                                };
                                                            };
                                                        },
                                                        {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly cardId: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly title: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly description: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly declineConsequence: {
                                                                    readonly rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly kind: {
                                                                    rule: {
                                                                        readonly kind: 'literal';
                                                                        readonly values: readonly [
                                                                            "approval",
                                                                            "admission"
                                                                        ];
                                                                    };
                                                                };
                                                                readonly options: {
                                                                    readonly rule: {
                                                                        readonly kind: "array";
                                                                        readonly item: {
                                                                            readonly kind: 'object';
                                                                            readonly fields: {
                                                                                readonly id: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly label: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly description: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                };
                                                                                readonly effectRef: {
                                                                                    readonly rule: {
                                                                                        readonly kind: 'text';
                                                                                    };
                                                                                    readonly optional: true;
                                                                                };
                                                                            };
                                                                        };
                                                                    };
                                                                };
                                                            };
                                                        }
                                                    ];
                                                };
                                            };
                                            readonly kind: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "invalidated"
                                                    ];
                                                };
                                            };
                                            readonly reason: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "cancelled",
                                                        "archived",
                                                        "origin-terminal",
                                                        "continuity-lost"
                                                    ];
                                                };
                                            };
                                            readonly terminalEvidenceRef: {
                                                rule: {
                                                    readonly kind: 'text';
                                                };
                                            };
                                        };
                                    }
                                ];
                            };
                        };
                        readonly origin: {
                            rule: {
                                readonly kind: 'object';
                                readonly fields: {
                                    readonly kind: {
                                        rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "tool",
                                                "agent-extension",
                                                "admission",
                                                "independent"
                                            ];
                                        };
                                    };
                                    readonly sessionRef: {
                                        readonly rule: {
                                            readonly kind: 'text';
                                        };
                                        readonly optional: true;
                                    };
                                    readonly runRef: {
                                        readonly rule: {
                                            readonly kind: 'text';
                                        };
                                        readonly optional: true;
                                    };
                                    readonly toolCallRef: {
                                        readonly rule: {
                                            readonly kind: 'text';
                                        };
                                        readonly optional: true;
                                    };
                                };
                            };
                        };
                        readonly displayContext: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                    };
                };
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
        readonly snapshotRef: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly completeness: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "complete",
                    "partial"
                ];
            };
        };
    };
};
declare const replyResult: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "decided"
                        ];
                    };
                };
                readonly decisionRef: {
                    rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly card: {
                                rule: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly request: {
                                            rule: {
                                                readonly kind: 'object';
                                                readonly fields: {
                                                    readonly tenantRef: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                    readonly requestId: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                        readonly cardId: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                    };
                                };
                            };
                            readonly decisionId: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly submission: {
                                rule: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly tenantRef: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                        readonly actorRef: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                        readonly operationId: {
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
                readonly revision: {
                    rule: {
                        readonly kind: 'revision';
                    };
                };
                readonly delivery: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "pending",
                            "accepted"
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
                            "already-decided"
                        ];
                    };
                };
                readonly decision: {
                    rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly ref: {
                                rule: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly card: {
                                            rule: {
                                                readonly kind: 'object';
                                                readonly fields: {
                                                    readonly request: {
                                                        rule: {
                                                            readonly kind: 'object';
                                                            readonly fields: {
                                                                readonly tenantRef: {
                                                                    rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                                readonly requestId: {
                                                                    rule: {
                                                                        readonly kind: 'text';
                                                                    };
                                                                };
                                                            };
                                                        };
                                                    };
                                                    readonly cardId: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                        readonly decisionId: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                        readonly submission: {
                                            rule: {
                                                readonly kind: 'object';
                                                readonly fields: {
                                                    readonly tenantRef: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                    readonly actorRef: {
                                                        rule: {
                                                            readonly kind: 'text';
                                                        };
                                                    };
                                                    readonly operationId: {
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
                            readonly reply: {
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
                                                            "selection"
                                                        ];
                                                    };
                                                };
                                                readonly optionId: {
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
                                                            "text"
                                                        ];
                                                    };
                                                };
                                                readonly text: {
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
                                                            "decline"
                                                        ];
                                                    };
                                                };
                                            };
                                        }
                                    ];
                                };
                            };
                            readonly basisRef: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly commitReceipt: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
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
                            "invalidated"
                        ];
                    };
                };
                readonly reason: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
            };
        }
    ];
};
export declare const humanInterventionProtocol: {
    readonly operations: {
        readonly 'list-cards': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete" | "partial";
                    readonly items: readonly {
                        readonly card: {
                            readonly kind: "pending";
                            readonly question: {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "extension" | "question";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            } | {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "admission" | "approval";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly effectRef?: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            };
                            readonly ref: {
                                readonly cardId: string;
                                readonly request: {
                                    readonly requestId: string;
                                    readonly tenantRef: string;
                                };
                            };
                            readonly revision: string;
                        } | {
                            readonly decision: {
                                readonly basisRef: string;
                                readonly commitReceipt: string;
                                readonly ref: {
                                    readonly card: {
                                        readonly cardId: string;
                                        readonly request: {
                                            readonly requestId: string;
                                            readonly tenantRef: string;
                                        };
                                    };
                                    readonly decisionId: string;
                                    readonly submission: {
                                        readonly actorRef: string;
                                        readonly operationId: string;
                                        readonly tenantRef: string;
                                    };
                                };
                                readonly reply: {
                                    readonly kind: "selection";
                                    readonly optionId: string;
                                } | {
                                    readonly kind: "text";
                                    readonly text: string;
                                } | {
                                    readonly kind: "decline";
                                };
                            };
                            readonly delivery: {
                                readonly kind: "pending";
                            } | {
                                readonly kind: "accepted" | "superseded";
                                readonly receiptRef: string;
                            };
                            readonly kind: "decided";
                            readonly question: {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "extension" | "question";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            } | {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "admission" | "approval";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly effectRef?: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            };
                            readonly ref: {
                                readonly cardId: string;
                                readonly request: {
                                    readonly requestId: string;
                                    readonly tenantRef: string;
                                };
                            };
                            readonly revision: string;
                        } | {
                            readonly kind: "invalidated";
                            readonly question: {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "extension" | "question";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            } | {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "admission" | "approval";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly effectRef?: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            };
                            readonly reason: "archived" | "cancelled" | "continuity-lost" | "origin-terminal";
                            readonly ref: {
                                readonly cardId: string;
                                readonly request: {
                                    readonly requestId: string;
                                    readonly tenantRef: string;
                                };
                            };
                            readonly revision: string;
                            readonly terminalEvidenceRef: string;
                        };
                        readonly displayContext: string;
                        readonly origin: {
                            readonly kind: "admission" | "agent-extension" | "independent" | "tool";
                            readonly runRef?: string;
                            readonly sessionRef?: string;
                            readonly toolCallRef?: string;
                        };
                    }[];
                    readonly next: string | null;
                    readonly snapshotRef: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: number;
                    readonly resource: string;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly cursor: string | null;
                readonly filter: {
                    readonly delivery?: "accepted" | "pending" | "superseded";
                    readonly originKind?: "admission" | "agent-extension" | "independent" | "tool";
                    readonly sessionRef?: string;
                    readonly states: readonly ("decided" | "invalidated" | "pending")[];
                };
                readonly limit: number;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'read-card': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly item: {
                        readonly card: {
                            readonly kind: "pending";
                            readonly question: {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "extension" | "question";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            } | {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "admission" | "approval";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly effectRef?: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            };
                            readonly ref: {
                                readonly cardId: string;
                                readonly request: {
                                    readonly requestId: string;
                                    readonly tenantRef: string;
                                };
                            };
                            readonly revision: string;
                        } | {
                            readonly decision: {
                                readonly basisRef: string;
                                readonly commitReceipt: string;
                                readonly ref: {
                                    readonly card: {
                                        readonly cardId: string;
                                        readonly request: {
                                            readonly requestId: string;
                                            readonly tenantRef: string;
                                        };
                                    };
                                    readonly decisionId: string;
                                    readonly submission: {
                                        readonly actorRef: string;
                                        readonly operationId: string;
                                        readonly tenantRef: string;
                                    };
                                };
                                readonly reply: {
                                    readonly kind: "selection";
                                    readonly optionId: string;
                                } | {
                                    readonly kind: "text";
                                    readonly text: string;
                                } | {
                                    readonly kind: "decline";
                                };
                            };
                            readonly delivery: {
                                readonly kind: "pending";
                            } | {
                                readonly kind: "accepted" | "superseded";
                                readonly receiptRef: string;
                            };
                            readonly kind: "decided";
                            readonly question: {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "extension" | "question";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            } | {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "admission" | "approval";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly effectRef?: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            };
                            readonly ref: {
                                readonly cardId: string;
                                readonly request: {
                                    readonly requestId: string;
                                    readonly tenantRef: string;
                                };
                            };
                            readonly revision: string;
                        } | {
                            readonly kind: "invalidated";
                            readonly question: {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "extension" | "question";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            } | {
                                readonly cardId: string;
                                readonly declineConsequence: string;
                                readonly description: string;
                                readonly kind: "admission" | "approval";
                                readonly options: readonly {
                                    readonly description: string;
                                    readonly effectRef?: string;
                                    readonly id: string;
                                    readonly label: string;
                                }[];
                                readonly title: string;
                            };
                            readonly reason: "archived" | "cancelled" | "continuity-lost" | "origin-terminal";
                            readonly ref: {
                                readonly cardId: string;
                                readonly request: {
                                    readonly requestId: string;
                                    readonly tenantRef: string;
                                };
                            };
                            readonly revision: string;
                            readonly terminalEvidenceRef: string;
                        };
                        readonly displayContext: string;
                        readonly origin: {
                            readonly kind: "admission" | "agent-extension" | "independent" | "tool";
                            readonly runRef?: string;
                            readonly sessionRef?: string;
                            readonly toolCallRef?: string;
                        };
                    };
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: number;
                    readonly resource: string;
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly card: {
                    readonly cardId: string;
                    readonly request: {
                        readonly requestId: string;
                        readonly tenantRef: string;
                    };
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'submit-reply': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly decisionRef: {
                        readonly card: {
                            readonly cardId: string;
                            readonly request: {
                                readonly requestId: string;
                                readonly tenantRef: string;
                            };
                        };
                        readonly decisionId: string;
                        readonly submission: {
                            readonly actorRef: string;
                            readonly operationId: string;
                            readonly tenantRef: string;
                        };
                    };
                    readonly delivery: "accepted" | "pending";
                    readonly kind: "decided";
                    readonly revision: string;
                } | {
                    readonly decision: {
                        readonly basisRef: string;
                        readonly commitReceipt: string;
                        readonly ref: {
                            readonly card: {
                                readonly cardId: string;
                                readonly request: {
                                    readonly requestId: string;
                                    readonly tenantRef: string;
                                };
                            };
                            readonly decisionId: string;
                            readonly submission: {
                                readonly actorRef: string;
                                readonly operationId: string;
                                readonly tenantRef: string;
                            };
                        };
                        readonly reply: {
                            readonly kind: "selection";
                            readonly optionId: string;
                        } | {
                            readonly kind: "text";
                            readonly text: string;
                        } | {
                            readonly kind: "decline";
                        };
                    };
                    readonly kind: "already-decided";
                } | {
                    readonly kind: "invalidated";
                    readonly reason: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: number;
                    readonly resource: string;
                }>;
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
                readonly card: {
                    readonly cardId: string;
                    readonly request: {
                        readonly requestId: string;
                        readonly tenantRef: string;
                    };
                };
                readonly expectedRevision: string;
                readonly reply: {
                    readonly kind: "selection";
                    readonly optionId: string;
                } | {
                    readonly kind: "text";
                    readonly text: string;
                } | {
                    readonly kind: "decline";
                };
                readonly replyId: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'query-submit-reply': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly decisionRef: {
                        readonly card: {
                            readonly cardId: string;
                            readonly request: {
                                readonly requestId: string;
                                readonly tenantRef: string;
                            };
                        };
                        readonly decisionId: string;
                        readonly submission: {
                            readonly actorRef: string;
                            readonly operationId: string;
                            readonly tenantRef: string;
                        };
                    };
                    readonly delivery: "accepted" | "pending";
                    readonly kind: "decided";
                    readonly revision: string;
                } | {
                    readonly decision: {
                        readonly basisRef: string;
                        readonly commitReceipt: string;
                        readonly ref: {
                            readonly card: {
                                readonly cardId: string;
                                readonly request: {
                                    readonly requestId: string;
                                    readonly tenantRef: string;
                                };
                            };
                            readonly decisionId: string;
                            readonly submission: {
                                readonly actorRef: string;
                                readonly operationId: string;
                                readonly tenantRef: string;
                            };
                        };
                        readonly reply: {
                            readonly kind: "selection";
                            readonly optionId: string;
                        } | {
                            readonly kind: "text";
                            readonly text: string;
                        } | {
                            readonly kind: "decline";
                        };
                    };
                    readonly kind: "already-decided";
                } | {
                    readonly kind: "invalidated";
                    readonly reason: string;
                }>;
                readonly 'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: number;
                    readonly resource: string;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly unknown: true;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly card: {
                    readonly cardId: string;
                    readonly request: {
                        readonly requestId: string;
                        readonly tenantRef: string;
                    };
                };
                readonly expectedRevision: string;
                readonly reply: {
                    readonly kind: "selection";
                    readonly optionId: string;
                } | {
                    readonly kind: "text";
                    readonly text: string;
                } | {
                    readonly kind: "decline";
                };
                readonly replyId: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "human-intervention";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-cards': {
            readonly identity: "login";
            readonly open: import("@omne-harness/public-contract").Codec<{
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
export type HumanInterventionProtocol = typeof humanInterventionProtocol;
export type HumanInterventionCardPage = RuleValue<typeof cardPage>;
export type HumanInterventionCardItem = RuleValue<typeof item>;
export type HumanInterventionReplyResult = RuleValue<typeof replyResult>;
export {};
```

## 声明文件 `index.d.ts`

```ts
export { humanInterventionProtocol, type HumanInterventionCardItem, type HumanInterventionCardPage, type HumanInterventionProtocol, type HumanInterventionReplyResult, } from './human-intervention-protocol.ts';
```
