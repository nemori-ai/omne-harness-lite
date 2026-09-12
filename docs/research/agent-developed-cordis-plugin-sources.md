---
kind: research
id: R-agent-developed-cordis-plugin-sources
scope: PF-016 的 Cordis 在线插件机制、DSH 动态开发入口与 Raven 补充观察
---

# Agent 开发及在线装载插件的机制研究

[PF-016](../requirements/product/agent/PF-016-agent-developed-cordis-plugins-and-live-deployment.md) · [既有能力装载研究](dynamic-loading-and-artifact-sources.md) · [研究索引](README.md)

2026-09-12 用户新增要求：权限允许时，Agent 可在系统不停机期间开发、部署和
装载 Cordis plugin，包含工具、技能、服务等。此页核对可行机制与局限，并解释
PF-016 的最小技术义务；不采用完整 DSH/Raven Harness，不作为新架构的接受记录。

## 固定来源与证据范围

- 官方 DeepSeek Harness：`c291e7961a515f6d7af9304e7fd1d257929aef26`；沿本轮
  已核对版本，包含其 vendored Cordis。
- Raven：沿本仓既有研究所指 **EverMind-AI/Raven**，固定
  `fcf469ae619d91f7adc6fc7a4f963c17d176f9f5`；本次远端 HEAD 查询仍指向该提交。
- 下载的相关文件已与固定 Git tree 的 blob 标识核对。下表明确阅读章节和源码
  函数；静态阅读及上游自己的测试描述不等于本次执行了装载、权限隔离或故障测试。

## Cordis：在线组合成立，业务变更保证另需定义

| 官方来源 | 观察 | 对本项目的最小含义 |
|---|---|---|
| [Lifecycle and effects][effects]，Effects、state machine、ordering | `ctx.plugin` 动态创建实例；注册由所属 fiber 清理；显式包裹的计时器/连接等可在卸载时释放，子插件随父退出，异步 disposer 会被等待 | T3：资源归属必须完整，不能把游离任务留给已退出实例；逆序发起不等于异步清理串行完成 |
| [Services][services]，inject 与 Dependencies tracked after load | 依赖缺席时等待；服务撤除使依赖方卸载，恢复后重新装载 | T4：替换共享服务具有依赖影响，不天然保留在途操作或应用内存 |
| [Composition and HMR][hmr]，entries、HMR、PENDING | 稳定配置 entry id 帮助识别修改；支持局部装载/卸载/重配置及代码 HMR；示例依赖具体 loader、tsx 和 HMR 插件 | C2/T6：有不停机的机制基础，不要求选择文件 watcher，也不能假定任意 JS 运行器都支持同样 HMR |
| [Fiber 实现][fiber]，`_unload`、`await` | 卸载等待已登记 disposer 的 Promise；清理错误被逐项记录到 logger 后继续，`await()` 等待稳定状态并重抛启动错误；稳定状态可能仍是 PENDING | T3/C7：dispose/await 返回本身不能证明所有资源释放成功或插件已经可用；需要可观察清理与就绪结果 |

文档所说“等待 cleanup 完成”与源码逐项记录错误后继续并不等同于“清理全部成功”。
此处以精确区分解释，不扩大为 Cordis 提供无失败撤销或无缝迁移。注册撤除不能
撤回已经发送的消息、提交的数据或其他外部效果；语言的动态执行能力也不自动
解决状态迁移、服务兼容和权限边界。

## DSH：已有 Agent 编写并运行动态 Cordis 包的入口

[tool-cordis README][tool] 的 Summary、workflow、boundaries、limitations 与
[host-runner README][runner] 的定义、版本、运行及 trust stance 共同说明：

- 模型可以 inspect 当前契约与自身插件，define 新包或同一插件的新版本，然后
  run/update、stop、undefine；包版本不可变，定义与执行是分开的操作。
- define 只核对参数与语法，不执行候选，不能把它等同于测试、运行兼容性或权限
  验证。host-only 包在进程内激活；browser half 另需页面上的人类确认与客户端。
- 定义的可见/控制范围属于创建会话，但运行中的包可能影响同进程其他会话；
  **会话私有目录不是效果隔离**。定义只存在于进程内，重启丢失；对话记录中的
  源码不等于已经具备可重建的部署注册。
- 该动态入口仅接收普通 JavaScript，不转换 TS/JSX 或 imports。其他 Cordis
  loader 可以采用不同装载策略；“项目使用 TS”不能推导所有动态入口自动接受 TS。
- runner 使用 `node:vm` 分隔全局对象，文档明确它不是安全边界，host helper
  仍可通向 Node；`vmTimeoutMs` 只约束同步求值，不能约束完整异步执行生命周期。

[startHostHalf 源码][host-lifecycle] 实际创建受包装子 fiber，等待稳定，启动异常
时先请求清理再抛错，也允许合法的待依赖状态。这支代码提供局部启动失败处理
观察，未证明整个多插件更新原子成功、上一版本自动复原或外部状态可逆。

因此 DSH 支持“Agent 写代码并改变运行能力”的可行性判断，但 PF-016 仍须补齐
持久版本、当前授权、租户效果约束、可执行兼容验证、在途工作与失败恢复。这里
不采用 DSH 工具名、内存定义生命周期、页面批准策略或 VM 信任模型。

## Raven：借鉴开发反馈和入口一致性，不冒充 Cordis 热部署

| 来源及核对范围 | 观察及可借鉴内容 | 局限 |
|---|---|---|
| [插件 bootstrap][raven-bootstrap] 与 [registry][raven-registry] 的 activate/_activate_one | 发现 manifest 后，依据配置启用，再导入工厂；贡献名称冲突明确报错，保存来源关系 | 核对的是 Python 工厂注册与组装路径，未见该路径提供 Cordis 式在线卸载保证；不能把“有插件系统”当作本项已实现 |
| [PluginContext][raven-context] | 工厂收到配置、受限服务入口和带插件身份的 logger；版本化契约与运行实例分开 | 窄接口有助管理依赖，Python 代码同进程运行本身不因 dataclass frozen 获得安全隔离 |
| [Agent PlugHub 工具][raven-plughub] 的入口说明及 connect | Agent 和界面消费同一安装/连接流程；仅从可信目录选条目，秘密录入和授权另走相应入口 | 是已有集成安装，不能代替本轮“自主开发新插件”；本项目不沿用“仅目录插件”的产品限制 |
| [reload.mcp][raven-reload] | 可以协调运行中的 MCP 配置，无变更先短路；如实区分协调尝试与实际连通、工具集变化 | 这是 MCP 重连接路径，不是通用插件状态迁移；错误被装入 noop 文本的返回形式不作为本项目结果协议 |
| [Evolver README][raven-evolver] 的流程、恢复、状态与安全限制；[本仓既有源码核对](agent-system-evaluation/frameworks.md#raven) | 从失败轨迹生成受范围约束的候选，比较基线、验证实际生效、检查原有能力和留出表现，保留提交及试验关系 | 产出候选 Git commit 不等于在线部署；目录有待退役说明，规模验证有限；源码的 promotion 和统计信用条件不同，不能把 README 概括当作所有候选都过同一道门 |

本轮推导：开发循环需要可读契约、失败诊断、确切候选、适当验证和变更依据；
安装/部署入口应共享同一治理事实。无需为一个局部插件预先引入完整演进优化
平台、固定 benchmark 或统计阈值；证明不退化的检查范围应匹配实际影响。

## 对已有要求的影响与未决项

- PF-014 继续拥有发现/装载已有工具与技能，PF-016 增加开发与在线部署。
- PF-010 的历史来源曾把 Tool/Middleware 实现限于官方；本轮明确允许获准
  Cordis 插件提供自定义 tool/service 等，当前资产表同步说明这一扩展。历史
  研究保留原来源事实，不把新要求伪写成 omne-next 原有承诺。
- PF-015 提供持久制品及隔离工作副本，SYS-RUNTIME-CONTINUITY 约束恢复；
  不沿用 DSH“进程重启即忘记定义”作为所有已部署插件的生命周期。
- 在途策略、代码信任等级和执行边界、构建依赖准入、持久部署的自动恢复条件、
  共享服务变更权限及验证门槛仍须建模。本轮只登记必要义务，没有选定替换协议、
  进程布局或自动批准规则，也未形成需要接受的架构方案。

[effects]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md
[services]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/03-services.md
[hmr]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/06-composition-and-hmr.md
[fiber]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts
[tool]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/extensions/tool-cordis/README.md
[runner]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/extensions/cordis-host-runner/README.md
[host-lifecycle]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/extensions/cordis-host-runner/src/lifecycle.ts
[raven-bootstrap]: https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/raven/plugins/bootstrap.py
[raven-registry]: https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/raven/plugins/registry.py
[raven-context]: https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/raven/plugins/context.py
[raven-plughub]: https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/raven/agent/tools/plughub.py
[raven-reload]: https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/raven/rpc/methods/reload.py
[raven-evolver]: https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/evolver/README.md
