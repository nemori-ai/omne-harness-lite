# HITL 合同与行为守护

## 动态贡献与持久治理

GovernanceLifecycle 增加两个贡献槽、两代提供者的有界交错。正例检查目录当前性、独立租约、旧代围栏、持久保管、scope、当前提交、来源及定义相容、不可变声明与单次消费。16 个负控分别破坏这些承诺或在 Ready 后停止消费，必须命中具名不变量或具名恢复进展性质。

恢复活性只承诺当前贡献/资格/许可持续合法且消费弱公平时前进。登记恢复本身没有无条件公平承诺。原子提交、声明校验与可靠存储是抽象前提，C3/C6/C8 必须补源码映射和真实卸载重装配验证。模型中的作用域代表 own、foreign-tenant、other-service 三个等价分区，会话/单次/租户业务范围继续由 PermissionScope 检查。

GovernancePublication 另含一个正例及四个具名负控，检查整份发布、冲突拒绝、删声明不删禁止、缺项不绕禁止。check-contributions.py 检查 8768 个租约释放分区与三个负控，命令为 `python3 packages/human-intervention/human-intervention/verification/check-contributions.py`。有限谓词与 TLC 状态模型共同守护合同，不能替代生产注册表/SQL/多租户验证。

唯一协议来源是[动态治理贡献](../../../assets/docs/governance-contributions.md)。模型位于本波 HITL 验证目录只是组合测试的组织方式，不改变 Assets、Settings、Authorization 或装配的所有权。

这些资源验证HJ0候选协议和抽象行为，不提供生产HITL服务。模型是行为权威表达，含义与前提见[数学说明](../docs/formal-model.md)，接口见[公共协议](../docs/protocol.md)及[权限组合](../docs/permission-composition.md)。后续实现必须填写抽象动作到真实源码/事务的映射，不能拿模型绿灯替代实现接受。

## 运行

从仓库根运行。TLC工具沿项目已有安装和版本核验，不下载未知工具。`TLA2TOOLS_JAR`指向项目已采用JAR，`JAVA_BIN`可指定Java。缺工具退出2，不能当负控通过。

```sh
python3 packages/human-intervention/human-intervention/verification/check.py --self-test
python3 packages/human-intervention/human-intervention/verification/check.py
python3 packages/human-intervention/human-intervention/verification/check-contract.py
uv run --locked --no-sync python packages/human-intervention/human-intervention/verification/check-semantics.py
```

形状检查使用成熟jsonschema工具，验证环境版本固定于requirements.txt，不进入产品运行依赖。reply.schema.json仅守护答复提交wire形状。生产边界另由 [commands.ts](../src/commands.ts)、[queries.ts](../src/queries.ts) 和 [recovery.ts](../src/recovery.ts) 的严格 Schema 及 decoder 解析；方法行为归 [protocol.md](../docs/protocol.md)。输入形状通过不证明操作者可信或具有资格。

## 检查范围

| 模型 | 有限范围 | 正例与具名负控 |
| --- | --- | --- |
| RegistrationProtocol | 一个操作、两种潜在重复请求身份、登记/封口/回执丢失/恢复 | 共同登记、原身份唯一、封口不可晚交、查询原结果、不假not-committed |
| ContinuationComposition | 两轮两项；Ask全题及扩展allow/ask/deny混合判断，一次换代/终局/撤权 | 判断和答复屏障、继续当前性、一次推进、不重跑已记录判断；弱公平下条件进展 |
| IntakeControl | 三输入、两pending容量、一会话两代推进者 | 准入/归档/取消竞争、输入归属、容量、开始与完成的旧代/错目标保护 |
| ExecutionSlots | 三调用、一active名额、一次人工等待 | park释放、ready排队、重新取得、不超容量、兄弟及已答调用条件进展 |
| HumanDecision | 两卡、两竞争答复、成员撤权、短期reservation、失效、消费、服务退出/恢复 | 唯一决定、共同保管、无终局复活、当前资格、租户、一次接手 |
| WaitIsolation | A已准入后park；同会话独立工具B、另一会话C；不依赖人回答 | 工具独立、会话独立、不持执行槽；弱公平下B/C最终推进 |
| ConcurrentIntake | 两会话四个请求，含不同 acceptId、跨会话相同 acceptId，以及换登录重用同一 acceptId；入列、消费、重试 | 唯一输入、已受理不丢、受理序消费、跨会话幂等作用域、同键不得改绑 |
| RecoveryRouting | 一个逻辑等待、两代接收者、一次退出/重装配、离线答复 | 未答保持、答复保管、稳定目的地、旧代围栏、一次接手；弱公平下最终交接 |
| AuthorityComposition | 七类独立资格来源各一次失效、准备与目的提交 | 当前保护组合；分别移除每一来源guard的七个负控 |
| PermissionScope | 单动作、三个授权范围、一次修订/撤回、会话终局、两次消费 | 主动禁止不可绕过、范围、参数绑定、当前依据、单次消费 |

安全负控逐个只检查其具名不变量，要求TLC退出12并输出该不变量被违反；活性负控配置只允许一个具名PROPERTY，要求TLC退出13及Temporal properties were violated，并记录完整配置哈希；语法错误、不同不变量、超时、工具失败均拒绝。正例要求退出0且模型检查完成。模型与配置、运行器、Java和JAR哈希连同原始日志写入tmp/formal/hitl，不手抄成功结论。

ConcurrentIntake抽象原子持久提交，不建模HTTP调度、SQL锁或archive丢弃处理。PermissionScope只验证许可应用边界，不声称实现完整权限配值算法、自然语言解释或Settings事务。HumanDecision从已确认登记开始；RegistrationProtocol补齐初态之前的准备/提交/封口/结果认回。原子提交是抽象动作，C2仍须真实事务故障验收。RecoveryRouting在有限一次重启与相容恢复、持久数据可读、弱公平调度前提下检查交接活性，不要求人必答；等待无答时可无限保持。AuthorityComposition只抽象来源失效与提交同序，真实guard映射见protocol.md提交保护清单。PermissionScope的tenant分支抽象后续配值采用，不建立第二套持久授权权威。HumanDecision假定Identity已兑现reservation协议；本波必须运行复用的StandingCommit模型并核对采用映射，不能声称新模型重新证明Identity实现。

## HJ0接受与后续实现映射

| 抽象动作 | 必须兑现的真实边界 | 实现接受闭包 |
| --- | --- | --- |
| Reserve/Seal/Revoke | Identity reservations与HITL目标操作终态，所有相关撤权写者 | C2/C6 |
| Commit | HITL决定+原等待inbox+操作终态共同提交 | C2/C4/C5 |
| Crash/Recover/Rebind/Deliver | 原逻辑等待持久化、receiverGeneration围栏、inbox拉取及原操作认回 | C2/C4/C5/C9 |
| Withdraw/Commit | 全部适用来源guard与目的端共同提交；Session权威控制直接检查 | C1/C2/C3/C6 |
| Consume/Invalidate | 原消费者幂等接手、终局与继续围栏 | C4/C5 |
| Park/Advance | 调用active/parked分账、会话分键调度、资源释放与公平性 | C1/C4/C5 |
| Enqueue/Take | Session操作scope、日志/输入/回执共同提交、单推进者 | C1 |
| Permission Execute | Permissions当前约束+Authorization许可消费+目的端提交 | C3/C6/C8 |

这些是待落实的实现义务，不是已完成映射。真正的源文件/函数/事务点、测试命令和证据在各闭包交付时补入。C9不得在任何必要行仍未落实时称运行时闭环完整。

物理断电、OS崩溃、多进程写者排除、未来跨服务阶段协议、生产调度公平及外部效果恰好一次均不由本套有限检查证明。进程重启实验不能替代物理断电。未验证项在交回报告保留实际边界。


## 纯函数和结果代数边界

command-algebra.json列出4个HITL命令、5查询、5原等待恢复端口及4提交协调端口。check-semantics.py对权限的数学关系与独立参考求值做有限分区枚举，并对每个方法检查结果闭包、可信读取先于回执、提交unknown与原结果认回。纯读失败不制造提交unknown；查询原操作可以返回原写操作的unknown。负控必须被对应关系或约束拒绝。

这份表不替代每个服务完整wire Schema。本验证目录只有reply.schema.json这一份独立JSON Schema文件；公共生产源码的命令、查询和恢复解析器见上文。解析器的存在不代替状态转换、持久提供者及组合验收。有限观察分区检查不等于任意输入字节的全化实现证明。

单推进者是IntakeControl采用的一个active结构，模型检查错误开始和晚到完成不能绕过身份/代次。真实分布式租约或多进程互斥不在本次提供者范围。ContinuationComposition记录“已完成并持久的判断”不重复；模型不能解决外部调用已发生但结果尚未保存的未知窗口，该窗口沿原调用协议认回。

## C2 源码映射的当前边界

公共源码的边界验证与纯模型分别保留。下表的后端义务由 [local验证入口](../../human-intervention-local/verification/README.md) 提供实现映射及相应证据，不能由本表的纯函数用例代替。

| 源码与测试 | 已兑现部分 | 仍需后端兑现 |
| --- | --- | --- |
| src/commands.ts 与 tests/commands.spec.ts | 四类写命令严格解析，字节预算、独立来源和合法选项形状 | 身份真实性、资格保护、原操作去重与封口 |
| src/card.ts 与 tests/card.spec.ts | 当前快照下的修订、状态和选项判断；终局不抹已答历史 | 两个并发 ready 计划只能提交一个；决定与原等待共同提交 |
| src/queries.ts 与 tests/queries.spec.ts | 查询形状、有限页预算和默认待答过滤 | 当前可披露池、稳定快照与游标绑定、原结果读回 |
| src/services.ts 与 tests/contracts.spec-d.ts | 命令、查询及提交端口隔离，按方法关联命令结果 | 真实应用服务、SQL、Identity与原等待适配 |

源码通过纯函数用例不关闭C2，也不建立跨进程或断电保证。完整事务与恢复映射仍由上表之前列出的闭包负责。

ConcurrentIntake 的操作身份是固定租户内的 `(session, acceptId)`，登录来源属于原输入绑定内容，不参与 accept 族操作键。不同客户端须为不同请求提供不同 acceptId；换登录重发同一 acceptId 不是独立请求，依公开入口合同冲突，查询仍受当前资格检查。模型中两个输入可竞争同键，但至多一个被受理；`NoOperationRebinding` 及 rebind 负控守住这一点。`NoClientSourceConflict` 只承诺尚未绑定的独立操作不因客户端来源被错误合并。该模型不证明 HTTP 错误形状或身份鉴别，真实映射由 C1 用例证明。

## 按租约保留目标支持

`GovernanceTargetSupport` 补充同一声明下两个租约、两个目标的采用和撤除。采用准备可以与任一撤除交错。当前修订不相等时不能发布旧候选；撤除只删除该租约的支持边，再从剩余支持计算可见目标。

令支持关系为 `S ⊆ Lease × Target`，可见目标为 `range(S)`。撤除租约 `l` 后令 `S' = { (r,t) ∈ S | r ≠ l }`，再取 `range(S')`。于是每个仍有支持的目标保留，无支持的目标消失，其他租约的支持不变。这是集合定义的推论，对任意有限关系成立。SQL 实现仍须在一个事务中兑现该关系更新，数据库外键本身不能证明投影与支持集合相等。

| 不变量 | 负控 |
| --- | --- |
| NoUnsupportedTarget | 只要还有同声明的兄弟租约，就错误保留所有旧目标 |
| AllSupportedTargetsVisible | 撤一个租约时错误删除所有可见目标 |
| MembersCurrent | 支持只能来自仍有效的租约，由正模型检查 |
| PublicationCurrent | 忽略修订，发布撤除前准备的旧候选 |

该模型不新增资格、来源权威或 epoch 保证。它把一个声明内的目标支持单独建模，原有 GovernanceLifecycle / GovernancePublication 继续承担各自性质。有限检查不证明真实事务、查询索引或多租户隔离。提供者的 `gc_member_target` 与选中目标关系必须用真实 SQL 反例建立符合性。
