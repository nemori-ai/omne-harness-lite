# @omne-harness/human-intervention

本成员提供 HITL 的公共数据模型、命令与查询契约，以及卡片的纯决策函数。公开协议已按 HJ0 采用。当前已实现严格请求解析和卡片规则，local 已提供独立等待的持久应用服务、池查询、原等待共同提交与 Identity 成员资格协调。实际 Agent/Tool 运行时接入仍由各自适配器承担。

## 使用与消费边界

`decodeHitlCommand` 先检查 JSON 的 UTF-8 字节预算，再按指定命令解析。有效输入返回 `decoded`，无效 JSON 或形状返回 `invalid-input`，超预算返回 `limited`。原话保留空格和换行。协议不接受超时自动答复、系统代答或额外赋权字段。

```ts
import { decodeHitlCommand } from '@omne-harness/human-intervention'

const result = decodeHitlCommand('submitReply', JSON.stringify({
  protocol: 'hitl/1',
  operation: { tenantRef: 'tenant-a', actorRef: 'human-a', operationId: 'reply-a' },
  cardRef: {
    request: { tenantRef: 'tenant-a', requestId: 'request-a' },
    cardId: 'card-a',
  },
  expectedRevision: '0',
  reply: { kind: 'text', text: '请保留原来的安排。' },
}))
```

解析不认证身份。网络适配器把真实凭证交给应用服务，不能把 `actorRef` 当作可信操作者。标识与修订由 Schema 解析为具名类型，数据中不含 Session 实例、Cordis Context 或 SQL 连接。

`decideReply` 消费已解析的卡片、命令和原等待状态，产生待共同提交的计划或明确拒绝。`ready` 不表示答复已经保存。实际提供者必须在共同提交内重核资格、卡片修订及原等待。`invalidateCard` 只失效待答卡片，保留已答历史。修订按十进制任意精度值递增。

## 契约与内部设计

[SPEC](SPEC.md)拥有必要行为与验证义务。[公共协议](docs/protocol.md)拥有业务确认和恢复语义，源码拥有具体公开类型。[内部设计](docs/internals.md)和[关键流程](docs/key-flows.md)说明原等待、资格与交接。[权限组合](docs/permission-composition.md)明确授权和 Settings 的独立责任。

`HumanInterventionCommands` 与 `HumanInterventionQueries` 分开定义消费接口。`DecisionCommitter` 表达具名共同提交，不接受任意数据库回调。[local 提供者](../human-intervention-local/README_ZH.md)已实现独立等待的持久事务、公共命令/查询和恢复应用入口。其他原等待适配、人类登录、交互验证及独立验收仍未完成，不能据此声称全系统 HITL 已可用。

## 配置、运行与验证

单命令最多 262144 UTF-8 字节。一个请求最多 64 张卡，每卡最多 64 个选项。标识、标题、说明和原话分别有独立边界，不静默截断。池存储、应用调用预算和查询响应预算见 [local 契约](../human-intervention-local/SPEC.md)。本成员的输入上限不代表提供者允许无限积压。

在成员目录执行 `pnpm exec vitest run --mode fast`、`pnpm run typecheck` 和 `pnpm run build`。当前测试覆盖公开入口、严格形状、独立来源、原话、一次决定和终局规则。它们不验证实际身份、数据库或外部效果。

[形式说明](docs/formal-model.md)与[验证入口](verification/README.md)保留有界模型、独立关系及负控。纯决策只是后续共同提交中的一部分，不能替代 SQL 与消费者集成验收。

## 维护

公共签名、领域行为和提供者的实际支持范围随源码更新。加入新的命令、失败分支或状态时，同步真实消费者和契约测试。运行时对象不进入数据协议，跨域事实仍由各自拥有者维护。
