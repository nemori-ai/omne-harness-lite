# @omne-harness/usage-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `UsageProtocol` · `usage-protocol.d.ts`
- `usageProtocol` · `usage-protocol.d.ts`

## 声明文件 `index.d.ts`

```ts
export { usageProtocol, type UsageProtocol } from './usage-protocol.ts';
```

## 声明文件 `usage-protocol.d.ts`

```ts
export declare const usageProtocol: {
    readonly operations: {
        readonly 'query-usage': {
            readonly outcomes: {
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly field: "after" | "bucket" | "groupBy" | "limit" | "range" | "scope" | "zone";
                    readonly reason: string;
                }>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{
                    readonly field: "scope";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: "buckets" | "pages";
                }>;
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly buckets: readonly {
                        readonly end: import("@omne-harness/utc-instant").Instant;
                        readonly groups: readonly {
                            readonly key: readonly (string | null)[];
                            readonly measures: {
                                readonly calls: number;
                                readonly cost: {
                                    readonly sums: readonly {
                                        readonly known: string;
                                        readonly unit: string;
                                    }[];
                                    readonly unknown: number;
                                };
                                readonly duration: {
                                    readonly toFirstContent: {
                                        readonly count: number;
                                        readonly p50: number | null;
                                        readonly p90: number | null;
                                    };
                                    readonly total: {
                                        readonly known: string;
                                        readonly provisional: number;
                                        readonly unknown: number;
                                    };
                                    readonly whole: {
                                        readonly count: number;
                                        readonly p50: number | null;
                                        readonly p90: number | null;
                                    };
                                };
                                readonly failed: readonly {
                                    readonly cause: string | null;
                                    readonly count: number;
                                }[];
                                readonly interrupted: number;
                                readonly rates: {
                                    readonly cacheHit: {
                                        readonly kind: "known";
                                        readonly value: string;
                                    } | {
                                        readonly kind: "unknown";
                                    };
                                    readonly failure: {
                                        readonly kind: "known";
                                        readonly value: string;
                                    } | {
                                        readonly kind: "unknown";
                                    };
                                    readonly outputPerSecond: {
                                        readonly kind: "known";
                                        readonly value: string;
                                    } | {
                                        readonly kind: "unknown";
                                    };
                                    readonly reasoningShare: {
                                        readonly kind: "known";
                                        readonly value: string;
                                    } | {
                                        readonly kind: "unknown";
                                    };
                                    readonly retry: {
                                        readonly kind: "known";
                                        readonly value: string;
                                    } | {
                                        readonly kind: "unknown";
                                    };
                                };
                                readonly retried: number;
                                readonly tokens: {
                                    readonly "cache-read": {
                                        readonly known: string;
                                        readonly provisional: number;
                                        readonly unknown: number;
                                    };
                                    readonly "cache-write": {
                                        readonly known: string;
                                        readonly provisional: number;
                                        readonly unknown: number;
                                    };
                                    readonly input: {
                                        readonly known: string;
                                        readonly provisional: number;
                                        readonly unknown: number;
                                    };
                                    readonly output: {
                                        readonly known: string;
                                        readonly provisional: number;
                                        readonly unknown: number;
                                    };
                                    readonly reasoning: {
                                        readonly known: string;
                                        readonly provisional: number;
                                        readonly unknown: number;
                                    };
                                };
                                readonly units: number;
                            };
                        }[];
                        readonly start: import("@omne-harness/utc-instant").Instant;
                        readonly total: {
                            readonly calls: number;
                            readonly cost: {
                                readonly sums: readonly {
                                    readonly known: string;
                                    readonly unit: string;
                                }[];
                                readonly unknown: number;
                            };
                            readonly duration: {
                                readonly toFirstContent: {
                                    readonly count: number;
                                    readonly p50: number | null;
                                    readonly p90: number | null;
                                };
                                readonly total: {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                                readonly whole: {
                                    readonly count: number;
                                    readonly p50: number | null;
                                    readonly p90: number | null;
                                };
                            };
                            readonly failed: readonly {
                                readonly cause: string | null;
                                readonly count: number;
                            }[];
                            readonly interrupted: number;
                            readonly rates: {
                                readonly cacheHit: {
                                    readonly kind: "known";
                                    readonly value: string;
                                } | {
                                    readonly kind: "unknown";
                                };
                                readonly failure: {
                                    readonly kind: "known";
                                    readonly value: string;
                                } | {
                                    readonly kind: "unknown";
                                };
                                readonly outputPerSecond: {
                                    readonly kind: "known";
                                    readonly value: string;
                                } | {
                                    readonly kind: "unknown";
                                };
                                readonly reasoningShare: {
                                    readonly kind: "known";
                                    readonly value: string;
                                } | {
                                    readonly kind: "unknown";
                                };
                                readonly retry: {
                                    readonly kind: "known";
                                    readonly value: string;
                                } | {
                                    readonly kind: "unknown";
                                };
                            };
                            readonly retried: number;
                            readonly tokens: {
                                readonly "cache-read": {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                                readonly "cache-write": {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                                readonly input: {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                                readonly output: {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                                readonly reasoning: {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                            };
                            readonly units: number;
                        };
                    }[];
                    readonly coverage: {
                        readonly costUnknown: number;
                        readonly earliest: import("@omne-harness/utc-instant").Instant | null;
                        readonly excluded: {
                            readonly cacheHit: number;
                            readonly outputPerSecond: number;
                            readonly reasoningShare: number;
                        };
                        readonly sources: readonly string[];
                        readonly undated: number;
                    };
                    readonly groups: readonly {
                        readonly key: readonly (string | null)[];
                        readonly measures: {
                            readonly calls: number;
                            readonly cost: {
                                readonly sums: readonly {
                                    readonly known: string;
                                    readonly unit: string;
                                }[];
                                readonly unknown: number;
                            };
                            readonly duration: {
                                readonly toFirstContent: {
                                    readonly count: number;
                                    readonly p50: number | null;
                                    readonly p90: number | null;
                                };
                                readonly total: {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                                readonly whole: {
                                    readonly count: number;
                                    readonly p50: number | null;
                                    readonly p90: number | null;
                                };
                            };
                            readonly failed: readonly {
                                readonly cause: string | null;
                                readonly count: number;
                            }[];
                            readonly interrupted: number;
                            readonly rates: {
                                readonly cacheHit: {
                                    readonly kind: "known";
                                    readonly value: string;
                                } | {
                                    readonly kind: "unknown";
                                };
                                readonly failure: {
                                    readonly kind: "known";
                                    readonly value: string;
                                } | {
                                    readonly kind: "unknown";
                                };
                                readonly outputPerSecond: {
                                    readonly kind: "known";
                                    readonly value: string;
                                } | {
                                    readonly kind: "unknown";
                                };
                                readonly reasoningShare: {
                                    readonly kind: "known";
                                    readonly value: string;
                                } | {
                                    readonly kind: "unknown";
                                };
                                readonly retry: {
                                    readonly kind: "known";
                                    readonly value: string;
                                } | {
                                    readonly kind: "unknown";
                                };
                            };
                            readonly retried: number;
                            readonly tokens: {
                                readonly "cache-read": {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                                readonly "cache-write": {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                                readonly input: {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                                readonly output: {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                                readonly reasoning: {
                                    readonly known: string;
                                    readonly provisional: number;
                                    readonly unknown: number;
                                };
                            };
                            readonly units: number;
                        };
                    }[];
                    readonly total: {
                        readonly calls: number;
                        readonly cost: {
                            readonly sums: readonly {
                                readonly known: string;
                                readonly unit: string;
                            }[];
                            readonly unknown: number;
                        };
                        readonly duration: {
                            readonly toFirstContent: {
                                readonly count: number;
                                readonly p50: number | null;
                                readonly p90: number | null;
                            };
                            readonly total: {
                                readonly known: string;
                                readonly provisional: number;
                                readonly unknown: number;
                            };
                            readonly whole: {
                                readonly count: number;
                                readonly p50: number | null;
                                readonly p90: number | null;
                            };
                        };
                        readonly failed: readonly {
                            readonly cause: string | null;
                            readonly count: number;
                        }[];
                        readonly interrupted: number;
                        readonly rates: {
                            readonly cacheHit: {
                                readonly kind: "known";
                                readonly value: string;
                            } | {
                                readonly kind: "unknown";
                            };
                            readonly failure: {
                                readonly kind: "known";
                                readonly value: string;
                            } | {
                                readonly kind: "unknown";
                            };
                            readonly outputPerSecond: {
                                readonly kind: "known";
                                readonly value: string;
                            } | {
                                readonly kind: "unknown";
                            };
                            readonly reasoningShare: {
                                readonly kind: "known";
                                readonly value: string;
                            } | {
                                readonly kind: "unknown";
                            };
                            readonly retry: {
                                readonly kind: "known";
                                readonly value: string;
                            } | {
                                readonly kind: "unknown";
                            };
                        };
                        readonly retried: number;
                        readonly tokens: {
                            readonly "cache-read": {
                                readonly known: string;
                                readonly provisional: number;
                                readonly unknown: number;
                            };
                            readonly "cache-write": {
                                readonly known: string;
                                readonly provisional: number;
                                readonly unknown: number;
                            };
                            readonly input: {
                                readonly known: string;
                                readonly provisional: number;
                                readonly unknown: number;
                            };
                            readonly output: {
                                readonly known: string;
                                readonly provisional: number;
                                readonly unknown: number;
                            };
                            readonly reasoning: {
                                readonly known: string;
                                readonly provisional: number;
                                readonly unknown: number;
                            };
                        };
                        readonly units: number;
                    };
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
                readonly bucket: "day" | "hour" | "month" | "none" | "week";
                readonly groupBy: readonly ("model" | "provider" | "purpose" | "source" | "tool")[];
                readonly range: {
                    readonly from: import("@omne-harness/utc-instant").Instant;
                    readonly to: import("@omne-harness/utc-instant").Instant;
                };
                readonly scope: {
                    readonly kind: "tenant";
                } | {
                    readonly kind: "session";
                    readonly session: string;
                } | {
                    readonly kind: "organization";
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly zone: string;
            }>;
        };
        readonly 'list-usage-records': {
            readonly outcomes: {
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly field: "after" | "bucket" | "groupBy" | "limit" | "range" | "scope" | "zone";
                    readonly reason: string;
                }>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{
                    readonly field: "scope";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: "buckets" | "pages";
                }>;
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly entries: readonly {
                        readonly accounted: boolean;
                        readonly at: import("@omne-harness/utc-instant").Instant | null;
                        readonly cause: string | null;
                        readonly connectRetries: number;
                        readonly consumer: {
                            readonly owner: string;
                            readonly position: string;
                            readonly purpose: string;
                            readonly work: string;
                        };
                        readonly cost: {
                            readonly lexeme: string;
                            readonly state: "known";
                            readonly unit: string;
                        } | {
                            readonly state: "unknown";
                        } | null;
                        readonly durations: {
                            readonly generation: number | null;
                            readonly toFirstContent: number | null;
                            readonly toResponse: number | null;
                            readonly total: number | null;
                        };
                        readonly labels: {
                            readonly model: string | null;
                            readonly profile: string | null;
                            readonly provider: string | null;
                            readonly tool: string | null;
                        };
                        readonly outcome: "completed" | "failed" | "interrupted" | "pending";
                        readonly source: string;
                        readonly subject: {
                            readonly id: string;
                            readonly kind: "model_call" | "tool_execution";
                        };
                        readonly unit: string;
                        readonly usage: readonly ({
                            readonly name: string;
                            readonly state: "unknown";
                            readonly unit: string;
                        } | {
                            readonly lexeme: string;
                            readonly name: string;
                            readonly state: "known" | "provisional";
                            readonly unit: string;
                        })[];
                        readonly window: {
                            readonly compactAtPercent: string | null;
                            readonly tokens: string;
                        } | null;
                    }[];
                    readonly next: string | null;
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
                readonly after: string | null;
                readonly limit: number;
                readonly range: {
                    readonly from: import("@omne-harness/utc-instant").Instant;
                    readonly to: import("@omne-harness/utc-instant").Instant;
                };
                readonly scope: {
                    readonly kind: "tenant";
                } | {
                    readonly kind: "session";
                    readonly session: string;
                } | {
                    readonly kind: "organization";
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'read-context-occupancy': {
            readonly outcomes: {
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly field: "after" | "bucket" | "groupBy" | "limit" | "range" | "scope" | "zone";
                    readonly reason: string;
                }>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{
                    readonly field: "scope";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: "buckets" | "pages";
                }>;
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly asOf: {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly model: string | null;
                    };
                    readonly compactAtPercent: string | null;
                    readonly kind: "known";
                    readonly percent: string;
                    readonly used: string;
                    readonly window: string;
                } | {
                    readonly kind: "none-yet";
                } | {
                    readonly kind: "unknown";
                    readonly reason: "usage-unknown" | "window-unknown";
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
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "usage";
    readonly major: 1;
    readonly observations: {};
};
export type UsageProtocol = typeof usageProtocol;
```
