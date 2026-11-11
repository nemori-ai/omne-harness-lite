# 权限模式投影与询问裁定

范围是纯函数 `projectSessionPermissionMode` 与 Authorization 的 `decideInquiry`。输入必须已通过原 Session 或模式来源边界校验；本证明不建立调用者身份、动作归属、SQL 当前性或 Runtime Context 发布资格。

令 M = {never, auto_permission, bypass-permissions}，P = {deny, ask-human, skip-ask}。翻译 T 为三行全函数，分别映射到 P 的同序元素。每个投影保存实际模式来源和翻译版本。实际源码用完整 Record<M, InquiryPolicy> 表示 T，新增模式而未给翻译时类型检查失败。

默认模式解析 R 在覆盖、显式创建、精确默认三个分支得到值。覆盖存在时取覆盖；否则显式创建取创建值；否则只接受与创建采用的 owner/name/revision/digest 全等的具名默认观察。缺观察或不等返回 unavailable。全化没有引入一个隐含默认值。R 的来源保证以默认观察来自可信解析器为前提，单凭客户端声称相同 Adoption 不构成事实。

询问需要 Q = {none, required, prohibited, unavailable}。策略观察为 P 加缺失，共四种。裁定 D 的 16 个有效输入由 `authorization/tests/inquiry.spec.ts` 穷举。D(prohibited, p) = deny，D(unavailable, p) = unavailable，对所有 p 成立。D(none, p) = continue；D(required, missing) = unavailable。D(required, skip-ask) 才是 continue，其余分别 deny 和 ask-human。

因此，对任一有效模式 m，D(prohibited, T(m)) = deny。跳过询问不会覆盖结构化禁止；缺少结构化依据也不会变成继续。`tests/permission-mode.spec.ts` 组合实际两个拥有者的函数，枚举三种模式验证这两个性质，并验证默认采用四个字段的错配、不可用来源、覆盖优先和证据不可变。

这些是有限输入分解及实际纯函数的执行检查，没有使用 TLA+ 或定理证明器。生产路径还须证明变更时发布、恢复后发布、消费时同捕获修订核验，以及原动作资格；这不由纯函数测试推出。

## 发布材料的同依据性质

令 W 是通过原 Session 读口取得的工作快照，H 是同一拥有者模式查询的原子观察。两次读取可以交错。定义 J(W,H,D) 为 `createSessionModesPublication`；D 是具名默认观察。J 仅在范围相同、W 的权限修订等于 H 的权限修订、三轴均有合法值且材料满足载体 schema 时返回 ready。其它分支全化为具名 unavailable。来源事实为原拥有者提供是前提；字符串相等本身不建立访问资格或真实性。

ready 的权限模式由 H 的原采用及覆盖计算，basis.permissionRevision 和 basis.permissionSource 也取自 H。环境、协作轴采用 W 的最后已提交覆盖，缺覆盖时取原基础值。权限模式变更或赋值推进原权限修订，因此跨该变更的 W/H 混合观察不能满足 J 的修订等式。普通消息不改变权限修订，不需要阻断合法投影。

读取绑定 B 只选择发布材料的 inquiry 与 basis，即 B(J) = (J.inquiry, J.basis)。它没有读取新状态的端口，也不调用模式解释函数。schema 解析复制原对象并逐层冻结，调用者修改原对象不能改变已发布材料。于是旧 inquiry 无法通过 B 自动获得较新的 basis。

J 不是发布或捕获的线性化点。J 返回后仍可有新提交；生产者的会话修订排序及捕获时原 Session 守卫仍是必要条件。`tests/mode-publication.spec.ts` 用原 Session SQL 写者构造模式变更，验证两种错位读取均拒绝、旧发布保持旧依据；还验证范围隔离、精确默认、三轴覆盖、序列化及不可变性。该执行证据不证明 AD-03 生命周期和真实捕获已经接通。

## 生产者顺序与恢复

对同一租户中的每个会话 s，生产者维护只含在途工作的队列 Q(s)。刷新与恢复供值追加到同一 Q(s)；前项结束后下一项才读取原来源。不同 s 不共享队列，所以一个会话的来源等待不阻塞另一个会话。通知修订不是排序依据，所有通知都重读原拥有者；由原读取不回退的前提，可推出迟到通知不能重新采用其旧载荷。

生产者登记和每次发布仍受 Runtime Context 原权威和代次检查。close 设置关闭状态后撤除句柄，后继队列项不再读取来源，已读取的晚结果不再发起发布；已经在原机制中的发布由原撤除/代次检查封住。旧代失效与 dispose 不改变新代。这里不把适配器的布尔状态当作持久撤权或事务守卫。

persisted 恢复由原 beginReplay/finishReplay 标记供值需要；首次合法读取调用原 supply，后续普通读取复用已发布值。源模型仍是 Session，适配器不保存模式快照。稳定块的 invalidate 不承诺自动重取，故原注册后、漏通知或捕获冲突后的显式 refresh 是装配的活性义务；这些调用未接入前不声称应用具有完整热更新保证。

`tests/mode-publisher.spec.ts` 用确定性延迟验证同会话顺序、跨会话独立、关闭及结束作用域；并用真实 runtime-context 机制验证缓存、旧代晚结果、替换后撤除和 persisted 恢复供值。权威、作用域关系和原来源在该测试中是具名替身。`tests/mode-plugin.spec.ts` 另组合真实 Cordis、原 Session SQL 写者及真实 Context 机制，验证注入身份、变更通知、乱序通知、显式刷新和撤除；SQL 提供者与生产权威仍为夹具。两个证据层不能替代应用准入验收。

## 应用初始采用和冷恢复的前提

对创建输入 c，编码 E(c) 固定精确采用、作用域 generation 1、初始修订 0→1 和原 operation。候选声明本身不证明可注册；应用在隔离 Runtime Context 真实 prepare，核完整 change、coverage 和 currentRevision 后，Session 的首次创建事务才同时保存准备记录及 SE07。该隔离验证以前序 Session 不存在、初始注册只有本应用固定项为前提；它不能证明任意已有作用域的当前性，也不改善 Identity 撤权原有边界。

材料修订 2 的文本编码保存完整值，解码后按原编码重写与输入逐字相等才可解释。它减少重复值树包装，不改变决定内容或 Storage 限制；不承诺兼容旧 schema。原 create 认回使用原持久输入、准备和结果，不依赖当代 producer 或映射。

冷恢复输入必须包含已知 tenant/session/scope；可信装配先挂必需生产者，holder 用原 coordinator 读取原 scope bindings，再走原 replay。成功只在原 scope 恢复为 open 时返回 ready；缺事实、错归属、失败恢复或关闭不会返回 ready。没有历史通知不构成来源缺失的许可。只有 scope 的消费者仍须取得原 Session 定位，不能从摘要推断。

应用 create-release 测试已组合真实 SQLite、Session 和 Context 验证原创建、重复认回、模式内容及关闭重开；Session identity bridge 与 authorization policy 仍是具名夹具。上述性质不是完整权限捕获或 Agent/Tool 动作资格的证明。
