# tool 独立验收夹具

[assembly.ts](assembly.ts) 由独立验收者为 S1–S3 编写。固定文本是场景作者原创的虚构交货记录，随本仓库维护，不含外部数据、密钥、账号或个人信息。

S1 的预期正文是先果园 17 篮苹果，再磨坊 23 袋面粉。执行者通过真实 `executeTool` 和 `createIndependentToolScope` 返回正文。绑定读取合法注册的作者能力，通过公开 renderer、codec 和 custody 生成原 final，公开内存执行源传递该真实执行结果。夹具不 seed 调用、账本事实、结果或 delivery。

外部依赖采用公开 `createTestToolDependencies` 提供的非耐久内存 content、custody、environment、authority、clock、binding，以及来源和身份工厂。夹具只提供当前资格与 scope 授予、排队宿主、catalog 和执行绑定适配。宿主 `schedule` 只排队，真实 driver 在显式 advance 时运行。`children` 的业务方法在本组均不应调用。

凭据是固定的当前协调者，租户来自合法 testing 工厂。装配只允许该租户对象与当前协调者，并按固定 consumer、scope 检查资格。这些测试约束不证明生产授权。

S2 参数使用完整的重复键 JSON 文本。预期来自 Tool SPEC 第12节的逻辑终局规则。S3 的 operation 由公开身份工厂生成，call 从真实受理引用读取。只有公开 authority.exclude 返回成功证据后才推进 driver，不使用私有 refuse 或伪造 exclusion。

场景为消费者生成实际处理记录。`OMNE_QA_EVIDENCE_DIR` 存在时，记录同时写入获准证据目录。证据仅证明当前进程内完成，不承诺跨进程耐久性。验收范围见[独立验收](../README.md)，导航见 [index](index.md)。
