# 本机Session组合验证义务

形状由公开入口表达，行为由[本包SPEC](../SPEC.md)和[共享Session承诺](../../../core/session-runtime/SPEC.md)拥有。
本页维护验证方法和边界。单次执行输出、读数及判定放工作树tmp，不入包。

## 公开函数及Cordis组合

同一组场景分别消费纯函数与公开Cordis分面。
采用真实根／租户SQLite、Session Log、原Model／Tool拥有者及实际独立Session Context。
可受控注入故障，但受控资格／结果不能被报告为生产来源。

| 范围 | 必需场景及退出条件 |
| --- | --- |
| 创建／受理／协调 | G28与原票据、日志／状态／回执同提交；初始化失败不发布；迟到输入阻止旧空队列finish；unknown保持完整原身份 |
| 工作／原Run日志 | 原grant与新Run登录分开；Scope／Storage／复制权限拒绝；关闭等真实操作／Unit结束；日志借用最后归还 |
| 完整driver构造 | 根只选择来源与提供者；driver构造Run／HostInputs／Loop。异来源代际、缺权限、坏policy及复制work token拒绝，不调用第二执行器 |
| 原工作owner | begin先登记原prepare；并发finish不能越过未结算原责任。重启后空Map不为settled，缺证据为unavailable；complete需实际保管／适用ACK／writer停止，release另等原Run完成和借用归还 |
| 原Model链 | 实际同Unit准备／发起、原物理池、完整结果与引用保管、原结算／ACK、真实stopped；当前资格在stage／consume核实，unknown不重发或提前ACK |
| 原Tool链 | 实际原池不按Run重建；每次身份对应真实准备与当前资格。旧attempt／终态可保管，最新permit才推进；普通消息、confirmed和采用全批提交／回滚／认回，不重复消息或账 |
| startup／plugin | 使用实际SessionDriverConfig。坏配置在加载时FAILED且不分配工作；启动等待期间撤除、部分失败、晚到control及换代均保原实例和真实依赖 |
| close／pending | requestStop撤新扫描与发起，不取消共享池；pending保原工作／结果／引用／借用及责任端口。同一close续关，失败不报closed，新control不代旧control收场 |
| Session Context | 两个Session同名源／事件隔离，贡献随原fiber撤除，停止A不撤B；普通Agent Context没有startup或协调资格 |

每条真实资格须来自实际拥有者，不能由consumer名、目录、已缓存角色或字面量true推断。
资源选择、租户绑定、引用核验、实际代际与关闭责任应能追到公开输入和原拥有者。
独立输入租约、Model装配借用、Tool原pool借用、Run journal和Session Context分别归还。

## 模型映射及未覆盖范围

[SessionWork模型](../../../core/session-runtime/verification/README.md)表达有限受理、attempt发起栅栏与收尾竞争。
它的pending／adopted对应日志位置资格，Issue对应原准入线性化，Finish对应锁内重读后的终态提交。
模型不含完整work ledger、未知提交、Model／Tool实际writer、两次跨库事务、结果引用或晚到构造。
模型通过不得证明这些遗漏行为。

CoreModel的原结算／ACK／引用模型和[CoreTool的有限执行模型](../../../core/tool-execution-runtime/verification/models/README.md)
继续保留各自前提；调用方持有capture不等于原物理停止临界区。
提供者在实际机制确定后须核这些抽象动作的承载。
新增时序或独立状态所触发的有限模型／去保护负控，在该机制进入组合验收前由实际拥有者补齐。
对应的同提交／故障／并发义务仍须本页真实组合验证，不能由模型替代。

无终端首答／正常二轮／真实工具属于真实运行闭环；Unix HTTP的29项构件场景不能替代它们。
正式安装、真实终端矩阵、客户端退出后继续和独立OS宿主属于应用验收。
缺实际OpenRouter来源、费用授权／预算、获准工具或指定终端时，相关验收保持未验证。

## 代表性Cordis组合入口

[运行时组合测试](../tests/runtime.spec.ts)中的`owns dynamic injected sources`场景，
使用实际SQLite、独立Session Context和Runtime Context工厂。它核同名动态源、
类型化事件提示、贡献撤除／重装、外来Scope拒绝，以及停止A不撤B。
普通Session Context不提供驱动startup或协调生命周期服务。
[驱动插件测试](../tests/driver-cordis.spec.ts)另核Core startup依赖和原control责任。
受控startup不替代物理Model／Tool证明；实际公开driver往返场景归同一运行时测试文件。


[模型调用编排的有限模型](model-runtime/README.md)维护原调用容器、捕获引用和提供者借用的验证义务。原执行记录与响应内容存储仍由 Model 提供者的真实测试覆盖。
