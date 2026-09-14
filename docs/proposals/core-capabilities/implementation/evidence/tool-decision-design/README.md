# 工具决策设计证据

对象：施工入口及其导航的三包 design.md；原四输入提交
`8c791b3a1966afa86b3d60c24fecd3da3f1ea0b9`，本次修订基线 `b585608`、迁入计划
`0703f6e`，作者 `agt-037`。以下是来源核对和底层可行性观察，不是产品符合性
或设计接受记录；原 e6 候选及当时的检查材料仍可由 Git 精确回查。

## 来源与采用

| 来源 | 本次实际核对及支持范围 |
|---|---|
| [tools fork 来源](../../../fork/tools-source.md)、`packages/tools/tools/src/{index,schema,json-schema}.ts`、provenance | 已读活动源和精确 MIT 来源；可保留声明/冻结/呈现，现有 execute/Scope/AbortSignal 不承担 TL/HD/耐久执行。未重跑源测试 |
| `packages/core/work-data/package.json` 与 `src/index.ts` | 已核对 Ajv 8.20.0、Ajv2020 及完整共享校验边界；新命令 validator 由 TL 建，不改变共享 DTO owner。未安装新依赖或编译新接口 |
| [Ajv Schema](https://ajv.js.org/json-schema.html)、[选项](https://ajv.js.org/options.html) | 实际读取官方说明，采用 2020-12 与明确关闭数据变更选项；动态命令完整编译/限制仍须产品验证，文档不证明新 profile 已实现 |
| [Cordis Service](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/service.md)、[Services](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/03-services.md) | e6 实际读取固定官方页面及 `service.ts/reflect.ts` 的 provide/撤回，沿既有发行物证据；本轮另消费 P2 固定证据并实际运行下面的 T-R1 探针 |
| [既有生命周期研究](../../../../../research/cordis-lifecycle-and-tool-composition.md)、[采用来源](../../../../runtime-composition/sources.md) | 内核沿官方 4.0.2；多个 disposer 的清理不能用来推导业务先后/安全停止。本稿的状态/操作插件拆分是项目选择，不称上游协议 |
| [Node 24.18.0 子进程](https://nodejs.org/download/release/v24.18.0/docs/api/child_process.html)、[文件系统](https://nodejs.org/download/release/v24.18.0/docs/api/fs.html) | 采用 Node 文件 I/O，子进程只用于下面的崩溃注入。kill 请求不等价 child close，也不证明任意后代终止；产品候选不采用任意子进程执行提供者 |
| 相邻 P2 `runtime-provider-interfaces.md` 及 `evidence/runtime-provider-design/`，候选提交 `5ffba4bb55aa9514ebd7f3c2b48f0d26fc9a8e18` | 实际以 git show 核对固定正文和机制归档；无独立 records service 需求，已对齐 coordinator 准备面及受信 factory/options 的真实 reader 输入。复用其固定 fiber/reflect/service 源码/发行物证据；该稿尚未接受，完整 P2 生命周期仍归原作者 |
| [固定 registry.ts](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/registry.ts) 与实际 4.0.2 安装源 | 本次额外核对 plugin 返回 Object.create(fiber) 外壳；与 traced proxy 是不同机制。实际探针验证在 apply(c) 捕获 c.fiber 与 status 匹配，不能只对 plugin 返回值取 symbols.original；未宣称整个发行物和固定源码逐字节等价 |

新增 registry.ts 的官方来源与实际安装文件逐字节相同，哈希见
[来源核对](cordis-source-check.json)；原文和本次最终脚本/原始输出额外保存在
`cordis-mechanism-raw.tar.gz`。这一单文件核对不升级为整个发行物等价结论。

## T-R1：同步状态、延后清理和旧句柄

[cordis-current-window.mjs](cordis-current-window.mjs) 实际加载官方 4.0.2 已安装
发行物，先验证 lib/index.js 的 SHA-256 为
`1729cdbf8ee40b17c8839e06bf96491490548559e11ef7e411271e0754e751c5`；不安装
业务状态、假 coordinator、授权结果或工具执行器。最终命令与原始输出见
[checks.json](checks.json) 和 [cordis-current-window-output.json](cordis-current-window-output.json)。
复跑脚本的唯一参数是相同哈希的官方发行物 lib/index.js 路径，不依赖原 spoke 存续。

实际两组观测包含：

- provider dispose 后的同栈，effect 尚未运行而 Fiber 已 UNLOADING；较早的
  status 监听器可先调用旧闭包，此时本地观察 stamp 尚未改变，但原 Fiber 状态
  已同步可见。稍后的观察器更新 stamp 也发生在 disposer 前。
- 必要 provider 先 UNLOADING 时，consumer 暂仍 ACTIVE；consumer 自身检查
  不足，必须检查原依赖。provider 完全失去后 consumer PENDING；重现后同一
  consumer Fiber 回 ACTIVE，但旧闭包仍捕获旧值/代次，不能因此复活。

这支持 T-R1 在最终门同时检查原代次、原 Fiber 与必需 provider/link 状态的
映射选择；不证明真实 Admission Gate、单调 host 撤代、TL 准入、HD 消费、LE
start 或持久恢复已经实现。T-R2 无 Agent 结果/控制的产品切片也尚未执行。

首次运行和追加诊断运行都因探针拿 ctx.plugin 的 PromiseLike 外壳匹配原 Fiber
而失败，原 stderr 保留为 [第一次](cordis-current-window-1.log)、
[诊断运行](cordis-current-window-2.log)。核对 registry 后改用受信 apply(c) 的
原 c.fiber，随后观测通过；这两个失败是探针错误，不是产品 RED。最终脚本
保留校验外壳与原 Fiber 不等的实际断言。固定 P2 三组机制原始资产由其 evidence
在 `5ffba4b` 保全，本次不重复宣称运行了它们。

## 文件效果与业务结果之间的窗口

脚本 [file-journal-window.mjs](file-journal-window.mjs) 用内置 Node API，在测试
目录同步一份 `dispatch-intent` marker。受控子进程在一组场景尚未做文件操作时被
终止；另一组在目标文件和目录已 sync、尚无业务结果记录时被 SIGKILL。父进程
等待实际 child close，然后读取文件和 marker。marker 不是 core-journal/1。

命令从本工作树根运行，输出目录须尚不存在：

```sh
node docs/proposals/core-capabilities/implementation/evidence/tool-decision-design/file-journal-window.mjs tmp/tool-decision-design/file-window-run
```

原始结果见 [file-window-output.json](file-window-output.json)。这观察到独立文件
效果与结果记录间可以有崩溃窗口，支持保留 possible_effect/unknown 的选择。
它不验证 TL/HD、共同门、接纳去重、停止墓碑、Cordis 组合、writer 恢复或任何
恰好一次保证；产品 D03/D06/D07 等场景全部仍须实际执行。不是 RED→GREEN。

本次实际环境为 Node `v24.18.0`、Linux `5.15.0-1084-aws x86_64`、测试路径位于
ext4。脚本退出 0：效果前终止时目标不存在；效果同步后终止时目标为 21 字节，
两组业务 marker 均仍只有 dispatch-intent。未在其它文件系统或断电条件验证。

## 文档检查

原 e6 运行 `make docs-check BASELINE=8c791b3`，实际通过 416 份 Markdown。
本次迁入修订运行 `make docs-check BASELINE=b585608`、`git diff --check` 与写入
范围核对，实际结果和命令退出状态保存在同目录检查材料；检查只支持文档结构/引用，
不能把尚未执行的产品、形式或编译验证记为 GREEN。
