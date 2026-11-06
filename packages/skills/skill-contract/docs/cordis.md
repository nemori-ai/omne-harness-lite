# Cordis 集成

本包是 `module` 变体的纯契约成员，Cordis 不适用。它没有服务键、插件、事件或需要撤除的资源，不依赖 Cordis，也没有 `src/cordis.ts`。Skill 的服务键与抽象 Service 归成员 [`@omne-harness/skill-cordis-contract`](../../skill-cordis-contract/README.md)，Cordis 插件归 `@omne-harness/skill-host-local` 的 `./cordis` 入口，见[组入口](../../README.md#成员与依赖)。
