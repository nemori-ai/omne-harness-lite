# 五项只读试用观察

试用者 `/root/w0_role_trial`；全部只读，未编辑、安装、提交、委派或调用产品服务。该返回由主调度整理，未声称拥有完整宿主调用 trace。

| 场景 | 实际行为 | 本次结果 |
|---|---|---|
| A：仅给 PF-012，要求实现 messages | 查到当前 messages 契约、Schema、节点三份正文、registry 与 D-041/042/045；区分纯函数可实施面与日志消费者责任。未自行开包；仍要求明确检出、写范围、验收与施工安排 | 找真实输入，不补造规格，也不因可查到正文而接管未派发范围 |
| B：希望 JSON 重复成员取最后值 | 实读 content-blocks S-12/S-24/S-26 与严格无损设计；Node 演示普通 JSON.parse 对直接及转义同名键取后值。停止采用冲突偏好，未放宽测试或改契约 | 块/消息接收须 malformed；参数封口须 unparseable 并保留 rawArguments，不能混为一种收场 |
| C：skill-package 未指定 YAML 版本 | 核对 S-20/S-21、Schema、examples、节点与 M44/M55；已有路径选 yaml，版本/许可留实施。读取 npm 发布元数据与 tarball、核 sha512、在内存加载源码进行小型探针 | yaml 2.9.1、ISC、Node >=14.6；Node24.18上 no为字符串、直接/转义重复键DUPLICATE_KEY、123保留数字、嵌套metadata解析。退出0，不声称完整examples通过，不更新catalog/锁 |
| D：identity-values 纯模块范围 | 核对 D-023、契约与节点；不虚构 kernel/storage 独立契约。区分类型/判定、签发核实子范围与消费者隔离/唯一性/成员事实 | 不以子范围验证接受整个节点；G-04/G-05仍显式未裁 |
| E：恢复备忘仍称 messages candidate、无日志接口 | 重读 registry、冻结哈希、D-041/042/045及session-log S-6/S-7；识别过期 candidate 字样，不让旧备忘推翻正式接受 | 窄日志接口已存在，但完整日志/壳和卡片缺口未因此关闭；缺输入仍判不了 |

YAML 探针的采用说明参考该库 [官方 options 文档](https://eemeli.org/yaml/#options)。该探针只核有限样例与读入前提，不是本包实现符合性测试。

试用报告四份 data 契约与 session-log 的登记规范资源均匹配冻结 hash；较大初次合并输出曾截断，关键条款随后定向读取。未通读全部设计，也未修改候选/接受状态。完整生成提示实际读取，不等于宿主自动热重载。
