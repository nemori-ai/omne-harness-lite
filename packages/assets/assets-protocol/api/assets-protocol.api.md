# @omne-harness/assets-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AssetsProtocol` · `assets-protocol.d.ts`
- `SettingInput` · `assets-protocol.d.ts`
- `SettingView` · `assets-protocol.d.ts`
- `assetsProtocol` · `assets-protocol.d.ts`

## 声明文件 `assets-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const settingView: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly asset: {
                    readonly rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly category: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly name: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    };
                };
                readonly item: {
                    readonly rule: {
                        readonly kind: 'text';
                    };
                };
                readonly revision: {
                    readonly rule: {
                        readonly kind: 'revision';
                    };
                };
                readonly declaration: {
                    readonly rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly title: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly purpose: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly appliesAt: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly clearEffect: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                        };
                    };
                };
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "ordinary"
                        ];
                    };
                };
                readonly valueSchema: {
                    rule: {
                        readonly kind: 'json';
                    };
                };
                readonly default: {
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
                                                "unset"
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
                                                "set"
                                            ];
                                        };
                                    };
                                    readonly value: {
                                        rule: {
                                            readonly kind: 'json';
                                        };
                                    };
                                };
                            }
                        ];
                    };
                };
                readonly own: {
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
                                                "unset"
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
                                                "set"
                                            ];
                                        };
                                    };
                                    readonly value: {
                                        rule: {
                                            readonly kind: 'json';
                                        };
                                    };
                                };
                            }
                        ];
                    };
                };
                readonly effective: {
                    rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly value: {
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
                                                            "unset"
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
                                                            "set"
                                                        ];
                                                    };
                                                };
                                                readonly value: {
                                                    rule: {
                                                        readonly kind: 'json';
                                                    };
                                                };
                                            };
                                        }
                                    ];
                                };
                            };
                            readonly source: {
                                rule: {
                                    readonly kind: 'one-of';
                                    readonly rules: readonly [
                                        {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "default",
                                                "organization",
                                                "tenant"
                                            ];
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
                readonly lockedBy: {
                    rule: {
                        readonly kind: 'one-of';
                        readonly rules: readonly [
                            {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "organization"
                                ];
                            },
                            {
                                readonly kind: 'null';
                            }
                        ];
                    };
                };
                readonly editable: {
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
                                                "yes"
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
                                                "no"
                                            ];
                                        };
                                    };
                                    readonly reason: {
                                        rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "locked",
                                                "not-a-source",
                                                "prohibited-above"
                                            ];
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
                readonly asset: {
                    readonly rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly category: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly name: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    };
                };
                readonly item: {
                    readonly rule: {
                        readonly kind: 'text';
                    };
                };
                readonly revision: {
                    readonly rule: {
                        readonly kind: 'revision';
                    };
                };
                readonly declaration: {
                    readonly rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly title: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly purpose: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly appliesAt: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly clearEffect: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                        };
                    };
                };
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "permission"
                        ];
                    };
                };
                readonly choices: {
                    readonly rule: {
                        readonly kind: "array";
                        readonly item: {
                            readonly kind: 'object';
                            readonly fields: {
                                readonly value: {
                                    rule: {
                                        readonly kind: 'text';
                                    };
                                };
                                readonly label: {
                                    rule: {
                                        readonly kind: 'string';
                                    };
                                };
                                readonly description: {
                                    rule: {
                                        readonly kind: 'string';
                                    };
                                };
                                readonly permitsOperation: {
                                    rule: {
                                        readonly kind: 'boolean';
                                    };
                                };
                            };
                        };
                    };
                };
                readonly default: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
                readonly own: {
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
                readonly effective: {
                    readonly rule: {
                        readonly kind: "one-of";
                        readonly rules: readonly [
                            {
                                readonly kind: 'object';
                                readonly fields: {
                                    readonly kind: {
                                        rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "value"
                                            ];
                                        };
                                    };
                                    readonly value: {
                                        rule: {
                                            readonly kind: 'text';
                                        };
                                    };
                                    readonly source: {
                                        rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "default",
                                                "organization",
                                                "tenant"
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
                                                "prohibited"
                                            ];
                                        };
                                    };
                                    readonly by: {
                                        rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "organization",
                                                "tenant"
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
                                                "empty-bound"
                                            ];
                                        };
                                    };
                                };
                            }
                        ];
                    };
                };
                readonly bound: {
                    rule: {
                        readonly kind: 'one-of';
                        readonly rules: readonly [
                            {
                                readonly kind: "array";
                                readonly item: {
                                    readonly kind: 'text';
                                };
                            },
                            {
                                readonly kind: 'null';
                            }
                        ];
                    };
                };
                readonly editable: {
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
                                                "yes"
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
                                                "no"
                                            ];
                                        };
                                    };
                                    readonly reason: {
                                        rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "locked",
                                                "not-a-source",
                                                "prohibited-above"
                                            ];
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
                readonly asset: {
                    readonly rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly category: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                            readonly name: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    };
                };
                readonly item: {
                    readonly rule: {
                        readonly kind: 'text';
                    };
                };
                readonly revision: {
                    readonly rule: {
                        readonly kind: 'revision';
                    };
                };
                readonly declaration: {
                    readonly rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly title: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly purpose: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly appliesAt: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly clearEffect: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                        };
                    };
                };
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "secret"
                        ];
                    };
                };
                readonly own: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "unset",
                            "available",
                            "revoked",
                            "unreadable"
                        ];
                    };
                };
                readonly official: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "unset",
                            "available",
                            "revoked",
                            "unreadable"
                        ];
                    };
                };
                readonly editable: {
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
                                                "yes"
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
                                                "no"
                                            ];
                                        };
                                    };
                                    readonly reason: {
                                        rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "locked",
                                                "not-a-source",
                                                "prohibited-above"
                                            ];
                                        };
                                    };
                                };
                            }
                        ];
                    };
                };
            };
        }
    ];
};
declare const settingInput: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "ordinary"
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
                            "permission"
                        ];
                    };
                };
                readonly pick: {
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
                            "secret"
                        ];
                    };
                };
                readonly secret: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
            };
        }
    ];
};
export type SettingView = RuleValue<typeof settingView>;
export type SettingInput = RuleValue<typeof settingInput>;
export declare const assetsProtocol: {
    readonly operations: {
        readonly 'list-settings': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete" | "partial";
                    readonly items: readonly ({
                        readonly asset: {
                            readonly category: string;
                            readonly name: string;
                        };
                        readonly declaration: {
                            readonly appliesAt: string;
                            readonly clearEffect: string;
                            readonly purpose: string;
                            readonly title: string;
                        };
                        readonly default: {
                            readonly kind: "unset";
                        } | {
                            readonly kind: "set";
                            readonly value: import("@omne-harness/json-text").JsonValue;
                        };
                        readonly editable: {
                            readonly kind: "yes";
                        } | {
                            readonly kind: "no";
                            readonly reason: "locked" | "not-a-source" | "prohibited-above";
                        };
                        readonly effective: {
                            readonly source: "default" | "organization" | "tenant" | null;
                            readonly value: {
                                readonly kind: "unset";
                            } | {
                                readonly kind: "set";
                                readonly value: import("@omne-harness/json-text").JsonValue;
                            };
                        };
                        readonly item: string;
                        readonly kind: "ordinary";
                        readonly lockedBy: "organization" | null;
                        readonly own: {
                            readonly kind: "unset";
                        } | {
                            readonly kind: "set";
                            readonly value: import("@omne-harness/json-text").JsonValue;
                        };
                        readonly revision: string;
                        readonly valueSchema: import("@omne-harness/json-text").JsonValue;
                    } | {
                        readonly asset: {
                            readonly category: string;
                            readonly name: string;
                        };
                        readonly bound: readonly string[] | null;
                        readonly choices: readonly {
                            readonly description: string;
                            readonly label: string;
                            readonly permitsOperation: boolean;
                            readonly value: string;
                        }[];
                        readonly declaration: {
                            readonly appliesAt: string;
                            readonly clearEffect: string;
                            readonly purpose: string;
                            readonly title: string;
                        };
                        readonly default: string;
                        readonly editable: {
                            readonly kind: "yes";
                        } | {
                            readonly kind: "no";
                            readonly reason: "locked" | "not-a-source" | "prohibited-above";
                        };
                        readonly effective: {
                            readonly kind: "value";
                            readonly source: "default" | "organization" | "tenant";
                            readonly value: string;
                        } | {
                            readonly by: "organization" | "tenant";
                            readonly kind: "prohibited";
                        } | {
                            readonly kind: "empty-bound";
                        };
                        readonly item: string;
                        readonly kind: "permission";
                        readonly own: string | null;
                        readonly revision: string;
                    } | {
                        readonly asset: {
                            readonly category: string;
                            readonly name: string;
                        };
                        readonly declaration: {
                            readonly appliesAt: string;
                            readonly clearEffect: string;
                            readonly purpose: string;
                            readonly title: string;
                        };
                        readonly editable: {
                            readonly kind: "yes";
                        } | {
                            readonly kind: "no";
                            readonly reason: "locked" | "not-a-source" | "prohibited-above";
                        };
                        readonly item: string;
                        readonly kind: "secret";
                        readonly official: "available" | "revoked" | "unreadable" | "unset";
                        readonly own: "available" | "revoked" | "unreadable" | "unset";
                        readonly revision: string;
                    })[];
                    readonly next: string | null;
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly after: string | null;
                readonly asset?: {
                    readonly category?: string;
                    readonly name: string;
                };
                readonly limit: number;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'describe-setting': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly item: {
                        readonly asset: {
                            readonly category: string;
                            readonly name: string;
                        };
                        readonly declaration: {
                            readonly appliesAt: string;
                            readonly clearEffect: string;
                            readonly purpose: string;
                            readonly title: string;
                        };
                        readonly default: {
                            readonly kind: "unset";
                        } | {
                            readonly kind: "set";
                            readonly value: import("@omne-harness/json-text").JsonValue;
                        };
                        readonly editable: {
                            readonly kind: "yes";
                        } | {
                            readonly kind: "no";
                            readonly reason: "locked" | "not-a-source" | "prohibited-above";
                        };
                        readonly effective: {
                            readonly source: "default" | "organization" | "tenant" | null;
                            readonly value: {
                                readonly kind: "unset";
                            } | {
                                readonly kind: "set";
                                readonly value: import("@omne-harness/json-text").JsonValue;
                            };
                        };
                        readonly item: string;
                        readonly kind: "ordinary";
                        readonly lockedBy: "organization" | null;
                        readonly own: {
                            readonly kind: "unset";
                        } | {
                            readonly kind: "set";
                            readonly value: import("@omne-harness/json-text").JsonValue;
                        };
                        readonly revision: string;
                        readonly valueSchema: import("@omne-harness/json-text").JsonValue;
                    } | {
                        readonly asset: {
                            readonly category: string;
                            readonly name: string;
                        };
                        readonly bound: readonly string[] | null;
                        readonly choices: readonly {
                            readonly description: string;
                            readonly label: string;
                            readonly permitsOperation: boolean;
                            readonly value: string;
                        }[];
                        readonly declaration: {
                            readonly appliesAt: string;
                            readonly clearEffect: string;
                            readonly purpose: string;
                            readonly title: string;
                        };
                        readonly default: string;
                        readonly editable: {
                            readonly kind: "yes";
                        } | {
                            readonly kind: "no";
                            readonly reason: "locked" | "not-a-source" | "prohibited-above";
                        };
                        readonly effective: {
                            readonly kind: "value";
                            readonly source: "default" | "organization" | "tenant";
                            readonly value: string;
                        } | {
                            readonly by: "organization" | "tenant";
                            readonly kind: "prohibited";
                        } | {
                            readonly kind: "empty-bound";
                        };
                        readonly item: string;
                        readonly kind: "permission";
                        readonly own: string | null;
                        readonly revision: string;
                    } | {
                        readonly asset: {
                            readonly category: string;
                            readonly name: string;
                        };
                        readonly declaration: {
                            readonly appliesAt: string;
                            readonly clearEffect: string;
                            readonly purpose: string;
                            readonly title: string;
                        };
                        readonly editable: {
                            readonly kind: "yes";
                        } | {
                            readonly kind: "no";
                            readonly reason: "locked" | "not-a-source" | "prohibited-above";
                        };
                        readonly item: string;
                        readonly kind: "secret";
                        readonly official: "available" | "revoked" | "unreadable" | "unset";
                        readonly own: "available" | "revoked" | "unreadable" | "unset";
                        readonly revision: string;
                    };
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly asset: {
                    readonly category?: string;
                    readonly name: string;
                };
                readonly item: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'set-setting': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly revision: string;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-writable': import("@omne-harness/public-contract").Codec<{
                    readonly reason: "locked" | "not-a-source" | "out-of-bound" | "prohibited-above";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly asset: {
                    readonly category?: string;
                    readonly name: string;
                };
                readonly expectedRevision: string;
                readonly item: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly value: {
                    readonly kind: "ordinary";
                    readonly value: import("@omne-harness/json-text").JsonValue;
                } | {
                    readonly kind: "permission";
                    readonly pick: string;
                } | {
                    readonly kind: "secret";
                    readonly secret: string;
                };
            }>;
        };
        readonly 'clear-setting': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly revision: string;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-writable': import("@omne-harness/public-contract").Codec<{
                    readonly reason: "locked" | "not-a-source" | "out-of-bound" | "prohibited-above";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: "login";
            readonly effect: "commit";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly asset: {
                    readonly category?: string;
                    readonly name: string;
                };
                readonly expectedRevision: string;
                readonly item: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "assets";
    readonly major: 1;
    readonly observations: {};
};
export type AssetsProtocol = typeof assetsProtocol;
export {};
```

## 声明文件 `index.d.ts`

```ts
export { assetsProtocol, type AssetsProtocol, type SettingInput, type SettingView, } from './assets-protocol.ts';
```
