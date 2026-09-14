# dsh-agent 定向 fork：实施规格与施工计划

> 本页保留首次导入选择、F-01–F-08 验收边界与停止扩围条件，供重建已验收 fork 范围。后续[职责包布局修订](../../core-capabilities/fork/package-layout.md)
> 已将 agent 移至 `packages/core/agent`，唯一 scope 移至 `packages/core/scope`；
> 当前导出和依赖以各包 manifest 为准，本文旧路径与内部 scope 选择保留历史含义。

状态：计划评审、源码导入与有限阶段验收已完成；本页定义源码导入阶段的交付边界，不发布新产品契约。
评审对象与处置见[评审记录](review.md)。

## 目标、依据与授权

用户在确认下一步是定向 fork dsh-agent 后要求「计划先写好，然后开始推进吧」。
本任务先完成可审阅方案及独立评审，再在该边界内导入、适配构建、验证并验收。
接受依据是本次用户任务授权；作者负责技术选择和阶段验收，评审者只返回意见。
主分支合并、发布，以及下一阶段完整 v1 二次开发不包含在此次任务中。

采用 [D-005](../../../decisions/D-005-agent-runtime.md) 与
[live-agent v1](../../../../spec/capabilities/live-agent/v1/contract.md)，
需求消费范围沿用[原提案](../v1/requirements.md)固定的
`f580718295daaec0f42d3262643e95281c493063`，本次不改变需求或冻结规格。
来源语义见[源 draft](../source-baseline/design/contract.md)，
目标差异以[已有映射](../v1/source-mapping.md)为准。

本阶段成果是本项目拥有维护权的、能与官方 Cordis 实际发行包组合的源码起点。
它仍保留部分源语义，不能作为目标 live-agent v1 的符合性实现或产品服务交付。
信任边界限定为开发测试中的受信同进程参与者；没有应用装配或真实模型请求。

## 固定输入

- 当时设计输入固定为 `b9c7146f3ddf16231caa998e6f3af517ebdf22e4`。
- 上游仓库 `https://github.com/deepseek-ai/deepseek-harness`，commit
  `c291e7961a515f6d7af9304e7fd1d257929aef26`，dsh-agent 源版本 `0.1.5-rc.2`。
  已保存[文件校验表](../source-baseline/upstream-baseline.json)。
- 直接依赖官方 `@deepseek-ai/cordis@4.0.2`，不复制、别名替换或修改 Cordis。
  npm registry 发行 tarball 的 SHA-512 为
  `asOnXP1TzFSFQlHb1iegDZp0z/8WD1c7YNrwJR/Tx2bzNuMXfcekE/I67Iv6SQXeLB4csxqCngzQKANP7gdw0g==`。
  从实际安装物验证所需 API；源码版本同名不等于发行包已验证。
- Cordis 正常依赖闭包含官方 `@deepseek-ai/cosmokit` 和 `@standard-schema/spec`；
  它们作为 Cordis 发行包依赖由锁文件管理，不把“除 Cordis 外的 DSH 功能包 fork”
  误解为需要复制 Cordis 自身的底层依赖。可选 loader/include 不启用。
- 构建采用 Node.js 24、pnpm 10.28.1、TypeScript 6.0.3；测试 Vitest 4.1.8，
  Node 类型 24.13.4。版本写入 manifest 与锁文件，以实际安装构建验证兼容。

## 源码范围与依赖处置

目标成员 `packages/agent`，私有包名 `@omne-harness-lite/agent`，版本 `0.0.0`。
仅提供显式实验入口 `@omne-harness-lite/agent/baseline`，暂不提供根入口；
该命名提示当前使用的是来源基线，不是具备租户保护的产品 Agent 服务。
`private: true` 只防止意外发布，不是安全隔离机制。

| 固定上游文件/内容 | 导入及适配方式 |
|---|---|
| `packages/core/agent/src/index.ts` | 保存原件；活跃 `src/index.ts` 保留 Registry 精确条目、enter/announce/detach、factory 委托及 initiator 算法。去掉 Typert 注册和附属 re-export，依赖转向本包窄接口 |
| `packages/core/agent/src/dispatch.ts` | 保存原件；活跃版本保留 subject/carrier、emit/serial/waterfall，去掉 `assembleContextFor` 与 system-prompt 类型引用 |
| `packages/core/agent/src/types.ts`、`runtime-types.ts` | 保存原件作来源；不激活其 Session/LLM/Loop/序列化数据协议。窄运行接口归本包 `src/types.ts`，见下文 |
| `packages/core/scope/src/index.ts` | 保存原件并在本包内部 `src/scope.ts` 复用其作用域路由/生命周期辅助，删除 store re-export；不导入 scope store/invariant，不新增独立 scope 产品包 |
| `packages/core/agent/tests/agent.spec.ts`、`agent-initiator.spec.ts` | 保存原件；移植适用测试，替换包名和仅身份用途的 Session fixture，取消 Typert 和取消协议类型测试并逐项记录。Loop 事件换成测试局部事件声明 |
| `packages/core/scope/tests/scope.spec.ts` | 保存原件，移植全部适用场景：重复/原始 disposer 先调用、精确 disposer、基础 filter、祖先路由方向、环拒绝与受控 rebind |
| `packages/core/agent/package.json` 与上游根 `LICENSE` | 保存来源 manifest；构建使用本项目 manifest。保留 DeepSeek 原版权与完整 MIT 许可文本，随分发产物携带 |
| 其余 agent helpers、preset、loop、Session/LLM/Typert 等包 | 不导入、不用其 npm 包顶替，也不实现相同产品能力 |

原件放 `packages/agent/upstream/`，不编译、不打包；来源清单记录原路径、commit、
原件及适配目标、原始 SHA-256 和改动说明，可直接比较原件与活动版本。
保存原件有明确价值：构建裁剪后仍能离线追踪源码与测试的原貌；无需保留整个上游仓库。

### 窄接口

此接口仅表达复用算法实际读取的能力，是源实现的局部编译投影；不是 SessionRef、
AgentRef 或正式 Session 数据模型，也不设第二份产品身份权威。

- `Agent` 只保留 `id: string`、`session: { readonly id: string }`、`ctx: Context`。
  原包对 id 的品牌类型编译约束不移植；字符串只用于本阶段源登记算法，绝不用于租户入口。
- `CreateAgentOptions` 保留 `sessionId`、`parentAgent?`、`signal?`、`setup?`；
  `ResumeAgentOptions` 保留 `resumeSessionId` 及相同三项可选字段。
  删除 meta、seed、inheritedEventCount、agentOptions；这些是未采用的外部能力数据，
  不以 `any`、空实现或伪造 SessionEvent 接口使完整上游 API 看似可用。
- `AgentSetup`、`AgentSetupCommit`、`AgentHandle`、`AgentFactory` 保留源委托边界。
  本包没有 create/resume 的具体实现，不声称验证真实 Session 持久化或装配完成。
- 活跃事件声明仅有 `agent/created`、`agent/disposed`；测试需要的 emit/serial/waterfall
  场景通过测试局部 Cordis 增补声明覆盖，不接纳上游 Loop 事件为产品协议。
- scope 辅助保持包内部；`Scoped` 类型允许用于基线事件声明，不独立承诺安全隔离。

### 明确保留的目标差距

源 Map 仍按单字符串登记、返回原对象、单 factory 槽、同步 created 可否决、
原始 detach 不等于完整排空；initiator 的 Promise 跟踪与自身排除也不等于运行时关闭。
这些行为是后续直接修改 fork 的对象，不能包装成“已通过租户/生命周期验收”。
包 README 将逐项指向现有目标差异；本次不修改已冻结 v1 契约来迁就来源实现。
应用和其他产品成员不得消费该基线，等下一阶段实现目标与完成符合性评审后再开放。

## 构建与验证规格

- 根添加真实 pnpm workspace（当前仅 agent 成员）、package.json、pnpm-lock.yaml；
  Python workspace 与 uv.lock 保持原职责。包自身拥有 exports、依赖、构建及测试配置。
- 使用 `tsc` 输出 ESM 和声明到成员 `dist/`，保持 Cordis 外部依赖。
  Cordis 4.0.2 的 `FiberState` 是声明级 const enum，发行 JS 无同名值导出；
  tsc 负责合法内联，测试消费构建产物，禁止通过 vendor alias 绕过发行包缺口。
- 运行源码/测试严格类型检查，再对构建产物运行适用的上游回归与追加集成场景。
  包公开入口不得包含 src 通配符或 node_modules 路径。
- 打包后在隔离临时消费者安装 tarball，只从公开 baseline 入口完成
  Cordis 插件加载、factory 注册、创建委托、登记通知、initiator 跨 await 归因、
  owner 撤除及依赖撤除验证；同时检查打包声明可编译、许可携带、无原件与源码泄漏。
  该检查是原语组合闭环；fixture 不调用模型，也不假扮真实 Session 或 Loop。
- 根 `make product-check` / pnpm check 组合构建、类型、测试、产物检查；
  `make check` 增加此步骤，失败返回非零。同步开发、workspace、验证与脚本导航。
- 变更未触及形式规格时不因源码导入重写模型。仓库组合检查按现有入口运行；
  如环境缺少模型工具，明确报告，不能将未执行当通过。

## 验收清单

| ID | 必须可观察的结果 |
|---|---|
| F-01 来源可追踪 | 原件 SHA-256 与固定源一致，已在原 baseline 中的文件也与其核对；新增 scope 原件记录同 commit 和哈希；全部适配/排除项有说明 |
| F-02 依赖真实 | frozen-lockfile 安装成功；解析的 Cordis 为官方 4.0.2，完整性匹配，无 vendor/路径别名或 DSH 功能包依赖；必需符号通过真实编译与运行被消费 |
| F-03 构建可消费 | ESM 与声明构建成功，独立消费者从 tarball 公共入口运行并编译，不靠工作区 src 或测试 alias |
| F-04 来源行为 | 精确登记与旧 detach、公告失败与重入、owner 撤除、factory 唯一性/追踪/撤除、initiator 返回身份/并发隔离/排空/自排除的适用上游回归通过 |
| F-05 Cordis 组合 | 补充 scope 路由、异步 scope 清理及 emit/serial/waterfall 的真实集成证据；不把 scope 过滤解释为租户授权 |
| F-06 维护与发布边界 | LICENSE、来源/差异说明随包携带；原件不进入构建产物；private 与显式 baseline 入口；无应用消费，不声称目标 v1 已实现 |
| F-07 仓库完整性 | 文档链接与冻结基线检查、既有工具测试、相关规格检查通过；main 及其他工作树未改；所有变更仅落本工作分支 |
| F-08 独立审阅 | 实施前计划评审的问题已处置；交付审阅绑定具体源码与验证证据；作者按任务授权记录阶段验收，不冒充用户逐项预先选定 |

## 停止扩围边界

若实际发行 Cordis 缺少必要行为、必须修改官方包、必须接受另一个 DSH 子系统，
或需破坏目标规格才能让导入成立，停止依赖实施并回到设计/派发者；不得静默扩大范围。
可在现有边界内选择常规工具配置并修复移植错误；新增产品政策需回到下一阶段建模。
