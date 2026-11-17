# @omne-harness/human-intervention-tool 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `DECISION_REQUEST_MAX_BYTES` · `index.d.ts`
- `DECISION_RESPONSE_MAX_BYTES` · `index.d.ts`
- `DecisionAnswer` · 包 `@omne-harness/human-intervention`
- `DecisionQuestion` · 包 `@omne-harness/human-intervention`
- `DecisionRequest` · 包 `@omne-harness/human-intervention`
- `DecisionResponse` · 包 `@omne-harness/human-intervention`
- `hitlDecisionWait` · `index.d.ts`

## 声明文件 `index.d.ts`

```ts
import { type DecisionResponse } from '@omne-harness/human-intervention';
import { type ToolWaitContract } from '@omne-harness/tool-contract/provider';
export type { DecisionAnswer, DecisionQuestion, DecisionRequest, DecisionResponse, } from '@omne-harness/human-intervention';
export declare const DECISION_REQUEST_MAX_BYTES = 196608;
export declare const DECISION_RESPONSE_MAX_BYTES = 393216;
export declare const hitlDecisionWait: ToolWaitContract<DecisionResponse, 'ask'>;
```
