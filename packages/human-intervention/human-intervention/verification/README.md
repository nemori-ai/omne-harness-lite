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

形状检查使用成熟jsonschema工具，验证环境版本固定于requirements.txt，不进入产品运行依赖。reply.schema.json仅守护答复提交wire形状；其余服务形状当前由protocol.md规定，完整生产边界校验在C2实现。输入形状通过不证明操作者可信或具有资格。

## 检查范围

| 模型 | 有限范围 | 正例与具名负控 |
| --- | --- | --- |
| RegistrationProtocol | 一个操作、两种潜在重复请求身份、登记/封口/回执丢失/恢复 | 共同登记、原身份唯一、封口不可晚交、查询原结果、不假not-committed |
| ContinuationComposition | 两轮两项；Ask全题及扩展allow/ask/deny混合判断，一次换代/终局/撤权 | 判断和答复屏障、继续当前性、一次推进、不重跑已记录判断；弱公平下条件进展 |
| IntakeControl | 三输入、两pending容量、一会话两代推进者 | 准入/归档/取消竞争、输入归属、容量、开始与完成的旧代/错目标保护 |
| ExecutionSlots | 三调用、一active名额、一次人工等待 | park释放、ready排队、重新取得、不超容量、兄弟及已答调用条件进展 |
| HumanDecision | 两卡、两竞争答复、成员撤权、短期reservation、失效、消费、服务退出/恢复 | 唯一决定、共同保管、无终局复活、当前资格、租户、一次接手 |
| WaitIsolation | A已准入后park；同会话独立工具B、另一会话C；不依赖人回答 | 工具独立、会话独立、不持执行槽；弱公平下B/C最终推进 |
| ConcurrentIntake | 两会话三个请求，含同会话不同客户端和跨会话相同局部key；入列、消费、重试 | 唯一输入、已受理不丢、受理序消费、跨会话幂等作用域、可信来源派生 |
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

这份表不替代每个服务完整wire Schema。reply.schema.json目前是唯一可执行完整请求Schema；其他方法形状仍由protocol.md定义，生产解析与实际状态转换验收在后续闭包。有限观察分区检查不等于任意输入字节的全化实现证明。

单推进者是IntakeControl采用的一个active结构，模型检查错误开始和晚到完成不能绕过身份/代次。真实分布式租约或多进程互斥不在本次提供者范围。ContinuationComposition记录“已完成并持久的判断”不重复；模型不能解决外部调用已发生但结果尚未保存的未知窗口，该窗口沿原调用协议认回。
