# Model request runtime：P1 公开生产函数与双语包文档

实际运行日期：2026-09-27；Linux、Node 24.18.0、pnpm 10.28.1；源码及规范输入来自 `panqiwei/model-request-runtime`，基础 HEAD 为 `cb83084b88ce685a65fda2118854d2600ddbfff4`，包含归档中的未提交修改。D-076 接受的 runtime3、transport v3 投影逐字节未改。44 项施工输入除持续结算的唯一费用账本外，均与计划 revision 5 的观察哈希相同；其中已冻结资源另与 frozen 清单核对。

本次对象是生产包的公开 `invokeModel` 与 `planRequest/sendRequest/readStream/createPiAiTransport`，采用真实 core 判定器与流装配器。控制端为本机 TLS HTTPS，实际费用端为 OpenRouter；公开制品消费者位于仓库外，生产依赖闭包及符号链接均位于制品自身。这里没有调用 Cordis 服务、session log、目录或租户授权组合。

## 实际结果

| 对象 | 最终结果 | 原始输出（位于输入归档） |
| --- | --- | --- |
| model-request-runtime | build/typecheck 通过；成因检查 6/6 | `logs/p1-runtime-*-r2.txt` |
| pi-ai-transport | build/typecheck 通过；plan 12、真实 HTTPS 27，共 39/39 | `logs/p1-transport-tests-r2-final.txt`、`logs/p1-final-transport-typecheck.txt` |
| 唯一预算门 | 37/37，含两个 OS 进程锁与 SIGKILL 前/后、未知费用禁止继续、超 18 位金额精度和另一 OS 用户读取负控 | `logs/p1-budget-gates-final.txt` |
| 源码规则 | 实际扫描 27 包规则＋6 仓库路径规则，无违反 | `logs/p1-source-guards-r2.txt` |
| 双语包文档 | 13 包、26 份 README；44 个 TS 示例类型检查和执行均通过；完成时再核对代码块与实际执行输入逐字相同 | `readme-consumer/inventory.json`、`execution.json`、`logs/p1-readme-typecheck-r2.txt`、`logs/p1-readme-execution-1.txt`、[清单](readme-completion.json) |
| 制品消费者 | r1/r2 的生产依赖制品在仓库外通过公开入口检查；paid 请求也消费同一制品公开入口 | `logs/p1-external-consumer-r2.txt`、`logs/p1-artifact-deploy-r2.txt` |
| 格式与差异 | 21 个实际 TS/JSON 文件的 scoped 格式检查及 git diff --check 通过 | `logs/p1-final-format-files.txt`、`observations/p1-final-format-command.json`、`logs/p1-final-diff.txt` |

文档示例执行指模块实际加载/求值；导出的网络调用示例函数没有为文档检查发送请求。具体业务分支以公开生产与 HTTPS 检查的范围读取。

HTTPS 检查包含一次请求及固定路由、完整输入所有权、首内容门私有等待/成功/失败、实际 socket 停止、heartbeat 首内容时限、已有内容后的 idle 时限、原始工具参数分片、opaque 超大整数、length 不提前封口、严格 JSON/UTF8/SSE 协议拒绝、带内码与原始 HTTP 错误、302 零跟随、排队取消及排队时限本地分类、竞争 reader 拒绝和诊断回调失败不改变正常业务结果。时间相关检查只在本机实际测试配置和 fixture 下成立，不是任意调度的形式证明。

## 实际 OpenRouter 请求

每一行都是一次独立 `invokeModel`，指定一个 provider，sendCount=1，readerStopped=true，outcome=complete。冷暖输入采用唯一 runId 的受控合成前缀；没有租户/会话业务数据。费用直接采用无损 upstream usage 数字，未用请求值填实际执行方，也未使用 generation GET 回退。

| 实现修订／模型 | 冷读缓存 token／USD | 暖读缓存 token／USD | 请求路由／上游实际执行方 |
| --- | --- | --- | --- |
| 1：openai/gpt-6-sol | 0 / 0.0146535 | 5835 / 0.001233 | openai / OpenAI |
| 1：anthropic/claude-sonnet-5 | 0 / 0.023519 | 9378 / 0.0019496 | anthropic / Anthropic |
| 2：openai/gpt-6-sol | 0 / 0.0146585 | 5837 / 0.0012334 | openai / OpenAI |
| 2：anthropic/claude-sonnet-5 | 0 / 0.023529 | 9382 / 0.0019504 | anthropic / Anthropic |

definition revision 为 1；configuration 的完整 values 及 implementation revision 随每条 outcome 保留。OpenAI 使用 automatic；Anthropic 的本次显式配置为 TTL `5m`、breakpoints `system`/`last_message`，不是代码默认 TTL。这只证明这两次暖读报告了正缓存读数，**没有执行 TTL 到期验证**。

两次 run 分别为 `345c6a7f-d414-48af-82a6-193d55cafeda` 与 `5ca9531b-5573-42eb-a5cf-56be6b3dc81f`，原始请求/SSE/outcome/诊断/回执/summary 位于 `paid/p1-public-<runId>/`。实际结算新增 8 笔 USD 0.0827264，原唯一账本由 162 增为 170 settled，未结算 0，累计 USD **1.139960389500000000**。账本快照只作观察，不能作为继续 paid 请求的账本替身；继续请求必须重开原唯一 live ledger，USD100 总额与 USD50 研究分配不重置。

实际输出目录 0700、文件 0600，UID1001；逐文件经 `sudo -n -u nobody cat` 实测拒读。预算检查另有公共负控可读。全部归档输入及两个制品按真实凭据全文与所有 8 字符连续窗口扫描，无命中；凭据及其哈希没有进入证据。[权限观察](privacy.json)、[扫描结果](secret-scan.json)。

## 可恢复输入与重跑

- [源码、配置、原始输出归档](source-config-and-runs.tar.gz)：`input/source/` 为当前 17 包、开发工具与规范输入；`input/current-inputs/` 为 44 个精确施工输入；其余为实际日志、文档消费者、paid 录制与唯一账本最终观察。恢复代码时在上述 HEAD 的干净检出上叠加 `source/` 及 `current-inputs/`，不要把 ledger 观察复制成新的 live 账本。
- [r1 生产制品](public-artifact-r1.tar.gz)、[r2 生产制品](public-artifact-r2.tar.gz)：保持实际运行的字节及内部依赖闭包，解压到仓库外后 `node artifact/interface.mjs` 只加载公开接口。r2 之后的变化只有 README 说明/末尾空行和 runtime 包 files 列表去除三个不存在的 pi 文件；这些当前文档在源码快照里，未冒充 paid 制品当时的字节。
- [输入与输出 SHA-256](input-and-output-hashes.json)、[施工输入观察对照](input-observations.json)、[工具环境](environment.json)提供定位，不代替结果。

控制检查在上述检出叠加快照后执行：`pnpm install --frozen-lockfile`；先构建实际 workspace 依赖，再执行 `pnpm --filter @omne-harness-lite/model-request-runtime build`/`typecheck`/`test`，以及 pi-ai-transport 同三项。预算检查命令为 `node --test tools/model-probe/tests/*.test.mjs`，扫描为 `pnpm --filter @omne-harness-lite/ts-checks scan`。每个 package 的脚本在归档 package.json 中。文档消费者使用 44 个实际代码块及 tsconfig，显式链接对应已构建 workspace 包后用其 TypeScript 编译器检查/执行；该文档检查不是 44 个独立安装制品的证明。

Paid 重跑不是上述无费用复验的一部分：`construction/p1-paid-public.mjs` 记录本次唯一预算保护与公开制品调用方式，必须另有明确凭据和原 live ledger。不能自动重跑本证据的费用请求，也不能用录制输入代替真实上游命中。

## 边界与原始失败

这是 P1 的有界实现增量，尚未闭合完整 T/SC/G 比较门；官方生产认证仍 **0/37**。未覆盖十三操作、真实日志耐久与 opened 回执未知恢复、租户/Cordis 服务装配、动态贡献取得/退役租约、完整模态、组织自定义提供者、TTL 到期、跨 OS、generation 对账回退与完整观测故障矩阵。HTTP 非成功结果的首部留痕、负计数关系诊断及所有工具片段/队列的总内存界限也尚未完成对应完整义务。独立总体实现验收未执行。

所有保存的建设失败日志保留，包括错误 AttemptId fixture、TypeScript 输入投影不匹配、格式命令传目录被拒、旧竞争 reader 断言与已接受 typed rejection 不一致，以及 Node Agent 中排队 destroy 不及时停止的真实反例。最终实现改用可取消的显式 admission 队列，对相应实际 socket/零第二 HTTP 做了复验。中间每一失败版本的完整源码并未保存，因此这些旧失败仅按历史日志读取；r1/r2 paid 制品及最终源码快照完整，不将最终源码说成每次旧运行的输入。

追加实际对账：[全体 realization 原始结果](p1-realization-check.txt)退出 1，有 7 个其他节点的 8 处 kind/源码位置格式错误；[HEAD 字段对照](p1-realization-baseline.json)确认这些字段与当前 HEAD 相同，本次没有修改它们。本次两个 model 节点经同一个 Checker 的 entry/architecture/bindings/links 检查均通过，[精确范围和结果](p1-realization-scoped-check.json)可复核；这不是全仓 design-check 通过。最后一次差异空白检查通过。当前映射、checker 与运行脚本补充保存在 [对账快照](realization-and-final-checks.tar.gz)，SHA-256 沿补充文件哈希表读取。
