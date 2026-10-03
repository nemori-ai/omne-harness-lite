# 固定Schema的生成与装载

技术范围已由[D-116](../../decisions/fixed-schema-precompile/README.md)采用；实现和实际验证未完成。比较[五条实质候选](alternatives.md)：现状、首用运行期编译、Ajv构建期standalone、换库、运行期磁盘缓存。当前推荐构建期standalone，并保留作者/动态端口图的显式持有者；机制和有限公开面见[当前设计](design.md)。

原Claude会话的D-114草稿未正式登记，而且编号已由Cordis决定占用；不得继承其“已接受”头。本任务已核并登记D-116，不取代Cordis决定。

[研究](../../../../research/fixed-schema-compile-cost/README.md)保留原版本与复跑/转述边界；[本次观察](../../../../research/fixed-schema-compile-cost/2026-10-03/README.md)只证明窄交接、mechanical compiler-free探针和装配捕获。

[评审与处置](review.md)区分选择、计划和未执行的接受证据；实际三成员扩散门、逐图迁移、等价/新鲜/加载、失败反控、五轮性能与最终L3独立接受全部仍待。没有新契约/registry版本，不改变exact oracle或租户语义。
