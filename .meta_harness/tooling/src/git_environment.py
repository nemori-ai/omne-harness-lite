from collections.abc import Mapping

REPOSITORY_KEYS = (
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE", "GIT_SHALLOW_FILE",
)


def repository_env(base: Mapping[str, str]) -> dict[str, str]:
    return {key: value for key, value in base.items() if key not in REPOSITORY_KEYS}
