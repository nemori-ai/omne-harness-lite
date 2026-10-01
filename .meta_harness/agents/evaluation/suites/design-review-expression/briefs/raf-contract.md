你被派来评审一份候选规格。

- **设计工作区**：`{WORKDIR}/.meta_harness`（当前目录 `{WORKDIR}` 是承载它的仓库根）。
- **待审对象**：`capability.run-attempt-facts` v2 的一轮候选修订，文件是
  `.meta_harness/design/spec/capabilities/run-attempt-facts/v2/contract.md` 与同目录的 `examples.md`、上一级的 `verification.md`；
  它的登记在 `.meta_harness/design/registry/`。精确快照：本检出的 HEAD。
- **它落实的设计**：契约开头「设计依据」「决定」两项列出的产品小节与决定记录。
- **范围**：只这一份契约及它在 registry 里的登记；它依赖的契约只在核对引用时读。
- **状态**：这一轮修订尚未接受，登记状态为 candidate。
- **只读**：不写任何文件，结果在返回消息里交付。
- **本次判断：表达。**
