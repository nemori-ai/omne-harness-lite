# 形式工件与实际结果的独立对应复核

2026-09-26，独立 `spec-reviewer` `/root/verification_navigation_review`；对象是HUB `eabfff0f167093f34cfa0582c7e6cf0773761016` 当前SA3／AE3／Messages3及本run未迁移前的完整封存。此记录整理其只读报告，不构成接受、重跑或实现审查。

**阻断：无。** 32份冻结输入等于八份接受资源，七个执行输入与正式3／源2对应，历史输入单列。正式SA正argv与四配置／三个指定不变量和反例轨迹对应，正配置队列归零。全部291条Alloy读数逐一匹配模型command来源和原solver行；28份XML关系与skolem匹配。AE M8的pickSkipped UNSAT是规定变异后果，没有被当作原模型PASS。

**非阻断：无新增应修。** SA拟新增两条formal binding可沿S-6/P-1与S-27/P-7表达；前者保留formal所列S-9落块对应，仅核块次序，后者OneShotAccepted只到模型Valid，不扩大至完整表示／真实代码。共同限制为两索引两片段最多六接受事件、abandon补finish不占上限、无公平性且关闭死锁检查。参数解析、真实载荷、被砍调用、快照、首内容位置、汇总、失败次序、宿主／跨进程都不在binding。Alloy没有正式task，只在verification引用；AE／Messages按构造与前提吸收部分不冒称实现保护证据。

**范围外待裁：无新增。** 原缺口与提供者／装配责任保持各owner。

**未覆盖：** 未重跑solver、自测或产品代码，未审任意规模与实现符合性；读取器八种负控仅读已有结果。全部630 SHA核验由主调度完成，reviewer不声称重复。最终binding／verification落字由主调度负责，reviewer确认上述拟声明可表达，不声称已接受尚未登记的最终文本。
