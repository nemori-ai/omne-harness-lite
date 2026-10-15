# 分支集成工具行为契约

自 2026-10-15 起，四条主干的进入按[现行准入](../../../../docs/engineering/integration.md#现行准入)执行。本工具的 prepare、verify 和 publish 不再用于 `integration/*`、main 和 stable，只在 admin 临时恢复原规则集时作为恢复手段。status、start、register、task-sync 等任务入口照常使用。start 和 register 不需要 bootstrap 或采用锚点：policy 和交付配置从当前 HEAD 读取，派发评论的作者须是 `publish` environment 的 reviewer（个人或 team 成员），不再比对 owner 名单和 policy 修订号。没有 task context 的检出，baselines 退回显式基线，`scripts/check.sh` 再退回 `origin/main`。

本模块兑现[多层分支规则](../../../../docs/engineering/integration.md)。公开类型及输入解析归本目录源码。正式采用从可信main及不可变tag读取。以下承诺约束实现；配置、提交与实际采用分别判断。

## 采用与身份

I01。共同 loader 只从实际 Git 仓库的正式 main 提交读取 bootstrap descriptor。当前正式来源没有 descriptor 时返回 pending，不联网、不要求新任务 context。descriptor 已提交而采用对象、可信来源或 context 缺失时返回 unknown。候选删除 descriptor 不解除已采用规则。显式 bootstrap 查询完整权威 tag 命名空间；查无首次采用 tag 才产生限定该次观察的 positive absence。

I02。采用 tag 固定提交、policy blob、具名决定和 legacy 树范围。新 clone 必须 bootstrap。legacy 豁免匹配实际 tree 身份、原分支、原 HEAD 祖先与原任务绑定。新任务不能沿用旧豁免。activate 核对 construction 完整提交确认、clean HEAD、机制资源、实际检查和启用的 delivery 前提。它不替用户提交、丢弃或迁移工作。

I03。任务事实来自现有 Issue 的唯一 `omne-integration-binding:v1` JSON 区块，精确格式归 delivery/binding.ts。当前 revision 和 attempt、身份、责任、路线、taskBase 与写范围必须匹配。context 仅缓存事实。平台 Stage、关闭及交付接受不由本模块写入。

## 候选与验证

I04。operation ID 在候选提交前生成。操作固定 B、各 S、policy 和每张卡。除 stable 外，C 第一父为 B，各 S 与 B 均为 C 祖先。源分支后来前进不修改固定 S。目标变化后旧候选失效。冲突保留在专属候选树，工具不选冲突一侧。

I05。RI 和 joint 从轨道初始 anchor 到 S 的 first-parent 单元 tag 重建来源。工具自动推导每卡集合，拒绝缺 tag、外来直接提交、来源不全和不相容的重复任务。FI 继承 main，不凭此创建业务任务。调用者提供的集合仅用于精确比较。

I06。targetBase 用于 B..C 影响检查。taskBase..taskSource 逐提交审计保留已撤销的改动、合法 QA/main 和合并父判断。各检查边界消费共同 loader；全局 main 趋势仍用 main。

I07。verify 从已采用提交物化受信 runner，命令 manifest 和 checker 来自 runner。C 只提供被测产品、测试及构建输入。实际命令成功、候选 HEAD/tree/clean 前后不变才封存 receipt。回执绑定命令、退出码、日志 digest、B/S/C、任务集合和 policy/tool 对象。旧耗时 ledger 不构成成功证明。候选自身规则不能放宽已采用规则。

显式仓库的 Git 调用及 verify 工程子命令删除继承的 `GIT_DIR`、`GIT_WORK_TREE`、`GIT_INDEX_FILE`、`GIT_COMMON_DIR`、`GIT_OBJECT_DIRECTORY`、`GIT_ALTERNATE_OBJECT_DIRECTORIES`、`GIT_NAMESPACE`、`GIT_SHALLOW_FILE`。仓库、对象库及引用由显式目录决定，linked worktree 仍由 Git 自身发现。原认证、Git 配置、超时、输入输出及错误分类保持；verify 继续绑定正式 OMNE runner/subject。此约定不隔离任意 Git 配置。

## 授权与更新

I08。生产授权读取真实 Issue comment。固定只读 `gh api GET` 核对 repository、Issue 非 PR、comment URL、作者 login/node ID、严格 action schema 和精确动作输入。dispatch、adopt、publish、policy-adopt 与 track-bootstrap 各有自己的必需字段。本地 JSON 仅作为草稿或观察。关键步骤再读当前任务和条件决定，未知拒绝。

`start` 与 `register` 的平台读取限于任务闭包、授权卡及任务 Project 状态，范围归 [准入采集](../delivery/SPEC.md#任务准入采集)。闭包包含精确 Issue 条件目标、原生 blockedBy、原生父卡及正文父卡。独立授权卡完整读取评论以核对撤销声明，不读取其无关关系。每次最多 32 个 Issue、8 个边层级，缺页、解析错误、身份不符或超限均为 unknown。

准入继续核对直接授权评论与已采评论的一致性、owner login/node ID、撤销声明、精确绑定及现行条件确认。工具只核对目标卡偏离，不以准入闭包声称全仓创建标识唯一或循环覆盖。配置 Stage 字段与任务 membership 必须确认，完整读取后的空 Stage 合法。

创建 context 前重新采集同一范围。摘要包括完整闭包内容、独立授权评论和任务 Stage。相关正文、评论、关系、Stage 或闭包变化均拒绝写入。无关 Issue 历史或其他 Project item 不进入读取及摘要。已有同绑定 context 仍按现行幂等读回处理。其他集成操作继续使用全库采集。

I09。publish 先证明 B 是 C 祖先，再在更新点比较 expected B。remote 使用精确 lease、无 `+` refspec 和 atomic branch/tag push。local bare 使用带 oldOID 的 update-ref 事务。branch 与 immutable unit/checkpoint tag 同时成功或全部失败。拒绝 non-FF、checked-out ref、tag 碰撞及不支持 atomic 的远端。

I10。stable 选取已存在的 main 提交 C。旧 stable 只需是 C 祖先，不要求 C 第一父等于旧 stable。首次创建固定明确 audit base。stable 不产生开发提交。

I11。事务前封存 intent。发送一次后，失败或超时先读真实 refs。resume 不重发事务。B 且 tag 不存在是未观察发布；C 或包含 C 的后继且 tag 精确匹配是已发布；分裂、碰撞或读取失败是 unknown。Git 发布、交付接受和 Issue 投影是不同事实。

## 验证义务与限制

持续测试必须驱动真实隔离 Git 与 CLI，覆盖 pending 不联网、新 clone 缺 anchor、双基线、完整 prefix、checker 自降、dirty/HEAD 改变、B<P<Q CAS、non-FF、atomic tag 失败和未知恢复。GitHub 响应模拟只能证明解析及只读协议。真实 Rulesets、Actions、权限与宿主加载需在未来部署启用前另核。

Git 更新语义沿[git-push](https://git-scm.com/docs/git-push)和[git-update-ref](https://git-scm.com/docs/git-update-ref)。平台读取沿[Get an issue comment](https://docs.github.com/en/rest/issues/comments#get-an-issue-comment)。这些来源不代替实际运行证据。

未采用泛用仓库边界：普通 Git 仓库没有 main/origin-main、任何 remote、历史 committed descriptor、adoption refs 或 latch 时，共同 loader 返回 generic-unadopted pending，保留现有工具的显式 SHA 行为。出现任一采用线索后缺可信 main 仍 unknown；不把 HEAD 当可信 policy 来源。

历史聚合以完整稳定 Issue identity、revision、attempt 为键。同一卡不同历史 tuple 分别保留 taskBase/taskSource 和原 unit 包含关系，不代表多个当前绑定；同 tuple 的完整 binding 不一致或 source ancestry 分叉仍拒绝。RI/joint/checkpoint 为每个过期 tuple 分别取得 exact owner 重核并审计，不能取最新 taskBase 吞掉旧历史。

幂等身份是已创建的 operation。publish/resume 对同 operation 只接续或观察，不另建 commit/tag。每次 prepare 是新的构造请求并分配新 UUID；中断后先从 tmp/integration 找回已有 operation/draft，不能把重复 prepare 当自动重试。

首次 activation-check 的 full 检查使用限定的 bootstrap-check 执行范围：实际 root/gitDir、clean construction/main SHA、descriptor digest、operation 与 adoption namespace。共同 loader 的每个消费者在此范围内重新读取权威 main 和完整 namespace，只有精确 main 不变且尚无任何采用 refs/latch/cache 才返回当次 positive-absence pending。检查结束再核一次；普通 status 不缓存这个结果。范围参数不是权限，不延伸到 runner 的另一 gitDir、其他树或工作候选；保留任一已知采用线索时，缺失 tag/cache 仍为 unknown。

采用 refs 的不可覆盖、不可删除保护是实际部署前提。positive-absence 是当次查询结果，不是历史未采用证明。新 clone 和权威同时失去全部历史线索时，Git 无法判别历史；初次采用或恢复依据由具名 owner 核对，空 namespace 不自行授予采用权限。已知线索缺失仍按 I01 拒绝，不放宽任何既有采用丢失检查。

Git 网络 ls-remote、fetch、push 均有有限预算。已采用操作使用 policy networkMs；首次 bootstrap 使用 30 秒预算。缺失对象才 fetch；超时或读取失败保留 unknown，发布后只观察，不自动重发。

变更入口重新读取权威采用 namespace 的完整连续链，核当前最新 anchor 与本地 context/候选一致；已出现新 anchor 时旧 clone 的 prepare/verify/publish 拒绝，要求明确 bootstrap 与任务交接。status 仍是本地观察。发布更新前再核采用链，但这次读取与目标 branch 的 CAS 不属于跨 ref 原子事务。政策升级由具名 owner 从 handoff 开始冻结发布，核所有 clone 的在途操作，完成采用和接续后恢复；缺该协作前提不得并发升级与发布。工具不宣称可阻止同凭据操作者绕过此约定。

首次 activation-check 与 policy-check 都核 construction/subject 和 trusted runner 的前后 clean、HEAD、tree。activate、policy-adopt 和 publish 在消费检查证据时重核每项成功退出及日志 digest；日志改变或缺失使证据失效。
