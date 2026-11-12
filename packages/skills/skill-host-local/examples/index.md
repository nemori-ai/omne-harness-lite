# examples 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：示例的运行前提
- [inspect-directory.ts](inspect-directory.ts)：取快照并检查一个目录包
- [directory-journey.ts](directory-journey.ts)：检查、目录与读取的一次旅程，由 `tests/examples.spec.ts` 运行
- [sample-skill/](sample-skill/SKILL.md)：示例检查的 Skill 包，也是发布示例发布的目录
- [publish-journey.ts](publish-journey.ts)：把一个目录发布成租户的 Skill、求值、经 `SkillAccess` 读取的一次旅程，由 `tests/publish-journey.spec.ts` 运行
- [publish-demo.ts](publish-demo.ts)：运行发布旅程并打印版本号、求值的胜出者、正文的前几行与本机位置
- [official-sample-skill/](official-sample-skill/SKILL.md)：发布示例里同名的官方候选
