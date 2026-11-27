# @omne-harness/mcp-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `McpProtocol` · `mcp-protocol.d.ts`
- `mcpProtocol` · `mcp-protocol.d.ts`

## 声明文件 `index.d.ts`

```ts
export { mcpProtocol, type McpProtocol } from './mcp-protocol.ts';
```

## 声明文件 `mcp-protocol.d.ts`

```ts
export declare const mcpProtocol: {
    readonly operations: {
        readonly 'list-endpoints': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly items: readonly {
                        readonly catalog: {
                            readonly actions: number;
                            readonly kind: "acquired";
                        } | {
                            readonly kind: "not-acquired";
                            readonly reason: string | null;
                        };
                        readonly connection: {
                            readonly reason: string | null;
                            readonly state: "degraded" | "lost" | "none" | "preparing" | "ready";
                        };
                        readonly credential: "absent" | "invalid" | "not-required" | "present";
                        readonly credentialState?: "absent" | "invalid" | "not-required" | "present" | "reconnect-required" | "rejected";
                        readonly name: string;
                        readonly use: {
                            readonly kind: "usable";
                        } | {
                            readonly kind: "blocked";
                            readonly reason: string;
                        };
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
        readonly 'read-endpoint': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly actions: readonly {
                        readonly available: boolean;
                        readonly name: string;
                        readonly reason: string | null;
                        readonly summary: string;
                    }[] | null;
                    readonly endpoint: {
                        readonly catalog: {
                            readonly actions: number;
                            readonly kind: "acquired";
                        } | {
                            readonly kind: "not-acquired";
                            readonly reason: string | null;
                        };
                        readonly connection: {
                            readonly reason: string | null;
                            readonly state: "degraded" | "lost" | "none" | "preparing" | "ready";
                        };
                        readonly credential: "absent" | "invalid" | "not-required" | "present";
                        readonly credentialState?: "absent" | "invalid" | "not-required" | "present" | "reconnect-required" | "rejected";
                        readonly name: string;
                        readonly use: {
                            readonly kind: "usable";
                        } | {
                            readonly kind: "blocked";
                            readonly reason: string;
                        };
                    };
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly name: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'refresh-endpoint': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly reason: string | null;
                    readonly refreshed: "cancelled" | "failed" | "published" | "superseded";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly effect: "commit";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly name: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "mcp";
    readonly major: 1;
    readonly observations: {
        readonly 'observe-endpoints': {
            readonly identity: "login";
            readonly open: import("@omne-harness/public-contract").Codec<{
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly frame: import("@omne-harness/public-contract").Codec<{
                readonly about: "endpoints" | "events";
                readonly kind: "changed";
            }>;
            readonly ends: readonly [
            ];
            readonly since: 2;
        };
    };
};
export type McpProtocol = typeof mcpProtocol;
```
