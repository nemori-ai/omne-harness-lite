# @omne-harness/interface-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `DEFAULT_MODE` · `mode.d.ts`
- `INSPECTION_REASONS` · `interface-protocol.d.ts`
- `InspectionAsked` · `interface-protocol.d.ts`
- `InspectionMode` · `interface-protocol.d.ts`
- `InspectionReason` · `interface-protocol.d.ts`
- `InspectionResult` · `interface-protocol.d.ts`
- `InterfaceProtocol` · `interface-protocol.d.ts`
- `MODE_BOUNDS` · `mode.d.ts`
- `SIZE_TIERS` · `interface-protocol.d.ts`
- `THEMES` · `interface-protocol.d.ts`
- `interfaceProtocol` · `interface-protocol.d.ts`
- `modeOf` · `mode.d.ts`

## 声明文件 `index.d.ts`

```ts
export { INSPECTION_REASONS, SIZE_TIERS, THEMES, interfaceProtocol, type InspectionAsked, type InspectionMode, type InspectionReason, type InspectionResult, type InterfaceProtocol, } from './interface-protocol.ts';
export { DEFAULT_MODE, MODE_BOUNDS, modeOf } from './mode.ts';
```

## 声明文件 `interface-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
export declare const THEMES: readonly [
    'light',
    'dark'
];
export declare const SIZE_TIERS: readonly [
    'small',
    'medium',
    'large',
    'reading'
];
export declare const INSPECTION_REASONS: readonly [
    'no-page',
    'no-skin',
    'bad-mode',
    'not-settled',
    'unsupported'
];
declare const mode: {
    readonly kind: 'object';
    readonly fields: {
        readonly theme: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "light",
                    "dark"
                ];
            };
        };
        readonly size: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "small",
                    "medium",
                    "large",
                    "reading"
                ];
            };
        };
        readonly look: {
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
                                        "built-in"
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
                                        "skin"
                                    ];
                                };
                            };
                            readonly name: {
                                rule: {
                                    readonly kind: 'text';
                                };
                            };
                        };
                    }
                ];
            };
        };
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
declare const asked: {
    readonly kind: 'object';
    readonly fields: {
        readonly request: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly page: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly subject: {
            readonly rule: {
                readonly kind: 'text';
            };
            readonly optional: true;
        };
        readonly mode: {
            rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly theme: {
                        rule: {
                            readonly kind: 'literal';
                            readonly values: readonly [
                                "light",
                                "dark"
                            ];
                        };
                    };
                    readonly size: {
                        rule: {
                            readonly kind: 'literal';
                            readonly values: readonly [
                                "small",
                                "medium",
                                "large",
                                "reading"
                            ];
                        };
                    };
                    readonly look: {
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
                                                    "built-in"
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
                                                    "skin"
                                                ];
                                            };
                                        };
                                        readonly name: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                    };
                                }
                            ];
                        };
                    };
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
declare const result: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "image"
                        ];
                    };
                };
                readonly bytes: {
                    rule: {
                        readonly kind: 'bytes';
                    };
                };
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
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "cannot"
                        ];
                    };
                };
                readonly reason: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "no-page",
                            "no-skin",
                            "bad-mode",
                            "not-settled",
                            "unsupported"
                        ];
                    };
                };
            };
        }
    ];
};
export declare const interfaceProtocol: {
    readonly operations: {
        readonly deliver: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
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
                readonly client: string;
                readonly request: string;
                readonly result: {
                    readonly bytes: Uint8Array<ArrayBufferLike>;
                    readonly height: number;
                    readonly kind: "image";
                    readonly width: number;
                } | {
                    readonly kind: "cannot";
                    readonly reason: "bad-mode" | "no-page" | "no-skin" | "not-settled" | "unsupported";
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "interface";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-requests': {
            readonly identity: "login";
            readonly open: import("@omne-harness/public-contract").Codec<{
                readonly client: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly frame: import("@omne-harness/public-contract").Codec<{
                readonly mode: {
                    readonly height: number;
                    readonly look: {
                        readonly kind: "built-in";
                    } | {
                        readonly kind: "skin";
                        readonly name: string;
                    };
                    readonly size: "large" | "medium" | "reading" | "small";
                    readonly theme: "dark" | "light";
                    readonly width: number;
                };
                readonly page: string;
                readonly request: string;
                readonly subject?: string;
            }>;
            readonly ends: readonly [
            ];
        };
    };
};
export type InterfaceProtocol = typeof interfaceProtocol;
export type InspectionMode = RuleValue<typeof mode>;
export type InspectionAsked = RuleValue<typeof asked>;
export type InspectionResult = RuleValue<typeof result>;
export type InspectionReason = (typeof INSPECTION_REASONS)[number];
export {};
```

## 声明文件 `mode.d.ts`

```ts
import { type InspectionMode } from './interface-protocol.ts';
export declare const MODE_BOUNDS: {
    readonly width: {
        readonly least: 320;
        readonly most: 2560;
    };
    readonly height: {
        readonly least: 240;
        readonly most: 2560;
    };
};
export declare const DEFAULT_MODE: InspectionMode;
export declare function modeOf(given: Partial<InspectionMode>): InspectionMode | 'bad-mode';
```
