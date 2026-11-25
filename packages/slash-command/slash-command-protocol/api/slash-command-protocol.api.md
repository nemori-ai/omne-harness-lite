# @omne-harness/slash-command-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `SlashCommandCatalog` · `index.d.ts`
- `SlashCommandEntry` · `index.d.ts`
- `SlashCommandProtocol` · `index.d.ts`
- `slashCommandProtocol` · `index.d.ts`

## 声明文件 `index.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const entry: {
    readonly kind: 'object';
    readonly fields: {
        readonly full: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly space: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly name: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly kind: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "reference",
                    "prompt",
                    "system"
                ];
            };
        };
        readonly title: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly hint: {
            readonly rule: {
                readonly kind: 'text';
            };
            readonly optional: true;
        };
        readonly params: {
            readonly rule: {
                readonly kind: 'array';
                readonly item: {
                    readonly kind: 'object';
                    readonly fields: {
                        readonly name: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly optional: {
                            readonly rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    true
                                ];
                            };
                            readonly optional: true;
                        };
                        readonly candidates: {
                            readonly rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    true
                                ];
                            };
                            readonly optional: true;
                        };
                    };
                };
                readonly max: number;
            };
            readonly optional: true;
            readonly since: 2;
        };
        readonly unavailable: {
            readonly rule: {
                readonly kind: 'text';
            };
            readonly optional: true;
        };
        readonly whileRunning: {
            readonly rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "now",
                    "refuse"
                ];
            };
            readonly optional: true;
        };
        readonly takesEffect: {
            readonly rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "now",
                    "next-request",
                    "next-run"
                ];
            };
            readonly optional: true;
        };
    };
};
declare const catalog: {
    readonly kind: 'object';
    readonly fields: {
        readonly entries: {
            rule: {
                readonly kind: 'array';
                readonly item: {
                    readonly kind: 'object';
                    readonly fields: {
                        readonly full: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly space: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly name: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly kind: {
                            rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "reference",
                                    "prompt",
                                    "system"
                                ];
                            };
                        };
                        readonly title: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly hint: {
                            readonly rule: {
                                readonly kind: 'text';
                            };
                            readonly optional: true;
                        };
                        readonly params: {
                            readonly rule: {
                                readonly kind: 'array';
                                readonly item: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly name: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                        readonly optional: {
                                            readonly rule: {
                                                readonly kind: 'literal';
                                                readonly values: readonly [
                                                    true
                                                ];
                                            };
                                            readonly optional: true;
                                        };
                                        readonly candidates: {
                                            readonly rule: {
                                                readonly kind: 'literal';
                                                readonly values: readonly [
                                                    true
                                                ];
                                            };
                                            readonly optional: true;
                                        };
                                    };
                                };
                                readonly max: number;
                            };
                            readonly optional: true;
                            readonly since: 2;
                        };
                        readonly unavailable: {
                            readonly rule: {
                                readonly kind: 'text';
                            };
                            readonly optional: true;
                        };
                        readonly whileRunning: {
                            readonly rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "now",
                                    "refuse"
                                ];
                            };
                            readonly optional: true;
                        };
                        readonly takesEffect: {
                            readonly rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "now",
                                    "next-request",
                                    "next-run"
                                ];
                            };
                            readonly optional: true;
                        };
                    };
                };
                readonly max: number;
            };
        };
        readonly missing: {
            rule: {
                readonly kind: 'array';
                readonly item: {
                    readonly kind: 'text';
                };
                readonly max: number;
            };
        };
    };
};
export declare const slashCommandProtocol: {
    readonly operations: {
        readonly 'read-catalog': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly entries: readonly {
                        readonly full: string;
                        readonly hint?: string;
                        readonly kind: "prompt" | "reference" | "system";
                        readonly name: string;
                        readonly params?: readonly {
                            readonly candidates?: true;
                            readonly name: string;
                            readonly optional?: true;
                        }[];
                        readonly space: string;
                        readonly takesEffect?: "next-request" | "next-run" | "now";
                        readonly title: string;
                        readonly unavailable?: string;
                        readonly whileRunning?: "now" | "refuse";
                    }[];
                    readonly missing: readonly string[];
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
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "slash-command";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-catalog': {
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
export type SlashCommandProtocol = typeof slashCommandProtocol;
export type SlashCommandCatalog = RuleValue<typeof catalog>;
export type SlashCommandEntry = RuleValue<typeof entry>;
export {};
```
