你被派来评审一份候选规格。

- **设计工作区**：`{WORKDIR}/.meta_harness`（当前目录 `{WORKDIR}` 是承载它的仓库根）。
- **待审对象**：`composition.governance-center-entry-https-json` v1（治理中心入口的传输绑定），首稿。文件是
  `.meta_harness/design/spec/compositions/governance-center-entry-https-json/v1/contract.md` 与同目录的 `examples.md`、
  上一级的 `verification.md` 与 `README.md`；它的登记在 `.meta_harness/design/registry/`。精确快照：本检出的 HEAD。
- **它落实的设计**：入口契约 `composition.governance-center-entry` v1（已接受）要一份可冻结的传输绑定；采用依据是入口层节点
  `.meta_harness/design/realization/packages/tenancy/governance-center-entry/design.md` 的「传输机制候选」。
- **范围**：这一份契约、它在 registry 里的登记，以及 spec 入口对它的说法；它依赖的契约只在核对引用时读。
- **状态**：候选，尚未接受。
- **只读**：不写任何文件，结果在返回消息里交付。
- **本次判断：表达。**
