# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，只做再导出
- [identity.ts](identity.ts)：品牌身份、`SessionAccess`、`Mutation`、交换值的重导出
- [access.ts](access.ts)：`SessionAccessCheck`、关联的操作请求与裁定类型
- [values.ts](values.ts)：快照与固定输入的值类型
- [faces.ts](faces.ts)：失败、回执、四个面、历史页
- [operations.ts](operations.ts)：操作身份的派生与规范文本摘要
- [ports.ts](ports.ts)：构造依赖端口、出站端口、命令与守卫材料、块声明类型
- [block.ts](block.ts)：`sessionModesBlock`
- [judgments.ts](judgments.ts)：结局类型与九个领域服务
- [entries.ts](entries.ts)：条目种类与编码（唯一的一份）
- [decide.ts](decide.ts)：命令到条目批次
- [reduce.ts](reduce.ts)：批次到快照
- [testing.ts](testing.ts)：`./testing` 入口
- [testing-access.ts](testing-access.ts)：显式逐次裁定、请求记录与异常脚本的独立访问检查替身
- [testing-case.ts](testing-case.ts)：套件的用例形状与断言助手
- [testing-values.ts](testing-values.ts)：合法测试值
- [testing-transactions.ts](testing-transactions.ts)：事务端口的替身与一致性套件
- [testing-ports.ts](testing-ports.ts)：身份桥、证据桥、Context 输入与时钟的替身

- [decision-support.ts](decision-support.ts)：判定共用的证据、采用与终态批次
- [decide-management.ts](decide-management.ts)：控制、关系、空闲、冻结与作用域代次
- [decide-results.ts](decide-results.ts)：原调用绑定、保管与处理
- [decide-receive.ts](decide-receive.ts)：外部事实与恢复任务对账
- [projection.ts](projection.ts)：同日志的纯 Session 解释接缝
- [reduce-extended.ts](reduce-extended.ts)：管理与调用登记归约
- [model-view.ts](model-view.ts)：提交时维护的模型视图与压缩核对窗口
- [testing-providers.ts](testing-providers.ts)：空闲、通知、推进与作用域释放替身
- [testing-provider-conformance.ts](testing-provider-conformance.ts)：有效提供者端口一致性套件

- [reduce-results.ts](reduce-results.ts)：结果保管、完成与释放的归约保护
- [result-state.ts](result-state.ts)：原 Run 关系与参加提交引用

- [initialization-plan.ts](initialization-plan.ts)：原来源计划与注册提交身份
- [initialization-parse.ts](initialization-parse.ts)：封闭嵌套值解析
- [initialization-schema.ts](initialization-schema.ts)：守卫协议与保存形状
- [initialization-registration.ts](initialization-registration.ts)：注册绑定与修订
- [initialization-requirements.ts](initialization-requirements.ts)：要求与计划关系
- [initialization-validation.ts](initialization-validation.ts)：完整命令与原项核对
- [decide-initialization.ts](decide-initialization.ts)：初始化同批事实及原回执
- [reduce-initialization.ts](reduce-initialization.ts)：整批校验与原结果索引
- [release-digests.ts](release-digests.ts)：生成的精确发布摘要常量
- [testing-initialization-source.ts](testing-initialization-source.ts)：显式登记的内存可信来源
- [testing-initialization.ts](testing-initialization.ts)：显式实际采用测试前提

## 同日志纯层

- [history-values.ts](history-values.ts)、[history-validation.ts](history-validation.ts)：同根原历史及完整目录校验
- [call-values.ts](call-values.ts)、[call-state.ts](call-state.ts)：调用登记、真实关联及等待
- [control-state.ts](control-state.ts)：固定控制范围及未交清责任
- [frontier-state.ts](frontier-state.ts)、[observation-validation.ts](observation-validation.ts)：最终解除批次及原事件后果
- [work-entry-values.ts](work-entry-values.ts)、[work-entry-state.ts](work-entry-state.ts)：真实条目引用与压缩下界
- [session-validation.ts](session-validation.ts)：本域证据、精确十进制及失败值
- [testing-history-source.ts](testing-history-source.ts)：显式原材料的非耐久夹具

公开形状见[接口导航](../docs/public-api.md#同日志历史材料与控制引用)，验证范围与提供者交接见[同日志纯层](../docs/same-log-pure.md)。完整 Agent 原协议归一、共同根提交和预算接续由适配提供者兑现。
