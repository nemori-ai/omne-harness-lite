"""Check the fixed Evaluation commands and their targeted negative controls."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import tempfile

MODELS = Path(__file__).resolve().parent
execute = runpy.run_path(str(MODELS / 'check-root-settings.py'))['execute']
WITNESSES = ['fourLayerInstance', 'replacementConstrained', 'pickSkipped',
             'usableByFallback', 'unusableConstrains', 'unlockedForbid']
ASSERTIONS = ['TeamAssetsStayInTree', 'LockTruncates', 'DisableIsDisjunction',
              'WorkspaceNeverSourcesPermission', 'WorkspaceNeverSourcesPlacement',
              'WorkspaceNeverSourcesGovernance', 'OfficialLowerBound',
              'ReplacementCannotEscapePermission', 'NonFittingPickNeverSources',
              'UnusableNeverEffective', 'UnusableKeepsBounds', 'ForbidIsBound']
POSITIVE = {**{name: ('run', True) for name in WITNESSES},
            **{name: ('check', False) for name in ASSERTIONS}}
PERMISSIONS = '''fun permParticipating[c: Cap, i: Item] : set Assign {
  { x: Assign | x.acap = c and x.item = i
      and (x.at = Session
           or (x.at in Organization + Tenant and some h: inEffect[c] | h.layer = x.at)) }
}'''
CANDIDATES = '''fun candidates[c: Cap] : set Holding {
  { h: surviving | h.hcap = c and
      (no lockHolding[c]
        or not (lockHolding[c].layer -> h.layer in assetLt)
        or h.asset = lockHolding[c].asset) }
}'''
FROM = '''fun permFrom[c: Cap, i: Item] : set Layer {
  (some permPicks[c, i] & Fits) => permInnermost[(permPicks[c, i] & Fits).at]
  else ((c -> i) in Values.defaultFits and effective[c] not in WsAsset) => Factory
  else (some permBounds[c, i]) => permInnermost[permBounds[c, i].at]
  else Factory
}'''
MUTATIONS = [
    ('M1', CANDIDATES, 'fun candidates[c: Cap] : set Holding { { h: surviving | h.hcap = c } }', 'LockTruncates'),
    ('M2', 'fun notDisabled : set Holding { { h: Holding | h.asset not in disabledAssets } }', 'fun notDisabled : set Holding { Holding }', 'DisableIsDisjunction'),
    ('M3', PERMISSIONS, PERMISSIONS.replace('Organization + Tenant', 'Organization + Tenant + Workspace'), 'WorkspaceNeverSourcesPermission'),
    ('M4', 'fact OfficialNeverDisabled { no h: Disabled | h.asset.origin = Official }', '', 'OfficialLowerBound'),
    ('M5', 'fact InputHoldingsStayInTree {\n  all h: Holding | h.asset.origin = Official or h.asset.owner in TreeOwner\n}', '', 'TeamAssetsStayInTree'),
    ('M6', 'and not (x.at = Workspace and i in PlacementItem + GovernanceItem)', 'and not (x.at = Workspace and i in GovernanceItem)', 'WorkspaceNeverSourcesPlacement'),
    ('M7', PERMISSIONS, PERMISSIONS.replace('inEffect[c] | h.layer = x.at', 'inEffect[c] | h.layer = x.at and h.asset = effective[c]'), 'ReplacementCannotEscapePermission'),
    ('M8', FROM, 'fun permFrom[c: Cap, i: Item] : set Layer { (some permParticipating[c, i]) => permInnermost[permParticipating[c, i].at] else Factory }', 'NonFittingPickNeverSources'),
    ('M9', 'fun surviving : set Holding { notDisabled - Unusable }', 'fun surviving : set Holding { notDisabled }', 'UnusableNeverEffective'),
    ('M10', 'fact OfficialNotJudged { no h: Unusable | h.asset.origin = Official }', '', 'OfficialLowerBound'),
    ('M11', PERMISSIONS, PERMISSIONS.replace('inEffect[c]', 'candidates[c]'), 'UnusableKeepsBounds'),
    ('M12', 'fun permBounds[c: Cap, i: Item] : set Assign { permParticipating[c, i] & (LockedAssign + ForbidAssign) }', 'fun permBounds[c: Cap, i: Item] : set Assign { permParticipating[c, i] & LockedAssign }', 'ForbidIsBound'),
    ('M13', 'and not (x.at = Workspace and i in PlacementItem + GovernanceItem)', 'and not (x.at = Workspace and i in PlacementItem)', 'WorkspaceNeverSourcesGovernance'),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--validity', action='store_true')
    args = parser.parse_args()
    args.output.resolve().mkdir(parents=True, exist_ok=True)
    target = Path(tempfile.mkdtemp(prefix='run-', dir=args.output.resolve()))
    model = MODELS / 'Evaluation.als'
    version = subprocess.run(['alloy', 'version'], capture_output=True, text=True, check=True).stdout.strip()
    summary = {'alloy_version': version, 'validity': args.validity,
               'input_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                for p in [model, Path(__file__), MODELS / 'check-root-settings.py']},
               'results': {}}
    if args.validity:
        original = model.read_text()
        for name, old, new, assertion in MUTATIONS:
            if original.count(old) != 1:
                raise RuntimeError(f'Mutation site drift: {name}')
            directory = target / name
            directory.mkdir()
            mutant = directory / 'Evaluation.als'
            mutant.write_text(original.replace(old, new, 1))
            summary['results'][name] = execute(mutant, directory / 'out', assertion, {assertion: ('check', True)})
    else:
        summary['results']['positive'] = execute(model, target / 'out', '*', POSITIVE)
    (target / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({'status': 'passed', 'validity': args.validity,
                      'cases': sum(len(v['commands']) for v in summary['results'].values()),
                      'summary': str(target / 'summary.json')}))


if __name__ == '__main__':
    main()
