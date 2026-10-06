# 验证覆盖与实际证据

## v5 发布前破坏性演进

本轮表达复评点名的版本自称、精确消费坐标与前驱执行声明已定点修订；MR7 与 runner5 当前产品依据按实际消费范围核对。字段结构、行为模型与既有操作责任保持不变。

本轮从已接受且冻结的 `capability.loop-extension-runner/v4` 起草 candidate v5，基线 `11c6c5b0`。源接受依据为 D-097（MP4）或 D-099（其余六份）；本版没有接受、冻结或实现完成声明。

### 变化的影响（本轮）

- 只更新本批精确链 MP5 / Directory5 / MS6 / MR7 / LC6 / RT7 / runner5，并删除旧格式 codec、只读、认回与结算过渡义务；既有 IV、CB、日志、资产与 hooks 等精确依赖不升级。
- 字段、值域、Schema 结构、操作、失败集合、发送门、数值与策略不变；RT S-34 的完整失败主体重取继续原义。data 的 `$id` / `$ref` 与注释中的对应坐标同步迁移。
- 不原地改写、清空或回填用户旧数据；不兼容输入沿既有边界明确拒绝。当前代际已经受理的任务、不可变快照、未知结果、原批认回与释放结算责任继续成立。

| 证据义务 | 可失败观察 | 状态 / owner |
|---|---|---|
| 精确依赖及 Schema 同构 | 除本批坐标和说明文字外出现结构差异即失败；所有 `$ref` 精确解析 | 本次检查结果见下；规格起草 / 集成 owner |
| 冻结源与形式工件保持 | 源登记 hash 改变，或 `.tla`/`.cfg`/`.als` 任一字节改变即失败 | 本次检查结果见下；规格起草 |
| 当前格式唯一运行路径 | 旧不兼容输入不得进入旧 codec、不得降级/回填、不得写/清空原数据 | 未开始；相应数据接收者 / 提供者 |
| 当前代际责任不丢失 | 当前任务未知提交或已受理工作仍由原 owner 认回/恢复/结算；新格式拒绝不能抹旧事实 | 未开始；runtime / runner / 日志提供者 |
| 公共操作与最终门不退化 | 原输入上限、Pending 回复、重试历史及 S-34 失败重取仍按原精确性质成立 | 未开始；对应消费者及验证 owner |

### 本次实际检查

本轮使用本树 `uv run --locked python` 执行临时审计脚本，实际输出：

```text
PASS: 584 frozen source hashes unchanged; 4 schemas structurally identical after exact $id/$ref remap; 276 refs resolved; 58 formal source/config files byte-identical; 86 explicit schema cases matched; RT S-34 unchanged except coordinates; all dependency clauses unchanged.
NOT RUN: TLC/Alloy; production old-format rejection; current-generation recovery/settlement and actual IO.
```

`uv run --locked python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip` 的本轮检查返回 0，输出 `PASS`（gate=internal; formal=skip）；候选中央登记尚待集成，检查通过不声称已登记或接受。`git diff --check` 返回 0。

本次核对本基线全部 **584** 个冻结资源，脚本与日志在本次任务区交集成 owner 保留，尚未归档为 record/evidence。本版 82 个规范资源中的 58 份形式源/配置均与各自前驱逐字节相同。**本轮形式工具未运行**，源有限结果只保留相同模型输入与断言范围，不提升为本版真实实现验证。当前格式拒绝与责任不丢失的实现场景仍为未开始；原有缺口的 owner 保留，旧格式分发缺口改为当前格式采用与拒绝证据。

### v5 候选完整失败历史

本版仅继承该专题性质与来源证据，实际状态统一见本节「本次实际检查」；不声明本轮重新运行模型或实现测试。


本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-24，第一轮独立评审处置之后；2026-09-25 修复波 1b、修复波 2、修复波 3 原地改）：没有任何证据。**
> `capability.loop-extension-runner` v2 是 `candidate`，**经过两轮独立评审、未接受**；尚无提供者设计、尚无源码。
> 回放的行为模型 **已触发、尚未建**（[契约 S-35](v2/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合)、[G-14](v2/contract.md#十三已知缺口)）；下面登记的规范场景**十六条一条都没演练**。
> **在模型建成之前，回放、先落后算、只跑一轮这几条只有场景这一种证据形式。**

## 证据义务

### 形式工件

**已触发、未建、未运行。**要检查的七条义务（名字、检查哪条性质、类型、前提）写在[契约 S-35](v2/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合)；下面「形式义务」一节记它的证据状态。
**这不是「已由模型覆盖」**：没有任何一条性质被一个模型检查过。

### 规范场景

**全部未开始**——它们要的是真实实现，而实现不存在。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-36 逐件顺序与改写叠加，放行判断看到最后那一份](v2/contract.md#s-36-逐件顺序与改写叠加放行判断看到最后那一份) | 演练，**清单故意把放行判断排在前面** | **未开始** | 排在末位是清单给的时，这条什么都证明不了；必须让 runner 自己挪 |
| [S-37 回放不出第二张卡、不再问第二遍模型](v2/contract.md#s-37-回放不出第二张卡不再问第二遍模型) | 演练 ＋ **协程回收** | **未开始** | 受阻：等待原语与卡片契约未起草（[G-8](v2/contract.md#十三已知缺口)）；三支（答复后最终结论、答复后新一轮、偏离即停）必须都跑 |
| [S-38 停机不产生第二条结论](v2/contract.md#s-38-停机不产生第二条结论) | **故障注入**，两个停机点同一次对比 | **未开始** | **可跑（锚由测试给）**：锚改为调用方交来的不透明键（2026-09-25 修订波，D-063 R-12），测试驱动代 loop 对同一次经过交同一把；锚的算法（[G-1](v2/contract.md#十三已知缺口)）不在本场景里 |
| [S-39 装配清单变了，回放报不一致](v2/contract.md#s-39-装配清单变了回放报不一致) | 演练 | **未开始** | 之后运行怎么收归 loop（G-8），本场景只断言「没有新结论、一条不少」 |
| [S-40 注入链只有一层](v2/contract.md#s-40-注入链只有一层) | 演练 | **未开始** | 必须观察到 loop 到了下一个状态点——只看「没有第二条提醒」不够 |
| [S-41 不可用、报错、否决三者分得开](v2/contract.md#s-41-不可用报错否决三者分得开) | 演练 ＋ **故障注入** | **未开始** | 最容易被「出错就当无意见」抹掉的一条，**必须真跑**。2026-09-25 加兼容件非阻断错误一支：**必须读会话日志里那条记录**（`skipped: errored` ＋ 成因），只看链继续会漏掉静默吞错 |
| [S-42 系统自带件不可用时由指定挂件顶上](v2/contract.md#s-42-系统自带件不可用时由指定挂件顶上) | **故障注入**，五件各一次；另跑「清单里没有放行判断」「转换件不可用 × 纯文本」「系统自带件写了 `unavailability`」 | **未开始** | 受阻：模态转换、重试、循环探测三件的能力标识未定（[G-3](v2/contract.md#十三已知缺口)）；放行判断那一行已由产品裁定（PF-012、D-059 U-5） |
| [S-43 找不到清单不是空链](v2/contract.md#s-43-找不到清单不是空链) | 演练 ＋ 故障注入 | **未开始** | —— |
| [S-44 连续被否决的回复被收住](v2/contract.md#s-44-连续被否决的回复被收住) | 演练 ＋ **在第 N−1 次之后停机**；另跑「L2 阈值与上限不同」「设置读不到」 | **未开始** | 受阻：连续否决上限这项运行时设置的名字与默认归 agent loop 那一程（未起草） |
| [S-45 模型的回复落盘之前改不了](v2/contract.md#s-45-模型的回复落盘之前改不了) | 演练，四支 | **未开始** | 原受阻于 `data.loop-extension` 的可改成员表，已在那边 S-23 写明（原 G-15 ①） |
| [S-46 retry 被拒，按上交继续](v2/contract.md#s-46-retry-被拒按上交继续) | 演练，**跨契约**（本契约 ＋ 模型请求运行时的 `canDispatchAgain`）；三支 | **未开始** | 只读守卫由模型请求运行时判，只跑本契约这一半证明不了 |
| [S-47 过期的协程写不进](v2/contract.md#s-47-过期的协程写不进) | **故障注入**（两副协程）；另跑一次无运行的经过（入站那一侧）两副协程并发 | **未开始** | 日志写入边界上的栅栏与判重键已有窄口接口（`capability.session-log/v2#S-8`、`#S-10`），**会话日志最小提供者到位即可跑**（锚由测试给）；栅栏的前提（尝试开始先落）仍归 loop 那一程（G-8），测试驱动代它先落 |
| [S-48 放行判断一轮汇合、凭据扣住、答复只认自己的卡](v2/contract.md#s-48-放行判断一轮汇合凭据扣住答复只认自己的卡) | 演练，**跨契约**（本契约 ＋ 放行判断 ＋ 执行运行时 ＋ 兼容层 ＋ 会话资产注册表的报告）；另跑 `admit` 整批失败、拆批、解析不了的调用、报告里查不到条目、`not_in_composition`、别的运行的报告 | **未开始** | 受阻：凭据交出的表示（[G-16](v2/contract.md#十三已知缺口)）、自由作答落成授权表达的写入者（`capability.tool-admission` 的 G-2）、答复三种表示（[G-17](v2/contract.md#十三已知缺口)）；「查不到条目」那一支的记录原因落处（[G-19](v2/contract.md#十三已知缺口)） |
| [S-49 声明了「不可用即否决」的租户件](v2/contract.md#s-49-声明了不可用即否决的租户件) | **故障注入**，四支 | **未开始** | 最容易被「不在就跳过」一刀切掉的一条，**必须真跑** |
| [S-51 运行被取消，这一次 `dispatch` 以 `cancelled` 收场](v2/contract.md#s-51-运行被取消这一次-dispatch-以-cancelled-收场) | 演练 ＋ **在一件兼容件的子进程跑着时叫停**；另跑「叫停落在两件之间」 | **未开始** | 兼容件执行环境的来路已有接口契约（[G-20](v2/contract.md#十三已知缺口) 改写为「真承接者未到，接口已定」），**验收装配里由最小提供者答测试种子即可跑**；兼容件起子进程要的那一项宿主机允许产品未给（`capability.execution-environments` v2 G-3），测试种子代给——**这一支只在验收装配成立**。取消请求怎样落日志归 loop 那一程（[G-8](v2/contract.md#十三已知缺口)）。断言「在途那一件没有记录、后面的件没被求值、没有提醒」 |
| [S-52 执行环境句柄只及本会话、调用返回即失效](v2/contract.md#s-52-执行环境句柄只及本会话调用返回即失效) | 演练（两个会话）＋ **故障注入**（会话持有的租户读不到） | **未开始** | 句柄解析出的两样已有接口契约（`capability.session-tenancy/v2#S-8`、`capability.execution-environments/v2#S-11`），**最小提供者答测试种子即可跑**（真承接者未到，[G-20](v2/contract.md#十三已知缺口)）；「过期句柄再解析失败」这一支最容易被「句柄就是会话标识的别名」抹掉，**必须真跑** |

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

**与别的契约之间写进本契约的项**。2026-09-24 整批对齐逐行核对了对方正文；同日第一轮评审处置后的变化记在右列，对方那一半由各自批次改，**核对以最终合回的正文为准**。

| 来自 | 条款 | 本契约落在哪 | 核对状态 |
|---|---|---|---|
| `capability.tool-admission` v2 S-29／S-30 | ① 放行判断钉 `before_action` 链末（装配清单义务，runner 强制） | [S-6](v2/contract.md#s-6-拓展件链从装配清单来) 第 2 条 | **已核对，一致**（对方 S-29、S-30） |
| `capability.tool-admission` v2 S-14／S-29 | ② 拒绝投影成 `veto` 时 `reason` 原样带拒绝原因 token；runner 自己写的 `reason` 不借用它们 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 6 条 | **已核对，一致** |
| `capability.tool-admission` v2 S-24／S-29／S-34 | ③ `admit` 整批失败（含 `unavailable`）或它不可用时，同批每一项都得 `vetoed` | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 7 条、[S-17](v2/contract.md#s-17-系统自带件不可用时一律关门)、[S-48](v2/contract.md#s-48-放行判断一轮汇合凭据扣住答复只认自己的卡) 末支 | **已核对，已统一**（D-060 S15-d）：不可用记录不带 `output`（现带 `unavailability: fallback`）、效果 `vetoed`；`admit` 失败记 `skipped: errored` ＋ `error`、按 `treat_as_veto` 效果 `vetoed`——**记录形状以对方 S-29／S-34 为权威**，本契约 S-48 已对齐 |
| `capability.tool-admission` v2 S-26 | 放行判断件的能力标识 `omne-official:admission-judgment` | [S-7](v2/contract.md#s-7-系统自带件怎样挂上) | **已核对，一致**（对方 S-26 正文，2026-09-24 读到）；`data.loop-extension` v2 examples 里仍写 `omne-official:tool-admission`，须改成同一个名字（已报主线） |
| `capability.tool-execution-runtime` v2 S-63 | 卸载判定件的能力标识 `omne-official:offload-judgment` | [S-7](v2/contract.md#s-7-系统自带件怎样挂上) | **已核对，一致**：对方 S-63「卸载判定这一件」给出（S-1 的拥有表指向它；K29 原写 S-1，本契约按实际给出处引 S-63） |
| `capability.tool-admission` v2 S-12／S-22 | ④ 答复以四个选项 id 或 `declined` 交回重判；自由作答不作为答复，先落授权表达再不带答复重判 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 8 条、[S-28](v2/contract.md#s-28-回放) 第 4 条（新一轮 `ask`） | **已核对，一致**（对方 S-12） |
| `capability.tool-admission` v2 S-31 | ⑤ 同批有等人的项时扣住已放行项的放行凭据，不交给执行运行时 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 9 条 | **已核对，一致**（对方 S-31：本能力不扣住，扣住归 runner 与执行运行时）；凭据交出的表示仍是 [G-16](v2/contract.md#十三已知缺口) |
| `capability.tool-admission` v2 S-28 | ⑥ 兼容件复用四档选项的卡，答复不带授权、不作为答复交给放行判断 | [S-28](v2/contract.md#s-28-回放) 第 4 条、[S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 8 条 | **已核对，一致**（对方 S-28；`capability.hooks-import` v2 的 S-21 同） |
| `capability.tool-admission` v2 S-21／S-23 | 整批一次、按轮 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条 | **已核对，一致**（对方 S-21、S-23）；整批输入的来路由 `data.loop-extension/v2#S-14` 的注答复 |
| `capability.modality-projection` v2 S-23 | 转换件在 `before_persist_message` 上是最后一个动块的 | [S-6](v2/contract.md#s-6-拓展件链从装配清单来) 第 2 条（本契约取整条链的末位） | **已核对**：对方要「最后一个动块的」，本契约取整条链的末位——强于对方的性质，不冲突；取法已报主线 |
| `capability.modality-projection` v2 S-20／G-2 | 转换件对模型回复交回「挂派生表示」的 `rewrite`，不算 D-5 要防的改写 | [S-14](v2/contract.md#s-14-结论合不合法两类判断) ② 前两行 | **已核对，一致**；`data.loop-extension` 一侧已在 S-23 写明（原 G-15 ①） |
| `capability.modality-projection` v2 S-21／S-22 | 转换件不可用只否决含要转的块（给模型看、还没带派生属性的语音块、图块、文件块，对方 S-20 ①）的消息 | [S-17](v2/contract.md#s-17-系统自带件不可用时一律关门) 转换件那一行 | **已核对，一致**（对方 S-21、S-22） |
| `capability.model-request-runtime` v2 | `select_model` 的合法目标判定；`retry` 的只读再发守卫 `canDispatchAgain(session, callId, plan) → {allowed} \| {refused{why}}`（MRR S-50），`why` 与 `dispatchAgain` 的拒绝同表，已终结是操作失败 `alreadyEnded` | [S-14](v2/contract.md#s-14-结论合不合法两类判断)、[S-26](v2/contract.md#s-26-retry-与它被拒) | **已核对，一致**：对方 S-24 `legalTargets`；只读守卫在对方 S-50，输入带 `plan`、守卫表与 S-30 同一张，已终结是操作失败 `alreadyEnded`（本契约按「不合法」处置） |
| `capability.asset-evaluation` v2 | 各件求得的四样值 | [S-6](v2/contract.md#s-6-拓展件链从装配清单来) | **已核对**：四样值是对方 S-8 `values` 里的项；它们在装配清单里怎样表示仍是 [G-2](v2/contract.md#十三已知缺口) |
| `capability.asset-registry` v2 S-11 | 报告带会话与运行；`effectivePermissions` 对 `tool` 表每条条目恰一项、以 `ModelToolName` 为键（M8）；条目在快照里、能力标识不在此刻组合里写 `not_in_composition`（L15）；`unavailable` 只留给求值失败；查不到键即这一次尝试没有这条条目（M10） | [S-21](v2/contract.md#s-21-dispatch一次经过) ① 的核对、[S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条 | **已对齐（2026-09-25 修复波 2，本批同改对方 S-11）** |
| `capability.tool-admission` v2 S-8 | 报告里「这一项缺席或写着 `unavailable`」即不可用 → M10 之后 runner 不把查不到条目的调用交进 `admit`，对方那句「缺席」对 runner 这一侧不再出现；`not_in_composition` 只指条目仍在快照、能力标识不在此刻组合里 | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条 | 对方由丙批改（M10 的 S-8 括注）；**核对以合回正文为准** |
| `data.loop-extension` v2 S-14 | `batch` 可含不在本次 `actions` 的 `CallId`（解析不了的调用） | [S-21](v2/contract.md#s-21-dispatch一次经过) ①、[S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 1 条 | 对方由乙批改（M11）；**核对以合回正文为准** |
| `capability.tool-execution-runtime` v2 S-23 | 报告里查不到条目、没进放行判断的调用（没有凭据）交到执行运行时即刻收场 `unavailable{no_such_entry}` | [S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条（指路，不登依赖） | 对方由丙批改（M8、M10）；**核对以合回正文为准** |
| `data.loop-extension` v2 S-11／S-41 | 统一输入必带执行环境句柄 `environment`（`EnvironmentHandle`），读面归本契约 | [S-10](v2/contract.md#s-10-逐件顺序求值先落后算) 第 1 条、[S-50](v2/contract.md#s-50-执行环境句柄的读面) | **已对齐（2026-09-25 修复波 3，同一起草者同轮改两边）** |
| `capability.tool-execution-runtime` v2 S-23 ① | `submit` 带的 `report` 与本契约 `admission.report` 是同一份值，两边都核会话、运行与尝试三者（M46）、不现算（D-060 §八 M33） | [S-21](v2/contract.md#s-21-dispatch一次经过) ②、[S-32](v2/contract.md#s-32-装配给的保证-vs-协议须给的保证)（指路，不登依赖——对方反向消费本契约） | **已对齐（2026-09-25 修复波 3，同一起草者同轮改两边）** |
| `capability.modality-projection` v2 S-18／S-20、`capability.hooks-import` v2 S-18／S-19／S-27 | 转换件的 `tenant`、兼容件的执行环境从执行环境句柄取；解析不出按 S-50 第 4 条归不可用或报错；运行被取消时兼容件的子进程被停下、那一次求值不留记录 | [S-7](v2/contract.md#s-7-系统自带件怎样挂上)、[S-50](v2/contract.md#s-50-执行环境句柄的读面)、[S-21](v2/contract.md#s-21-dispatch一次经过) ⑥、[S-34](v2/contract.md#s-34-撤下回收与取消时在途的经过) | **已对齐（2026-09-25 修复波 3，同一起草者同轮改）** |
| `data.loop-extension` v2 S-6／S-31／S-33 | 不可用处置：声明成员 `unavailability ∈ skip \| veto`（缺席 = `skip`）；不可用记录带实际采用的 `unavailability ∈ skip \| veto \| fallback`；系统自带件由指定挂件顶上 | [S-12](v2/contract.md#s-12-不可用与报错runner-怎么分)、[S-17](v2/contract.md#s-17-系统自带件不可用时一律关门) | **已核对**（对方本轮修订中的正文：S-6、S-31、S-33 已带这三处） |

**上表的能力契约都已登进 catalog**，clauses 取自[契约 S-4](v2/contract.md#s-4-依赖方向与被消费的面) 末表。

### 形式义务：回放的行为模型（已触发，未建）

**义务依据 D-060 S15-c**：`formal/Runner.tla` 由主线另派任务建，**本版目录里还没有它，也没有登记 formal task**——「未运行」如实登记。
要检查的七条义务（`OneFinalConclusionPerPiece`、`CommitBeforeNext`、`ReplayReproducesEffect`、`RemindersExactlyOnce`、`OneCardPerAsk`、`StaleAttemptCannotWrite`、`AnsweredPassCompletes`）与各自的前提（常量有界、实现结果非确定、栅栏与条件写入原子、答完之后再调一次 `dispatch` 的弱公平）写在[契约 S-35](v2/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合)；
**每一条登记为 formal task 时都要写明它检查哪条条款的哪条性质、在什么前提下**。

另配否定配置（关掉「先落」、关掉「按锚判重」、关掉栅栏）作 validity-check，预期出反例、**不登记为 formal task**。
**被建模方式吸收、不作证据的**：效果合成与三张处置表、`reason`／`error` 的措辞、答复的三种表示、放行判断一轮一次 `admit`——证据形式是场景（S-41、S-42、S-46、S-48、S-49）。

## 变化的影响

- **2026-09-25 修复波 3：实现映射反推（候选，未冻结，原地改）**：裁定出处 D-060 §八 M38、M39、M40（及 M33 的这一半），同轮追加 M46（报告核会话、运行、尝试三者）；推导经 N-20 接受；逐条处置见文末[实现映射反推（2026-09-25）](#实现映射反推2026-09-25)。
  - **语义改变**：新条款 [S-50](v2/contract.md#s-50-执行环境句柄的读面)——runner 按会话造执行环境句柄、经它恰解析出会话持有的租户身份与会话级执行环境、不交出会话标识、只在这一次调用里有效、解析不出即失败不给默认；系统自带件同样经它（S-7）。`dispatch` 失败集合加 `cancelled`：运行被取消、调用方叫停时，已提交的留着，在途的那一件收到停止信号、不留记录，这一次经过不再继续（S-21 ②⑥、S-34）。
  - **表示改变**：统一输入多一个必带成员 `environment`（形状在 `data.loop-extension` v2 S-41）。`dispatch` 的输入不变（叫停不是一个值成员，经什么交到 runner 归组合契约）。
  - **装配名**：S-4 与第十四节 `apps/runtime-host` 改 `apps/cli`（M40；D-059 已裁），语义不变。
  - **新缺口 [G-20](v2/contract.md#十三已知缺口)**（句柄解析出的两样没有来路契约，owner 主线 → 会话那一程 ＋ PF-005 的 owner；M43 C-7）。
  - **产品依据**：加 PF-005 rev 5 §6.3、PF-015 rev 11 §6.12（都是当前 rev，只作 S-50 的依据，未改任何已有条款）。
  - **registry**：catalog 本契约对 `data.loop-extension` 的消费 clauses 加 `S-41`；covers 加 PF-005 §6.3 → S-50、PF-015 §6.12 → S-50 两条，PF-012 §6.15 那一条加 S-21（`reviewed` 保持 false）；formal-tasks、id-namespaces 不变。
  - **对证据的影响**：没有既有证据；新增场景 S-51、S-52，「未开始」。回放的行为模型（S-35、G-14）不含叫停与句柄，已在 S-35 写明证据形式是这两条场景。
  - **对消费者**：没有已采用的消费者，无迁移。agent loop 契约（未起草）要在取消时先落取消请求、再叫停在途的 `dispatch`；`capability.modality-projection`、`capability.hooks-import` 同轮改为经句柄取租户身份与执行环境。

- **2026-09-25 修复波 2（候选，未冻结，原地改）**：裁定出处 D-060 §七 M8～M11；逐条处置见上文「第二轮」。
  - **表示改变**：`dispatch` 多一个输入成员 `admission`（`before_action` 上必带，别处不许带）；`actions` 与 `batch` 的核对由「恰好凑成」改为「`batch` 多出的只能是解析不了的调用」。没有已采用的消费者，无迁移；agent loop 契约（未起草）要按这两条交值。
  - **语义改变**：报告里查不到条目的调用不再使整轮全拒（原「取不到那一条」按放行判断不可用），改为单独记 `observed`、交执行运行时收场；解析不了的调用不过 `before_action`。
  - **新缺口 G-19**（`no_such_entry` 的记录落处，owner `data.loop-extension` ＋ 主线）。
  - **registry**：catalog 本契约的依赖不变（`capability.asset-registry` 的 S-11、`data.content-blocks` 的 S-12 原已登记；执行运行时 S-23 只是指路、不登——它反向消费本契约，登记会成环）。covers、formal-tasks、id-namespaces 不变。
  - **对证据的影响**：没有既有证据；S-48 多三支、改一支，仍「未开始」。回放的行为模型（S-35、G-14）不涉。

- **2026-09-25 修复波 1b（候选，未冻结，原地改）**：裁定出处 D-060 §六（L2、L7、N-10）。
  - **L7**：[S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条写明 runner 组装每一项 `AdmissionInput`，`effectivePermission` 与 `tenantAutoWritable` 取自同一条执行权限项的 `EffectiveValue`（`capability.asset-evaluation/v2#S-42`）：MCP 动作取可用性报告的 `effectivePermissions`（`capability.asset-registry/v2#S-11`）；取不到、`unavailable` 或缺那一位即这一轮按放行判断不可用、全拒件顶上（**本契约推导**：与 `capability.tool-admission/v2#S-8` 对 MCP 那一项缺席的收场一致，不交缺项输入换 `invalidInput`）。**作者写的工具取哪一次求值未定，立 [G-18](v2/contract.md#十三已知缺口)**（owner 主线 ＋ `capability.asset-registry`）。场景 [S-48](v2/contract.md#s-48-放行判断一轮汇合凭据扣住答复只认自己的卡) 加「放行输入的组装」一支；设计依据表加一行；消费者核对「放行判断」一行补 G-18。
  - **同轮追加：L13，G-18 闭合**（D-060 §六 L13）：可用性报告的 `effectivePermissions` 扩到 `tool` 表每条条目（`capability.asset-registry/v2#S-11` 同轮改）；[S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条改为一律从报告取、不另求值；S-4 末表与页首依赖表 asset-registry 那一行、设计依据表那一行、消费者核对「放行判断」一行随之改；G-18 行改为已闭合；S-48 那一支改成「作者写的工具 ＋ MCP 动作」。catalog 里对 `capability.asset-registry` 的 `S-11` 保留。
  - **同轮追加：L15**（D-060 §六 L15）：报告里写着 `not_in_composition` 的项照常交进 `admit`（`effectivePermission = not_in_composition`、不带 `tenantAutoWritable`），放行判断单独判 `deny{not_held}`、不牵连同批；只有取不到、`unavailable` 或缺那一位才整轮全拒。[S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 5 条、设计依据表那一行、场景 [S-48](v2/contract.md#s-48-放行判断一轮汇合凭据扣住答复只认自己的卡) 那一支随之改。
  - **N-10，G-13 闭合**：两条主线裁定（`before_model_call` 的否决 ≡ 运行落失败；回复落盘前被否决追加提醒）已登 D-060 §六；设计依据表那一行、[S-23](v2/contract.md#s-23-效果之后的事由谁做) 表、[S-30](v2/contract.md#s-30-连续被否决的回复) 第 1 条改链。
  - **L2**：本包没有 `implementation.capability` 的引用（`builtin` 一支只经 `data.loop-extension` 的形状到达、本契约不点名成员），无改动。
  - **registry**：catalog 本契约对 `capability.asset-evaluation` 补 `S-42`、对 `capability.tool-admission` 补 `S-7`、`S-8`，新增依赖 `capability.asset-registry` `["S-11"]`（已核无环：注册表的依赖闭包里没有本契约）；页首依赖表与 S-4 末表同改，「后五项」改「后六项」。covers、formal-tasks、id-namespaces 不变。
  - **对证据的影响**：没有既有证据；S-48 多一支，仍「未开始」。回放的行为模型（S-35、G-14）仍未建，本轮不涉。

- **2026-09-24 第一轮独立评审处置（候选，未冻结，原地改）**：处置逐条见上表。
  - **产品依据 rev 复核**：PF-012 rev 11（落盘前对模型回复只能否决；转换件没登记 vs 不可用；系统自带件不走卸载；放行判断不能替换；连续否决上限；中断提醒不开 Run）、rev 12（**不可用处置**：租户件跳过／声明否决、系统自带件指定挂件、放行判断全拒件、「此刻不在、按 X 处置」可见）→ S-12、S-17、S-23、S-30 已落；rev 13～14（转换件本版不是资产、组织与租户换不了）→ 本契约原本就不许非系统件挂派生表示，无改动。PF-008 rev 6（写不出卡＝不放行、兼容件的卡不带授权）→ 原已落；rev 7（清卡第三条路「它等的执行已终局关成已作废」、放行判断不可用全拒件）→ S-27 第 6 条、S-29 第 8 条、S-17。PF-002 rev 17（同一位置先后＝装配清单顺序）→ 原已落；rev 19～20（不可用处置是这一件自己的声明）→ S-6 第 3 条、S-12。PF-004 rev 11～12（I-4 一次运行之内；构成变小也重新装配）→ 清单在两次尝试之间变了的处置不变（S-28 第 1 条），无改动。PF-013 rev 9～12（落盘前否决不是调用失败、转换件替换只在系统装配层）→ 与 S-23、S-17 一致，无改动。PF-014 rev 6～7（中断提醒不让队列非空、连接件开新会话）→ G-6 的描述改写，无条款改动。
  - **对证据的影响**：没有既有证据；S-41、S-42、S-44、S-46、S-47、S-48 的断言改了，仍登「未开始」；新增 S-49。
  - **消费者要知道的**：agent loop 在 `before_action` 上改为一批一次调 `dispatch`、拿回逐项效果；TER、MRR 引的本契约 S-17、S-21、S-6 锚点不变。
  - **依据链**：主线把本轮 K 项汇编进 D-060 §五之后，设计依据表加一行链 K8、K22、K26、K29、K31、K49；G-13 由三条减为两条（K31 已入 D-060）；语义不变。
  - **与同轮对方批次的交接**（2026-09-24）：只读再发守卫改引 MRR S-50，输入带 `plan`（供应商允不允许在守卫里判），调用已终结得操作失败 `alreadyEnded`、按「不合法」处置（S-14、S-26、S-32、S-46、examples §2）；卸载判定件的能力标识改引 TER S-63（给出处），catalog 同改；S-17 转换件那一行改按「要转的块」口径（modality-projection S-20 ①），S-42 场景随之写明只给人看的块与已带派生属性的块照常落盘。**语义改变**：`retry` 的供应商不被允许，由原先「再发时被 `dispatchAgain` 拒、那一笔由它记」改为在落日志前判为不合法、按报错处置。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定」的，长期落点现为 D-060（S14-d、S15-a～S15-g）。
  - **四项并行依赖登进 catalog**（G-12 闭合），对齐义务表逐行核对完毕（上表右列）。
  - **放行判断件不得被替换、禁用或收窄**（S14-d）：[S-17](v2/contract.md#s-17-系统自带件不可用时一律关门) 末条改写，G-4 闭合。
  - **`data.loop-extension` 的四处已对齐**（G-15 闭合）；整批输入的来路由那边 S-14 的注答复，G-16 收窄为「凭据经哪一格交出」。
  - **回放要建行为模型**（S15-c）：[S-35](v2/contract.md#s-35-形式工件回放的行为模型已触发尚未闭合) 与 G-14 改写，义务登在上面「形式义务」一节。
  - `retryRefused` 的读法随 `capability.model-request-runtime` 改（已终结归 `alreadyEnded`）。
  - **对证据的影响**：没有既有证据；S-45 的受阻原因解除，S-48 只剩凭据交出与授权写入者两处受阻。

- **2026-09-23 起草**：首版，没有旧证据可作废。起草途中按主线转来的补充原地修订了四处（候选未冻结）：
  系统自带件不可用的关门表与挂载写法、同位置两件 `retry` 取第一个、`retry` 被拒按上交继续；
  模态转换件钉末位与「挂派生表示」出口、转换件不可用只及含非文本模态块或文件块的消息；
  放行判断的六条对齐（上表）；回放时「答复之后再出卡」由「回放偏离」改为**新的一轮等人**，偏离改由等待原语检出、`replayInconsistent` 收场。
  **没有任何证据因此作废**——此前也没有证据。
- 此后契约任何一处改动涉及上表场景的，**对应场景重新登记为「未开始」**；对齐义务表中任一行核对出差异，先报主线，改判后在这里记一条。
- **（2026-09-24 措辞对齐 PF-013 rev 12，主线裁定，不改语义）**：`data.loop-extension` v2 的 `request.target` 与 `select_model` 的 `profile` 改为路由名（`RouteName`）之后，本契约第 163 行附近「`select_model` 的档案引用」改为「换上的路由名」，[S-25](v2/contract.md#s-25-before_model_call-上的换模型与重新组装) 第 1 条注明 `profile` 是一个路由名、有效模型是它落到的那一行；成员名 `profile` 不改，catalog 不变（本契约仍不据 `data.model-profile` 的条款写出承诺）。没有证据因此作废。

## 实现映射反推（2026-09-25）

五位 realization-drafter 起草节点时报回的契约层缺陷，主线裁定见 D-060 §八（下称 M 编号）。本契约涉及四条。

| 裁定 | 来源 | 处置 | 落在哪 |
|---|---|---|---|
| M38 统一输入加按会话作用域的执行环境句柄；系统自带件同样拿到它 | 辛 RUN-N3（与 MP-N1、HI-N2 同一个缺口） | **接受**。句柄的形状在 `data.loop-extension` v2 S-41，读面在新条款 S-50（与 S-9 给 `LogHandle` 读面同一个分法；编号只追加）。**两处本契约的推导**：① 句柄只在这一次调用里有效（M38 只说按会话作用域；不绑到调用，它就成了跨等待的记忆，与 `data.loop-extension/v2#S-35` 相抵）；② 解析不出时按 S-12 的分界归不可用或报错（与 S-9 第 4 条读日志失败同一口径）。句柄要的两样没有来路契约，立 G-20 | [S-7](v2/contract.md#s-7-系统自带件怎样挂上)、[S-10](v2/contract.md#s-10-逐件顺序求值先落后算) 第 1 条、[S-50](v2/contract.md#s-50-执行环境句柄的读面)、[S-32](v2/contract.md#s-32-装配给的保证-vs-协议须给的保证) 一行、[S-52](v2/contract.md#s-52-执行环境句柄只及本会话调用返回即失效)、[G-20](v2/contract.md#十三已知缺口)、S-4、第十四节、设计依据表 |
| M39 `dispatch` ⑥ 加 `cancelled`；已落的保留，在途的件收到中止信号；S-34 对齐 | 辛 RUN-N4／HI-N6 | **接受**。失败值名取裁定原文 `cancelled`。**两处本契约的推导**：① 在途那一件这一次求值不留记录、排在后面的件不被求值、不补提醒（S-34「这一次经过不再继续、不产出效果」的直接展开）；② 叫停是调用方在取消请求落日志之后对这一次 `dispatch` 的动作，**不是一个值输入**，经什么交到 runner 归组合契约——RUN-N4 的闭合条件「中止信号的来路」由 ② 末句与 S-32 一行交代到契约层 | [S-21](v2/contract.md#s-21-dispatch一次经过) ②⑥ 与 ⑥ 含义表、[S-20](v2/contract.md#s-20-这一节每个操作写全九件事) 注、[S-34](v2/contract.md#s-34-撤下回收与取消时在途的经过)、[S-32](v2/contract.md#s-32-装配给的保证-vs-协议须给的保证) 一行、[S-51](v2/contract.md#s-51-运行被取消这一次-dispatch-以-cancelled-收场)、S-35 末段、第十四节 |
| M40 `apps/runtime-host` 一律改 `apps/cli` | 壬 C-10、辛 | **接受**：两处改名并链 D-059 | [S-4](v2/contract.md#s-4-依赖方向与被消费的面)、[第十四节](v2/contract.md#十四消费者核对) |
| M33（runner 这一半） | 庚 T-1 | **接受**：写明 `admission.report` 与执行运行时 `submit` 的 `report` 是同一份值、两边都核会话与运行、不现算；对方反向消费本契约，这里只指路、不登 catalog | [S-21](v2/contract.md#s-21-dispatch一次经过) ②、[S-32](v2/contract.md#s-32-装配给的保证-vs-协议须给的保证) 一行、第十四节 agent loop 一行 |
| M46（追加）报告带 `attempt`；`admission.report` 核会话、`runId`、`attempt` 三者，对不上 ⇒ `invalidInput` | 子报回（TER R-38：报告不带尝试，同一运行上一次尝试的报告核得过） | **接受**：S-21 ① 写明三者、② 那一侧同样三者、⑥ `invalidInput` 那一行补「这一次尝试」；S-4 asset-registry 行、S-32 放行输入那一行、场景那一支、examples 失败值那一行同改。报告的 `attempt` 那一格由 asset-registry S-11 同轮加（另一位起草者） | [S-21](v2/contract.md#s-21-dispatch一次经过) ①②⑥、[S-32](v2/contract.md#s-32-装配给的保证-vs-协议须给的保证)、设计依据表 |

**跨批对齐（2026-09-25，drafter 丑）**：
- **examples 对 Schema 的机检**：暂存区脚本（不入库），`jsonschema` 4.26.0（`Draft202012Validator` ＋ `referencing`，锁定 uv 环境），设计根下全部 `*.schema.json` 按 `$id` 登表；第 1、2、6 节的六个代码块（结论记录）按 `data.loop-extension` 的 `Conclusion` 判：**6 处，0 不符**。其余是一次经过的步骤表，不是 Schema 实例。只核形状，不是 V- 义务的执行证据。
- **名字与形状核对**：`admission.report` 核的「会话、运行、尝试」与 `capability.asset-registry` S-11、执行运行时 S-23 ①⑥ 逐字同一组，`attempt` 即 `data.call-accounts/v2#S-37` 的 `AttemptId`（整数序号，本契约实例写 `attempt = 1`、`2`）；`environment` 与 `data.loop-extension` S-41 的 `EnvironmentHandle`、hooks-import S-18、modality-projection S-20 ② 同名同义。无改动；catalog 的 runner → `data.loop-extension` S-41、→ asset-registry S-11、hooks-import → 本契约 S-50 都已在。

## 修订波（2026-09-25 公开面）

依据链：D-063 R-1（替身改为接口契约 ＋ 最小提供者）、R-12（锚）；D-060 §八 N-33～N-37（N-37 ② `dependencyPresence` 是装配清单的一个查询、⑩ 执行环境引用先经会话持有租户读面）。候选未冻结，原地改。

| 变化 | 依据 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|---|
| **锚改为调用方随 `dispatch` 交来的不透明键**：runner 不再从主体或日志推锚；表示按 `data.identity-values/v1#S-31`；`dispatch` 加 `anchor`（带 `subject` 时）／`anchors`（带 `actions` 时，同序、两两不同），`replay` 加 `anchor`；缺席或不合即 `invalidInput`；S-5 写明调用方两条义务（同一次经过同一把、不同经过不同的）与做不到的后果 | R-12（主线建议、产品负责人未反对） | [S-5](v2/contract.md#s-5-一次经过)、[S-8](v2/contract.md#s-8-本契约不持有运行实例里的状态)、S-11 记录那一条、[S-16](v2/contract.md#s-16-缺席时的默认答案)、[S-21](v2/contract.md#s-21-dispatch一次经过) 签名 ① ⑥、[S-22](v2/contract.md#s-22-replay从日志重建一次经过) 签名 ① 与表下注、[S-29](v2/contract.md#s-29-一批动作每个动作一次经过) 第 1 条、[S-32](v2/contract.md#s-32-装配给的保证-vs-协议须给的保证) 新一行、S-35 第一条义务的前提、[examples §1](v2/examples.md) 步 1 | **改变 `dispatch`／`replay` 的输入**（加一个必带参数）：agent loop 与入站受理方每次都要交锚。**`replay` 仍带 `subject`**（只为核 `run` 该不该带）——这是本契约的推导，D-060 S15-a「锚从主体推出」那一半被 R-12 取代 |
| **G-1 收窄**为「锚的算法」（owner loop 那一程）；回放、只跑一轮不再受它阻 | R-12 | [G-1](v2/contract.md#十三已知缺口)、第十四节 agent loop 与状态转移表两行 | 场景 S-38 从「受阻 G-1」翻「可跑（锚由测试给）」；S-47 改为「会话日志最小提供者到位即可跑」 |
| **句柄的两样来路改指接口契约**：租户 `capability.session-tenancy/v2#S-8`、执行环境引用 `capability.execution-environments/v2#S-11`（取引用先有租户）；**G-20 改写为「真承接者未到，接口已定」** | R-1；N-37 ⑩ | [S-50](v2/contract.md#s-50-执行环境句柄的读面) 第 1、4、5 条、[G-20](v2/contract.md#十三已知缺口)、第十四节三行 | 不改语义（句柄仍恰两样、只及本会话、调用返回即失效）；S-51、S-52 在验收装配可跑。产品装配里会话持有租户没有写入方、兼容件要的宿主机允许产品未给——两件都如实写进 G-20 |
| **栅栏与条件写入改指会话日志窄口**：`capability.session-log/v2#S-10`（栅栏在写入边界判）、`#S-8`（判重键） | R-1 | [S-21](v2/contract.md#s-21-dispatch一次经过) ②、[S-32](v2/contract.md#s-32-装配给的保证-vs-协议须给的保证) 两行、[G-8](v2/contract.md#十三已知缺口) 注 | 不改语义；G-8 其余三件仍开着 |
| **依赖在场判定改指装配清单的在场查询** `capability.assembly-manifest/v2#S-19`：`absent` 即 S-12 ①；整次 `unavailable` 不是 ①——这一次经过 `unavailable`、那一件不留记录 | N-37 ②；那份契约 S-19 ⑧ 与它的消费者核对原已这样读（本契约此前没写来源） | [S-12](v2/contract.md#s-12-不可用与报错runner-怎么分) 表下一条、[S-16](v2/contract.md#s-16-缺席时的默认答案)、[S-33](v2/contract.md#s-33-依赖的提供者不可用) 新一行 | **把一处未写明的判定写明**（本契约推导，与节点依赖表「缺席 ⇒ 判不出 ⇒ `unavailable`」同口径）。产品装配里在场事实没有给出方（那份契约 G-2），声明了 `needs` 的件所在的那一次经过恒 `unavailable` |
| catalog：本契约新增四条依赖（`capability.session-log` S-8、S-9、S-10；`capability.session-tenancy` S-5、S-8；`capability.execution-environments` S-5、S-11；`capability.assembly-manifest` S-10、S-19），`data.identity-values` 加 S-31 | 引用即消费 | S-4、页首依赖表、README | 四份接口契约都不以坐标依赖本契约，无环 |
| **参数名 `anchor`／`anchors`、`replay` 保留 `subject`**：起草时的推导，**主线已接受** | 主线裁定 D-060 §八 N-39 | [S-22](v2/contract.md#s-22-replay从日志重建一次经过) 表下那一条 | 不改语义 |
| **运行时面接进产品装配的前提是 loop／会话那一程立起真提供者**（`capability.run-attempt-facts` 的 G-3、会话持有租户的写入方、在场事实）：本程产品装配没有 loop 与会话，装配清单的在场查询、会话持有租户的读面在那里**没有调用者**；声明了 `needs` 的件「整次 `unavailable`」在产品装配里无从发生，验收装配以种子答（D-060 §八 N-37 ④） | 主线裁定（2026-09-25，与工具执行运行时 R-42 同一事实） | 本行 | 不改条款 |
| **兼容件的非阻断错误固定按 `ignore`，记录与越档同形**：兼容件以来源产品语义下的非阻断错误收场（非零退出、超时、输出不合形状，归属由 `capability.hooks-import/v2#S-19` 定）时，不取有效策略、不进 `onError`，落 `skipped: errored` ＋ `output: observed` ＋ `error`（说明写三种成因之一，非零退出连同退出码）；原生件的报错与兼容件的其余报错照旧按有效策略。关闭 `capability.hooks-import` 的 G-17 | 主线补裁（2026-09-25，第二轮） | [S-13](v2/contract.md#s-13-报错处置策略的执行) 开头一句与新一条、[S-12](v2/contract.md#s-12-不可用与报错runner-怎么分) 表下「兼容件的哪些情形」一条（顺带改正「脚本路径不存在」算起不来的旧说法）、场景 [S-41](v2/contract.md#s-41-不可用报错否决三者分得开) 新一支、第十四节兼容件一行、[examples §7](v2/examples.md#7-兼容件的非阻断错误固定按-ignore记录与越档同形) | **改语义**：S-13 多了一个不取有效策略的情形（此前只有越档，而越档本就等于那一档的默认）。**不另立记录形状**：`data.loop-extension/v2#S-31`「可用却报错」那一种，`data.loop-extension` S-5 末条与 S-8 同步写明这一处例外。「原生件的同样说法不采用」「执行环境被撤下仍按有效策略」是本契约的推导，报主线。catalog 不变：本契约引 hooks-import S-19 只作定义引用（hooks-import 以坐标依赖本契约，登了成环） |

**没有证据因此作废**——本契约此前没有任何执行证据。

## v3 候选：精确消费演进

来源为 model-request-adaptation 提案 rev 2 与本轮主线施工裁定；runner v3 状态仍是 candidate。全部 S-1～S-52、两个操作及九项结构、失败枚举保持；新细化不称为已接受。PF-013 对到当前 rev13，其余八份产品 revision 沿源版本；旧 v2 的冻结原件未改。依赖的接受与冻结以 [registry](../../../registry/README.md) 为唯一权威：本次机械核对时 LC4、messages4、response4、MF3、registry3、AE4 已 accepted，runtime3 仍 candidate；这一状态校正不改变消费坐标、条款或模型。

### 变化的影响

| 增量 | 实质消费与影响 |
|---|---|
| LC4、messages4、response4、content-blocks3、runtime3 | 完整适配绑定的失败输入、原发出记录与原绑定响应；保留未解析工具调用的 core 修正，且仍不授予其派发资格 |
| MF3、registry3、AE4 | S-6 沿 readHead 当前 loop_extension 记录与 readHistory 的同会话表时刻读取；content 精确采用 registry3 S-48 和 AE4 S-47。当前表沿 E1 时不得改拿全局最近 E2；AE 只留 v4 一个语义版本 |
| 权限读取 | 同 E 的 PermissionValue.allowed 按 observe < rewrite < veto 取最强合法档，空/非法/超所选正文声明为 unavailable，零件求值；不改求值输出、不修补来源 |
| 默认重试身份 | S-7 引用 runtime3 S-67 的 omne-official:default-retry。出厂 rewrite／有效缺省 record 来自既有 S-26，未新选默认 |
| 提醒与并发占号 | 作者 inject 供完整身份/时刻；runner 自产提醒取得本日志唯一 ID 与当前 Instant并记入结论。前置冲突按输出不合法；结论提交后同 ID 异内容为 replayInconsistent，不能改原结论或重新生成提醒 |
| 守卫收场 | S-14/S-26 明确 refused/alreadyEnded/callNotFound/wrongPhase 走原 onError；unavailable 和调用边界 invalidInput 各同名失败，不归罪已通过表示检查的作者输出，保留历史前缀 |
| 有限模型 | S-35 七义务及三个额外观察断言，有四份正向配置和十份反例配置；不把 TypeOK、固定耐久前提或有限结果当无界证明 |

候选精确元数据在 `tmp/model-request-runtime/runner-v3/candidate-metadata.json`：18 resources、15 dependencies、40 条继承 covers（reviewed=false）、四份正向 formal tasks、无新增 id namespace。registry 由主线唯一 owner 更新，起草者没有写共享清单。正文不新增 Schema，共享数据继续由 data 拥有，操作线上表示沿原组合边界。

### 已实际执行的形状与静态检查

最终使用 `check.py` 与保存的 72 份输入（含 21 份 Schema），exit 0：52 条款、两操作各九项及原枚举的静态核对通过；2 个规范完整值与 9 个变异反例符合预期。跨字段拒绝由纯谓词表达，没有运行产品 runner。两个冻结 v2 文件与 baseline HEAD 字节一致。旧失效实例、修正后输入与历次 raw 分目录保留，没有覆盖失败输出。

输入清单、脚本、stdout.jsonl、stderr.txt、run.json、frozen-v2.json 均在 `tmp/model-request-runtime/runner-v3/`。复跑入口相对执行仓库根：

```sh
.venv/bin/python tmp/model-request-runtime/runner-v3/check.py \
  --inputs tmp/model-request-runtime/runner-v3/inputs \
  --manifest tmp/model-request-runtime/runner-v3/inputs-sha256.json
```

### TLC 实际执行与范围

`tmp/model-request-runtime/runner-v3/formal-run-2/` 保存实际模型/config 输入、SHA-256、JAR 哈希、Java 版本、每次 argv、退出码及逐字 stdout/stderr。TLC 为实际输出中的 `2026.09.12.025210 (rev: 867aefb)`；下面计数来自对应 raw，不是替代 raw 的凭证。

| 正向配置 | 实际结果 | 不同状态数 | 范围 |
|---|---|---:|---|
| Runner.cfg | exit 0，无反例 | 48,016 | 两件一 worker，最多两尝试、一次崩溃，安全性质 |
| RunnerUnfenced.cfg | exit 0，无反例 | 44,508 | 一件两 worker，无运行栅栏，耐久判重竞争 |
| RunnerConcurrent.cfg | exit 0，无反例 | 332,712 | 一件两 worker，尝试栅栏和竞争 |
| RunnerProgress.cfg | exit 0，无反例 | 2,930 | 一件一 worker，显式弱公平与两项进展性质 |

十份 validity-check 均得到指定反例：九份不变量失败 exit 12；answered-stalls 的 AnsweredPassCompletes 进展失败 exit 13。它们是反驳能力检查，不登记为正向 formal task。首轮 formal-run-1 抓出三处布尔赋值缺括号导致 successor 不完整，已修正且完整复跑；该轮 raw 仍保留。更早两件两 worker 的探索在未完成时停止，无 verdict，不据此宣称覆盖；其输入与输出保留在 formal-initial-2。

模型的稳定锚、唯一身份、时钟、可信声明、实际耐久介质与原子存储仍是外部前提。只枚举每件至多一次 ask、二值改写主体、有限尝试/crash；未证明任意链长、两件两 worker 的全部组合、重复多轮 ask、适配绑定/精确 JSON、E1/E2 读取、后置 ID 冲突、嵌套提醒 veto、整批 admit、取消或执行环境。详见 [形式范围](v3/formal/README.md)及 [S-35](v3/contract.md#s-35-形式工件回放的有限行为模型)。

从保存输入复跑单项示例：

```sh
java -XX:+UseParallelGC -Xmx2g -cp /opt/tlaplus/tla2tools.jar tlc2.TLC \
  -workers 1 -noGenerateSpecTE -metadir tmp/model-request-runtime/runner-v3/rerun-chain \
  -config tmp/model-request-runtime/runner-v3/formal-run-2/inputs/Runner.cfg \
  tmp/model-request-runtime/runner-v3/formal-run-2/inputs/Runner.tla
```

### 仍需真实执行的验收

| 义务 | 可失败验收场景 | 状态 |
|---|---|---|
| 真实链读取 | E1 当前表、别类别 E2 重载、reuse 删除，原 E/原版本正文与次序不变；缺项、空 allowed、超声明不得形成空链或调用件 | 未开始；[examples §9](v3/examples.md#9-当前拓展表仍依-e1另一个类别已提交-e2) |
| 提醒身份与存储竞争 | 前置异内容冲突、同值认回、结论后 crash、并发抢占同 ID、alreadyRecorded 后不可读；原结论与身份不可改 | 未开始；[examples §10](v3/examples.md#10-提醒身份创建时刻与并发占号) |
| 全部 guard 收场 | 真实 canDispatchAgain、日志、attempt 栅栏；已提交前缀保留，allowed 后先落后交回，invalidInput 不归罪作者 | 未开始；[examples §11](v3/examples.md#11-candispatchagain-的全部收场映射) |
| 装配开闸 | 全部提供者 ACTIVE、guard.confirm 完成后才受理；故障撤除和热替换不放宽门 | 未开始；归真实装配 |
| 原其他场景 | S-36～S-52、取消、卡片、放行、句柄、跨会话隔离等仍各要实际执行 | 沿原义务；不能从新模型推断已交付 |

### 全局检查与报给主线

追加闭合后的 `check_design.py --root .meta_harness/design --formal registered` 实际 exit 0；原始输出及 argv/hash 在 `tmp/model-request-runtime/runner-v3/check-design-closure/`。registered 模式只检查登记；TLC 实际运行是上述保存的直接调用。初稿那次全树缺 asset-evaluation E-10 锚的 exit 1 raw 也保留，未冒充通过。

G-2/G-5 本轮候选补齐；G-3 默认重试半支补齐，模态转换／循环探测仍待 owner；G-14 有限模型工件和可失败断言已给出，登记、独立评审及接受归主线。其余 G-1/6/7/8/9/10/16/17/19/20 不变。本轮遇到的提醒竞争与权限集合歧义均已向主线报告并按其明确裁定落字，没有自行新增 terminal 或失败 token。

全部证据临时路径以代码文本表示，不跨 design root 建规范链接；永久归档由主线完成。candidate 不等于已接受、实现完成或真实模型纵线验收通过。

## v4 候选：完整失败历史

### 变化的影响

2026-09-28，从 accepted v3 派生 v4 candidate，PF-013 rev14/D-096，原 S-1～S-52、两个操作各九项、失败集合和全部 Runner 模型/config 保留。新增 S-53 使 after_model_call/failure 的所有 Conclusion 在写前具有唯一 modelCallId，S-54 保留完整 retryConclusions，结论已落而 dispatch 未发生仍按原结论回放；LC5 S-42/S-43、RT6 S-76 是新实质消费。MS5/MR6 更新完整快照，v4 示例保留 image 模态与原绑定。原 v3 的实际执行记录仍只证明 v3 输入，不挪作 v4 通过。

简报已裁：共享名字、modelCallId 适用条件、唯一调用取自 dispatches、完整历史不滤不去重、默认件只计自己的已生效结论。派生细化：沿既有 invalidInput/unavailable/replayInconsistent 将写前表示/跨值不符、来源不可读、已落记录不符分开，理由是保持原失败集合和不改历史原则；不新增政策。

### 证据义务

- S-53/S-54 完整 JSON 形状、跨字段及原值保留的规范场景见 v4/examples §8/§12。真实 runner、真实日志前缀完整性/会话归属、默认件计次与实际再发组合验收：**未开始**。
- 原 Runner 七义务、额外三断言、四份正向与十份 validity-check 全部继承；新增 FailureHistory 四个可失败断言及四份 validity-check，前提和未覆盖范围见 v4/formal/README。
- 能力不发布 Schema；data 定义是唯一形状权威。不新建 Alloy：新增关系由 LC5 形状约束、跨记录规范场景及有界行为模型承担，未新增独立结构对象。

### 缺口与报给主线

继承 G-1/3/6/7/8/9/10/16/17/19/20 及其 owner；G-14 保留有限证明范围及真实符合性证据义务。没有新产品问题或新术语。共享数据与 RT6 的冻结/接受、跨包整合检查和 registry 正式合入归主线，本包仍 candidate。

### 本次实际检查与范围

证据根为 `tmp/model-request-runtime/input-limit-successor/runner4-checks/`（任务区，正式保留由主线处理）。

- `check.py` 的 `schema-static.json`：**36 项，0 失败**，包括八个完整 JSON 正例、六个表示反例、同值双结论历史正例、54 唯一条款/两操作各九项/失败枚举未变，以及 16 份继承模型与配置的逐字比较。Schema 输入保存于 `inputs/` 并带 SHA256；采用的 LC5 后续只改 description/comment，结构未变。这里是 Schema/静态检查，不是实际 runner 运行。
- `formal-runs.json`：四份继承正向配置 exit 0，distinct states 分别 Runner **48,016**、RunnerConcurrent **332,712**、RunnerUnfenced **44,508**、RunnerProgress **2,930**。十份继承 validity-check 均达到指定断言，九份 invariant exit 12、一份 AnsweredPassCompletes 进展 exit 13。
- `formal-correction/runs.json`：最终 FailureHistory 正向 exit 0，**4,306 distinct states**；mixed-model-call、lost-retry-history、return-before-conclusion、reevaluate-concluded 分别使 CallAssociation、LosslessHistory、WriteBeforeReturn、ReplayNoReevaluation 失败，均 exit 12。新模型首轮负控三处发现布尔赋值缺括号导致 successor 未完整赋值（exit 75），修正并重跑全部五份新配置；首轮输入与 raw 保留，未把该轮记作断言通过。
- `actual-final-run.json`：本 spoke 的 `check_design.py --root .meta_harness/design --formal registered` **exit 1**，仅 6 个未合并兄弟包 LC5/RT6 的本地链接缺失；无权将兄弟包或中央 registry 写入本 spoke。`overlay-3-run.json`：任务区复制完整设计上下文和六个兄弟候选包及各 topic 导航后运行同一检查器，**exit 0 / PASS**。此为可组合的文档/Schema 检查；overlay 保留 baseline registry，不能声称五份 v4 formal task 已中央登记或正式集成。
- `fragment-validation.json`：24 个资源路径、15 个依赖坐标的全部消费条款、40 条 covers 的本包条款可达，无缺失；5 个正向 formal task，负控不登记。四份片段在 `tmp/model-request-runtime/input-limit-successor/runner4-fragments/{catalog,covers,id-namespaces,formal-tasks}.fragment.json`；id-namespaces 明确无新增全局前缀。中央清单未改。
- 旧 v2/v3 文件 `git diff --exit-code` 无差异。真实存储、崩溃介质、历史前缀完整性、身份授权与默认件/网络再发仍为未开始；有限模型不证明这些前提。

可复跑：本 spoke `.venv/bin/python` 执行证据目录 `check.py`（共享 Schema 与全组模型）、`rerun-new.py`（最终新模型及负控）、`check-overlay.py`（独立文档上下文）。每轮配置、raw、argv、退出码与输入哈希在该目录；本版没有发布或接受声明。
