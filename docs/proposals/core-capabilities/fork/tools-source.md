# system-prompt 与 tools 的语言无关源行为

本页记录固定上游 `deepseek-ai/deepseek-harness@c291e7961a515f6d7af9304e7fd1d257929aef26`
中选取的 system-prompt/tools 行为，以及本地 source baseline 的裁剪。它是 D-006 的
来源说明，不是 D-008 产品实现或符合性声明。原件、哈希和活动目标见
`packages/dsh-baseline/provenance.json`。

## Prompt 装配

Prompt registry 的权威状态是全局层和按 scope identity 保存的进程内贡献层。每层分别
拥有具名 section、具名 context、匿名 tool provider、具名 variable 及匿名 runtime-context
抑制项；登记动作所属的 Cordis Context 拥有精确撤回。读取 scope 时先取全局层，再按祖先
到当前 scope 合并；具名项由最近层覆盖，匿名工具提供者累加。关闭登记 Context 后，贡献经
Cordis effect 撤回并发出 change 通知。

一次 `assemble` 是独立请求：先求值该次请求可见的变量和动态文本，section 按有限数值
`order`、再按名称的 code-unit 顺序稳定排序，context 同样按 order/name 排序。工具 provider
返回的 schema 参数会被结构化克隆，配置的显式顺序必须含唯一 `<unlisted-tools>` 插槽；
未知名称、保留名称和重复配置均失败。装配 waterfall 的返回值具有权威性，但若当前 scope
有唯一 `complete` section，waterfall 后仍恢复该 section；同时出现多个 complete section
会失败。

`renderPrompt` 和 runtime-context render 在装配之后严格替换 `{{name}}`。变量名只接受
`[a-z][a-z0-9_]*`；畸形、未登记或本次值为 undefined 的引用均失败，替换值不会被再次扫描。
空 section/context 被略去，非空项以空行连接；context 仍保留贡献名称以便归因。

本地差异：删去 Schemastery 和上游部署 settings 入口，配置由普通 zod 的显式解析函数
校验；删去上游 Harness identity 文本及 PTC、approval、shell、jobs、具体宿主工具的顺序常量
和提示政策。活动入口只保留
动态贡献、scope 合并、稳定装配、严格 render 和 tool schema 排序。它不保存 prompt 历史，
不决定租户授权，也不把 runtime context 当耐久事实。

## Tool schema 与 native 调用

Schema DSL 的权威输入是 JSON-value 子集：object/array/string/number/integer/boolean/null、
exact-one `oneOf`、enum/const 和 JSON 注解。编译先验证 authored spec，再投影成 detached、
递归冻结的 raw JSON Schema。raw-schema validator 明确只支持该子集，拒绝循环、未知关键字、
非法 sibling、错误 required/property 关系和非 lossless JSON 注解；它不声称覆盖完整 JSON
Schema 标准。值校验使用显式 frame，避免深层数据消耗 JavaScript 调用栈，并返回所有带路径
的违反项。`defineTool` 在执行前校验参数，在返回后由 registry 校验声明的 output schema。

Native registry 的权威状态同样是全局及 scope 层中的具名定义和累加 restriction。登记时
schema、output schema 和 definition 被 detached/frozen；同层重名失败，最近 scope 定义覆盖
祖先。`schemas(scope)` 只发布当前可调用且未被 restriction 排除的声明，并再次 detached，
调用者不能借返回值改变 registry。`execute` 固化参数、查找当前 scope 的活动定义、调用 body、
等待 promise 完成，再验证和冻结 canonical JSON value，最后运行纯 render/presentationMeta。
未知工具、参数、输出、render 或 body 异常都返回具名失败结果；已经 abort 的请求不会调用
body，调用开始后的取消只通过同一个 signal 协作，registry 不把请求受理伪装成外部效果完成。
定义拥有的 `finalizeContent` 在参数固化后对成功、参数错误、body/output/render 错误和取消结果
各执行一次；它只能替换 content，自身抛错或产生非 JSON content 时转为失败且不递归重试。

本地 native flow 刻意不保留 PTC/code-runtime/SDK 渲染、pre/post approval waterfall、完整
Agent/Session/Loop、settings/invariant companion、超时政策、shell 或后台宿主。调用输入直接携带
source-only scope identity、call id 和 AbortSignal；它不是 tenant、Action、Run 或耐久审批事实。
`timeoutMs` 和 `isConcurrencySafe` 也从公开定义 DSL 删除，因为当前 native runtime 没有消费这些
调度政策；source baseline 不暴露看似生效的静默配置。
工具 body 的真实 I/O、停止和幂等保证仍由未来执行提供者负责，当前内存 registry 的成功只说明
body 已 settle 且本地 schema/render 边界通过。

## 活动入口与未导入部分

`src/prompt/index.ts` 是唯一 prompt 模块入口，活动导出为 `SystemPrompt`（具名及默认）、
`parseSystemPromptConfig`、`renderPrompt`、`renderContextSections`、`renderContextSnapshot`、
`joinContextSections`、`TOOL_ORDER_REST`、persona section 名称，以及 assembly/config/order/
contribution 的类型。上游 `invariant.ts` 未导入；上游固定 Harness identity 和具体工具顺序政策
也未进入活动入口。

`src/tools/index.ts` 是唯一 tools 模块入口，活动导出为 `ToolRuntime`（具名及默认）、
`defineTool`、schema 编译/校验函数、`JsonSchemaError`、`ToolArgsError`、`ToolNotFoundError`、
`ToolOutputError`、两个 abort code，以及 definition/execution/result/restriction、schema DSL 和纯
presentation 类型。`get`/`schemas`/`register`/`restrict`/`execute` 是 registry 的活动操作。
上游 `invariant.ts`、`ptc.ts`、`py-types.ts`、`ts-types.ts`、`testing.ts` 和完全属于 PTC 扩展的
`types.ts` 均未导入；没有 `run_code`、SDK renderer、真实环境工具、审批服务或宿主执行入口。

包级 `./baseline/prompt`、`./baseline/tools` exports 和 tarball consumer 由施工计划指定的主代理
在整合时登记和验证；本 spoke 不修改共享 `package.json`。这里的模块入口已通过本包 dist 路径
运行，不能据此提前声称最终 package export 已验收。

## 保留与未保留的上游测试语义

保留的测试覆盖：prompt 排序/覆盖/动态求值/严格变量/complete section/waterfall、scope dispose
撤回、工具顺序与参数 detached；schema DSL 的类型推导、编译、raw-schema 拒绝和深层 stack-safe
校验；tool 定义冻结、scope 可见性、restriction、native 成功与参数/输出/body/render/abort 失败。

上游 `invariant.spec.ts` 随被排除的 invariants 插件删除；`ptc.spec.ts`、SDK 生成测试及 execution
mode 测试随 PTC/code-runtime 删除；完整 `tools.spec.ts` 中 approval、Session context、Loop、around
waterfall、timeout 和 post-policy 场景随对应目标边界删除。没有保留这些测试，不代表这些产品
义务被放弃；D-008 的租户准入、耐久系统 ask、预算、执行前重检、唯一批准消费和恢复仍须由
后续产品实现及真实组合验证兑现。
