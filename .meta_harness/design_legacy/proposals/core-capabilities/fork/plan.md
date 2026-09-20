# 本批定向源码 fork 施工计划

> 本页保留首次导入计划的版本含义。2026-09-14 用户要求从第一天按能力族/职责
> 分包；下述单一 dsh-baseline、agent 内 scope 及其导出/构建组织选择已由
> [布局修订](package-layout.md)取代，当前源码归属见[产品包](../../../../packages/README.md)。
> 来源集合、算法裁剪及目标能力差距继续有效，历史验证不能代表重组后的版本。

本计划消费 [D-006](../../../decisions/D-006-dsh-core-adoption.md) 的来源集合及
[D-008](../../../decisions/D-008-core-capabilities.md) 的目标契约。用户在本轮
明确要求设计正式化后开始为后续二次开发建立 fork。交付是本地拥有、能构建
和独立消费的源码起点；目标提供者和产品闭环不由本次源测试验收。
本轮施工、独立复核与验证已完成，实际切片及接受范围见[交付记录](delivery.md)。

## 交付边界与包结构

固定 `deepseek-ai/deepseek-harness@c291e7961a515f6d7af9304e7fd1d257929aef26`。
原 archive SHA-256 为 `f08cfc86cb05d4186be3319670e2756375cb2788b3d2164dd7f30b885f350860`，
已有逐文件快照核对覆盖 10,308 个文件及 11 个符号链接，模式/uid/gid 不在核对范围。
本次重新核对实际选取文件与 archive，保存必要原件和逐文件哈希／修改映射。
不搬 tmp 的完整研究报告。原始根 MIT 版权与许可随产物保留。

本次新建 `packages/dsh-baseline`：责任是维护本批尚未产品化的 DSH 源机制及其
可构建依赖闭包，所有导出均在显式 `./baseline/*` 子路径，没有默认产品入口。
源码模块按下表职责划分；它们不是一个内核服务或统一运行状态对象。包作为
共同来源/构建单元便于在目标实现分化前维护依赖，未来按实现边界拆分，不要求
每个上游来源对应一个空转发包。现有 `packages/agent` 保留原基线身份，不再
复制 agent 机制；其 scope 原件补齐 store 导出并公开 `./scope-baseline`，新包只
消费这个唯一活动 scope 的公开入口。独立 scope 拷贝的 Symbol/WeakMap 会导致
贡献与路由分裂，因此不创建第二份 scope 实现。内核最终归入 core 的选择不由此来源包改变。

| 源与活动目录 | 本次可编译起点 | 源语义与目标差异 |
|---|---|---|
| scope → 现有 `packages/agent/src/scope.ts` 与 `store.ts` | 原 scope/index 与 store 的作用域、受管条目、顺序与撤回机制 | 仅可见性/贡献机制，无租户授权；本次不得借它发布目标执行许可 |
| brand/util-values/timeout → `src/support/` | 实际被调用的品牌辅助、JSON 快照/冻结和 signal 协作 | 不复制产品身份，不加入 timeout 产品政策；不为未消费辅助扩大框架 |
| attachment → `src/media/` | brand/types/error 与必要纯请求引用辅助 | 无完整服务或后端；源消息/媒体类型明确只用于 baseline，产品继续用唯一 core-work v1 |
| llm → `src/llm/` | 消息、流装配/累积、错误与归因、请求配置和必要 adapter 机制 | 删 Typert/crypto/schemastery 耦合；不带任何直连 adapter。自动模态降级/重试政策不作产品承诺；可先只导出已验证的纯机制，未完成 runtime 不假装可用 |
| session/projection → `src/session/`、`src/projection/` | 会话内存历史、surface/header、序号和投影注册/fold | 采用源 baseline 消息投影，不反向依赖活体模型服务；不声称拥有目标租户/Run/耐久提交协议 |
| persistence/JSONL → `src/persistence/`、`src/jsonl/` | 原句柄、错误与储存校验，以及可裁剪普通 JSONL 写读/排空机制 | 排除旧格式迁移、压缩、native/Windows 锁桥；源句柄只对其声明的 storage/ownership 前提有效。未兑现真实跨进程写入权时不得导出为目标 DR 提供者 |
| system-prompt/tools → `src/prompt/`、`src/tools/` | 动态 prompt 贡献和纯 render，工具 Schema/定义 DSL、可单独复用的贡献及调用流程 | 删 PTC/code-runtime、user-approval、Typert、settings/invariant 插件；不把源 in-memory pipeline 当耐久审批或独立执行器 |
| agent-loop → `src/loop/` | 有独立复用价值的 runtime-context/assistant-stream 投影及可裁剪驱动片段 | 不导入完整 DSH Loop/Agent/preset 装配；旧 inbox/turn/工具政策保存源差异，不当 SR-Run 目标实现 |

“可先只导出纯机制”不是允许空实现：每个已交付导出必须有实际源算法、明确输入/
结果/失败边界和可执行验证；尚未选取的完整源入口保持非编译原件，状态如实列出。
不得用任意放行、假成功、空方法或不可用常量冒充一个能力。二次开发应从已保存
算法及目标映射继续，不复刻旧应用政策的兼容层。

## 固定构建与依赖

Node 24、pnpm 10.28.1、TypeScript 6.0.3、Vitest 4.1.8、@types/node 24.13.4
沿现有 workspace 工具链；Cordis 直接使用官方 4.0.2。必要标准校验可使用上游
已消费的普通 zod 4.4.3，具体进入 lockfile 前核对发行物；不安装 schemastery。
参数 JSON Schema DSL 的保留算法是源实现，不扩大为产品 JSON Schema 全规范校验器。
新的普通依赖必须有用途证据，默认用 Node 标准库替代随机/散列辅助。

活动源码只 import 本包明确模块或现有 agent 的公开 scope-baseline；生成声明不含
DSH workspace、Typert、PTC 或其它被排除模块。原件在 upstream/ 不编译/不打包，
LICENSE、README、UPSTREAM、provenance 与 dist 随 tarball。严格类型检查无
`ts-nocheck`、伪模块声明或任意 any 补洞。保留源测试及有因果说明的删改，增加
实际消费/资源释放/失败路径检查；不改源预期去声称目标已经兑现。

## 验收清单

- 原件与固定官方 archive 的字节匹配；来源包和活动导出一一可追踪，许可保留，
  排除集合未因源码/type-only import/构建生成而重新进入。
- 每个活动模块有语言无关源状态/生命周期/算法及差异说明；来源测试、裁剪原因、
  实际导出和未导入部分明确，没有把 source-baseline 登记成目标规格。
- 严格构建/类型和保留测试通过，scope/registry dispose 的资源撤回有真实 Cordis
  验证；JSONL 的已导出 I/O 原语在临时真实文件上验证错误与排空边界。
- 本包和现有 agent 集成 `pnpm check` 通过，lockfile 只含已声明闭包；离线安装
  当前 tarball 到仓库外 consumer，运行 JS 和 tsc 均成功，不能用源码 alias 替代。
- 最终文档/冻结基线检查通过；工作分支提交可审阅。没有用户新的授权时不合并
  main、不发布 npm、不进行收费 OpenRouter 请求；这些也不是源 fork 的验收条件。

工作区临时进度归 tmp，源事实及必要证据归本 fork 目录与包的 UPSTREAM/清单；
本计划接受不降低 D-008 的任何产品保证。
