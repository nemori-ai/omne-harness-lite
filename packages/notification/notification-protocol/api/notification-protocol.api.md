# @omne-harness/notification-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `NotificationChannelBody` · `notification-protocol.d.ts`
- `NotificationDestinationBody` · `notification-protocol.d.ts`
- `NotificationProtocol` · `notification-protocol.d.ts`
- `NotificationSourceBody` · `notification-protocol.d.ts`
- `NotificationSubscriptionBody` · `notification-protocol.d.ts`
- `NotificationSummaryBody` · `notification-protocol.d.ts`
- `NotificationViewBody` · `notification-protocol.d.ts`
- `notificationProtocol` · `notification-protocol.d.ts`

## 声明文件 `index.d.ts`

```ts
export { notificationProtocol, type NotificationDestinationBody, type NotificationProtocol, type NotificationChannelBody, type NotificationSourceBody, type NotificationSubscriptionBody, type NotificationSummaryBody, type NotificationViewBody, } from './notification-protocol.ts';
```

## 声明文件 `notification-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const summary: {
    readonly kind: 'object';
    readonly fields: {
        readonly source: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly event: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly recipient: {
            readonly rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "person"
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
                                        "agent"
                                    ];
                                };
                            };
                            readonly ref: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    }
                ];
            };
        };
        readonly sequence: {
            readonly rule: {
                readonly kind: 'positive-integer';
            };
        };
        readonly type: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly title: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly level: {
            readonly rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "weak",
                    "strong"
                ];
            };
        };
        readonly cause: {
            readonly rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "named"
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
                                        "subscription"
                                    ];
                                };
                            };
                            readonly scope: {
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
                                                            "all"
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
                                                            "subject"
                                                        ];
                                                    };
                                                };
                                                readonly equals: {
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
                                                            "subject-prefix"
                                                        ];
                                                    };
                                                };
                                                readonly prefix: {
                                                    rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                            };
                                        }
                                    ];
                                };
                            };
                            readonly note: {
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
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "type-default"
                                    ];
                                };
                            };
                        };
                    }
                ];
            };
        };
        readonly acceptedAt: {
            readonly rule: {
                readonly kind: 'instant';
            };
        };
        readonly marks: {
            readonly rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly seenAt: {
                        rule: {
                            readonly kind: 'one-of';
                            readonly rules: readonly [
                                {
                                    readonly kind: 'instant';
                                },
                                {
                                    readonly kind: 'null';
                                }
                            ];
                        };
                    };
                    readonly resolved: {
                        rule: {
                            readonly kind: 'one-of';
                            readonly rules: readonly [
                                {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly how: {
                                            rule: {
                                                readonly kind: 'literal';
                                                readonly values: readonly [
                                                    "done",
                                                    "dismissed"
                                                ];
                                            };
                                        };
                                        readonly at: {
                                            rule: {
                                                readonly kind: 'instant';
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
                    readonly supersededBy: {
                        rule: {
                            readonly kind: 'one-of';
                            readonly rules: readonly [
                                {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly source: {
                                            readonly rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                        readonly event: {
                                            readonly rule: {
                                                readonly kind: 'text';
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
            };
        };
    };
};
declare const view: {
    readonly kind: 'object';
    readonly fields: {
        readonly source: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly event: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly recipient: {
            readonly rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "person"
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
                                        "agent"
                                    ];
                                };
                            };
                            readonly ref: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    }
                ];
            };
        };
        readonly sequence: {
            readonly rule: {
                readonly kind: 'positive-integer';
            };
        };
        readonly type: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly title: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly level: {
            readonly rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "weak",
                    "strong"
                ];
            };
        };
        readonly cause: {
            readonly rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "named"
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
                                        "subscription"
                                    ];
                                };
                            };
                            readonly scope: {
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
                                                            "all"
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
                                                            "subject"
                                                        ];
                                                    };
                                                };
                                                readonly equals: {
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
                                                            "subject-prefix"
                                                        ];
                                                    };
                                                };
                                                readonly prefix: {
                                                    rule: {
                                                        readonly kind: 'text';
                                                    };
                                                };
                                            };
                                        }
                                    ];
                                };
                            };
                            readonly note: {
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
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "type-default"
                                    ];
                                };
                            };
                        };
                    }
                ];
            };
        };
        readonly acceptedAt: {
            readonly rule: {
                readonly kind: 'instant';
            };
        };
        readonly marks: {
            readonly rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly seenAt: {
                        rule: {
                            readonly kind: 'one-of';
                            readonly rules: readonly [
                                {
                                    readonly kind: 'instant';
                                },
                                {
                                    readonly kind: 'null';
                                }
                            ];
                        };
                    };
                    readonly resolved: {
                        rule: {
                            readonly kind: 'one-of';
                            readonly rules: readonly [
                                {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly how: {
                                            rule: {
                                                readonly kind: 'literal';
                                                readonly values: readonly [
                                                    "done",
                                                    "dismissed"
                                                ];
                                            };
                                        };
                                        readonly at: {
                                            rule: {
                                                readonly kind: 'instant';
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
                    readonly supersededBy: {
                        rule: {
                            readonly kind: 'one-of';
                            readonly rules: readonly [
                                {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly source: {
                                            readonly rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                        readonly event: {
                                            readonly rule: {
                                                readonly kind: 'text';
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
            };
        };
        readonly subject: {
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
        readonly at: {
            rule: {
                readonly kind: 'instant';
            };
        };
        readonly body: {
            rule: {
                readonly kind: 'string';
            };
        };
        readonly locator: {
            rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly ref: {
                                rule: {
                                    readonly kind: 'text';
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
};
declare const subscription: {
    readonly kind: 'object';
    readonly fields: {
        readonly recipient: {
            readonly rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "person"
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
                                        "agent"
                                    ];
                                };
                            };
                            readonly ref: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    }
                ];
            };
        };
        readonly source: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly type: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly scope: {
            readonly rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "all"
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
                                        "subject"
                                    ];
                                };
                            };
                            readonly equals: {
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
                                        "subject-prefix"
                                    ];
                                };
                            };
                            readonly prefix: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    }
                ];
            };
        };
        readonly level: {
            readonly rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "off",
                    "weak",
                    "strong"
                ];
            };
        };
        readonly note: {
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
        };
        readonly term: {
            readonly rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly kind: {
                                rule: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "standing"
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
                                        "once"
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
                                        "until"
                                    ];
                                };
                            };
                            readonly at: {
                                rule: {
                                    readonly kind: 'instant';
                                };
                            };
                        };
                    }
                ];
            };
        };
        readonly creator: {
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
                                        "human"
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
                                        "agent"
                                    ];
                                };
                            };
                            readonly session: {
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
                                        "system"
                                    ];
                                };
                            };
                        };
                    }
                ];
            };
        };
        readonly expired: {
            rule: {
                readonly kind: 'boolean';
            };
        };
    };
};
declare const destination: {
    readonly kind: 'object';
    readonly fields: {
        readonly recipient: {
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
                                        "person"
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
                                        "agent"
                                    ];
                                };
                            };
                            readonly ref: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    }
                ];
            };
        };
        readonly id: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly channel: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly address: {
            rule: {
                readonly kind: 'string';
            };
        };
        readonly minLevel: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "strong",
                    "weak"
                ];
            };
        };
        readonly builtin: {
            rule: {
                readonly kind: 'boolean';
            };
        };
        readonly blockedSince: {
            rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'instant';
                    },
                    {
                        readonly kind: 'null';
                    }
                ];
            };
        };
        readonly state: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "enabled",
                    "disabled",
                    "channel-absent"
                ];
            };
        };
    };
};
declare const source: {
    readonly kind: 'object';
    readonly fields: {
        readonly name: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly label: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly types: {
            rule: {
                readonly kind: 'array';
                readonly item: {
                    readonly kind: 'object';
                    readonly fields: {
                        readonly name: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly label: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly description: {
                            rule: {
                                readonly kind: 'string';
                            };
                        };
                        readonly kind: {
                            rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "event",
                                    "standing"
                                ];
                            };
                        };
                        readonly subject: {
                            rule: {
                                readonly kind: 'object';
                                readonly fields: {
                                    readonly presence: {
                                        rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "none",
                                                "optional",
                                                "required"
                                            ];
                                        };
                                    };
                                    readonly hint: {
                                        rule: {
                                            readonly kind: 'string';
                                        };
                                    };
                                };
                            };
                        };
                        readonly subscribable: {
                            rule: {
                                readonly kind: 'array';
                                readonly item: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "person",
                                        "agent"
                                    ];
                                };
                            };
                        };
                        readonly nameable: {
                            rule: {
                                readonly kind: 'array';
                                readonly item: {
                                    readonly kind: 'literal';
                                    readonly values: readonly [
                                        "person",
                                        "agent"
                                    ];
                                };
                            };
                        };
                        readonly defaults: {
                            rule: {
                                readonly kind: 'object';
                                readonly fields: {
                                    readonly person: {
                                        rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "off",
                                                "weak",
                                                "strong"
                                            ];
                                        };
                                    };
                                    readonly agent: {
                                        rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "off",
                                                "weak",
                                                "strong"
                                            ];
                                        };
                                    };
                                };
                            };
                        };
                        readonly external: {
                            rule: {
                                readonly kind: 'boolean';
                            };
                        };
                    };
                };
            };
        };
    };
};
declare const channel: {
    readonly kind: 'object';
    readonly fields: {
        readonly name: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly label: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly leavesSystem: {
            rule: {
                readonly kind: 'boolean';
            };
        };
        readonly addressHint: {
            rule: {
                readonly kind: 'string';
            };
        };
    };
};
export declare const notificationProtocol: {
    readonly operations: {
        readonly send: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly recipients: readonly ({
                        readonly kind: "person";
                    } | {
                        readonly kind: "agent";
                        readonly ref: string;
                    })[];
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly recipients: readonly ({
                        readonly kind: "person";
                    } | {
                        readonly kind: "agent";
                        readonly ref: string;
                    })[];
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "invalid-subject" | "naming-not-allowed" | "recipient-not-admissible" | "request" | "standing-type" | "too-large" | "unknown-event-type";
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "different-content";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly countsAsAccess: true;
            readonly limit: "input";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly body: string;
                readonly event: string;
                readonly locator: {
                    readonly kind: string;
                    readonly ref: string;
                } | null;
                readonly named: readonly ({
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                })[];
                readonly renotify: boolean;
                readonly replaceKey: string | null;
                readonly source: string;
                readonly subject: string | null;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly title: string;
                readonly type: string;
            }>;
        };
        readonly 'list-inbox': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly entries: readonly {
                        readonly acceptedAt: import("@omne-harness/utc-instant").Instant;
                        readonly cause: {
                            readonly kind: "named";
                        } | {
                            readonly kind: "subscription";
                            readonly note: string | null;
                            readonly scope: {
                                readonly kind: "all";
                            } | {
                                readonly equals: string;
                                readonly kind: "subject";
                            } | {
                                readonly kind: "subject-prefix";
                                readonly prefix: string;
                            };
                        } | {
                            readonly kind: "type-default";
                        };
                        readonly event: string;
                        readonly level: "strong" | "weak";
                        readonly marks: {
                            readonly resolved: {
                                readonly at: import("@omne-harness/utc-instant").Instant;
                                readonly how: "dismissed" | "done";
                            } | null;
                            readonly seenAt: import("@omne-harness/utc-instant").Instant | null;
                            readonly supersededBy: {
                                readonly event: string;
                                readonly source: string;
                            } | null;
                        };
                        readonly recipient: {
                            readonly kind: "person";
                        } | {
                            readonly kind: "agent";
                            readonly ref: string;
                        };
                        readonly sequence: number;
                        readonly source: string;
                        readonly title: string;
                        readonly type: string;
                    }[];
                    readonly next: number | null;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "request";
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
                readonly after: number | null;
                readonly filter: "all" | "unresolved";
                readonly limit: number;
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'read-notification': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly acceptedAt: import("@omne-harness/utc-instant").Instant;
                    readonly at: import("@omne-harness/utc-instant").Instant;
                    readonly body: string;
                    readonly cause: {
                        readonly kind: "named";
                    } | {
                        readonly kind: "subscription";
                        readonly note: string | null;
                        readonly scope: {
                            readonly kind: "all";
                        } | {
                            readonly equals: string;
                            readonly kind: "subject";
                        } | {
                            readonly kind: "subject-prefix";
                            readonly prefix: string;
                        };
                    } | {
                        readonly kind: "type-default";
                    };
                    readonly event: string;
                    readonly level: "strong" | "weak";
                    readonly locator: {
                        readonly kind: string;
                        readonly ref: string;
                    } | null;
                    readonly marks: {
                        readonly resolved: {
                            readonly at: import("@omne-harness/utc-instant").Instant;
                            readonly how: "dismissed" | "done";
                        } | null;
                        readonly seenAt: import("@omne-harness/utc-instant").Instant | null;
                        readonly supersededBy: {
                            readonly event: string;
                            readonly source: string;
                        } | null;
                    };
                    readonly recipient: {
                        readonly kind: "person";
                    } | {
                        readonly kind: "agent";
                        readonly ref: string;
                    };
                    readonly sequence: number;
                    readonly source: string;
                    readonly subject: string | null;
                    readonly title: string;
                    readonly type: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "request";
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
                readonly event: string;
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly source: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly mark: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly resolved: {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly how: "dismissed" | "done";
                    } | null;
                    readonly seenAt: import("@omne-harness/utc-instant").Instant | null;
                    readonly supersededBy: {
                        readonly event: string;
                        readonly source: string;
                    } | null;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly resolved: {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly how: "dismissed" | "done";
                    } | null;
                    readonly seenAt: import("@omne-harness/utc-instant").Instant | null;
                    readonly supersededBy: {
                        readonly event: string;
                        readonly source: string;
                    } | null;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "request";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "restore-first" | "superseded";
                }>;
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
                readonly event: string;
                readonly operation: "dismiss" | "done" | "restore" | "seen";
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly source: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'query-send': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly kind: "accepted";
                    readonly notifications: readonly {
                        readonly marks: {
                            readonly resolved: {
                                readonly at: import("@omne-harness/utc-instant").Instant;
                                readonly how: "dismissed" | "done";
                            } | null;
                            readonly seenAt: import("@omne-harness/utc-instant").Instant | null;
                            readonly supersededBy: {
                                readonly event: string;
                                readonly source: string;
                            } | null;
                        };
                        readonly recipient: {
                            readonly kind: "person";
                        } | {
                            readonly kind: "agent";
                            readonly ref: string;
                        };
                    }[];
                } | {
                    readonly kind: "not-submitted";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "request";
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
                readonly event: string;
                readonly source: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'list-subscriptions': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly subscriptions: readonly {
                        readonly creator: {
                            readonly kind: "human";
                        } | {
                            readonly kind: "agent";
                            readonly session: string;
                        } | {
                            readonly kind: "system";
                        };
                        readonly expired: boolean;
                        readonly level: "off" | "strong" | "weak";
                        readonly note: string | null;
                        readonly recipient: {
                            readonly kind: "person";
                        } | {
                            readonly kind: "agent";
                            readonly ref: string;
                        };
                        readonly scope: {
                            readonly kind: "all";
                        } | {
                            readonly equals: string;
                            readonly kind: "subject";
                        } | {
                            readonly kind: "subject-prefix";
                            readonly prefix: string;
                        };
                        readonly source: string;
                        readonly term: {
                            readonly kind: "standing";
                        } | {
                            readonly kind: "once";
                        } | {
                            readonly at: import("@omne-harness/utc-instant").Instant;
                            readonly kind: "until";
                        };
                        readonly type: string;
                    }[];
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "request";
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
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'set-subscription': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly creator: {
                        readonly kind: "human";
                    } | {
                        readonly kind: "agent";
                        readonly session: string;
                    } | {
                        readonly kind: "system";
                    };
                    readonly expired: boolean;
                    readonly level: "off" | "strong" | "weak";
                    readonly note: string | null;
                    readonly recipient: {
                        readonly kind: "person";
                    } | {
                        readonly kind: "agent";
                        readonly ref: string;
                    };
                    readonly scope: {
                        readonly kind: "all";
                    } | {
                        readonly equals: string;
                        readonly kind: "subject";
                    } | {
                        readonly kind: "subject-prefix";
                        readonly prefix: string;
                    };
                    readonly source: string;
                    readonly term: {
                        readonly kind: "standing";
                    } | {
                        readonly kind: "once";
                    } | {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly kind: "until";
                    };
                    readonly type: string;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly creator: {
                        readonly kind: "human";
                    } | {
                        readonly kind: "agent";
                        readonly session: string;
                    } | {
                        readonly kind: "system";
                    };
                    readonly expired: boolean;
                    readonly level: "off" | "strong" | "weak";
                    readonly note: string | null;
                    readonly recipient: {
                        readonly kind: "person";
                    } | {
                        readonly kind: "agent";
                        readonly ref: string;
                    };
                    readonly scope: {
                        readonly kind: "all";
                    } | {
                        readonly equals: string;
                        readonly kind: "subject";
                    } | {
                        readonly kind: "subject-prefix";
                        readonly prefix: string;
                    };
                    readonly source: string;
                    readonly term: {
                        readonly kind: "standing";
                    } | {
                        readonly kind: "once";
                    } | {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly kind: "until";
                    };
                    readonly type: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "not-subscribable" | "request" | "scope-does-not-fit" | "term-in-past";
                }>;
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
                readonly level: "off" | "strong" | "weak";
                readonly note: string | null;
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly scope: {
                    readonly kind: "all";
                } | {
                    readonly equals: string;
                    readonly kind: "subject";
                } | {
                    readonly kind: "subject-prefix";
                    readonly prefix: string;
                };
                readonly source: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly term: {
                    readonly kind: "standing";
                } | {
                    readonly kind: "once";
                } | {
                    readonly at: import("@omne-harness/utc-instant").Instant;
                    readonly kind: "until";
                };
                readonly type: string;
            }>;
        };
        readonly 'remove-subscription': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "request";
                }>;
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
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly scope: {
                    readonly kind: "all";
                } | {
                    readonly equals: string;
                    readonly kind: "subject";
                } | {
                    readonly kind: "subject-prefix";
                    readonly prefix: string;
                };
                readonly source: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly type: string;
            }>;
        };
        readonly 'read-beat': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly kind: "default";
                } | {
                    readonly kind: "off";
                } | {
                    readonly kind: "every";
                    readonly minutes: number;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "request";
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
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'set-beat': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly kind: "default";
                } | {
                    readonly kind: "off";
                } | {
                    readonly kind: "every";
                    readonly minutes: number;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly kind: "default";
                } | {
                    readonly kind: "off";
                } | {
                    readonly kind: "every";
                    readonly minutes: number;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "out-of-range" | "request";
                }>;
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
                readonly beat: {
                    readonly kind: "default";
                } | {
                    readonly kind: "off";
                } | {
                    readonly kind: "every";
                    readonly minutes: number;
                };
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'list-destinations': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly destinations: readonly {
                        readonly address: string;
                        readonly blockedSince: import("@omne-harness/utc-instant").Instant | null;
                        readonly builtin: boolean;
                        readonly channel: string;
                        readonly id: string;
                        readonly minLevel: "strong" | "weak";
                        readonly recipient: {
                            readonly kind: "person";
                        } | {
                            readonly kind: "agent";
                            readonly ref: string;
                        };
                        readonly state: "channel-absent" | "disabled" | "enabled";
                    }[];
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "request";
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
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'add-destination': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly address: string;
                    readonly blockedSince: import("@omne-harness/utc-instant").Instant | null;
                    readonly builtin: boolean;
                    readonly channel: string;
                    readonly id: string;
                    readonly minLevel: "strong" | "weak";
                    readonly recipient: {
                        readonly kind: "person";
                    } | {
                        readonly kind: "agent";
                        readonly ref: string;
                    };
                    readonly state: "channel-absent" | "disabled" | "enabled";
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly address: string;
                    readonly blockedSince: import("@omne-harness/utc-instant").Instant | null;
                    readonly builtin: boolean;
                    readonly channel: string;
                    readonly id: string;
                    readonly minLevel: "strong" | "weak";
                    readonly recipient: {
                        readonly kind: "person";
                    } | {
                        readonly kind: "agent";
                        readonly ref: string;
                    };
                    readonly state: "channel-absent" | "disabled" | "enabled";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "address" | "request";
                }>;
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
                readonly channel: string;
                readonly minLevel: "strong" | "weak";
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'change-destination': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly address: string;
                    readonly blockedSince: import("@omne-harness/utc-instant").Instant | null;
                    readonly builtin: boolean;
                    readonly channel: string;
                    readonly id: string;
                    readonly minLevel: "strong" | "weak";
                    readonly recipient: {
                        readonly kind: "person";
                    } | {
                        readonly kind: "agent";
                        readonly ref: string;
                    };
                    readonly state: "channel-absent" | "disabled" | "enabled";
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly address: string;
                    readonly blockedSince: import("@omne-harness/utc-instant").Instant | null;
                    readonly builtin: boolean;
                    readonly channel: string;
                    readonly id: string;
                    readonly minLevel: "strong" | "weak";
                    readonly recipient: {
                        readonly kind: "person";
                    } | {
                        readonly kind: "agent";
                        readonly ref: string;
                    };
                    readonly state: "channel-absent" | "disabled" | "enabled";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "request";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
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
                readonly enabled?: boolean;
                readonly id: string;
                readonly minLevel?: "strong" | "weak";
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'remove-destination': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "request";
                }>;
                readonly 'not-writable': import("@omne-harness/public-contract").Codec<{}>;
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
                readonly id: string;
                readonly recipient: {
                    readonly kind: "person";
                } | {
                    readonly kind: "agent";
                    readonly ref: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'list-sources': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly sources: readonly {
                        readonly label: string;
                        readonly name: string;
                        readonly types: readonly {
                            readonly defaults: {
                                readonly agent: "off" | "strong" | "weak";
                                readonly person: "off" | "strong" | "weak";
                            };
                            readonly description: string;
                            readonly external: boolean;
                            readonly kind: "event" | "standing";
                            readonly label: string;
                            readonly name: string;
                            readonly nameable: readonly ("agent" | "person")[];
                            readonly subject: {
                                readonly hint: string;
                                readonly presence: "none" | "optional" | "required";
                            };
                            readonly subscribable: readonly ("agent" | "person")[];
                        }[];
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
        readonly 'list-channels': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly channels: readonly {
                        readonly addressHint: string;
                        readonly label: string;
                        readonly leavesSystem: boolean;
                        readonly name: string;
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
    };
    readonly name: "notification";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-changes': {
            readonly identity: "login";
            readonly open: import("@omne-harness/public-contract").Codec<{
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly frame: import("@omne-harness/public-contract").Codec<{
                readonly about: "catalog" | "inbox";
                readonly kind: "changed";
            }>;
            readonly ends: readonly [
            ];
        };
    };
};
export type NotificationProtocol = typeof notificationProtocol;
export type NotificationSummaryBody = RuleValue<typeof summary>;
export type NotificationViewBody = RuleValue<typeof view>;
export type NotificationSubscriptionBody = RuleValue<typeof subscription>;
export type NotificationDestinationBody = RuleValue<typeof destination>;
export type NotificationSourceBody = RuleValue<typeof source>;
export type NotificationChannelBody = RuleValue<typeof channel>;
export {};
```
