# loop-extension 纯主体判断公开面增补

状态：**candidate，未采用、未实施验证**。`v7` 是本节点设计修订，不是新增 LC 契约版本。本稿只补既有 `packages/core/loop-extension` 的公共纯构件；契约仍为 `omne-harness-lite-design-2026-09-15 · data.loop-extension · v6`（LC6），不改其十个拒绝值、统一输入要求或运行许可。新增 binding **0 条**；本轮仅此候选正文，现行 README、bindings 与冻结设计不改。

## 输入与问题

LC6 的接受及 [v6 提供者迁移](v6-design.md) 的采用见 [D-100](../../../../record/decisions/model-runtime-current-generation-adoption/decision.md)。[D-106](../../../../record/decisions/runner-current-pure-provider-adoption/decision.md) 已采用 runner 的 `composeEffect(initial: PositionedSubject, conclusions)`：它只组合显式主体与结论，不需要、也不得伪造一次执行。

源码基线 `19bb829ab0c97ddf00d5032676b16e45152bcbad`。实查 runner 候选提交 `885ac84f` 的 `src/effect.ts`：其 `admittedInput` 为调用现有 `judgeConclusion(value, {input, extensionName})`，补入固定 log/environment/run/attempt。这个壳不能证明真实执行；直接删壳又缺少公开的主体／结论关联判断。所需修复是暴露现有纯判断的必要输入边界，复用同一内核，不建立新运行抽象。

| 精确输入 | SHA256 |
| --- | --- |
| [LC6 contract](../../../../spec/data/loop-extension/v6/contract.md) | `d5cf4e24abc0a72ffe27072b8239489812382e3b94f2ee891ca9264338a1954a` |
| [LC6 Schema](../../../../spec/data/loop-extension/v6/loop-extension.schema.json) | `5c74a3d0827449f3eb32b0c4468c410c78ef9714026bfb0801d4c6e361858727` |
| 本节点 v6-design.md | `bbd3af584bb82605da16c49c5a1ecb6c83d5c2469d88cb02ea4375de3374ffb2` |
| [runner v5 当前投影](../../agent-loop/loop-extension-runner/v5-current-design.md) | `1a85cfa993a42dc721e39a68ce1492e474d1be96c25067a16561fa1975db7f13` |
| `packages/core/loop-extension/src/judge.ts` | `fcc868bb6bff7738dba2f8f86b7d24800c406fa19af7c81c173911cde20b590a` |
| 同包 `src/rewrite.ts` | `52feb53dd0299d2acb12a611bac290b40104f22ee0ca679bfe1177e2238fe8a9` |
| 同包 `src/types.ts` | `175b286f3940ef67592b0d1996a7864aef43d1ab16891364c489b76da25c3176` |
| 同包 `src/values.ts` | `a77f53d012ca08245ed5f30795ee0cdef95566742c77b87be8b6eca8bacb0f17` |
| runner `885ac84f:packages/agent-loop/loop-extension-runner/src/effect.ts` | `0445e89aadae9313798d81dc4358acfd6ffbbcb700d51b4620c6347deeaa0c7d` |

产品依据及精确 Schema 闭包沿 LC6、D-100 和原节点，不升级资产、消息、模型档案或运行契约。Cordis 仍沿 D-025 的 4.0.4，本节点没有 Cordis API/basis 依赖。

## 候选最小公开面

以下名字、类型及签名均为**候选**，由包 root 导出；不新增子路径、版本兼容入口或服务。

```ts
function judgePositionedSubject(value: unknown): Judgment<PositionedSubject>

interface ConclusionSubjectInputs {
  readonly positionedSubject: PositionedSubject
  readonly extensionName: CapabilityName
}
function judgeConclusionForSubject(
  value: unknown,
  inputs: ConclusionSubjectInputs,
): Judgment<Conclusion>
```

`PositionedSubject`、`CapabilityName`、`Judgment` 复用现有公共类型，不另立 Schema 或运行身份。实现仍运行时检查辅助参数；TS 类型不作为已校验凭证。成功值经已有无损快照、表示恢复和冻结路径成为分离值；无副作用，无 I/O、随机、时钟、隐式存储或目录查询。

`judgePositionedSubject` 只接闭合 `{position, dimension?, subject}`，不接受 run/attempt/log/environment/earlier 或额外标记；这些字段出现时为 `malformed`，不先删字段再放行。它只复用本次源码基线已执行的位置、维度、所选主体表示和 failure dispatch/retry 关联检查。成功不承诺全部 S-14 关联已核实：batch 含本次调用、result 与外层 callId/outcome 一致等仍归输入生产者及 runner 的真实执行/生产者验收，本次不移入 core。成功不等于已存在一次 Run，不等于可派发、历史完整或来源可信；failure 主体可独立作纯值判定，不创建 noRun failure 执行路径。

`judgeConclusionForSubject` 的 `inputs` 恰含 `positionedSubject` 与 `extensionName`。结论自身非法按 LC6 拒绝；调用者提供的辅助对象缺席、额外键、非法名字、非法主体或与合法结论不配对，沿现有辅助前提的 **TypeError** 边界。它不是第十一个表示拒绝值。`modelCallId` 与有效失败主体的实际调用不一致仍为 `malformed`，不可改为 TypeError。内部自相矛盾／坏 Schema 仍直接暴露程序错误，不吞成业务拒绝。

## 责任与共享实现

| 契约责任 | 候选构件／现有位置 | 拟兑现方式 | 证据或缺口 |
| --- | --- | --- | --- |
| LC6 S-2/S-14/S-36～S-39 | `judgePositionedSubject`，`judge.ts` 的 selector、`schema.ts` 现有固定定义 | 复用 `isPosition`、维度规则、`subjectDefinition` 和十三个主体的既有判定；普通形状错误先于具名选择器错误，不复制位置表或主体 Schema | SV-1/2；只是值判断，无运行许可 |
| S-14/S-42/S-43 | 同一主体校验内核 | failure 仅遍历规范槽位，复用 `judgeValue` 的共享 MS6 dispatch 校验、同 call 与 retryConclusions 关联；上述既有 failure 身份冲突拒绝，不遍历任意配置 JSON 的同名键，不扩大到其余 S-14 外部关联责任 | SV-2；完整前缀、遗漏/次序的外部事实仍由生产者及 runner 核 |
| S-23/S-30/S-37 | `judgeConclusionForSubject` 和原 `judgeConclusion` | 两入口共享 Conclusion 自身判断、辅助参数处理后的对应性检查及 `rewriteChangesImmutable`；不将该负谓词直接导出为完整判断 | SV-3/4；系统转换器资格仍归 runner |
| S-11/S-12/S-41 | 原 `judgeInput`、`judgeConclusion` | 原接口保留完整 ExtensionInput 判断；只有完整输入通过后提取真实 position/dimension/subject 给共享内核，不能改为只验证投影 | SV-4；真实来源仍为调用者前提 |
| S-36 原数表示 | `values.ts` 的主体恢复与原 `conclusionFromRepresentation` | 抽出受内部校验前提约束的主体恢复供两个入口共用；不靠断言、裸 `JsonObject` 或 shallow readonly 承诺已验证 | SV-5 |

主体投影检查只取已经提供的真实字段。实现可从现有 `ExtensionInput` 规则提取位置/维度/主体判断到共享私有函数，但不得调用 `judgeInput` 并为其缺少的执行成员造值。`subjectDefinition` 仍为包内选择器，只有选择器通过后才使用，不能以它对非法维度的默认分支代替维度判断。普通形状预检复用既有 Schema 定义；不得抄出第二套十三主体，亦不得修改公开 Schema。本次仅抽取现有 core 已执行的检查；不新增 batch 含本次调用、原主体 result 与外层 callId/outcome 一致等 S-14 判断，也不把缺少这些检查重述为本次 core 实现缺陷。这些要求并未撤销，继续由输入生产者及 runner 的真实执行验收承接。共享 immutable 对改写结果已有的 callId/outcome 检查仍原样保留；不得把原始主体的外部前提与改写结果的既有检查混为一项。

### 两个 Conclusion 入口的共同次序

抽取同一个流水线，禁止两个入口各写一份条件链：

1. 严格捕获候选记录，做原普通形状预检及候选自身 `about.position/callId` 一致性。能安全取得合法的实际 extensionName 时，核记录名字与其一致；这一现有 `malformed` 分支不能被后来的辅助参数 TypeError 覆盖。读取辅助对象不得触发 accessor。
2. 执行现有 `judgeValue('Conclusion', record)` 的 LC6 S-37 具名拒绝次序；已存在的候选自身拒绝优先于辅助参数错误。保留普通形状、position、power、维度、档/位置允许、改写形状、inject 来源的判断，不复制常量或 Schema。
3. 只有前述候选判断通过，才校验完整辅助对象。原入口仍调用完整 `judgeInput(inputs.input)`；新入口调用 `judgePositionedSubject(inputs.positionedSubject)`。未通过即相同类别的辅助参数 TypeError，不能把无效辅助输入变成一条已接受结论。
4. 对已验证主体，共用原关联顺序：失败调用的 modelCallId 不等为 `malformed`；position/dimension 与本次主体或工具 callId 不配对为 TypeError；合法改写触及不可改值为 `rewrite_touches_immutable`；成功经同一个 Conclusion 表示恢复返回。

这保留现有 `judgeConclusion` 的观察顺序及辅助边界。S-37 的十项优先级仍是语义权威；多错误差分若发现现有路径与规范冲突，须附具体反例交主线，不由本增补默许冲突或静默改变旧入口行为。`extensionName` 必须由真正调用者给出；纯 composeEffect 只验证结论自带 extension 的词法和内部一致，不声称从该字符串证明实际贡献者身份。

### 位置、身份和不可改值的边界

- 主体是某个位置与维度下的那一种，不是 `Subject` 联合中任意一种；缺维度、错维度按既有四／五行，输入主体错配为 `malformed`，改写输出主体错配仍为第九行。
- 工具 `callId` 从 before_action 的 `subject.call.callId` 或 after_action/each 的 `subject.callId` 取得；其他位置没有工具 callId。failure 的 `modelCallId` 从非空且已校验的 dispatches 所指唯一模型调用取得，二者不互换、不默认。
- immutable 比较复用现有 `rewrite.ts`：只允许 S-23 指定位置的可改成员；模型产出消息的受限媒体派生规则维持。精确数、对象键与数组次序复用既有相等实现。
- 值能证明可见身份一致，不能证明日志完整、同一会话/前缀、真实执行者、系统转换器资格或外部许可。系统转换器、工具放行、模型再次发送与真实 ExtensionInput 准入仍由原 owner 给证据；新函数不签发证明 token。

## runner 的直接消费

`composeEffect` 删除 `admittedInput` 与固定句柄/Run/attempt。先用 `judgePositionedSubject(initial)` 得原主体；按链顺序对每条结论调用 `judgeConclusionForSubject`，显式给当前累计主体和该条记录的合法 extension 名。领域拒绝及 TypeError 统一映射为其既有 `{invalidInput:true}`；内部非 TypeError 程序错误不掩盖。

合法 rewrite 得到新 subject 后，用原 position/dimension 重新调用主体入口；合法 select_model 同样重验新的当前主体。空链／全 observed 直接返回经捕获的原主体；第一终止效果后仍有条目按既有规则拒绝。链顺序、终止控制及是否已确认耐久结论仍由 runner 保有，本 core 增补不接收 earlier、不验证整条经过或代它产生效果。

`runPass` 和服务派发继续从真实 execution、受控句柄及 earlier 构造并校验完整 ExtensionInput，再调用原 `judgeConclusion`；不得因新增主体口绕过 LC6 S-11。无 Run 的 after_model_call 服务请求依然拒绝；本增补不闭合 Run 来源、G28 或 runner 完整服务。

## 验证义务、生命周期与缺口

| 编号 | 最小正反验收（尚未执行） | owner |
| --- | --- | --- |
| SV-1 | 十三个主体各正例、未知位置、两必需维度缺席/错配、禁止维度、多余执行壳成员、错 subject；复用完整公开图实编译，未改规范资源字节 | core |
| SV-2 | failure 完整 dispatch/retry 保留；缺成员、共享 dispatch 绑定坏、两个调用混入或 retry 跨调用拒绝；任意配置内同名 JSON 不误判；case 不能冒充真实历史完整性 | core／runtime 输入 owner |
| SV-3 | 各可改位置合法 rewrite；不可改成员、工具 callId/模型 modelCallId、about、extension 来源与 power/position 错误；验证具名拒绝和辅助 TypeError 的组合次序 | core |
| SV-4 | 只针对源码基线 core 已负责的检查，对同一真正通过的 ExtensionInput，旧入口与新投影入口在成功值、拒绝值、TypeError 上逐项相同；不把仍归生产者/runner 的 S-14 关联加入此次等价标准或新行为；原入口缺 log/environment/run/attempt 仍失败，before_persist_message 带 run 仍失败。无有效完整输入的纯主体测试不声称执行成立 | core |
| SV-5 | 大整数/小数、绑定及嵌套主体完整复制；调用前后输入不变，修改原输入不改返回值；独立包 root 类型/函数消费、README/README_ZH 的真实可运行纯主体示例 | core |
| SV-6 | runner 空链、observed、rewrite/select_model 与终止效果复验；含合法 failure 纯值但无执行壳，无 clock/network/random/storage 调用、无固定 Run/句柄；完整 runPass 仍使用真实输入 | runner |

本节点无插件、服务、fiber、事件、后台工作、提交点或共享事务；存储要求清单为空。只持已有固定 Schema 校验器，模块编译成功后可用；初始化失败不发布半成品，不降级。同步调用结束后无资源释放或取消责任；返回值不因消费者卸载而被撤销。无新增静态配置或装配参数。

| 关键选择 | 落选方最强理由 | 本方弱点与置信度 |
| --- | --- | --- |
| 两个完整公共纯判断入口，共享私有内核 | 直接公开现有 selector/immutable 谓词改动最少 | 增加两个需文档及验收的公开函数，但避免消费者先校验顺序各自拼接；高 |
| 原完整输入入口保持前提，纯组合只给已有主体 | 沿用完整入口并制造占位壳可快速复用 | 需抽取内部关联逻辑且验证次序；占位值并非事实，不采用该路径；高 |

尚缺本候选的独立审阅、采用及 SV-1～6 实证；受阻的是 runner 无假壳的纯组合验收。新语义需求目前未引入；差分若发现现行 LC6 条款不能由所给值兑现，则该项仍需真实输入来源并返回主线，不为通过测试补事实。当前代际的 Run/句柄、历史完整与放行，以及 S-14 的 batch 含本次、原主体 result 与外层一致等外部责任保持归属；本稿不声称已交付完整 runner。
