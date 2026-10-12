# 中心连接观察：当前设计与未实现边界

产品规则归[产品入口](../../product.0.0.1.legacy/PF-016-cli-tui-delivery-surface/README.md)；本页只维护尚无真实提供者的已采用技术行为及未决，不授予实现或验证状态。公开数据沿实际定义拥有者，不建空包。新增产品政策仍由产品负责人决定。

 `reachability()` 无参数、无授权（不出秘密/治理事实）、无结构拒绝、纯读当前快照，**闭合失败集合为空**。在场 service 必须始终能读；service 缺席是依赖缺席，不编造操作失败。输出三态 undetermined/reachable/unreachable、since、reachCount；天然可重复。

自主探测与进展不是操作副作用：首轮结果之前 undetermined/count0；合法且对端确认的答复（含 business unavailable、login rejected、版本不合）皆 reachable；超时、断开、TLS/对端不能确认、不可解析答复为 unreachable。仅非reachable→reachable 增 count，状态变更才更新时间；clock 读不到不提交新观察，不伪造时间，首次 clock 不可得 since 可缺席。配置 probeInterval/probeTimeout 必填、缺失启动失败；clock 可用条件下探测转态有 interval+timeout 上界，无用户请求仍继续；断线不撤 service、不重跑消费者、不丢在途模型调用。

PF017 已定义 center ID，换址同 ID 是同中心、另 ID 必须被认出，但 ID 非秘密且不证明真实性：客户端必须确认真实对端，否则不交 login、不接受答复。“别的中心时旧据点/会话如何展示”仍归 PF016，不能给连接 service 自造第四态或删会话。旧 probe node 的匿名公共体检假定可消费当前 governance-entry 的真实公开端口；没有自主 probe 提供者，不声明已接线。变化推送未定、未来资产/据点请求面未到；只接观察窄口，不补业务请求。

验证义务与规范输入见[verification](verification/README.md)。尚未闭合的公共语义阻止相应提供者实施，不以迁移目录关闭业务缺口。

clock不可读不立即重探，本地定时器仍保持probeInterval节拍。卸载、替换或重启后新的在场从undetermined/reachCount=0开始，跨在场count不可比较；旧迟到probe不得写新实例。
