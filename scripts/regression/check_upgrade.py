#!/usr/bin/env python3
"""Require the complete approved ZIP for comparison; never auto-promote a candidate."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
EXPECTED='eb9af5ecff5f8fc8a5b1b6194fa7adcf09944bc153e58ff8a4bce673a43f91fe'
p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,required=True);p.add_argument('--candidate',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
if not a.baseline.is_file() or not a.candidate.is_file():p.error('Both complete release ZIPs must exist.')
h=hashlib.sha256(a.baseline.read_bytes()).hexdigest()
if h!=EXPECTED:p.error('Baseline is not the approved uploaded v0.5.24 archive. A new approved baseline requires explicit review, not automatic substitution.')
a.output.parent.mkdir(parents=True,exist_ok=True)
cmd=[sys.executable,str(ROOT/'audit_smoke.py'),'--archive',str(a.candidate),'--compare',str(a.baseline),'--snapshot',str(ROOT/'baseline-file-hashes.json'),'--output',str(a.output)]
r=subprocess.run(cmd,check=False)
if r.returncode:sys.exit(r.returncode)
print('Preservation/automated gate passed. This does NOT approve production promotion; complete LIVE-ACCEPTANCE.md and resolve the implementation ledger first.')
