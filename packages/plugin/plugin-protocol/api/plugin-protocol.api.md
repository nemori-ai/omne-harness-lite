# @omne-harness/plugin-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `DataMember` · `manifest.d.ts`
- `DirectoryMember` · `manifest.d.ts`
- `FILE_SUFFIXES` · `package.d.ts`
- `JsonValue` · `manifest.d.ts`
- `MANIFEST_FILE` · `manifest.d.ts`
- `MANIFEST_SCHEMA` · `manifest.d.ts`
- `ManifestRead` · `manifest.d.ts`
- `Member` · `manifest.d.ts`
- `MemberPlace` · `manifest.d.ts`
- `ModuleMember` · `manifest.d.ts`
- `Offered` · `wanted.d.ts`
- `PackageFile` · `package.d.ts`
- `PackageJudgment` · `package.d.ts`
- `PlacedMember` · `package.d.ts`
- `PluginManifest` · `manifest.d.ts`
- `PluginProtocol` · `plugin-protocol.d.ts`
- `ReportedPoint` · `plugin-protocol.d.ts`
- `ReportedPointContract` · `plugin-protocol.d.ts`
- `Side` · `manifest.d.ts`
- `SideEffect` · `side-state.d.ts`
- `SideEvent` · `side-state.d.ts`
- `SideName` · `manifest.d.ts`
- `SideState` · `side-state.d.ts`
- `SideStep` · `side-state.d.ts`
- `UNWANTED` · `side-state.d.ts`
- `Wanted` · `wanted.d.ts`
- `insidePackage` · `manifest.d.ts`
- `judgePackage` · `package.d.ts`
- `memberDigest` · `package.d.ts`
- `memberKind` · `manifest.d.ts`
- `membersOf` · `package.d.ts`
- `pluginProtocol` · `plugin-protocol.d.ts`
- `readManifest` · `manifest.d.ts`
- `stepSide` · `side-state.d.ts`
- `wantedOf` · `wanted.d.ts`

## 声明文件 `index.d.ts`

```ts
export { MANIFEST_FILE, MANIFEST_SCHEMA, insidePackage, memberKind, readManifest, type DataMember, type DirectoryMember, type JsonValue, type ManifestRead, type Member, type MemberPlace, type ModuleMember, type PluginManifest, type Side, type SideName, } from './manifest.ts';
export { FILE_SUFFIXES, judgePackage, memberDigest, membersOf, type PackageFile, type PackageJudgment, type PlacedMember, } from './package.ts';
export { pluginProtocol, type PluginProtocol, type ReportedPoint, type ReportedPointContract, } from './plugin-protocol.ts';
export { UNWANTED, stepSide, type SideEffect, type SideEvent, type SideState, type SideStep, } from './side-state.ts';
export { wantedOf, type Offered, type Wanted } from './wanted.ts';
```

## 声明文件 `manifest.d.ts`

```ts
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | Readonly<{
    [key: string]: JsonValue;
}>;
export declare const MANIFEST_FILE = "plugin.json";
export declare const MANIFEST_SCHEMA = 1;
export type MemberPlace = Readonly<{
    point: string;
    key: string;
    id?: string;
    rank?: number;
}>;
export type DataMember = MemberPlace & Readonly<{
    data: JsonValue;
}>;
export type DirectoryMember = MemberPlace & Readonly<{
    directory: string;
}>;
export type ModuleMember = MemberPlace & Readonly<{
    module: string;
    export: string;
}>;
export type Member = DataMember | DirectoryMember | ModuleMember;
export type SideName = 'client' | 'server';
export type Side = Readonly<{
    needs?: readonly string[];
    members: readonly Member[];
}>;
export type PluginManifest = Readonly<{
    schema: typeof MANIFEST_SCHEMA;
    name: string;
    summary: string;
    client?: Side;
    server?: Side;
}>;
export type ManifestRead = Readonly<{
    kind: 'read';
    manifest: PluginManifest;
    unread: readonly string[];
}> | Readonly<{
    kind: 'refused';
    reason: string;
}>;
declare const WAYS: readonly [
    'data',
    'directory',
    'module'
];
export declare function insidePackage(path: string): boolean;
export declare function memberKind(member: Member): (typeof WAYS)[number];
export declare function readManifest(text: string): ManifestRead;
export {};
```

## 声明文件 `package.d.ts`

```ts
import { type Member, type PluginManifest, type SideName } from './manifest.ts';
export declare const FILE_SUFFIXES: readonly [
    '.js',
    '.css',
    '.json'
];
export type PackageFile = Readonly<{
    path: string;
    digest: string;
}>;
export type PackageJudgment = Readonly<{
    ok: true;
}> | Readonly<{
    ok: false;
    reason: string;
}>;
export type PlacedMember = Readonly<{
    at: string;
    side: SideName;
    member: Member;
}>;
export declare const membersOf: (manifest: PluginManifest) => readonly PlacedMember[];
export declare function judgePackage(manifest: PluginManifest, files: readonly PackageFile[]): PackageJudgment;
export declare function memberDigest(member: Member, files: readonly PackageFile[]): string;
```

## 声明文件 `plugin-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const point: {
    readonly kind: 'object';
    readonly fields: {
        readonly name: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly summary: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly contract: {
            readonly rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly arity: {
                        rule: {
                            readonly kind: 'literal';
                            readonly values: readonly [
                                "one",
                                "list",
                                "keyed-one",
                                "keyed-list"
                            ];
                        };
                    };
                    readonly keyFrom: {
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
                    readonly key: {
                        rule: {
                            readonly kind: 'text';
                        };
                    };
                    readonly gives: {
                        rule: {
                            readonly kind: 'text';
                        };
                    };
                    readonly item: {
                        rule: {
                            readonly kind: 'object';
                            readonly fields: {
                                readonly kind: {
                                    rule: {
                                        readonly kind: 'literal';
                                        readonly values: readonly [
                                            "data",
                                            "pure",
                                            "effect"
                                        ];
                                    };
                                };
                                readonly fields: {
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
                                                readonly kind: {
                                                    rule: {
                                                        readonly kind: 'literal';
                                                        readonly values: readonly [
                                                            "string",
                                                            "number",
                                                            "boolean",
                                                            "function",
                                                            "object",
                                                            "array"
                                                        ];
                                                    };
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly resolve: {
                        rule: {
                            readonly kind: 'literal';
                            readonly values: readonly [
                                "conflict",
                                "most-specific"
                            ];
                        };
                    };
                    readonly binding: {
                        rule: {
                            readonly kind: 'literal';
                            readonly values: readonly [
                                "build",
                                "run"
                            ];
                        };
                    };
                    readonly onError: {
                        rule: {
                            readonly kind: 'text';
                        };
                    };
                    readonly version: {
                        rule: {
                            readonly kind: 'count';
                        };
                    };
                    readonly revision: {
                        rule: {
                            readonly kind: 'count';
                        };
                    };
                    readonly example: {
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
            };
            readonly optional: true;
            readonly since: 2;
        };
        readonly dataKeys: {
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
                        readonly now: {
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
                };
            };
            readonly optional: true;
            readonly since: 2;
        };
    };
};
export declare const pluginProtocol: {
    readonly operations: {
        readonly 'list-wanted': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly plugins: readonly {
                        readonly files: readonly {
                            readonly bytes: number;
                            readonly digest: string;
                            readonly path: string;
                        }[];
                        readonly manifest: string;
                        readonly name: string;
                        readonly version: string;
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
                readonly side: "client" | "server";
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'read-file': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly bytes: number;
                    readonly next: number | null;
                    readonly part: Uint8Array<ArrayBufferLike>;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{
                    readonly reason: "file" | "plugin";
                }>;
                readonly limited: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly limit: number;
                readonly name: string;
                readonly offset: number;
                readonly path: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly version: string;
            }>;
        };
        readonly 'report-loaded': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly countsAsAccess: true;
            readonly effect: "commit";
            readonly limit: "input";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly client: string;
                readonly parts: readonly {
                    readonly depths: readonly ("render" | "style" | "tokens")[];
                    readonly label: string;
                    readonly name: string;
                    readonly summary: string;
                    readonly within: string | null;
                }[];
                readonly plugins: readonly {
                    readonly name: string;
                    readonly reason: string | null;
                    readonly state: "failed" | "held" | "loaded";
                    readonly version: string;
                }[];
                readonly points: readonly {
                    readonly contract?: {
                        readonly arity: "keyed-list" | "keyed-one" | "list" | "one";
                        readonly binding: "build" | "run";
                        readonly example: string | null;
                        readonly gives: string;
                        readonly item: {
                            readonly fields: readonly {
                                readonly kind: "array" | "boolean" | "function" | "number" | "object" | "string";
                                readonly name: string;
                            }[];
                            readonly kind: "data" | "effect" | "pure";
                        };
                        readonly key: string;
                        readonly keyFrom: string | null;
                        readonly onError: string;
                        readonly resolve: "conflict" | "most-specific";
                        readonly revision: number;
                        readonly version: number;
                    };
                    readonly dataKeys?: readonly {
                        readonly name: string;
                        readonly now: string | null;
                    }[];
                    readonly name: string;
                    readonly summary: string;
                }[];
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'list-reports': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly clients: readonly {
                        readonly client: string;
                        readonly parts: readonly {
                            readonly depths: readonly ("render" | "style" | "tokens")[];
                            readonly label: string;
                            readonly name: string;
                            readonly summary: string;
                            readonly within: string | null;
                        }[];
                        readonly plugins: readonly {
                            readonly name: string;
                            readonly reason: string | null;
                            readonly state: "failed" | "held" | "loaded";
                            readonly version: string;
                        }[];
                        readonly points: readonly {
                            readonly contract?: {
                                readonly arity: "keyed-list" | "keyed-one" | "list" | "one";
                                readonly binding: "build" | "run";
                                readonly example: string | null;
                                readonly gives: string;
                                readonly item: {
                                    readonly fields: readonly {
                                        readonly kind: "array" | "boolean" | "function" | "number" | "object" | "string";
                                        readonly name: string;
                                    }[];
                                    readonly kind: "data" | "effect" | "pure";
                                };
                                readonly key: string;
                                readonly keyFrom: string | null;
                                readonly onError: string;
                                readonly resolve: "conflict" | "most-specific";
                                readonly revision: number;
                                readonly version: number;
                            };
                            readonly dataKeys?: readonly {
                                readonly name: string;
                                readonly now: string | null;
                            }[];
                            readonly name: string;
                            readonly summary: string;
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
    };
    readonly name: "plugin";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-wanted': {
            readonly identity: "login";
            readonly open: import("@omne-harness/public-contract").Codec<{
                readonly client: string;
                readonly side: "client" | "server";
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
export type PluginProtocol = typeof pluginProtocol;
export type ReportedPoint = RuleValue<typeof point>;
export type ReportedPointContract = NonNullable<ReportedPoint['contract']>;
export {};
```

## 声明文件 `side-state.d.ts`

```ts
export type SideState = Readonly<{
    kind: 'unwanted';
}> | Readonly<{
    kind: 'loading';
    version: string;
    next: 'keep' | 'unload' | Readonly<{
        load: string;
    }>;
    over?: string;
}> | Readonly<{
    kind: 'loaded';
    version: string;
}> | Readonly<{
    kind: 'failed';
    version: string;
    reason: string;
}> | Readonly<{
    kind: 'held';
    version: string;
}>;
export type SideEvent = Readonly<{
    kind: 'listed';
    version: string;
}> | Readonly<{
    kind: 'unlisted';
}> | Readonly<{
    kind: 'restarted';
}> | Readonly<{
    kind: 'done';
}> | Readonly<{
    kind: 'broke';
    reason: string;
}> | Readonly<{
    kind: 'held';
}>;
export type SideEffect = Readonly<{
    kind: 'load';
    version: string;
}> | Readonly<{
    kind: 'unload';
    version: string;
}>;
export type SideStep = Readonly<{
    state: SideState;
    effects: readonly SideEffect[];
}>;
export declare const UNWANTED: SideState;
export declare function stepSide(state: SideState, event: SideEvent): SideStep;
```

## 声明文件 `wanted.d.ts`

```ts
import type { Member, PluginManifest, SideName } from './manifest.ts';
import type { PackageFile } from './package.ts';
export type Offered = Readonly<{
    version: string;
    manifest: PluginManifest;
    files: readonly PackageFile[];
}>;
export type Wanted = Readonly<{
    name: string;
    version: string;
    members: readonly Member[];
    needs: readonly string[];
    files: readonly PackageFile[];
}>;
export declare function wantedOf(offered: readonly Offered[], side: SideName): readonly Wanted[];
```
