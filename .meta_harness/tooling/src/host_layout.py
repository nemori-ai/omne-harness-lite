from pathlib import Path
from typing import NamedTuple


class HostLayout(NamedTuple):
    skills: Path
    hooks: Path
    package: Path | None = None
    plugin_hooks: Path | None = None

    @property
    def directories(self) -> tuple[Path, ...]:
        return (self.skills,)


HOSTS = {
    "claude-code": HostLayout(Path(".claude/skills"), Path(".claude/settings.json")),
    "codex": HostLayout(Path(".agents/skills"), Path(".codex/hooks.json")),
    "cursor": HostLayout(Path(".cursor/skills"), Path(".cursor/hooks.json"),
                         Path(".cursor"), Path(".cursor/plugin-hooks.json")),
}


# Directories that older generators wrote and the sources no longer produce. Delivery deletes
# them, and `--check` reports them, so an existing checkout cannot keep loading retired roles.
RETIRED = {
    "claude-code": (Path(".claude/agents"),),
    "codex": (Path(".codex/agents"),),
    "cursor": (Path(".cursor/agents"),),
}


def project_targets(hosts=tuple(HOSTS)) -> dict[str, tuple[str, ...]]:
    targets: dict[str, tuple[str, ...]] = {}
    for host in hosts:
        for directory in HOSTS[host].directories:
            root, child = directory.parts
            targets[root] = (*targets.get(root, ()), child)
    return targets
