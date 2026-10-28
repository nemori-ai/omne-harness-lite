# tool-cordis-contract 公开接口

`./testing` 的 `toolLoaderSourceConformance` 经公开 `loaderFor(authority)` / `load` 接缝观察设置读取来源。两名租户登记者使用同一官方或组织贡献时，每次读取仍须来自贡献所在层。缺 Loader 的夹具报告不适用。当前 [loader-source.spec.ts](../tests/loader-source.spec.ts) 只验证套件能识别正确替身与租户泄漏反例，不证明真实 Loader、设置 SDK 或 G7 已交付。

根入口 `.` 不导出值。`./cordis` 由 [src/cordis.ts](../src/cordis.ts) 定义，源码是唯一定义，本页不手写签名。

- 20 个抽象 Service 类与 1 个具体类 `ToolInstancesService`，共 21 个，另有 21 个键常量。`ToolStartFenceService`（键 `toolStartFence`）只投影 `ToolStartFence` 的 `invalidate`，与 `ToolStartAuthorityService` 由同一提供者兑现同一排序域。其中 `ToolContributionAuthorityService`（`verify`、`admits`）与 `ToolGenerationsService`（`ensureLoaded`、`unload`、`sweep`、`loaderFor`）来自 [RFC-0012](../../../../docs/rfcs/RFC-0012-tool-dynamics.md)；`ToolBindingsService` 另投影登记表的 `snapshot`、`pins`、`close`、`reopen`、`drain`。`VerifiedAuthority` 是带品牌的 `ToolAuthority`，没有运行时构造器，只由 `ToolContributionAuthority.verify` 的实现产出，普通 `ToolAuthority` 不能代替它。随它们导出的类型是 `VerifiedAuthority`、`ToolAuthorityFailure`、`ToolContributionAuthority`、`ToolLoadFailure`、`ToolLoadState`、`ToolUnloadState`、`ToolSweepReport`、`ToolGenerationsFailure` 与 `ToolGenerations`。
- `Context` 增补：每个键对应的服务类型。
- `Events` 增补：`tool-cordis-contract/call-changed`，参数是 tenant、ToolCallId 与 ToolRevision；`tool-cordis-contract/binding-changed`，参数是登记键 `ToolBindingKey` 与 `change`（`registered`、`draining`、`released`），规则见 [cordis](cordis.md#配置与变更通知)。
- 实例目录的登记类型：`ToolPublication`、`ToolRegistrationInput`、`ToolRegistrationFailure`、`ToolRegistration` 与 `ToolPublicationAuthority`。RFC-0012 不改变它们。绑定登记表的登记输入 `ToolAuthority` 归 `tool-contract`，见[绑定登记表的登记输入](cordis.md#绑定登记表的登记输入)。

`./testing` 由 [src/testing.ts](../src/testing.ts) 定义：登记语义套件 `toolRegistrationConformance`、回答表 `registrationAnswers`、夹具类型 `ToolRegistrationFixture` 与 `ToolRegistrationService`、守约的非耐久替身 `createMemoryToolRegistrations`、带全部手柄的夹具 `memoryToolRegistrationFixture`，以及从 `tool-contract/testing` 重新导出的 `ConformanceCase`、`AnswerModel`、`AnswerRow`、`CaseVerdict`、`NotApplicable`、`isNotApplicable`、`runConformanceCase`。夹具给出登记服务、租户和 authority 证据，可选手柄是 `asFiber`（以某个调用方 fiber 运行）、`endFiber`（结束 fiber，运行它的自动撤除）、`refuseCheck`（设定同步核验的答复）、`listing`（目录项的 token）、`checkedAgainst`（每次核验时目录的内容）、`renewedAuthority`（同一租户的另一份 authority 证据，用来表示资格换了）、`otherTenant` 与 `otherAuthority`（第二个租户及它自己的 authority，用来表示两个租户分别登记；两者须同时给出，租户须与夹具的租户不同）。手柄缺失的用例报告不适用，不是通过。手柄完成契约：驱动工作的手柄（`endFiber`）只在工作已经落地、且对之后的每次 `register` 与 `listing` 可见之后才 resolve，套件不轮询；`register` 没有进度种类，回答表 `registrationAnswers` 的 `register` 行没有进度行也没有丢失回复行（IC-3：同步核验作答，无法判定时拒绝为 `unavailable`），所以没有完成 register 的手柄。夹具成员 `quietMs`（缺省 25 毫秒）是拒绝之后观察目录有无迟到写入的静默期，是套件唯一的定时等待，不是对答复的轮询。在实例目录实现出来之前，没有第二个实现可对照，自证用生成的边界提供者（回答表无进度行，所以它原样透传）和 `legal` 表中的守约提供者（先预核验再终核验的服务、只认本租户 authority 的核验）代替。守约替身按授予表核验：authority 只对授予它的租户的发布有效，其余答 `denied`；认回比较 fiber、handle、实例、整份执行引用（含代）与 authority，回执取当前这一代。`createMemoryToolRegistrations` 可传入自己的授予表（类型 `ToolRegistrationGrant`）。替身声明 `durability: 'none'`，不能装配进生产，也不证明真实服务。套件只查 IC-3 的登记语义，不在真实 Cordis 下运行；实例目录实现真实 `register` 后，在其测试里运行同一套件。用例与违约变体的对应见 [tests/README](../tests/README.md#登记套件的自证)。

`./testing` 还在同一个 [src/testing.ts](../src/testing.ts) 中定义绑定登记表与动态性的测试资源：

- G7 套件 `toolBindingRegistryConformance`、夹具类型 `ToolBindingRegistryFixture` 与被测登记表类型 `ToolBindingRegistryService`。套件核验登记、认回、冲突、按 token 撤回、fiber 结束撤回、来源层核验与租户范围的读取。
- 守约的非耐久登记表 `createMemoryToolBindingRegistry`（授予表类型 `ToolBindingGrant`，返回类型 `MemoryToolBindingRegistry`）与带全部手柄的夹具 `memoryToolBindingRegistryFixture`。登记表声明 `durability: 'none'`，不能装配进生产。它的 `controls.verify` 扮演来源核验，返回 `VerifiedAuthority`。
- RFC-0012 动态性套件的骨架 `runToolDynamicsSuite`、判据表 `TOOL_DYNAMICS_CRITERIA` 与夹具类型 `ToolDynamicsFixture`。十个用例在 2.5 填入用例体之前报告不适用，不是通过。

类型参数取自 `@omne-harness/tool-contract`。服务行为与依赖分类见 [cordis](cordis.md)。目录职责见 [README](README.md)。
