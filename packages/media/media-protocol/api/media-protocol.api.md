# @omne-harness/media-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `MediaProtocol` · `media-protocol.d.ts`
- `MediaReference` · `media-protocol.d.ts`
- `mediaProtocol` · `media-protocol.d.ts`
- `readReferenceText` · `reference-text.d.ts`
- `referenceText` · `reference-text.d.ts`

## 声明文件 `index.d.ts`

```ts
export { mediaProtocol, type MediaProtocol, type MediaReference } from './media-protocol.ts';
export { readReferenceText, referenceText } from './reference-text.ts';
```

## 声明文件 `media-protocol.d.ts`

```ts
import { type RuleValue } from '@omne-harness/public-contract';
declare const reference: {
    readonly kind: 'object';
    readonly fields: {
        readonly storage: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly key: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly mediaType: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly bytes: {
            rule: {
                readonly kind: 'text';
            };
        };
        readonly digest: {
            rule: {
                readonly kind: 'text';
            };
        };
    };
};
export type MediaReference = RuleValue<typeof reference>;
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
                readonly name?: string;
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
                    readonly name?: string;
                    readonly preprocess: {
                        readonly kind: "not-needed" | "not-started" | "running";
                    } | {
                        readonly kind: "done";
                        readonly representation: {
                            readonly definition: {
                                readonly name: string;
                                readonly revision: string;
                            };
                            readonly engine: {
                                readonly name: string;
                                readonly revision: string;
                            };
                            readonly others: readonly {
                                readonly bytes: string;
                                readonly digest: string;
                                readonly key: string;
                                readonly mediaType: string;
                                readonly storage: string;
                            }[];
                            readonly outcome: "converted";
                            readonly text: string | {
                                readonly bytes: string;
                                readonly digest: string;
                                readonly key: string;
                                readonly mediaType: string;
                                readonly storage: string;
                            };
                        } | {
                            readonly definition: {
                                readonly name: string;
                                readonly revision: string;
                            };
                            readonly engine: {
                                readonly name: string;
                                readonly revision: string;
                            };
                            readonly outcome: "inconvertible";
                            readonly reason?: "damaged" | "encrypted" | "no-text";
                        };
                    } | {
                        readonly kind: "failed";
                        readonly reason: "basis-unavailable" | "cancelled" | "engine-error" | "engine-unavailable" | "invalid-result" | "outcome-unknown" | "timeout";
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
        readonly 'prepare-media': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly preprocess: {
                        readonly kind: "not-needed" | "not-started" | "running";
                    } | {
                        readonly kind: "done";
                        readonly representation: {
                            readonly definition: {
                                readonly name: string;
                                readonly revision: string;
                            };
                            readonly engine: {
                                readonly name: string;
                                readonly revision: string;
                            };
                            readonly others: readonly {
                                readonly bytes: string;
                                readonly digest: string;
                                readonly key: string;
                                readonly mediaType: string;
                                readonly storage: string;
                            }[];
                            readonly outcome: "converted";
                            readonly text: string | {
                                readonly bytes: string;
                                readonly digest: string;
                                readonly key: string;
                                readonly mediaType: string;
                                readonly storage: string;
                            };
                        } | {
                            readonly definition: {
                                readonly name: string;
                                readonly revision: string;
                            };
                            readonly engine: {
                                readonly name: string;
                                readonly revision: string;
                            };
                            readonly outcome: "inconvertible";
                            readonly reason?: "damaged" | "encrypted" | "no-text";
                        };
                    } | {
                        readonly kind: "failed";
                        readonly reason: "basis-unavailable" | "cancelled" | "engine-error" | "engine-unavailable" | "invalid-result" | "outcome-unknown" | "timeout";
                    };
                }>;
                readonly 'not-found': import("@omne-harness/public-contract").Codec<{}>;
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
    readonly observations: {
        readonly 'observe-media': {
            readonly identity: "login";
            readonly open: import("@omne-harness/public-contract").Codec<{
                readonly ref: {
                    readonly bytes: string;
                    readonly digest: string;
                    readonly key: string;
                    readonly mediaType: string;
                    readonly storage: string;
                };
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
export type MediaProtocol = typeof mediaProtocol;
export {};
```

## 声明文件 `reference-text.d.ts`

```ts
import type { MediaReference } from './media-protocol.ts';
export declare function referenceText(ref: MediaReference): string;
export declare function readReferenceText(text: string): MediaReference | null;
```
