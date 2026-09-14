# 工具决策设计证据

对象：`tool-decision-interfaces.md`；输入提交 `8c791b3a1966afa86b3d60c24fecd3da3f1ea0b9`，
作者 `agt-037`。以下是来源核对和底层可行性观察，不是产品符合性或设计接受记录。

## 来源与采用

| 来源 | 本次实际核对及支持范围 |
|---|---|
| [tools fork 来源](../../../fork/tools-source.md)、`packages/tools/tools/src/{index,schema,json-schema}.ts`、provenance | 已读活动源和精确 MIT 来源；可保留声明/冻结/呈现，现有 execute/Scope/AbortSignal 不承担 TL/HD/耐久执行。未重跑源测试 |
| `packages/core/work-data/package.json` 与 `src/index.ts` | 已核对 Ajv 8.20.0、Ajv2020 及完整共享校验边界；新命令 validator 由 TL 建，不改变共享 DTO owner。未安装新依赖或编译新接口 |
| [Ajv Schema](https://ajv.js.org/json-schema.html)、[选项](https://ajv.js.org/options.html) | 实际读取官方说明，采用 2020-12 与明确关闭数据变更选项；动态命令完整编译/限制仍须产品验证，文档不证明新 profile 已实现 |
| [Cordis Service](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/service.md)、[Services](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/03-services.md) | 实际读取固定官方页面；Service 注册与 Fiber 绑定，inject 持续跟踪。另核对同提交官方快照 `vendor/cordis/src/service.ts`、`reflect.ts` 的 provide 和撤回；复用既有发行物/生命周期证据，没有新增 Cordis 运行探针 |
| [既有生命周期研究](../../../../../research/cordis-lifecycle-and-tool-composition.md)、[采用来源](../../../../runtime-composition/sources.md) | 内核沿官方 4.0.2；多个 disposer 的清理不能用来推导业务先后/安全停止。本稿的状态/操作插件拆分是项目选择，不称上游协议 |
| [Node 24.18.0 子进程](https://nodejs.org/download/release/v24.18.0/docs/api/child_process.html)、[文件系统](https://nodejs.org/download/release/v24.18.0/docs/api/fs.html) | 采用 Node 文件 I/O，子进程只用于下面的崩溃注入。kill 请求不等价 child close，也不证明任意后代终止；产品候选不采用任意子进程执行提供者 |

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

最终候选运行 `make docs-check BASELINE=8c791b3`、`git diff --check` 与写入范围
核对；docs-check 实际通过 416 份 Markdown。实际结果和命令退出状态保存在
同目录检查材料；检查只支持文档结构/引用，
不能把尚未执行的产品、形式或编译验证记为 GREEN。
