# @omne-harness/session-ui

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

module 变体草稿。

## 职责与状态

会话的界面模块：一个 React 组件 `SessionWorkspace`，列出自己的会话，打开一个或新建一个，发消息、看流式回复、取消这一轮。它只经 `session/v1` 的协议客户端做事（列出会话、建会话、读历史、开观察、发输入、认回、取消），不认识宿主，不认识身份，不导入服务端的任何成员。消费者是 `apps/desktop` 页面的装配文件。行为见 [SPEC.md](SPEC.md)。

已实现：会话列表（左边一列，窗口窄于 720px 时收成下拉；不列已归档的）、对话、流式 Markdown、推理与工具调用的卡片、工具调用与结果按编号配对、Ask 的问题卡（只渲染，不答卡）、结果未知时的认回、观察断开后的重连。未实现：答卡、停止单个调用。

## 使用

```tsx
import { SessionWorkspace } from '@omne-harness/session-ui'
import '@omne-harness/session-ui/session-ui.css'

;<SessionWorkspace client={sessionClient} tenant={currentTenantText} />
```

`client` 是 `ClientOf<SessionProtocol>`，`tenant` 是 `identity/v1` 的 `query-current-tenant` 给出的租户文本。组件挂上时建立自己的驱动器，卸下时中止它开的观察与计时。宿主给组件一个有高度的容器；样式只作用在 `.omne-session` 之下，深浅色跟随系统，或由祖先元素的 `data-theme="light" | "dark"` 指定。

开发用的演示页：`pnpm --filter @omne-harness/session-ui run demo`，打开打印出的地址。它用假的协议客户端按时间表送帧，不进发行。

取用的代码：`src/model/composer.ts` 改写自 super-assistant 的 `src/desktop/src/renderer/src/conversation/composer-action.ts`（发送与停止的三态），`src/view/scroll.ts` 改写自同目录的 `scroll.ts`（`isNearBottom`）；工具调用与结果按编号配对的规则取自同目录的 `tool-pairing.ts`，实现在 `src/model/conversation.ts`。`src/model/user-message.ts` 与 `@omne-harness/sdk` 的 `userTextMessage` 等价，改用 WebCrypto。

## 契约

<!-- documentation:placeholder -->

链接公开类型、必要校验及唯一行为正文。类型外行为由 SPEC.md 拥有，公开定义的导航在 docs/public-api.md。说明错误、生命周期与资源责任的拥有者，不复制签名或状态机。

## 设计

<!-- documentation:placeholder -->

概述内部模块和关键不变量的拥有者。完整设计写在 docs/architecture.md、docs/flows.md 与 docs/object-model.md。

## 配置与运行

<!-- documentation:placeholder -->

填写配置拥有者、默认行为、环境前提和显式依赖。说明调用者与包各自的运行责任。

## 验证

<!-- documentation:placeholder -->

填写可复跑命令、性质、前提和未覆盖。提供有实际断言的测试。结构通过不表示业务行为已验证。

## 维护

<!-- documentation:placeholder -->

说明公开契约、资源或依赖变化时必须同步的消费者和验证入口。信息不适用时写明理由，未知时登记具名缺口。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、状态与资源归属、关键机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、运行时校验与内部实现
tests/                    持续测试；fixtures/ 存放测试输入
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 存放验收输入
```

每个目录的 README.md 说明职责，index.md 负责导航。阅读路径见 [index.md](index.md)。docs 专题可以升级为同名目录，目录内须有 README.md 与 index.md；专题移动时同步本结构图。
