# @omne-harness/plugin-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `Absent` · `side-state.d.ts`
- `Bound` · `ports.d.ts`
- `DataMember` · `manifest.d.ts`
- `DirectoryMember` · `manifest.d.ts`
- `FILE_SUFFIXES` · `package.d.ts`
- `FloorPort` · `floor.d.ts`
- `FloorStanding` · `floor.d.ts`
- `IMAGE_HEAD_BYTES` · `package.d.ts`
- `IMAGE_SUFFIXES` · `package.d.ts`
- `JsonValue` · `manifest.d.ts`
- `Judgment` · `judge-member.d.ts`
- `Kept` · `loader.d.ts`
- `Listed` · `loader.d.ts`
- `Loader` · `loader.d.ts`
- `LoaderDeps` · `loader.d.ts`
- `MANIFEST_FILE` · `manifest.d.ts`
- `MANIFEST_SCHEMA` · `manifest.d.ts`
- `ManifestRead` · `manifest.d.ts`
- `Member` · `manifest.d.ts`
- `MemberPlace` · `manifest.d.ts`
- `ModuleMember` · `manifest.d.ts`
- `NO_FLOOR` · `floor.d.ts`
- `Offered` · `wanted.d.ts`
- `Outcome` · `loader.d.ts`
- `PackageFile` · `package.d.ts`
- `PackageJudgment` · `package.d.ts`
- `PlacedMember` · `package.d.ts`
- `PluginKind` · `manifest.d.ts`
- `PluginManifest` · `manifest.d.ts`
- `PluginProtocol` · `plugin-protocol.d.ts`
- `PointRules` · `judge-member.d.ts`
- `Port` · `ports.d.ts`
- `PortAnswer` · `ports.d.ts`
- `PortData` · `ports.d.ts`
- `PortFactory` · `ports.d.ts`
- `Reason` · `judge-member.d.ts`
- `ReportedPoint` · `plugin-protocol.d.ts`
- `ReportedPointContract` · `plugin-protocol.d.ts`
- `Side` · `manifest.d.ts`
- `SideEffect` · `side-state.d.ts`
- `SideEvent` · `side-state.d.ts`
- `SideName` · `manifest.d.ts`
- `SideState` · `side-state.d.ts`
- `SideStep` · `side-state.d.ts`
- `Target` · `judge-member.d.ts`
- `UNWANTED` · `side-state.d.ts`
- `Wanted` · `wanted.d.ts`
- `Way` · `judge-member.d.ts`
- `bindPorts` · `ports.d.ts`
- `createLoader` · `loader.d.ts`
- `fiberOf` · `floor.d.ts`
- `fileRefs` · `package.d.ts`
- `genericItem` · `judge-member.d.ts`
- `heldOf` · `floor.d.ts`
- `imageFault` · `package.d.ts`
- `insidePackage` · `manifest.d.ts`
- `judgeMember` · `judge-member.d.ts`
- `judgePackage` · `package.d.ts`
- `lacksText` · `side-state.d.ts`
- `memberDigest` · `package.d.ts`
- `memberKind` · `manifest.d.ts`
- `membersOf` · `package.d.ts`
- `pluginProtocol` · `plugin-protocol.d.ts`
- `readManifest` · `manifest.d.ts`
- `reasonText` · `judge-member.d.ts`
- `standingOf` · `floor.d.ts`
- `stepSide` · `side-state.d.ts`
- `wantedOf` · `wanted.d.ts`
- `wayOf` · `judge-member.d.ts`

## 声明文件 `floor.d.ts`

```ts
import type { Kept } from './loader.ts';
export type FloorPort = Readonly<{
    rise(tenant: string): Readonly<{
        want: readonly string[];
        held: boolean;
        stopped?: readonly string[];
    }>;
    want(tenant: string, fiber: string): void;
    unwant(tenant: string, fiber: string): void;
    settle(tenant: string): void;
}>;
export declare const NO_FLOOR: FloorPort;
export declare const fiberOf: (name: string, version: string) => string;
export declare function heldOf(fibers: readonly string[]): ReadonlyMap<string, string>;
export type FloorStanding = Readonly<{
    wanted: ReadonlySet<string>;
    held: ReadonlySet<string>;
    loading: boolean;
}>;
export declare function standingOf(states: ReadonlyMap<string, Kept>): FloorStanding;
```

## 声明文件 `index.d.ts`

```ts
export { MANIFEST_FILE, MANIFEST_SCHEMA, insidePackage, memberKind, readManifest, type DataMember, type DirectoryMember, type JsonValue, type ManifestRead, type Member, type MemberPlace, type ModuleMember, type PluginKind, type PluginManifest, type Side, type SideName, } from './manifest.ts';
export { FILE_SUFFIXES, IMAGE_HEAD_BYTES, IMAGE_SUFFIXES, fileRefs, imageFault, judgePackage, memberDigest, membersOf, type PackageFile, type PackageJudgment, type PlacedMember, } from './package.ts';
export { pluginProtocol, type PluginProtocol, type ReportedPoint, type ReportedPointContract, } from './plugin-protocol.ts';
export { UNWANTED, lacksText, stepSide, type Absent, type SideEffect, type SideEvent, type SideState, type SideStep, } from './side-state.ts';
export { NO_FLOOR, fiberOf, heldOf, standingOf, type FloorPort, type FloorStanding, } from './floor.ts';
export { createLoader, type Kept, type Listed, type Loader, type LoaderDeps, type Outcome, } from './loader.ts';
export { wantedOf, type Offered, type Wanted } from './wanted.ts';
export { genericItem, judgeMember, reasonText, wayOf, type Judgment, type PointRules, type Reason, type Target, type Way, } from './judge-member.ts';
export { bindPorts, type Bound, type Port, type PortAnswer, type PortData, type PortFactory, } from './ports.ts';
```

## 声明文件 `judge-member.d.ts`

```ts
import type { Member } from './manifest.ts';
import type { Absent } from './side-state.ts';
type FieldKind = 'string' | 'number' | 'boolean' | 'function' | 'object' | 'array';
export type PointRules = Readonly<{
    binding: 'build' | 'run';
    item: Readonly<{
        kind: 'data' | 'pure' | 'effect';
        fields: Readonly<Record<string, FieldKind>>;
    }>;
    scopes?: 'all' | Readonly<{
        only: 'deployment';
        why: string;
        note: string;
    }>;
}>;
export type Target = Readonly<{
    kind: 'absent';
}> | Readonly<{
    kind: 'point';
    rules: PointRules;
    form: boolean;
}> | Readonly<{
    kind: 'category';
    takes: 'data' | 'directory';
}> | Readonly<{
    kind: 'category';
    takes: 'none';
    why: string;
}>;
export type Way = 'data' | 'directory' | 'code';
export type Reason = Readonly<{
    kind: 'absent';
    absent: Absent;
}> | Readonly<{
    kind: 'closed';
    why: string;
    note: string;
}> | Readonly<{
    kind: 'fixed';
}> | Readonly<{
    kind: 'wrong-way';
    takes: Way;
    gives: Way;
}> | Readonly<{
    kind: 'threw';
    detail: string;
}> | Readonly<{
    kind: 'refused';
    detail: string;
}>;
export type Judgment = Readonly<{
    kind: 'data';
}> | Readonly<{
    kind: 'held';
    way: 'data' | 'directory';
}> | Readonly<{
    kind: 'code';
    form: 'special' | 'generic';
}> | Readonly<{
    kind: 'not';
    reason: Reason;
}>;
export declare const wayOf: (member: Member) => Way;
export declare function judgeMember(target: Target, member: Member): Judgment;
export declare function reasonText(reason: Reason): string;
export declare function genericItem(rules: PointRules, given: unknown, spot?: Readonly<{
    id?: string;
    rank?: number;
}>): Readonly<{
    item: object;
}> | Reason;
export {};
```

## 声明文件 `loader.d.ts`

```ts
import type { Member, PluginKind } from './manifest.ts';
import { type Absent, type SideState } from './side-state.ts';
export type Listed = Readonly<{
    name: string;
    version: string;
    kind?: PluginKind;
    members: readonly Member[];
    needs?: readonly string[];
    fault?: string;
}>;
export type Kept = Exclude<SideState, {
    kind: 'unwanted';
}>;
export type Outcome = Readonly<{
    kind: 'installed';
    remove: () => unknown;
}> | Readonly<{
    kind: 'failed';
    reason: string;
}> | Readonly<{
    kind: 'waiting';
    lacks: readonly Absent[];
}> | Readonly<{
    kind: 'held';
}>;
export type LoaderDeps = Readonly<{
    install: (listed: Listed) => Promise<Outcome>;
    held?: ReadonlyMap<string, string>;
}>;
export type Loader = Readonly<{
    converge(list: readonly Listed[]): void;
    states(): ReadonlyMap<string, Kept>;
    held(): ReadonlyMap<string, string>;
    appeared(name: string): void;
    watch(listener: () => void): () => void;
    idle(): Promise<void>;
    stop(): Promise<void>;
}>;
export declare function createLoader(deps: LoaderDeps): Loader;
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
export type PluginKind = 'skin';
export type Side = Readonly<{
    needs?: readonly string[];
    members: readonly Member[];
}>;
export type PluginManifest = Readonly<{
    schema: typeof MANIFEST_SCHEMA;
    name: string;
    summary: string;
    kind?: PluginKind;
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
export declare const IMAGE_SUFFIXES: readonly [
    '.png',
    '.jpg',
    '.webp',
    '.avif',
    '.svg'
];
export declare const IMAGE_HEAD_BYTES = 1024;
export declare function imageFault(path: string, head: Uint8Array): string | null;
export declare function fileRefs(value: string): readonly string[];
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
                    readonly scopes: {
                        readonly rule: {
                            readonly kind: 'object';
                            readonly fields: {
                                readonly only: {
                                    rule: {
                                        readonly kind: 'literal';
                                        readonly values: readonly [
                                            "deployment"
                                        ];
                                    };
                                };
                                readonly why: {
                                    rule: {
                                        readonly kind: 'text';
                                    };
                                };
                                readonly note: {
                                    rule: {
                                        readonly kind: 'text';
                                    };
                                };
                            };
                        };
                        readonly optional: true;
                        readonly since: 3;
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
        readonly form: {
            readonly rule: {
                readonly kind: 'object';
                readonly fields: {
                    readonly gives: {
                        rule: {
                            readonly kind: 'text';
                        };
                    };
                    readonly example: {
                        rule: {
                            readonly kind: 'text';
                        };
                    };
                };
            };
            readonly optional: true;
            readonly since: 3;
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
                readonly handed?: readonly string[];
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
                    readonly waiting?: readonly string[];
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
                        readonly scopes?: {
                            readonly note: string;
                            readonly only: "deployment";
                            readonly why: string;
                        };
                        readonly version: number;
                    };
                    readonly dataKeys?: readonly {
                        readonly name: string;
                        readonly now: string | null;
                    }[];
                    readonly form?: {
                        readonly example: string;
                        readonly gives: string;
                    };
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
                        readonly handed?: readonly string[];
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
                            readonly waiting?: readonly string[];
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
                                readonly scopes?: {
                                    readonly note: string;
                                    readonly only: "deployment";
                                    readonly why: string;
                                };
                                readonly version: number;
                            };
                            readonly dataKeys?: readonly {
                                readonly name: string;
                                readonly now: string | null;
                            }[];
                            readonly form?: {
                                readonly example: string;
                                readonly gives: string;
                            };
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

## 声明文件 `ports.d.ts`

```ts
export type PortData = null | boolean | number | string | readonly PortData[] | Readonly<{
    [key: string]: PortData;
}>;
export type PortAnswer = Readonly<{
    outcome: 'done';
    value: PortData;
}> | Readonly<{
    outcome: 'refused';
    reason: string;
}> | Readonly<{
    outcome: 'unavailable';
    reason: string;
}> | Readonly<{
    outcome: 'unknown';
}> | Readonly<{
    outcome: 'closed';
}>;
export type Port = Readonly<Record<string, (input: PortData) => Promise<PortAnswer>>>;
export type PortFactory<Caller> = (caller: Caller) => Port;
export type Bound = Readonly<{
    ports: Readonly<Record<string, Port>>;
    close(): void;
}>;
export declare function bindPorts<Caller>(factories: Readonly<Record<string, () => PortFactory<Caller> | undefined>>, caller: Caller): Bound;
```

## 声明文件 `side-state.d.ts`

```ts
export type Absent = Readonly<{
    kind: 'port' | 'point' | 'reference';
    name: string;
}>;
export declare const lacksText: (lacks: readonly Absent[]) => string;
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
    kind: 'waiting';
    version: string;
    lacks: readonly Absent[];
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
    kind: 'lacking';
    lacks: readonly Absent[];
}> | Readonly<{
    kind: 'appeared';
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
import type { Member, PluginKind, PluginManifest, SideName } from './manifest.ts';
import type { PackageFile } from './package.ts';
export type Offered = Readonly<{
    version: string;
    manifest: PluginManifest;
    files: readonly PackageFile[];
}>;
export type Wanted = Readonly<{
    name: string;
    version: string;
    kind?: PluginKind;
    members: readonly Member[];
    needs: readonly string[];
    files: readonly PackageFile[];
}>;
export declare function wantedOf(offered: readonly Offered[], side: SideName): readonly Wanted[];
```
