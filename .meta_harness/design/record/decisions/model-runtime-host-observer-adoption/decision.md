# D-103：模型调用宿主与观察端口实施采用

2026-09-28，主线依用户持续实施、主调度和技术验收委托，技术采用 [runtime v11](../../../realization/packages/model/model-request-runtime/v11-host-observer-design.md)，SHA256 `80f680b2cee1362b0820cd930174c9adb6968500731aa2c4bbed157126ce1814`。它精化 D-076／D-087 已采用投影及 D-101 接受的 RT8 S-51/S-61/S-62，承接 [D-102](../model-runtime-owner-close-adoption/decision.md) 的统一收口。依据沿[适配提案](../../proposals/model-request-adaptation/design.md)及本次[独立架构评审记录](../../proposals/model-request-adaptation/review.md)。不发布新业务规格，不新增操作、插件、服务或存储对象。

采用显式 ModelCallHost、原调用准备阶段先登记后异步取资源、真实停止后解除登记；宿主停止直接沿 S-36，不调用 S-31 追加用户中断意图。采用由已核验会话出站提供者建立的 endpoint 私有关联、每次 dispatch 现核目标、独立 receiver、有界 snapshot／event 队列、原位置衔接和真实停止登记。事件与序列化 UTF-8 字节双限都包含在途项，观察失败独立报告而不更改模型结算结果。

同一 call 旧 receiver 未实际停止时，不创建第二份 receiver，不向旧端投递新 target 内容；合法新 dispatch 继续模型业务，该次观察报告 consumer_failed。旧端随后停止不让当前发出的观察中途复活，只在后续 dispatch 重新建立。此处兑现既有有界观察和不阻塞业务承诺，不增加可靠交付保证或隐式重试／超时政策。

独立 architecture-reviewer 对前稿 SHA256 `1f09e797adb8dc6444b0d8b4138c280d51e5a677e751d24fdfe96abf3d0bceeb` 未发现本范围架构阻断，提出跨 dispatch 慢消费者组合验收补强，以及系统停止不经 S-31 的表达消歧。作者仅据这两项及 D-102 状态修正得到本次精确正文；主线核对差分并采纳，H-V6/H-V11 已补组合反例。评审未执行产品测试，最终修订由主线复核，不冒充独立复审。

公开接口和队列由唯一共享 owner 发布，调用路径与宿主装配分别消费；现有数据型 host 别名直接移除，不留旧接口兼容。独立 invoke 继续无会话／Cordis 依赖。真实宿主、身份关联、接收任务生命周期、B/C 接线及 H-V1～12 全部仍待实施验收；新增绑定 0。本次不关闭恢复时序、L1/L2 责任交接、withRun 或逐模型认证缺口，不能据此宣称十三操作完整交付。
