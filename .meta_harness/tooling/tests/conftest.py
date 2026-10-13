import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from git_environment import repository_env

env = repository_env(os.environ)
env.pop("OMNE_SUBJECT_ROOT", None)
env.pop("OMNE_RUNNER_ROOT", None)
for key in set(os.environ) - env.keys():
    del os.environ[key]
