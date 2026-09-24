# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-24）：没有任何证据。**
> `capability.tool-admission` v1 是 `candidate`，经第一轮独立评审后修订，**未接受**；尚无提供者设计、尚无源码——**本程不交付它的实现**。
> 本版不建形式工件（[契约 S-37](v1/contract.md#s-37-本版不建形式工件)），**所以下面没有「无反例」这类结论可报**；
> 已触发的证据义务全部是规范场景与跨契约演练，**状态一律「未开始」**。

## 证据义务

### 规范场景

**十一条全部未开始**——它们要的是真实实现，而实现不存在。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-38 三档各一](v1/contract.md#s-38-三档各一) | 演练；**观察求值是否被调用**（`forbid`、`auto` 两档不得调用） | **未开始** | 「不产卡」「不看授权表达」只有看调用与产出才证得了 |
| [S-39 算不出 × 三种运行模式](v1/contract.md#s-39-算不出--三种运行模式) | 演练；可替换的求值桩（三种结果） | **未开始** | 卡片各档要**逐字**比对 PF-008 §5.2 原词 |
| [S-40 子宽于父整批失败](v1/contract.md#s-40-子宽于父整批失败) | 演练 | **未开始** | 受阻：父摘要的来源（[G-12](v1/contract.md#十一已知缺口)） |
| [S-41 一批里一条 ask，整批不执行](v1/contract.md#s-41-一批里一条-ask整批不执行) | **跨契约**演练（本契约 ＋ runner ＋ 执行运行时） | **未开始** | 「卡片答完之前执行运行时没收到任何提交」由 runner 兑现，只跑本契约这一半证明不了 |
| [S-42 答复收成结论，禁止翻案](v1/contract.md#s-42-答复收成结论禁止翻案) | 演练；**卡片挂着期间改权限**两次 | **未开始** | 答复的记录形状受阻于 [G-4](v1/contract.md#十一已知缺口)；答复落成授权的那两次写入受阻于 [G-2](v1/contract.md#十一已知缺口)，本场景只检查「这一次」的结论 |
| [S-43 放行之后参数变了，令牌作废](v1/contract.md#s-43-放行之后参数变了令牌作废) | 演练；往日志里人为落一次排错位置的改写 | **未开始** | 受阻：生效参数的记录形状（[G-8](v1/contract.md#十一已知缺口)） |
| [S-44 判不出来不放行](v1/contract.md#s-44-判不出来不放行) | **故障注入**（求值读不到、日志读不到） | **未开始** | **最容易被「读不到就当算不出」抹掉的一条，必须真跑**；`bypass-permissions` 下那一格是关键 |
| [S-45 工作区来的工具不提权](v1/contract.md#s-45-工作区来的工具不提权) | 演练 | **未开始** | 上游求值也有一道（PF-002 §5.7 的读入过滤），本场景只检查本能力这一道 |
| [S-46 第四档写不进去就不出现](v1/contract.md#s-46-第四档写不进去就不出现) | 演练 | **未开始** | 受阻：`tenantAutoWritable` 的来处（[G-14](v1/contract.md#十一已知缺口)）；本能力这一侧可用桩值先跑 |
| [S-47 模型面名字逐码点比，解析不了的调用不进来](v1/contract.md#s-47-模型面名字逐码点比解析不了的调用不进来) | 演练 | **未开始** | 解析不了的调用的收场一半归执行运行时，证据在它那边 |
| [S-48 本能力不可用时由全拒件顶上](v1/contract.md#s-48-本能力不可用时由全拒件顶上) | **跨契约故障注入**（本契约 ＋ runner） | **未开始** | 效果由 runner 的 S-17 表兑现，只跑本契约证明不了 |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| 本件钉在 `before_action` 瀑布最后 | [S-29](v1/contract.md#s-29-位置干预力与结论投影)、[S-30](v1/contract.md#s-30-放行之后参数不再变) | `capability.loop-extension-runner` ＋ 装配 | runner 的场景；排错位置时 [S-43](v1/contract.md#s-43-放行之后参数变了令牌作废) 的第二道仍挡得住 |
| 本能力不在时由全拒件顶上（记录 `unavailability: fallback`、不带 `output`、效果 `vetoed`）；报错或没给出结论时记 `skipped: errored` ＋ `error`、效果 `vetoed` | [S-29](v1/contract.md#s-29-位置干预力与结论投影)、[S-34](v1/contract.md#s-34-本能力缺席报错或判不出来) | runner 的 S-17（[PF-012 §5.8](../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)） | runner 的故障注入场景；本契约 S-48 |
| 一批里还有一条在等，谁都不执行 | [S-31](v1/contract.md#s-31-一批里还有一条在等谁都不执行) | runner ＋ 执行运行时 | 两者的行为模型与场景 |
| 提交前必核对凭据；`unavailable` 与 `invalid` 都不执行 | [S-25](v1/contract.md#s-25-verifytoken)、[S-34](v1/contract.md#s-34-本能力缺席报错或判不出来) | `capability.tool-execution-runtime` | 它的场景 |
| `veto.reason` 原样带拒绝原因 token | [S-29](v1/contract.md#s-29-位置干预力与结论投影) | runner | runner 的场景；agent 侧可观察 |
| 求值：失败不折成 `undecidable`；确定 | [S-9](v1/contract.md#s-9-授权上下文与求值) | 求值的实现（[G-1](v1/contract.md#十一已知缺口)） | 实现的单元测试：**停掉授权上下文存储，求值必须报失败而不是 `undecidable`** |
| 求值给的集合按 [S-8](v1/contract.md#s-8-有效执行权限) 的表收成一个档位（空集 → `forbid`）；MCP 动作的那一份取自可用性报告 | [S-8](v1/contract.md#s-8-有效执行权限) | 组装输入的 runner；值由 `capability.asset-evaluation` 与 `capability.asset-registry` 给 | 那几份的场景 |
| `tenantAutoWritable` 的来处 | [S-7](v1/contract.md#s-7-admissioninput) | [G-14](v1/contract.md#十一已知缺口) 的 owner | 待定 |
| 参数解析不了的调用不进 `admit`、即刻收场「失败」 | [S-7](v1/contract.md#s-7-admissioninput) | `capability.tool-execution-runtime` | 它的规范场景 |
| 第四档按人的资格隐藏；四档选项在别处出的卡上不带授权 | [S-15](v1/contract.md#s-15-定死的四档选项与卡片草稿)、[S-28](v1/contract.md#s-28-四档选项只在本能力出的卡上带授权含义) | PF-008 卡片契约 ＋ runner | 那两份契约的场景 |
| 这一件不可替换、不可禁用、不可收窄；核对只认 `omne-official:admission-judgment` | [S-32](v1/contract.md#s-32-这一件不得被替换禁用或收窄)、[S-26](v1/contract.md#s-26-令牌有效的条件) | 装配（runner 的装配清单）＋ `capability.asset-evaluation`／`capability.asset-governance`（PF-012 §5.8） | 资产领域与 runner 的场景 |

## 实际执行

**无。**没有实现，没有形式工件，没有运行记录。

## 变化的影响

- **2026-09-23 起草**：首版，没有旧证据可作废。
- **起草中的一处自我修正（同日）**：初稿要求一批里各项的 `parent` 逐值相同，与 `parent.permission` 按工具条目相矛盾；已改为「`parent` 都带或都不带、`parent.runMode` 相同，`parent.permission` 各项可不同」（[S-7](v1/contract.md#s-7-admissioninput)、[S-21](v1/contract.md#s-21-admit)、[S-23](v1/contract.md#s-23-一批的含义)、[S-24](v1/contract.md#s-24-失败值与它们的次序) 与 [examples §3](v1/examples.md#3-子宽于父被拒)）。
- **待主线确认的推导项**（接受之前须逐条确认；任一项被改判都会改动所列条款）：
  `answer` 成员与「有答复时禁止照判、其余由答复定」（[S-7](v1/contract.md#s-7-admissioninput)、[S-12](v1/contract.md#s-12-答复)、[S-22](v1/contract.md#s-22-判定次序)）；
  `verifyToken` 的输入扩成 `(token, call, session)` 与四个无效原因（[S-25](v1/contract.md#s-25-verifytoken)、[S-26](v1/contract.md#s-26-令牌有效的条件)）；
  凭据按「`callId` ＋ 本件的最终结论」这把键指认而不是记录 id（[S-16](v1/contract.md#s-16-admissiontoken-与参数相等)）；
  早先草稿以外的失败值 `unavailable`（[S-24](v1/contract.md#s-24-失败值与它们的次序)、[S-25](v1/contract.md#s-25-verifytoken)）；
  五个拒绝原因与四个选项 id 的 token（[S-14](v1/contract.md#s-14-拒绝原因)、[S-15](v1/contract.md#s-15-定死的四档选项与卡片草稿)）；
  「宽」的两条次序（[S-11](v1/contract.md#s-11-父会话摘要与宽的次序)）；
  `from = workspace ⇒ value = ask`（[S-8](v1/contract.md#s-8-有效执行权限)）；
  早先草稿里的类型名 `ExecutionPermission` 不立（[S-8](v1/contract.md#s-8-有效执行权限) 末段）。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定」的，出处后来落进 [D-040 §S14、§S15](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s14tool-admission报回的)。
  - **上面「待主线确认的推导项」全部采纳**（S14-b）；token 与 `data.loop-extension` 的 `ask`（四档选项只以本契约 S-15 为准、那边不另立常量）、`capability.hooks-import`（复用 S-15、S-28）逐字核过，一致。
  - **三档 token 只用 `ExecutePermission`**（S14-a）：[S-8](v1/contract.md#s-8-有效执行权限) 末段改写，G-11 的说明随之改。
  - **不可用的写法统一为 runner 那一种**（S15-d）：[S-29](v1/contract.md#s-29-位置干预力与结论投影) 与 [S-34](v1/contract.md#s-34-本能力缺席报错或判不出来) 改为「记录不带 `output`、效果 `vetoed`」，原写「每一项落 `veto`」。
  - **这一件不得被替换、禁用或收窄**（S14-d）：[S-32](v1/contract.md#s-32-这一件不得被替换禁用或收窄) 的前提有了兑现方，[S-26](v1/contract.md#s-26-令牌有效的条件) 写明只认装配钉死的那一件；**G-7 闭合**。
  - `verifyToken` 失败在执行运行时那边的收场名核对为 `notAdmitted{why}`／`admissionUnavailable`（[S-34](v1/contract.md#s-34-本能力缺席报错或判不出来)）。
  - **对证据的影响**：没有既有证据（全部未开始）；义务表两行改了承担方。
- **2026-09-24 第一轮独立评审修复（候选，未冻结，原地改；评审基线 `765b01dc`）**：
  - **产品依据逐版复核**：PF-007 16→18（rev 17 §5.6 补「不可用时全拒件顶上」；rev 18 `Ask()` 五个出口，不触及本能力）；PF-008 5→7（rev 6：写不出卡 ＝ 不放行 ＋ 告知 → G-13 闭合；第四档写得进去才出现 → [S-15](v1/contract.md#s-15-定死的四档选项与卡片草稿) 改、G-3 收窄；搬来的 hook 的卡不带授权 → [S-28](v1/contract.md#s-28-四档选项只在本能力出的卡上带授权含义) 原样成立；rev 7：放行判断不可用顶上全拒件、清卡第三条路 → [S-29](v1/contract.md#s-29-位置干预力与结论投影)、[S-12](v1/contract.md#s-12-答复) 改）；
    PF-012 10→14（rev 11：放行之后到执行之间不重判 → G-10 闭合、[S-31](v1/contract.md#s-31-一批里还有一条在等谁都不执行) 改；rev 12：拓展件不可用处置、系统自带件由指定挂件顶上、放行判断不能被替换 → S-29、S-32、S-34 改；rev 13、14 只动转换件，不触及本能力）；
    PF-002 16→20（rev 17 界与挑选、`{forbid}` 锁不锁都是界 → [S-8](v1/contract.md#s-8-有效执行权限) 的集合到档位对应表；rev 18～20 凭据、连接件，不触及本能力）；PF-014 5→7（rev 6 被中断的回复不交出动作、rev 7 连接件开新会话，不触及本能力；[S-12](v1/contract.md#s-12-答复) 引的 §5.4.2 未改）；PF-001 16→17（提升不动持有、方向词对齐，不触及本能力）。PF-015 仍是 rev 11。
  - **工具的指认**：`definition.name` 与 `call.tool` 都是模型面名字，本能力不做逆转写（[S-7](v1/contract.md#s-7-admissioninput)）；登记消费 `data.tool-definition/v1#S-6`。
  - **参数解析不了的调用不进 `admit`**（[S-7](v1/contract.md#s-7-admissioninput)、[S-17](v1/contract.md#s-17-缺席时的默认答案)）；收场归执行运行时。
  - **凭据本身不含会话，核对按（会话，`callId`，生效参数）**（[S-16](v1/contract.md#s-16-admissiontoken-与参数相等)）；原句「拿到别的会话去核对只会找不到」不成立，改为如实的说法；examples 第 6 节加 7′ 行。
  - **能力标识**：本件是 `omne-official:admission-judgment`（[S-26](v1/contract.md#s-26-令牌有效的条件)），登记消费 `data.loop-extension/v1#S-7`；S-32 第三行随之改。
  - **不可用由全拒件顶上**（[S-29](v1/contract.md#s-29-位置干预力与结论投影)、[S-34](v1/contract.md#s-34-本能力缺席报错或判不出来)），登记消费 `data.loop-extension/v1#S-33`；`admit` 失败的记录以 S-29、S-34 为准（`skipped: errored` ＋ `error`），S-40、S-44、examples 第 3、7 节改齐。
  - **有效执行权限**：求值给的集合怎样对到一个档位写进 [S-8](v1/contract.md#s-8-有效执行权限)（`capability.asset-evaluation` 的 G-9 以本契约为答）；MCP 动作的那一份取自可用性报告、拿不到即本能力这一次不可用；G-5 收窄。
  - **与 `capability.asset-evaluation`、`capability.asset-registry` 同轮修订对齐**：[S-8](v1/contract.md#s-8-有效执行权限) 的 MCP 那一条写明取的是报告 `effectivePermissions` 里 `execute:<对端动作名>` 那一项、由调用方按集合到档位的表收成 `value`；那一项缺席**或写着 `unavailable`** 都是本能力这一次不可用。本契约仍不读报告、不登这两份的依赖（依赖方向是它们 → 本契约）。
  - **第四档写得进去才出现**：新增必有输入 `tenantAutoWritable`（[S-7](v1/contract.md#s-7-admissioninput)），它的来处登 [G-14](v1/contract.md#十一已知缺口)。
  - **TA-1**：[S-25](v1/contract.md#s-25-verifytoken) ⑦ 补第三种变法；**TA-2**：消费者表补 `capability.asset-registry`、依赖状态说法统一为 candidate、未登记的两处引用改为不引或补登（S-8 不再引 `data.asset-model/v1#S-12`，S-29 引的 `data.loop-extension/v1#S-33` 已登记）。
  - **新规范场景** [S-46](v1/contract.md#s-46-第四档写不进去就不出现)～[S-48](v1/contract.md#s-48-本能力不可用时由全拒件顶上)，examples 第 8 节。
  - **依据落持久记录**：账本编号与施工标签删去，依据改链 D-040 与产品小节；本轮的主线裁定链 [D-040 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)（K10、K24、K26、K27、K29、K30、K48），`tenantAutoWritable` 这个名字由本契约取。
  - **对证据的影响**：没有既有证据；义务表新增三行场景、改三行承担方。
- **四份 candidate 依赖**（`data.content-blocks`、`data.tool-definition`、`data.loop-extension`、`data.asset-model`）改号或改义时，逐条核对 [契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面) 的表并同步 catalog 的 clauses。
- **消费者与上游输入的产出方**（`capability.loop-extension-runner`、`capability.tool-execution-runtime`、`capability.asset-evaluation`、`capability.asset-registry`、`capability.hooks-import`，均 candidate）：本契约只以名字提到它们、不登依赖；它们改动时核对 [第六节](v1/contract.md#六在拓展点协议里)、[S-8](v1/contract.md#s-8-有效执行权限) 与 [S-25](v1/contract.md#s-25-verifytoken) 的义务在它们那一侧是否有对应条款。

## 独立评审

处置栏的 K 编号指 [D-040 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) 的主线裁定。

| 评审 | 对象与基线 | 发现 | 处置 | 落在哪 |
|---|---|---|---|---|
| spec-reviewer，2026-09-24 | v1 candidate，基线 `765b01dc` | TA-1 `verifyToken` ⑦ 漏了「结论之后改写」 | **接受** | [S-25](v1/contract.md#s-25-verifytoken) ⑦ |
| 同上 | 同上 | TA-2 状态说法不一、漏消费者、两处引用未登记 | **接受** | [S-2](v1/contract.md#s-2-本契约不拥有什么)、[S-4](v1/contract.md#s-4-依赖方向与被消费的面)、[S-5](v1/contract.md#s-5-消费者)、[S-8](v1/contract.md#s-8-有效执行权限)；catalog |
| 同上 | 同上 | X-1 `call.tool` 的形式与逆转写的归属（阻断） | **接受**（K10）：两边都是模型面名字，本能力逐码点比、不做逆转写；逆转写归执行运行时 | [S-4](v1/contract.md#s-4-依赖方向与被消费的面)、[S-7](v1/contract.md#s-7-admissioninput)；examples 第 8 节；S-47 |
| 同上 | 同上 | X-3 解析不了的调用进不进 `admit` | **接受**（K24）：不进，交来即 `invalidInput`；收场归执行运行时 | [S-7](v1/contract.md#s-7-admissioninput)、[S-17](v1/contract.md#s-17-缺席时的默认答案)；S-47 |
| 同上 | 同上 | X-4 整批拒收之后落什么收场 | **不在本契约**（K25）：执行运行时登缺口，owner agent loop 契约 | `capability.tool-execution-runtime` v1 的缺口表 |
| 同上 | 同上 | X-5 `admit` 失败记在 `error` 还是 `veto.reason` | **接受**（K26）：S-29、S-34 为准（`skipped: errored` ＋ `error`） | S-40、S-44；examples 第 3、7 节 |
| 同上 | 同上 | X-6 凭据绑不绑会话；「别的会话找不到」不成立 | **接受**（K27） | [S-16](v1/contract.md#s-16-admissiontoken-与参数相等)；examples 第 6 节 7′ |
| 同上 | 同上 | X-9 系统自带件的能力标识没人定 | **接受**（K29）：本件 `omne-official:admission-judgment` | [S-26](v1/contract.md#s-26-令牌有效的条件)、[S-32](v1/contract.md#s-32-这一件不得被替换禁用或收窄) |
| 同上 | 同上 | X-10 产品 rev 过期（S-15 与 PF-008「写得进去才出现」相冲） | **接受**（K48）：逐版复核；S-15 改为出草稿时滤，G-3 收窄、G-10、G-13 闭合 | 契约头部、S-15、S-29、S-31、S-34；本文件「变化的影响」 |
| 同上 | 同上 | X-11 规格层名字无词条 | **接受**（按主线：产品正文没定义的规格层名字不立词条）：放行凭据、生效参数、一批动作仍标「（无词条）」；干预力、拓展件不可用处置已链词条 | 契约头部、[S-29](v1/contract.md#s-29-位置干预力与结论投影) |
| 同上 | 同上 | X-12 账本编号与施工标签 | **接受** | 设计依据、S-8、S-14、S-16、S-25、S-26、S-29、S-32、G 表 |
| 同上 | 同上 | R-a 第四档由谁滤 | **按主线裁定**（K48）：本能力出草稿时滤 | [S-15](v1/contract.md#s-15-定死的四档选项与卡片草稿) |
| 同上 | 同上 | R-b 全拒件落不落结论 | **按 `data.loop-extension` 现行写法**：不可用记录不带 `output`、`unavailability: fallback`，效果从 runner 的表算 | [S-29](v1/contract.md#s-29-位置干预力与结论投影) |
| 同上 | 同上 | R-f G-10 是否闭合 | **闭合**（PF-012 rev 11；K48） | G-10 |
