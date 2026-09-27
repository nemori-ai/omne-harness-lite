# MR5 纯值核心：实际实现与有限技术签收

2026-09-27。持续消费者为 `packages/core/model-response` 的 MR5 纯值公开面及后续 runtime/transport 写方。主调度依据已接受 [D-090](../../decisions/model-headers-v5-adoption/decision.md) 和 [v5 provider rev1](../../../realization/packages/core/model-response/v5-design.md)，技术签收该设计 PV1～PV9 的本包有限实施切片。源码 `9512c80b` 已并入 HUB `62da5a5f`；后续 `21c46d46` 仅更正双语 Schema 版本导航，独立验证者确认全部代码块未变。签收不增加规格版本或外部 owner 保证。

作者检查见 [原交接报告](author-report.md)：77 个原规范 JSON 完整块、75 个具名 judge 答案、17 个公开定义的合法/非法样本、两份离仓实际十包 tarball 消费、四个编译成功且被行为 oracle 检出的负控，以及 387 项包测试通过。主调度核对冻结源码、dist、证据和 patch 后，在 HUB 实际重跑 build/typecheck、387 项测试、全局格式和 27+6 源码规则，均 exit 0。

[独立报告](independent-report.md)的原判定是 **Pass with issues**：独立构造 360 个优先级/绑定组合，重新抽取 77 块，以独立 Draft202012 和公共 v5 API 核对；另行构建、打包十个产品包并检查 492 个安装成员，17 个定义及两种编译后行为变异通过。六个双语 literal 代码块编译、执行通过。唯一低级文档问题已由前述文字更正处理；保留原判定，不重写历史结果。

原设计工作区整资源图为 21 资源/862 引用；实际十包整资源图为 15 资源；生产编译器注册固定 12 资源并实际编译全部 17 个公开定义。这三者的范围分别记录，不宣称制品提供通用整资源编译器。根 MR4、显式 v3 及旧 Schema 的冻结字节和行为保留。

原始输入、源码、编译产物、实际 tarballs、oracle、配置、命令 PID/退出码、原始 stdout/stderr、失败记录和报告保全在 [证据归档](evidence.tar.gz)，共 317 个成员；[成员哈希](members.json)和 [归档哈希](archive.sha256)已逐项回读核对。作者 FREEZE 与独立 SHA256 原文在归档内；派发 brief 留在本次任务区，未作为设计正文入档。报告中原绝对路径仅追溯原运行，恢复读取使用归档 `author/` 和 `independent/` 路径。早期作者/独立环境准备未完整捕获 PID 的限制见原报告，后续受控运行保留实际 PID。

本次没有 HTTP/OpenRouter、耐久 append/reopen、真实认证、十三操作、完整观测或 37 官方认证；未运行形式工具，未新增付费。PV9 是相关检查通过，不是整仓测试全绿。MR5-X1～X4、G6、G28/G29/G30/G31/TL-G1 继续由相应真实写方与装配兑现。
