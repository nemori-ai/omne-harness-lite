# @omne-harness/canvas-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `CanvasBody` · `canvas-protocol.d.ts`
- `CanvasEntryBody` · `canvas-protocol.d.ts`
- `CanvasItemBody` · `canvas-protocol.d.ts`
- `CanvasKindBody` · `canvas-protocol.d.ts`
- `CanvasPileBody` · `canvas-protocol.d.ts`
- `CanvasProtocol` · `canvas-protocol.d.ts`
- `canvasProtocol` · `canvas-protocol.d.ts`

## 声明文件 `canvas-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const item: {
    readonly kind: 'object';
    readonly fields: {
        readonly id: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly reference: {
            rule: {
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
            };
        };
        readonly state: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "on",
                    "off"
                ];
            };
        };
        readonly at: {
            rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly x: {
                        rule: {
                            readonly kind: 'count';
                        };
                    };
                    readonly y: {
                        rule: {
                            readonly kind: 'count';
                        };
                    };
                };
            };
        };
        readonly size: {
            rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly width: {
                                rule: {
                                    readonly kind: 'positive-integer';
                                };
                            };
                            readonly height: {
                                rule: {
                                    readonly kind: 'positive-integer';
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
        readonly rank: {
            rule: {
                readonly kind: 'count';
            };
        };
        readonly pile: {
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
        readonly locked: {
            rule: {
                readonly kind: 'boolean';
            };
        };
        readonly by: {
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
                    }
                ];
            };
        };
        readonly when: {
            rule: {
                readonly kind: 'instant';
            };
        };
    };
};
declare const pile: {
    readonly kind: 'object';
    readonly fields: {
        readonly id: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly name: {
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
                readonly kind: 'object';
                readonly fields: {
                    readonly x: {
                        rule: {
                            readonly kind: 'count';
                        };
                    };
                    readonly y: {
                        rule: {
                            readonly kind: 'count';
                        };
                    };
                };
            };
        };
        readonly by: {
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
                    }
                ];
            };
        };
        readonly when: {
            rule: {
                readonly kind: 'instant';
            };
        };
    };
};
declare const canvas: {
    readonly kind: 'object';
    readonly fields: {
        readonly sheet: {
            rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly width: {
                        rule: {
                            readonly kind: 'positive-integer';
                        };
                    };
                    readonly height: {
                        rule: {
                            readonly kind: 'positive-integer';
                        };
                    };
                    readonly grid: {
                        rule: {
                            readonly kind: 'positive-integer';
                        };
                    };
                    readonly size: {
                        rule: {
                            readonly kind: 'object';
                            readonly fields: {
                                readonly min: {
                                    rule: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly width: {
                                                rule: {
                                                    readonly kind: 'positive-integer';
                                                };
                                            };
                                            readonly height: {
                                                rule: {
                                                    readonly kind: 'positive-integer';
                                                };
                                            };
                                        };
                                    };
                                };
                                readonly max: {
                                    rule: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly width: {
                                                rule: {
                                                    readonly kind: 'positive-integer';
                                                };
                                            };
                                            readonly height: {
                                                rule: {
                                                    readonly kind: 'positive-integer';
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly footprint: {
                        rule: {
                            readonly kind: 'object';
                            readonly fields: {
                                readonly width: {
                                    rule: {
                                        readonly kind: 'positive-integer';
                                    };
                                };
                                readonly height: {
                                    rule: {
                                        readonly kind: 'positive-integer';
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly items: {
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
                        readonly reference: {
                            rule: {
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
                            };
                        };
                        readonly state: {
                            rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "on",
                                    "off"
                                ];
                            };
                        };
                        readonly at: {
                            rule: {
                                readonly kind: 'object';
                                readonly fields: {
                                    readonly x: {
                                        rule: {
                                            readonly kind: 'count';
                                        };
                                    };
                                    readonly y: {
                                        rule: {
                                            readonly kind: 'count';
                                        };
                                    };
                                };
                            };
                        };
                        readonly size: {
                            rule: {
                                readonly kind: 'one-of';
                                readonly rules: readonly [
                                    {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly width: {
                                                rule: {
                                                    readonly kind: 'positive-integer';
                                                };
                                            };
                                            readonly height: {
                                                rule: {
                                                    readonly kind: 'positive-integer';
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
                        readonly rank: {
                            rule: {
                                readonly kind: 'count';
                            };
                        };
                        readonly pile: {
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
                        readonly locked: {
                            rule: {
                                readonly kind: 'boolean';
                            };
                        };
                        readonly by: {
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
                                    }
                                ];
                            };
                        };
                        readonly when: {
                            rule: {
                                readonly kind: 'instant';
                            };
                        };
                    };
                };
            };
        };
        readonly piles: {
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
                        readonly name: {
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
                                readonly kind: 'object';
                                readonly fields: {
                                    readonly x: {
                                        rule: {
                                            readonly kind: 'count';
                                        };
                                    };
                                    readonly y: {
                                        rule: {
                                            readonly kind: 'count';
                                        };
                                    };
                                };
                            };
                        };
                        readonly by: {
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
                                    }
                                ];
                            };
                        };
                        readonly when: {
                            rule: {
                                readonly kind: 'instant';
                            };
                        };
                    };
                };
            };
        };
        readonly revision: {
            rule: {
                readonly kind: 'count';
            };
        };
    };
};
declare const kindListing: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "declared"
                        ];
                    };
                };
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
                readonly summary: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
                readonly reference: {
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
                            "conflict"
                        ];
                    };
                };
                readonly name: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
                readonly by: {
                    rule: {
                        readonly kind: 'array';
                        readonly item: {
                            readonly kind: 'text';
                        };
                    };
                };
            };
        }
    ];
};
declare const entry: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly item: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
            };
        },
        {
            readonly kind: 'object';
            readonly fields: {
                readonly pile: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
            };
        }
    ];
};
export declare const canvasProtocol: {
    readonly operations: {
        readonly look: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly items: readonly {
                        readonly at: {
                            readonly x: number;
                            readonly y: number;
                        };
                        readonly by: {
                            readonly kind: "human";
                        } | {
                            readonly kind: "agent";
                            readonly session: string;
                        };
                        readonly id: string;
                        readonly locked: boolean;
                        readonly pile: string | null;
                        readonly rank: number;
                        readonly reference: {
                            readonly kind: string;
                            readonly ref: string;
                        };
                        readonly size: {
                            readonly height: number;
                            readonly width: number;
                        } | null;
                        readonly state: "off" | "on";
                        readonly when: import("@omne-harness/utc-instant").Instant;
                    }[];
                    readonly piles: readonly {
                        readonly at: {
                            readonly x: number;
                            readonly y: number;
                        };
                        readonly by: {
                            readonly kind: "human";
                        } | {
                            readonly kind: "agent";
                            readonly session: string;
                        };
                        readonly id: string;
                        readonly name: string | null;
                        readonly when: import("@omne-harness/utc-instant").Instant;
                    }[];
                    readonly revision: number;
                    readonly sheet: {
                        readonly footprint: {
                            readonly height: number;
                            readonly width: number;
                        };
                        readonly grid: number;
                        readonly height: number;
                        readonly size: {
                            readonly max: {
                                readonly height: number;
                                readonly width: number;
                            };
                            readonly min: {
                                readonly height: number;
                                readonly width: number;
                            };
                        };
                        readonly width: number;
                    };
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "canvas" | "request";
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
                readonly canvas: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'look-away': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly items: readonly {
                        readonly at: {
                            readonly x: number;
                            readonly y: number;
                        };
                        readonly by: {
                            readonly kind: "human";
                        } | {
                            readonly kind: "agent";
                            readonly session: string;
                        };
                        readonly id: string;
                        readonly locked: boolean;
                        readonly pile: string | null;
                        readonly rank: number;
                        readonly reference: {
                            readonly kind: string;
                            readonly ref: string;
                        };
                        readonly size: {
                            readonly height: number;
                            readonly width: number;
                        } | null;
                        readonly state: "off" | "on";
                        readonly when: import("@omne-harness/utc-instant").Instant;
                    }[];
                    readonly next: number | null;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly path: readonly (string | number)[];
                    readonly reason: "batch" | "canvas" | "repeated" | "request" | "size" | "spot";
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
                readonly before?: number;
                readonly canvas: string;
                readonly limit: number;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly kinds: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly kinds: readonly ({
                        readonly kind: "declared";
                        readonly label: string;
                        readonly name: string;
                        readonly reference: string;
                        readonly summary: string;
                    } | {
                        readonly by: readonly string[];
                        readonly kind: "conflict";
                        readonly name: string;
                    })[];
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
        readonly place: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly item: {
                        readonly at: {
                            readonly x: number;
                            readonly y: number;
                        };
                        readonly by: {
                            readonly kind: "human";
                        } | {
                            readonly kind: "agent";
                            readonly session: string;
                        };
                        readonly id: string;
                        readonly locked: boolean;
                        readonly pile: string | null;
                        readonly rank: number;
                        readonly reference: {
                            readonly kind: string;
                            readonly ref: string;
                        };
                        readonly size: {
                            readonly height: number;
                            readonly width: number;
                        } | null;
                        readonly state: "off" | "on";
                        readonly when: import("@omne-harness/utc-instant").Instant;
                    };
                    readonly revision: number;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{
                    readonly item: {
                        readonly at: {
                            readonly x: number;
                            readonly y: number;
                        };
                        readonly by: {
                            readonly kind: "human";
                        } | {
                            readonly kind: "agent";
                            readonly session: string;
                        };
                        readonly id: string;
                        readonly locked: boolean;
                        readonly pile: string | null;
                        readonly rank: number;
                        readonly reference: {
                            readonly kind: string;
                            readonly ref: string;
                        };
                        readonly size: {
                            readonly height: number;
                            readonly width: number;
                        } | null;
                        readonly state: "off" | "on";
                        readonly when: import("@omne-harness/utc-instant").Instant;
                    };
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly path: readonly (string | number)[];
                    readonly reason: "batch" | "canvas" | "repeated" | "request" | "size" | "spot";
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "full" | "kind-undeclared" | "not-admitted";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly effect: 'commit';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly at?: {
                    readonly x: number;
                    readonly y: number;
                };
                readonly canvas: string;
                readonly near?: {
                    readonly x: number;
                    readonly y: number;
                };
                readonly reference: {
                    readonly kind: string;
                    readonly ref: string;
                };
                readonly size?: {
                    readonly height: number;
                    readonly width: number;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly arrange: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly revision: number;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly path: readonly (string | number)[];
                    readonly reason: "batch" | "canvas" | "repeated" | "request" | "size" | "spot";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{
                    readonly entry: {
                        readonly item: string;
                    } | {
                        readonly pile: string;
                    };
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly entry?: {
                        readonly item: string;
                    } | {
                        readonly pile: string;
                    };
                    readonly reason: "full" | "in-pile" | "kind-undeclared" | "locked" | "not-admitted" | "taken";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly effect: 'commit';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly canvas: string;
                readonly items?: readonly {
                    readonly at?: {
                        readonly x: number;
                        readonly y: number;
                    };
                    readonly item: string;
                    readonly pile?: string | null;
                    readonly size?: {
                        readonly height: number;
                        readonly width: number;
                    } | null;
                    readonly top?: true;
                }[];
                readonly piles?: readonly {
                    readonly at?: {
                        readonly x: number;
                        readonly y: number;
                    };
                    readonly name?: string | null;
                    readonly pile: string;
                }[];
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly take: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly revision: number;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly path: readonly (string | number)[];
                    readonly reason: "batch" | "canvas" | "repeated" | "request" | "size" | "spot";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{
                    readonly entry: {
                        readonly item: string;
                    } | {
                        readonly pile: string;
                    };
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly entry?: {
                        readonly item: string;
                    } | {
                        readonly pile: string;
                    };
                    readonly reason: "full" | "in-pile" | "kind-undeclared" | "locked" | "not-admitted" | "taken";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly effect: 'commit';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly canvas: string;
                readonly items: readonly string[];
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly pile: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly revision: number;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly path: readonly (string | number)[];
                    readonly reason: "batch" | "canvas" | "repeated" | "request" | "size" | "spot";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{
                    readonly entry: {
                        readonly item: string;
                    } | {
                        readonly pile: string;
                    };
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly entry?: {
                        readonly item: string;
                    } | {
                        readonly pile: string;
                    };
                    readonly reason: "full" | "in-pile" | "kind-undeclared" | "locked" | "not-admitted" | "taken";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly effect: 'commit';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly at?: {
                    readonly x: number;
                    readonly y: number;
                };
                readonly canvas: string;
                readonly items: readonly string[];
                readonly pile: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly scatter: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly revision: number;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly path: readonly (string | number)[];
                    readonly reason: "batch" | "canvas" | "repeated" | "request" | "size" | "spot";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{
                    readonly entry: {
                        readonly item: string;
                    } | {
                        readonly pile: string;
                    };
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly entry?: {
                        readonly item: string;
                    } | {
                        readonly pile: string;
                    };
                    readonly reason: "full" | "in-pile" | "kind-undeclared" | "locked" | "not-admitted" | "taken";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly effect: 'commit';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly canvas: string;
                readonly pile: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly lock: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly revision: number;
                }>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly path: readonly (string | number)[];
                    readonly reason: "batch" | "canvas" | "repeated" | "request" | "size" | "spot";
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{
                    readonly entry: {
                        readonly item: string;
                    } | {
                        readonly pile: string;
                    };
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly entry?: {
                        readonly item: string;
                    } | {
                        readonly pile: string;
                    };
                    readonly reason: "full" | "in-pile" | "kind-undeclared" | "locked" | "not-admitted" | "taken";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly effect: 'commit';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly canvas: string;
                readonly items: readonly string[];
                readonly locked: boolean;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "canvas";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-changes': {
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
export type CanvasProtocol = typeof canvasProtocol;
export type CanvasBody = RuleValue<typeof canvas>;
export type CanvasItemBody = RuleValue<typeof item>;
export type CanvasPileBody = RuleValue<typeof pile>;
export type CanvasKindBody = RuleValue<typeof kindListing>;
export type CanvasEntryBody = RuleValue<typeof entry>;
export {};
```

## 声明文件 `index.d.ts`

```ts
export { canvasProtocol, type CanvasBody, type CanvasEntryBody, type CanvasItemBody, type CanvasKindBody, type CanvasPileBody, type CanvasProtocol, } from './canvas-protocol.ts';
```
