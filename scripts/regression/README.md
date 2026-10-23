# Whole-build upgrade check

Run from any directory with Python 3 and Node installed:

```
python check_upgrade.py --baseline /path/to/the-smoke-v0.5.24.zip --candidate /path/to/the-smoke-v0.5.25-rc.1.zip --output /path/to/comparison.json
```

`check_upgrade.py` requires both full archives and checks the baseline ZIP hash before invoking the retained preservation checker. It checks all protected features, catalogue minima, source hashes, compendium records/assets, JavaScript syntax and bundled Node tests. Never replace the supplied baseline hash snapshot with a merely newer build.

A passing preservation gate does not certify newly requested functionality or a production release. The implementation ledger and live acceptance sheet are separate promotion gates. The wrapper deliberately does not approve a candidate or write a new baseline.
