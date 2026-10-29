#!/usr/bin/env bash

omne_repository_command() (
    unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR \
        GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_NAMESPACE GIT_SHALLOW_FILE
    "$@"
)

omne_fixture_command() (
    unset OMNE_SUBJECT_ROOT OMNE_RUNNER_ROOT
    omne_repository_command "$@"
)

omne_staged_command() (
    unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY \
        GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_NAMESPACE GIT_SHALLOW_FILE
    if [[ -n "${GIT_INDEX_FILE:-}" && "$GIT_INDEX_FILE" != /* && "$GIT_INDEX_FILE" != [A-Za-z]:* ]]; then
        export GIT_INDEX_FILE="$PWD/$GIT_INDEX_FILE"
    fi
    "$@"
)
