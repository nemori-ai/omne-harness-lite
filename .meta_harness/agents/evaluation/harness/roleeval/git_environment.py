import os
import re
from collections.abc import Mapping

REPOSITORY_KEYS = (
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE", "GIT_SHALLOW_FILE",
)

# What a host can put into the environment of every git it starts, and that changes what a commit holds or who made
# it: the identity and the dates, the ``GIT_CONFIG_*`` configuration injected by name, the global configuration file
# and the template directory ``git init`` copies hooks from.
HOST_KEYS = (
    "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_AUTHOR_DATE",
    "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_COMMITTER_DATE",
    "GIT_CONFIG", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT", "GIT_TEMPLATE_DIR",
)
_INJECTED_PAIR = re.compile(r"GIT_CONFIG_(KEY|VALUE)_\d+")


def repository_env(base: Mapping[str, str]) -> dict[str, str]:
    return {key: value for key, value in base.items() if key not in REPOSITORY_KEYS}


def isolated_env(base: Mapping[str, str], identity: tuple[str, str] | None = None) -> dict[str, str]:
    """The environment of a git that works on an evaluation copy or template, whatever host it runs on.

    Evaluation repositories are local, so what the host injects for its own sake (identity, credentials, URL
    rewriting, signing, hooks) has no use here and would change the commits. The identity, when one is given, goes
    in by environment variable, which wins over any configuration that is left. The system configuration and
    ``GIT_CONFIG_NOSYSTEM`` stay as they are: Git for Windows needs the former to work at all.
    """
    env = {key: value for key, value in repository_env(base).items()
           if key.upper() not in HOST_KEYS and not _INJECTED_PAIR.fullmatch(key.upper())}
    env["GIT_CONFIG_GLOBAL"] = os.devnull
    if identity:
        name, email = identity
        env.update(GIT_AUTHOR_NAME=name, GIT_AUTHOR_EMAIL=email, GIT_COMMITTER_NAME=name, GIT_COMMITTER_EMAIL=email)
    return env
