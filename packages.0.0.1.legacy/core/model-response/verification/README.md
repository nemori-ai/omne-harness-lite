# Model response 验证职责

[薄 SPEC](../SPEC.md)拥有响应、计量与待提交行为。[固定输入](../tests/fixtures/README.md)保留原示例与拒绝期望；每次运行结果留 tmp。

| 范围 | 必须观察的性质 | 方法／责任 |
|---|---|---|
| 响应与收场 | 原 outcome 条件表、每个首拒绝、部分回复／零内容／调用完整性、user 与 system 中断、晚到／处分独立 | 当前规范值、公开类型及全部收场输入 |
| 时间与恢复 | 正常／pending 时间不可 null，锚定责任恢复例外、起止顺序、零 send 不伪 sentAt | recovery timing 与拒绝负控；真实恢复由 runtime 验证 |
| 固定图 | 25 定义、两私有成员入口、精确9资源闭包、移除任一报其准确缺失 URI、MR12 只改身份及两条 Assistant 引用 | 原独立资源摘要、完整转换守卫、缺资源／生成物负控、外部 tarball |
| 校准 | required 联合、CA 输入互斥、未知不零、basis／route／revision、total 与分项、输出组次序数量摘要 | examples.json／纯关系正反例；真实 projection 原件与同次 upstream observation 由适配者另证 |
| 实际输出与留痕 | cache 来源区分、ordered 多值响应头及重复／空值、完整参数与费用原值、失败主体 | 原输入逐值对照；样本不证明所有上游条件 |
| 提交与 ACK | pending 原回复不改、首次消息合法派生、final 只改已允许处分／late、见证一致、来源无法核不可伪成功 | 本包关系拒绝；真实写权、同批／unknown、当前授权及保管见 [runtime](../../model-request-runtime/verification/README.md) |

本包不拥有上游网络发送、最终输入计量来源或 SQL 耐久；合法 hex 不能证明摘要原件。恢复责任和计量模型由实际 runtime 拥有，不在这里复制。Schema 正例不能代替实际跨记录与提交观察。
