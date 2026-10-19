# tool-cordis-contract 公开接口

根入口 `.` 不导出值。`./cordis` 由 [src/cordis.ts](../src/cordis.ts) 定义，源码是唯一定义，本页不手写签名。

- 17 个抽象 Service 类与 1 个具体类 `ToolInstancesService`，共 18 个，另有 18 个键常量。
- `Context` 增补：每个键对应的服务类型。
- `Events` 增补：`tool-cordis-contract/call-changed`，参数是 tenant、ToolCallId 与 ToolRevision。
- 实例目录的登记类型：`ToolPublication`、`ToolRegistrationInput`、`ToolRegistrationFailure`、`ToolRegistration` 与 `ToolPublicationAuthority`。

`./testing` 由 [src/testing.ts](../src/testing.ts) 定义：登记语义套件 `toolRegistrationConformance`、回答表 `registrationAnswers`、夹具类型 `ToolRegistrationFixture` 与 `ToolRegistrationService`、守约的非耐久替身 `createMemoryToolRegistrations`、带全部手柄的夹具 `memoryToolRegistrationFixture`，以及从 `tool-contract/testing` 重新导出的 `ConformanceCase`、`AnswerModel`、`AnswerRow`、`CaseVerdict`、`NotApplicable`、`isNotApplicable`、`runConformanceCase`。夹具给出登记服务、租户和 authority 证据，可选手柄是 `asFiber`（以某个调用方 fiber 运行）、`endFiber`（结束 fiber，运行它的自动撤除）、`refuseCheck`（设定同步核验的答复）、`listing`（目录项的 token）、`checkedAgainst`（每次核验时目录的内容）、`renewedAuthority`（同一租户的另一份 authority 证据，用来表示资格换了）、`otherTenant` 与 `otherAuthority`（第二个租户及它自己的 authority，用来表示两个租户分别登记；两者须同时给出，租户须与夹具的租户不同）。手柄缺失的用例报告不适用，不是通过。手柄完成契约：驱动工作的手柄（`endFiber`）只在工作已经落地、且对之后的每次 `register` 与 `listing` 可见之后才 resolve，套件不轮询；`register` 没有进度种类，回答表 `registrationAnswers` 的 `register` 行没有进度行也没有丢失回复行（IC-3：同步核验作答，无法判定时拒绝为 `unavailable`），所以没有完成 register 的手柄。夹具成员 `quietMs`（缺省 25 毫秒）是拒绝之后观察目录有无迟到写入的静默期，是套件唯一的定时等待，不是对答复的轮询。在实例目录实现出来之前，没有第二个实现可对照，自证用生成的边界提供者（回答表无进度行，所以它原样透传）和 `legal` 表中的守约提供者（先预核验再终核验的服务、只认本租户 authority 的核验）代替。守约替身按授予表核验：authority 只对授予它的租户的发布有效，其余答 `denied`；认回比较 fiber、handle、实例、整份执行引用（含代）与 authority，回执取当前这一代。`createMemoryToolRegistrations` 可传入自己的授予表（类型 `ToolRegistrationGrant`）。替身声明 `durability: 'none'`，不能装配进生产，也不证明真实服务。套件只查 IC-3 的登记语义，不在真实 Cordis 下运行；实例目录实现真实 `register` 后，在其测试里运行同一套件。用例与违约变体的对应见 [tests/README](../tests/README.md#登记套件的自证)。

类型参数取自 `@omne-harness/tool-contract`。服务行为与依赖分类见 [cordis](cordis.md)。目录职责见 [README](README.md)。
