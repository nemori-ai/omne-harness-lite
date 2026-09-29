# 评审与处置

revision 1 尚未记录独立评审。待审对象为本包design/alternatives及封存来源；候选推荐不构成接受。写入后将以精确文件SHA派发architecture-reviewer，意见与后继修订追加于此，不覆盖原稿。

## 2026-09-29 独立架构评审 r1

reviewer `/root/image_preparation_design/image_architecture_review`，只读、未跑模型/测试。对象design SHA `21a0415696abef441c45f599a203fb085ba333b8876c26c2b7614b1a4f1a5272`、域读数 SHA `27edad8381bb22a461fca39b1ef94b6dbfe60594a82f8da2c498c0b0b0d50427`，判断范围仅“能否进入精确realization”。结论：无该范围内阻断，推荐A；不是接受或可实施认定。

- N1：shared host不是tenant scope，需明确认证来源、传递、销毁。处置候选在runtimev21：RuntimeSessionAccess.bind后按核过tenant/session/log generation派生opaque scope，独立调用方自持scope；无新持久身份。
- N2：native仍运行时提前返回unavailable会使独立caller误放资源。处置候选在transportv15/runtimev21：首版不提前返回、不在途单飞；prepare实际终结后Promise才完成，close真drain后释放。库hang仍明确未完成。
- 未覆盖：codec/preset probe、完整失败映射、不均匀多图预算、IP-V1～10、异步所有消费点。v15候选采用完整wire贡献下降搜索，未声称均分预算足够或最优编码。
- r1表达残留：中部“领域性质表待补”应按末尾已经补全的表A读取；本记录保留原受审字节，不原地改写r1。

反论保留：B同步planner缩小接口迁移且向独立consumer显式暴露昂贵计算资源；C已有媒体存储时能降低请求冷延迟。A代价是首遇延迟、async迁移、scope/确定性/drain联合兑现。新增授权下载、持久变体、跨owner单飞将触发重新核边界；当前没有这些。下一轮精确节点仍需独立审查。
