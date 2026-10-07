# data.loop-extension v4

> v4 从已接受并冻结的 v3 演进，只升级模型档案快照与消息记录的精确依赖，使失败主体保留模型适配绑定。候选变化、验证义务与本轮结果见[版本外验证入口](../verification.md#v4-模型适配绑定闭包)。旧运行不重标为 v4。

> 规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.loop-extension, 4)`——
  `family = data`、`topic = loop-extension`、规范路径 `spec/data/loop-extension/v4/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：当前采用范围见 catalog；依据模型适配批次的共同数据演进起草，采用范围以 catalog 为准。D-068 对源 v3 的接受不自动接受本版。
- **继承的需求 rev 对账**：PF-005 rev 5 → rev 6；PF-012 rev 14 → rev 15；PF-013 rev 12 → rev 13。仅更新本次依据：PF-005 的增量归外部 hooks／执行环境，PF-012 的栅栏与迟到账责任归运行时，PF-013 的增量只收窄 UI 验收适用；本契约所用值与声明的规则不变。源2历史复核文字保留其原 rev；精确差异及 owner 见 起草报告。
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-012 rev 15**、**PF-013 rev 13**、**PF-008 rev 7**、**PF-002 rev 20**、**PF-014 rev 7**、**PF-006 rev 19**、**PF-000 rev 1**、**PF-005 rev 6**、**PF-015 rev 11**（两者只取执行环境句柄指向的会话级沙箱与会话持有的租户身份，[S-41](#s-41-执行环境句柄)）为准
- **精确语义依赖**（逐项在 catalog 登记）：

  | 坐标 | 取它的什么 | 状态 |
  |---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 不透明标识的交换表示——`LogHandle`、`EnvironmentHandle` 照它的规则在本契约内定义（不跨契约 `$ref` 那一个 `$def`） | 已接受、已冻结 |
  | `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1` | [S-22](../../offer-expiry/v1/contract.md#s-22-schema-的范围) 的 `$defs/Instant`——结论落下的时刻 | 已接受、已冻结 |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v3` | `$defs/ToolCallBlock`（含它的 `arguments` 成员：[S-28](#s-28-ask) 改写提议的形状）、`ToolResultBlock`、`CallId`、`ExecutionOutcome`；[S-19](../../content-blocks/v3/contract.md#s-19-派生表示与-transcript) 的派生表示——[S-23](#s-23-rewrite) 模型产出的消息落盘之前只许挂的那一种改动 | 状态以 registry 精确坐标为准 |
  | `omne-harness-lite-design-2026-09-15 · data.asset-model · v3` | [S-2](../../asset-model/v3/contract.md#s-2-能力标识名的词法) 的 `$defs/CapabilityName`——拓展件名（声明里的与结论记录里的）的词法；[S-10](../../asset-model/v3/contract.md#s-10-八类正文的外壳)——身份只在资产记录的 `capability` 上，声明里的 `name` 是它的镜像，不等即 `malformed`；[S-12](../../asset-model/v3/contract.md#s-12-属性声明由正文推出)、[S-13](../../asset-model/v3/contract.md#s-13-设置项类别)、[S-15](../../asset-model/v3/contract.md#s-15-disabled-是保留项名)、[S-36](../../asset-model/v3/contract.md#s-36-usableby-是保留项名)——推出规则的四项义务、`binding` 类别与两个保留项名（[S-40](#s-40-属性项的推出规则)） | 状态以 registry 精确坐标为准 |
  | `omne-harness-lite-design-2026-09-15 · data.messages · v4` | `$defs/Message`、`SystemReminderMessage`、`AssistantMessage`、`CompactionMessage`；[S-49](../../messages/v4/contract.md#s-49-模型请求运行时写的五种记录不是消息) 的 `ModelCallDispatchedRecord`（「已出门」记录） | 状态以 registry 精确坐标为准 |
  | `omne-harness-lite-design-2026-09-15 · data.model-profile · v3` | [S-2](../../model-profile/v3/contract.md#s-2-routename) 的 `$defs/RouteName`——`request.target` 与 `select_model` 的 `profile` 都是一个路由名；`ModelRequestParameters`、`ProviderName`、[S-27](../../model-profile/v3/contract.md#s-27-modelprofilesnapshot档案在某一刻的副本) 的 `ModelProfileSnapshot`（连同 [S-29](../../model-profile/v3/contract.md#s-29-modeladaptationbinding)、[S-30](../../model-profile/v3/contract.md#s-30-配置值与写入者义务) 的完整绑定与无损配置值） | 状态以 registry 精确坐标为准 |
  | `omne-harness-lite-design-2026-09-15 · data.call-accounts · v2` | `$defs/Usage`、`Cost`；`$defs/RunId`、`AttemptId`——运行与执行尝试的标识，家在那份契约 | 状态以 registry 精确坐标为准 |
  | `omne-harness-lite-design-2026-09-15 · data.tool-definition · v3` | `$defs/DependencyName`、`Duration`；[S-6](../../tool-definition/v3/contract.md#s-6-模型面只有一个条目) 的 `ModelToolName`——`ModelRequest.tools` 与 `ToolDefinitionRef.name` 都是模型面名字 | 状态以 registry 精确坐标为准 |

  **只引名字，不复述定义。**各条款号登记在 catalog 的 `clauses` 里；正文以坐标与 `$defs` 名指认。
  正文里提到的 `capability.loop-extension-runner`、`capability.tool-admission`、`capability.model-request-runtime`、`capability.hooks-import` 是**消费者**，方向是它们 → 本契约，不登依赖；
  正文在 S-10、S-14、S-23、S-28、S-33、S-41 与第十四节指向它们（以及 `data.model-response`）的条款，是**指路**（那条性质由那一侧兑现、本契约不据以写出任何形状），同样不登；
  S-6、S-40 指向 `capability.asset-governance`（写面的 `valueOutOfDomain`）与 `capability.asset-evaluation`（输入一致性 C10）同理——它们都消费本契约，反向登记会成环
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.loop-extension/v4#S-21`。
  缺口 `G-n`、性质 `P-n` 同此

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 十一个位置由状态点推出；位置不编号 | [PF-012 §5.8 十一个位置](../../../../product/PF-012-agent-loop-and-run/design.md#十一个位置是推出来的不是挑出来的) · [§5.3](../../../../product/PF-012-agent-loop-and-run/design.md#53-改日志的动作与纯派生的动作) | [S-1](#s-1-十一个位置) |
| 消息落盘之前每条消息都经过；那一刻看得到什么 | [PF-012 §5.8 消息落盘之前](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前每条消息都经过它不只是输入) · [PF-014 §5.6](../../../../product/PF-014-inbound-intake-and-queueing/design.md#56-消息落盘之前那一刻看得到什么) | [S-11](#s-11-输入的成员)、[S-14](#s-14-按位置的-subject)、[S-26](#s-26-stop) |
| 两个位置带维度，维度不是第十二个位置 | [PF-012 §5.8 两个位置带维度](../../../../product/PF-012-agent-loop-and-run/design.md#两个位置带维度) | [S-2](#s-2-两个维度)、[S-3](#s-3-管哪些情形本版只有维度) |
| 按位置命名，同一位置可挂多件 | [PF-012 §5.8 按位置命名](../../../../product/PF-012-agent-loop-and-run/design.md#按位置命名不按功能命名) | [S-1](#s-1-十一个位置)、[S-7](#s-7-name-是身份) |
| 系统自带的几件各站在哪 | [PF-012 §5.8 系统自带的几件](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪) | [消费者表](#消费者) |
| 能做什么、不能做什么；第二条护着 `f` 的纯性 | [PF-012 §5.8 能做什么](../../../../product/PF-012-agent-loop-and-run/design.md#能做什么不能做什么) · [第二条是硬的](../../../../product/PF-012-agent-loop-and-run/design.md#第二条是硬的因为它护着-f-的纯性) | [S-19](#s-19-结论封闭八种)、[S-32](#s-32-结论即走向) |
| 干预力三档与报错默认；否决按位置的含义 | [PF-012 §5.8 干预力三档](../../../../product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的) · [PF-000 §5.3](../../../../product/PF-000-occurrences-and-record-entries/design.md#53-干预力只长在瞬态这一半上) | [S-4](#s-4-干预力三档)、[S-5](#s-5-报错处置策略)、[S-20](#s-20-档与结论的合法组合)、[S-25](#s-25-veto)、[S-26](#s-26-stop) |
| 不可用按这一件的不可用处置办（跳过 · 否决 · 替换为指定挂件），报错按策略；停在等人两者都不是；「此刻不在、按 X 处置」看得见 | [PF-012 §5.8 可插拔的服务](../../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略) · [系统自带的几件不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)（rev 12～14） · [UL-extension-unavailability-policy](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy) · D-059 U-5 | [S-6](#s-6-声明的成员与类别)、[S-9](#s-9-依赖声明与不可用)、[S-13](#s-13-瀑布里的-subject-与-earlier)、[S-31](#s-31-三种记录形状)、[S-33](#s-33-不可用与报错两分) |
| 不可用处置是这一件自己的声明，不是设置也不是权限，各层不配值 | [PF-002 §4 不可用处置是这一件自己的声明](../../../../product/PF-002-assets-settings-and-permissions/design.md#不可用处置是这一件自己的声明)（rev 20，D-5 闭合） | [S-6](#s-6-声明的成员与类别)、[S-40](#s-40-属性项的推出规则) |
| 消息落盘之前的否决分三路 | [PF-012 §5.8 否决分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路) | [S-25](#s-25-veto) |
| 没有「放宽」 | [PF-012 §5.8 没有放宽](../../../../product/PF-012-agent-loop-and-run/design.md#没有放宽这一档) | [S-29](#s-29-没有放宽) |
| 改参数先落一条生效参数；放行、人签、执行是同一份参数 | [PF-012 §5.8 改参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数) | [S-23](#s-23-rewrite)、[S-10](#s-10-本版没有-order) |
| 三种形态：点式与瀑布式采用，环绕式拆两半 | [PF-012 §5.8 三种形态](../../../../product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半) | [S-13](#s-13-瀑布里的-subject-与-earlier)、[S-19](#s-19-结论封闭八种) |
| 等人是 loop 的原语（五小节） | [PF-012 §5.8 等人是 loop 的原语](../../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语) · [协程不在了](../../../../product/PF-012-agent-loop-and-run/design.md#协程不在了靠日志不靠记忆) · [写拓展件的人要守的一条](../../../../product/PF-012-agent-loop-and-run/design.md#写拓展件的人要守的一条) · [一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个) · [两个地方等不了](../../../../product/PF-012-agent-loop-and-run/design.md#两个地方等不了) | [S-14](#s-14-按位置的-subject)、[S-28](#s-28-ask)、[S-35](#s-35-跨过一次等待只能带已落日志的东西) |
| 循环守卫四级 | [PF-012 §5.9](../../../../product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯) | [消费者表](#消费者)、[S-26](#s-26-stop) |
| 拓展件只能靠改日志起作用；验收办法 | [PF-012 §6.9](../../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用) | [S-32](#s-32-结论即走向)、[S-35](#s-35-跨过一次等待只能带已落日志的东西) |
| 能干预的拓展件必须留下结论；各结论至少落什么 | [PF-012 §6.10](../../../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论) | [S-30](#s-30-每件的结论必留)、[S-31](#s-31-三种记录形状) |
| 终态三种，原因不是终态 | [PF-012 §6.6](../../../../product/PF-012-agent-loop-and-run/design.md#66-终态不可逆且只有一个出口) · [运行终态](../../../../product/PF-012-agent-loop-and-run/design.md#运行终态) | [S-18](#s-18-terminalfact) |
| 取消先落日志再发信号；被取消之前必有取消请求 | [PF-012 §6.15](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号) · [§6.17 I-11、I-16](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) | [S-18](#s-18-terminalfact)、[S-26](#s-26-stop) |
| 执行尝试的身份是（运行, 第几次） | [PF-012 §4 执行尝试](../../../../product/PF-012-agent-loop-and-run/design.md#执行尝试) | [S-12](#s-12-三个引用) |
| 干预力是一项权限；只有三档 | [PF-000 §4 干预力](../../../../product/PF-000-occurrences-and-record-entries/design.md#干预力--intervention-power) · [PF-002 §4 Loop Extension](../../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension) | [S-4](#s-4-干预力三档) |
| 拓展件是第八类资产；身份是 name；声明位置、情形、干预力；外来 hook 按输出能力定档 | [PF-002 §4 Loop Extension](../../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension) · [身份是类别＋name](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) | [S-6](#s-6-声明的成员与类别)、[S-7](#s-7-name-是身份)、[S-8](#s-8-装配进来的实现与外部命令) |
| 设置与权限是资产的两种属性；设置项四类（位置与情形属绑定类） | [PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性) · [设置项分四类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别) | [S-4](#s-4-干预力三档)、[S-6](#s-6-声明的成员与类别) |
| 选中模型与有效模型；合法目标集合 | [PF-013 §4 选中模型与有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) · [§5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) | [S-24](#s-24-select_model) |
| 上交成因八个；状态码原样带 | [PF-013 §5.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) · [§6.14](../../../../product/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着) | [S-17](#s-17-failurecause) |
| 三类事实归本层定死；被中断不是故障 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码) · [还有一种没走完](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里) · [§6.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#612-事实判断归本-topic策略归拓展件) | [S-2](#s-2-两个维度)、[S-17](#s-17-failurecause)、[S-27](#s-27-retry) |
| 重试站在已有的位置上；每次发出只走一家；它看得到什么、能决定什么 | [PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上) | [S-14](#s-14-按位置的-subject)、[S-27](#s-27-retry) |
| 放行判断的输入输出与定死的四档选项 | [PF-008 §5.2](../../../../product/PF-008-human-in-the-loop/design.md#52-那个判断函数) | [S-28](#s-28-ask)、[G-6](#十四已知缺口) |
| 决策卡片；三种来源同一个形状；拓展件出的卡要标是哪一件 | [PF-008 §4 决策卡片](../../../../product/PF-008-human-in-the-loop/design.md#决策卡片) · [§6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同) · [§6.9](../../../../product/PF-008-human-in-the-loop/design.md#69-人拒绝之后agent-分得出那是拒绝) | [S-28](#s-28-ask) |
| 卸载判定站在执行动作之后（这一个） | [PF-006 §6.10](../../../../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度) | [消费者表](#消费者)、[S-23](#s-23-rewrite) |
| 拓展点协议的兼容层：fork 边界、G1–G11 推迟到协议起草 | D-033 | [S-8](#s-8-装配进来的实现与外部命令)、[十五、明确不承诺](#十五明确不承诺) |
| 同一位置只按装配顺序；`rewrite` 只改还没落盘的那一样；运行时只认统一入出；结论封闭（四种改走向加 `select_model`）；ReminderSource 封闭加 `extension` 兜底 | D-058 Q8 · Q9 · Q10 · Q19 · Q3 | [S-8](#s-8-装配进来的实现与外部命令)、[S-10](#s-10-本版没有-order)、[S-19](#s-19-结论封闭八种)、[S-22](#s-22-inject)、[S-23](#s-23-rewrite) |
| 改这一次调用的目标模型要留口子 | D-058 8c | [S-24](#s-24-select_model) |
| 三种报错处置策略各落什么：`ignore` 只落日志；`record` 落日志并在下一次组装注入一条「某件没跑成」；`treat_as_veto` 在「之后」的位置等于落失败 | 主线裁定，见 D-060 §S7 S7-b、S7-c | [S-5](#s-5-报错处置策略) |
| 被用户中断的模型调用不触发调模型之后 | 主线裁定，见 D-060 §S7 S7-d | [S-2](#s-2-两个维度) |
| 回复被系统拿去用（压缩摘要、旁路提问）的那一次也不触发调模型之后 | 主线裁定，见 D-060 §六 N-2（随 `data.model-response` G-14 关闭） | [S-2](#s-2-两个维度) |
| 回复在落盘之前被否决：不落盘、结论落日志、那次调用照常结束；再来一次是另起的新调用，不走成因；同一步连续被否决有上限 | [PF-012 §5.8 否决分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)「模型吐的回复」一行（rev 11 起）；缘起 D-060 §S8 S8-a | [S-2](#s-2-两个维度)、[S-17](#s-17-failurecause)、[S-25](#s-25-veto)、[S-27](#s-27-retry) |
| `after_terminal` 不许注入 | 主线裁定，见 D-060 §S7 S7-e | [S-21](#s-21-位置与结论的合法组合)、[S-22](#s-22-inject) |
| `stop` 带 `terminal`（被取消 / 失败，缺席即被取消）；循环守卫 L3 用失败 | 主线裁定，见 D-060 §S7 S7-a | [S-26](#s-26-stop)、[消费者表](#消费者) |
| 运行与执行尝试的标识取 `data.call-accounts` 的 `RunId`、`AttemptId`；不透明标识不跨契约引用 | 主线裁定，见 D-060 §S8 S8-c、§S1 S1-a | [S-12](#s-12-三个引用) |
| 实现恰两种：装配进来的（`builtin`）与外部命令（`command`，兼容件载荷的家） | 主线裁定，见 D-060 §S15 S15-b | [S-8](#s-8-装配进来的实现与外部命令) |
| 两处末位：放行判断在 `before_action` 末位，模态转换件在 `before_persist_message` 末位 | 主线裁定，见 D-060 §S15 S15-e、§S17 S17-d | [S-10](#s-10-本版没有-order) |
| 模型产出的消息在落盘之前只开放否决，另许系统模态转换件挂派生表示 | [PF-012 §5.8 否决分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)（rev 11 起）；挂派生表示不是改写，见 D-060 §S17 S17-c | [S-23](#s-23-rewrite)、[S-25](#s-25-veto) |
| `before_model_call` 的否决：这次请求不发，运行落「失败」 | 产品正文只说「这次请求不许发」（[PF-012 §5.8 干预力三档](../../../../product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的)）；「运行落失败」是**本契约的推导**，理由写在 [S-25](#s-25-veto)；主线接受，见 D-060 §六 N-2 | [S-25](#s-25-veto) |
| 系统自带件不可用时由系统预先声明的指定挂件顶上，放行判断顶上的是全拒件 | [PF-012 §5.8 系统自带的几件不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)（rev 12～14）；声明成员、记录与替换件表的落法见 D-060 §五 K8；D-059 U-5 | [S-33](#s-33-不可用与报错两分) |
| 「调模型之后 · 失败」的主体带档案快照与本次调用已有的发出记录 | 主线裁定，见 D-060 §块 C 对账 C-R1 | [S-14](#s-14-按位置的-subject)、[S-27](#s-27-retry) |
| 不承诺自定义重试件终止 | **本契约的推导**，理由写在 [S-27](#s-27-retry)；主线接受，见 D-060 §六 N-2 | [S-27](#s-27-retry) |
| `ModelRequest` 的成员名与模型请求运行时收的调用请求逐字相同 | 主线裁定，见 D-060 §S16 S16-c（其中「工具清单用 `CapabilityId[]`」一句已被下一行取代，登记见 D-060 §四 S16-c 行） | [S-15](#s-15-modelrequest) |
| 工具的指认用模型面名字：`ModelRequest.tools` 是 `ModelToolName[]`，`ToolDefinitionRef.name` 是模型面名字 | 主线裁定，见 D-060 §五 K10 | [S-14](#s-14-按位置的-subject)、[S-15](#s-15-modelrequest) |
| 属性项的推出规则：`position`、`dimension` 是绑定类设置项，`power` 是权限项；`onError`、`needs`、`implementation`、`unavailability` 不出项 | 规则的义务在 [`data.asset-model/v3#S-12`](../../asset-model/v3/contract.md#s-12-属性声明由正文推出)，「从正文推出」见 D-060 §块 A A3；逐项取法是主线裁定，见 D-060 §五 K9 | [S-40](#s-40-属性项的推出规则) |
| 调模型之前改写参数：响应体记实际发出的值，适配器改动逐项留痕 | 主线裁定，见 D-060 §五 K13；落在 `data.model-response` | [S-23](#s-23-rewrite) |
| 输入带一只按会话作用域的执行环境句柄：不交出会话标识，经它取得调用方租户身份与这一会话的执行环境 | 主线裁定，见 D-060 §八 M38；执行环境是 [PF-005 §6.3 会话级沙箱](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)（rev 5）的那一个，租户身份是 [PF-015 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)（rev 11）会话持有的那一个；不交出会话标识沿用 D-060 §六 L9 | [S-11](#s-11-输入的成员)、[S-41](#s-41-执行环境句柄) |
| 兼容件在 `ask` 时带的改写提议 | 主线裁定，见 D-060 §五 K32；兑现在 `capability.hooks-import` | [S-28](#s-28-ask) |
| 从别家搬来的 hook 出的卡借放行判断那几档的样子，但不带授权含义 | [PF-008 §6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同)（rev 6 起） | [S-28](#s-28-ask) |
| 统一语言正式名与形态 | [UL-loop-extension](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension) · [UL-loop-extension-point](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point) · [UL-wait-primitive](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-wait-primitive--等待原语--wait-primitive) · [UL-replay](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-replay--回放--replay) · [UL-decision-card](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card) · [UL-admission-decision](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision) · [UL-run](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run--运行--run) · [UL-run-attempt](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt) · [UL-run-terminal-state](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state) · [UL-effective-model](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model) · [UL-setting-category](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category) · [UL-dependency-declaration](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration) · [UL-intervention-power](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-intervention-power--干预力--intervention-power) · [UL-extension-point-pass](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-point-pass--一次经过--extension-point-pass) · [UL-extension-unavailability-policy](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy) · [UL-legal-target-set](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-legal-target-set--合法目标集合--legal-target-set) · [UL-retry-exhaustion](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-retry-exhaustion--试尽--retry-exhaustion)；只引：[UL-agent-runtime](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-agent-runtime--agent-runtime--agent-runtime) · [UL-record-entry](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry) · [UL-assembly-manifest](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest) | 全部正式名 |

> **这张表里没有产品行的条款，逐条点名：**
>
> | 条款 | 它的依据来自哪 |
> |---|---|
> | [S-10](#s-10-本版没有-order)、[S-19](#s-19-结论封闭八种) 的「封闭八种」、[S-23](#s-23-rewrite) 的「只改还没落盘的」 | 产品负责人 2026-09-23 的裁决，长期落点 D-058（Q8、Q19、Q9、Q10），不在产品正文里 |
> | 上表里「主线裁定」各行 | 主线的规格层裁定，持久记录在 D-060（第一轮独立评审的处置在它的第五节，修复波 1b 接受的命名与推导在第六节，第二轮独立评审之后的裁定在第七节） |
> | 上表里「本契约的推导」两行 | 理由写在所指条款里；两行都已由主线接受（D-060 §六 N-2） |
> | [S-36](#s-36-规范表示与定义项)～[S-39](#s-39-判别式与枚举闭合)，以及 [S-12](#s-12-三个引用) 的表示部分 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec)：表示、校验与「表示层不等于判定」是规格形式的要求，产品正文不承诺这一层 |
> | [第十节装配给与协议给](#十装配给与协议给) | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) |

## 一、目的与消费者

### 这份契约拥有什么

**拓展点协议里语言无关的数据部分**，一共七样：

1. 十一个位置与两个维度的取值（[S-1](#s-1-十一个位置)～[S-3](#s-3-管哪些情形本版只有维度)）；
2. 干预力三档与报错处置策略的取值（[S-4](#s-4-干预力三档)、[S-5](#s-5-报错处置策略)）；
3. 一件拓展件的**声明**长什么样（[S-6](#s-6-声明的成员与类别)～[S-10](#s-10-本版没有-order)），以及由它推出的属性项（[S-40](#s-40-属性项的推出规则)）；
4. 运行时交给拓展件的**输入**，按位置判别的主体（[S-11](#s-11-输入的成员)～[S-18](#s-18-terminalfact)），含执行环境句柄（[S-41](#s-41-执行环境句柄)）；
5. 拓展件交回的**结论**——封闭八种，以及档、位置各自允许哪几种（[S-19](#s-19-结论封闭八种)～[S-29](#s-29-没有放宽)）；
6. 结论**落日志的记录形状**（[S-30](#s-30-每件的结论必留)～[S-32](#s-32-结论即走向)）；
7. 决策卡片**草稿**的形状（[S-28](#s-28-ask)）。

外加三条跟着数据走的性质：不可用与报错两分（[S-33](#s-33-不可用与报错两分)）、不合法的结论按报错处置（[S-34](#s-34-不合法的结论按报错处置)）、作者须知（[S-35](#s-35-跨过一次等待只能带已落日志的东西)）。

**它是一份数据契约：没有操作、没有状态转移、没有提交点，因此不需要插件。**
「谁在什么时刻把输入交给拓展件、瀑布怎么走、结论怎么落、回放怎么跑、报错策略怎么执行」
是**运行时的操作与义务**，归 [`capability.loop-extension-runner`](../../../capabilities/loop-extension-runner/v2/contract.md) v1。
本契约只说那些操作交换的东西**是什么、什么算合法**。

### 这份契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| runner 的操作与义务：瀑布、回放、结论先落后算、报错策略与不可用处置的执行、「同一位置同一次经过只跑一轮」、系统自带件不可用时指定挂件顶上的效果表 | `capability.loop-extension-runner` v2 |
| Claude Code / Codex hooks 的事件映射、编解码、定档依据、matcher 的求值、导入报告 | `capability.hooks-import` v2（D-033 G1–G11 的落点） |
| 决策卡片本身（`CardId`、答复、陈列、谁能答） | PF-008 的卡片契约（未起草） |
| 拓展件作为资产怎么被持有、谁能装、各层怎么配值与求值 | 资产领域（PF-002），本契约只标**类别** |
| 位置本身（有几个、各看得见什么） | [PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点)，本契约把它写成取值与形状 |
| 消息、块、账、模型档案、工具定义的形状 | 各自的 data 契约（见抬头依赖表），本契约只引名字 |

### 消费者

| 消费者 | 消费什么 |
|---|---|
| **拓展件作者**（装配进来的与外部命令） | 声明形状（S-6）、输入（S-11～S-18）、结论（S-19～S-29）、作者须知（S-35） |
| **`capability.loop-extension-runner`** v1 | 全部：它产出输入、校验结论（S-37 的拒绝值）、按 S-30～S-34 落记录；执行环境句柄由它按会话造，解析得到什么、何时失效在它那边（S-41 → 它的 S-50） |
| **agent loop 的状态转移表** | 结论（S-19）与结论记录（S-30）：它只读日志里的结论决定下一步（S-32） |
| **系统自带的五件**（下表） | 与外来件同一套形状，**不享受特权** |
| **资产领域**（PF-002 持有） | 声明推出的属性项：哪几项是设置、属哪一类，哪一项是权限（S-4、S-6、[S-40](#s-40-属性项的推出规则)） |
| `data.model-response` v3、`data.arrival-events` v2 | `FailureCause` 八值——**名字由本契约定，它们 `$ref`**（S-17）；`select_model` 的留痕落在响应体的 `route.selectedBy`（S-24） |
| `capability.hooks-import` v2 | `command` 件的载荷（S-8）；统一输入与结论是它两边翻译的这一头；子进程落在哪经执行环境句柄取（S-41） |
| `capability.modality-projection` v2 | 系统自带的模态转换件以谁的租户身份转，经执行环境句柄取（S-41） |
| `capability.tool-admission` v2、`capability.model-request-runtime` v2 | 放行判断与重试这两件系统自带件的输入、结论与卡片草稿（S-14、S-27、S-28）；`ModelRequest` 与 `ToolDefinitionRef` 里的工具名是模型面名字（S-14、S-15） |

**系统自带的五件**，站在哪、用本契约的哪几种结论（位置与干预力取自 [PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪)；「用哪几种结论」是本契约的对照）：

| 件 | 位置（维度） | 干预力 | 用得到的结论 |
|---|---|---|---|
| 循环探测（[PF-012 §5.9](../../../../product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯)） | `after_model_call`（`complete_reply`） | 可改写 · 可否决 | L0 `observed`；L1/L2 `inject`；L3 `stop{ terminal: failed }`（落失败，原因：原地打转）；L4 `ask` |
| 放行判断（[UL-admission-decision](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-admission-decision--放行判断--admission-decision)） | `before_action` **末位** | 可否决 | `observed`、`veto`、`ask`（四档选项定死在 `capability.tool-admission` v2 S-15） |
| 卸载判定（[PF-006 §6.10](../../../../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)） | `after_action`（`each`） | 可改写 | `observed`、`rewrite`（结果换成占位） |
| 模态转换 | `before_persist_message` **末位** | 可改写 · 可否决（转不成就不落盘：报错策略 `treat_as_veto`） | `observed`、`rewrite`（只「挂派生表示」这一种改动，[S-23](#s-23-rewrite)） |
| 重试（[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上)） | `after_model_call`（`failure`） | 可改写 | `observed`（不再试）、`retry` |

**五件的实现都是 `builtin`**（[S-8](#s-8-装配进来的实现与外部命令)）；**它们不可用时由系统预先声明的指定挂件顶上**，效果照 runner 的那张表（[S-33](#s-33-不可用与报错两分)）。
**模态转换件本版不是资产**（[UL-modality-converter](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)），
但它**照样用本契约的声明、输入与结论**——「自带的不享受特权」说的就是这件事。它作不作为资产被持有，不归本契约。

## 二、含义与使用范围

**适用范围：一个部署之内，一个会话的日志上。**本版完整交付是单机，但每一条的领域语义在跨进程之后必须原样成立；
哪些由装配给、哪些须由协议重新兑现，列在[第十节](#十装配给与协议给)。

### 三类东西，不要混读

| 类 | 是什么 | 本契约给什么 |
|---|---|---|
| **声明** | 一件拓展件**是什么**：`LoopExtensionDefinition` | 资产内容的形状；哪几项是设置的出厂值、哪一项是权限的出厂值 |
| **一次经过的往返** | 运行时在某个位置上**这一次**交给它什么、它交回什么：`ExtensionInput`、`ExtensionOutput` | 按位置判别的形状与合法组合 |
| **留下来的** | 这一次经过**落进日志**的那一条：`Conclusion` | 记录形状；三种记录 |

> **[一次经过](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-point-pass--一次经过--extension-point-pass)**：运行时在一个位置的一次到达上，按瀑布依次把输入交给挂在那儿的每一件（词条 UL-extension-point-pass；产品正文「同一个位置，同一次经过只跑一轮」，[PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#改了日志就重新组装同一位置同一次经过只跑一轮)）。

### 规格层 token 与词条的对应

| token | 词条或产品正文里的说法 |
|---|---|
| `LoopPosition` 的十一个值 | [Loop 拓展点](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)的十一个位置，逐个见 [S-1](#s-1-十一个位置) |
| `LoopExtensionDefinition` | [拓展件 · Loop Extension](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)的声明 |
| `Power` 的 `observe` / `rewrite` / `veto` | [干预力](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-intervention-power--干预力--intervention-power)的只观察 / 可改写 / 可否决（产品正文在 [PF-000 §4](../../../../product/PF-000-occurrences-and-record-entries/design.md#干预力--intervention-power)） |
| `UnavailabilityPolicy` 的 `skip` / `veto` / `fallback` | [拓展件不可用处置](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy)的跳过 / 否决 / 替换为指定挂件 |
| `TerminalFact.state` 的 `completed` / `failed` / `cancelled`；`stop.terminal` 的 `failed` / `cancelled` | [运行终态](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state)的完成 / 失败 / 被取消 |
| `AskOutput`、`DecisionCardDraft` | 落一张[决策卡片](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card)等人，用的是[等待原语](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-wait-primitive--等待原语--wait-primitive) |
| `SelectModelOutput` | 改这一次请求的[有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model) |
| `needs` | [依赖声明](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)（词条正文写的是「工具或技能」，本契约把同一概念用在拓展件上，见 [G-5](#十四已知缺口)） |

**`Dimension`、`ErrorPolicy`、`Subject`、`ExtensionInput`、`ExtensionOutput`、`Conclusion`、`LogHandle`、`EnvironmentHandle`、`TerminalFact`、`RetryPlan`、`CardOption` 是规格层的形状名，不是词条**，Schema 里因此不给它们「中文 · English」式标题。

**正文用到、词表里没有的概念（无词条）**——本契约**不给它们下定义**，只指到产品正文：
状态点（[PF-012 §5.3](../../../../product/PF-012-agent-loop-and-run/design.md#53-改日志的动作与纯派生的动作)）、
结论（[PF-012 §6.10](../../../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论)）、
报错处置策略与瀑布（[PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半)）、
生效参数（[PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数)）、
上交成因（[PF-013 §5.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它)）。

### 与相近概念的差异

- **位置 ≠ 拓展件。**位置由状态点推出、恰十一个；拓展件是挂上去的东西、没有上限。位置**不是**拓展件的身份（[S-7](#s-7-name-是身份)）。
- **维度 ≠ 位置。**`after_model_call{failure}` 仍是 `after_model_call`；维度是挂件声明自己管哪一种的**筛选条件**，不管的那种它根本不被调到。
- **声明里的值 ≠ 这一次的值。**`position`、`dimension` 是绑定类设置的出厂值，`power` 是干预力这项权限的出厂值；各层配值之后求得的才是这一次经过用的——**输入与结论记录里带的是求得的值**（[S-4](#s-4-干预力三档)、[S-6](#s-6-声明的成员与类别)）。
- **`ask` ≠ 一个终结的结论。**它让这一次经过停在等人；人答完，同一件经回放交回它这一次的最终结论（[S-28](#s-28-ask)）。
- **`stop` ≠ `veto`。**`veto` 拦的是它站的那个状态点；`stop` 让整次运行不再继续（落「被取消」或「失败」）。
- **不可用 ≠ 报错 ≠ 在等人**（[S-33](#s-33-不可用与报错两分)）。**不可用处置 ≠ 报错处置策略**：前者管根本没跑（`unavailability`，[S-6](#s-6-声明的成员与类别)），后者管跑了出错（`onError`，[S-5](#s-5-报错处置策略)）。
- **表示层拒绝 ≠ 判定**（[S-38](#s-38-表示层拒绝不是判定)）。

## 三、位置、维度与干预力

### S-1 十一个位置

**`LoopPosition` 是一个闭合枚举，恰十一个值，每个值对应一个状态点的紧前或紧后。**
状态点恰六个（尝试开始 · 消息落盘 · 压缩 · 调模型 · 执行动作 · 落终态），两条边共十二条，
**「尝试开始之前」不开**（归 PF-015），其余十一条全部开放：

| token | 位置 | 状态点 | 边 |
|---|---|---|---|
| `attempt_started` | 尝试开始之后 | 尝试开始 | 紧后 |
| `before_persist_message` | 消息落盘之前 | 消息落盘 | 紧前 |
| `after_persist_message` | 消息落盘之后 | 消息落盘 | 紧后 |
| `before_compaction` | 压缩之前 | 压缩 | 紧前 |
| `after_compaction` | 压缩之后 | 压缩 | 紧后 |
| `before_model_call` | 调模型之前 | 调模型 | 紧前 |
| `after_model_call` | 调模型之后 | 调模型 | 紧后 |
| `before_action` | 执行动作之前 | 执行动作 | 紧前 |
| `after_action` | 执行动作之后 | 执行动作 | 紧后 |
| `before_terminal` | 落终态之前 | 落终态 | 紧前 |
| `after_terminal` | 落终态之后 | 落终态 | 紧后 |

- **按位置命名，不按功能命名。**「打转保护」「脱敏」是挂在某个位置上的件，不是位置。
- **位置没有编号**（表里的行序不是编号）；消费者不得以序号指认位置，不得依赖枚举的排列顺序。
- **纯派生的动作前后没有位置**：`before_assembly` 一类取值不存在，也不得被造出来。
- 本表是位置清单的全部；**将来多一个状态点，多两个位置，出新版本**。
- 未知取值即表示层拒绝值 `position_unknown`（[S-37](#s-37-表示层拒绝值)）。

### S-2 两个维度

**恰两个位置带维度，维度是那个位置上的筛选条件，不是第十二个位置：**

| 位置 | 维度成员 | 取值 | 含义 |
|---|---|---|---|
| `after_model_call` | `ending`（收场） | `complete_reply` · `failure` | 完整回复 · 失败 |
| `after_action` | `scope`（范围） | `each` · `batch` | 这一个 · 这一批全齐 |

- **在这两个位置上维度必带**：缺席即 `dimension_missing`——缺席**不**读作「两种都管」。
  要两种都管，就是两件拓展件（两份声明、两个 name）。
- **在其余九个位置上维度必不带**；带了、或带了不属于该位置的那一种（例如 `after_model_call` 带 `scope`），即 `dimension_not_allowed`。
- 这条配对对**每一处**成立：声明、输入、结论记录；对各层配值之后**求得的**那一对同样成立——**由取值域兑现**：位置项只收与声明同一维度成员的位置、维度项只收那一个成员的取值（[S-40](#s-40-属性项的推出规则)），配不出不合法的一对（[S-6](#s-6-声明的成员与类别)）。
- **`after_model_call` 只在两种收场之后触发：完整回复落了盘（`complete_reply`），或调用失败、带着成因（`failure`）。**下面三种调用都**不触发**它：
  - **被用户中断的那一次**——被中断既不是收场也不是故障（[PF-013 还有一种没走完](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里)），不映射到两个取值中的任何一个；
  - **回复在落盘之前被否决的那一次**——那次调用照常结束，回复没进日志（[S-25](#s-25-veto)）。在这里触发就得把一份没落盘的回复交给后面的件，而它们的结论要落日志（[P-11](#十二性质)）；
  - **回复被系统拿去用的那一次**（`data.model-response` 的 `replyDisposition = consumed`：压缩时生成摘要、旁路提问）——与被否决的那一次同理：回复没有落成一条回复消息，就没有「完整回复」那一维（主线裁定，见 D-060 §六 N-2，随 `data.model-response` G-14 的关闭）。

### S-3 「管哪些情形」本版只有维度

PF-002 说一件拓展件声明「挂在哪个位置、管哪些情形」。**本版「情形」只有 [S-2](#s-2-两个维度) 那两个维度这一种形式**：
声明里没有按工具名、消息种类、来源之类的筛选成员。一件只关心某一种工具的拓展件，
在那个位置上**照样每次都被调到**，对不关心的那些交回 `observed`。
更细的筛选若要进声明顶层，是下一版的事；别家 hook 的 `matcher` 原样记在 `command` 实现里（[S-8](#s-8-装配进来的实现与外部命令)），怎么求值归兼容层。

### S-4 干预力三档

**`Power` 恰三档：`observe` 只观察 / `rewrite` 可改写 / `veto` 可否决。**

| 档 | 能做什么 | 能交回的结论 |
|---|---|---|
| `observe` | 看，不改 | 只有 `observed` |
| `rewrite` | 追加一条，或决定下一条还没落盘的长什么样 | 见 [S-20](#s-20-档与结论的合法组合) |
| `veto` | 以上全部，外加拦住它站的那个状态点、让这次运行不再继续、**落一张卡片等人** | 八种全部（仍受位置约束） |

- **没有「放宽」这一档**，也没有任何结论能把一次「问一下」变成放行（[S-29](#s-29-没有放宽)）。
- **「等人」不是第四档**：拦得住才谈得上等，它属于 `veto`。
- **干预力是拓展件的一项权限，不是设置**（[PF-002](../../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension)）。
  声明里的 `power` 是这项权限的**出厂值**（定义给默认值，与 D-058 Q6 对工具定义的裁决同一口径）；各层只能**收窄**；
  工作区带来的拓展件一律只观察（[PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)）。
  **这一次经过用的是求得的值**，结论合不合法按它判，并记在结论记录的 `power` 上（[S-30](#s-30-每件的结论必留)）。
  求值归资产领域的能力；**「不高于声明的值」由允许集合兑现**：[S-40](#s-40-属性项的推出规则) 推出的干预力权限项，`values` 只含声明档及其以下，出厂格给出的整个 `values` 就是上限，各层只能在其中挑（主线裁定，见 D-060 §七 M3）。
- 未知取值即 `power_unknown`。

### S-5 报错处置策略

**`ErrorPolicy` 恰三个值，说一件拓展件「可用却运行时报错」时这一次怎么处置：**

| token | 对 agent 的效果 | 结论记录（`skipped: errored` ＋ `error` ＋ 下面这个 `output`） |
|---|---|---|
| `ignore` | **没有任何效果**：这一次经过照常往下走 | `observed` |
| `record` | 这一次经过照常往下走；**另往日志追加一条系统提醒，说本件这一次没跑成**，下一次组装看得到它 | `inject`，那条提醒见下 |
| `treat_as_veto` | **fail-closed**：在「之前」的位置拦住那个状态点；在「之后」的位置**运行不再继续** | 五个「之前」的位置 `veto`；`after_terminal` 以外的五个「之后」的位置 `stop{ terminal: failed }`（[S-26](#s-26-stop)） |

- **`treat_as_veto` 在「之后」的位置 ≡ `stop{ terminal: failed, reason }`**：那里没有可否决的状态点（[S-21](#s-21-位置与结论的合法组合)），fail-closed 就是这次运行不再继续——落「失败」，原因指向本件。
- **`record` 那条提醒**：`source` 为 `extension`、`source.extension` 为本件的 name（与 [S-22](#s-22-inject) 同一条来源规则），内容只说「本件这一次没跑成」，给模型看。
  它是 runner 以本件名义写的，**不转述报错详情**——那些只在结论记录的 `error` 里，且同样守 [S-31](#s-31-三种记录形状) 的「不带凭据、不转述没落盘的内容」。
- **`after_terminal` 上三种都落 `observed`**：那里唯一合法的结论是 `observed`（[S-21](#s-21-位置与结论的合法组合)）。
  运行已落终态，「不再继续」本来就成立；而一条提醒会让队列变非空、起下一次运行，那正是 `after_terminal` 不许注入的原因。
- **缺席时的默认按求得的干预力取**，不是「不处置」：`observe` → `ignore`，`rewrite` → `record`，`veto` → `treat_as_veto`
  （[PF-012 §5.8 干预力三档表](../../../../product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的)最后一列）。
- **策略不高于干预力**：`observe` 只能声明 `ignore`，`rewrite` 不能声明 `treat_as_veto`，违者即 `malformed`——
  否则一件不能注入的件会在报错时注入，一件拦不住任何东西的件会在报错时拦下东西。
- **求得的策略同样不高于求得的干预力**：声明的策略高于这一次求得的干预力（例如声明 `treat_as_veto`、这一次被收窄到 `rewrite`），
  这一次按**那一档的默认**处置——拦不住东西的件，报错时同样拦不住。
- **无论哪一种，处置本身都在那条结论记录里、可见**（[S-31](#s-31-三种记录形状)）。
- `veto`、`stop` 的 `reason` 由 runner 写，指明是本件报错按 `treat_as_veto` 处置；**不转述报错详情**，理由同上。
- `ErrorPolicy` 是规格层的策略 token。**`onError` 是这一件自己的声明，不是设置也不是权限**：推出规则不为它出项（[S-40](#s-40-属性项的推出规则)），各层不给它配值；「这一次按哪一档处置」只随求得的干预力收窄（上一条）。
- **唯一的例外：兼容件的非阻断错误**（主线裁定 D-060 §八 N-39）：一件 `command` 件（[S-8](#s-8-装配进来的实现与外部命令)）以来源产品语义下的非阻断错误收场（非零退出、超时、输出不合形状）时，这一次固定按 `ignore`、不看 `onError`；**记录形状不变**，仍是 [S-31](#s-31-三种记录形状)「可用却报错」那一种（`skipped: errored` ＋ `error` ＋ `observed`）。规则与三种成因的归属在 `capability.loop-extension-runner` v2 的 S-13 与 `capability.hooks-import` v2 的 S-19，本契约不另立形状。

## 四、声明

### S-6 声明的成员与类别

**`LoopExtensionDefinition = { name, position, dimension?, power, onError?, unavailability?, needs?, implementation }`**，不许有其他成员。

| 成员 | 含义 | 在资产上是什么（[UL-setting-category](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-setting-category--设置项类别--setting-category)） | 缺席 |
|---|---|---|---|
| `name` | 能力标识的 name（[S-7](#s-7-name-是身份)） | 身份的镜像，不是设置 | 拒绝（`malformed`） |
| `position` | 挂在哪个位置 | **设置 · 绑定类**，这里是出厂值 | 拒绝（`malformed`） |
| `dimension` | 管哪一种情形 | **设置 · 绑定类**，这里是出厂值 | 按 [S-2](#s-2-两个维度)：那两个位置上拒绝（`dimension_missing`），其余位置本来就不带 |
| `power` | 干预力 | **权限**，这里是出厂值 | 拒绝（`malformed`） |
| `onError` | 报错处置策略（[S-5](#s-5-报错处置策略)） | **这一件自己的声明**，不是设置也不是权限，不出项（[S-40](#s-40-属性项的推出规则)） | 按求得的干预力取默认 |
| `unavailability` | [拓展件不可用处置](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy)：此刻不在时这一次怎么办，`skip` 或 `veto`（见下） | **这一件自己的声明**，不是设置也不是权限，各层不配值、收窄不了它（[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#不可用处置是这一件自己的声明)）；不出项 | `skip` |
| `needs` | 依赖声明（[S-9](#s-9-依赖声明与不可用)） | 属于实现，不是设置 | 不需要任何东西 |
| `implementation` | 装配进来的实现还是一条外部命令（[S-8](#s-8-装配进来的实现与外部命令)） | 属于实现，不是设置 | 拒绝（`malformed`） |

- **绑定类设置的配值由各层给、运行时求值**（[PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#52-设置与权限是资产的两种属性)）；
  本契约只标类别，**不定义配值与求值**。求得的 `(position, dimension)` 同样要满足 [S-2](#s-2-两个维度) 的配对，**由取值域兑现**（[S-40](#s-40-属性项的推出规则)）：
  一层把位置配到另一种维度成员的位置上，是配了取值域以外的值，资产治理的写面以 `valueOutOfDomain` 拒（主线裁定，见 D-060 §七 M4）；runner 不会遇到不合法的一对。
- **一份表示不合法的声明不是一件拓展件**：它不被挂上，也**不**算「不可用」或「报错」（那两个说的是一件已经挂上的件）；
  拒绝值见 [S-37](#s-37-表示层拒绝值)，谁把拒绝显示给装它的人，归资产领域与装配。

**`unavailability` 的取值与谁能声明哪一种**（[PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略)，rev 12 起；`$defs/UnavailabilityPolicy` 恰三个值 `skip`、`veto`、`fallback`，**声明里只收前两个**）：

| 取值 | 此刻不在时这一次那个位置怎么办 | 谁能声明 |
|---|---|---|
| `skip`（缺席即此） | 视作已卸载：瀑布里没有它，同一位置上别的件照常过 | 凡不是系统自带的件 |
| `veto` | 当它判了否决：拦住它站的那个状态点，否决在那个位置上意味着什么照 [S-25](#s-25-veto) | 凡不是系统自带的件，**且声明的 `power` 是 `veto`、声明的 `position` 是五个「之前」之一**——否则 `malformed`：「之后」的位置本来就没有可拦的，不收这个声明；声明的干预力拦不住任何东西，声明否决等于让它不在时比在时权力更大 |
| `fallback`（替换为指定挂件） | 系统预先声明的另一件挂件在它的位置上替它过这一次 | **只有系统自带的五件**，且**不经声明**：指定挂件由装配预先声明（[S-33](#s-33-不可用与报错两分)）；声明里写 `fallback` 即 `malformed` |

- **这一次用的是求得的值**：声明了 `veto`，这一次求得的干预力不是 `veto`、或求得的位置不是「之前」的那五个时，**这一次照 `skip` 办**——它不在时能做的，不多于它在时能做的（UL-extension-unavailability-policy 注意 ③）。
- **系统自带的五件的声明不带 `unavailability`；带了也不采用**：它们不可用时恒由指定挂件顶上，不看任何声明，租户改不了、也给不了别的（`capability.loop-extension-runner` v2 S-12 那张表「系统自带的」一行）。
- **「此刻不在」按哪一种处置了，必须看得见**：结论记录写明（[S-31](#s-31-三种记录形状)）。

### S-7 name 是身份

**一件拓展件的身份是[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) `{ category: loop_extension, name }`，声明里只带 `name`**（类别由「它是一份拓展件声明」本身给出）。
**`name` 就是那个能力标识的 `name`，不是第二个身份**：声明作为资产被持有时，资产记录上的 `AssetDefinition.capability`（`data.asset-model/v3#S-10`）是身份的唯一家，`name` 必须与 `capability.name` 逐码点相等，不等的记录是 `malformed`——这一条由 [`data.asset-model/v3#S-10`](../../asset-model/v3/contract.md#s-10-八类正文的外壳) 定，对八类正文一律成立。
`name` 的词法取 `data.asset-model/v3` 的 [`CapabilityName`](../../asset-model/v3/contract.md#s-2-能力标识名的词法)（禁 `/`、许 `:`），**相等是逐码点精确相等**。

- **位置、维度、干预力、实现都不是身份**：同一个位置挂的多件是不同的资产，彼此不构成同标识覆盖；
  覆盖只发生在**同一个 name** 的不同实现之间（[PF-002](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)）。
- 本契约里另有三处用这个 `name` 指认「本件」：结论记录的 `extension`（[S-30](#s-30-每件的结论必留)）、
  `inject` 那条提醒的 `source.extension`（[S-22](#s-22-inject)）、`stop{ terminal: cancelled }` 落下的取消请求的发起方（[S-26](#s-26-stop)）。**三处都必须等于本件的 name**。

### S-8 装配进来的实现与外部命令

**`implementation` 二选一**（主线裁定，见 D-060 §S15 S15-b）：

| `kind` | 成员 | 是什么 |
|---|---|---|
| `builtin` | `builtinName` | 实现**随部署装配进来、在进程内执行**；`builtinName` 是装配清单里那件系统自带实现的名字（不透明，逐码点相等）——**它不是能力标识**：这件拓展件的身份是资产记录上的 `AssetDefinition.capability`（`data.asset-model/v3#S-10`），`builtinName` 只指认装配清单里的一份实现（成员名见 D-060 §六 L2）；名字怎么取、怎么在装配清单里解析，不归本契约——归装配清单（[PF-004](../../../../product/PF-004-agent-definition-and-assembly/design.md)）与 `capability.loop-extension-runner` v2 S-6（链从装配清单来）。系统自带的五件都是这一种 |
| `command` | `host`、`dialect`、`event`、`command`；可选 `matcher`、`timeout` | 实现是**一条外部命令**——兼容件，即 Claude Code / Codex 的一条 command hook：`host ∈ { claude_code, codex }` 是它的**来源产品**（成员名 `host` 沿用，指来源产品，不是 runner 与 [UL-cancellation-follows-host](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-cancellation-follows-host--取消跟着宿主走--cancellation-follows-host) 里的「宿主」）；`dialect` 是钉住的那一家方言版本；`event` 是来源产品那一侧的事件名（如 `PreToolUse`）；`command` 是来源产品 handler 条目里的命令原样；`matcher` 原样，缺席即全匹配；`timeout` 是 `data.tool-definition/v3` 的 `Duration`，缺席即那一家那一事件的默认 |

- **运行时只认本契约的统一输入与结论。**`command` 件是一件**在两边翻译**的拓展件：把 `ExtensionInput` 译成来源产品那一事件的原生输入，
  把来源产品的输出译回 `ExtensionOutput`。对状态转移表来说，两种实现**没有任何区别**；对 runner 只有一处：`command` 件的非阻断错误固定按 `ignore` 处置（[S-5](#s-5-报错处置策略) 末条），记录形状照旧。
- **本契约不解释 `event`、`matcher`、`dialect`**：事件映射表、情形筛选、matcher 的求值、定档依据、导入报告、`ask`／`defer` 怎么译，都归 `capability.hooks-import`（D-033 G1–G11 的落点）。
  `event` 是本契约在 D-060 S15-b 所列成员之外保留的：导入一侧靠它从映射表取这一事件的情形筛选与原生输入的造法。
- **`command` 件照样受本契约全部约束**：它交回的结论不合法，按 [S-34](#s-34-不合法的结论按报错处置) 处置；
  来源产品的「允许」（`allow`）只能译成 `observed`（[S-29](#s-29-没有放宽)）。
- 旧写法 `native`、`compat` 作废；`kind`、`host` 闭合，未知取值即 `malformed`。

### S-9 依赖声明与不可用

**`needs` 是一串依赖名**（[依赖声明](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)），
表示取 `data.tool-definition/v3` 的 `DependencyName`；**只有且、只有必需**；至少一项、无重复。
**缺席 = 不需要任何东西**（「不需要」只有缺席这一种写法，不给空数组第二种写法）。

**任何一项不在场，这件拓展件这一次就「不可用」**——这一次这个位置怎么办，按它的不可用处置（[S-6](#s-6-声明的成员与类别)：缺席即 `skip`，视作已卸载）；系统自带的五件由指定挂件顶上（[S-33](#s-33-不可用与报错两分)）。
结论记录记 `skipped: unavailable` 并写明按哪一种处置了（[S-31](#s-31-三种记录形状)）。它依赖的东西回来了，它就又在了。
「它自己起不来」同样是不可用，那一种不经声明，由 runner 判；两者的分界对兼容件（hook 进程）尤其要紧，那是 D-033 的 G4。

### S-10 本版没有 order

**声明里没有次序成员。同一位置上几件的先后 = 装配清单里的顺序**（D-058 Q8 已裁；[装配清单](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)是留痕，所以次序可复现）；
系统自带件与外来件一并按此排。带 `order` 的声明即 `malformed`。

**装配清单有两处末位是定死的**（主线裁定，见 D-060 §S15 S15-e、§S17 S17-d；装配清单的排序义务，由 [`capability.loop-extension-runner` S-6](../../../capabilities/loop-extension-runner/v2/contract.md#s-6-拓展件链从装配清单来) 兑现）：
**放行判断排在 `before_action` 的末位**——它判的必须是任何一件改写之后的最后那一份参数；
**模态转换件排在 `before_persist_message` 的末位**——它给最后那一份消息里的块挂派生表示。
这两处末位同时回答了「放行之后参数不许再变」由谁守（原 G-13）：放行判断之后在同一位置上没有别的件。

### S-40 属性项的推出规则

**`data.asset-model/v3#S-12` 要每一份正文契约给出一条推出规则 `声明(正文) → AttributeDeclaration[]`。拓展件声明的这一条是**（「由正文推出」见 D-060 §块 A A3；逐项取法是主线裁定，见 D-060 §五 K9）：

| `item` | `kind` | `category` | `domain` | `default` | 什么时候有这一条 |
|---|---|---|---|---|---|
| `position` | `setting` | `binding` | `{ kind: "open", schema: { "enum": 与声明同一维度成员的位置 } }`（见表下） | 声明的 `position` | 恒有 |
| `dimension` | `setting` | `binding` | `{ kind: "open", schema: 只收声明那一个维度成员的取值 }`（见表下） | 声明的 `dimension` | 声明带 `dimension` 时（即声明的位置是 `after_model_call` 或 `after_action`）；声明不带时它的取值集合是空集，不推 |
| `power` | `permission` | —（权限项不带类别） | `{ kind: "enum", values: 声明档及其以下 }`：声明 `observe` ⇒ `["observe"]`；`rewrite` ⇒ `["observe", "rewrite"]`；`veto` ⇒ `["observe", "rewrite", "veto"]` | 声明的 `power` | 恒有 |

**不出项的成员**：`name`（身份的镜像）、`onError`（[S-5](#s-5-报错处置策略)）、`unavailability`（[S-6](#s-6-声明的成员与类别)）——这两样是**这一件自己的声明**，不是设置也不是权限，各层不配值；
`needs`、`implementation` 属于实现，不是属性。PF-002 在拓展件权限里列的「谁可以安装它」，本契约读作 `data.asset-model` 为每一类保留的 `usableBy`（主线裁定，见 D-060 §六 N-2；与 D-060 §二 S-U24-7 对连接件「能不能安装」的读法同），与 `disabled` 一样不由本规则产出。

它满足 `data.asset-model/v3#S-12` 的四项要求：

1. **确定**：只读声明本身，同一份声明永远推出同一组；
2. **`item` 互不相同**：三个项名定死；
3. **不产出 `disabled` 与 `usableBy`、不产出治理类的项**：两个保留项名由 `data.asset-model` 统一加上（[S-15](../../asset-model/v3/contract.md#s-15-disabled-是保留项名)、[S-36](../../asset-model/v3/contract.md#s-36-usableby-是保留项名)）；表里的类别只有 `binding`；
4. **每一条都合 `AttributeDeclaration` 的形状**：`binding` 类设置项必带 `default`，取的就是声明值；声明值合取值域由声明本身的表示层校验兑现（[S-37](#s-37-表示层拒绝值)）；权限的 `default` 是 `values` 里的一个。

- **位置与维度两项的取值域**（主线裁定，见 D-060 §七 M4）——按声明位置的**维度成员**分三类，位置只在同类里配：

  | 声明的位置 | `position` 项的 `schema` | `dimension` 项的 `schema` |
  |---|---|---|
  | 九个不带维度的位置之一 | `{"enum": ["attempt_started", "before_persist_message", "after_persist_message", "before_compaction", "after_compaction", "before_model_call", "before_action", "before_terminal", "after_terminal"]}` | 不推 |
  | `after_model_call` | `{"enum": ["after_model_call"]}` | `{"type": "object", "properties": {"ending": {"enum": ["complete_reply", "failure"]}}, "required": ["ending"], "additionalProperties": false}` |
  | `after_action` | `{"enum": ["after_action"]}` | `{"type": "object", "properties": {"scope": {"enum": ["each", "batch"]}}, "required": ["scope"], "additionalProperties": false}` |

  写成内联 schema，取值与 Schema 的 `$defs/LoopPosition`、`$defs/Dimension` 两支逐字相同；那两个 `$defs` 改了，这里跟着改。
  **为什么按维度成员分、不只分「有维度／无维度」两类**：两个带维度的位置各带一种成员（收场、范围），若允许在两者之间改位置，`(after_action, {ending})` 这样的一对仍配得出来——两项各自都在取值域内，配对这一条却不在任一项的取值域里，写面挡不住。按成员分，每一项各自落在取值域内，两项合起来就恒合 [S-2](#s-2-两个维度)。
- **各层配出来的 `(position, dimension)` 因此恒合 [S-2](#s-2-两个维度) 的配对**：一层把位置配成另一类，是配了取值域以外的值，资产治理的写面以 `valueOutOfDomain` 拒（[S-6](#s-6-声明的成员与类别)）；不经写面来的配值（工作区清单、会话创建参数）落在取值域以外，求值收 `invalidInput`（`capability.asset-evaluation` v3 的输入一致性条件 C10），同样到不了 runner。
- **干预力的上限由允许集合兑现**：出厂格给出的整个 `values` 就是声明档及其以下，各层只能在其中挑，求得的值因此不高于声明的值（[S-4](#s-4-干预力三档)；主线裁定，见 D-060 §七 M3）；工作区带来的件一律只观察。
- **「它自己的配置」本版推不出**：PF-002 在拓展件的设置里列了「它自己的配置（比如默认的重试件退避多久再试）」，本版声明里没有承载它的成员，见 [G-18](#十四已知缺口)。

## 五、输入

### S-11 输入的成员

**`ExtensionInput = { position, dimension?, run?, attempt?, subject, earlier, log, environment }`**，不许有其他成员。

| 成员 | 含义 | 有无 |
|---|---|---|
| `position`、`dimension` | 这一次挂的位置与维度（**求得的值**），配对照 [S-2](#s-2-两个维度) | `position` 必有 |
| `run`、`attempt` | 这一次经过所在的运行与执行尝试（[S-12](#s-12-三个引用)） | **在 `before_persist_message` 必不带，其余十个位置必带** |
| `subject` | 按位置判别的主体（[S-14](#s-14-按位置的-subject)） | 必有 |
| `earlier` | 同一次经过里排在前面的件已经落下的结论（[S-13](#s-13-瀑布里的-subject-与-earlier)） | 必有；排第一的件拿到空数组 |
| `log` | 会话日志的只读句柄 | 必有 |
| `environment` | 这一次经过所在会话的**执行环境句柄**（[S-41](#s-41-执行环境句柄)） | **必有，十一个位置都带**：它不交出会话标识，也不交出有没有运行在跑 |

**`before_persist_message` 不带 `run` 与 `attempt`，是因为那一刻看不到有没有运行在跑**
（[PF-014 §5.6](../../../../product/PF-014-inbound-intake-and-queueing/design.md#56-消息落盘之前那一刻看得到什么)、
[PF-012 两个地方等不了](../../../../product/PF-012-agent-loop-and-run/design.md#两个地方等不了)）——
**对模型吐的、工具交回的消息也一样**：那个位置的可见面对每一条消息相同。给它一个运行引用，就等于让它看到了它不该看到的处境。

### S-12 三个引用

| 成员 | 含义 | 表示 | 家 |
|---|---|---|---|
| `run` | 指向一次[运行](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run--运行--run) | `data.call-accounts/v2` 的 `RunId` | `data.call-accounts` |
| `attempt`（及 `AttemptStartedSubject.attempt`） | 那次运行的第几次[执行尝试](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt) | `data.call-accounts/v2` 的 `AttemptId`（整数序号） | `data.call-accounts` |
| `log` | 会话日志的**只读**句柄 | `LogHandle`：照 [`data.identity-values/v1#S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的规则在本契约内定义——非空、首尾不是空白、逐码点相等、**不解析** | 本契约 |

- **运行与执行尝试的标识只有一个家**：`RunId`、`AttemptId` 定在 `data.call-accounts`，本契约只引名字，不另立同义形状；它们的表示、相等、由谁产生与唯一范围以那份契约为准。
- **`attempt` 单独不构成身份**：执行尝试的身份是（哪次运行, 第几次），与同一份输入里的 `run` 合起来才指认一次尝试。
- **`LogHandle` 只能读**：读面由 runner 能力给；拓展件改日志的**唯一**办法是交回结论。它**不是**一份日志快照，拓展件也不得把读到的东西当成「跨等待的记忆」（[S-35](#s-35-跨过一次等待只能带已落日志的东西)）。
- **`LogHandle` 不跨契约引用 `data.identity-values` 的那一个 `$def`**：不透明标识按 S-31 的规则由各契约自己写出形状。
- `LogHandle` 的读面本契约不定，由 `capability.loop-extension-runner` v2 S-9 定；**不得用运行实例的内存身份充当运行标识**。

### S-41 执行环境句柄

**`environment` 是这一次经过所在会话的执行环境句柄**（主线裁定，见 D-060 §八 M38）：一件拓展件要以这个会话的身份做事——系统自带的模态转换件以调用方租户身份读写附件字节，兼容件在这一会话的会话级执行环境里起子进程——就经它取，**不经别的通道**。

| 项 | 内容 |
|---|---|
| **作用域** | **按会话**：它只指这一次经过所在的那个会话，与 `log`（[S-12](#s-12-三个引用)）同一个会话 |
| **经它取得的恰两样** | ① **调用方租户身份**——这个会话持有的那个 `TenantId`（[PF-015 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)）；② **这一会话的执行环境**——[PF-005 §6.3](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存) 的会话级执行环境，作为执行环境那一侧的接口输入（那一侧本版没有契约） |
| **经它取不到的** | **会话标识**（D-060 §六 L9 不变：统一输入里没有会话标识，这只句柄也不交出它）；别的会话、别的租户的任何东西；有没有运行在跑（[S-11](#s-11-输入的成员) 末段的理由对它同样成立，所以它在十一个位置上一样带） |
| **表示** | `EnvironmentHandle`：照 [`data.identity-values/v1#S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的规则在本契约内定义——非空、首尾不是空白、逐码点相等、**不解析**；两只句柄相等不说明任何事，拓展件不得从它的串里读出会话或租户 |

- **它是句柄，不是一份值的快照**：租户身份与执行环境要经它**解析**才拿得到；解析得到什么、何时有效、解析不出时怎样，本契约不定，由 `capability.loop-extension-runner` v2 S-50 定——与 `LogHandle` 的读面归 runner S-9 同一个分法。
- **解析不出不是「没有」**：取不到租户身份不得当成没有租户、取不到执行环境不得回退宿主机（[PF-005 §6.9](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)）；那一件怎样收，归它自己的契约与 runner S-50。
- **它不是跨等待的记忆**（[S-35](#s-35-跨过一次等待只能带已落日志的东西)）：下一次调用拿到的是一只新句柄。

### S-13 瀑布里的 subject 与 earlier

**同一位置上的几件按装配清单的顺序依次过，前一件的输出是后一件的输入。**由此两条：

- **`subject` 是排在前面的件改写之后的那一份**：前一件交回 `rewrite`，后一件拿到的就是改写后的；
  前一件交回 `select_model`，后一件拿到的 `request.target` 就是换过的那一个。
- **`earlier` 是同一次经过里排在前面的每一件的最终结论记录，按瀑布顺序**，含不可用的（`skipped: unavailable`，带着按哪一种处置）与报错的；
  **不含 `ask`**——一件交回 `ask` 时瀑布停在它那里，后面的件还没轮到；它答完之后落下的最终结论才进 `earlier`。
  `earlier` 里每一条的 `position`、`dimension` 与本输入相同。
- **瀑布在第一个否决处到此为止**：一件交回 `veto` 或 `stop`（含报错按 `treat_as_veto` 处置落下的那两种），或它此刻不在而按 `veto` 处置（[S-6](#s-6-声明的成员与类别)），或系统自带件不在、指定挂件顶上的效果是否决（[S-33](#s-33-不可用与报错两分)），后面的件不再被调到。
- **`before_action` 一批动作各自过一遍瀑布**：每个动作一份输入、一个自己的 `earlier`；`subject.batch` 让每一件看得到这一批有谁。

### S-14 按位置的 Subject

本版采用 `data.messages/v4` 与 `data.content-blocks/v3`：请求里的消息、完成回复与消息落盘位置的主体都可记述完整但未解析的坏名调用。`BeforeActionSubject.call` 的共享形状可表达它，**不表示允许派发**：标了 `unparseable` 的调用仍不经过 `before_action`，也不执行；它可在 `batch` 中出现而没有对应一次经过。该运行时守卫及 `ModelRequest.tools`、`ToolDefinitionRef.name` 的 ModelToolName 约束均不改变。

**`Subject` 按位置（与维度）判别，恰十三种**；各种的成员互斥，单独拿到一个也分得出是哪一种，
**它属于哪个位置由外层的 `position`（与 `dimension`）判定，对不上即拒**。「还没落盘」一列决定 `rewrite` 能改什么（[S-23](#s-23-rewrite)）。

| 位置（维度） | `$defs` | 成员 | 还没落盘的那一样 |
|---|---|---|---|
| `attempt_started` | `AttemptStartedSubject` | `attempt: AttemptId`（[S-12](#s-12-三个引用)） | 无 |
| `before_persist_message` | `BeforePersistMessageSubject` | `message: Message`、`producer ∈ user · model · tool · system` | **`message`** |
| `after_persist_message` | `AfterPersistMessageSubject` | `message: Message` | 无 |
| `before_compaction` | `BeforeCompactionSubject` | `plan: CompactionPlan`（[S-16](#s-16-compactionplan)） | 本版不开放改写（[G-15](#十四已知缺口)） |
| `after_compaction` | `AfterCompactionSubject` | `compaction: CompactionMessage` | 无 |
| `before_model_call` | `BeforeModelCallSubject` | `request: ModelRequest`（[S-15](#s-15-modelrequest)） | **`request` 的 `parameters` 与 `messages`** |
| `after_model_call`（`complete_reply`） | `AfterModelCallCompleteReplySubject` | `reply: AssistantMessage`、`usage: Usage`、`cost: Cost` | 无（回复已落盘） |
| `after_model_call`（`failure`） | `AfterModelCallFailureSubject` | `failure: FailureCause`（[S-17](#s-17-failurecause)）、`statusCode?: integer`、`inBand?: true`、`profile: ModelProfileSnapshot`、`dispatches: ModelCallDispatchedRecord[]` | 无 |
| `before_action` | `BeforeActionSubject` | `call: ToolCallBlock`、`definition: ToolDefinitionRef`、`batch: CallId[]` | **`call` 的参数** |
| `after_action`（`each`） | `AfterActionEachSubject` | `callId`、`outcome: ExecutionOutcome`、`result?: ToolResultBlock` | **`result`**（结果落成消息之前的那一关） |
| `after_action`（`batch`） | `AfterActionBatchSubject` | `outcomes: { callId, outcome }[]` | 无 |
| `before_terminal` | `BeforeTerminalSubject` | `proposed: TerminalFact`（[S-18](#s-18-terminalfact)） | 本版不开放改写（D-058 Q9 确认的四样不含它） |
| `after_terminal` | `AfterTerminalSubject` | `terminal: TerminalFact` | 无 |

逐行补充：

- **`producer`**：`user` 人经交付面说的；`model` 模型调用产出的回复；`tool` 工具执行交回的；`system` 其余——系统自己追加的与外部来源捎来的。
  它决定否决之后走哪一路（[S-25](#s-25-veto)）。
- **`statusCode`** 是上游返回的状态码，**有才带、原样带，不翻译**；成因与状态码不互相替代。
  **`inBand: true`** 与它同在时，那个状态码是流已开始之后带内错误的 `code`、不是 HTTP 状态；与 `data.model-response/v3#S-15` 同一个成员、同一个意思（主线裁定，D-060 §八 N-40 ④）。
- **`profile`** 是这次调用打开时绑定的档案快照（`data.model-profile/v3` 的 `ModelProfileSnapshot`）；**`dispatches`** 是这次调用到此为止每一次发出的「已出门」记录（`data.messages/v4` 的 `ModelCallDispatchedRecord`），按发出序号、含失败的这一次，至少一条。
  `profile` 必须原样保留快照中必填的 `adaptation`；`dispatches` 中每条记录同时保留自身与 `profileSnapshot` 内的绑定。共有形状及单条记录的完整绑定相等、模型 ID 对齐约束取自 `data.model-profile/v3#S-27`、`#S-29`、`#S-30` 与 `data.messages/v4#S-49`，本契约不另定义绑定副本。缺任一处必填绑定即表示非法，按 S-37 的 `malformed` 拒绝；消息记录的跨字段相等仍需执行其接收边界纯校验，违反时取 `data.messages/v4#S-39` 的 `malformed`，不能只凭 Schema 通过视为合法。
  **这些值仍来自同一次调用**：组装失败主体的一方保留打开调用时的快照和按发出序号排列的完整记录，不删字段以迎合旧 Schema，不从最新档案或注册状态补值；同一快照/绑定的一致性由输入生产者和 runner 的交接核对承担。它不增加可改写范围，`after_model_call` 的失败主体仍没有可改写成员，重试结论只取原有 `RetryPlan`。
  **这份失败主体是重试件下结论的唯一依据**：重试件只凭这几样下结论，**不现读档案目录**——现读会让回放时的结论与当时不同（主线裁定，见 D-060 §块 C 对账 C-R1）；**也不另读 `data.model-response` 的响应体**——那一串响应体是这份主体背后的事实，不是第二个入口（主线裁定，见 D-060 §五 K36）。
- **`batch`** 是这一批动作的全部 `CallId`，**含本次这一个**、无重复；顺序在本契约里无含义。**参数收齐却解析不了的调用也在 `batch` 里**，但它不是一个动作：不进这一批的动作、不过 `before_action`（收场归工具执行运行时），所以 `batch` 可以含**没有对应一次经过**的 `CallId`（主线裁定，见 D-060 §七 M11）。
  **`definition`** 是运行时为这次调用找到的那份工具定义的**模型面名字**（`data.tool-definition` v3 的 `ModelToolName`，[S-6](../../tool-definition/v3/contract.md#s-6-模型面只有一个条目)），只是引用；它与 `call` 里的工具名是同一套名字，放行判断在模型面名字上比较（主线裁定，见 D-060 §五 K10）。
- **放行判断对一批动作整批求值一次**（`capability.tool-admission` v2 S-21 的 `admit`），而统一输入一次只带一个主体：**整批的输入不经本契约的形状交给它**——
  它是 `builtin` 件，整批的来路是 `capability.tool-admission` 自己的服务面；求得的各项结论**仍按 `callId` 各落进各自那一次经过的结论记录**（[S-30](#s-30-每件的结论必留)），`observed`、`veto`、`ask` 之外不多一种。
  **放行凭据不是结论的成员**：凭据指认的就是那条放行结论记录（`capability.tool-admission` v2 S-16），它怎样随效果交到执行运行时归 `capability.loop-extension-runner`（它的 G-16）。
  这两句是对齐波的推导，已报主线并接受（D-060 §七 N-18）。
- **`after_action`（`each`）**：`result` 是**这一次经过里待落盘的那个结果块**，有才带；带的时候它的 `callId`、`outcome` 必须与外面两个相同。
  什么收场之下没有待落盘的结果块，归工具执行运行时。
- **`after_action`（`batch`）**：每个 `callId` 恰出现一次，与这一批的 `batch` 一致。
- **消息、块、账的形状**取自抬头依赖表里各自的契约，本契约不复述。

### S-15 ModelRequest

**调模型之前那个位置看得到的、已经攒好还没发出去的请求，恰四个成员，成员集合闭合：**

| 成员 | 含义 | 谁能改 |
|---|---|---|
| `target` | 这一次要用的模型——一个路由名（`RouteName`）；它落到哪一行（这一次的有效模型）由 `capability.model-request-runtime` 按层覆盖解析 | **只经 `select_model`**（[S-24](#s-24-select_model)） |
| `parameters` | 这一次要发出的请求参数（`ModelRequestParameters`）：档案参数与此前改写合成的那一份 | `rewrite`（[S-23](#s-23-rewrite)） |
| `messages` | 组装出来、这一次要发的消息 | `rewrite` |
| `tools` | 这一次带给模型的工具条目，每项是那个条目的**模型面名字**（`data.tool-definition` v3 的 `ModelToolName`，[S-6](../../tool-definition/v3/contract.md#s-6-模型面只有一个条目)），不重复——作者写的工具与 MCP 来源的动作一样指认得到（后者没有能力标识） | **不可改** |

**成员名与模型请求运行时收的调用请求逐字相同**（主线裁定，见 D-060 §S16 S16-c）：runner 把合成后的这一份交给 `capability.model-request-runtime` 时不改名；`tools` 的元素两边都是 `ModelToolName`，模型请求运行时的传输适配**不做逆转写**（`data.tool-definition/v3#S-6`）。
`parameters` 交过去之后由那一侧**逐项替换档案参数、合并之后再校验输出上限**；能否借此去掉一项，是 `data.model-profile` 的 G-8。
**`target` 不经 `rewrite` 改**：`select_model` 带着「只能在合法目标集合里」的义务与「留痕在 `route.selectedBy`」，
让 `rewrite` 也能改 `target`，就多出一条绕过这两件事的第二条路。

### S-16 CompactionPlan

**压缩之前那个位置看得到的东西——要交进压缩闭包的那份日志与模型档案。本契约只给不透明形状（一个对象）**，
内容的家在 PF-010 压缩那一侧的能力（[G-1](#十四已知缺口)）。消费者不得解析它的内部。

### S-17 FailureCause

**一次模型调用故障的成因，恰八个，顺序照 PF-013 §5.7；名字由本契约定，`data.model-response` 与 `data.arrival-events` 以 `$ref` 取它。**
取值只按一个维度分：**谁能让它不再发生**。

| token | 成因 | 谁能让它不再发生 | PF-013 §5.4 的类 |
|---|---|---|---|
| `withdrawn` | 已下架：选中的档案已被撤回 | 用户换一个 | 发不出去 |
| `scope_disallowed` | 这个范围不再允许 | 管理员 | 发不出去 |
| `modality_mismatch` | 和会话里的模态对不上 | 用户换一个能读的，或开新会话 | 发不出去 |
| `credential_unavailable` | 凭据不可用：没配，或配了而上游拒绝 | 管理员 | 发不出去 · 重试没用 |
| `request_rejected` | 这次请求本身上游不接受 | agent 改写内容再来 | 重试没用 |
| `upstream_unavailable` | 上游这会儿给不出回复（连不上 · 超时 · 5xx · 限流） | 没人，等 | **策略**（其余全部） |
| `interrupted_mid_reply` | 说到一半断了：首 token 之后的任何故障 | 没人 | 已经开口说话了 |
| `unrecognized` | 没认出来（兜底） | 去看留痕 | — |

- **被用户中断不是故障，不在这八个里**，也不产出任何成因（[S-2](#s-2-两个维度) 最后一条）。
- **上游状态码另外原样带着**（`statusCode`），**不翻译进成因**：成因回答「谁能了结」，状态码回答「上游到底怎么了」。
- **`unrecognized` 只表示「这次确实没认出来」**，不得用来偷懒；它出现时同样要留下可追溯的痕迹。
- **「且[试尽](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-retry-exhaustion--试尽--retry-exhaustion)了」是 `upstream_unavailable` 作为上交成因时的附加条件**（PF-013 §5.7）。在 `after_model_call{failure}` 的输入里，
  它只说**这一次失败是上游那边的事**；试不试尽由挂在那个位置上的拓展件判（[S-27](#s-27-retry)）。
- **模型回复在落盘之前被否决不产出成因**：那次调用照常结束，不是故障（[S-25](#s-25-veto)）；八个成因之外**没有第九个**。

### S-18 TerminalFact

**`TerminalFact = { state, reason?, initiator? }`：一次运行的终态事实。**

- `state` 恰三种：`completed` 完成 · `failed` 失败 · `cancelled` 被取消（[运行终态](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state)）。
  「停下来等人」「已上交」都不是终态。
- `reason` 是原因：**超时、被打断、配额耗尽是原因，不是终态**。缺席只表示「没有给出原因」。取值词表不在本契约（[G-4](#十四已知缺口)）。
- `initiator` 是那条取消请求的发起方，**只随 `cancelled` 出现、且必出现**：被取消之前必有一条取消请求（I-16），发起方是那条请求上的事实。
  它的表示不在本契约（[G-4](#十四已知缺口)）。
- `before_terminal` 的 `proposed` 是**这次要落、还没落**的那个终态；`after_terminal` 的 `terminal` 是**已经落下**的那个。

## 六、结论

### S-19 结论封闭八种

**`ExtensionOutput` 是一个封闭集合，恰八种，按 `kind` 判别。拓展件改变走向的办法只有这几种，每一种都留痕。**

| `kind` | 做什么 | 分组 |
|---|---|---|
| `observed` | 无意见，不改走向 | 不改走向 |
| `inject` | 往日志里追加一条系统提醒（[S-22](#s-22-inject)） | 不改走向 |
| `rewrite` | 决定下一条还没落盘的东西长什么样（[S-23](#s-23-rewrite)） | 改还没落盘的 |
| `select_model` | 改这一次请求的有效模型（[S-24](#s-24-select_model)） | 改还没落盘的 |
| `veto` | 拦住它站的那个状态点（[S-25](#s-25-veto)） | 改走向 |
| `stop` | 让这次运行不再继续：落「被取消」或「失败」（[S-26](#s-26-stop)） | 改走向 |
| `retry` | 这次模型调用不算了结，再发一次（[S-27](#s-27-retry)） | 改走向 |
| `ask` | 落一张卡片，让运行停下来等人（[S-28](#s-28-ask)） | 改走向 |

- **拓展件不指定下一步。**它交出一条结论，结论落日志，状态转移表读到它再算下一步。**没有「跳到哪一步」**，没有「跳过剩下的拓展件」，
  **没有「替模型作答」，没有「替人作答」，没有「放宽」**。
- **环绕式的那一半装不进来**：一件拓展件自己循环调下一层（中间那几次不经过日志），不是本契约能表达的结论。
  「失败了再试」只能经 `retry`，每一次都在日志里。
- 未知 `kind` 即 `malformed`（[S-39](#s-39-判别式与枚举闭合)）。

### S-20 档与结论的合法组合

**按这一次经过求得的干预力判。**✓ 合法，✗ 即 `output_not_allowed_for_power`。

| 档 ＼ 结论 | `observed` | `inject` | `rewrite` | `select_model` | `veto` | `stop` | `retry` | `ask` |
|---|---|---|---|---|---|---|---|---|
| `observe` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `rewrite` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| `veto` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**两张表同时成立**：一条结论要同时过本表与 [S-21](#s-21-位置与结论的合法组合)。

### S-21 位置与结论的合法组合

**按这一次经过的位置（与维度）判。**✓ 合法，✗ 即 `output_not_allowed_at_position`；
`ask` 落在 ⊘ 那两格即更具体的 `ask_at_forbidden_position`。

| 位置（维度） ＼ 结论 | `observed` | `inject` | `rewrite` | `select_model` | `veto` | `stop` | `retry` | `ask` |
|---|---|---|---|---|---|---|---|---|
| `attempt_started` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| `before_persist_message` | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ⊘ |
| `after_persist_message` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| `before_compaction` | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| `after_compaction` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| `before_model_call` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| `after_model_call`（`complete_reply`） | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| `after_model_call`（`failure`） | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| `before_action` | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ |
| `after_action`（`each`） | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ |
| `after_action`（`batch`） | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| `before_terminal` | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| `after_terminal` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ⊘ |

每一列的来由：

| 列 | 为什么是这几格 |
|---|---|
| `rewrite` | 只在 subject 里有**还没落盘的那一样**的位置（[S-14](#s-14-按位置的-subject) 最后一列；D-058 Q9 确认的四样：消息、请求、参数、结果） |
| `select_model` | 只在调模型之前（[PF-013](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)） |
| `veto` | 只在五个「之前」：站在「之后」时那个状态点已经发生了；「尝试开始之后」不算「之前」 |
| `stop` | 除两格外都能：**`before_persist_message` 那一刻看不到有没有运行在跑，没有一个运行可叫停**；**`after_terminal` 运行已落终态，不能再落第二个**（I-11）。这两格由 PF-014 §5.6 与 I-11 推出 |
| `retry` | 只在调模型之后（失败）（[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上)） |
| `ask` | **两个地方等不了**：消息落盘之前（那条消息还没进日志，回放无从回起）、落终态之后（没有东西可停） |
| `inject` | 除 `after_terminal` 外都能：**落终态之后注入的提醒会让待处理消息队列非空，按 I-12 就要起下一次运行**——一件落终态之后的件借此让 agent 接着干活，越出了「之后」的权力 |
| `observed` | 十三格全开；`after_terminal` 上只有它 |

### S-22 inject

**`inject { message: SystemReminderMessage }`：往日志里追加一条系统提醒。**

- **`message.source.kind` 必为 `extension`，且 `message.source.extension` 必等于本件的 name**；
  任一不符即 `inject_source_mismatch`。前一半 Schema 管得到，后一半要对照本件的 name，Schema 管不到。
  **拓展件不得冒充用户、系统或另一件拓展件说话。**
- 给模型看还是只给人看，**由那条提醒里块上的标注定**，不由本结论定。
- **它是一条要落盘的消息**：它同样要经过 `before_persist_message`，那里挂的件照样对它起作用。
  **「同一次经过只跑一轮」与「一条注入的提醒不得无限触发注入」由 runner 兑现**，本契约只点名这条义务。
- 注入之后日志变了：在 `before_model_call` 注入，那个攒好的请求就过期了，要重新组装（但不再回到这个位置）——那是 runner 的义务。
- **`after_terminal` 上不许注入**（`output_not_allowed_at_position`）：那条提醒会让待处理消息队列非空，按 I-12 就要有下一次运行承接它（[S-21](#s-21-位置与结论的合法组合)）。
- 那条提醒的 `id`、`createdAt` 由谁给，见 [G-16](#十四已知缺口)。

### S-23 rewrite

**`rewrite { subject }`：交回本位置那一种 `Subject` 的完整一份，只许改下表「可改」列；其余成员必须与输入逐值相同。**
**不许改 `earlier`、`log`**（它们不在 `subject` 里，本来就交不回来）。

| 位置（维度） | 可改 | 不可改 | 改了之后 |
|---|---|---|---|
| `before_persist_message`（`producer` 不是 `model`） | `message`（它的块与内容） | `producer` | 落盘的是改写后的那条；**原文不进日志**（脱敏、模态转换在这里） |
| `before_persist_message`（`producer` 为 `model`） | **只许挂派生表示**：一些原本没有派生表示的块挂上派生表示与 transcript（`data.content-blocks/v3#S-19`），**且只认系统模态转换件交回的** | `producer`；块的序列、每一块已有的成员、消息的其余成员 | 落盘的是挂好派生表示的那条；模型说的话一个字不动 |
| `before_model_call` | `request.parameters`、`request.messages` | `request.target`（只经 [S-24](#s-24-select_model)）、`request.tools` | 发出去的是改写后的请求；**响应体上的 `parameters` 是实际发出的值**，传输适配为那一家改动的逐项记在 `parameterAdjustments`（`{ name, requested, sent }`），丢掉的项名（含 `extra` 里的）记在 `droppedParameters`——形状归 `data.model-response` |
| `before_action` | `call` 的参数（`ToolCallBlock` 的 `arguments`） | `call` 的其余成员（调用标识、工具名、块标识与标注）、`definition`、`batch` | **执行之前先落一条「生效参数」，执行照生效参数做**；模型那条回复里的原参数一个字不动 |
| `after_action`（`each`） | `result`（卸载判定把大结果换成占位、结果脱敏） | `callId`、`outcome`；`result` 的 `callId`、`outcome` | 落成消息的是改写后的结果块 |

- 交回的 `subject` 不是本位置那一种、或动了不可改的成员，即 `rewrite_touches_immutable`。「与输入逐值相同」要对照输入，Schema 管不到。
- **其余九格没有 `rewrite`**（[S-21](#s-21-位置与结论的合法组合)）：`before_compaction` 与 `before_terminal` 的主体也还没落盘，但它们不在 D-058 Q9 确认的四样里——
  前者的「指定哪些不许压」因此本版没有结论可承载，见 [G-15](#十四已知缺口)。
- **模型产出的消息在落盘之前只开放否决，不开放改写**——用户已经在流式里看过原文（[PF-012 §5.8 否决分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)；挂派生表示不算改写，见 D-060 §S17 S17-c）。
  挂派生表示不改块序列、不改模型说的话，所以不算这里要防的改写；它**只来自系统模态转换件**，外来件交回同样形状的改写即 `rewrite_touches_immutable`。
  「交回的是不是只多了派生表示」要对照输入，「是不是系统模态转换件」要对照装配清单，**两者 Schema 都管不到**，判定由 `capability.loop-extension-runner` v2 S-14 ② 兑现。
- **放行判断判的、人在卡片上点头的、实际执行的，必须是同一份参数**。同一位置上一件改写排在放行判断之后，这条就破了；
  所以放行判断钉在 `before_action` 的末位（[S-10](#s-10-本版没有-order)）。

### S-24 select_model

**`select_model { profile, reason? }`：只在 `before_model_call`；把这一次请求的 `request.target` 换成 `profile`——一个路由名（`data.model-profile` v3 的 `RouteName`，PF-013 rev 12：用哪个模型记的是名字）；这一次的[有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model)就是这个名字按层覆盖落到的那一行，解析归 `capability.model-request-runtime`。**

- **`profile` 必须在这一次的[合法目标集合](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-legal-target-set--合法目标集合--legal-target-set)里**（集合的元素是路由名：这个名字在链上有在册且这个范围允许的胜出行，且胜出行兼容这个会话的模态投影，[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)）。
  **判定归能力**（模型请求那一侧），本契约只写义务；不在集合里，这条结论不生效，按 [S-34](#s-34-不合法的结论按报错处置) 处置。
- **只改这一次，不改选中模型**：选中模型只因用户的切换命令而变。
- **留痕**：这一次的有效模型怎么来的，记在 `data.model-response` 的 `route.selectedBy`（`{ extension: <本件 name> }`）；结论记录本身也在日志里。
- 这是将来 model selector 的口子（D-058 8c）；「会话的默认主模型 + 可选路由模型组」**不在本版**。

### S-25 veto

**`veto { reason }`：只在五个「之前」的位置；拦住它站的那个状态点，让它这一次不发生。**`reason` 必带。

| 位置 | 否决意味着 |
|---|---|
| `before_persist_message` | **这条不落盘**；之后按 `producer` 走（下表） |
| `before_compaction` | **这一趟不许压**：装得下照常走，装不下按「压完还超」——上交给会话，这次运行落失败 |
| `before_model_call` | **这次请求不发，且这次运行落终态「失败」，原因指向那一件、带着 `reason`**。它不是八种成因之一（[S-17](#s-17-failurecause)），不经 `after_model_call`。产品正文只说「这次请求不许发」；**「运行落失败」是本契约的推导**：请求不发，这一步就没有回复可接着走，而重新组装会带着同一份日志再到这个位置、再被同一件拦下——不落终态就是原地打转 |
| `before_action` | **这个动作不许做**；agent 拿到的是「不许做」及其来由（哪一件、依据），**不是执行失败** |
| `before_terminal` | **这次不许收束——接着转**。方向与别处相反 |

**`before_persist_message` 的否决按 `producer` 分三路**（[PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)，没有第四路，尤其没有「落一条替身」）：

| `producer` | 之后 |
|---|---|
| `user`（及外部来源捎来的） | 拒绝这次请求，发送方被告知；用户自己发的那条被拦，必须让他看得出来 |
| `model` | **不落盘，结论落日志，那次调用照常结束**——不是一次调用失败，不产出成因，**不触发 `after_model_call`**（[S-2](#s-2-两个维度)）；它在响应体上的处置（`replyDisposition` 为 `vetoed`）由 `data.model-response` 记。**再来一次是 loop 下一次迭代自然发起的一次新调用**，不经 `retry` |
| `tool` | 这次运行落失败，原因指向那件拓展件 |
| `system` 里系统自己追加的那些 | **不落盘，结论落日志**；此外没有别的收场 |

- **`reason` 不得转述被拦下的内容。**被拦的东西不进日志，而结论记录在日志里——把原文写进 `reason`，就等于把它写进了日志。
- **`before_terminal` 的否决要让 agent 知道为什么接着转**：不然尾巴没变，重算还是「该收尾」。
  怎么把 `reason` 交到 agent 眼前是 runner 的义务；别家 Stop hook 的「阻断 + 理由」译成一条 `veto`，理由就在 `reason` 里。

### S-26 stop

**`stop { terminal?, reason }`：让这次运行不再继续；落哪一种终态由 `terminal` 定，`terminal ∈ { cancelled, failed }`，缺席即 `cancelled`。**`reason` 必带。

| `terminal` | 落什么 | 是什么 |
|---|---|---|
| `cancelled`（缺席即此） | **先落一条取消请求（发起方是本件，[S-7](#s-7-name-是身份)），再落终态「被取消」**，走的是[取消那条路](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号) | 有人（通过这件拓展件）叫停了这次运行——**不是完成，也不是 agent 失败** |
| `failed` | **直接落终态「失败」，原因指向本件并带着 `reason`**；不落取消请求 | 这件判定运行不能再继续：循环守卫 L3「原地打转」（[PF-012 §5.9](../../../../product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯)）；报错按 `treat_as_veto` 在「之后」的位置处置（[S-5](#s-5-报错处置策略)） |

- **没有 `completed`**：拓展件不能替运行宣布完成——「完成」的判据是队列空（[PF-012 这个循环从哪里出去](../../../../product/PF-012-agent-loop-and-run/design.md#这个循环从哪里出去)），不是某一件说了算。
- 终态的原因怎么表示，见 [G-4](#十四已知缺口)；本契约只要求「失败」那一种的原因**指得出是哪一件**。
- 执行动作之后没有否决；别家在那里的「停住」（`continue:false`、批后阻断）只能译成 `stop`。
- **两格没有 `stop`**（[S-21](#s-21-位置与结论的合法组合)）：`before_persist_message`（没有可见的运行）、`after_terminal`（已落终态）。

### S-27 retry

**`retry { plan: { provider, after? } }`：只在 `after_model_call{failure}`；这次调用不算了结，照 `plan` 再发一次。**

- **每一次发出只走一家**：`provider` 是这一次要发给的那一家（`data.model-profile/v3` 的 `ProviderName`）；`after` 是退避多久之后再发（`data.tool-definition/v3` 的 `Duration`），缺席即不等。
- **`retry` 推翻不了事实三类**：成因属于「发不出去」「重试没用」「已经开口说话了」（[S-17](#s-17-failurecause) 最后一列），
  这条结论不生效，按 [S-34](#s-34-不合法的结论按报错处置) 处置。**「一个逻辑回复只发一次」高于任何策略**，没有例外。
- **回复在落盘之前被否决不经过这里**：那次调用照常结束、不触发 `after_model_call`；再来一次是 loop 下一次迭代发起的一次新调用（[S-25](#s-25-veto) 的 `model` 一路）。
- **`provider` 必须是这一次有效模型的档案允许的供应商**；判定归模型请求那一侧的能力，本契约只写义务。
- **「换一个模型」不是 `retry` 能做的**——那是用户的切换命令；`retry` 只换家、只退避。
- 不再试就交回 `observed`：这一层[试尽](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-retry-exhaustion--试尽--retry-exhaustion)，上交。
- **`plan` 只有 `provider` 与 `after`，没有换模型的成员**（主线裁定，见 D-060 §块 C 对账 C-R1）。
- **本契约不承诺自定义重试件会停**：一件外来的重试件可以每次都交回 `retry`；每一次发出都有一条「已出门」记录、都进下一次失败的 `dispatches`，
  所以它在转圈看得见，但**有没有上限、上限是多少，本契约不定**——**这是本契约的推导**：上限是一个策略值，数据契约只保证每一次都留痕；PF-012 的「同一步连续被否决有上限」管的是回复被否决，不是这一种。系统自带的默认重试件怎么试、试几次，归 `capability.model-request-runtime`（[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上)）。

### S-28 ask

**`ask { card: DecisionCardDraft }`：落一张决策卡片，让这次运行停下来等人。**只有 `veto` 档能交回；**`before_persist_message`、`after_terminal` 等不了**。

**`DecisionCardDraft = { explanation, options, about, proposedRewrite? }`**：

| 成员 | 含义 |
|---|---|
| `explanation` | 这一件自己写的说明——**人签的是这段文字**，写不清这张卡片就是废的 |
| `options` | 这一件自己写的选项，**至少一个**；每个 `CardOption = { id, label, effect? }`，`id` 在这张卡片内唯一，`effect` 是出卡那一件自己解释的不透明数据 |
| `about` | `{ position, callId? }`：为哪个位置出的，**必须等于这一次经过的位置**；`callId` 在 `before_action` 与 `after_action{each}` 必带、等于结论记录的 `callId`，其余位置不带 |
| `proposedRewrite` | 可选，**只在 `about.position` 为 `before_action` 时可带**（别处带即 `malformed`）：出卡那一件对这个动作参数的改写提议 `{ arguments }`，`arguments` 与 `data.content-blocks` 的 `ToolCallBlock.arguments` 同形（见下） |

- **`ask` 是唯一一种不终结这一次经过的结论。**卡片落盘，运行进等人；人答完这一批，
  同一件经[回放](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-replay--回放--replay)走到出卡那一处，拿到记下的答复、**这一张不再出**，然后交回它这一次的下一条结论，那一条另落一条结论记录。
  **那一条可以又是一次 `ask`**——答复之后再问一轮（放行判断在自由作答之后就要再问）；只有非 `ask` 的那一条才是这一次经过的**最终结论**。回放怎么走到第几张卡那一处，由 `capability.loop-extension-runner` v2 S-28 兑现。
- **卡片自己写，人照样可以自由作答；「不回答」也是合法答复**。人不想答、答不上来、系统出错，是三件事。
- **它写的选项替不了权限那一关**：选了「允许」，那一件能做的也只是不再拦，放行判断照样要过。
- **`proposedRewrite` 是提议，不是结论**：出卡的这一刻它不改任何东西；人答完之后，那一件经回放交回的最终结论若是 `rewrite`，才照 [S-23](#s-23-rewrite) 生效（先落一条生效参数、再过末位的放行判断）。
  它让「问一下并附改写」的兼容件（从别家搬来的 hook）把改写带过等待：卡片草稿随 `ask` 结论落进日志，回放时那一件从这一格重建它的 `rewrite`——正是 [S-35](#s-35-跨过一次等待只能带已落日志的东西) 要的「只带已落日志的东西」。怎么译、何时据答复交回那条 `rewrite`，归 `capability.hooks-import`（主线裁定，见 D-060 §五 K32）。
- **放行判断的定死选项**（选项 `id` 与含义；第四档写得进去才出现，[PF-008 §5.2](../../../../product/PF-008-human-in-the-loop/design.md#第三档和第四档各有约束)）由 `capability.tool-admission` v2 S-15 定。
  **从别家搬来的 hook 出的卡借那几档的样子，但不带授权含义**：人在那张卡上选哪一档，都只是对那一件的答复，不写会话授权上下文、不写权限设置，样式上与系统拦下来的分得开（[PF-008 §6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同)）；怎么借归 `capability.hooks-import`。本契约的 `options` 只管形状，不另立一套选项常量。
  卡片的 `CardId`、答复形状、陈列与谁能答，归卡片契约（[G-6](#十四已知缺口)）。
- 卡片记录里分得出来源，**拓展件出的要标是哪一件**：由结论记录的 `extension` 给出。

### S-29 没有放宽

**没有任何一种结论能把一次「问一下」变成放行。**放行判断算出「问一下」之后，一件拓展件能做的只有更严——`veto`，或再出一张卡。

- 想让某类动作不再问人，去把那项执行权限配成「自动」；**放行的权威只有那一个出处**。
- **别家 hook 的「允许」只能译成 `observed`**（无意见，不拦也不放），并在导入时明示给装它的人——那是兼容层的义务。

## 七、结论落日志

### S-30 每件的结论必留

**每一件拓展件在每一次经过里都留下一条 `Conclusion`**——跑出了结论的、此刻不在的、报错的，一个不漏；
**`ask` 之后的最终结论另留一条**。

**`Conclusion = { extension, position, dimension?, power, callId?, output?, at, skipped?, unavailability?, error? }`**：

| 成员 | 含义 |
|---|---|
| `extension` | 本件的 name（[S-7](#s-7-name-是身份)） |
| `position`、`dimension` | 这一次经过的位置与维度（求得的值），配对照 [S-2](#s-2-两个维度) |
| `power` | 这一次经过**求得的**干预力 |
| `callId` | 这条结论是为哪一个动作下的：**在 `before_action` 与 `after_action{each}` 必带，其余位置不带** |
| `output` | 交回的结论，或报错时处置策略落下的结论 |
| `at` | 这条结论被记下的时刻（`data.offer-expiry/v1` 的 `Instant`） |
| `skipped`、`unavailability`、`error` | 见 [S-31](#s-31-三种记录形状) |

**记 `power` 与 `callId`、`output` 可以缺席，理由都是「只读日志就能解释」**：

- **`power`**：两张合法组合表按**求得的**干预力判，报错的默认处置也按它取；它随各层配值变化，**不记下来，事后只读日志说不清这一条当时合不合法、为什么这样处置**。
- **`callId`**：一批动作各自过一遍瀑布，同一件在同一位置对三个动作各下一条结论；不带 `callId`，「否了什么」（PF-012 §6.10）读不出来。
- **`output` 可缺席**：见 [S-31](#s-31-三种记录形状) 第二行。

结论记录**不带**运行、尝试与租户身份——那是记录条目壳上的事，不归本契约。

### S-31 三种记录形状

**一条结论记录恰是下面三种之一：**

| 情形 | `output` | `skipped` | `unavailability` | `error` |
|---|---|---|---|---|
| **跑出了结论** | 必有 | 不带 | 不带 | 不带 |
| **不可用，按不可用处置** | **不带** | `unavailable` | **必有**：这一次**实际采用的**那一种处置——`skip`、`veto` 或 `fallback` | 不带 |
| **可用却报错，按策略处置** | 必有：**处置策略实际落下的那个结论**（[S-5](#s-5-报错处置策略)） | `errored` | 不带 | 必有 |

- **不可用那一条不带 `output`：不替一件根本没跑的东西编一个结论**——把「不在」记成 `observed`，与记成否决是同一个错。
  **它带的是 `unavailability`：「此刻不在、按 X 处置」的那个 X**（[UL-extension-unavailability-policy](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy) 注意 ①），效果由它算，不由一条编出来的结论算：
  `skip`——这一次这个位置没有它；`veto`——当它判了否决，按 [S-25](#s-25-veto) 在这个位置上的含义（记下它的只能是求得的干预力为 `veto`、位置是五个「之前」之一的记录，否则 `malformed`）；
  `fallback`——系统自带件由指定挂件顶上，这一次的效果照 [S-33](#s-33-不可用与报错两分) 指向的那张表。
  **记的是实际采用的，不是声明的**：声明了 `veto`、这一次被收窄到另两档的件，记 `skip`（[S-6](#s-6-声明的成员与类别)）。
- **`error` 的取值**：这一次因交回的结论被表示层拒绝而记为报错时，**恰为那个拒绝值 token**（[S-37](#s-37-表示层拒绝值)）；
  其余报错时是一段说明文字。**两种都写进一份只增不改的日志**，所以：**不得带凭据**，**不得转述任何没有落盘的内容**。
- **「此刻不在」与「报错」都必须看得见**：一件按 `skip` 处置的把关件依赖挂了，这一关这一次就没了，唯一的兜底是这条记录；要「不在就不许跑」，注册时把它声明为 `veto`（[S-6](#s-6-声明的成员与类别)）。

### S-32 结论即走向

- **状态转移表只读日志里的结论决定下一步**；拓展件交回的东西**不落成结论记录就不生效**——先落，后算。
- **新的一次尝试里，已有最终结论的件不重跑**，读它的结论；**还停在 `ask` 的那一件**以回放的方式重跑到它停下的那一处。
- 验收办法（[PF-012 §6.9](../../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用)）：
  把一件拓展件上次的结论留在日志里，重算一遍，**算出来的下一步必须与当时相同**。
- 结论记录里的 `output` 是**已经生效的那一个**：被表示层拒绝或判定为不合法的结论**不以原样出现在 `output` 里**（[S-34](#s-34-不合法的结论按报错处置)）。

## 八、不可用、报错与等人

### S-33 不可用与报错两分

| 情形 | 是什么 | 记成什么 | 走向 |
|---|---|---|---|
| **不可用** | 它依赖的东西用不了（[S-9](#s-9-依赖声明与不可用)），或它自己起不来 | `skipped: unavailable` ＋ 实际采用的 `unavailability`，不带 `output` | **按这一件的不可用处置**（下面两段）；`skip` 时瀑布跳过它、**不被当成否决** |
| **可用却报错** | 它在，跑起来出了错 | `skipped: errored` ＋ `error` ＋ 处置落下的 `output` | 按求得的处置策略（[S-5](#s-5-报错处置策略)） |
| **停在等人** | 它交回了 `ask`，卡片悬着 | 一条 `output` 为 `ask` 的结论 | **两者都不是**：它在按规矩等；**不设超时、不到点替人作答** |

「此刻在不在」是事实，不是一次判断的结论；只有真跑了、在跑的过程里出了错，才谈得上「这一次它的结论该怎么算」。

**租户件（凡不是系统自带的）按自己的声明**（[S-6](#s-6-声明的成员与类别)）：缺席即 `skip`，视作已卸载；声明了 `veto` 且这一次求得的干预力是 `veto`、位置是五个「之前」之一，当它判了否决（[S-25](#s-25-veto)），瀑布到此为止（[S-13](#s-13-瀑布里的-subject-与-earlier)），原因写明「此刻不在、按否决处置」、不转述它依赖的任何东西；否则照 `skip` 办。

**系统自带的五件由装配预先声明的指定挂件顶上**（[PF-012 §5.8 系统自带的几件不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)；D-059 U-5）：记录写 `unavailability: fallback`；逐件的效果由 `capability.loop-extension-runner` v2 S-17 的表定，本契约不另写一份、也不转述。
**记录形状不变**：那一件仍记不可用那一种（不带 `output`）；效果从那张表算，不替它编一条结论。租户既不能给自己的件指定一件挂件，也不能改系统自带那几件的指定挂件。

### S-34 不合法的结论按报错处置

**一件拓展件交回的结论不合法，这一次经过就按「可用却报错」处置**，两种来路：

| 来路 | 例子 | 记成什么 |
|---|---|---|
| **表示层拒绝**（[S-37](#s-37-表示层拒绝值)） | 形状不对、档或位置不允许、改了不可改的、提醒冒名 | `skipped: errored`，`error` 恰为那个拒绝值 |
| **判定不成立**（归能力） | `select_model` 不在合法目标集合里；`retry` 撞上事实三类或不被档案允许 | `skipped: errored`，`error` 是说明；这些判定的失败值归 runner 与模型请求那一侧的能力 |

- 两种都**不修补、不降级**：不把一条 `veto` 从 `rewrite` 档件那里「降成」`observed`，不把一个不在集合里的模型「就近换成」一个在的。
- 处置照 [S-5](#s-5-报错处置策略)；**被拒的那条结论不以原样进 `output`**。
- **表示层拒绝与判定不成立是两类结果**，记录里靠 `error` 是不是一个拒绝值 token 分得开（[S-38](#s-38-表示层拒绝不是判定)）。

## 九、写拓展件的人要守的一条

### S-35 跨过一次等待，只能带已落日志的东西

> **等之前记在自己内存里的东西，等回来就没了。**
> **要跨过一次等待带过去的，只能是经那一种「等」拿到、已经落进日志的东西。**

这是拓展件作者**唯一**要额外守的约束，写进作者须知：

- 拓展件用的是 loop 共用的[等待原语](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-wait-primitive--等待原语--wait-primitive)——等模型、等人都是它；
  它自己调模型的那一次，结果与花费照样落日志，**回放时从日志交回**，不花第二遍钱、不再问第二遍模型、不出第二张卡。
- 回放时走到的地方与上次不同，**停住并可见**——那说明拓展件没守住这一条（[UL-replay](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-replay--回放--replay) 注意 ①）。
- **本契约的形状让它守得住**：`ExtensionInput` 里没有「上一次的内存」这一格，`LogHandle` 只读、不是快照，`EnvironmentHandle` 每次调用一只新的（[S-41](#s-41-执行环境句柄)），
  `earlier` 与日志是它唯一能看到的前情。

## 十、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展。
**本表只列跨部署形态会变兑现方式的判定；不在表里不等于不适用。这张表是契约的一部分：装配给的那些，演化到分布式时不会自动成立。**

| 判定 | 单机由谁给 | 分布式必须由协议重新兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **结论先落后算**（[S-32](#s-32-结论即走向)） | runner 与日志在同一进程、同一存储：写完结论再算下一步 | 拓展件在远端时，**它的输出要先在日志那一侧提交成结论记录，才算交回**；回执丢失时这一次按「不可用」或「报错」之一记下，**不得折成 `observed`** | 远端交回的东西没落成记录就被用了，重算得到另一个下一步，`f` 不纯 |
| **瀑布次序与 `earlier` 可见**（[S-13](#s-13-瀑布里的-subject-与-earlier)） | 同一 runner 顺序调用，前一件的记录后一件立刻读得到 | 次序要随装配清单一起传；后一件开始之前，**前一件的结论记录必须对它可见** | 后一件看不到前一件的改写，「放行之后参数不变」这类靠次序守的性质失守 |
| **不可用与报错两分**（[S-33](#s-33-不可用与报错两分)） | 进程内：依赖解析失败与抛出的错误本来就分得开 | 跨进程后「连不上」「超时」「反序列化失败」先是传输层的事，**协议须把它们一律映射到两者之一并可见**；映射到不可用时照这一件的不可用处置办 | 传输故障被读成否决（替没跑的东西编结论）或被读成无意见（把关的那一关静默没了） |
| **表示层校验**（[S-37](#s-37-表示层拒绝值)） | runner 在同一进程里校验一次 | **每个接收边界各自重新校验**；上游已校验过不算数 | 一条冒名的 `inject`、一条越档的 `veto` 在某一跳没被拦下 |
| **只读句柄**（[S-12](#s-12-三个引用)） | 进程内只读视图 | 读面协议要说清读到的日志至少包含本次经过之前的全部条目 | 拓展件据一份陈旧的日志下结论，回放时读到的与第一次不同 |
| **执行环境句柄只及本会话**（[S-41](#s-41-执行环境句柄)） | runner 与会话同在一个进程：按这一次经过所在的会话造它 | 解析请求携带会话与租户身份，**在接收边界重新验证**（`data.identity-values/v1#S-30`）；句柄的串不承载会话标识 | 一件拓展件以别的租户身份读到附件字节，或在别的会话的执行环境里起了子进程 |
| **`ask` 的卡片先于等待落盘**（[S-28](#s-28-ask)） | 同一存储：卡片与「运行在等」一起可见 | 卡片的提交必须先于运行进入等人对外可见 | 运行在等，却没有一张可答的卡片——永远等下去 |
| **name 相等**（[S-7](#s-7-name-是身份)） | 值比较 | **不变**——纯值判定 | — |

## 十一、表示与边界校验

### S-36 规范表示与定义项

- **规范表示**：[`loop-extension.schema.json`](loop-extension.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/loop-extension/v4/loop-extension.schema.json`
- **定义项**（42 项）：`LoopPosition` · `Dimension` · `Power` · `ErrorPolicy` · `UnavailabilityPolicy` · `LoopExtensionDefinition` · `ExtensionImplementation` ·
  `LogHandle` · `EnvironmentHandle` · `FailureCause` · `TerminalFact` · `CompactionPlan` · `ModelRequest` · `ToolDefinitionRef` ·
  十三种 Subject（`AttemptStartedSubject` … `AfterTerminalSubject`）与 `Subject` · `ExtensionInput` ·
  八种结论（`ObservedOutput` … `AskOutput`）与 `ExtensionOutput` · `RetryPlan` · `CardOption` · `DecisionCardDraft` · `Conclusion`。
  消费者 `$ref` 这些定义，**不复制一份同义类型**。
- **根模式不约束任何文档**：本文件是共享定义的登记处。
- **JSON 成员名 camelCase；枚举值 snake_case**；判别成员名 `kind`（结论、实现）。
- **承载共享值时保持其表示义务**：档案快照内的配置值按 `data.model-profile/v3#S-30`、发出记录按 `data.messages/v4#S-37` 严格读取，任意深度重复成员拒绝，数值精度和 JSON 类型无损保留；这不是复制一套 JSON 值定义。重复成员或已声明的单条值约束失败沿 S-37 返回 `malformed`，不修补；Schema 只核解析后的形状，不能证明解析前未丢数据。
- **正反实例**：[`examples.md`](examples.md)，本版的规范工件。

### S-37 表示层拒绝值

**闭合十个。一次拒绝只给一个值：自上而下，第一个命中的那一行。**

| # | 拒绝值 | 什么时候 | Schema 管得到吗 |
|---|---|---|---|
| 1 | `malformed` | **除第 2～5 行（位置、干预力、维度）与第 9、10 行专管的之外的一切形状问题**：不是一个对象；缺必有成员；多了成员（含 `order`、声明顶层的 `matcher`——`matcher` 只在 `command` 实现里有）；成员类型不对；`host`、`onError`、`kind`、`producer`、`skipped`、`FailureCause`、终态、`stop.terminal` 等闭合枚举外的取值；声明的 `onError` 高于 `power`（`observe` 声明 `record` 或 `treat_as_veto`，`rewrite` 声明 `treat_as_veto`）；声明的 `unavailability` 是 `fallback`，或是 `veto` 而声明的 `power` 不是 `veto`、声明的 `position` 不是五个「之前」之一；`proposedRewrite` 出现在 `about.position` 不是 `before_action` 的卡片草稿里；三种记录形状一种也不是（含不可用的记录缺 `unavailability`、别的两种带了它）；不可用的记录 `unavailability` 为 `veto` 而记录的 `power` 不是 `veto` 或位置不是五个「之前」之一；报错记录的 `output` 不是处置策略落得下的那几种（[S-5](#s-5-报错处置策略)）；`callId` 该带不带、不该带带了；输入的 `run`/`attempt` 该带不带、不该带带了；**输入的** subject 与位置对不上；共享快照或发出记录缺少必填适配绑定，或发出记录违反 `data.messages/v4#S-49` 的两处绑定相等/模型 ID 对齐；配置或记录文本违反其原契约的严格读取规则；`about.position` 不等于这一次经过的位置；`about.callId` 与结论记录的 `callId` 不一致 | 跨字段相等、原始文本严格读取及最后两条管不到；其余形状约束管得到 |
| 2 | `position_unknown` | `position`（或 `about.position`）不在十一个里 | 管得到 |
| 3 | `power_unknown` | `power` 不在三档里 | 管得到 |
| 4 | `dimension_missing` | `after_model_call` 或 `after_action` 没带维度 | 管得到 |
| 5 | `dimension_not_allowed` | 别的位置带了维度；或带了不属于该位置的那一种；或维度对象不是表里的任何一种（空对象、两个成员都带、取值不在表里） | 管得到 |
| 6 | `output_not_allowed_for_power` | 结论种类不在求得的干预力允许的那几种里（[S-20](#s-20-档与结论的合法组合)） | 管得到（对照结论记录的 `power`） |
| 7 | `ask_at_forbidden_position` | `ask` 在 `before_persist_message` 或 `after_terminal` | 管得到 |
| 8 | `output_not_allowed_at_position` | 结论种类不在这个位置（维度）允许的那几种里（[S-21](#s-21-位置与结论的合法组合)） | 管得到 |
| 9 | `rewrite_touches_immutable` | `rewrite` 交回的 subject 不是本位置那一种，或动了不可改的成员（[S-23](#s-23-rewrite)） | **前一半管得到，后一半要对照输入** |
| 10 | `inject_source_mismatch` | 提醒的 `source.kind` 不是 `extension`，或 `source.extension` 不等于本件 name（[S-22](#s-22-inject)） | **前一半管得到，后一半要对照 name** |

「管得到」指：这一项能由 Schema 对**单独一份实例**判出来；Schema 只报「不合法」，**给哪一个拒绝值由本表的次序定**。

### S-38 表示层拒绝不是判定

- 表示非法的输入**在进入任何判定之前**被拒绝；这次拒绝**不是**一次判定结果，**不得**被记成「否决」「不在合法目标集合里」一类的结论。
- 反过来，**表示合法不表示任何资格**：Schema 通过只说明形状合规——一条合法的 `select_model` 仍要过合法目标集合那道判定。
- **不修补**：缺的成员不补、错的取值不就近映射、多的成员不忽略后接着用。

### S-39 判别式与枚举闭合

`LoopPosition`、`Dimension` 的两个成员、`Power`、`ErrorPolicy`、`UnavailabilityPolicy`、`FailureCause`、`TerminalFact.state`、`producer`、
`implementation.kind` 与 `host`、`ExtensionOutput.kind`、`stop.terminal`、`skipped` 各是一个闭合枚举。
**遇到未知取值一律拒绝**：不映射到「最接近」的已知值、不当缺省、不忽略该字段继续——
这里每一个未知值都可能是一个更宽的权力（一个没见过的结论种类，读成 `observed` 就是静默放过，读成别的就是凭空授权）。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 表达不了的那部分归谁 |
|---|---|---|
| [S-1](#s-1-十一个位置)、[S-2](#s-2-两个维度) 位置与维度及其配对 | **完全管得到**（三处各一组条件约束） | — |
| [S-4](#s-4-干预力三档)、[S-5](#s-5-报错处置策略) | 管取值域、声明里「策略不高于干预力」、报错记录只落处置策略落得下的那几种 | 求得的值不高于声明的值、缺席取默认、收窄后的策略、「之前」「之后」各落哪一种、`record` 那条提醒的内容——归资产领域的求值与 runner |
| [S-6](#s-6-声明的成员与类别)～[S-10](#s-10-本版没有-order) 声明 | 管成员集合、必有项、没有 `order`、`unavailability` 只收 `skip`／`veto` 且 `veto` 只随声明的 `veto` 档与「之前」位置 | 设置与权限的配值、求值——归资产领域；系统自带件不带 `unavailability`——归装配与 runner |
| [S-40](#s-40-属性项的推出规则) 推出规则 | **管不到**：它是声明到 `AttributeDeclaration[]` 的一个函数 | 各项的 `domain` 写法与本 Schema 的 `$defs` 同步——评审与 `data.asset-model` 一侧的求值 |
| [S-11](#s-11-输入的成员)、[S-14](#s-14-按位置的-subject) 输入与主体 | 管位置与主体变体对应、`run`/`attempt` 的有无 | 共享发出记录的绑定相等/模型 ID 对齐依 messages/v4 S-49 的纯校验；失败主体完整保留原调用的快照和按序记录、`earlier` 的位置一致、`batch` 含本次、`result` 与外层一致——归输入生产者与 runner |
| [S-20](#s-20-档与结论的合法组合)、[S-21](#s-21-位置与结论的合法组合) 两张表 | **完全管得到**，在 `Conclusion` 的条件约束里；逐格对照在 [`examples.md` 末节](examples.md#9-两张合法组合表与-schema-逐格对照) | 前提是结论记录里的 `power` 是**求得的**值——那一半归 runner |
| [S-22](#s-22-inject)、[S-23](#s-23-rewrite) | 管 `source.kind`、管 subject 变体 | 本件 name 相等、逐值未动——要对照，归 runner |
| [S-24](#s-24-select_model)、[S-27](#s-27-retry) | 管形状与位置 | 合法目标集合、事实三类、档案允许的供应商——**判定**，归能力 |
| [S-30](#s-30-每件的结论必留)、[S-31](#s-31-三种记录形状) | 管三种记录互斥、`callId` 的有无、不可用记录必带 `unavailability` 且 `veto` 只随 `veto` 档与「之前」位置 | 「每件必留」「`error` 恰为拒绝值」「不转述未落盘内容」「`unavailability` 是实际采用的那一种」「`fallback` 只出自系统自带件」——归 runner 与静态检查 |
| [S-32](#s-32-结论即走向)～[S-35](#s-35-跨过一次等待只能带已落日志的东西) | **管不到** | 行为，归 runner；证据义务见[验证入口](../verification.md) |

## 十二、性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 位置恰十一个、维度恰两个，维度不是位置 | 不变量 | PF-012 §5.8 | 闭合枚举 ＋ 配对约束（S-1、S-2） | 出现第十二个位置，或一件没声明维度的件在失败时被调到 |
| P-2 | 结论封闭八种；拓展件不能不留痕地改变下一步 | 安全 | PF-012 §5.8、§6.9 | 闭合枚举（S-19）＋ 先落后算（S-32，runner） | 重算得到与当时不同的下一步 |
| P-3 | 结论不越档、不越位 | 安全 | PF-012 §5.8、PF-000 §5.3 | 两张表（S-20、S-21）＋ 不合法即报错（S-34） | 一件 `rewrite` 档件拦下了一个动作；`after_action` 上出现一条否决 |
| P-4 | 没有放宽 | 安全 | PF-012 §5.8 没有放宽 | S-19、S-29 ＋ 兼容层把 `allow` 译成 `observed` | 放行判断说「问一下」，动作却没问就做了 |
| P-5 | 每件每次经过都留一条结论；不可用不编结论，但写明按哪一种处置 | 不变量 | PF-012 §6.10、§5.8 可插拔 | S-30、S-31 ＋ runner | 排查的人分不出「判定说不用」「判定没跑成」「那一件此刻不在」，或分不出这一次不在时是放过了还是拦住了 |
| P-14 | 不可用时能做的不多于可用时：按否决处置只随求得的 `veto` 档与「之前」位置 | 安全 | PF-012 §5.8 可插拔、UL-extension-unavailability-policy 注意 ③ | S-6、S-31（Schema）＋ runner 按求得的值处置 | 一件被收窄到只观察的件，依赖挂了却拦下了一个动作 |
| P-6 | `rewrite` 只动还没落盘的那一样的可改成员 | 安全 | PF-012 §5.8 能做什么、D-058 Q9 | S-23 ＋ runner 对照输入 | 日志里写的是一个动作、实际跑的是另一个，且没有任何东西报错 |
| P-7 | 注入的提醒只能以本件的名义说话 | 安全 | PF-008 §6.8（标出是哪一件）、D-058 Q3 | S-22 | 一条提醒看起来是用户或系统说的，实际出自一件拓展件 |
| P-8 | 跨等待只带已落日志的东西 | 安全 | PF-012 写拓展件的人要守的一条 | 作者须知（S-35）＋ 回放发现偏差即停（runner） | 回放时一件拓展件出了第二张卡、问了第二遍模型 |
| P-9 | `select_model` 只改这一次、只在合法目标里 | 安全 | PF-013 §4、§5.10 | S-24 ＋ 能力判定 ＋ `route.selectedBy` 留痕 | 选中模型被一件拓展件改掉；或切到一个收不下会话里图块的模型 |
| P-10 | `retry` 推翻不了事实三类 | 安全 | PF-013 §5.4、§6.12 | S-27 ＋ 能力判定 | 已经吐了半句话之后又发了一遍 |
| P-11 | 被拦下的内容不进日志 | 安全 | PF-012 §5.8 消息落盘之前、PF-014 §5.6 | S-25、S-31 的「不转述」 | 被脱敏或被拦的原文出现在一条结论的 `reason` 或 `error` 里 |
| P-12 | 落终态之后的件不能让 agent 接着干活 | 安全 | PF-012 I-11、I-12；D-060 S7-e | S-21 的 `after_terminal` 一行 ＋ S-5 的「`after_terminal` 上三种都落 `observed`」 | 一次运行落终态之后，一件拓展件的结论让下一次运行开了起来 |
| P-13 | 报错不给件多出它本没有的权力 | 安全 | PF-012 §5.8 干预力三档；D-060 S7-b | S-5 的「策略不高于干预力」＋ 报错记录只落四种（Schema）＋ runner 按求得的值处置 | 一件只观察的件报错之后，agent 的上下文里多了一条提醒；一件可改写件报错之后，运行被停下 |

**进展性质：本契约不拥有任何进展性质**——「等人最终会被答」「瀑布最终走完」都不是数据的性质；
等人没有上限（PF-008 §6.1），「同一位置同一次经过只跑一轮」这一类有界性归 runner 的行为模型；
「回复一再被否决、loop 一再发新调用」的有界性由 `capability.loop-extension-runner` v2 S-30 收住（原 G-17）。

## 十三、缺席与恢复

**本契约没有操作，因此没有提交点与事件。**下面写的是值层面的缺席怎么收：

| 缺席的是什么 | 收到哪 | 谁收口 |
|---|---|---|
| 声明里缺 `name`、`position`、`power`、`implementation` | 拒绝（`malformed`）；它不是一件拓展件 | 资产领域与装配 |
| 声明里缺 `onError` | 按**求得的**干预力取默认（S-5）——**这是产品正文给的默认，不是本契约填的** | runner |
| 声明里缺 `needs` | 不需要任何东西 | — |
| 声明里缺 `unavailability` | 读作 `skip`（[S-6](#s-6-声明的成员与类别)）——**这是产品正文给的默认**（租户挂上的默认跳过），不是本契约填的 | runner |
| 那两个位置上缺维度 | 拒绝（`dimension_missing`）；**不读作「两种都管」** | 声明方 |
| 结论记录缺 `output` 而不是 `skipped: unavailable` | 拒绝（`malformed`） | runner |
| `select_model` 缺 `reason`、`retry` 缺 `after`、`TerminalFact` 缺 `reason` | 合法：分别是「没说理由」「不等」「没给原因」 | — |
| `veto`、`stop` 缺 `reason` | 拒绝（`malformed`）——否决与停下运行**必须说原因** | 拓展件 |
| `stop` 缺 `terminal` | 读作 `cancelled`（S-26）——**这是主线裁定给的缺省（D-060 §S7 S7-a），不是本契约填的** | runner |
| 拓展件依赖的东西此刻不在 | 不可用，记 `skipped: unavailable` 与实际采用的处置；**只有按 `veto` 处置时才是否决**，`skip` 不是否决 | runner |
| 输入缺 `environment` | 拒绝（`malformed`）；**不从运行实例、进程上下文或「当前会话」补** | runner |
| 执行环境句柄此刻解析不出租户身份或执行环境 | **不是「没有租户」「没有执行环境」**，也不回退宿主机（[S-41](#s-41-执行环境句柄)）；怎样收归 runner S-50 与那一件自己的契约 | runner、那一件 |
| 运行时协程被回收，一件拓展件停在 `ask` | 卡片与结论都在日志里；下一次尝试回放到出卡处，拿记下的答复 | runner（回放） |
| 系统重启 | 一切前情只来自日志；已有最终结论的件不重跑 | runner |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

## 十四、已知缺口

**缺口不填默认值。**消费者读到这里应当知道哪里在等裁决，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | owner |
|---|---|---|---|
| **G-1** | `CompactionPlan` 的内容形状 | 要在压缩之前读出「这一趟要交进闭包的是什么」的拓展件 | PF-010 压缩那一侧的能力 |
| G-2 | **已关闭**（主线裁定，见 D-060 §S16 S16-c）：`ModelRequest` 恰四个成员，第四个 `tools` 不可改，元素是模型面名字 | — | 答案在 [S-15](#s-15-modelrequest) |
| G-3 | **已关闭**：`LogHandle` 读得到什么、读不到怎么办，由 `capability.loop-extension-runner` v2 S-9 定；运行与尝试标识的表示归 `data.call-accounts` | — | 答案在 `capability.loop-extension-runner` v2 S-9 |
| **G-4** | `TerminalFact.reason` 的取值词表；`initiator` 的表示（尤其「发起方是某件拓展件」怎么写） | 按原因分流的 `after_terminal` 件；[S-26](#s-26-stop) 的发起方落点 | 主线（Run 相关条目与取消请求的形状，PF-012 §6.16 / PF-000） |
| **G-5** | `DependencyName` 的名字空间；[依赖声明](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)词条只写了工具与技能 | 拓展件的 `needs` 能写哪些名字 | 词表 owner ＋ `data.tool-definition` |
| **G-6** | `CardOption.effect` 的含义、卡片落盘后的 `CardId` 与答复形状（放行判断那四档定死的选项已由 `capability.tool-admission` v2 S-15 定，[S-28](#s-28-ask)） | 拓展件据答复下最终结论 | PF-008 卡片契约（未起草） |
| G-7 | **已关闭**（主线裁定，见 D-060 §五 K9）：`onError` 是这一件自己的声明，不是设置也不是权限，推出规则不出项、各层不配值；策略由拓展点协议按类型给出（[PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略)），与 `unavailability` 同一种东西（[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#不可用处置是这一件自己的声明)） | — | 答案在 [S-5](#s-5-报错处置策略)、[S-40](#s-40-属性项的推出规则) |
| G-8 | **已关闭**（主线裁定，见 D-060 §S7 S7-c）：`ignore` 对 agent 没有任何效果，`record` 另注入一条「本件这一次没跑成」 | — | 答案在 [S-5](#s-5-报错处置策略) |
| G-9 | **已关闭**（主线裁定，见 D-060 §S7 S7-b）：`treat_as_veto` 在「之后」的位置 ≡ `stop{ terminal: failed }` | — | 答案在 [S-5](#s-5-报错处置策略)、[S-26](#s-26-stop) |
| G-10 | **已关闭**（主线裁定，见 D-060 §S7 S7-a）：`stop` 带 `terminal`，循环守卫 L3 用 `failed` | — | 答案在 [S-26](#s-26-stop)、[消费者表](#消费者) |
| G-11 | **已关闭**（主线裁定，见 D-060 §S7 S7-d）：被用户中断的调用不触发 `after_model_call` | — | 答案在 [S-2](#s-2-两个维度) |
| G-12 | **已关闭**（产品正文 [PF-012 §5.8 否决分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)，rev 11 起）：回复在落盘之前被否决不是一次调用失败，不产出成因、没有第九个成因 | — | 答案在 [S-17](#s-17-failurecause)、[S-25](#s-25-veto) |
| G-13 | **已关闭**（主线裁定，见 D-060 §S15 S15-e）：放行判断钉在 `before_action` 的末位，由装配清单的排序义务守 | — | 答案在 [S-10](#s-10-本版没有-order)、`capability.loop-extension-runner` v2 S-6 |
| G-14 | **已关闭**（产品正文 [PF-012 §5.8 否决分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)）：系统自己追加的消息在落盘之前被否决，不落盘、结论落日志，此外没有别的收场 | — | 答案在 [S-25](#s-25-veto) |
| **G-15** | 压缩之前「指定哪些不许压」本版没有结论可承载（`rewrite` 不开放给 `CompactionPlan`，D-058 Q9 确认的四样不含它） | 想在压缩之前保护某些内容的拓展件 | 主线 ＋ PF-010 |
| **G-16** | `inject` 交回的 `SystemReminderMessage` 里 `id`、`createdAt` 由谁给（拓展件保证不了会话内唯一）。`data.messages/v4#S-3` 已定「消息标识由写进日志的那一方在落盘之前铸出」，**拓展件交回的那个 `id` 是被换掉、被拒还是必须缺席**仍没有答案；runner 一侧是它的 G-5 | 写 `inject` 的拓展件；runner 落盘 | 主线（与 `data.messages` 对齐） |
| G-17 | **已关闭**（产品正文 [PF-012 §5.8 否决分三路](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)「同一步里连续被否决有上限（一项运行时设置），到了上限这个 Run 落失败」；缘起 D-060 §块 C 对账 C-R3） | — | 兑现在 `capability.loop-extension-runner` v2 S-30 |
| **G-18** | **拓展件「它自己的配置」**：[PF-002 §4 Loop Extension](../../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension) 在设置里列了「它自己的配置（比如默认的重试件退避多久再试）」，本版声明没有承载它的成员，[S-40](#s-40-属性项的推出规则) 推不出这类项 | 要让各层配自己参数的拓展件（含系统自带的重试件的退避） | **主线**（规格层；闭合条件：给声明加一个自定义设置项的成员并补进推出规则，或确认本版拓展件不带自定义设置、PF-002 那一句只指系统自带件的能力契约自带的设置） |

**两件像缺口、其实不是的，记在这里免得被当成待裁：**

- **兼容层的事件映射、定档依据、`ask`/`defer` 的译法**不是本契约的缺口——它们是 D-033 推迟的 G1–G11，归兼容层契约。
- **同一位置的次序**不是缺口：D-058 Q8 已裁，只按装配清单；两处末位见 [S-10](#s-10-本版没有-order)。

## 十五、明确不承诺

- **不定义任何操作**：谁调拓展件、瀑布怎么走、回放怎么跑、结论怎么落、报错策略怎么执行、同一位置同一次经过只跑一轮——归 `capability.loop-extension-runner`。
- **不定义兼容层**：事件映射表、编解码、导入报告、matcher、定档依据、来源产品的版本——归 D-033 之下的兼容层。
- **不定义决策卡片**：`CardId`、答复、陈列、谁能答、放行判断的定死选项——归 PF-008 卡片契约。
- **不定义资产的持有、配值与求值**：本契约只标声明里各项的类别，并要求求得的干预力不高于声明的值。
- **不定义合法目标集合怎么算、事实三类怎么判、试尽怎么判**——归模型请求那一侧的能力。
- **不定义消息、块、账、档案、工具定义、响应体的形状**——只引它们的 `$defs`。
- **不定义记录条目壳**（运行、尝试、租户身份怎么挂在条目上）。
- **不定义「管哪些情形」里维度之外的任何筛选**（S-3）。
- **不承诺任何已执行的验证**：证据义务与状态在[验证入口](../verification.md)。

## 十六、版本差异与规范工件

**本版由已接受并冻结的 v3 演进为 v4 候选**。S-1～S-41 全部继承，包含 S-41 执行环境句柄；不增加位置、失败枚举、结论、操作或设置政策。精确采用 `data.model-profile/v3` 与 `data.messages/v4`，其余依赖版本保持 v3 原采用关系。`AfterModelCallFailureSubject.profile` 和 `dispatches` 可完整承载调用已绑定的适配信息，不在本契约新增 `ModelAdaptationBinding` 同义定义。

S-14、S-36～S-37 明确沿共有数据的必填字段、严格/无损读取和单条发出记录纯校验；不改变 `Subject` 的选择、`rewrite` 的可改写成员、替换件的行为、干预力、结论优先次序或 runner 的控制顺序。v3 的 core 修正保持：请求消息与完整回复可以记录完整未解析的坏名调用，但不授予动作派发资格，工具名字词法仍严格。

这是一项嵌套表示的版本演进：没有绑定的 v3 失败输入不是 v4 失败输入，不能删除新字段或补默认值换取通过。`capability.loop-extension-runner/v3` 与 `capability.model-request-runtime/v3` 的采用仍为候选，须一起核对输入生产、日志回读及默认重试路径；其他消费者不自动升级。本包不制定历史存储转换政策。v2/v3 冻结资源保持原样；实际验证与消费影响见[版本外验证入口](../verification.md#v4-模型适配绑定闭包)。

**本版的规范工件**：本文件、[`loop-extension.schema.json`](loop-extension.schema.json)、[`examples.md`](examples.md)。

**不建 `formal/`。**两张合法组合表是有限结构（13 行 × 8 列与 3 行 × 8 列），在 Schema 的条件约束里逐格写死，
并在 [`examples.md` 末节](examples.md#9-两张合法组合表与-schema-逐格对照)逐格对照；
再写一份 Alloy 只会把同两张表重述一遍，**它没有表以外可搜的空间**，不产生新证据。
本契约没有状态转移；「回放一致」「先落后算」「同一次经过只跑一轮」是行为性质，
**它们的形式模型归 `capability.loop-extension-runner` 的行为模型**，不在本包建平行模型。
**这不是把义务省掉**：已触发的义务在[验证入口](../verification.md)逐条登记，状态「未开始」。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
[已知缺口](#十四已知缺口)里仍开着的任一项被裁决后，凡改变本契约语义或表示的（G-15 尤其可能改变两张表），都发布下一版本；
推荐版本不自动升级消费者。**接受之前**，候选可以原地修订。 本次修改影响与验证运行放执行工作树 `tmp/<task>/`，不在验证正文追加流水。
