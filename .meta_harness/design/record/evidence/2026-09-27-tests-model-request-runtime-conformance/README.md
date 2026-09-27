# Model request runtime：revision 4 传输符合性补证

2026-09-27 在 `panqiwei/model-request-runtime` hub 实际执行，Git HEAD
`cb83084b88ce685a65fda2118854d2600ddbfff4`；实际源码有未提交修改，按快照重现。
本次消费 D-076、精确 runtime3／transport v3 投影及 revision 5 施工计划，
修复既有 T-16／T-8 义务，不改变冻结规格。此前 revision 3 的
[P2 run](../2026-09-27-tests-model-request-runtime-p2/README.md)保留原结果。

## 实际结果

以下路径均在 `source-config-and-runs.tar.gz` 的 `input/checks/p2-conformance/` 内。

| 检查 | 实际结果 | 原文 |
| --- | --- | --- |
| 独立符合性初次筛选 | T-16 实际失败；其余 11 项 filtered/skipped | `opaque-tests-1.txt` |
| 初次完整符合性 | 10 passed／2 failed，保存当时源码及 dist | `tests-1.txt`、`run-1-inputs.json`、`run-1-inputs/` |
| 修复后最终符合性 | 13／13 passed；85 项输入执行前后无漂移 | `tests-3.txt`、`run-3-results.json`、`run-3-inputs/` |
| 最终 transport 整包 | 209 passed，6 个测试文件，类型无错误 | `tests-final-2.txt` |
| runtime 整包 | 6 passed，类型无错误 | `runtime-tests-final.txt` |
| 构建、类型、维护范围格式与源码规则 | exit 0；27 包规则＋6 仓库路径规则通过 | `build-main-3.txt`、`typecheck-final.txt`、`format-final-4.txt`、`source-scan-final.txt` |
| 两包双语 README | 4 份、10 个实际 TS 代码块类型检查与模块执行通过 | `readme-checks-final.txt`、`readme-consumer-r4/`；[readme-checks.json](readme-checks.json) |
| 仓库外 revision 4 制品 | 根入口及真实 Cordis／本机 HTTPS 消费均 exit 0 | `artifact-check-r4-3.txt`、`artifact-r4-results.json`、`p2-artifact-*.mjs.r4.stdout` |

环境为 Linux、Node 24.18.0、pnpm 10.28.1、Vitest 4.1.11、Cordis 4.0.4；
详见 [environment.json](environment.json)。README 模块执行未调用导出的 `invokeOnce`。

T-16 反例是不同 reasoning 明细身份或未知 metadata 被并成一项，丢失原数据；
修复后仅在全部非文本 metadata 无损一致时拼接文本。精确 JSON 比较使用公开数值接口，
负控同时区分大于 2^53 的相邻整数及 null／缺席。T-8 反例是 provider 变化诊断名
`model_transport.servingProvider_changed` 与已采用的
`model_transport.serving_provider_changed` 不符；修复保留首次实际上报原串。
共享 implementation revision 从 3 升到 **4**，definition revision 仍为 1。

新增场景还覆盖多行 SSE／任意 UTF-8 byte 切分、真实 socket reset、半截工具参数不封口不重发、
无码或非整数码的带内错误、异常 finish、并行工具交错经真实 stream-assembly 封口、
details-only 不打开首内容门、未终止 terminal 帧及 DONE 后尾帧。
逐场景条款与结果见归档 `run-3-results.json`，这里不把这些子项写成全部 T／SC／G 完成。

仓库外制品注册 37 个 revision 4 窄定义，根入口在拒绝解析 Cordis／kernel-basis 的 loader 下可用；
插件消费者显式提供 Cordis 4.0.4 peer，实际请求只到本机 HTTPS，取消后确认 socket 停止，
tracked callback 未完成仍保留引用，真实贡献装卸完成。所有制品链接只指向制品内部。
这不表示固定 OpenRouter plugin 已发送上游生产请求。

## 输入、失败和重现

[input-and-output-hashes.json](input-and-output-hashes.json)记录 1414 个输入文件及两份归档 SHA256：

- `source-config-and-runs.tar.gz`：`1c3767bb8207e8c93aba05085aec7bb08dc7ef0cfb2fff0495d4b8b83bb3111c`。
- `public-artifact-r4.tar.gz`：`a629a2028649e44b7d822c14867b72aeefe828a8e078d146711d8fd52486f5fb`。

源码归档包括 15 个实际产品依赖包、workspace 配置及锁、规范资源、检查工具／入口、
最终输出和保留失败；独立符合性三次运行各有 85 项输入／源码／dist 快照。
主调度的全部中间失败并非都有完整源快照，不用最终代码声称可重演所有中间失败。

其他保留失败包括向格式入口传目录或不属维护范围的 Markdown／锁文件、
pnpm 10 deploy 缺 `--legacy`，以及初次搬移制品时发现 workspace 自引用逃出制品。
最终制品只对已核字节一致的主包自引用重定位，其余链接仍强制内部闭合，未放宽任意外部解析。
这些失败原文保留，不覆盖为通过；仓库维护范围格式最终为 exit 0。

重现源码测试时解包 `input/source/` 为独立 workspace，按保存的锁与工具链安装，
运行原始输出中的 pnpm 命令；本机 TLS fixture 需要 OpenSSL。README consumer 的 workspace
链接按其 `dependency-links.json` 重建，不作为独立安装证据。
外部制品解包后在 `artifact/` 分别执行 `node p2-artifact-root.mjs` 和
`node p2-artifact-consumer.mjs`；完整精确依赖字节及消费者在同一归档内。

[input-observations.json](input-observations.json)对原计划 44 项输入逐项核对：
仅可变 transport verification 和 ledger 观察不同，冻结输入均一致。
[secret-scan.json](secret-scan.json)检查完整实际凭据及全部八字符窗口，命中 0；不记录凭据或其哈希。
本轮付费 0，唯一账本仍为 170 settled、0 unsettled，累计 USD 1.139960389500000000，
USD100 上限不重置。

## 证据边界

本次是有限组件／真实本机 TLS／制品检查，未执行形式任务，不是独立总体 QA 或接受决定。
没有上游实际请求、缓存命中／TTL 到期或 revision 4 模型认证，官方完整认证仍 **0/37**。
实际 provider 对应／错配规则、工具未定头片段与队列总界限、完整脱敏／诊断矩阵、
全部参数／模态 offer 与配置 Schema、目录采用、租户授权、宿主服务替换、
十三操作／耐久锚点／opened 回执未知／结算恢复及 B1～B5 尚未由本次结果闭合。
本机有限交错没有枚举全部并发调度、外部 I/O 故障或性能规模；不形成无条件形式化证明。

## 补充：同步前实际映射核对

归档后，两个 model 节点的 entry／architecture／bindings／links 检查错误为 0，
design checker 在 `formal=skip` 下 exit 0，实际形式任务 0。原始输出、六个映射正文及
检查入口追加于 `final-mapping-check.tar.gz`，精确输入与归档哈希见
[final-mapping-check.json](final-mapping-check.json)。这是同步 origin/main 之前的实际状态；
不表示全体其他 realization 节点通过，不关闭 B1 的组合缺口。两份主归档保持原字节。
