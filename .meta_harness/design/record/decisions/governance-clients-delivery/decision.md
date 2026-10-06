# 治理客户端与 CLI 生命周期的限定产品接受

状态：R1-T3 产品候选已技术接受，身份领域整体尚未完成。

负责人 panqiwei 在本会话授权实施整改、逐增量验收并合入。主会话于 2026-10-05 01:44:31 UTC 在该委托内接受 `69492d46c10ec27bbc6943c7194d8be2d7b259d2`，BASE 为 `beef18017170eb70cae2c6bf3afb121b18a0139e`。这不表示负责人已亲自逐条审阅或系统验收完成。

依据为[身份集成设计采用](../identity-integration-design/decision.md)、[客户端绑定坐标](../identity-t3-binding-coordinates/decision.md)、[CLI 关闭投影修正](../identity-cli-close-projection/decision.md)、[D-114](../cordis-integration-conventions/decision.md)和[D-115](../actual-architecture-and-thin-spec/decision.md)。来源研究为 [architecture-judgment-aids](../../../../research/architecture-judgment-aids/research.md)。精确运行、失败及有限范围见[证据](../../evidence/2026-10-05-tests-governance-clients/README.md)。

## 接受内容

- CLS、CG、HT 的公共定义归 core，提供者使用 sqlite/local/https 限定名称。纯根与 Cordis 绑定分面，独立工厂显式接受依赖；公共操作、EC2 路由词汇和 Schema 只有一个拥有者。
- 三对独立/managed 绑定使用正式 Service 和唯一服务键。managed 复用已交付的 assembly-lifecycle；新增关闭观察资源只传递同一次原关闭尝试，不取得业务关闭权。
- CLI 应用私有 assembly 选择具体提供者，控制面消费公共接口。停止请求、CG 实际静止、表示恢复和 CLS 释放分别观察。CG close 拒绝保持原错误、报告和 70，不恢复终端、不释放依赖、不假称整体关闭。
- 原 56 导出、31 线上路由、34 CLI 动作及 CAS、身份、业务错误优先级保持。3 Schema 字节/URI、持久数据身份与原客户端 EC2/HT2 版本保持。没有采用 EC3/HT3 或改变租户政策。
- 三个旧 frontend 目录、旧插件根、重复类型权威及转发兼容入口在取代范围内删除。实际 CLI、客户端、服务端词汇消费者、生成器与检查入口同步迁移。

## 接受依据与发现处置

独立 QA 的 47 项冻结标准全部 Pass，判决 Pass with issues。所选 539 测试、真实 SQLite/TLS/Unix/CLI、实际 tarball、有限 PTY 和生命周期故障场景通过。实施评审及最终补审没有剩余阻断。最终候选可执行验收和 strict loop 的共同硬线通过。主会话逐行核对关闭、启动前缀、CAS/凭据路径与资源完成责任，并读取实际全局关系。

三个 BASE 重入关闭违约、启动取消错映及类型测试标注错位均已修复并独立复验。三个 core 的角色元数据缺口按精确采用关系补齐。QA 首失报告的一处 stdout/stderr 链接错误另作勘误，原件不修改。首次归档设施失败与原保护事故保留，最终 6129 项工作树外原件和源码 bundle 读回通过。

主体 QA 运行在 `7df742c4b`，最终候选仅负类型测试注释定位变化。生产、Schema、锁及 3244 构建产物逐字相同；最终类型和必要共享检查实际复验，因此按输入身份继承，旧运行坐标不改写。27 个原形式配置由主会话实际执行，独立人员读回输入和日志；有限模型不证明实际 OS 或关闭异常。

## 保留责任与后继

本次不接受完整 TUI 发布。完整 GUI/IME/尺寸/宽字符/resize/scrollback/SIGKILL 矩阵仍缺。原 A5 冷恢复因果、EIS 超时、完整 W6、PG 及 EC2 formal README 登记缺口保留。它们没有遮蔽本增量冻结标准的必需观察，不能因此被关闭或削弱后继验收。

88 项存量 IC 偏离、其他静态 unknown 与 50 项旧实现映射仍分别保留 R1-T4/T5、R2、R3 和 N5/N6 责任。逐项处置不是整改完成。原业务契约、模型及未迁承诺继续有效，模块集成承诺的迁移不等于整份旧规格退役。

本事件只接续 T3 设计的产品交付状态。合入及保全读回完成后才关闭 T3 整项，再从最新 main 开始 T4。N1～N4、T1/T2 和原设计接受历史保持；R1-T5、R2、R3、N5～N8 仍按原门推进。
