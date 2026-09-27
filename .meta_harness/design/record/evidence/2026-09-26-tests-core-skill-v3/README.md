# Core 最终交付、Skill3 实现与公开示例验证

本次接续[此前 core 运行](../2026-09-26-tests-core-final/README.md)，实际集成源为 `06b85a14ab3439b35b4f51211adcb0731fea6908`；最终源码／文档提交 `009997222ff0268d83baa75ffc731990ab3a4587` 仅增加44份公开 README 与一处测试依赖文件名修正。完整输入快照和修正前后摘要见 [configuration.json](configuration.json) 及 `integrated-source-inputs.tar.gz`。采用的精确规格仍从 registry 查找；Skill3 的语义／提供者采用归 [D069](../../decisions/skill-yaml-key-resolution/acceptance.json)。

主调度已接受当前阶段 **221/221** 义务：215个完整本阶段责任与六项混合责任中的 NonConnector 部分；另保留两格式包 U1 的13项技术接受。[逐项签收](technical-acceptance.json)、[完整327项对账快照](acceptance-matrix.final.json)和[Skill15项映射](skill-obligation-map.json)分别记录范围、坐标、原始签名及本次证据。此前206项当前签名保持原样，Skill15项在新3坐标重新接受，旧2签名保留在 `prior_D069_current_epoch` 和本run的修订前快照。90项外部义务和Connector16项没有签收。

产品负责人已明确授权 Skill 收尾后总体提交、推送、PR、squash merge及本地同步／清理；主调度完成了该条件。[原授权及条件履行登记](user-release-authorization.json)限定在本阶段，没有声称人亲自运行全部Skill检查、完整运行时交付或生产准入。

## 实际运行

| 实际检查 | 结果与范围 |
| --- | --- |
| 35成员 build／全workspace typecheck／格式／27条源码规则 | 退出0；每次935个产品／配置／测试输入的前后摘要一致。 |
| Core／util／两个验证工具 | 最终适用结果6534通过、0失败、0跳过；22个成员，逐包数量见[measurement.json](measurement.json)。 |
| Python开发工具与格式入口自测 | 176项Python检查通过；`test:format`退出0。 |
| 独立Skill复核 | 54行为检查通过、严格TS6通过、精确副本负控 clean0／mutant1；483输入未变。全部17个新增规范例子、正文逐字、完整映射图、目录错误优先级和真实AM／AE／Slash入口均实际运行。 |
| 仓库外真实制品消费者 | 实际20个tarball、512公开类型、22 JSON入口、23个独立Schema／426 defs、24个Schema加载记录；138个TS2307及138个Node私有路径拒绝。16资产链与13流链正例通过，已有错坐标／帧数目标负控有效。 |
| 社区双语说明 | 18 core＋两util＋两infra，共22对44份README，57个唯一TS例子通过strict／exactOptional／noUnchecked／skipLibCheck:false及Node运行；双语代码一致，输出与已记录oracle逐字相同。storage的一例仅编译／加载注入提供者的函数，其余相应操作实际执行。PostgreSQL示例仅验证配置，没有连接或事务声明。 |

第一次递归core执行确有一处失败：SA的INPUT-04仍把默认 `skill-package.schema.json` 视为冻结2；默认文件已按D069升3。仅将该条输入名改为实际 `skill-package.v2.schema.json`，原逐字节冻结核对与每个定义的编译断言保持不变。修正后的SA479及原递归尚未到达的组合工具35全部通过；另外20个成员的6020项原通过结果因其全部934个其余受控输入逐字未变而保留。**6534是这些明确适用运行的合计，不把最初递归退出1改称退出0。** 原失败、修正前后输入、全部stdout／stderr与命令原件都在 `root-integrated-gates.tar.gz`。

作者原构建／类型失败和两次负控启动失败、独立验证者最初Slash span fixture失败与根tsc不可用退出254、README首次格式检查失败也原样保留。最终相关执行通过；这些历史失败没有删改或重标。

## 证据与恢复

- `skill-author.tar.gz`／`skill-author.manifest.json`：实现作者252个原始payload，包含实际命令、输入、失败及最后修正；[报告](skill-author-report.md)。
- `skill-independent.tar.gz`／[seal](skill-independent.seal.json)：独立验证148个payload加原始manifest，逐成员回读核对；[结果](skill-independent-report.md)。
- `root-integrated-gates.tar.gz`／其manifest：主调度实际集成命令、输入前后摘要、全部原始输出及执行器。
- `root-packed-consumer.tar.gz`／其manifest：20真实tarball、固定消费者、实际报告和正反结果；排除可重建node_modules。
- `readme-verification.tar.gz`／其manifest：双语实际输入、57例严格编译／运行、oracle、全部原失败及摘要；排除可重建依赖。
- `integrated-source-inputs.tar.gz`／其manifest：1473个完整源码／配置／测试／规范／registry／社区文档输入，支持squash及工作树退休后恢复确切版本。

每份新归档都逐payload读取、比对长度和SHA256，外围清单由 `SHA256SUMS`封存；最终原件不因重跑或后续合并而改写。归档中的原绝对路径描述当时执行位置，恢复时按相应manifest展开到显式隔离检出、安装锁定依赖，保留规范的相对目录结构。此前[有限形式运行](../2026-09-26-formal-core-v3/README.md)、U1原始Python对照及main故障诊断仍沿原输入、原边界引用，没有本次重跑solver的声明。

## 未提升的范围

Skill默认纯值／文本／目录观察入口采用3；AM3／AE3／Slash2仍真实钉2纯值／正文端口。根3合法的作者ref3经旧2实际判定可以返回M12；未改写引用、未伪装为无条件兼容，未保留旧文本reader或Undetermined分支。独立四／五资源上下文只声称各Skill版本自身五个defs，不声称其注册AM2的全部25defs闭包。

目录条目／链接观察由调用方交入，未实现真正目录IO、link解析、权限、脚本执行、Skills运行时、资产注册表／发布／装载、模型请求或输送提供者。六混合项只接受当前NonConnector部分，没有Connector包或其纵线实现。有限测试及既有有限TLC／Alloy结果不构成无条件证明。

**全仓 `make check` 没有绿灯。** 前run已在main基线独立复现三个租户登录迁移失败；本次[再次逐字核对的90个原始源码文件](inherited-main-source-readback.json)全部相同，新infra README不改变源码。这些main继承失败未作为core失败、未修复、未豁免或删除断言；完整原make退出2和独立基线／SQLite探针仍在前run。

用户提出的租户工具“所选资产记录／版本 → 对应执行代码”在未来执行运行时仍有机制缺口，见[受阻消费登记](../../../realization/packages/tools/tool-execution-runtime/verification.md#2026-09-26-租户工具实现版本的受阻消费)。本阶段交付工具定义与纯资产求值，不把按名字登记执行者描述为已经实现租户代码版本绑定。

本程W0三提交推送main后，GitHub [Format运行36257107164](https://github.com/nemori-ai/omne-harness-lite/actions/runs/36257107164)显示failure，但job无执行步骤；API原始annotation明确runner因账户近期付款失败或spending limit未启动，原JSON／命令在 `github-main-check/`。本地对应format命令实际退出0。此为远程执行不可用，没有声称Actions已通过；实际main为unprotected，本次不修改workflow、不调整账户或绕过保护规则。
