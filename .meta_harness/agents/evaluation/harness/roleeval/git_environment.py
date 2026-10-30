import os
import re
from collections.abc import Mapping

REPOSITORY_KEYS = (
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE", "GIT_SHALLOW_FILE",
)

# What a host can put into the environment of every git it starts, and that changes what a commit holds or who made
# it: the identity and the dates, the ``GIT_CONFIG_*`` configuration injected by name, the system and the global
# configuration files and the template directory ``git init`` copies hooks from.
HOST_KEYS = (
    "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_AUTHOR_DATE",
    "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_COMMITTER_DATE",
    "GIT_CONFIG", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_COUNT", "GIT_ATTR_NOSYSTEM", "GIT_TEMPLATE_DIR",
)
_INJECTED_PAIR = re.compile(r"GIT_CONFIG_(KEY|VALUE)_\d+")

# Files git reads by default even when no configuration names them: ``$XDG_CONFIG_HOME/git/ignore`` (or
# ``~/.config/git/ignore``) and ``.../git/attributes``. Configuration pointed at the null device replaces them.
_EMPTY_BY_DEFAULT = ("core.excludesFile", "core.attributesFile")


def repository_env(base: Mapping[str, str]) -> dict[str, str]:
    """The environment of a git that reads a repository the user checked out: the host's configuration stays.

    Only the variables that point git at a repository go, so ``-C`` decides which one it reads. The host's
    ``safe.directory`` and the rest of its configuration still apply, as they do for the user's own git.
    """
    return {key: value for key, value in base.items() if key not in REPOSITORY_KEYS}


def isolated_env(base: Mapping[str, str], identity: tuple[str, str] | None = None) -> dict[str, str]:
    """The environment of a git that works on an evaluation copy or template, whatever host it runs on.

    Evaluation repositories are local, so what the host injects for its own sake (identity, credentials, URL
    rewriting, signing, hooks, ignore and attribute files) has no use here and would change the commits. No system
    or global configuration file and no system or user attribute and ignore file is read; the only configuration
    given by environment is this function's own. The identity, when one is given, goes in by environment variable,
    which wins over any configuration in the repository. Copies are made by the user who runs the evaluation, so
    ``safe.directory`` is not needed here; a source checkout is read with ``repository_env``.
    """
    env = {key: value for key, value in repository_env(base).items()
           if key.upper() not in HOST_KEYS and not _INJECTED_PAIR.fullmatch(key.upper())}
    env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull, GIT_ATTR_NOSYSTEM="1",
               GIT_CONFIG_COUNT=str(len(_EMPTY_BY_DEFAULT)))
    for number, key in enumerate(_EMPTY_BY_DEFAULT):
        env[f"GIT_CONFIG_KEY_{number}"] = key
        env[f"GIT_CONFIG_VALUE_{number}"] = os.devnull
    if identity:
        name, email = identity
        env.update(GIT_AUTHOR_NAME=name, GIT_AUTHOR_EMAIL=email, GIT_COMMITTER_NAME=name, GIT_COMMITTER_EMAIL=email)
    return env
