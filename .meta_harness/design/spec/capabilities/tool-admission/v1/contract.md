# capability.tool-admission v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.tool-admission, 1)`——
  `family = capabilities`、`topic = tool-admission`、规范路径 `spec/capabilities/tool-admission/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`（2026-09-23 起草），**未经独立评审、未接受、未冻结**；接受与采用只从 [catalog](../../../../registry/README.md) 读
- **契约种类**：**接口型**——本契约只定[放行判断](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision)**对外的输入、输出、判定次序与凭据**；
  授权表达怎样求值（函数体）、卡片怎样投递、调用怎样执行，都不在这里（[S-2](#s-2-本契约不拥有什么)）
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-007 rev 16、PF-008 rev 5、PF-012 rev 10、PF-015 rev 11、PF-002 rev 16、PF-014 rev 5、PF-001 rev 16** 为准
- **精确语义依赖**（逐项在 catalog 登记，消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)）：

  | 坐标 | 状态 |
  |---|---|
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | 已接受、已冻结 |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1` | candidate |
  | `omne-harness-lite-design-2026-09-15 · data.tool-definition · v1` | candidate |
  | `omne-harness-lite-design-2026-09-15 · data.loop-extension · v1` | candidate |
  | `omne-harness-lite-design-2026-09-15 · data.asset-model · v1` | candidate |

  **四份 candidate 以它们 v1 定型后的条款为准**；它们改号或改义时，本契约在[验证入口「变化的影响」](../verification.md#变化的影响)登记并随之修订
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用写全坐标，如 `capability.tool-admission/v1#S-22`。
  缺口 `G-n` 同此范围。**编号在本版本内只追加、不重排**
- **本文用到、词表里没有的概念（无词条）**，一律只指到出处，**不在这里下定义**：
  **放行凭据**（本契约的 `AdmissionToken`，[S-16](#s-16-admissiontoken-与参数相等)）、
  **生效参数**（[PF-012 §5.8 改参数先落一条生效参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数)）、
  **干预力**（[PF-000 §4](../../../../product/PF-000-occurrences-and-record-entries/design.md#干预力--intervention-power)）、
  **一批动作**（[PF-012 §5.8 一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个)；词表只有[一批卡片](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-card-batch--一批卡片--card-batch)），
  **执行权限**（[权限](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-permission--权限--permission)的一项，[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)；无独立词条）

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 放行判断走四步；三档执行权限各落一处；运行模式只在第 ④ 步；工作区那一级不参与；四步之后还有执行环境权限 | [PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步) | [S-8](#s-8-有效执行权限)、[S-10](#s-10-会话运行模式)、[S-22](#s-22-判定次序)、[S-2](#s-2-本契约不拥有什么) |
| 子不得宽于父；运行模式往下传 | [PF-007 §5.8](../../../../product/PF-007-meta-capabilities/design.md#58-子不得宽于父) | [S-11](#s-11-父会话摘要与宽的次序)、[S-24](#s-24-失败值与它们的次序) |
| 会话授权上下文是流水、结论现算；授权表达三个维度；全局那一档落成租户层权限值 | [PF-007 §4 会话授权上下文](../../../../product/PF-007-meta-capabilities/design.md#会话授权上下文) · [一笔授权表达有三个维度](../../../../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度) | [S-9](#s-9-授权上下文与求值)、[S-19](#s-19-每道准入现读结论不存)、[S-27](#s-27-四档答复各落在哪) |
| 放行不由任何一样单独决定；禁止翻不了案；拿不准宁可再问；翻不出裁决就不翻 | [PF-007 §6.11](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人) · [`Ask()` 必须成立的性质](../../../../product/PF-007-meta-capabilities/design.md#ask-必须成立的性质) | [S-9](#s-9-授权上下文与求值)、[S-12](#s-12-答复)、[S-22](#s-22-判定次序) |
| 放行判断是一个函数：什么时候跑、吃什么吐什么、既是判官也是撰稿人；选项定死四档；第四档受资格约束；禁止的动作不产卡 | [PF-008 §4 放行判断](../../../../product/PF-008-human-in-the-loop/design.md#放行判断) · [§5.2](../../../../product/PF-008-human-in-the-loop/design.md#52-那个判断函数) · [它吐出来的卡片，选项是固定的](../../../../product/PF-008-human-in-the-loop/design.md#它吐出来的卡片选项是固定的) · [第三档和第四档各有约束](../../../../product/PF-008-human-in-the-loop/design.md#第三档和第四档各有约束) | [S-6](#s-6-放行判断是一个函数无状态无提交)、[S-15](#s-15-定死的四档选项与卡片草稿)、[S-22](#s-22-判定次序)、[S-27](#s-27-四档答复各落在哪) |
| 一批卡片全答完才解除 | [PF-008 §5.3](../../../../product/PF-008-human-in-the-loop/design.md#53-一批卡片与答完是什么意思) | [S-31](#s-31-一批里还有一条在等谁都不执行) |
| 永远等着、不替人作答；拓展件不能替人答、不能把「问一下」改成放行 | [PF-008 §6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答) | [S-12](#s-12-答复)、[S-28](#s-28-四档选项只在本能力出的卡上带授权含义) |
| 「不回答」是合法答复；人拒绝之后 agent 分得出那是拒绝 | [PF-008 §6.5](../../../../product/PF-008-human-in-the-loop/design.md#65-不回答是合法答复) · [§6.9](../../../../product/PF-008-human-in-the-loop/design.md#69-人拒绝之后agent-分得出那是拒绝) | [S-12](#s-12-答复)、[S-14](#s-14-拒绝原因) |
| 卡片要让人看出答了它会解除什么 | [PF-008 §6.6](../../../../product/PF-008-human-in-the-loop/design.md#66-卡片要让人看出答了它会解除什么) | [S-15](#s-15-定死的四档选项与卡片草稿) |
| 三种来源的卡片同一形状，选项与记录不同 | [PF-008 §6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同) | [S-15](#s-15-定死的四档选项与卡片草稿)、[S-28](#s-28-四档选项只在本能力出的卡上带授权含义) |
| 系统拦下一个动作的旅程（四档各自的后果）；人明确表示不答；异常分支（禁止不产卡、卡片生成失败仍停住） | [PF-008 flows §1.3](../../../../product/PF-008-human-in-the-loop/flows.md#13-系统拦下一个动作) · [§1.8](../../../../product/PF-008-human-in-the-loop/flows.md#18-人明确表示不答) · [§二](../../../../product/PF-008-human-in-the-loop/flows.md#二异常分支) | [S-22](#s-22-判定次序)、[S-27](#s-27-四档答复各落在哪)、[S-34](#s-34-本能力缺席报错或判不出来) |
| 系统自带的几件各站在哪；干预力三档与报错默认；可插拔的服务 | [PF-012 §5.8 系统自带的几件](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪) · [干预力三档](../../../../product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的) · [可插拔的服务](../../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略) | [S-29](#s-29-位置干预力与结论投影)、[S-34](#s-34-本能力缺席报错或判不出来) |
| 没有「放宽」这一档 | [PF-012 §5.8 没有放宽](../../../../product/PF-012-agent-loop-and-run/design.md#没有放宽这一档) | [S-22](#s-22-判定次序)、[S-28](#s-28-四档选项只在本能力出的卡上带授权含义) |
| 改参数先落一条生效参数；放行、人签、执行是同一份参数 | [PF-012 §5.8 改参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数) | [S-16](#s-16-admissiontoken-与参数相等)、[S-26](#s-26-令牌有效的条件)、[S-30](#s-30-放行之后参数不再变) |
| 等人是 loop 的原语；一批动作先全部判完再执行任何一个；回放 | [PF-012 §5.8 等人是 loop 的原语](../../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语) · [一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个) | [S-23](#s-23-一批的含义)、[S-31](#s-31-一批里还有一条在等谁都不执行)、[S-35](#s-35-重启回放与在途) |
| 会话运行模式三档（原词） | [PF-015 §4 会话运行模式](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#会话运行模式) | [S-10](#s-10-会话运行模式) |
| 执行权限三档；权限按收窄取交集，收空即每次都被拒 | [PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool) · [§4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp) · [§5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成) | [S-8](#s-8-有效执行权限) |
| 工作区不参与权限计算；工作区自己提供的资产执行权限取最严值「问一下」 | [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) · [§5.8](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题) | [S-8](#s-8-有效执行权限)、[S-24](#s-24-失败值与它们的次序) |
| 插队时悬着的运行等待态卡片按「人明确拒绝回复」处置 | [PF-014 §5.4.2](../../../../product/PF-014-inbound-intake-and-queueing/design.md#542-两种等人答机制各归各产品语义是同一条) | [S-12](#s-12-答复) |
| 撤销只影响下一道尚未通过的准入 | [PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止) | [S-19](#s-19-每道准入现读结论不存)、[S-36](#s-36-撤销取消与归档) |
| 同一位置只按装配清单顺序；结论封闭 | [D-038](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) Q8 · Q19 | [S-29](#s-29-位置干预力与结论投影) |
| 规格形式；部署边界；租户隔离 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) · [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | [S-16](#s-16-admissiontoken-与参数相等)、[S-17](#s-17-缺席时的默认答案)、[S-24](#s-24-失败值与它们的次序)、[S-33](#s-33-装配给的保证-vs-协议须给的保证) |

**主线裁定（2026-09-23，待产品负责人确认）**——它们不在产品正文里，本契约照写并在条款里逐处标出：

| 裁定 | 落在哪 |
|---|---|
| **放行判断不可用 = 这一批全拒**（fail-closed）；PF-012 §5.8「不可用即视作卸载」对这一件不适用，产品正文的跟进归 PF-012 owner | [S-29](#s-29-位置干预力与结论投影)、[S-34](#s-34-本能力缺席报错或判不出来) |
| **放行判断钉在「执行动作之前」瀑布的最后一件** | [S-29](#s-29-位置干预力与结论投影)、[S-30](#s-30-放行之后参数不再变) |
| **放行凭据是日志引用**（那条放行结论 ＋ 被判参数的摘要），不是另发的凭证 | [S-16](#s-16-admissiontoken-与参数相等)、[S-26](#s-26-令牌有效的条件) |
| **会话运行模式用 PF-015 原词**，含 `bypass-permissions` 的连字符写法 | [S-10](#s-10-会话运行模式) |
| **有效执行权限带来源**：定义给的默认 / 各层配值 / 工作区最严值 | [S-8](#s-8-有效执行权限) |
| **放行四步只判工具**（含 MCP 带来的动作与 meta 的门）；技能「谁可以用」、拓展件的干预力在装配时判，不进这里 | [S-1](#s-1-本契约拥有什么)、[S-3](#s-3-本契约明确不承诺什么) |
| `auto_permission` 算不出就问人（维持产品原意，不改成问模型） | [S-22](#s-22-判定次序) |

> **没有产品行、由本契约推导的条款，逐条点名**（理由写在各条里）：
> [S-11](#s-11-父会话摘要与宽的次序) 的两条「宽」的次序；
> [S-12](#s-12-答复) 与 [S-22](#s-22-判定次序) 里「有答复时，禁止照判、其余由答复定」；
> [S-14](#s-14-拒绝原因) 的五个拒绝原因 token 与 [S-15](#s-15-定死的四档选项与卡片草稿) 的四个选项 id；
> [S-16](#s-16-admissiontoken-与参数相等) 的参数相等规则；
> [S-24](#s-24-失败值与它们的次序) 的 `unavailable` 与「一批共用依据」；
> [S-25](#s-25-verifytoken) 的输入扩成三件与 [S-26](#s-26-令牌有效的条件) 的四个无效原因。
> 这几处都在[报给主线](../verification.md#变化的影响)的清单里，接受前须确认。

---

## 一、含义与使用范围

### S-1 本契约拥有什么

本契约拥有**放行判断这一件系统自带拓展件对外的输入与输出**，一共四样：

| # | 拥有的 | 正文 |
|---|---|---|
| 1 | **一次放行判断的输入**：被判的那一次工具调用、它的有效执行权限（带来源）、授权上下文、会话运行模式、可选的父会话摘要与可选的答复 | [S-7](#s-7-admissioninput)～[S-12](#s-12-答复) |
| 2 | **判定次序**：四步，外加「答复回来之后」那一支；一批怎样判、失败值怎样排 | [S-21](#s-21-admit)～[S-24](#s-24-失败值与它们的次序) |
| 3 | **结论**：放行（带凭据）/ 拒绝（带封闭的原因）/ 问人（带一张选项定死四档的卡片草稿）；四档答复各自的含义 | [S-13](#s-13-admissionresult)～[S-15](#s-15-定死的四档选项与卡片草稿)、[S-27](#s-27-四档答复各落在哪) |
| 4 | **放行凭据**：它指认什么、怎样核对、什么时候作废 | [S-16](#s-16-admissiontoken-与参数相等)、[S-25](#s-25-verifytoken)、[S-26](#s-26-令牌有效的条件) |

**适用范围：只判工具调用**——作者写的工具、[MCP](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) 接入点带来的每一个动作、[meta 能力](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability)的门，都按**那个工具条目的执行权限**进四步（主线裁定，待确认）。
MCP 带来的动作用的是接入点那份持有上的逐动作执行权限（[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)）——**那是上游求值的事，到这里它就是一个执行权限值**（[S-8](#s-8-有效执行权限)）。

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| **授权表达怎样求值**——语言、函数体、「同一件事」的粒度、自由作答怎样理解 | 实现；产品面归 PF-007 owner（[G-1](#十一已知缺口)）。本契约只定它是一个函数、它的结果集合、它的失败与「算不出」分开（[S-9](#s-9-授权上下文与求值)） |
| **有效执行权限怎样算出来**——各层允许集合求交、收成一个档位 | `capability.asset-evaluation`（未在本基线）；本契约只收它的结果（[S-8](#s-8-有效执行权限)） |
| **卡片**：`CardId`、陈列、投递、谁能答、答复的记录形状、第四档按看的人隐藏 | PF-008 的卡片契约（未起草；[G-3](#十一已知缺口)、[G-4](#十一已知缺口)） |
| **答复落成授权表达或租户层权限值**这两次写入 | 会话授权上下文的 owner 与资产治理的写面（[G-2](#十一已知缺口)） |
| **瀑布、结论落日志、回放、报错策略的执行、等人** | `capability.loop-extension-runner`（并行起草）；本契约只写它对本能力的义务（[第六节](#六在拓展点协议里)） |
| **执行**：提交、落点、收场、一次调用只执行一次 | `capability.tool-execution-runtime`（并行起草）；它在提交时调 [S-25](#s-25-verifytoken) |
| **[执行环境权限](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-execution-environment-permission--执行环境权限--execution-environment-permission)**——作用落在哪 | PF-005 的契约。它在**同一次执行里紧接着**发生（[PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步) 末段）；**放行了不等于落得下**，两者不合并读 |
| 工具调用块、工具定义、结论与卡片草稿的**形状** | `data.content-blocks`、`data.tool-definition`、`data.loop-extension`（[S-4](#s-4-依赖方向与被消费的面)），本契约只引名字 |
| 十三扇门各自的动作 | PF-007 的各门契约 |

### S-3 本契约明确不承诺什么

- **不判「能不能用」。**一条命令被权限关掉、一个工具此刻不可用，走的是[可用性](../../../../product/PF-007-meta-capabilities/design.md#57-权限能关掉一条命令关不掉一扇门)那一套，不是这里；
  `never` 使 `Ask().request_approval` 不可用也是那一套。本契约**不读可用性**，对一个替换件的调用照样判。
- **不判别的资产类别的权限项**：技能的「谁可以使用它」、拓展件的干预力、斜杠命令的入口权限，在装配时判（主线裁定，待确认）。
  `Skills().exec_script` 的执行权取哪一份，见 [G-6](#十一已知缺口)。
- **不等人。**要问人时本能力只交回一张卡片草稿；停下来等、落卡片、回放，都是 runner 的事（[S-6](#s-6-放行判断是一个函数无状态无提交)）。
- **不写任何东西。**结论落日志归 runner，答复落成授权归 [G-2](#十一已知缺口) 的 owner；本能力没有提交点。
- **不承诺一次调用只执行一次。**凭据核对不消耗凭据（[S-25](#s-25-verifytoken) ⑦），「只执行一次」归执行运行时按 `CallId` 兑现。
- **不发出任何停止信号，也不因权限变化而回头作废已下的结论**（[S-36](#s-36-撤销取消与归档)）。
- **不承诺对外交换格式，本版不附 Schema。**输入与结论用散文写含义，值类型引用 data 契约；
  线上形状归把这些操作送过进程边界的那份 composition（[规格容器的规矩](../../../README.md#准入门槛与停止条件)）。

### S-4 依赖方向与被消费的面

**依赖方向是单向的：本契约 → 下列 data 契约。**`capability.loop-extension-runner` 与 `capability.tool-execution-runtime` 消费本契约，方向不变。

#### `data.identity-values` v1 侧

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-17` 身份参数没有默认值](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)、[`#S-18` 缺席即拒绝](../../../data/identity-values/v1/contract.md#s-18-缺席即拒绝) | [S-17](#s-17-缺席时的默认答案)；[S-25](#s-25-verifytoken) 的会话指认没有默认值 |
| [`#S-19` 不可用即明确失败](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败) | [S-18](#s-18-判不出来不是拒绝也不是算不出)：求值读不到、日志读不到，一律 `unavailable` |
| [`#S-27` 每道准入现读](../../../data/identity-values/v1/contract.md#s-27-每道准入现读) | [S-19](#s-19-每道准入现读结论不存) |
| [`#S-30` 跨边界须重新验证](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证) | [S-33](#s-33-装配给的保证-vs-协议须给的保证) 右列 |
| [`#S-31` 不透明标识的交换表示](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) | `AdmissionToken` 的交换表示与相等（[S-16](#s-16-admissiontoken-与参数相等)） |
| [`#S-33` 表示层校验与判定分开](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) | [S-17](#s-17-缺席时的默认答案)、[S-24](#s-24-失败值与它们的次序) |

#### `data.content-blocks` v1 侧

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-12` 完整的工具调用](../../../data/content-blocks/v1/contract.md#s-12-完整的工具调用) | 被判的对象：`call` 的 `callId`、`tool`、`arguments`（[S-7](#s-7-admissioninput)）；参数相等按它的 `arguments`（[S-16](#s-16-admissiontoken-与参数相等)） |
| [`#S-14` CallId](../../../data/content-blocks/v1/contract.md#s-14-callid) | 一批里 `callId` 不重复；凭据绑定的调用标识；**唯一范围是一份会话日志**——所以 [S-25](#s-25-verifytoken) 必须带会话指认 |

#### `data.tool-definition` v1 侧

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-15` 执行权限](../../../data/tool-definition/v1/contract.md#s-15-执行权限) | **执行权限三档的 token**：`forbid` / `auto` / `ask`。本契约**不另立一份同义定义**（[S-8](#s-8-有效执行权限)） |
| [`#S-18` 名字的表示与相等](../../../data/tool-definition/v1/contract.md#s-18-名字的表示与相等) | `definition.name` 与 `call.tool` 的逐码点相等（[S-7](#s-7-admissioninput)） |

#### `data.loop-extension` v1 侧

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-4` 干预力三档](../../../data/loop-extension/v1/contract.md#s-4-干预力三档)、[`#S-5` 报错处置策略](../../../data/loop-extension/v1/contract.md#s-5-报错处置策略) | 本能力这一件是 `veto` 档、报错按 `treat_as_veto`（[S-29](#s-29-位置干预力与结论投影)） |
| [`#S-13` 瀑布里的 subject 与 earlier](../../../data/loop-extension/v1/contract.md#s-13-瀑布里的-subject-与-earlier)、[`#S-14` 按位置的 Subject](../../../data/loop-extension/v1/contract.md#s-14-按位置的-subject) | 输入里的 `call` 与 `definition` 就是 `BeforeActionSubject` 在瀑布末端的那两样（[S-7](#s-7-admissioninput)）；`ToolDefinitionRef` 取自这里 |
| [`#S-19` 结论封闭八种](../../../data/loop-extension/v1/contract.md#s-19-结论封闭八种)、[`#S-21` 位置与结论的合法组合](../../../data/loop-extension/v1/contract.md#s-21-位置与结论的合法组合)、[`#S-25` veto](../../../data/loop-extension/v1/contract.md#s-25-veto) | 三种结论到 `observed` / `veto` / `ask` 的投影（[S-29](#s-29-位置干预力与结论投影)） |
| [`#S-23` rewrite](../../../data/loop-extension/v1/contract.md#s-23-rewrite) | 改参数先落生效参数；被判的参数是改写之后的那一份（[S-26](#s-26-令牌有效的条件)、[S-30](#s-30-放行之后参数不再变)） |
| [`#S-28` ask](../../../data/loop-extension/v1/contract.md#s-28-ask) | `DecisionCardDraft`、`CardOption` 的形状；四档选项是它的四个实例（[S-15](#s-15-定死的四档选项与卡片草稿)） |
| [`#S-29` 没有放宽](../../../data/loop-extension/v1/contract.md#s-29-没有放宽) | [S-28](#s-28-四档选项只在本能力出的卡上带授权含义) |
| [`#S-30` 每件的结论必留](../../../data/loop-extension/v1/contract.md#s-30-每件的结论必留)、[`#S-31` 三种记录形状](../../../data/loop-extension/v1/contract.md#s-31-三种记录形状)、[`#S-32` 结论即走向](../../../data/loop-extension/v1/contract.md#s-32-结论即走向) | 凭据所指的「那条放行结论」就是本件在 `before_action` 为该 `callId` 落下的最终 `Conclusion`（[S-26](#s-26-令牌有效的条件)） |

#### `data.asset-model` v1 侧

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-16` 持有范围](../../../data/asset-model/v1/contract.md#s-16-持有范围) | `from` 的取值就是 `HoldingScope.layer` 那四个 token（[S-8](#s-8-有效执行权限)） |
| [`#S-20` 出厂格与工作区格的持有](../../../data/asset-model/v1/contract.md#s-20-出厂格与工作区格的持有) | `from = factory` 即声明里的默认值；工作区格没有权限项的配值（[S-8](#s-8-有效执行权限)） |

**提到、但不消费的**（不登 catalog）：`data.messages` 的 `CardAnswer`、`CardId`（卡片答复的记录形状归卡片契约，[G-4](#十一已知缺口)）；
`data.offer-expiry`（本契约没有时间点值）。

### S-5 消费者

| 消费者 | 消费什么 |
|---|---|
| **`capability.loop-extension-runner`**（并行起草） | [S-21](#s-21-admit) `admit`：把本能力当作 `before_action` 上的一件可否决拓展件调用，**钉在瀑布最后**；把三种结论投影成 `data.loop-extension` 的结论并落日志；把卡片答复作为 `answer` 交回来（[第六节](#六在拓展点协议里)） |
| **`capability.tool-execution-runtime`**（并行起草） | [S-25](#s-25-verifytoken) `verifyToken`：提交一次已放行调用之前核对凭据；`AdmissionToken` 的家在本契约 |
| **PF-008 的卡片契约**（未起草） | [S-15](#s-15-定死的四档选项与卡片草稿) 的四档选项常量与卡片草稿；[S-27](#s-27-四档答复各落在哪) 的答复含义 |
| **`capability.hooks-import`**（并行起草，兼容层） | 宿主 hook 的 `ask` 用**同一组四档选项**作卡片选项——**但那些卡上它们不带授权含义**（[S-28](#s-28-四档选项只在本能力出的卡上带授权含义)） |
| **租户自定义的拓展件** | 在本能力**之前**改写、否决或出卡；本能力读到的是它们之后的最终 `call`（[S-30](#s-30-放行之后参数不再变)） |

---

## 二、输入、结论与凭据

### S-6 放行判断是一个函数：无状态、无提交

**本能力是一个纯判定**：给定同一份输入、同一个求值结果，永远给出同一个结论。它：

- **不持有任何状态**：没有「已获准清单」，没有缓存，没有在途的多步事务（[PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)「第 ③ 步的结论每次现算，系统里不存一份」）；
- **不写任何东西**：结论落日志是 runner 的事（`data.loop-extension/v1#S-30`），答复落成授权是别人的事（[G-2](#十一已知缺口)）；
- **不等待**：要问人时交回一张卡片草稿就结束这一次调用；**等**用的是 loop 的[等待原语](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-wait-primitive--等待原语--wait-primitive)，不在本能力里；
- **唯一的外部读取**是 [S-9](#s-9-授权上下文与求值) 的求值与 [S-26](#s-26-令牌有效的条件) 的读日志，二者读不到都以 `unavailable` 失败。

**什么时候跑，由调用方定**：[一次模型响应里有工具调用才跑，没有就不跑](../../../../product/PF-008-human-in-the-loop/design.md#52-那个判断函数)（PF-008 §5.2「什么时候跑」）。
本能力对一个空的批给 `invalidInput`（[S-24](#s-24-失败值与它们的次序)），不给「空结论」。

### S-7 AdmissionInput

**一批里的每一项 `AdmissionInput = { call, definition, effectivePermission, grants, runMode, parent?, answer? }`，不许有其他成员。**

| 成员 | 含义 | 值类型 | 有无 |
|---|---|---|---|
| `call` | 被判的这一次工具调用——**瀑布里排在本件之前的各件改写之后的那一份**（`data.loop-extension/v1#S-13`） | `data.content-blocks` 的完整工具调用块（`#S-12`） | 必有 |
| `definition` | 运行时为这次调用找到的那份工具定义的名字 | `data.loop-extension` 的 `ToolDefinitionRef`（`#S-14`） | 必有；`definition.name` 与 `call.tool` 按 `data.tool-definition/v1#S-18` 逐码点相等，不等即 `invalidInput` |
| `effectivePermission` | 这个工具条目此刻的有效执行权限，带来源（[S-8](#s-8-有效执行权限)） | 见 S-8 | 必有 |
| `grants` | 这个会话此刻的授权上下文（[S-9](#s-9-授权上下文与求值)） | `AuthorizationContext`，不透明 | 必有 |
| `runMode` | 这个会话的运行模式（[S-10](#s-10-会话运行模式)） | `SessionRunMode` | 必有 |
| `parent` | 这个会话是[子会话](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-child-session--子会话--child-session)时，父会话此刻的摘要（[S-11](#s-11-父会话摘要与宽的次序)） | `EffectivePermissionSummary` | **是子会话就必带**；不是就不带（带不带由调用方按会话关系定，[G-12](#十一已知缺口)） |
| `answer` | 本能力为**这一次调用**出过的那张卡片上，人给的答复（[S-12](#s-12-答复)） | 四个选项 id 之一或 `declined` | 只在那张卡片答完之后、调用方回来收结论时带 |

**`answer` 是账本之外的一个成员，本契约推导**：没有它，「不允许」与「不回答」两种答复无路可回——
它们**都不落成授权表达**（[PF-008 §5.2](../../../../product/PF-008-human-in-the-loop/design.md#它吐出来的卡片选项是固定的) 的表「不允许」那一行落点为空；[§6.5](../../../../product/PF-008-human-in-the-loop/design.md#65-不回答是合法答复)），
只靠重跑四步，拿到的仍是「算不出 → 问人」，**同一张卡片会被无限重出**；而 agent 必须分得出「人不同意」与「没有答案」（[§6.9](../../../../product/PF-008-human-in-the-loop/design.md#69-人拒绝之后agent-分得出那是拒绝)）。

**`grants`、`runMode` 与 `parent.runMode` 是会话一级的值**：一批里各项的 `runMode` 必须相同；`parent` 要么各项都带、要么都不带，带时各项的 `parent.runMode` 必须相同；否则 `invalidInput`。
**`parent.permission` 是按工具条目的**，一批里调不同工具的各项可以不同；
**`grants` 必须是同一时点读到的同一份**——它不透明，本契约判不出来，**这一条由调用方保证**（[S-23](#s-23-一批的含义)、[S-33](#s-33-装配给的保证-vs-协议须给的保证)）。

### S-8 有效执行权限

**`effectivePermission = { value, from }`：**

| 成员 | 取值 | 含义 |
|---|---|---|
| `value` | **恰三个**：`forbid` / `auto` / `ask`——就是 [`data.tool-definition/v1#S-15`](../../../data/tool-definition/v1/contract.md#s-15-执行权限) 的三档 token（禁止 / 自动 / 问一下） | 这个工具条目此刻的执行权限：出厂默认 ∩ 组织级 ∩ 租户级收成的**一个**档位（[PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步) 第 ① 步的交集） |
| `from` | **恰四个**：`factory` / `organization` / `tenant` / `workspace`——就是 [`data.asset-model/v1#S-16`](../../../data/asset-model/v1/contract.md#s-16-持有范围) 的 `HoldingScope.layer` 四个 token，**不带身份值** | 这个档位从哪来：`factory` ＝ 没有哪一层收窄它，用的是定义给的默认值（`data.asset-model/v1#S-20`、[D-038 Q6](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔)）；`organization`、`tenant` ＝ 那一层的配值定下了它；`workspace` ＝ **这是工作区自己提供的资产，按 [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) 取最严值** |

- **判定只看 `value`，不看 `from`。**`from` 只用来写卡片说明与拒绝的来由（「为什么」要看得见，[PF-007 §5.7](../../../../product/PF-007-meta-capabilities/design.md#57-权限能关掉一条命令关不掉一扇门)）；同一个 `value` 在四种 `from` 下给出同一个结论。
- **`from = workspace` 时 `value` 只能是 `ask`**：工作区配的权限在读入时就被滤掉，工作区自己提供的资产**没有任何一层配得了它**（`data.asset-model/v1#S-20`）。
  收到 `{ value: auto 或 forbid, from: workspace }` 即 `invalidInput`——**一个仓库不能给自己提权**，本能力在这里再挡一次（[S-45](#s-45-工作区来的工具不提权)）。
- **`from` 不记「会话」那一格**：权限层序里的会话格由 `grants` 进第 ③ 步（[PF-002 §5.8](../../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)），不进 `effectivePermission`。
- **收成一个档位是上游的义务**：各层给的是允许集合，求交之后可能是空集或多个元素（[PF-002 §5.3](../../../../product/PF-002-assets-settings-and-permissions/design.md#53-两个例子两种合成)）。
  **空集必须收成 `forbid`**——产品正文写的是「装得上、看得见，只是每次调用都被拒」，那正是第 ① 步；
  多元素与 `default` 不在交集里时收成哪一个，归 `capability.asset-evaluation`（`data.asset-model/v1#S-12` 已把它交给那里；[G-5](#十一已知缺口)）。
  **本能力不自己收**：拿到一个集合而不是一个档位即 `invalidInput`。
- **账本把这个值的类型记作 `ExecutionPermission`；它与 `data.tool-definition` 的 `ExecutePermission`（那是 `{ default }` 声明）撞名而不同物。**
  本契约**不立这个名字**，只说「`data.tool-definition/v1#S-15` 的三档 token」；名字归对齐波统一（已报主线）。

### S-9 授权上下文与求值

**`grants: AuthorizationContext` 不透明。**它是这个会话的[会话授权上下文](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-session-authorization-context--会话授权上下文--session-authorization-context)，
外加由作用域为全局的[授权表达](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-authorization-expression--授权表达--authorization-expression)落成的租户层权限值那一侧（[PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步) 第 ③ 步「结构化的 ＋ 本会话流水」）。

**第 ③ 步用一个求值函数：`evaluate(call, grants)`。**它的结果恰三种，外加一种失败：

| 结果 | 含义 | 本能力怎么用 |
|---|---|---|
| `allow` | 已形成的授权表达**管到这件事，且准** | 放行 |
| `deny` | 已形成的授权表达**管到这件事，且不准**（例如撤回、用嘴说的「这个别做」） | 拒绝，原因 `authorization_denied` |
| `undecidable` | **已形成的授权表达管不到这件事**——流水里没有一笔算得出它 | 进第 ④ 步 |
| **失败** | **求值根本没做出来**：流水读不到、租户层权限值读不到、求值自己出错 | 整次 `admit` 以 `unavailable` 失败（[S-18](#s-18-判不出来不是拒绝也不是算不出)） |

- **`undecidable` 是一个判出来的结果，失败不是。**把失败折成 `undecidable`，在 `bypass-permissions` 下就是**放行**，在 `auto_permission` 下就是凭空多问一次——
  **两者都是把「没有结论」讲成了一个结论**（`data.identity-values/v1#S-19`）。
- **求值必须是确定的**：同一个 `call`、同一份 `grants`，给出同一个结果。回放与「同一件事不必问第二遍」都靠它。
- **求值对调用的参数敏感**：人签的是那段文字（[PF-008 §5.2](../../../../product/PF-008-human-in-the-loop/design.md#它同时是撰稿人这一点很要紧)），参数变了就可能是另一件事——「同一件事」的粒度归 [G-1](#十一已知缺口)，但**本能力交给求值的一定是改写之后、将被执行的那一份参数**。
- **函数体不在本契约**：授权表达的语言、自由作答怎样理解、「这一次」那一档怎样对到一批调用，都归实现与 PF-007（[G-1](#十一已知缺口)）。
  **本契约只约束它的结果集合、失败与确定性。**

### S-10 会话运行模式

**`SessionRunMode` 恰三个，取 [PF-015 §4](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#会话运行模式) 的原词原样：**

| token | [会话运行模式](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-session-run-mode--会话运行模式--session-run-mode) | 在第 ④ 步 |
|---|---|---|
| `never` | 一律当作被拒，不问任何人 | 拒绝，原因 `run_mode_never` |
| `auto_permission` | 拿已经形成的授权表达算，算不出来就问人 | 问人（主线裁定：维持产品原意，**不改成问模型**） |
| `bypass-permissions` | 直接放行 | 放行 |

- **`bypass-permissions` 带连字符，是 PF-015 的原词**，不按「枚举值 snake_case」改写（主线裁定，待确认）；
  **`bypass`、`bypass_permissions`、`auto` 都不是它的别名**——收到即 `modeUnknown`（[S-24](#s-24-失败值与它们的次序)），**不得被读成最接近的那一档**。
- **运行模式只在第 ④ 步出场**：它叠在求值结果之上，**不替代它**；第 ① 步判出的禁止，三档都翻不了案（[S-22](#s-22-判定次序)）。
- **这个值的家不在本契约**：它是会话的一项属性，归 PF-015 的会话契约（未建立，[G-5](#十一已知缺口)）；本契约只是第一处把这三个 token 写下来的地方。

### S-11 父会话摘要与「宽」的次序

**`parent: EffectivePermissionSummary = { permission, runMode }`**：

| 成员 | 含义 |
|---|---|
| `permission` | 父会话**此刻**对**同一个工具条目**的有效执行权限档位（三档 token，不带 `from`） |
| `runMode` | 父会话**此刻**的运行模式 |

**判定前置：子不得宽于父**（[PF-007 §5.8](../../../../product/PF-007-meta-capabilities/design.md#58-子不得宽于父)「子实际拿到的 ＝ 父当前拥有的 ∩ 子请求的」）。
一个单值档位上的「宽」按下面两条次序比较（**本契约推导**：档位越靠右，不经人点头就能做成的越多）：

```text
执行权限    forbid  <  ask  <  auto
运行模式    never   <  auto_permission  <  bypass-permissions
```

**`effectivePermission.value` 比 `parent.permission` 宽，或 `runMode` 比 `parent.runMode` 宽，即 `parentNarrower`**（[S-24](#s-24-失败值与它们的次序)）。

- **这是前置条件，不是本能力替上游求交**：子会话的有效权限本该已经是交集；收到一个比父宽的值，说明上游没有求交或父在此后被收窄了。
  **本能力不就地收窄、不改判**，整次失败，让错处被看见——就地取交集会把上游的缺陷掩成一次「正常」的放行或拒绝。
- **「此刻」要紧**：「父当前拥有的」随父变；父被收窄之后，子的下一道准入就会因为这一条失败，直到上游把子也收窄（[S-19](#s-19-每道准入现读结论不存)）。
- **父是 `never`，子只能是 `never`**——[PF-007 §5.8](../../../../product/PF-007-meta-capabilities/design.md#58-子不得宽于父)「父都不问人了，子更不该问」在这里落成：子若是 `auto_permission`，整次失败，**子的调用不会走到「问人」**。
- 父会话对这个工具条目**没有**任何执行权限（父没装它）时摘要里是什么、`handoff` 出去的会话带不带摘要，归上游（[G-12](#十一已知缺口)）。

### S-12 答复

**`answer` 是本能力为这一次调用出过的那张卡片上、人给的答复，恰五种取值：**
[S-15](#s-15-定死的四档选项与卡片草稿) 的四个选项 id（`deny`、`allow_once`、`allow_session`、`allow_tenant`），或 **`declined`**（人明确拒绝回复）。

| 取值 | 来自 |
|---|---|
| 四个选项 id | 人在卡片上按下的那一档 |
| `declined` | 人在卡片上点「不回答」（[PF-008 flows §1.8](../../../../product/PF-008-human-in-the-loop/flows.md#18-人明确表示不答)）；**或用户[插队](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-queue-jump--插队--queue-jump)把运行等待态上悬着的卡片一并解除**——那按「人明确拒绝回复」处置（[PF-014 §5.4.2](../../../../product/PF-014-inbound-intake-and-queueing/design.md#542-两种等人答机制各归各产品语义是同一条)） |

- **自由作答不是 `answer` 的取值。**人在这张卡片上写下的话是一笔语义化的授权表达（[PF-007 它不挑来源](../../../../product/PF-007-meta-capabilities/design.md#它不挑来源)），
  **它落进授权上下文之后，调用方不带 `answer` 再判一次**：第 ③ 步算得出就照办；**算不出就再问一轮**——
  [翻不出裁决就不要翻](../../../../product/PF-007-meta-capabilities/design.md#ask-必须成立的性质)，拿不准就再问一次（[UL-admission-decision](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision) 注意 ③）。
  **本能力不替人把一句话合成成「允许」或「不允许」**。自由作答怎样落进授权上下文，归 [G-2](#十一已知缺口)。
- **答复只是一个输入，不是一次授权的全部**：有答复时第 ① 步照判，**明确禁止的动作，人点了允许也做不成**（[PF-008 acceptance](../../../../product/PF-008-human-in-the-loop/acceptance.md#判断函数)「权限设置里明确禁止的事 → 人在卡片上点同意也做不成」；[S-22](#s-22-判定次序)）。
- **答复的真实性由调用方保证**：它确实是本能力为**这个 `callId`** 出的那张卡片上的答复、答复者有权答它（[PF-008 §6.7](../../../../product/PF-008-human-in-the-loop/design.md#67-租户隔离在池子上成立)）、
  `allow_tenant` 只来自有资格改租户权限设置的人（[G-3](#十一已知缺口)）。**本能力判不出这三条**，它们是 runner 与卡片契约的义务。
- **卡片被作废不是答复**：运行被取消、会话被归档时卡片作废（[PF-012 flows §5.3](../../../../product/PF-012-agent-loop-and-run/flows.md#53-被取消不在状态转移表里因为它不是一行)），那一批不再判，调用方**不得**把作废读成 `declined` 交回来。

### S-13 AdmissionResult

**每一项的结论恰三种，按 `kind` 判别：**

| `kind` | 成员 | 含义 |
|---|---|---|
| `allow` | `token: AdmissionToken`（[S-16](#s-16-admissiontoken-与参数相等)） | 放行这一次调用、这一份参数 |
| `deny` | `reason`：[S-14](#s-14-拒绝原因) 的五个之一 | 这一次调用不做 |
| `ask` | `card: DecisionCardDraft`（[S-15](#s-15-定死的四档选项与卡片草稿)） | 要人点头；这一次调用在人答完之前不做 |

- **没有第四种**，尤其没有「部分放行」「放行但降级」「等一会儿再判」。
- **「判不出来」不是结论**：它是整次 `admit` 的失败（[S-24](#s-24-失败值与它们的次序)），**与 `deny` 是两个值**。
- **`ask` 只在第 ④ 步、`runMode` 为 `auto_permission` 时出现**；有 `answer` 时**不会**出现（[S-22](#s-22-判定次序)）——同一张卡片答完之后不会再出同一张。

### S-14 拒绝原因

**`deny.reason` 恰五个，闭合**（token 由本契约推导，账本未列）：

| token | 出自哪一步 | agent 与审计据此知道什么 |
|---|---|---|
| `permission_forbidden` | 第 ① 步：执行权限为禁止 | 这类事在这里原则上不准；**来由看 `from`**（哪一层禁的，或上游收成了空集） |
| `authorization_denied` | 第 ③ 步：授权表达算出不准 | 用户在这个会话里说过不准（或撤回了先前的准许） |
| `run_mode_never` | 第 ④ 步：运行模式 `never` | 本该问人，这个会话不问人 |
| `human_refused` | 答复 `deny`（「不允许」） | **人不同意**——不是执行失败，不要重试（[PF-008 §6.9](../../../../product/PF-008-human-in-the-loop/design.md#69-人拒绝之后agent-分得出那是拒绝)） |
| `human_declined` | 答复 `declined` | **没有答案**——人不想答或插队解除了卡片；不是失败，也不是人不同意（[PF-008 §6.5](../../../../product/PF-008-human-in-the-loop/design.md#65-不回答是合法答复)） |

- **五个必须分得开**：「人不同意」「没有答案」「规则不准」混成一个值，agent 会重试一件人刚否掉的事，或放弃一件只差再问一句的事（[PF-008 flows §二](../../../../product/PF-008-human-in-the-loop/flows.md#二异常分支)）。
- **拒绝不是失败**：五个都是判出来的结论，重试同一份输入得到同一个答案；它们与 [S-24](#s-24-失败值与它们的次序) 的四个失败值不重叠。
- **本能力自己的失败不在这里**：放行判断没给出结论时 runner 落的否决（[S-34](#s-34-本能力缺席报错或判不出来)）不借用这五个中的任何一个。

### S-15 定死的四档选项与卡片草稿

**`ask.card` 是 `data.loop-extension` 的一份 `DecisionCardDraft`（[`#S-28`](../../../data/loop-extension/v1/contract.md#s-28-ask)），它的 `options` 恒为下面四个 `CardOption`，按这个顺序，一个不多、一个不少：**

| `id` | `label`（[PF-008 §5.2](../../../../product/PF-008-human-in-the-loop/design.md#它吐出来的卡片选项是固定的) 原词） | `effect` |
|---|---|---|
| `deny` | 不允许 | 不带 |
| `allow_once` | 这次允许 | 不带 |
| `allow_session` | 本会话内，这类情况都允许 | 不带 |
| `allow_tenant` | 将来本租户所有会话，这类情况全允许 | 不带 |

- **`label` 是原词，逐字**；`id` 是本契约推导的 token（账本未给）。**四档的含义由 `id` 定，写在 [S-27](#s-27-四档答复各落在哪)，不由 `effect` 携带**——`effect` 是出卡那一件自己解释的附带数据，本能力不用它。
- **草稿里恒有四档，第四档也在**：草稿写成时还不知道谁来答。**「没有资格的人看不到第四档」是陈列与答复那一侧的义务**（[PF-008 flows §二](../../../../product/PF-008-human-in-the-loop/flows.md#二异常分支)），归卡片契约（[G-3](#十一已知缺口)）。
- **`about = { position: before_action, callId: call.callId }`**。
- **`explanation` 由本能力写，人签的是这段文字**（[PF-008 §5.2](../../../../product/PF-008-human-in-the-loop/design.md#它同时是撰稿人这一点很要紧)）。它必须说清下面五样，缺一样就是产品缺陷（[PF-008 flows §二](../../../../product/PF-008-human-in-the-loop/flows.md#二异常分支)「说明含糊不清」）：

  1. **做什么**：哪个工具（多命令工具还有哪条命令），**将被执行的那一份参数**；
  2. **为什么问**：执行权限是「问一下」及其来由（`from`），已有的授权表达管不到这件事，会话运行模式是 `auto_permission`；
  3. **四档各自的后果**：落在哪、活多久（[S-27](#s-27-四档答复各落在哪) 那张表的人话版）——[后果就印在选项旁边](../../../../product/PF-008-human-in-the-loop/design.md#为什么要把作用域摆成看得见的选项)；
  4. **答了会解除什么**：解除的是**这个运行**，而且要**这一批卡片全部答完**才解除；之后还可能再出一轮（[PF-008 §6.6](../../../../product/PF-008-human-in-the-loop/design.md#66-卡片要让人看出答了它会解除什么)）；
  5. **放行不等于落得下**：之后还有执行环境权限那一道，不承诺一定执行成功。

  措辞、语言、排版归实现；**不得**转述被本契约以外的拓展件拦下、未落盘的内容（`data.loop-extension/v1#S-25`）。

### S-16 AdmissionToken 与参数相等

**`AdmissionToken` 是放行凭据（无词条）：一个不透明值，指认「本能力为一次调用下的那条放行结论」与「被判的那一份参数」**——
**它是日志引用，不是另发的凭证**（主线裁定，待确认）：

| 它指认的 | 怎样指认 |
|---|---|
| **那条放行结论** | 以**会话日志里的一把键**指认：（这次调用的 `callId`，本能力这一件在 `before_action` 为它落下的**最终**结论）——那条 `Conclusion` 由 runner 落下（`data.loop-extension/v1#S-30`） |
| **被判的那一份参数** | 那份 `call.arguments` 的摘要 |

- **为什么是一把键而不是那条记录的 id**：`admit` 返回的时候那条结论**还没落下**——结论由 runner 在 `admit` 返回之后落日志（先落后算，`data.loop-extension/v1#S-32`），本能力拿不到一个尚不存在的记录 id。
  **`callId` 在一份会话日志里唯一**（`data.content-blocks/v1#S-14`），本件对同一个 `callId` 至多一条最终结论，这把键在那份日志里只指得到一条。
  账本写的是「记录的 id」，本契约按键指认，**含义相同、时点可兑现**（已报主线）。
- **凭据自己不授予任何东西**：拿着它只能去核对（[S-25](#s-25-verifytoken)）；**那条结论没落进日志之前，它核对不过**。这使「每件的结论必留」在执行一侧有了对应物——**不落结论就执行不了**。
- **确定**：同一个 `callId`、同一份参数，`admit` 铸出同一个凭据。
- **交换表示按 [`data.identity-values/v1#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示)**：非空字符串，首尾不是空白码点，逐码点相等；**消费者不得解析它**，不得从里面读出 `callId` 或摘要去自己比。
- **不绑会话、不绑租户**：它在哪份日志里有效，由核对时带进来的会话决定（[S-25](#s-25-verifytoken)）；拿到别的会话去核对，只会在那份日志里找不到那条结论。

**参数相等**（摘要与核对都按这一条；**本契约推导**——`data.content-blocks/v1#S-12` 只定 `arguments` 是解析一次得到的 JSON 值）：
两份 `arguments` 相等，当且仅当它们是**同一个 JSON 值**——对象按成员名集合与各成员值相等（与成员次序无关），数组按长度与逐项相等（有序），
字符串逐码点相等，数按数值相等，`true`／`false`／`null` 各自只等于自己。
**摘要必须满足**：相等的两份得出相同的摘要；不相等的两份得出不同的摘要（在实用意义上，碰撞即缺陷）。摘要怎样算归实现；跨进程时的一致性见 [S-33](#s-33-装配给的保证-vs-协议须给的保证)。

---

## 三、贯穿全部操作的规矩

### S-17 缺席时的默认答案

**一律拒绝或明确失败，不放行、不空集、不回退、不填初值。**

| 情形 | 结果 |
|---|---|
| 必有成员缺席、多了成员、类型不对、`call` 不是完整的工具调用块、`definition.name ≠ call.tool` | `invalidInput` |
| `effectivePermission.value` 不在三档里、`from` 不在四格里、`from = workspace` 而 `value ≠ ask`、拿到一个集合而不是一个档位 | `invalidInput`——**不得**补成任何一档：补成 `auto` 是放行，补成 `ask` 或 `forbid` 是替上游做了一次它没做的判断（与 `data.tool-definition/v1#S-15` 同一口径） |
| `runMode` 缺席 | `invalidInput`——**不得**当作 `auto_permission`，更不得当作 `bypass-permissions` |
| `runMode` 给了而不是三个 token 之一 | `modeUnknown`（[S-24](#s-24-失败值与它们的次序)） |
| 是子会话而 `parent` 没带 | **本能力判不出这一条**（它不知道会话关系）——那是调用方的义务（[G-12](#十一已知缺口)）；带了就按 [S-11](#s-11-父会话摘要与宽的次序) 判 |
| 求值读不到、日志读不到 | `unavailable`（[S-18](#s-18-判不出来不是拒绝也不是算不出)） |

- **表示层拒绝不是判定**（`data.identity-values/v1#S-33`）：`invalidInput` 与 `modeUnknown` 在进入四步之前给出，**不表示「这个动作被拒」**，也不得被记成一次 `deny`；
  消费者对它们的处置是「这一批没有结论」，见 [S-34](#s-34-本能力缺席报错或判不出来)。
- **身份参数没有默认值**（`data.identity-values/v1#S-17`、`#S-18`）：[S-25](#s-25-verifytoken) 的会话指认缺席即 `invalidInput`，**不得**由「当前会话」「调用栈上的会话」补齐。
  `admit` 不收身份参数——它判的是一个会话此刻的依据，**依据属于哪个会话由调用方交来的那份决定**（[S-33](#s-33-装配给的保证-vs-协议须给的保证) 的「授权上下文属于这个会话」一行）。
- **带默认值的非身份参数：没有。**`parent` 与 `answer` 缺席不是「取默认」，是「不是子会话」「还没有答复」这两个本来就合法的情形。

### S-18 判不出来不是拒绝，也不是算不出

三件事三个值，**任意两件都不得合并**：

| 情形 | 值 | 为什么不能合并 |
|---|---|---|
| **判出来不准** | `deny`（带原因） | 一个成立的结论，重试同一份输入不会变 |
| **授权表达管不到这件事** | `evaluate` 的 `undecidable` → 进第 ④ 步 | 这也是一个判出来的结果，它决定了要看运行模式 |
| **判不出来**：求值读不到或出错、日志读不到 | `unavailable`（整次失败） | 这不是结论，是没有结论。**折成 `deny` 会让 agent 以为规则不准；折成 `undecidable` 在 `bypass-permissions` 下就是放行** |

**这一条是本契约最容易在实现里被一个「读不到就当没有」抹掉的地方**，规范场景 [S-44](#s-44-判不出来不放行) 专门挡它。

### S-19 每道准入现读，结论不存

- **每一次 `admit` 用的四样依据都是那一刻现读的**（`data.identity-values/v1#S-27`）：执行权限、授权上下文、运行模式、父会话摘要。**不得**用上一批的值、不得用会话开始时的快照。
- **本能力不存「已获准清单」**（[S-6](#s-6-放行判断是一个函数无状态无提交)）。「同一件事不必问第二遍」靠的是答复落成授权表达之后第 ③ 步算得出来，不是靠记住上一次的结论。
- **撤销只影响下一道尚未通过的准入**（[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)）：已下的放行结论与它的凭据**不因此后的权限变化作废**（[S-36](#s-36-撤销取消与归档)、[G-10](#十一已知缺口)）。

### S-20 每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | **输入** |
| ② | **前置与授权** |
| ③ | **结构性禁止**（不适用写「无」） |
| ④ | **提交点与原子性** |
| ⑤ | **成功返回** |
| ⑥ | **失败集合**（枚举封闭，**没有「其他」**） |
| ⑦ | **幂等与重复** |
| ⑧ | **缺席时的默认答案**（[S-17](#s-17-缺席时的默认答案)） |
| ⑨ | **事件** |

**本节共 2 个操作**：[S-21 `admit`](#s-21-admit)、[S-25 `verifyToken`](#s-25-verifytoken)。两者都是能力间的内部面，不是终端 API（[S-33](#s-33-装配给的保证-vs-协议须给的保证)）。

---

## 四、操作

### S-21 admit

**`admit(batch: AdmissionInput[]) → AdmissionResult[]`——整批一次。**

| # | 内容 |
|---|---|
| ① | 一批 `AdmissionInput`（[S-7](#s-7-admissioninput)），**至少一项** |
| ② | 表示层合格（[S-17](#s-17-缺席时的默认答案)）；各项 `callId` 两两不同；`runMode` 各项相同；`parent` 都带或都不带、带时 `parent.runMode` 各项相同；子不得宽于父（[S-11](#s-11-父会话摘要与宽的次序)）。**无授权前置**：本面是能力间内部面，调用方是 runner（[S-33](#s-33-装配给的保证-vs-协议须给的保证)） |
| ③ | 无 |
| ④ | **无提交**：纯判定（[S-6](#s-6-放行判断是一个函数无状态无提交)）。**原子的是结论集合**：要么每一项都有结论，要么整次失败，**没有「前两项有结论、第三项没有」**（[S-23](#s-23-一批的含义)） |
| ⑤ | `AdmissionResult[]`，**与输入等长、按位置一一对应**；每一项按 [S-22](#s-22-判定次序) 得出 |
| ⑥ | `invalidInput` · `modeUnknown` · `parentNarrower` · `unavailable`——次序与含义见 [S-24](#s-24-失败值与它们的次序) |
| ⑦ | **幂等**：同一批输入、同一个求值结果，给出同一组结论与同一组凭据；重复调用没有任何效果（它什么也不写） |
| ⑧ | 求值读不到 ⇒ `unavailable`，**不得**当作 `undecidable`，**不得**当作 `deny`；其余缺席见 [S-17](#s-17-缺席时的默认答案) |
| ⑨ | **不发**。结论的留痕是 runner 落的那条 `Conclusion`（`data.loop-extension/v1#S-30`），不是本能力的事件 |

### S-22 判定次序

**每一项独立地按下面的次序判，第一个给出结论的那一步就是它的结论**（[PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)）：

```text
 ① value = forbid ────────────────────────────→ deny{permission_forbidden}   终局；不产卡；答复、授权、运行模式都翻不了
    │否
    ├─ 带 answer：由答复定（S-27）
    │     deny → deny{human_refused}   declined → deny{human_declined}   allow_* → allow
    │
 ② value = auto ─────────────────────────────→ allow        不看授权表达，也不看运行模式
    │否（ask）
 ③ evaluate(call, grants)
    │   失败 ──────────────────────────────→ 整次 unavailable
    │   allow → allow        deny → deny{authorization_denied}
    │   undecidable ↓
 ④ runMode
        never → deny{run_mode_never}   auto_permission → ask{card}   bypass-permissions → allow
```

**三处刻意的次序**，照 PF-007 原文，逐条写成会失败的断言：

- **禁止在最前**：`value = forbid` 时，不论 `grants` 算出什么、`runMode` 是什么、`answer` 是什么，结论都是 `deny{permission_forbidden}`，**且不产生卡片**。
  「这件事禁止，但你可以选允许多久」这种卡片**不存在**（[PF-008 flows §二](../../../../product/PF-008-human-in-the-loop/flows.md#二异常分支)）。
- **`bypass-permissions` 只跳过第 ④ 步**：它拆的是「问」那道闸，不是「禁」那条线；**第 ③ 步算出 `deny` 时它也翻不了**。
- **`auto` 不看授权表达**：一笔撤回管不到一个执行权限为「自动」的工具——想让它每次都问，是把那项执行权限配回「问一下」（[PF-012 §5.8 没有放宽](../../../../product/PF-012-agent-loop-and-run/design.md#没有放宽这一档) 的反面同理）。

**有答复的那一支（本契约推导）**：第 ① 步照判，**过了第 ① 步就由答复定，不再走 ②③④**。理由：

- **禁止照判**，是 [PF-008 acceptance](../../../../product/PF-008-human-in-the-loop/acceptance.md#判断函数)「明确禁止的事，人在卡片上点同意也做不成」的直接落点；而卡片挂着的这段时间里，权限可能被改成禁止——**现读**（[S-19](#s-19-每道准入现读结论不存)）使那一改在这里生效。
- **其余由答复定**：答复是人对**这一次调用**说的最近、最具体的话。执行权限在等待期间被改成「自动」而人答了「不允许」，结论是 `deny{human_refused}`——
  **两个依据方向相反时，取收紧的那一个**（[只保守](../../../../product/PF-007-meta-capabilities/design.md#ask-必须成立的性质)）；答了允许就放行，**不因为运行模式在等待期间变成 `never` 而改判**——问已经问了，人已经答了。
- **有答复时不会再出卡**：同一张卡片答完之后不会再出同一张，这是 [S-42](#s-42-答复收成结论禁止翻案) 的进展保证。

### S-23 一批的含义

- **一批 ＝ 调用方在同一轮里交来的若干项**，通常是这次模型响应里那一批动作中**走到瀑布末端**的那些（被前面的拓展件否决、停住或停在等人的，这一轮不在里面）；**一项也是合法的一批**。
- **各项独立**：一项的结论只取决于它自己的输入与那份共用依据，**与同批其他项的结论无关**；把一批重排，结论按同样的方式重排。
- **一批共用一份依据**：`runMode` 相同、`parent` 都带或都不带且 `parent.runMode` 相同，由本能力核对（`parent.permission` 按工具条目，可以不同）；`grants` 是同一时点读到的同一份由调用方保证（[S-7](#s-7-admissioninput)）。
  **理由**：「这一次」那一档的授权管的是「接下来那批工具调用」（[PF-007 性质五](../../../../product/PF-007-meta-capabilities/design.md#ask-必须成立的性质)），同一批被两份不同时点的依据判，就可能一半在撤回之前、一半在之后。
- **整批一次给出**：结论集合在一次返回里全部给出，**没有「先给前两项」**。它对应 [PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个)「一批动作先全部判完」在本能力这一端的样子；
  「放行的也等全判完才执行」是执行一侧的义务（[S-31](#s-31-一批里还有一条在等谁都不执行)），不是本操作能担保的。

### S-24 失败值与它们的次序

**`admit` 的失败恰四个，闭合。一次失败只给一个值：自上而下，第一个命中的那一行。**

| # | 失败值 | 什么时候 | 类 |
|---|---|---|---|
| 1 | `invalidInput` | [S-17](#s-17-缺席时的默认答案) 表里除 `runMode` 取值之外的一切形状问题；批为空；`callId` 重复；各项 `runMode` 或 `parent.runMode` 不一致，或 `parent` 有的带、有的不带 | 表示层 |
| 2 | `modeUnknown` | 某一项的 `runMode`、或 `parent.runMode`，给了而不是 [S-10](#s-10-会话运行模式) 的三个 token 之一 | 表示层（**单独具名**，见下） |
| 3 | `parentNarrower` | 某一项比父宽（[S-11](#s-11-父会话摘要与宽的次序)） | 判定前置不成立 |
| 4 | `unavailable` | 某一项走到第 ③ 步而求值失败（[S-9](#s-9-授权上下文与求值)） | 判不出来 |

- **失败是整次的**：任何一项命中，整批都没有结论。**不给「其余各项的结论」**——一批的依据出了问题，其余各项的结论同样不可信；
  而消费者对「没有结论」的处置是这一批全拒（[S-34](#s-34-本能力缺席报错或判不出来)），fail-closed 的方向不变。
- **`modeUnknown` 为什么从 `invalidInput` 里单独拿出来**：运行模式是最容易被「就近映射」的一个值——账本早先写的就是 `bypass`，上游产品的另一档叫 `auto`；
  **把一个没见过的模式读成最近的那一档，就是凭空多出一条放行路**。单列一个值，让这种错在日志里一眼可辨。
- **`parentNarrower` 不是表示层**：输入每一项都合形状，是两个合法的值放在一起违反了一条性质。它排在两个表示层值之后。
- **`unavailable` 最后**：只有前三条都过了、真的走到第 ③ 步才可能出现；**不走第 ③ 步的项不会引出它**（执行权限是禁止或自动、或带着答复）。
- **四个都不是 `deny`**，也都不借用 [S-14](#s-14-拒绝原因) 的任何原因。

### S-25 verifyToken

**`verifyToken(token, call, session) → valid | invalid{reason}`**——执行运行时在提交一次已放行调用之前核对。

| # | 内容 |
|---|---|
| ① | `token: AdmissionToken`；`call`：**将被执行的那一次调用**（完整的工具调用块，带着将被执行的那一份参数）；`session`：**这次执行将绑定的那个会话**的指认（表示归会话契约，[G-5](#十一已知缺口)） |
| ② | 无前置；表示层合格。**无授权前置**：能力间内部面，调用方是执行运行时（[S-33](#s-33-装配给的保证-vs-协议须给的保证)） |
| ③ | 无 |
| ④ | **只读**，读 `session` 那份会话日志；无提交 |
| ⑤ | `valid`；或 `invalid{ reason }`，`reason ∈ call_mismatch · not_admitted · arguments_changed · run_ended`（[S-26](#s-26-令牌有效的条件)） |
| ⑥ | `invalidInput`（三件里任一件缺席或不合形状）· `unavailable`（日志读不到） |
| ⑦ | **可重复、不消耗凭据**：核对多少次都不改变任何东西。**同一个凭据的答案会随日志变**，而且只会朝两个方向变：结论落下之前 `not_admitted`、落下之后 `valid`；运行落终态之后恒为 `invalid`（前四条都成立时原因是 `run_ended`）。**「一次调用只执行一次」不靠凭据**，归执行运行时按 `CallId` 兑现 |
| ⑧ | 日志读不到 ⇒ `unavailable`，**不得**给 `valid`，**也不得**给 `invalid`——前者放过一次没核对的执行，后者把一次读不到讲成「没放行」；消费者对 `unavailable` 同样**不执行**（[S-34](#s-34-本能力缺席报错或判不出来)）。`session` 缺席 ⇒ `invalidInput`，不得取「当前会话」（[S-17](#s-17-缺席时的默认答案)） |
| ⑨ | 不发 |

**账本写的是 `verifyToken(token)` 一件输入，本契约扩成三件（推导，已报主线）**：
没有 `call`，「参数变了即作废」无从判——要比的正是「将被执行的那一份」；没有 `session`，`CallId` 只在一份会话日志里唯一（`data.content-blocks/v1#S-14`），核对就不知道去哪份日志找那条结论，**跨会话、跨租户的凭据就有了一条缝**。

### S-26 令牌有效的条件

**`valid` 当且仅当下面五条同时成立；不成立时给第一个不成立的那一条对应的原因：**

| # | 条件 | 不成立时 |
|---|---|---|
| 1 | 凭据指认的调用就是 `call.callId` | `call_mismatch` |
| 2 | `call.arguments` 与凭据所判的那一份参数相等（[S-16](#s-16-admissiontoken-与参数相等)） | `arguments_changed` |
| 3 | `session` 的会话日志里，**本能力这一件在 `before_action` 为这个 `callId` 落下了最终结论，而且它是放行**——在拓展点协议里就是 `output` 为 `observed`、没有 `skipped` 的那一条（[S-29](#s-29-位置干预力与结论投影)）；只有 `ask` 结论、只有否决、被视作卸载或报错的，都不算 | `not_admitted` |
| 4 | 那条结论所判的参数——**日志里这次调用在那条结论之前的生效参数**（有 `before_action` 上的改写就取最后一次改写之后的，没有就是模型回复里的原参数；`data.loop-extension/v1#S-23`）——与 `call.arguments` 相等；**并且那条结论之后，日志里没有这次调用的任何参数改写** | `arguments_changed` |
| 5 | 那条结论所在的[运行](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run--运行--run)**还没有落终态** | `run_ended` |

- **第 3、4 条让凭据成为「日志引用」**：它的有效性由日志决定，不由凭据里写了什么决定。凭据与日志说法不一时，**以日志为准**。
- **第 4 条的后半是「放行之后参数不许再变」在执行一侧的兑现**（[S-30](#s-30-放行之后参数不再变)）：一件排错了位置、在本件之后改参数的拓展件，会让这一条不成立——**执行不了，而且看得见为什么**。
- **第 5 条（本契约推导）**：运行落终态之后不再发起新的动作（[PF-012 §6.17](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)）；
  运行被取消时悬着的卡片作废、那一批不再判——同一批里已经放行的几条，凭据随之作废，**不会在运行结束之后被补执行**。
- **哪一件是「本能力这一件」**：结论记录里的 `extension` 等于本能力在装配里登记的那一件的 name。**这一条只在「别人拿不到这个名字」时才可靠**，见 [S-32](#s-32-这一件不得被替换禁用或收窄)。
- **生效参数在日志里的记录形状**未定（[G-8](#十一已知缺口)）；本条只要求那份记录存在且可读。

---

## 五、答复之后

### S-27 四档答复各落在哪

**「这一次调用怎么办」由本能力定；「另外落下什么」不由本能力写**（[S-6](#s-6-放行判断是一个函数无状态无提交)），写入方见 [G-2](#十一已知缺口)：

| 答复 | 这一次调用（第 ① 步过了之后） | 另外落下什么 | 依据 |
|---|---|---|---|
| `deny`（不允许） | `deny{human_refused}` | **什么也不落** | [PF-008 §5.2](../../../../product/PF-008-human-in-the-loop/design.md#它吐出来的卡片选项是固定的) 表第一行；[flows §1.3](../../../../product/PF-008-human-in-the-loop/flows.md#13-系统拦下一个动作) 第 8 步 |
| `allow_once`（这次允许） | `allow` | **什么也不落**——「不留下任何授权」 | [flows §1.3](../../../../product/PF-008-human-in-the-loop/flows.md#13-系统拦下一个动作) 第 9 步 |
| `allow_session`（本会话内，这类情况都允许） | `allow` | **一笔授权表达**：来源结构化、方向给出、作用域本会话，追加进本会话的授权上下文；**本会话里同类不再问** | 第 10 步；[PF-007 §4](../../../../product/PF-007-meta-capabilities/design.md#一笔授权表达有三个维度) |
| `allow_tenant`（将来本租户所有会话，这类情况全允许） | `allow` | **一笔作用域为全局的授权表达，落成租户层这个工具条目的执行权限配值「自动」**；**写不写得进受写入者资格约束** | 第 11 步；[PF-008 §5.2 第四档](../../../../product/PF-008-human-in-the-loop/design.md#第三档和第四档各有约束) |
| `declined`（不回答） | `deny{human_declined}` | **什么也不落** | [flows §1.8](../../../../product/PF-008-human-in-the-loop/flows.md#18-人明确表示不答)；[PF-014 §5.4.2](../../../../product/PF-014-inbound-intake-and-queueing/design.md#542-两种等人答机制各归各产品语义是同一条) |

- **三个「允许」对这一次调用的含义相同，都是放行**：它们的差别只在**以后**。所以另外那笔写不进去（没有资格、写面不可用），**这一次的结论不变**——
  任何有权答这张卡片的人都有权答「这次允许」，而那正是另两档对这一次的全部含义。
- **但「写不进去」不得静默**：人明确点了第四档而系统只当作这一次，是[把他明确要的东西打了折](../../../../product/PF-008-human-in-the-loop/acceptance.md#二绝不能发生的事)。写失败怎样告知人，归 [G-2](#十一已知缺口) 的 owner。
- **「这类情况」怎样圈定**（本会话那一笔管到哪些调用）归授权表达的求值（[G-1](#十一已知缺口)）；租户那一档落在**这个工具条目的执行权限**上，那一项是按工具配的（[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)）。

### S-28 四档选项只在本能力出的卡上带授权含义

**[S-15](#s-15-定死的四档选项与卡片草稿) 的四个选项、[S-27](#s-27-四档答复各落在哪) 的含义，只对本能力出的卡片成立。**
别的拓展件（包括兼容层替宿主 hook 写的卡）用了同一组 `id` 与 `label`，**那些答复不产生任何授权**：

- 不落成授权表达、不写租户层权限值；
- 它们的「允许」只意味着**那一件不再拦**，本能力这一关照样要过（[PF-008 §6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同)、`data.loop-extension/v1#S-29`）；
- 它们**不能作为 `answer` 交给本能力**——`answer` 只来自本能力为那个 `callId` 出的卡（[S-12](#s-12-答复)）。

**否则一件拓展件就能借「本租户全允许」这四个字写出一条租户层权限值**，那正是[没有「放宽」这一档](../../../../product/PF-012-agent-loop-and-run/design.md#没有放宽这一档)要堵的第二条授权通道。
区分「是不是本能力出的卡」靠卡片记录里的来源与出卡那一件的 name（`data.loop-extension/v1#S-28`），由 runner 与卡片契约兑现。

---

## 六、在拓展点协议里

### S-29 位置、干预力与结论投影

**本能力在拓展点协议里是一件[拓展件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)**（[PF-012 §5.8 系统自带的几件](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪)）：

| 项 | 取值 | 依据 |
|---|---|---|
| 位置 | `before_action` | PF-012 §5.8 |
| 在瀑布里的次序 | **最后一件**：同一位置上的其他件（租户自定义的改写、否决、出卡）都排在它之前 | 主线裁定，待确认（[S-30](#s-30-放行之后参数不再变)） |
| 干预力 | `veto`（`data.loop-extension/v1#S-4`） | PF-012 §5.8 |
| 报错处置策略 | `treat_as_veto`（`data.loop-extension/v1#S-5`） | 可否决一档的默认；PF-008 flows §二「失败必须是停下来」 |

**三种结论投影成 `data.loop-extension` 的结论**（`#S-19`、`#S-21`：这三种在 `before_action` 都合法），由 runner 落日志：

| 本能力 | 拓展点协议里 | runner 另外要做的 |
|---|---|---|
| `allow{token}` | `observed` | 把凭据交给执行运行时（与 `call` 一起） |
| `deny{reason}` | `veto{ reason }`——**`reason` 必须原样带着 [S-14](#s-14-拒绝原因) 的那个 token**，形式归 runner | agent 拿到的是「不许做」及其来由，**不是执行失败**（`data.loop-extension/v1#S-25`） |
| `ask{card}` | `ask{ card }` | 落卡片、让运行停下来等人；这一批全部答完之后带着 `answer` 回来再调一次 `admit`（[S-35](#s-35-重启回放与在途)） |
| **`admit` 失败**（四个失败值任一） | **报错**：`skipped: errored` ＋ `error`，按 `treat_as_veto` 落 `veto`——**这一批每一项都落**；`reason` 写明「放行判断没有给出结论」及失败值，**不借用 S-14 的任何原因** | 见 [S-34](#s-34-本能力缺席报错或判不出来) |
| **本能力不可用** | **不按「视作卸载」处理**：这一批每一项都落 `veto`（主线裁定：放行判断不可用 ＝ 全拒，待确认） | 同上 |

**最后两行是本能力与其他拓展件唯一不同的地方**：别的件不可用时「这一次这个位置没有它」（`data.loop-extension/v1#S-33`）；
放行判断不在，**这一关就没了**，而[任何层的明确禁止任何模式都翻不了案](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)——
**所以它不在，就一个都不放**。PF-012 §5.8「可插拔的服务」一段的产品正文跟进归 PF-012 owner。

### S-30 放行之后参数不再变

**放行判断判的、人在卡片上点头的、实际执行的，必须是同一份参数**（[PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数)）。本契约给它两道：

1. **排法**：本能力是 `before_action` 瀑布的最后一件（[S-29](#s-29-位置干预力与结论投影)），它读到的 `call` 已经是其他件改写之后的最终那一份；它之后没有件能改参数。**这一道由装配兑现**，owner 是 runner（`data.loop-extension/v1` 的 G-13 由此得到一个答案）。
2. **凭据**：凭据绑定被判的那一份参数，核对时比「将被执行的那一份」与日志里那条结论之后有没有改写（[S-26](#s-26-令牌有效的条件) 第 2、4 条）。**排法错了，这一道仍然挡得住，而且看得见**。

**卡片上写的是将被执行的那一份参数**（[S-15](#s-15-定死的四档选项与卡片草稿)），所以人签的与执行的是同一份——前提是上面两道都在。

### S-31 一批里还有一条在等，谁都不执行

**一批动作里，只要还有一项停在等人（本能力的 `ask`，或排在本能力之前的某一件出了卡），其余已经放行的项一个也不执行**，直到这一批每一项都有了最终结论（[PF-012 一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个)、[PF-008 §5.3](../../../../product/PF-008-human-in-the-loop/design.md#53-一批卡片与答完是什么意思)）。

- **这一条的 owner 是 runner 与执行运行时**：本能力交回 `allow{token}` 的时候，同批的 `ask` 与它一起交回，**本能力不扣住凭据**——扣住凭据会让本能力知道「这一批」之外的东西（前面各件的卡片）。
- **本契约把它写在这里，是因为它挡的是「放行」被提前兑现**：一批里有的先做了、有的还在等人，agent 下一步看到的是一个做了一半的现场。
- **凭据不因等待而过期**（[S-19](#s-19-每道准入现读结论不存)）；等待期间权限被改成禁止，已放行的那一项照当时的结论执行——**这是按产品正文写的，但它是否就是产品要的，报给了主线**（[G-10](#十一已知缺口)）。

### S-32 这一件不得被替换、禁用或收窄

**本契约的安全性质以下面三条为前提**（`有前提地能`：前提由谁兑现写在右列；**本能力自己兑现不了它们**）：

| 前提 | 做不到会怎样 | 由谁兑现 |
|---|---|---|
| **没有任何一层能替换这一件**（同一个能力标识换成另一份实现） | 一件永远交回 `observed` 的替身就是一条绕开全部权限的路；而且它的结论与本能力的**同名**，[S-26](#s-26-令牌有效的条件) 第 3 条会把它的放行认成真的 | [G-7](#十一已知缺口)：资产替换规则（PF-002 §5.5）、PF-012「自带的不享受特权」对这一件怎么读，待主线与产品裁 |
| **没有任何一层能禁用这一件，或把它的干预力收窄到可否决以下** | 禁用 ＝ 不在；收窄到只观察 ＝ 它的否决与问人都不生效，全部落成 `observed` | 同上；本能力「不在即全拒」（[S-29](#s-29-位置干预力与结论投影)）只挡住了「不在」，**挡不住「在但被收窄」** |
| **它的名字只属于它**（别的件不得以同一个 name 落结论） | 同第一行 | 装配登记；名字空间归 `data.messages` G-10 与拓展件资产的 owner |

---

## 七、性质与前提

性质的来源一律引 PF 小节；**编号只在本表内作行标，不是可外部引用的条款号**。

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **每一项恰一个结论，或整批一个失败**；结论与输入按位置一一对应 | [S-21](#s-21-admit) ④⑤ | — | [PF-012 一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个) |
| **结论只取决于本项输入与共用依据**：同输入同结论、重排同重排 | [S-6](#s-6-放行判断是一个函数无状态无提交)、[S-23](#s-23-一批的含义) | 求值确定（[S-9](#s-9-授权上下文与求值)） | [PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)「每次现算」 |
| **结论集合封闭**：三种结论、五个拒绝原因、四个失败值、四个无效原因，没有「其他」 | [S-13](#s-13-admissionresult)、[S-14](#s-14-拒绝原因)、[S-24](#s-24-失败值与它们的次序)、[S-26](#s-26-令牌有效的条件) | — | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) |
| **本能力不持有状态、不写任何东西** | [S-6](#s-6-放行判断是一个函数无状态无提交) | — | [PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)「系统里不存一份已获准清单」 |

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **一个执行权限为禁止的调用被放行，或为它出了卡** | [S-22](#s-22-判定次序) 第 ① 步在最前、答复之前 | 上游把空集收成 `forbid`（[S-8](#s-8-有效执行权限)） | [PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)、[PF-008 flows §二](../../../../product/PF-008-human-in-the-loop/flows.md#二异常分支) |
| **「问一下」没经人点头、没有授权表达、不在 `bypass-permissions` 下，却被放行** | [S-22](#s-22-判定次序)：`ask` 档只有三条路到 `allow`（第 ③ 步算得出准、第 ④ 步 `bypass-permissions`、答复为允许） | 本能力在瀑布末位且不可替换、不可收窄（[S-32](#s-32-这一件不得被替换禁用或收窄)） | [PF-012 没有放宽](../../../../product/PF-012-agent-loop-and-run/design.md#没有放宽这一档) |
| **判不出来被当成算不出或当成拒绝** | [S-9](#s-9-授权上下文与求值)、[S-18](#s-18-判不出来不是拒绝也不是算不出)、[S-24](#s-24-失败值与它们的次序) | 求值实现把读失败报成失败 | [`data.identity-values/v1#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败) |
| **放行判断不在、报错或没给出结论时，有调用被执行** | [S-29](#s-29-位置干预力与结论投影) 末两行；[S-26](#s-26-令牌有效的条件) 第 3 条（没有放行结论就核对不过） | runner 照主线裁定全拒；执行运行时提交前必核对 | 主线裁定；[PF-008 flows §二](../../../../product/PF-008-human-in-the-loop/flows.md#二异常分支)「这一关的失败必须是停下来」 |
| **执行的参数不是被判的那一份** | [S-30](#s-30-放行之后参数不再变) 两道 | 执行运行时提交前必核对；生效参数可读（[G-8](#十一已知缺口)） | [PF-012 §5.8 改参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数) |
| **子会话做成了父会话此刻做不成的事，或子会话问了人而父是 `never`** | [S-11](#s-11-父会话摘要与宽的次序)、[S-24](#s-24-失败值与它们的次序) 的 `parentNarrower` | 调用方为子会话带上现读的父摘要（[G-12](#十一已知缺口)） | [PF-007 §5.8](../../../../product/PF-007-meta-capabilities/design.md#58-子不得宽于父) |
| **工作区自己提供的工具不经人点头就被执行** | [S-8](#s-8-有效执行权限) 的 `from = workspace ⇒ ask` | — | [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) |
| **「人不同意」「没有答案」被记成执行失败，或两者混成一个值** | [S-14](#s-14-拒绝原因)、[S-29](#s-29-位置干预力与结论投影) 的投影 | runner 在 `veto.reason` 里原样带 token | [PF-008 §6.5](../../../../product/PF-008-human-in-the-loop/design.md#65-不回答是合法答复)、[§6.9](../../../../product/PF-008-human-in-the-loop/design.md#69-人拒绝之后agent-分得出那是拒绝) |
| **一件别的拓展件借四档选项写出授权** | [S-28](#s-28-四档选项只在本能力出的卡上带授权含义) | 卡片记录分得出来源与出卡那一件 | [PF-008 §6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同) |
| **运行落终态之后，同批已放行的调用被补执行** | [S-26](#s-26-令牌有效的条件) 第 5 条 | 执行运行时提交前必核对 | [PF-012 §6.17](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) |
| **一张会话的凭据在另一个会话里核对通过** | [S-25](#s-25-verifytoken) 带 `session`；[S-26](#s-26-令牌有效的条件) 只在那份日志里找 | 执行运行时带的是它将绑定的会话 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| `admit` 返回：每一项一个结论，或整批一个失败 | **该次调用**；本能力内部没有任何等待 | 求值返回（求值的时限归实现） | [PF-008 §5.2](../../../../product/PF-008-human-in-the-loop/design.md#52-那个判断函数) |
| **一张本能力的卡片答完之后，那一项的下一次 `admit` 给出 `allow` 或 `deny`，不再是 `ask`** | 带着 `answer` 的**下一次**调用 | 调用方把答复作为 `answer` 交回（[S-12](#s-12-答复)） | [PF-008 §6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)（答完即解除）；[S-42](#s-42-答复收成结论禁止翻案) |
| 放行结论落进日志之后，**下一次**核对那张凭据得 `valid`（其余四条成立时） | 下一次核对 | 日志读得到 | [S-26](#s-26-令牌有效的条件) |
| `allow_session` 那一笔落进授权上下文之后，本会话里**下一次**同类调用在第 ③ 步算得出 | 下一次 `admit` | [G-2](#十一已知缺口) 的写入发生；求值认得那一笔（[G-1](#十一已知缺口)） | [PF-007 §5.6](../../../../product/PF-007-meta-capabilities/design.md#56-一次放行判断走四步)「闭环」 |

**「下一次」这类措辞是有意的**：它们写得出会失败的断言。

---

## 八、装配给的保证 vs 协议须给的保证

### S-33 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展。**右列是本契约已经记下的待兑现项；这张表是契约的一部分。**

| 保证 | 本版（单机）由谁给 | 跨进程之后谁重新兑现 | 做不到会怎样 |
|---|---|---|---|
| **放行判断在瀑布末位**（[S-30](#s-30-放行之后参数不再变)） | **装配给**：runner 按装配清单顺序逐件求值，本件排在最后 | **协议给**：次序随装配清单一起传；本件开始之前，前面各件的结论与改写必须对它可见 | 本件判的是改写之前的参数，人签的与执行的不是同一份 |
| **凭据可核对**（[S-26](#s-26-令牌有效的条件)） | **装配给**：核对与落结论读写同一份会话日志 | **协议给**：任何节点读日志即可核对——**这正是把凭据做成日志引用的理由**；但读必须**至少读到提交这一刻为止**的全部条目（那条结论、它之后的改写、终态） | 读到一份陈旧的日志：结论之后的改写或已落的终态看不见，一次不该执行的调用被执行 |
| **参数摘要一致**（[S-16](#s-16-admissiontoken-与参数相等)） | **装配给**：铸凭据与核对在同一实现里算摘要 | **协议给**：摘要的算法与 JSON 值的规范形式须成为协议，或核对只由本能力的提供者做（[G-9](#十一已知缺口)） | 两边算出不同摘要：相同的参数被判「变了」（安全但执行不了）；更糟的是不同参数撞成相同（放过改写） |
| **一批共用一份依据**（[S-23](#s-23-一批的含义)） | **装配给**：runner 在一处读一次授权上下文与运行模式 | **协议给**：一批的依据须在一个时点读出并随批传递；**不得**逐项各读各的 | 同一批一半在撤回之前、一半在之后被判 |
| **授权上下文属于这个会话** | **装配给**：runner 交来的是它所在会话自己的那一份 | **协议给**：`grants` 须携带它所属的会话身份，求值在接收边界核对（`data.identity-values/v1#S-30`） | 用另一个会话（乃至另一个租户）的授权放行了这一次调用 |
| **放行判断不在即全拒**（[S-29](#s-29-位置干预力与结论投影)） | **装配给**：同进程里「不可用」就是依赖解析失败 | **协议给**：远端的本能力连不上、超时、回执丢失，一律映射为「没有结论」并按全拒处置；**不得**折成 `observed` | 传输故障被读成无意见：这一关静默没了 |
| **结论先落，凭据才生效**（[S-16](#s-16-admissiontoken-与参数相等)） | **装配给**：runner 落完结论再把凭据交给执行运行时，同一存储 | **协议给**：结论的提交须先于凭据被交出去对外可见；执行运行时核对到 `not_admitted` 时不执行，并把它当作一处缺陷可见地报出——**不得轮询到它变成 `valid` 为止** | 结论没落就执行了——日志里没有「为什么放行」，回放得到另一个下一步 |
| **调用方身份已经核实过**（两个操作） | **装配给**：两个面都是能力间内部面，调用方是 runner 与执行运行时 | **协议给**：跨进程调用须携带授权依据并在接收边界重新验证（`data.identity-values/v1#S-30`） | 谁拿到这两个面就能铸凭据、查凭据 |

---

## 九、交接、缺席与恢复

### S-34 本能力缺席、报错或判不出来

| 情形 | 本能力这一侧 | 消费者这一侧 |
|---|---|---|
| **本能力不可用**（依赖用不了、没装） | — | runner：这一批**每一项落 `veto`**，不按「视作卸载」跳过（主线裁定，待确认）；执行运行时：没有凭据，不执行 |
| **`admit` 失败**（`invalidInput`、`modeUnknown`、`parentNarrower`、`unavailable`） | 整次失败，给出那一个失败值 | runner：按 `treat_as_veto`，这一批**每一项落 `veto`**，`reason` 写明「放行判断没有给出结论」与失败值 |
| **`verifyToken` 失败**（`invalidInput`、`unavailable`） | 给出那一个失败值 | 执行运行时：**不执行**；它自己的收场（例如 `notAdmitted`）怎样区分「核对说无效」与「核对没做成」，归它 |
| **`verifyToken` 给 `invalid`** | 给出那个原因 | 执行运行时：不执行，原因可见 |

- **PF-008 flows §二说卡片生成失败时「仍然停住，并明确告知人这里出了问题」**。本能力的卡片是纯计算、没有单独的「生成失败」；
  本能力整次失败时，主线裁定的收场是全拒（这一批不执行，run 继续，agent 看得到否决与来由）——**「停住」读成「不放过」，「告知人」读成「否决与来由可见」**。这一读法报给了主线（[G-13](#十一已知缺口)）。
- **本能力自己被替换或重启时**：它不持有任何状态、没有在途的多步事务（[S-6](#s-6-放行判断是一个函数无状态无提交)），**没有东西需要交接**；已铸的凭据的有效性只由日志决定，不随本能力的实例生灭。
  **这是一条可被推翻的承诺**：任何让本能力持有状态（缓存、已获准清单）的修改都会使它失效，那时必须回到本节重写交接责任。

### S-35 重启、回放与在途

- **`ask` 之后的等待不在本能力里**：卡片与答复都在日志里（[等人是 loop 的原语](../../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语)）。新的一次尝试读到「这一批答完了」，runner 回到本件：**带着 `answer` 再调一次 `admit`**，拿到最终结论、不再出卡——这就是本能力这一件的[回放](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-replay--回放--replay)。
- **回放不要求本能力记得上一次**：第一次与回放之间，本能力没有任何需要跨过等待带过去的东西（`data.loop-extension/v1` 的作者须知对它空真）。
  **第 ① 步在回放里是现读**（[S-22](#s-22-判定次序)）：等待期间被禁止的，这里拒绝。
- **已有最终结论的项不重判**（`data.loop-extension/v1#S-32`）：新的一次尝试里，已放行的那几项读日志里的结论，凭据照旧可核对。

### S-36 撤销、取消与归档

- **权限被收窄、授权被撤回**：只影响**下一次** `admit`（[S-19](#s-19-每道准入现读结论不存)）；已下的结论与凭据不回头作废（[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)）。本能力**不发出任何停止信号**。
- **运行被取消**：悬着的卡片作废，那一批不再判；同批已放行的凭据核对得 `run_ended`（[S-26](#s-26-令牌有效的条件) 第 5 条）。
- **会话被归档**：同上，卡片一并清掉（[PF-008 §6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)）；已落成授权表达的那几笔**不因归档消失**（[PF-015 §6.7](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#67-归档不动授权)）——它们不在本能力里。
- **单次授权的清空**（运行明确结束时清掉作用域为「单次执行」的那些，[PF-015 §6.10](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#610-单次授权在一次运行结束时清空)）发生在授权上下文里，本能力只是下一次读到清空之后的那一份。

---

## 十、规范表达与验证义务

### S-37 本版不建形式工件

**不建 `formal/`，不附 Schema。**

- **判定是一个纯函数**，次序由 [S-22](#s-22-判定次序) 穷举、失败次序由 [S-24](#s-24-失败值与它们的次序) 穷举：输入空间是有限的几个枚举乘一个三值的求值结果，**没有交错、没有状态**，行为模型没有可反驳的空间；
  把同一张判定表再写一份 Alloy 只是重述，不产生新证据。**逐格的正反实例在 [`examples.md`](examples.md)**，它是本版的规范工件。
- **有交错的那几件不在本能力里**：「一批里还有一条在等谁都不执行」「结论先落后算」「回放一致」「放行之后参数不再变」的排法——**它们的行为模型归 `capability.loop-extension-runner` 与 `capability.tool-execution-runtime`**，本包不建平行模型。
- **数据形状全部归 data 契约**（[S-4](#s-4-依赖方向与被消费的面)）；线上形状归将来的 composition（[S-3](#s-3-本契约明确不承诺什么)）。在这里再建一份 Schema 就是第二份权威。

**这不是把义务省掉**：已触发的证据义务在[验证入口](../verification.md)逐条登记，状态「未开始」。

### 规范场景

每条场景的正反实例在 [`examples.md`](examples.md) 对应一节。**「必须观察到」是契约要求的可观察结果，不是某次执行的记录。**

#### S-38 三档各一

对同一个 `call`、同一份 `grants`，分别让 `value` 为 `forbid`、`auto`、`ask`，三种运行模式各跑一遍。
**必须观察到**：`forbid` 在三种模式下都是 `deny{permission_forbidden}`，**没有卡片**；`auto` 在三种模式下都是 `allow`，**求值没有被调用**；`ask` 进第 ③ 步。
（[examples §1](examples.md#1-三档各一)）

#### S-39 算不出 × 三种运行模式

`value = ask`、`evaluate` 返回 `undecidable`，三种运行模式各跑一遍；再让 `evaluate` 返回 `allow`、`deny` 各跑一遍。
**必须观察到**：`never` → `deny{run_mode_never}`；`auto_permission` → `ask`，卡片四档逐字是 [S-15](#s-15-定死的四档选项与卡片草稿) 那四个；`bypass-permissions` → `allow`；
`evaluate` 为 `deny` 时**三种模式都是** `deny{authorization_denied}`。
（[examples §2](examples.md#2-算不出--三种运行模式)）

#### S-40 子宽于父整批失败

子会话的一批两项：一项 `value = auto` 而父 `permission = ask`；另起一批让 `runMode = auto_permission` 而父 `runMode = never`。
**必须观察到**：两批都以 `parentNarrower` 整次失败，**任何一项都没有结论**；runner 这一侧每一项落 `veto`，`reason` 带 `parentNarrower`。
（[examples §3](examples.md#3-子宽于父被拒)）

#### S-41 一批里一条 ask，整批不执行

一批三项：自动的读、要问人且算不出的写、要问人而授权算得出准的改。
**必须观察到**：结论为 `allow`、`ask`、`allow`，一次返回；runner 进等人；**执行运行时在那张卡片答完之前没有收到任何一次提交**；答复回来后再判那一项，三项按调用块顺序执行。
（[examples §4](examples.md#4-一批里一条-ask整批停)）

#### S-42 答复收成结论，禁止翻案

对一张本能力的卡片分别答五种；另让卡片挂着期间把执行权限改成禁止、改成自动各一次。
**必须观察到**：五种答复按 [S-27](#s-27-四档答复各落在哪) 的表收成结论，**都不再是 `ask`**；改成禁止之后答「这次允许」得 `deny{permission_forbidden}`；改成自动之后答「不允许」得 `deny{human_refused}`。
（[examples §5](examples.md#5-答复收成结论)）

#### S-43 放行之后参数变了，令牌作废

放行一次调用之后：① 拿改过参数的 `call` 去核对；② 在本件的结论之后往日志里落一次这次调用的参数改写，再拿原参数核对；③ 结论落下之前核对；④ 运行被取消之后核对。
**必须观察到**：①② `arguments_changed`，③ `not_admitted`、落下之后同一张凭据 `valid`，④ `run_ended`；**四种情形执行运行时都不执行**。
（[examples §6](examples.md#6-令牌核对)）

#### S-44 判不出来不放行

让求值读不到（故障注入），`runMode = bypass-permissions`，`value = ask`；再让日志读不到时核对一张有效凭据。
**必须观察到**：`admit` 整次 `unavailable`，**不是 `allow`，也不是 `deny`**；runner 这一侧整批落 `veto`；核对得 `unavailable`，执行运行时不执行。
**这条最容易被「读不到就当算不出」抹掉，必须真跑。**
（[examples §7](examples.md#7-失败值的反例)）

#### S-45 工作区来的工具不提权

`from = workspace` 分别配 `value = auto`、`ask`。
**必须观察到**：`auto` 那一次整次 `invalidInput`；`ask` 那一次照常进第 ③ 步。
（[examples §7](examples.md#7-失败值的反例)）

---

## 十一、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **授权表达怎样求值**（[S-9](#s-9-授权上下文与求值)）：函数体；「同一件事」的粒度（参数变到什么程度算另一件事）；「这一次」那一档怎样对到一批调用；自由作答怎样理解；`allow_session` 那一笔管到哪些「这类情况」 | PF-007 owner（产品面）；实现 | 产品正文写明「同一件事」的判据；实现给出求值并满足 S-9 的三条约束。**本契约的四步不因此改变** |
| G-2 | **答复落成授权由谁写**（[S-27](#s-27-四档答复各落在哪)）：`allow_session` 追加进会话授权上下文、`allow_tenant` 写租户层执行权限配值、自由作答落成语义化的授权表达——写入者是谁、与卡片答复是否同一次提交、写失败怎样告知人 | 会话授权上下文的 owner（PF-007 / PF-015）、`capability.asset-governance` 的写面、PF-008 卡片契约 | 有契约拥有这三次写入并写明失败收场。**在此之前，三个「允许」对这一次调用的结论照样成立** |
| G-3 | **第四档的资格**（[S-15](#s-15-定死的四档选项与卡片草稿)）：按看卡片的人隐藏第四档、答复面拒收无资格者的 `allow_tenant`。另有一个产品问题：**组织层把这项执行权限收窄到不含「自动」或锁死时，租户层写「自动」无效，甚至求交成空集**——第四档那时该不该出现、写了会怎样 | PF-008 卡片契约；产品面问 PF-008 / PF-002 owner | 卡片契约写明资格判定与收场；产品正文写明组织收窄时第四档的样子 |
| G-4 | **卡片答复的记录形状**：`data.messages` 的 `CardAnswer` 只是占位；「不回答」与自由作答怎样表示（与 `data.messages` 的 G-5 同一件） | PF-008 卡片契约 | 卡片契约定下形状，runner 据它把答复收成 `answer` |
| G-5 | **三个值的家**：会话运行模式的 token（[S-10](#s-10-会话运行模式)）、会话的指认（[S-25](#s-25-verifytoken)）归会话契约；有效执行权限由允许集合收成一个档位的规则（多元素、`default` 不在交集里）归 `capability.asset-evaluation`（[S-8](#s-8-有效执行权限)） | PF-015 的会话契约（未建立）；`capability.asset-evaluation`（并行起草） | 两份契约定下后，本契约改为引用它们，**token 不变** |
| G-6 | **`Skills().exec_script` 的执行权取哪一份**：它是一次工具执行，但执行权随技能走（PF-007 §6.2）；别的资产类别的权限项进不进四步，PF-002 §4 各类的表未写 | PF-002 / PF-007 owner | 产品正文写明；进四步的，由上游交来它的 `effectivePermission` |
| G-7 | **这一件能不能被替换、禁用或收窄**（[S-32](#s-32-这一件不得被替换禁用或收窄)）：PF-012「自带的不享受特权」与资产替换规则放在这一件上，会开出一条绕开全部权限的路 | 主线 → PF-012 / PF-002 owner | 产品正文或决定写明这一件的地位（不是资产、或不可替换不可禁用不可收窄）；名字空间归 `data.messages` G-10 的 owner |
| G-8 | **生效参数在日志里的记录形状与读面**（[S-26](#s-26-令牌有效的条件) 第 4 条要读它）：`data.loop-extension` 的 `rewrite` 结论承载了改写后的参数，另一条「生效参数」记录是否存在、长什么样未定；`LogHandle` 读面归 runner（`data.loop-extension` G-3） | `capability.loop-extension-runner` | runner 契约写明生效参数的记录与读面 |
| G-9 | **跨进程**：参数摘要的规范算法、会话日志读一致性、`grants` 携带会话身份（[S-33](#s-33-装配给的保证-vs-协议须给的保证) 右列） | 架构设计（本版单机不阻断） | 分布式演化启动时给出协议，**作为本契约的新版本发布** |
| G-10 | **放行与执行之间的窗口**（[S-31](#s-31-一批里还有一条在等谁都不执行)）：一批里别的动作等人期间（可能数天），已放行的那一项照当时的结论执行，期间权限被改成禁止也不重判——按 PF-001 §6.6 与 PF-012「有结论的不重跑」是这样，**但产品是否就要这个结果未经确认** | 产品负责人（PF-012 / PF-001 owner） | 产品确认维持，或改为「解除等待时对已放行项重判」（那会改 runner 的回放规则与本契约 S-19） |
| G-12 | **父会话摘要从哪来**（[S-11](#s-11-父会话摘要与宽的次序)）：谁现读父会话此刻的执行权限与运行模式；父没装这个工具时摘要里是什么；`handoff` 派出去的会话带不带摘要（它不是子会话，但 PF-007 §5.8 说的是「派出去的 agent」） | PF-007 / PF-015 的派发与会话契约 | 那份契约写明摘要的来源与缺席收场 |
| G-13 | **卡片生成失败「仍然停住并告知人」与「全拒」的读法**（[S-34](#s-34-本能力缺席报错或判不出来)） | 主线 → PF-008 owner | 产品确认「不放过 ＋ 否决与来由可见」即满足那一行，或要求运行停下等人 |

**`G-11` 不使用**：账本里 `ExecutionPermission` 与 `data.tool-definition` 的 `ExecutePermission` 撞名是命名对齐的事，不是本契约的缺口，已报主线（[S-8](#s-8-有效执行权限) 末段）。

---

## 十二、消费者核对

本节不新增承诺，只走一遍具名消费者的路径，核对本契约给的面够不够用。**发现不够用时回到本契约补条款，不在消费者那边自己算一份。**

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **runner：一批动作走到末端** | 一次调用拿到每一项的结论，失败时知道是哪一类 | [S-21](#s-21-admit)～[S-24](#s-24-失败值与它们的次序)、[S-29](#s-29-位置干预力与结论投影) 的投影表 | **够** |
| **runner：卡片答完回来** | 把答复交回去拿最终结论，而且不会再出同一张卡 | [S-12](#s-12-答复) 的 `answer`、[S-22](#s-22-判定次序) 的答复那一支 | **够**；答复的记录形状停在 [G-4](#十一已知缺口)，**停在缺口不算走不通** |
| **runner：自由作答** | 知道该怎么办 | [S-12](#s-12-答复)：落成授权表达之后不带 `answer` 再判 | **够**，落成授权表达的写入停在 [G-2](#十一已知缺口) |
| **执行运行时：提交一批已放行调用** | 逐项核对凭据，参数变了就不执行 | [S-25](#s-25-verifytoken)、[S-26](#s-26-令牌有效的条件) | **够**；它必须带 `call` 与 `session`，**账本里的单参签名不够用**（已报主线） |
| **执行运行时：运行被取消后还有排着的已放行调用** | 知道不该再执行 | [S-26](#s-26-令牌有效的条件) 第 5 条 | **够** |
| **PF-008 卡片契约** | 系统卡片的四档选项常量与各档含义 | [S-15](#s-15-定死的四档选项与卡片草稿)、[S-27](#s-27-四档答复各落在哪)、[S-28](#s-28-四档选项只在本能力出的卡上带授权含义) | **够**；第四档的资格停在 [G-3](#十一已知缺口) |
| **兼容层**：宿主 hook 的 `ask` 要四档选项 | 选项常量 | [S-15](#s-15-定死的四档选项与卡片草稿) | **够**；[S-28](#s-28-四档选项只在本能力出的卡上带授权含义) 写明那些卡上它们不带授权 |
| **agent**：知道为什么没做成 | 分得出人不同意、没有答案、规则不准、判断没做成 | [S-14](#s-14-拒绝原因) 五个原因 ＋ [S-29](#s-29-位置干预力与结论投影) 的失败那一行 | **够**，前提是 runner 把 token 原样带进 `veto.reason` |

---

## 十三、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，没有语义或表示差异可记，也没有消费者迁移。

**本版的规范工件**：本文件与 [`examples.md`](examples.md)。**不建 `formal/`、不附 Schema**，理由在 [S-37](#s-37-本版不建形式工件)。
接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。

**发布后**：本目录下的规范正文与实例不可原地覆盖；修改发布新版本。[已知缺口](#十一已知缺口)任一项被裁决而改变本契约语义或表示的（G-5 换引用、G-7 改前提、G-10 改重判规则），都出 **v2**；
推荐版本不自动升级消费者。**接受之前**，候选可以原地修订，每次修订记在[验证入口「变化的影响」](../verification.md#变化的影响)。
