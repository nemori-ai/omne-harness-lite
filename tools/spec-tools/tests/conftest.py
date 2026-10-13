import os

from omne_harness_lite_spec_tools.git_environment import repository_env

env = repository_env(os.environ)
env.pop("OMNE_SUBJECT_ROOT", None)
env.pop("OMNE_RUNNER_ROOT", None)
for key in set(os.environ) - env.keys():
    del os.environ[key]
