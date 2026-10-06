# Session Log：可信装配借用

本页拥有 SessionLogBackingOperations 和受权 SessionLogOwnerOperations 的行为。
现有日志存储的其他承诺不因本页而迁移。

SLB-1：backing 属于可信应用装配面。借用不携带物理关闭权，不授予用户或工具访问权。
受租户约束的入口必须另行完成当前授权；取得 Cordis Context 的可信插件处于此装配边界内。

SLB-2：release 开始即拒绝该借用的新 IO，包括通过缓存引用发起的调用。
成功必须等待已接纳 IO 和未知追加认回。认回须核验原批次的全部成员、顺序和内容；
一次缺席、新尾或另一追加的拒绝不证明原追加未写。

SLB-3：无法认回时 release 可以失败，但须保留借用责任和物理 owner，旧引用仍不能接纳新 IO。
后续 release 可以再次认回；并发重试不能撤销已成功释放的状态。
应用即使已撤除服务，也必须持有未完成清理的责任；不得仅因 fiber 不再可见而关闭物理 owner。

SLB-4：物理 owner 只有在所有借用和各直接使用者的责任都已排空后才能关闭。
backing 排空不替代直接使用者的未知写核验。release 不承诺有界完成：已有 IO 或核验读取
不返回时仍可能等待。无法确认旧进程停止时，冷恢复不得伪造退出证据。

SLB-5：ownerGeneration 标识物理 owner 的寿命。应用每次取得物理 owner 时建立一份 backing，
全部适配器和借用使用该 backing 的固定代号。重载适配器、撤除服务或认回未知写不得换代。
下一任物理 owner 使用新代号；持有旧代核验结果不授予向下一任追加的权利。
代号是身份值，不是授权或日志前缀完整性的证明。

SLO-1：enumerate 只接受本任 owner 私有维护令牌，返回完整持有范围，包括没有观察者
及尚无日志记录的会话。无法确认范围完整时返回 unavailable，不返回部分成功。
复制令牌或另一 owner 的令牌不授予权限。

SLO-2：readPrefix 和 borrow 可使用本任维护令牌，或持有 session.log.coordinate
权限的 SessionAccess。每次 IO 核验当前权限与持久持有租户；tool.read 权限不够。
借用固定租户、会话及 ownerGeneration，不得访问同租户的另一会话。
关闭、释放及撤权后，缓存引用不得接纳新的 IO。

SLO-3：readPrefix 只返回同一 ownerGeneration 下完整、有序、逐项解码的日志前缀及尾号。
按键片段、跨租户记录、缺失位置不能作为共同提交边界。未知写责任沿 SLB-2/3 保留。

SLO-4：维护令牌与普通访问令牌分离。维护权限只收尾已归属的责任；业务恢复写者
须依据完整前缀核验可恢复对象，不得创建新执行意图或新的 Run。低层日志借用不代替
这些业务核验。发布 runtime Ready 前，全部持有会话的恢复均须成功。
