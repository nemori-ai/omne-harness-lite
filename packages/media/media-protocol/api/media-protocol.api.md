# @omne-harness/media-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `mediaProtocol` · `media-protocol.d.ts`

## 声明文件 `index.d.ts`

```ts
export { mediaProtocol } from './media-protocol.ts';
```

## 声明文件 `media-protocol.d.ts`

```ts
export declare const mediaProtocol: {
    readonly operations: {
        readonly 'begin-upload': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly status: {
                        readonly kind: "uploading";
                        readonly nextSequence: number;
                        readonly partBytes: number;
                    } | {
                        readonly facts: {
                            readonly heightPixels: number;
                            readonly kind: "image";
                            readonly widthPixels: number;
                        } | {
                            readonly channels: number;
                            readonly durationMs: number;
                            readonly kind: "voice";
                            readonly sampleRate: number;
                        } | {
                            readonly kind: "file";
                        };
                        readonly kind: "committed";
                        readonly ref: {
                            readonly bytes: string;
                            readonly digest: string;
                            readonly key: string;
                            readonly mediaType: string;
                            readonly storage: string;
                        };
                    };
                }>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: number;
                }>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly field: "bytes" | "upload";
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
                readonly bytes: number;
                readonly mediaType: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly upload: string;
            }>;
        };
        readonly 'append-upload-part': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly nextSequence: number;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "committed" | "other-bytes";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly nextSequence: number;
                    readonly reason: "gap";
                } | {
                    readonly reason: "beyond-declared";
                }>;
                readonly limited: import("@omne-harness/public-contract").Codec<{
                    readonly limit: number;
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
                readonly part: Uint8Array<ArrayBufferLike>;
                readonly sequence: number;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly upload: string;
            }>;
        };
        readonly 'commit-upload': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly facts: {
                        readonly heightPixels: number;
                        readonly kind: "image";
                        readonly widthPixels: number;
                    } | {
                        readonly channels: number;
                        readonly durationMs: number;
                        readonly kind: "voice";
                        readonly sampleRate: number;
                    } | {
                        readonly kind: "file";
                    };
                    readonly ref: {
                        readonly bytes: string;
                        readonly digest: string;
                        readonly key: string;
                        readonly mediaType: string;
                        readonly storage: string;
                    };
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly nextSequence: number;
                    readonly reason: "incomplete";
                } | {
                    readonly reason: "digest-mismatch" | "over-budget" | "type-mismatch";
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
                readonly digest: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly upload: string;
            }>;
        };
        readonly 'query-upload': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly status: {
                        readonly kind: "uploading";
                        readonly nextSequence: number;
                        readonly partBytes: number;
                    } | {
                        readonly facts: {
                            readonly heightPixels: number;
                            readonly kind: "image";
                            readonly widthPixels: number;
                        } | {
                            readonly channels: number;
                            readonly durationMs: number;
                            readonly kind: "voice";
                            readonly sampleRate: number;
                        } | {
                            readonly kind: "file";
                        };
                        readonly kind: "committed";
                        readonly ref: {
                            readonly bytes: string;
                            readonly digest: string;
                            readonly key: string;
                            readonly mediaType: string;
                            readonly storage: string;
                        };
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
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly upload: string;
            }>;
        };
        readonly 'read-media-page': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly bytes: number;
                    readonly facts: {
                        readonly heightPixels: number;
                        readonly kind: "image";
                        readonly widthPixels: number;
                    } | {
                        readonly channels: number;
                        readonly durationMs: number;
                        readonly kind: "voice";
                        readonly sampleRate: number;
                    } | {
                        readonly kind: "file";
                    };
                    readonly mediaType: string;
                    readonly next: number | null;
                    readonly part: Uint8Array<ArrayBufferLike>;
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{
                    readonly reason: "material" | "reference";
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
                readonly offset: number;
                readonly ref: {
                    readonly bytes: string;
                    readonly digest: string;
                    readonly key: string;
                    readonly mediaType: string;
                    readonly storage: string;
                };
                readonly target?: {
                    readonly maxBytes: number;
                    readonly maxHeight: number;
                    readonly maxWidth: number;
                    readonly mediaTypes: readonly string[];
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'describe-media': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly facts: {
                        readonly heightPixels: number;
                        readonly kind: "image";
                        readonly widthPixels: number;
                    } | {
                        readonly channels: number;
                        readonly durationMs: number;
                        readonly kind: "voice";
                        readonly sampleRate: number;
                    } | {
                        readonly kind: "file";
                    };
                    readonly state: "held" | "staged";
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
                readonly ref: {
                    readonly bytes: string;
                    readonly digest: string;
                    readonly key: string;
                    readonly mediaType: string;
                    readonly storage: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "media";
    readonly major: 1;
    readonly observations: {};
};
```
