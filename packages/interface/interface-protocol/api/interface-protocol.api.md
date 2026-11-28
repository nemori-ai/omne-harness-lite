# @omne-harness/interface-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `DEFAULT_MODE` · `mode.d.ts`
- `INSPECTION_REASONS` · `interface-protocol.d.ts`
- `InspectionAsked` · `interface-protocol.d.ts`
- `InspectionMode` · `interface-protocol.d.ts`
- `InspectionNow` · `interface-protocol.d.ts`
- `InspectionReason` · `interface-protocol.d.ts`
- `InspectionResult` · `interface-protocol.d.ts`
- `InterfaceProtocol` · `interface-protocol.d.ts`
- `LayerSeen` · `interface-protocol.d.ts`
- `MODE_BOUNDS` · `mode.d.ts`
- `PART_ROLES` · `interface-protocol.d.ts`
- `PartSeen` · `interface-protocol.d.ts`
- `SIZE_TIERS` · `interface-protocol.d.ts`
- `SeenResult` · `interface-protocol.d.ts`
- `Structure` · `interface-protocol.d.ts`
- `THEMES` · `interface-protocol.d.ts`
- `Until` · `interface-protocol.d.ts`
- `interfaceProtocol` · `interface-protocol.d.ts`
- `modeOf` · `mode.d.ts`

## 声明文件 `index.d.ts`

```ts
export { INSPECTION_REASONS, PART_ROLES, SIZE_TIERS, THEMES, interfaceProtocol, type InspectionAsked, type InspectionMode, type InspectionNow, type InspectionReason, type InspectionResult, type InterfaceProtocol, type LayerSeen, type PartSeen, type SeenResult, type Structure, type Until, } from './interface-protocol.ts';
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
export declare const PART_ROLES: readonly [
    'dialog',
    'alertdialog',
    'alert',
    'status',
    'menu'
];
declare const partSeen: {
    readonly kind: 'object';
    readonly fields: {
        readonly part: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly text: {
            rule: {
                readonly kind: 'string';
            };
        };
        readonly box: {
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
                    readonly w: {
                        rule: {
                            readonly kind: 'count';
                        };
                    };
                    readonly h: {
                        rule: {
                            readonly kind: 'count';
                        };
                    };
                };
            };
        };
        readonly visible: {
            rule: {
                readonly kind: 'boolean';
            };
        };
        readonly within: {
            rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'count';
                    },
                    {
                        readonly kind: 'null';
                    }
                ];
            };
        };
    };
};
declare const layerSeen: {
    readonly kind: 'object';
    readonly fields: {
        readonly role: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "dialog",
                    "alertdialog",
                    "alert",
                    "status",
                    "menu"
                ];
            };
        };
        readonly label: {
            rule: {
                readonly kind: 'string';
            };
        };
        readonly text: {
            rule: {
                readonly kind: 'string';
            };
        };
    };
};
declare const structure: {
    readonly kind: 'object';
    readonly fields: {
        readonly page: {
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
        readonly width: {
            rule: {
                readonly kind: 'count';
            };
        };
        readonly height: {
            rule: {
                readonly kind: 'count';
            };
        };
        readonly parts: {
            rule: {
                readonly kind: 'array';
                readonly item: {
                    readonly kind: 'object';
                    readonly fields: {
                        readonly part: {
                            rule: {
                                readonly kind: 'text';
                            };
                        };
                        readonly text: {
                            rule: {
                                readonly kind: 'string';
                            };
                        };
                        readonly box: {
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
                                    readonly w: {
                                        rule: {
                                            readonly kind: 'count';
                                        };
                                    };
                                    readonly h: {
                                        rule: {
                                            readonly kind: 'count';
                                        };
                                    };
                                };
                            };
                        };
                        readonly visible: {
                            rule: {
                                readonly kind: 'boolean';
                            };
                        };
                        readonly within: {
                            rule: {
                                readonly kind: 'one-of';
                                readonly rules: readonly [
                                    {
                                        readonly kind: 'count';
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
        readonly layers: {
            rule: {
                readonly kind: 'array';
                readonly item: {
                    readonly kind: 'object';
                    readonly fields: {
                        readonly role: {
                            rule: {
                                readonly kind: 'literal';
                                readonly values: readonly [
                                    "dialog",
                                    "alertdialog",
                                    "alert",
                                    "status",
                                    "menu"
                                ];
                            };
                        };
                        readonly label: {
                            rule: {
                                readonly kind: 'string';
                            };
                        };
                        readonly text: {
                            rule: {
                                readonly kind: 'string';
                            };
                        };
                    };
                };
            };
        };
        readonly more: {
            rule: {
                readonly kind: 'count';
            };
        };
    };
};
declare const until: {
    readonly kind: 'object';
    readonly fields: {
        readonly part: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly text: {
            readonly rule: {
                readonly kind: 'text';
            };
            readonly optional: true;
        };
        readonly seconds: {
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
        readonly part: {
            readonly rule: {
                readonly kind: 'text';
            };
            readonly optional: true;
            readonly since: 2;
        };
        readonly until: {
            readonly rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly part: {
                        rule: {
                            readonly kind: 'text';
                        };
                    };
                    readonly text: {
                        readonly rule: {
                            readonly kind: 'text';
                        };
                        readonly optional: true;
                    };
                    readonly seconds: {
                        rule: {
                            readonly kind: 'positive-integer';
                        };
                    };
                };
            };
            readonly optional: true;
            readonly since: 2;
        };
    };
};
declare const now: {
    readonly kind: 'object';
    readonly fields: {
        readonly request: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly want: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "structure",
                    "image"
                ];
            };
        };
        readonly part: {
            readonly rule: {
                readonly kind: 'text';
            };
            readonly optional: true;
        };
        readonly until: {
            readonly rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly part: {
                        rule: {
                            readonly kind: 'text';
                        };
                    };
                    readonly text: {
                        readonly rule: {
                            readonly kind: 'text';
                        };
                        readonly optional: true;
                    };
                    readonly seconds: {
                        rule: {
                            readonly kind: 'positive-integer';
                        };
                    };
                };
            };
            readonly optional: true;
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
                readonly structure: {
                    readonly rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly page: {
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
                            readonly width: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                            readonly height: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                            readonly parts: {
                                rule: {
                                    readonly kind: 'array';
                                    readonly item: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly part: {
                                                rule: {
                                                    readonly kind: 'text';
                                                };
                                            };
                                            readonly text: {
                                                rule: {
                                                    readonly kind: 'string';
                                                };
                                            };
                                            readonly box: {
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
                                                        readonly w: {
                                                            rule: {
                                                                readonly kind: 'count';
                                                            };
                                                        };
                                                        readonly h: {
                                                            rule: {
                                                                readonly kind: 'count';
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                            readonly visible: {
                                                rule: {
                                                    readonly kind: 'boolean';
                                                };
                                            };
                                            readonly within: {
                                                rule: {
                                                    readonly kind: 'one-of';
                                                    readonly rules: readonly [
                                                        {
                                                            readonly kind: 'count';
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
                            readonly layers: {
                                rule: {
                                    readonly kind: 'array';
                                    readonly item: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly role: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "dialog",
                                                        "alertdialog",
                                                        "alert",
                                                        "status",
                                                        "menu"
                                                    ];
                                                };
                                            };
                                            readonly label: {
                                                rule: {
                                                    readonly kind: 'string';
                                                };
                                            };
                                            readonly text: {
                                                rule: {
                                                    readonly kind: 'string';
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly more: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                        };
                    };
                    readonly optional: true;
                    readonly since: 2;
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
declare const seen: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "structure"
                        ];
                    };
                };
                readonly structure: {
                    rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly page: {
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
                            readonly width: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                            readonly height: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                            readonly parts: {
                                rule: {
                                    readonly kind: 'array';
                                    readonly item: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly part: {
                                                rule: {
                                                    readonly kind: 'text';
                                                };
                                            };
                                            readonly text: {
                                                rule: {
                                                    readonly kind: 'string';
                                                };
                                            };
                                            readonly box: {
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
                                                        readonly w: {
                                                            rule: {
                                                                readonly kind: 'count';
                                                            };
                                                        };
                                                        readonly h: {
                                                            rule: {
                                                                readonly kind: 'count';
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                            readonly visible: {
                                                rule: {
                                                    readonly kind: 'boolean';
                                                };
                                            };
                                            readonly within: {
                                                rule: {
                                                    readonly kind: 'one-of';
                                                    readonly rules: readonly [
                                                        {
                                                            readonly kind: 'count';
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
                            readonly layers: {
                                rule: {
                                    readonly kind: 'array';
                                    readonly item: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly role: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "dialog",
                                                        "alertdialog",
                                                        "alert",
                                                        "status",
                                                        "menu"
                                                    ];
                                                };
                                            };
                                            readonly label: {
                                                rule: {
                                                    readonly kind: 'string';
                                                };
                                            };
                                            readonly text: {
                                                rule: {
                                                    readonly kind: 'string';
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly more: {
                                rule: {
                                    readonly kind: 'count';
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
                readonly structure: {
                    readonly rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly page: {
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
                            readonly width: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                            readonly height: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                            readonly parts: {
                                rule: {
                                    readonly kind: 'array';
                                    readonly item: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly part: {
                                                rule: {
                                                    readonly kind: 'text';
                                                };
                                            };
                                            readonly text: {
                                                rule: {
                                                    readonly kind: 'string';
                                                };
                                            };
                                            readonly box: {
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
                                                        readonly w: {
                                                            rule: {
                                                                readonly kind: 'count';
                                                            };
                                                        };
                                                        readonly h: {
                                                            rule: {
                                                                readonly kind: 'count';
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                            readonly visible: {
                                                rule: {
                                                    readonly kind: 'boolean';
                                                };
                                            };
                                            readonly within: {
                                                rule: {
                                                    readonly kind: 'one-of';
                                                    readonly rules: readonly [
                                                        {
                                                            readonly kind: 'count';
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
                            readonly layers: {
                                rule: {
                                    readonly kind: 'array';
                                    readonly item: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly role: {
                                                rule: {
                                                    readonly kind: 'literal';
                                                    readonly values: readonly [
                                                        "dialog",
                                                        "alertdialog",
                                                        "alert",
                                                        "status",
                                                        "menu"
                                                    ];
                                                };
                                            };
                                            readonly label: {
                                                rule: {
                                                    readonly kind: 'string';
                                                };
                                            };
                                            readonly text: {
                                                rule: {
                                                    readonly kind: 'string';
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly more: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                        };
                    };
                    readonly optional: true;
                    readonly since: 2;
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
                    readonly structure?: {
                        readonly height: number;
                        readonly layers: readonly {
                            readonly label: string;
                            readonly role: "alert" | "alertdialog" | "dialog" | "menu" | "status";
                            readonly text: string;
                        }[];
                        readonly more: number;
                        readonly page: string | null;
                        readonly parts: readonly {
                            readonly box: {
                                readonly h: number;
                                readonly w: number;
                                readonly x: number;
                                readonly y: number;
                            };
                            readonly part: string;
                            readonly text: string;
                            readonly visible: boolean;
                            readonly within: number | null;
                        }[];
                        readonly width: number;
                    };
                    readonly width: number;
                } | {
                    readonly kind: "cannot";
                    readonly reason: "bad-mode" | "no-page" | "no-skin" | "not-settled" | "unsupported";
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'deliver-seen': {
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
            readonly since: 2;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly client: string;
                readonly met: boolean;
                readonly request: string;
                readonly result: {
                    readonly bytes: Uint8Array<ArrayBufferLike>;
                    readonly height: number;
                    readonly kind: "image";
                    readonly structure?: {
                        readonly height: number;
                        readonly layers: readonly {
                            readonly label: string;
                            readonly role: "alert" | "alertdialog" | "dialog" | "menu" | "status";
                            readonly text: string;
                        }[];
                        readonly more: number;
                        readonly page: string | null;
                        readonly parts: readonly {
                            readonly box: {
                                readonly h: number;
                                readonly w: number;
                                readonly x: number;
                                readonly y: number;
                            };
                            readonly part: string;
                            readonly text: string;
                            readonly visible: boolean;
                            readonly within: number | null;
                        }[];
                        readonly width: number;
                    };
                    readonly width: number;
                } | {
                    readonly kind: "cannot";
                    readonly reason: "bad-mode" | "no-page" | "no-skin" | "not-settled" | "unsupported";
                } | {
                    readonly kind: "structure";
                    readonly structure: {
                        readonly height: number;
                        readonly layers: readonly {
                            readonly label: string;
                            readonly role: "alert" | "alertdialog" | "dialog" | "menu" | "status";
                            readonly text: string;
                        }[];
                        readonly more: number;
                        readonly page: string | null;
                        readonly parts: readonly {
                            readonly box: {
                                readonly h: number;
                                readonly w: number;
                                readonly x: number;
                                readonly y: number;
                            };
                            readonly part: string;
                            readonly text: string;
                            readonly visible: boolean;
                            readonly within: number | null;
                        }[];
                        readonly width: number;
                    };
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
                readonly part?: string;
                readonly request: string;
                readonly subject?: string;
                readonly until?: {
                    readonly part: string;
                    readonly seconds: number;
                    readonly text?: string;
                };
            }>;
            readonly ends: readonly [
            ];
        };
        readonly 'observe-now': {
            readonly identity: "login";
            readonly since: 2;
            readonly open: import("@omne-harness/public-contract").Codec<{
                readonly client: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly frame: import("@omne-harness/public-contract").Codec<{
                readonly part?: string;
                readonly request: string;
                readonly until?: {
                    readonly part: string;
                    readonly seconds: number;
                    readonly text?: string;
                };
                readonly want: "image" | "structure";
            }>;
            readonly ends: readonly [
            ];
        };
    };
};
export type InterfaceProtocol = typeof interfaceProtocol;
export type InspectionMode = RuleValue<typeof mode>;
export type InspectionAsked = RuleValue<typeof asked>;
export type InspectionNow = RuleValue<typeof now>;
export type InspectionResult = RuleValue<typeof result>;
export type SeenResult = RuleValue<typeof seen>;
export type Structure = RuleValue<typeof structure>;
export type PartSeen = RuleValue<typeof partSeen>;
export type LayerSeen = RuleValue<typeof layerSeen>;
export type Until = RuleValue<typeof until>;
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
