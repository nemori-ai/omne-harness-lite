# 评审与处置

revision 1 尚未记录独立评审。待审对象为本包design/alternatives及封存来源；候选推荐不构成接受。写入后将以精确文件SHA派发architecture-reviewer，意见与后继修订追加于此，不覆盖原稿。

## 2026-09-29 独立架构评审 r1

reviewer `/root/image_preparation_design/image_architecture_review`，只读、未跑模型/测试。对象design SHA `21a0415696abef441c45f599a203fb085ba333b8876c26c2b7614b1a4f1a5272`、域读数 SHA `27edad8381bb22a461fca39b1ef94b6dbfe60594a82f8da2c498c0b0b0d50427`，判断范围仅“能否进入精确realization”。结论：无该范围内阻断，推荐A；不是接受或可实施认定。

- N1：shared host不是tenant scope，需明确认证来源、传递、销毁。处置候选在runtimev21：RuntimeSessionAccess.bind后按核过tenant/session/log generation派生opaque scope，独立调用方自持scope；无新持久身份。
- N2：native仍运行时提前返回unavailable会使独立caller误放资源。处置候选在transportv15/runtimev21：首版不提前返回、不在途单飞；prepare实际终结后Promise才完成，close真drain后释放。库hang仍明确未完成。
- 未覆盖：codec/preset probe、完整失败映射、不均匀多图预算、IP-V1～10、异步所有消费点。v15候选采用完整wire贡献下降搜索，未声称均分预算足够或最优编码。
- r1表达残留：中部“领域性质表待补”应按末尾已经补全的表A读取；本记录保留原受审字节，不原地改写r1。

反论保留：B同步planner缩小接口迁移且向独立consumer显式暴露昂贵计算资源；C已有媒体存储时能降低请求冷延迟。A代价是首遇延迟、async迁移、scope/确定性/drain联合兑现。新增授权下载、持久变体、跨owner单飞将触发重新核边界；当前没有这些。下一轮精确节点仍需独立审查。

## 2026-09-29 两节点独立架构评审与复评

同一reviewer只读评审transport v15/runtime v21 r1，原稿保存在commit `8b205cc51fd287858acb3827459fb81da579eced`。对象SHA分别`fefde697135c799dd58e2bc2bf4b92bf2ac105a4303ece896805b102e6bc1da3`／`59ce5361b6b0242938151c9349d68b51d50982cd22c27525f530151fb143f4a4`。

- B1：按实际编码次数计预算时，cache命中可使同输入取得更多候选而改变成功集合；首个prepare输出没有继续搜索状态。
- B2：复合transformRevision与原meter之间没有共同适用性接口，φ缺当前θ，可能长期full或不当strip放行。
- 该轮N1/N2 scope和真实drain已经设计层闭合，但上面两项阻止实施；不是候选A被推翻。

r2改为固定ordinal前缀、batch内部cursor、候选级cache；仅φ增加当前countingBasis，full/δ沿原入口；共同compose/inspect/relate保原observation，明确I复用与O映射分别判。reviewer复评两项关闭、无新增阻断，v15 SHA`da2f74a55ee450e4d4a39fe02bdb5dd7c998b183c11741e0de6b2d223d5b128b`／v21`ae1ee77bcb6e888cf538c631d9bf5a5c4c9c72520954993276664d8649feca80`。后追加HUB57558332/c03ba417 GPT5.6 full/new/φ逐consumer对齐表，单独增审仍无阻断，v15新SHA`9f568fc5978bcee814f1c58ac2f7d7e20fcda89d5ce65a0daa97663c4837af3b`。r2原稿保存在commit `7d1ab3aa`。

reviewer只读查看实际sharp r2 probe result SHA`82e46124eedb0c67e4429f05c24d28fd1ae937fa64650f2328367de156b7df76`，没有重跑；仅承认8项synthetic codec观察，不作为HTTP、所有图像/资源安全或无IO证明。全部实施验收仍待。

## 2026-09-29 两节点表达评审 r2

独立spec-reviewer `/root/image_preparation_design/image_expression_review`核上述r2新SHA、RT10/MR9和HUB公共helper，发现三项阻断：

1. no_candidate未区分单图与总量，planner不能决定metric。
2. factory与batch非法输入/缺policy/无有限总量的表示和返回不闭合。
3. resource满额、reserve/copy顺序、codec借用/销毁和并发close归属未定。

非阻断：旧prepare注释/编码次数残留、prefix_changed优先于basis_changed、primary坐标链接。未发现确定需新MR/RT语义版本的冲突；不表示接受。

r3候选已写精确失败表、显式null、无排队准入、owned预算与native临时内存的区别、借用codec和close/clearScope，以及显式本地preset。已派同reviewer定向复审、architecture-reviewer增审资源细目；当前尚无r3评审结论。codec/有限搜索probe只是有限观察，完整IP-V1～10及实际产品实现仍待。

## 2026-09-29 r3/r4 收束记录

r3原稿保存在commit `ad99ae1594cca91b59484c748e9c41df3cd0c485`。architecture-reviewer对v15 SHA`a4b35f9a03faadff484fb8c6a5369dfdb3a760338ac6ae45a05a711e17de4e92`／v21 SHA`767a636ff35833b28c5ecb159c477b4a76ca1515f4646566f7f05c47ba0e82bf`增审无新阻断；spec-reviewer关闭原B1/B3，保留B2的codec descriptor未定义。作者以r4补LoadedImageCodec/DecodedImage独立技术接口、inspect/reserve/decode/encode/close配对，不新增领域能力。

初版r4 SHA`49e963f7cac2b6bff9308a32e5b33e93a37d671da9c373b51232bcc94ac40670`在新增exact拒绝分支上有反例：有图的nonImageWireBytes只是下界，不能填完整actual。两位独立reviewer均指出此项；作者仅修末段，空images才exact，有图已知非图下界超cap则no_candidate(request_total)→原input_size_unavailable，保留实际量未知。

**最终受审坐标**：transport v15 revision4 SHA`3cf764f6218c2286a93381a5969368085efdd4e9992014ec6c7edd3f8518e26a`；runtime v21 revision3 SHA`767a636ff35833b28c5ecb159c477b4a76ca1515f4646566f7f05c47ba0e82bf`。

- architecture-reviewer增审：本范围无阻断/无新增非阻断/无新增政策事项。codec显式加载、原像素单次decode、真正drain和借用所有权、下界不冒exact均成立于设计；未运行adapter/资源/HTTP验收。
- spec-reviewer追加定点复评：结合前几次定向审查，本次表达与规范范围无阻断、无新增非阻断、无新增政策问题；没有必须升级MR9/RT10的原因，可交主线作采用判断；未跑实现/probe/HTTP/资源峰值，不产生接受。

推荐A和本地preset仍是候选；实际主线采用、代码实现、IP-V1～10、最大资源/真实取消/制品/HTTP各有独立门。本包没有注册新绑定、没有修改已接受契约或冻结提供者正文。
