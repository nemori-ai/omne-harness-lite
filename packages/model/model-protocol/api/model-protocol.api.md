# @omne-harness/model-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ModelProtocol` · `model-protocol.d.ts`
- `modelProtocol` · `model-protocol.d.ts`

## 声明文件 `index.d.ts`

```ts
export { modelProtocol, type ModelProtocol } from './model-protocol.ts';
```

## 声明文件 `model-protocol.d.ts`

```ts
export declare const modelProtocol: {
    readonly operations: {
        readonly 'list-models': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly models: readonly {
                        readonly blocks?: readonly {
                            readonly block: string;
                            readonly message: string;
                        }[];
                        readonly credential: "available" | "missing" | "unknown";
                        readonly defaultReasoningEffort?: "high" | "low" | "medium" | "xhigh";
                        readonly enabled?: boolean;
                        readonly input: readonly ("image" | "text" | "voice")[];
                        readonly kind?: "decisions" | "live" | "llm";
                        readonly output: readonly ("image" | "text" | "voice")[];
                        readonly reasoningEfforts?: readonly ("high" | "low" | "medium" | "xhigh")[];
                        readonly reasons: readonly ("locked" | "modality" | "scope")[];
                        readonly route: string;
                        readonly selectable: boolean;
                    }[];
                    readonly supply?: {
                        readonly by?: "credential" | "locked" | "no-offering" | "not-enabled" | "scope";
                        readonly models?: readonly {
                            readonly provider: string;
                            readonly route: string;
                        }[];
                        readonly providers?: readonly string[];
                        readonly state: "blocked" | "ready" | "unknown";
                    };
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly kind?: "decisions" | "live" | "llm";
                readonly session?: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
    };
    readonly name: "model";
    readonly major: 1;
    readonly observations: {};
};
export type ModelProtocol = typeof modelProtocol;
```
