# 八份 v3 候选构造简报

唯一工作位置：core-delivery HUB。职责：规格作者只构造本简报决定的语言无关承诺与精确采用，不实现／不接受／不改产品或统一语言。来源与选择已在 decision.md，不能自行补另一失败政策。

## 固定输入与可写边界

源：本主题 decision.md、八份当前 accepted v2（inputs.json 逐资源摘要）、catalog/frozen、spec 各 family README与模板、对应 realization 四文件、D060 N32、SA版本外verification:92。只写这八个 family/topic 的 **新 v3/** 目录，以及本主题 `candidate-diff.json`、`consumer-impact.json`、`draft-report.md`；登记补丁先写本主题 `candidate-registry-patch.json`（完整可审查 entries/资源列表/条款依赖/推荐采用差异）。**不修改旧v2、正式registry、任何README／verification版本外入口、其它领域正文、产品源码。**根独占正式登记与发布。

身份 ledger：`data.content-blocks/3`、`data.messages/3`、`data.model-response/3`、`data.loop-extension/3`、`data.tool-definition/3`、`data.asset-model/3`、`capability.stream-assembly/3`、`capability.asset-evaluation/3`；baseline沿当前baseline、schema_namespace沿registry。只将本集合的实质依赖显式采用3，其它精确依赖保持原坐标（identity1/OE1/CA2/MP2/AR2/Skill2/MCP2/Slash2/Connector2等）。不存在新词条、操作token或失败token；所有旧条款号保留，新增陈述尽量落相应既有条款内。

## 必须表达的改变

1. CB：S12 的 tool 分支分清：正常 arguments 必须 ModelToolName；complete+rawArguments+unparseable:true 仅为收到的非空string（含非法ModelToolName），不可执行，不重解析，不改名。Schema的 ModelToolName $defs 保持源2原值；共用tool property是非空string，正常参数分支再约束 ModelToolName，未解析分支不受该字符集／128长度限制；arguments property指针必须仍存在，Loop消费者使用它。其它 required／额外成员／拒绝优先／嵌套禁调用均不变。加合法坏名未解析与仅改变一处的反例（正常bad名拒、空tool拒、缺标识/混参数/标false拒）；G10与例子/拒绝说明同义，旧普通parsed bad名例仍拒。
2. SA：采用 CB3；两示例及 P4对应修正，正常封口 parse once／坏名不parse／trim不parse／快照结算不parse 保留；五操作九项齐，无新Schema，保持八个规范资源完整（contract/examples/formal README/Assembly.tla/四cfg），模型可执行内容不得为了让反例消失而改。说明未覆盖，旧运行不重标3。
3. Messages/MR/Loop：完整新Schema引用闭包采用 CB3/Messages3/Loop3等本集合实际依赖；未解析坏名可以经 AssistantMessage / ModelResponse.reply、delivered / Loop请求消息、完成reply subjects记述。Loop before_action 的运行时 S16依旧不dispatch unparseable（Schema允许不能冒充派发许可）。正常CallId唯一／路由/租户/错误优先等不改；MR六处复制仍断言同值，ModelToolName字节对齐不放宽。
4. TD：明确采用 CB3，保持 S26先CB表示判定再result_call_in_content。相同bad名未解析调用作为ToolReturn.content／offload.summary，现为 result_call_in_content（仍拒、禁止返回调用），普通正常arguments bad名仍 malformed；正文声明/输入Schema/模型面名/执行权限等不改。
5. AM/AE：仅精确采用TD3／Loop3／AM3的标准正文与推出规则，原域／四步／C条件／明确缺口不改、不新造AE Schema，保持Connector当前纵线延期的实现边界（规范仍完整，不能删除Connector类型）。AM full Schema仍包含Connector2冻结定义，不新增Connector提供者。

所有 `$id/$ref` 与文字精确依赖一致，不将整个字符串“v2”全局换3；不改外部运行时pin2。格式资源按源家族规则完整，状态写候选，不冒称D061已经接受新3。

## 验证、交接与停止

逐资源源2→候选3差异表区分实质变化、URI/坐标采用、未变可执行模型；CB ModelToolName、TD ModelToolName及所有无关断言应可机械对账。列所有仍pin2的受影响消费者及责任人／迁移时点，不把新版推荐当采用。不作旧2行为兼容接口。正式登记root后再跑规范/解析检查，独立spec-reviewer检查完整批次与九项、引用、复制、消费者、形式表达；其意见不代替root接受。

若还发现真实语义矛盾，停止该依赖分支并发具体反例，不静默选方便正文、不修改已冻结2。没有必需输入／无法保持全局ModelToolName／精确引用不能闭合时同样暂停报告。
