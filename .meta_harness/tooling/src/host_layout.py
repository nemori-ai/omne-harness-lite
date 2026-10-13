from pathlib import Path
from typing import NamedTuple


class HostLayout(NamedTuple):
    skills: Path
    agents: Path
    hooks: Path
    package: Path | None = None
    plugin_hooks: Path | None = None

    @property
    def directories(self) -> tuple[Path, ...]:
        return (self.skills, self.agents)


HOSTS = {
    "claude-code": HostLayout(Path(".claude/skills"), Path(".claude/agents"), Path(".claude/settings.json")),
    "codex": HostLayout(Path(".agents/skills"), Path(".codex/agents"), Path(".codex/hooks.json")),
    "cursor": HostLayout(Path(".cursor/skills"), Path(".cursor/agents"), Path(".cursor/hooks.json"),
                         Path(".cursor"), Path(".cursor/plugin-hooks.json")),
}


def project_targets(hosts=tuple(HOSTS)) -> dict[str, tuple[str, ...]]:
    targets: dict[str, tuple[str, ...]] = {}
    for host in hosts:
        for directory in HOSTS[host].directories:
            root, child = directory.parts
            targets[root] = (*targets.get(root, ()), child)
    return targets
