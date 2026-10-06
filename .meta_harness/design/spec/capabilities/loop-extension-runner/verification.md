# 验证义务与有限覆盖范围

本页维护 `capability.loop-extension-runner` 的规范场景、消费者对齐、有限模型及真实组合责任。当前承诺与采用范围从[架构维护入口](../../../architecture/README.md)、[规格身份清单](../../../registry/README.md)与[当前契约 v5](v5/contract.md)定位。下文保留精确版本的场景及模型导航，不把某版检查推广到其他版本。
接受、实现和验证分别判断。单次运行输出、修复波、提案及评审留执行工作树 `tmp/`；本页不宣布当前实现通过或某缺口已关闭。

## v5 发布前破坏性演进

精确链 MP5 / Directory5 / MS6 / MR7 / LC6 / RT7 / runner5 的坐标及共享结构须一致；既有 IV、CB、日志、资产和 hooks 等依赖不自动升级。源码、Schema 引用和形式工件字节核对只证明相应结构，不证明工具执行或真实实现。
不兼容输入沿原边界拒绝，不走旧 codec、不降级/回填，也不改写或清空用户数据。当前受理工作、不可变快照、未知提交、原批认回、恢复、结算仍由原 owner 承担；runtime / runner / 日志须验证责任不丢失，及输入上限、Pending 回复、完整重试历史、RT S-34 完整失败重取。

## 证据义务

### 形式工件

回放七义务的规范依据见 [S-35](v2/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合)，实际有限模型及配置归 [v3 formal](v3/formal/README.md)和 [v4 formal](v4/formal/README.md)。模型存在不意味着当前实现已验证。

### 规范场景

这些场景要求真实实现及相应组合，不能由静态检查或有限模型代证。

| 场景 | 证据形式 | 验证范围 | 说明、责任与受阻 |
|---|---|---|---|
| [S-36 逐件顺序与改写叠加，放行判断看到最后那一份](v2/contract.md#s-36-逐件顺序与改写叠加放行判断看到最后那一份) | 演练，**清单故意把放行判断排在前面** | 真实组合 | 排在末位是清单给的时，这条什么都证明不了；必须让 runner 自己挪 |
| [S-37 回放不出第二张卡、不再问第二遍模型](v2/contract.md#s-37-回放不出第二张卡不再问第二遍模型) | 演练 ＋ **协程回收** | 真实组合 | 等待原语与卡片契约的组合义务见（[G-8](v2/contract.md#十三已知缺口)）；三支（答复后最终结论、答复后新一轮、偏离即停）必须都跑 |
| [S-38 停机不产生第二条结论](v2/contract.md#s-38-停机不产生第二条结论) | **故障注入**，两个停机点同一次对比 | 真实组合 | **可跑（锚由测试给）**：锚改为调用方交来的不透明键，测试驱动代 loop 对同一次经过交同一把；锚的算法（[G-1](v2/contract.md#十三已知缺口)）不在本场景里 |
| [S-39 装配清单变了，回放报不一致](v2/contract.md#s-39-装配清单变了回放报不一致) | 演练 | 真实组合 | 之后运行怎么收归 loop（G-8），本场景只断言「没有新结论、一条不少」 |
| [S-40 注入链只有一层](v2/contract.md#s-40-注入链只有一层) | 演练 | 真实组合 | 必须观察到 loop 到了下一个状态点——只看「没有第二条提醒」不够 |
| [S-41 不可用、报错、否决三者分得开](v2/contract.md#s-41-不可用报错否决三者分得开) | 演练 ＋ **故障注入** | 真实组合 | 最容易被「出错就当无意见」抹掉的一条，**必须真跑**。兼容件非阻断错误一支：**必须读会话日志里那条记录**（`skipped: errored` ＋ 成因），只看链继续会漏掉静默吞错 |
| [S-42 系统自带件不可用时由指定挂件顶上](v2/contract.md#s-42-系统自带件不可用时由指定挂件顶上) | **故障注入**，五件各一次；另跑「清单里没有放行判断」「转换件不可用 × 纯文本」「系统自带件写了 `unavailability`」 | 真实组合 | 模态转换、重试、循环探测的能力标识责任见（[G-3](v2/contract.md#十三已知缺口)）；放行判断须按其契约标识验证 |
| [S-43 找不到清单不是空链](v2/contract.md#s-43-找不到清单不是空链) | 演练 ＋ 故障注入 | 真实组合 | —— |
| [S-44 连续被否决的回复被收住](v2/contract.md#s-44-连续被否决的回复被收住) | 演练 ＋ **在第 N−1 次之后停机**；另跑「L2 阈值与上限不同」「设置读不到」 | 真实组合 | 受阻：连续否决上限这项运行时设置的名字与默认归 agent loop 那一程 |
| [S-45 模型的回复落盘之前改不了](v2/contract.md#s-45-模型的回复落盘之前改不了) | 演练，四支 | 真实组合 | 可改成员表归 `data.loop-extension` S-23 |
| [S-46 retry 被拒，按上交继续](v2/contract.md#s-46-retry-被拒按上交继续) | 演练，**跨契约**（本契约 ＋ 模型请求运行时的 `canDispatchAgain`）；三支 | 真实组合 | 只读守卫由模型请求运行时判，只跑本契约这一半证明不了 |
| [S-47 过期的协程写不进](v2/contract.md#s-47-过期的协程写不进) | **故障注入**（两副协程）；另跑一次无运行的经过（入站那一侧）两副协程并发 | 真实组合 | 日志写入边界上的栅栏与判重键已有窄口接口（`capability.session-log/v2#S-8`、`#S-10`），**会话日志最小提供者到位即可跑**（锚由测试给）；栅栏的前提（尝试开始先落）仍归 loop 那一程（G-8），测试驱动代它先落 |
| [S-48 放行判断一轮汇合、凭据扣住、答复只认自己的卡](v2/contract.md#s-48-放行判断一轮汇合凭据扣住答复只认自己的卡) | 演练，**跨契约**（本契约 ＋ 放行判断 ＋ 执行运行时 ＋ 兼容层 ＋ 会话资产注册表的报告）；另跑 `admit` 整批失败、拆批、解析不了的调用、报告里查不到条目、`not_in_composition`、别的运行的报告 | 真实组合 | 受阻：凭据交出的表示（[G-16](v2/contract.md#十三已知缺口)）、自由作答落成授权表达的写入者（`capability.tool-admission` 的 G-2）、答复三种表示（[G-17](v2/contract.md#十三已知缺口)）；「查不到条目」那一支的记录原因落处（[G-19](v2/contract.md#十三已知缺口)） |
| [S-49 声明了「不可用即否决」的租户件](v2/contract.md#s-49-声明了不可用即否决的租户件) | **故障注入**，四支 | 真实组合 | 最容易被「不在就跳过」一刀切掉的一条，**必须真跑** |
| [S-51 运行被取消，这一次 `dispatch` 以 `cancelled` 收场](v2/contract.md#s-51-运行被取消这一次-dispatch-以-cancelled-收场) | 演练 ＋ **在一件兼容件的子进程跑着时叫停**；另跑「叫停落在两件之间」 | 真实组合 | 兼容件执行环境的来路已有接口契约（实际来源责任见 [G-20](v2/contract.md#十三已知缺口)），**验收装配里由最小提供者答测试种子即可跑**；兼容件起子进程要的那一项宿主机允许产品未给（`capability.execution-environments` v2 G-3），测试种子代给——**这一支只在验收装配成立**。取消请求怎样落日志归 loop 那一程（[G-8](v2/contract.md#十三已知缺口)）。断言「在途那一件没有记录、后面的件没被求值、没有提醒」 |
| [S-52 执行环境句柄只及本会话、调用返回即失效](v2/contract.md#s-52-执行环境句柄只及本会话调用返回即失效) | 演练（两个会话）＋ **故障注入**（会话持有的租户读不到） | 真实组合 | 句柄解析出的两样已有接口契约（`capability.session-tenancy/v2#S-8`、`capability.execution-environments/v2#S-11`），**最小提供者答测试种子即可跑**（实际来源须另验，[G-20](v2/contract.md#十三已知缺口)）；「过期句柄再解析失败」这一支最容易被「句柄就是会话标识的别名」抹掉，**必须真跑** |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| 尝试栅栏：只收序号最大那次尝试的写入 | [S-21](v2/contract.md#s-21-dispatch一次经过) ② | agent loop 那一程的契约（前提：尝试开始先落）＋ 日志写入边界（`capability.session-log/v2#S-10`） | 那两份的场景；本契约 S-47 |
| 同一次经过交同一把锚、不同经过不同的 | [S-5](v2/contract.md#s-5-一次经过) | agent loop 与入站受理方（算法归 loop 那一程，[G-1](v2/contract.md#十三已知缺口)） | loop 那一程的场景；本契约的场景由测试驱动代交 |
| 一批判完之前一个都不执行 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 3、9 条 | agent loop ＋ 执行运行时（凭据） | 本契约 S-48 跨契约演练 |
| 卡片按 (这一次经过, 那一件, 那条 `ask`) 恰一张、先于「在等人」可见 | [S-27](v2/contract.md#s-27-ask交出卡片并停在这一位置) | 等待原语（loop）＋ PF-008 卡片契约 | 那两份的场景；本契约 S-37 |
| 回放偏离的检出 | [S-28](v2/contract.md#s-28-回放) 第 4 条 | 等待原语（loop） | 本契约 S-37 第 ② 支 |
| `before_terminal` 否决理由到 agent 眼前 | [S-23](v2/contract.md#s-23-效果之后的事由谁做) | 上下文组装（PF-010） | [G-8](v2/contract.md#十三已知缺口) |
| 各件求得的位置、维度、干预力、策略；工作区来的只观察 | [S-6](v2/contract.md#s-6-拓展件链从装配清单来) 第 3 条 | 资产求值 ＋ 装配 | `capability.asset-evaluation` 的场景 |
| 无运行的经过按 (经过, name) 条件写入 | [S-21](v2/contract.md#s-21-dispatch一次经过) ② | 日志写入边界 | 本契约 S-47 第二支 |
| 连续否决上限是一项运行时设置、与 L2 分开 | [S-30](v2/contract.md#s-30-连续被否决的回复) 第 3 条 | agent loop 那一程（设置项的名字与默认） | 本契约 S-44 |
| 执行环境句柄解析出的两样（会话持有的租户、会话级执行环境）有来路 | [S-50](v2/contract.md#s-50-执行环境句柄的读面) 第 1 条 | 接口：`capability.session-tenancy` v2、`capability.execution-environments` v2（窄口，最小提供者承接）；真承接者：会话那一程 ＋ PF-005（[G-20](v2/contract.md#十三已知缺口)） | 那两份接口契约的场景；本契约 S-52 |
| 运行被取消时先落取消请求、再叫停在途的 `dispatch` | [S-21](v2/contract.md#s-21-dispatch一次经过) ② 末句 | agent loop 那一程 | 本契约 S-51 |

## 对齐义务

下表保留跨契约验证点。各字段、失败值和记录形状由对应精确契约拥有；最终消费者应核对所采用的正文，不继承历史核对签字。

| 来自 | 条款 | 本契约落在哪 |
|---|---|---|
| `capability.tool-admission` v2 S-29／S-30 | ① 放行判断钉 `before_action` 链末（装配清单义务，runner 强制） | [S-6](v2/contract.md#s-6-拓展件链从装配清单来) 第 2 条 |
| `capability.tool-admission` v2 S-14／S-29 | ② 拒绝投影成 `veto` 时 `reason` 原样带拒绝原因 token；runner 自己写的 `reason` 不借用它们 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 6 条 |
| `capability.tool-admission` v2 S-24／S-29／S-34 | ③ `admit` 整批失败（含 `unavailable`）或它不可用时，同批每一项都得 `vetoed` | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 7 条、[S-17](v2/contract.md#s-17-系统自带件不可用时一律关门)、[S-48](v2/contract.md#s-48-放行判断一轮汇合凭据扣住答复只认自己的卡) 末支 |
| `capability.tool-admission` v2 S-26 | 放行判断件的能力标识 `omne-official:admission-judgment` | [S-7](v2/contract.md#s-7-系统自带件怎样挂上) |
| `capability.tool-execution-runtime` v2 S-63 | 卸载判定件的能力标识 `omne-official:offload-judgment` | [S-7](v2/contract.md#s-7-系统自带件怎样挂上) |
| `capability.tool-admission` v2 S-12／S-22 | ④ 答复以四个选项 id 或 `declined` 交回重判；自由作答不作为答复，先落授权表达再不带答复重判 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 8 条、[S-28](v2/contract.md#s-28-回放) 第 4 条（新一轮 `ask`） |
| `capability.tool-admission` v2 S-31 | ⑤ 同批有等人的项时扣住已放行项的放行凭据，不交给执行运行时 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 9 条 |
| `capability.tool-admission` v2 S-28 | ⑥ 兼容件复用四档选项的卡，答复不带授权、不作为答复交给放行判断 | [S-28](v2/contract.md#s-28-回放) 第 4 条、[S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 8 条 |
| `capability.tool-admission` v2 S-21／S-23 | 整批一次、按轮 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条 |
| `capability.modality-projection` v2 S-23 | 转换件在 `before_persist_message` 上是最后一个动块的 | [S-6](v2/contract.md#s-6-拓展件链从装配清单来) 第 2 条（本契约取整条链的末位） |
| `capability.modality-projection` v2 S-20／G-2 | 转换件对模型回复交回「挂派生表示」的 `rewrite`，不算 D-5 要防的改写 | [S-14](v2/contract.md#s-14-结论合不合法两类判断) ② 前两行 |
| `capability.modality-projection` v2 S-21／S-22 | 转换件不可用只否决含要转的块（给模型看、还没带派生属性的语音块、图块、文件块，对方 S-20 ①）的消息 | [S-17](v2/contract.md#s-17-系统自带件不可用时一律关门) 转换件那一行 |
| `capability.model-request-runtime` v2 | `select_model` 的合法目标判定；`retry` 的只读再发守卫 `canDispatchAgain(session, callId, plan) → {allowed} \| {refused{why}}`（MRR S-50），`why` 与 `dispatchAgain` 的拒绝同表，已终结是操作失败 `alreadyEnded` | [S-14](v2/contract.md#s-14-结论合不合法两类判断)、[S-26](v2/contract.md#s-26-retry-与它被拒) |
| `capability.asset-evaluation` v2 | 各件求得的四样值 | [S-6](v2/contract.md#s-6-拓展件链从装配清单来) |
| `capability.asset-registry` v2 S-11 | 报告带会话与运行；`effectivePermissions` 对 `tool` 表每条条目恰一项、以 `ModelToolName` 为键；条目在快照里、能力标识不在此刻组合里写 `not_in_composition`；`unavailable` 只留给求值失败；查不到键即这一次尝试没有这条条目 | [S-21](v2/contract.md#s-21-dispatch一次经过) ① 的核对、[S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条 |
| `capability.tool-admission` v2 S-8 | 报告里「这一项缺席或写着 `unavailable`」即不可用 ；runner 不把查不到条目的调用交进 `admit`，对方那句「缺席」对 runner 这一侧不再出现；`not_in_composition` 只指条目仍在快照、能力标识不在此刻组合里 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条 |
| `data.loop-extension` v2 S-14 | `batch` 可含不在本次 `actions` 的 `CallId`（解析不了的调用） | [S-21](v2/contract.md#s-21-dispatch一次经过) ①、[S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 1 条 |
| `capability.tool-execution-runtime` v2 S-23 | 报告里查不到条目、没进放行判断的调用（没有凭据）交到执行运行时即刻收场 `unavailable{no_such_entry}` | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条（指路，不登依赖） |
| `data.loop-extension` v2 S-11／S-41 | 统一输入必带执行环境句柄 `environment`（`EnvironmentHandle`），读面归本契约 | [S-10](v2/contract.md#s-10-逐件顺序求值先落后算) 第 1 条、[S-50](v2/contract.md#s-50-执行环境句柄的读面) |
| `capability.tool-execution-runtime` v2 S-23 ① | `submit` 带的 `report` 与本契约 `admission.report` 是同一份值，两边都核会话、运行与尝试三者、不现算 | [S-21](v2/contract.md#s-21-dispatch一次经过) ②、[S-32](v2/contract.md#s-32-装配给的保证-vs-协议须给的保证)（指路，不登依赖——对方反向消费本契约） |
| `capability.modality-projection` v2 S-18／S-20、`capability.hooks-import` v2 S-18／S-19／S-27 | 转换件的 `tenant`、兼容件的执行环境从执行环境句柄取；解析不出按 S-50 第 4 条归不可用或报错；运行被取消时兼容件的子进程被停下、那一次求值不留记录 | [S-7](v2/contract.md#s-7-系统自带件怎样挂上)、[S-50](v2/contract.md#s-50-执行环境句柄的读面)、[S-21](v2/contract.md#s-21-dispatch一次经过) ⑥、[S-34](v2/contract.md#s-34-撤下回收与取消时在途的经过) |
| `data.loop-extension` v2 S-6／S-31／S-33 | 不可用处置：声明成员 `unavailability ∈ skip \| veto`（缺席 = `skip`）；不可用记录带实际采用的 `unavailability ∈ skip \| veto \| fallback`；系统自带件由指定挂件顶上 | [S-12](v2/contract.md#s-12-不可用与报错runner-怎么分)、[S-17](v2/contract.md#s-17-系统自带件不可用时一律关门) |

还须验证以下跨契约细节：

- 放行判断不可用的记录不带 output、带 `unavailability: fallback`、效果 vetoed；admit 失败记 `skipped: errored` 和 error，按 `treat_as_veto` 产生 vetoed。记录形状唯一归 tool-admission S-29/S-34。
- runner 把转换件置整条链末位，强于 modality-projection 所要求的“最后一个动块的”；不得只验证后者。
- `effectivePermissions` 来自同一报告；报告的 session/run/attempt 三者与调用相同，交 submit 的 report 仍为原值。查不到条目、not_in_composition、求值 unavailable 三者不可折叠。
- 兼容件非阻断错误固定按 ignore，不取有效策略、不进 onError，日志须含 `skipped: errored`、`output: observed` 和成因；非零退出保留退出码。原生件及执行环境撤除仍按有效策略。只观察链继续不能证明未吞错。

### 形式义务：回放的行为模型

七义务为 OneFinalConclusionPerPiece、CommitBeforeNext、ReplayReproducesEffect、RemindersExactlyOnce、OneCardPerAsk、StaleAttemptCannotWrite、AnsweredPassCompletes。前提为常量有界、实现结果非确定、栅栏与条件写原子、答完后再调 dispatch 的显式弱公平；每项映射必须标明对应条款、性质与前提。
关掉先落、按锚判重、栅栏的否定配置须反驳指定性质，用于 validity-check，不登记为预期通过的 formal task。效果合成、处置表、reason/error 措辞、三种答复及一轮一次 admit 被建模方式吸收，必须按 S-41/S-42/S-46/S-48/S-49 真验。

## 变化的影响

调用方提供不透明 anchor；一批 anchors 同序且两两不同，缺失或不合为 invalidInput。同一次经过使用同一锚、不同经过使用不同锚的算法归 loop/入站 owner；测试给锚只能验证 runner 半边。replay 仍带 subject，不能从主体推锚。

执行环境句柄的租户与环境来自 session-tenancy / execution-environments，依赖在场来自 assembly-manifest，栅栏与判重来自 session-log。验收种子不得替代产品的真实来源和授权。取消先落日志后通知 runner，已经提交的保留，在途那件不留记录、后件不求值、不补提醒；组合契约另验信号来源及子进程停止。

## v3 精确消费演进

规范由 [v3 契约](v3/contract.md)拥有；共享形状仍由 data 拥有，能力不增加 Schema。

- 完整适配绑定的失败主体、发出记录及原绑定响应保持；未解析工具调用保留，但不因此取得派发资格。
- 当前拓展表沿 readHead 的 E 与同会话 readHistory 读取；E1 表不得改拿全局最近 E2。PermissionValue.allowed 按 observe < rewrite < veto 取最强合法档，空/非法/超过所选正文声明为 unavailable，零件求值，不修补来源。
- 默认重试身份归 runtime S-67；沿原 after_model_call/failure 声明，不增设 power/onError。
- 作者 inject 给完整身份/时刻；自产提醒的日志唯一 ID 与当前 Instant 记入结论。前置冲突为输出不合法；结论后同 ID 异内容为 replayInconsistent，不改结论、不重新生成提醒。
- refused/alreadyEnded/callNotFound/wrongPhase 按原 onError；unavailable/调用边界 invalidInput 同名失败，不归罪已通过表示检查的作者，保留提交前缀。

### Runner 模型的有限范围

四份正向配置和十份否定配置对应七义务及三个额外观察断言，精确配置见 [v3 formal](v3/formal/README.md)。正配置涵盖两件一 worker 的有限尝试/crash、一件两 worker 的判重/栅栏竞争、一件一 worker 的显式弱公平进展；TypeOK、固定耐久前提和有限结果均不构成无界证明。

稳定锚、唯一身份、时钟、可信声明、真实耐久介质和原子存储是外部前提。每件至多一次 ask、二值改写、有限尝试/crash不覆盖任意链长、两件两 worker 全部组合、多轮 ask、适配绑定/精确 JSON、E1/E2 读取、后置 ID 冲突、嵌套提醒 veto、整批 admit、取消或执行环境。validity-check 预期出反例，不作为正常 formal task。

### 仍需真实执行的验收

| 义务 | 可失败验收场景 | 验证范围 |
|---|---|---|
| 真实链读取 | E1 当前表、别类别 E2 重载、reuse 删除，原 E/原版本正文与次序不变；缺项、空 allowed、超声明不得形成空链或调用件 | [examples §9](v3/examples.md#9-当前拓展表仍依-e1另一个类别已提交-e2) |
| 提醒身份与存储竞争 | 前置异内容冲突、同值认回、结论后 crash、并发抢占同 ID、alreadyRecorded 后不可读；原结论与身份不可改 | [examples §10](v3/examples.md#10-提醒身份创建时刻与并发占号) |
| 全部 guard 收场 | 真实 canDispatchAgain、日志、attempt 栅栏；已提交前缀保留，allowed 后先落后交回，invalidInput 不归罪作者 | [examples §11](v3/examples.md#11-candispatchagain-的全部收场映射) |
| 装配开闸 | 全部提供者 ACTIVE、guard.confirm 完成后才受理；故障撤除和热替换不放宽门 | 归真实装配 |
| 原其他场景 | S-36～S-52、取消、卡片、放行、句柄、跨会话隔离等仍各要实际执行 | 沿原义务；不能从新模型推断已交付 |

### 缺口与责任

缺口状态按当前采用版本契约核对。G-1/6/7/8/9/10/16/17/19/20 及其 owner 的验证责任保持。G-2/G-5 的链读取/权限表达不代证真实组合；G-3 的默认重试、模态转换和循环探测须分别核对，不由一项覆盖全部；G-14 的有限模型不关闭真实符合性义务。

## v4 完整失败历史

[v4 契约](v4/contract.md) S-53/S-54 拥有 modelCallId 和完整 retryConclusions。after_model_call/failure 每条 Conclusion 写前有唯一 modelCallId，完整历史不滤不去重；结论已落但 dispatch 未发生按原结论回放。默认件只计自己的已生效结论，定制件与跨调用结论不能冒充其次数。invalidInput / unavailable / replayInconsistent 分别对应写前不符、来源不可读及已落记录不符，不改历史或新增失败值。

### 证据义务

真实 runner 和日志须按 [v4 实例](v4/examples.md) §8/§12 检验完整 JSON、跨字段、原值、日志前缀完整性/会话归属、默认计次与实际再发组合。
继承 Runner 七义务、三个额外断言、四正向/十 validity-check，新增 FailureHistory 的四项映射：mixed-model-call → CallAssociation、lost-retry-history → LosslessHistory、return-before-conclusion → WriteBeforeReturn、reevaluate-concluded → ReplayNoReevaluation；精确前提见 [v4 formal](v4/formal/README.md)。
能力不发 Schema；data 是形状唯一拥有者。不建 Alloy：关系由共享形状、跨记录场景及有界模型承担，无新增独立结构对象。有限模型不证明真实存储、崩溃介质、历史前缀、身份授权、默认构件或网络再发；静态组合检查不等于真实 runner 验证，任务片段存在不等于登记或采用。
