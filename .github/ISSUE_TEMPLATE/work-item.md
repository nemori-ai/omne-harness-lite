---
name: 独立交付
about: 持续迭代中的一次可接受结果
---

# {{一次可独立接受的结果}}

<!-- documentation:placeholder -->
<!-- 本模板归 .github/ISSUE_TEMPLATE/work-item.md。成卡删除提示；按工作类型加载并填写相应附加内容，不默认ready。 -->

协议及启用范围见 [交付协议](https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/delivery.md)，类型要求见[工作类型](https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/work-types.md)。发布后成卡使用仓库绝对链接；模板候选存在不表示默认分支已加载。

## 身份与责任

- 交付层级：delivery
- 主工作类型：{{feature／bug／refactor／performance／maintenance／investigation}}
- 交付修订：1
- 创建操作标识：{{发布单写者先分配、保存并读回已知交接入口中的请求定位；同一标识随首次创建载荷写入，不复用或随revision更改}}
- 责任范围：{{实际领域、成员或系统责任；产品topic按适用填写，不强造PF}}
- 卡负责人、主结果接受者及授权依据：{{实际有权者；非产品结果不自动要求产品负责人}}
- 受影响语义拥有者：{{涉及产品／架构／契约变更的具名责任及必要接受，或无}}
- 长期依据：{{适用文档链接、精确修订与条款/能力/场景范围；无则写无，不要求PF或产品场景}}

## 问题、结果与范围

{{说明当前问题、一次交付结果和不含。产品用户故事按适用表达；技术工作直接写工程目标。调查明确回答的问题，不假称将实现能力。}}

## 依据与验收

| 当前依据或获准问题 | 唯一源定位与条款／场景 | 所核修订及Git提交 | 本次成功判据、方法和禁止结果 |
| --- | --- | --- | --- |
| {{按工作类型选产品／技术／工程依据或获准调查问题}} | {{真实可访问入口，保护私有信息}} | {{精确输入；候选假设注明未采用}} | {{真实可观察结果，不以closed／CI绿代替}} |

## 工作类型附加内容

{{按交付协议引用的work-types选择适用内容，删除其余提示。feature明确行为与失败场景；bug列预期／现象／复现或替代观测；refactor列结构目标／保持边界／消费者；performance列基线／负载／环境／目标／可比性／正确性；maintenance列应有状态／影响及检查；investigation列问题／假设／方法／约定成果／允许未定的范围。未定尺度明确列缺口，不编造指标。}}

## 交付条件

| 条件ID | 类型 | 目标 | 阶段 | 所需结果与判据 | 确认责任及证据入口 | 适用目标 |
| --- | --- | --- | --- | --- | --- | --- |
| D-01 | {{issue-result／adopted-source／decision／capability}} | {{IssueURL、规范条款、决定或资源}} | {{start／integration／acceptance}} | {{核所需精确范围，调查接受不冒充修复}} | {{具名责任、实际入口；无证据说明缺口}} | {{all／track／main／stable／登记的完整ref；仅integration可限定}} |

{{无条件写无；排序另由Priority／Iteration维护。硬条件不得自指或循环，核对相关卡完整阶段／结果链；不全为unknown。整项完成阻塞开始的行才投影原生边。}}

## 实施与持续成果交接

{{必要写范围、契约／设计输入、相称验证与停止点。列需更新的持续正文／验证拥有者，或说明依据不变；完整实施输入在任务区展开。若分解列真实子项关系，不手写第二份活动队列。调查成果须跨会话保留时明确最小保存入口。}}

### 当前执行摘要

{{正文单写者维护attempt、人的责任、独立分支、授权范围、输入修订、最后成功远端提交；未派发明说。Assignee不是实例锁。}}

<!-- 集成已采用时，在本节放唯一 json omne-integration-binding:v1 区块，精确形状与真实例程见 tools/ts-checks/src/integration/README.md。保留 Issue identity/revision/attempt、人的责任、branch、route、completionTarget、不可变 taskBase、writeScope、dispatch、conditions IDs 和 authorization。pending 不造卡或绑定；层级技术回执不等于接受。 -->

## 决定与剩余责任

{{链接具名接受／取消／撤销记录；无决定写未决定。部分认可不关闭为完成，子任务接受不自动接受此卡。明确缺口及下一责任。}}
