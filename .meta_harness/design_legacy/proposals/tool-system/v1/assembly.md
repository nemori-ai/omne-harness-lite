# 动态装配、Cordis 映射与 DSH 复用

本页承接[生命周期、效用与撤回](lifecycle.md)，是[候选草案](README.md)的实现
映射与演化建议；能力边界不等于最终包或进程划分。

## 装配内容与发布单位

一份可执行绑定至少关联：租户及使用范围、工具/操作精确定义、实现制品版本、
配置与依赖代次、执行环境，以及解析后的必需 skill 精确内容。模型请求另外
关联可见操作集合和实际上下文投影。保持定义、实现、内容和请求记录可追溯，
不要求把所有数据复制到每条调用里，受控耐久引用即可。

期望装配是可保存的选择和部署意图；实际装配是当前可用的运行资源。恢复读取
前者重新检查权限、制品、依赖与目标环境，再重建后者。旧运行实例的 ID、Context
或目录缓存不能代表当前授权。工具定义、实现、绑定及组合均可更新，但消费者
不会因为全局“推荐版本”变化而无条件升级已选资产。

建议发布单位为一个明确范围内的关联工具、操作、skill 和实现选择。候选先
解析、验证、准备，全部必需条件就绪后通过一次有条件的发布选择更新，对该
单位的新绑定生效；不宣称整个系统的任意插件图都可原子热切换。

| 阶段 | 可观察含义 |
|---|---|
| 准备 | 确切内容、权限、依赖、版本、环境和安全边界检查；不接纳生产调用 |
| 就绪 | 必需实现与内容可达，发布单位内约束已满足；仍未替换当前选择 |
| 当前发布 | 新装配/调用可选用；每次准入仍检查当前条件 |
| 排空 | 不接纳新调用，原调用持有原实现及依赖的使用权直到收束或受控停止 |
| 已释放 / 清理失败 | 真实释放结果；失败需记录剩余资源、影响范围及后续动作 |

“就绪”包含操作级实际环境能力，不能仅以 `ctx.someService` 存在作为证明。
远端不可达、权限权威不可用或依赖不完整，按操作显示阻塞/降级，不返回假空
目录，也不从沙盒静默降级到宿主执行。

## Cordis 如何承载这些语义

Cordis 的 `inject` 持续追踪必需服务；依赖丢失触发消费者卸载并撤回其受管
效用，依赖恢复后仍被期望的消费者重新加载。`ctx.effect` 把建立与逆向清理
纳入拥有者，监听、服务和子插件也参与这种生命周期。该机制直接承载本稿的
服务依赖与受管贡献，而不是在装配末尾才调用一次插件 API。
依据为[官方 Services](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/03-services.md)、
[Lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md)及
[源码核对](../../../research/cordis-lifecycle-and-tool-composition.md)。具体发布版本仍需验证。

| 本项目责任 | 候选实现映射 | 仍由本项目表达的语义 |
|---|---|---|
| 实现服务及依赖 | Cordis 服务与插件依赖 | 操作级实际就绪、租户资格、精确版本兼容 |
| 工具/skill 使用激活 | 注册与装配能力管理条目级依赖，组合插件拥有派生贡献的 effect/disposer | 内容身份、具体依赖作用范围、失活传播及撤回结果 |
| Agent 运行装配 | DSH agent fork 的运行实例/作用域 | Session/Run 身份、请求快照、上下文预算 |
| 后台执行资源 | 独立执行所有者下的插件/服务与资源作用域 | 脱离会话实例的存活、控制、重连与持久结果 |
| 观察与扩展 | 类型化事件和服务调用 | 哪些必须等待、允许拒绝、只可观察，以及耐久提交边界 |

工具依赖某个 skill 时，装配能力取得受管的条目使用关系，并在其有效期间建立
命令入口、内容/资源贡献和变化监听；依赖条目失效则撤回整组派生效用。无需
让基础 tools 注册表因某一个 skill 不存在就整体重启。服务 `skills` 存在
不意味着某个 skill 版本已发布、可读、已加载或进入当前模型上下文。因此应
在已有装配责任中加入条目级依赖激活，让其实际效用进入 Cordis 所有者，
而非把全部条目强塞进 `inject` 或另造通用生命周期内核。

类型化事件用于变化传播和观察，但 `emit` 不等待且不持久化。条目失效的权威
更新必须立即影响准入；异步通知可以使缓存/呈现随后刷新，不能在通知到达前
继续把旧代次当作有效。[官方 primer](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-primer.md)

依赖失效时，先使受影响的新准入不可用，再按使用占用处理在途资源；不要让
插件卸载回调顺序决定业务政策。Cordis 的作用域负责受管理效果，业务排空与
失败对账由拥有者完成。取消注册不等于停止已经提交的外部工作，dispose 返回
也不能单独证明物理停止或所有清理成功。

## 版本切换与失效

默认政策是新调用使用当前发布选择，在途调用保留精确旧绑定。调用准入与
发布选择更新须有明确先后；准入取得使用占用之后，排空不得释放该调用需要
的实现及依赖闭包。模型请求记录不无限期占用运行资源：切换后旧请求返回、
但尚未接纳的调用，可以明确拒绝为陈旧绑定，交由下一请求重新装配。

Skill 更新遵循相同的解析与发布边界，但其历史内容证据与可执行资源的持有
方式不同。保留耐久内容引用不要求运行旧 skill 提供进程；内容撤回后新的调用
检查当前使用资格。上下文的旧指引不能使已失效绑定复活。

多个版本可以安全共存时，让旧代次排空，新代次接纳。若依赖共享桌面、独占
端口或不可共存服务，候选替换应明确返回占用冲突，或在已经授权的停止/维护
策略下完成交接并暴露不可用窗口；不自动杀死无关调用。准备阶段失败保留原
发布选择，发布后故障按实际已发生效果处置，不能笼统宣称“回滚就撤销了效果”。

需要排空的实现代次与入口激活分别拥有资源；可以利用隔离的服务解析范围保留
旧代次真实依赖。不得对唯一提供者执行普通 HMR 后仍承诺原消费者存活，因为
Cordis 本来就会随 required service 变化重新装载消费者。不能建立这种并存
结构时，只能选择占用冲突或显式停止策略。

提供者突然丢失时，原调用查询实际状态或进入待核实/失败；不得把相同服务名
重新解析到新实现继续旧调用。恢复存活工作应取得原工作引用和兼容执行协议，
与重建新请求可用的当前装配分开。

变更影响只沿显式依赖传播；scope 边界不能代替完整依赖声明。实现通过隐式
全局资源绕开依赖记录时，就无法承诺受控排空，应在验证/装配时拒绝其相应
动态能力声明。首版不引入任意调用栈迁移或通用分布式调度器。

## 插件代码的执行边界

可信系统实现可在受管理的进程内使用 Cordis 服务；租户/Agent 新写的代码按
实际授予的信任选择隔离执行器，并只取得所需文件、网络、进程、服务和租户
能力。动态部署本身的授权不等于随后每项副作用的授权。

对于不能授予进程完整信任的插件，不能直接给予宿主 Cordis Context 和任意
模块导入能力。需要隔离执行及受控能力接口，将实际动作送入治理路径；有
独立服务边界价值的代理可以存在，纯为保留旧 API 的转发层没有必要。Cordis
作用域、Node VM 或 Schema 校验不单独构成恶意代码安全边界。

验证候选也有权限、目标和资源范围，不能在准备阶段偷偷执行生产副作用。
执行器能力不足时拒绝在线启用相应插件并给出原因，不用隐藏降级填补。
是否需要人类批准由有效策略决定，不对全部在线加载额外强制 HITL。

## DSH 复用选择

以下为候选导入范围，均固定于 `c291e7961a515f6d7af9304e7fd1d257929aef26`。
调研证明有可用基础代码，未证明本稿组合语义已由上游实现。

| 来源 | 建议保留和二次开发的部分 | 本项目必须新增或改变 |
|---|---|---|
| [core/tools](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/tools/README.md) / [工具子系统](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/subsystems/tools.md) | 定义 DSL、Schema/呈现、作用域注册、调用管线、结果冻结与观察 | 语言无关定义、命令路由、skill 依赖、精确绑定、单次控制、持久调用与治理准入 |
| [core/agent](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent/README.md) | 运行实例、registry/handle 与作用域原语 | 不沿用 Agent.id 与 Session.id 绑定作为全系统身份；Loop 和工具装配由本项目拥有 |
| [system-prompt](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/system-prompt/README.md) / [ScopedLayers](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/scope/src/store.ts) | 提示词、变量和 Schema 的受管贡献、按所有者撤回与作用域合成 | tool–skill 依赖联动、贡献一致快照和必需内容检查；工具失效不能遗留仍宣称可用的独立指引 |
| [jobs](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/jobs/jobs/README.md) / [jobs-local](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/jobs/jobs-local/README.md) | 作业接纳、终态竞态、清理与进程工作控制代码 | 改造会话所有权、内存回调、预选前后台与单消费游标；增加运行中转换、持久控制和重连 |
| [session](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/session/README.md) / [会话修复](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/session/src/repair.ts) | 耐久存储的局部技术及未知/未执行区分，按需选取 | 不把会话补齐结果当作执行器重连，不把 append 等于 flush；调用/交付权威存储另定 |
| 调研 execution-sandbox、workspace-fs 部分 | Shell/PTY/文件提供者与环境适配代码，逐项选取 | 租户目标映射、独立资源所有权、持久制品与明确权限；Computer/Browser 仍需选型补齐 |

选定部分直接在 fork 内修改其语义拥有者，删除不适用的旧 API 假设；不把整个
DSH Harness 引入后再外包一套 OMNE 层。Cordis 依赖官方发布包，与其它 DSH
组件的维护方式不同。具体包名和边界在实现映射阶段决定，不为每项表格责任
提前创建一层空 package。

前期调研的外部 npm 导入与局部测试只能支持其实际覆盖范围，不能证明 fork
可独立发布或完整满足本稿。导入前需验证 workspace/vendor/native 依赖闭包、
目标执行器构建、许可证及产物可追溯性；固定实际采用的 Cordis 发布版本。
现有临时报告里的“直接依赖/包装”建议以当前 SYS-KERNEL 的 fork 要求为准。
