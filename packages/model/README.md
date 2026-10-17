# 模型调用能力组

本组拥有模型档案、完整请求校验、真实发出、原输出、结果保管及费用事实的工程组织。产品 CAP-MD01 至 CAP-MD13 已全部接受并承诺在 0.1.0 交付；非 pi-ai 技术设计已接受，pi-ai 相关细化仍为候选；源码实现与运行验证分别判断。

## 成员与依赖

| 成员 | 责任与实际状态 | 阅读入口 |
| --- | --- | --- |
| model-contract | 已接受设计、已初始化骨架；拥有共同协议、公开值与端口，根源码为空 | [成员入口](model-contract/README_ZH.md)、[行为规格](model-contract/SPEC.md) |
| model-cordis-contract | 已接受设计、已初始化骨架；拥有 Cordis 定义和登记协议，根及 ./cordis 源码为空 | [成员入口](model-cordis-contract/README_ZH.md)、[行为规格](model-cordis-contract/SPEC.md) |
| model | 已接受设计、已有骨架；拥有可复用执行与协调设计；凭据存在性与解析的判定已有实现，托管运行尚未实现 | [成员入口](model/README_ZH.md)、[实现规格](model/SPEC.md) |
| model-host-local | 由模板生成；目前只承载本地凭据保管（文件保管库与 Cordis 插件），其余宿主能力尚未实现 | [成员入口](model-host-local/README_ZH.md)、[行为规格](model-host-local/SPEC.md) |

目标分为 `model-contract`、`model-cordis-contract`、可复用实现 `model` 和单机宿主 `model-host-local`，再组合已采用 pi 技术栈的共享传输、八个厂商家族及两类 tokenizer 引擎包。两个契约成员的文档已落位，model 保留可复用实现设计并暂存宿主装配设计；model-host-local 已承接本地凭据保管，不保留聚合安装门面。完整职责、共同依赖前置和初始化条件见[组架构](docs/architecture.md#成员与新增条件)。具体型号在家族内独立绑定和验证。

## 责任与范围

[产品设计](../../.meta_harness/design/product/model-invocation/design.md)定义承诺，[领域架构](../../docs/domains/model-invocation/architecture.md)划分业务责任，[组架构](docs/architecture.md)决定工程组织。进入成员后，先看[内部架构](model/docs/architecture.md)与[流程](model/docs/flows.md)，再按需读对象模型、公开接口设计、SPEC 和 Cordis 装配。

## 关键协作

Context 选择表示、组装、分配预算及压缩，消费 Model 的计量和校验结论。Model 固定参数与供应商采用，校验完整请求，并在实际发送前核实媒体和最终 payload。Session 保存选择；原发起者保存用途和消费位置。Model 不反向依赖 Agent、Session 或 Tool 的实现。

## 组合验证

[能力覆盖](model-contract/verification/coverage.md)连接产品承诺、内部 module、流程和反例。跨领域验证覆盖同次输入采用、消费者换代、提交未知、首内容、不重复发送、ACK 清理、迟到费用及普通断电耐久。单个模拟 adapter 通过不代替真实供应商和存储证据。

## 维护

行为变更回成员 SPEC，工程分解回组架构，用户后果回产品。提供者记录具体支持范围和验证，不能降低共同契约。组页不另建状态机、服务定义或第二套错误集合。

凭据切片的当前入口见[判定入口](model/docs/public-api.md#已实现的凭据入口)与[本地保管入口](model-host-local/docs/public-api.md)。model 源码已不使用 Cordis 与 proper-lockfile，其包清单里的旧依赖及空入口尚待收口，安装隔离的实际限制见[组架构](docs/architecture.md#凭据切片的现有装配边界)。
