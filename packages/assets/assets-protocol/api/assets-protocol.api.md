# @omne-harness/assets-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AssetContentView` · `assets-protocol.d.ts`
- `AssetRequest` · `assets-protocol.d.ts`
- `AssetRowView` · `assets-protocol.d.ts`
- `AssetStandingView` · `assets-protocol.d.ts`
- `AssetsProtocol` · `assets-protocol.d.ts`
- `CategoryView` · `assets-protocol.d.ts`
- `CreationDetail` · `assets-protocol.d.ts`
- `SettingInput` · `assets-protocol.d.ts`
- `SettingView` · `assets-protocol.d.ts`
- `assetsProtocol` · `assets-protocol.d.ts`

## 声明文件 `assets-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const categoryView: {
    readonly kind: 'object';
    readonly fields: {
        readonly category: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly title: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly summary: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly creation: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "none",
                    "data",
                    "directory"
                ];
            };
        };
    };
};
declare const creationDetail: {
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
                            "data"
                        ];
                    };
                };
                readonly schema: {
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
                            "directory"
                        ];
                    };
                };
                readonly limits: {
                    rule: {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly files: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                            readonly fileBytes: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                            readonly totalBytes: {
                                rule: {
                                    readonly kind: 'count';
                                };
                            };
                        };
                    };
                };
            };
        }
    ];
};
declare const assetRow: {
    readonly kind: 'object';
    readonly fields: {
        readonly category: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly name: {
            readonly rule: {
                readonly kind: 'text';
            };
        };
        readonly version: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly selection: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "follow",
                    "pinned"
                ];
            };
        };
        readonly enabled: {
            rule: {
                readonly kind: 'boolean';
            };
        };
        readonly holding: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly origin: {
            rule: {
                readonly kind: 'literal';
                readonly values: readonly [
                    "customized",
                    "official"
                ];
            };
        };
        readonly summary: {
            rule: {
                readonly kind: 'one-of';
                readonly rules: readonly [
                    {
                        readonly kind: 'object';
                        readonly fields: {
                            readonly title: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly description: {
                                rule: {
                                    readonly kind: 'string';
                                };
                            };
                            readonly facts: {
                                readonly rule: {
                                    readonly kind: "array";
                                    readonly item: {
                                        readonly kind: 'object';
                                        readonly fields: {
                                            readonly name: {
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
                                    readonly max: 8;
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
        readonly from: {
            readonly rule: {
                readonly kind: 'text';
            };
            readonly optional: true;
            readonly since: 2;
        };
    };
};
declare const assetContent: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "data"
                        ];
                    };
                };
                readonly body: {
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
                            "directory"
                        ];
                    };
                };
                readonly entries: {
                    rule: {
                        readonly kind: 'array';
                        readonly item: {
                            readonly kind: 'object';
                            readonly fields: {
                                readonly path: {
                                    rule: {
                                        readonly kind: 'text';
                                    };
                                };
                                readonly bytes: {
                                    rule: {
                                        readonly kind: 'count';
                                    };
                                };
                            };
                        };
                    };
                };
            };
        }
    ];
};
declare const standing: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "selected"
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
                            "filtered"
                        ];
                    };
                };
                readonly reason: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "disabled",
                            "ineligible",
                            "blocked"
                        ];
                    };
                };
                readonly by: {
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
                            "unavailable"
                        ];
                    };
                };
                readonly layer: {
                    rule: {
                        readonly kind: 'text';
                    };
                };
            };
        }
    ];
};
declare const assetRequest: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly category: {
                    readonly rule: {
                        readonly kind: 'text';
                    };
                };
                readonly name: {
                    readonly rule: {
                        readonly kind: 'text';
                    };
                };
                readonly body: {
                    readonly rule: {
                        readonly kind: 'json';
                    };
                };
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "create-asset"
                        ];
                    };
                };
            };
        },
        {
            readonly kind: 'object';
            readonly fields: {
                readonly category: {
                    readonly rule: {
                        readonly kind: 'text';
                    };
                };
                readonly name: {
                    readonly rule: {
                        readonly kind: 'text';
                    };
                };
                readonly manifest: {
                    readonly rule: {
                        readonly kind: 'array';
                        readonly item: {
                            readonly kind: 'object';
                            readonly fields: {
                                readonly path: {
                                    rule: {
                                        readonly kind: 'text';
                                    };
                                };
                                readonly bytes: {
                                    rule: {
                                        readonly kind: 'count';
                                    };
                                };
                            };
                        };
                    };
                };
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "begin-asset-upload"
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
                            "commit-asset-upload"
                        ];
                    };
                };
            };
        },
        {
            readonly kind: 'object';
            readonly fields: {
                readonly holding: {
                    readonly rule: {
                        readonly kind: 'text';
                    };
                };
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "set-asset-enabled"
                        ];
                    };
                };
                readonly enabled: {
                    rule: {
                        readonly kind: 'boolean';
                    };
                };
            };
        },
        {
            readonly kind: 'object';
            readonly fields: {
                readonly holding: {
                    readonly rule: {
                        readonly kind: 'text';
                    };
                };
                readonly kind: {
                    rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            "remove-asset"
                        ];
                    };
                };
            };
        }
    ];
};
declare const settingView: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly owner: {
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
                                                "asset"
                                            ];
                                        };
                                    };
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
                            },
                            {
                                readonly kind: 'object';
                                readonly fields: {
                                    readonly kind: {
                                        readonly rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "independent"
                                            ];
                                        };
                                    };
                                    readonly providerId: {
                                        readonly rule: {
                                            readonly kind: 'text';
                                        };
                                    };
                                    readonly definitionId: {
                                        readonly rule: {
                                            readonly kind: 'text';
                                        };
                                    };
                                };
                            }
                        ];
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
                            readonly group: {
                                rule: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly id: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                        readonly title: {
                                            rule: {
                                                readonly kind: 'string';
                                            };
                                        };
                                        readonly description: {
                                            rule: {
                                                readonly kind: 'string';
                                            };
                                        };
                                    };
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
                readonly owner: {
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
                                                "asset"
                                            ];
                                        };
                                    };
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
                            },
                            {
                                readonly kind: 'object';
                                readonly fields: {
                                    readonly kind: {
                                        readonly rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "independent"
                                            ];
                                        };
                                    };
                                    readonly providerId: {
                                        readonly rule: {
                                            readonly kind: 'text';
                                        };
                                    };
                                    readonly definitionId: {
                                        readonly rule: {
                                            readonly kind: 'text';
                                        };
                                    };
                                };
                            }
                        ];
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
                            readonly group: {
                                rule: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly id: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                        readonly title: {
                                            rule: {
                                                readonly kind: 'string';
                                            };
                                        };
                                        readonly description: {
                                            rule: {
                                                readonly kind: 'string';
                                            };
                                        };
                                    };
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
                readonly owner: {
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
                                                "asset"
                                            ];
                                        };
                                    };
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
                            },
                            {
                                readonly kind: 'object';
                                readonly fields: {
                                    readonly kind: {
                                        readonly rule: {
                                            readonly kind: 'literal';
                                            readonly values: readonly [
                                                "independent"
                                            ];
                                        };
                                    };
                                    readonly providerId: {
                                        readonly rule: {
                                            readonly kind: 'text';
                                        };
                                    };
                                    readonly definitionId: {
                                        readonly rule: {
                                            readonly kind: 'text';
                                        };
                                    };
                                };
                            }
                        ];
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
                            readonly group: {
                                rule: {
                                    readonly kind: 'object';
                                    readonly fields: {
                                        readonly id: {
                                            rule: {
                                                readonly kind: 'text';
                                            };
                                        };
                                        readonly title: {
                                            rule: {
                                                readonly kind: 'string';
                                            };
                                        };
                                        readonly description: {
                                            rule: {
                                                readonly kind: 'string';
                                            };
                                        };
                                    };
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
export type CategoryView = RuleValue<typeof categoryView>;
export type CreationDetail = RuleValue<typeof creationDetail>;
export type AssetRowView = RuleValue<typeof assetRow>;
export type AssetContentView = RuleValue<typeof assetContent>;
export type AssetStandingView = RuleValue<typeof standing>;
export type AssetRequest = RuleValue<typeof assetRequest>;
export declare const assetsProtocol: {
    readonly operations: {
        readonly 'list-settings': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete" | "partial";
                    readonly items: readonly ({
                        readonly declaration: {
                            readonly appliesAt: string;
                            readonly clearEffect: string;
                            readonly group: {
                                readonly description: string;
                                readonly id: string;
                                readonly title: string;
                            };
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
                        readonly owner: {
                            readonly definitionId: string;
                            readonly kind: "independent";
                            readonly providerId: string;
                        } | {
                            readonly category: string;
                            readonly kind: "asset";
                            readonly name: string;
                        };
                        readonly revision: string;
                        readonly valueSchema: import("@omne-harness/json-text").JsonValue;
                    } | {
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
                            readonly group: {
                                readonly description: string;
                                readonly id: string;
                                readonly title: string;
                            };
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
                        readonly owner: {
                            readonly definitionId: string;
                            readonly kind: "independent";
                            readonly providerId: string;
                        } | {
                            readonly category: string;
                            readonly kind: "asset";
                            readonly name: string;
                        };
                        readonly revision: string;
                    } | {
                        readonly declaration: {
                            readonly appliesAt: string;
                            readonly clearEffect: string;
                            readonly group: {
                                readonly description: string;
                                readonly id: string;
                                readonly title: string;
                            };
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
                        readonly owner: {
                            readonly definitionId: string;
                            readonly kind: "independent";
                            readonly providerId: string;
                        } | {
                            readonly category: string;
                            readonly kind: "asset";
                            readonly name: string;
                        };
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
                readonly limit: number;
                readonly scope: {
                    readonly asset?: {
                        readonly category?: string;
                        readonly name: string;
                    };
                    readonly kind: "asset";
                } | {
                    readonly kind: "independent";
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'describe-setting': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly item: {
                        readonly declaration: {
                            readonly appliesAt: string;
                            readonly clearEffect: string;
                            readonly group: {
                                readonly description: string;
                                readonly id: string;
                                readonly title: string;
                            };
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
                        readonly owner: {
                            readonly definitionId: string;
                            readonly kind: "independent";
                            readonly providerId: string;
                        } | {
                            readonly category: string;
                            readonly kind: "asset";
                            readonly name: string;
                        };
                        readonly revision: string;
                        readonly valueSchema: import("@omne-harness/json-text").JsonValue;
                    } | {
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
                            readonly group: {
                                readonly description: string;
                                readonly id: string;
                                readonly title: string;
                            };
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
                        readonly owner: {
                            readonly definitionId: string;
                            readonly kind: "independent";
                            readonly providerId: string;
                        } | {
                            readonly category: string;
                            readonly kind: "asset";
                            readonly name: string;
                        };
                        readonly revision: string;
                    } | {
                        readonly declaration: {
                            readonly appliesAt: string;
                            readonly clearEffect: string;
                            readonly group: {
                                readonly description: string;
                                readonly id: string;
                                readonly title: string;
                            };
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
                        readonly owner: {
                            readonly definitionId: string;
                            readonly kind: "independent";
                            readonly providerId: string;
                        } | {
                            readonly category: string;
                            readonly kind: "asset";
                            readonly name: string;
                        };
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
                readonly item: string;
                readonly owner: {
                    readonly definitionId: string;
                    readonly kind: "independent";
                    readonly providerId: string;
                } | {
                    readonly category?: string;
                    readonly kind: "asset";
                    readonly name: string;
                };
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
                readonly expectedRevision: string;
                readonly item: string;
                readonly operation: string;
                readonly owner: {
                    readonly definitionId: string;
                    readonly kind: "independent";
                    readonly providerId: string;
                } | {
                    readonly category?: string;
                    readonly kind: "asset";
                    readonly name: string;
                };
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
                readonly expectedRevision: string;
                readonly item: string;
                readonly operation: string;
                readonly owner: {
                    readonly definitionId: string;
                    readonly kind: "independent";
                    readonly providerId: string;
                } | {
                    readonly category?: string;
                    readonly kind: "asset";
                    readonly name: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'list-categories': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly items: readonly {
                        readonly category: string;
                        readonly creation: "data" | "directory" | "none";
                        readonly summary: string;
                        readonly title: string;
                    }[];
                    readonly next: string | null;
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
                readonly limit: number;
            }>;
        };
        readonly 'describe-category': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly category: string;
                    readonly creation: {
                        readonly kind: "none";
                    } | {
                        readonly kind: "data";
                        readonly schema: import("@omne-harness/json-text").JsonValue;
                    } | {
                        readonly kind: "directory";
                        readonly limits: {
                            readonly fileBytes: number;
                            readonly files: number;
                            readonly totalBytes: number;
                        };
                    };
                    readonly hint: string | null;
                    readonly summary: string;
                    readonly title: string;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly category: string;
            }>;
        };
        readonly 'list-assets': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly completeness: "complete" | "partial";
                    readonly items: readonly {
                        readonly category: string;
                        readonly enabled: boolean;
                        readonly from?: string;
                        readonly holding: string;
                        readonly name: string;
                        readonly origin: "customized" | "official";
                        readonly selection: "follow" | "pinned";
                        readonly summary: {
                            readonly description: string;
                            readonly facts: readonly {
                                readonly name: string;
                                readonly text: string;
                            }[];
                            readonly title: string;
                        } | null;
                        readonly version: string;
                    }[];
                    readonly next: string | null;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly after: string | null;
                readonly category: string;
                readonly limit: number;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'describe-asset': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly content: {
                        readonly body: import("@omne-harness/json-text").JsonValue;
                        readonly kind: "data";
                    } | {
                        readonly entries: readonly {
                            readonly bytes: number;
                            readonly path: string;
                        }[];
                        readonly kind: "directory";
                    };
                    readonly effect?: {
                        readonly advice: string | null;
                        readonly clients: readonly {
                            readonly label: string;
                            readonly says: string;
                        }[] | null;
                        readonly disable: readonly {
                            readonly key: string;
                            readonly mark: "!" | "+" | "-" | "~";
                            readonly of: string | null;
                            readonly point: string;
                            readonly says: string;
                        }[] | null;
                        readonly places: readonly {
                            readonly category: string | null;
                            readonly key: string;
                            readonly point: string;
                            readonly says: string;
                            readonly side: "client" | "server" | null;
                            readonly standing: string;
                        }[];
                        readonly remove: readonly {
                            readonly key: string;
                            readonly mark: "!" | "+" | "-" | "~";
                            readonly of: string | null;
                            readonly point: string;
                            readonly says: string;
                        }[] | null;
                    };
                    readonly item: {
                        readonly category: string;
                        readonly enabled: boolean;
                        readonly from?: string;
                        readonly holding: string;
                        readonly name: string;
                        readonly origin: "customized" | "official";
                        readonly selection: "follow" | "pinned";
                        readonly summary: {
                            readonly description: string;
                            readonly facts: readonly {
                                readonly name: string;
                                readonly text: string;
                            }[];
                            readonly title: string;
                        } | null;
                        readonly version: string;
                    };
                    readonly revision: number;
                    readonly settings: boolean;
                    readonly standing: {
                        readonly kind: "selected";
                    } | {
                        readonly by: string | null;
                        readonly kind: "filtered";
                        readonly reason: "blocked" | "disabled" | "ineligible";
                    } | {
                        readonly kind: "unavailable";
                        readonly layer: string;
                    };
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly category: string;
                readonly name: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'create-asset': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly changed: boolean;
                    readonly holding: string;
                    readonly version: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly missing?: readonly string[];
                    readonly reason: string;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly limit: "input";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly body: import("@omne-harness/json-text").JsonValue;
                readonly category: string;
                readonly name: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'begin-asset-upload': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly partBytes: number;
                    readonly received: readonly {
                        readonly bytes: number;
                        readonly path: string;
                    }[];
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly missing?: readonly string[];
                    readonly reason: string;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly limited: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly limit: "input";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly category: string;
                readonly manifest: readonly {
                    readonly bytes: number;
                    readonly path: string;
                }[];
                readonly name: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'append-asset-upload': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly received: number;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly missing?: readonly string[];
                    readonly reason: string;
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly limit: "input";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly bytes: Uint8Array<ArrayBufferLike>;
                readonly offset: number;
                readonly path: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly upload: string;
            }>;
        };
        readonly 'commit-asset-upload': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly changed: boolean;
                    readonly holding: string;
                    readonly version: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly missing?: readonly string[];
                    readonly reason: string;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly limit: 'small';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly upload: string;
            }>;
        };
        readonly 'set-asset-enabled': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{
                    readonly broughtBy?: string;
                }>;
                readonly 'not-writable': import("@omne-harness/public-contract").Codec<{
                    readonly reason: "official" | "removed";
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly limit: 'small';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly enabled: boolean;
                readonly holding: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'remove-asset': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{
                    readonly broughtBy?: string;
                }>;
                readonly 'not-writable': import("@omne-harness/public-contract").Codec<{
                    readonly reason: "official" | "removed";
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly limit: 'small';
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly holding: string;
                readonly operation: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'query-asset-operation': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly changed: boolean;
                    readonly holding: string;
                    readonly version: string;
                } | {
                    readonly partBytes: number;
                    readonly received: readonly {
                        readonly bytes: number;
                        readonly path: string;
                    }[];
                } | {}>;
                readonly 'no-change': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-writable': import("@omne-harness/public-contract").Codec<{
                    readonly reason: "official" | "removed";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly missing?: readonly string[];
                    readonly reason: string;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{}>;
                readonly limited: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: "input";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly operation: string;
                readonly request: {
                    readonly body: import("@omne-harness/json-text").JsonValue;
                    readonly category: string;
                    readonly kind: "create-asset";
                    readonly name: string;
                } | {
                    readonly category: string;
                    readonly kind: "begin-asset-upload";
                    readonly manifest: readonly {
                        readonly bytes: number;
                        readonly path: string;
                    }[];
                    readonly name: string;
                } | {
                    readonly kind: "commit-asset-upload";
                } | {
                    readonly enabled: boolean;
                    readonly holding: string;
                    readonly kind: "set-asset-enabled";
                } | {
                    readonly holding: string;
                    readonly kind: "remove-asset";
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "assets";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-assets': {
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
export type AssetsProtocol = typeof assetsProtocol;
export {};
```

## 声明文件 `index.d.ts`

```ts
export { assetsProtocol, type AssetContentView, type AssetRequest, type AssetRowView, type AssetStandingView, type AssetsProtocol, type CategoryView, type CreationDetail, type SettingInput, type SettingView, } from './assets-protocol.ts';
```
