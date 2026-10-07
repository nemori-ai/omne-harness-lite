# pi-ai-transport

- kind：`provider`
- 源码位置：本旧映射坐标为 `packages/model/pi-ai-transport`；当前实现归[实际成员](../../../../../../packages/model/pi-ai-transport/README.md)。本坐标不声明旧路径仍是源码位置。
本节点描述 OpenRouter 传输适配提供者。实际源码、公开 API 和装载入口见[产品包](../../../../../../packages/model/pi-ai-transport/README.md)。公开函数可独立消费；Cordis 绑定从包的显式插件入口装载。

传输负责请求规划、一次发送和流翻译；锚点、结算、最终成因分类、凭据来源和调用生命周期由 [model-request-runtime](../model-request-runtime/README.md) 及各承诺拥有者负责。传输不隐藏重试、回退或重定向。脚本化传输可以在验收装配中替换生产提供者。

## 当前范围

当前线上承载范围为 text/image。完整定义不因当前承载范围缩减，音视频仍返回 `modality_not_carried`。共享 reader 的相邻推理条目合并、签名更新、跨路由 opaque 拒绝及不可解释密文处理，见 [design.md「共享 reader 与承载边界」](design.md#共享-reader-与承载边界)。这些规则不关闭上下文组装、截断完整性和 encrypted 工具身份投影各自的缺口。

公开完整模型声明、目录条目及版本坐标以产品包当前公开入口为准。目录收齐不代表逐叶发送、缓存、计量或回放认证完成；有限模型和局部用例也不代表全部型号在当前代码上完成认证。

## 精确采用与未完成义务

技术采用与实现、验证分别判断。下列页面的「当前采用范围」只接受列出的范围，不能由文件存在、旧候选标题或局部测试推及整页。

| 内容 | 当前拥有者 | 必须保留的边界 |
| --- | --- | --- |
| 按来源定界的凭据政策、共享 text/headers/json 与同次头交接 | [凭据路径](v6-credential-path-design.md#当前采用范围) | CP-V/PH-V、完整内容秘密边界和实际资源收口独立验证；不增加未声明的业务保密保证 |
| OpenRouter refusal 映射为既有 text | [refusal 映射](v14-refusal-design.md#当前采用范围) | RF-V1～RF-V9、共享 reader 绑定及真实 service 历史回放仍按义务核对；不增加公共操作或额外 drain |
| 请求期图片缩放/重编码、有限搜索与共享计量依据 | [图片准备](v15-image-preparation-design.md#当前采用范围) | IP-V1～IP-V10、native 实际停止、资源上限及 wire/计量一致性分别验证；不包含媒体平台或完整 Session/Run/Agent |
| 响应观察与 full/φ/δ、多个历史输出组、逐家计量适用域 | [响应校准](v12-usage-calibration-design.md)、[输出组](v13-output-history-design.md)、[验证义务](verification.md) | 宿主原事实、同前缀来源、上游回放接受与逐型号计量不能由接口齐备推定 |

其它增量从对应页面的明确采用范围和 [catalog](../../../../registry/catalog.json) 读取；本入口不重新授予候选接受状态。旧投影中的缺口只能由其当前拥有者按相应闭合条件处置。

## 阅读入口

| 当前问题 | 入口 |
| --- | --- |
| 公开使用、完整定义、版本化模型目录和 meter 工厂 | [产品包 README](../../../../../../packages/model/pi-ai-transport/README.md) |
| 传输责任、上游来源及跨 owner 边界 | [设计](design.md) |
| 哪个资源支持哪条承诺、前提和有限范围 | [绑定表](bindings.yaml) |
| 正负控、真实网络、逐型号验证及剩余义务 | [验证方法与范围](verification.md) |
| runtime 生命周期、ACK 和恢复 | [运行时节点](../model-request-runtime/README.md) |

每次执行的输入、输出、评审和接受过程留本工作树 `tmp/<task>/`。本入口只维护当前职责、采用范围、导航与限制，不保存阶段流水。
