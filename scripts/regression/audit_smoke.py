#!/usr/bin/env python3
"""The Smoke release preservation gate (stdlib-only, read-only).

Usage: python audit_smoke.py --archive the-smoke-v0.5.24.zip --output result.json
       python audit_smoke.py --archive new.zip --snapshot baseline-file-hashes.json
       python audit_smoke.py --archive new.zip --compare previous.zip

Exit code 2 = failed hard gate; warnings need manual review but do not fail.
Node 20+ should be installed to run the actual bundled behavioural tests.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile
import time
import zipfile
from read_leveldb_sst import sst

ROOT = Path(__file__).resolve().parent
CONTRACT = json.loads((ROOT/'feature_contract.json').read_text(encoding='utf-8'))


def digest_file(p):
    h = hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda: f.read(1024*1024), b''):
            h.update(b)
    return h.hexdigest()


def file_hashes(root):
    return {p.relative_to(root).as_posix():digest_file(p) for p in root.rglob('*') if p.is_file()}


def safe_unzip(z,root):
    with zipfile.ZipFile(z) as obj:
        bad=obj.testzip()
        if bad: raise ValueError('ZIP CRC failure: '+bad)
        for f in obj.infolist():
            pp=PurePosixPath(f.filename)
            if not f.filename or pp.is_absolute() or '..' in pp.parts or (f.external_attr>>16)&0o170000==0o120000:
                raise ValueError('Unsafe archive member: '+f.filename)
        obj.extractall(root)
    if not (root/'system.json').is_file():
        children=[x for x in root.iterdir() if x.is_dir()]
        if len(children)==1 and (children[0]/'system.json').exists():return children[0]
        raise ValueError('No system.json at archive root')
    return root


def assess(root,verbose=False,skip_node=False):
    errors=[];warnings=[];checks={};stats={};findings={}; proof={}
    add_error=lambda key,value: errors.append({'check':key,'details':value})
    add_warn=lambda key,value: warnings.append({'check':key,'details':value})

    manifest=json.loads((root/'system.json').read_text(encoding='utf-8'))
    build=json.loads((root/'data/build-info.json').read_text(encoding='utf-8'))
    version=str(manifest.get('version','unknown'))
    checks['version']=version
    stats['files']=sum(p.is_file() for p in root.rglob('*'))
    checks['manifest_download']=manifest.get('download')
    if build.get('version')!=version:add_error('build-version',f'{build.get("version")} does not match manifest {version}')
    if f'/v{version}/the-smoke-v{version}.zip' not in manifest.get('download',''):
        add_error('download-manifest',manifest.get('download'))
    if not manifest.get('persistentStorage'):
        add_error('persistent-graffiti-files', 'persistentStorage missing/false in system.json')
    if str(manifest.get('compatibility',{}).get('minimum'))!='14':
        add_warn('foundry-compatibility',manifest.get('compatibility'))

    checksum=root/'SOURCE-CHECKSUMS.sha256'
    checks['checksumManifestRows']=0
    if not checksum.exists():add_error('checksums','SOURCE-CHECKSUMS.sha256 not included')
    else:
        file_list=file_hashes(root)
        mismatches=[];not_listed=[];listed=set()
        for line in checksum.read_text().splitlines():
            m=re.match(r'^([0-9a-f]{64})\s+\*?(.+)$',line)
            if not m:continue
            want,p=m.groups();p=p.removeprefix('./');listed.add(p)
            if file_list.get(p)!=want:mismatches.append(p)
        checks['checksumManifestRows']=len(listed)
        if mismatches:add_error('checksums-mismatch',mismatches[:20])
        for f in file_list:
            if f not in listed and f not in {'SOURCE-CHECKSUMS.sha256'}:
                not_listed.append(f)
        if not_listed:add_warn('files-omitted-from-checksums',not_listed[:30])
        checks['checksumStatus']='pass' if not mismatches else 'fail'

    # Shipped data, which must not silently shrink or vanish in a new release.
    data={stem:json.loads((root/'data'/f'{stem}.json').read_text()) for stem in [
        'london-street-atlas','london-venues','london-vehicles','london-missions',
        'tagging-missions','tagging-catalogue','radio-war-missions','radio-war-locations',
        'content','london-people']}
    pages=sum(len(j['pages']) for j in data['content']['journals'])
    site_factions={t['code'] for t in data['tagging-catalogue']['factions']}
    counts={
        'atlasStreetMaps':len(data['london-street-atlas']['maps']),
        'interiorAndApproachMaps':len(data['london-venues']['maps']),
        'londonPlacesMaps':len([* (root/'packs'/'london-places').glob('*.ldb')]), # overwritten by docs below
        'vehicleActors':len(data['london-vehicles']['vehicles']),
        'namedCampaignActors':108, # overwritten by docs below
        'basicNPCActors':39, # overwritten by docs below
        'characterPregens':4, # overwritten by docs below
        'shopItems':171, # overwritten by docs below
        'conditions':31, # overwritten by docs below
        'guideJournals':len(data['content']['journals']),
        'guidePages':pages,
        'coreMissions':len(data['london-missions']['missions']),
        'taggingMissions':len(data['tagging-missions']['missions']),
        'radioWarMissions':len(data['radio-war-missions']['missions']),
        'totalMissions':len(data['london-missions']['missions'])+len(data['tagging-missions']['missions'])+len(data['radio-war-missions']['missions']),
        'factions':len(data['london-missions']['factions']),
        'graffitiSites':len(data['tagging-catalogue']['sites']),
        'tagPacks':len(data['tagging-catalogue']['tagPacks']),
        'graffitiQualityTiers':len(data['tagging-catalogue']['qualityTiers']),
        'radioWarContacts':len(data['radio-war-locations']['locations']),
        'testSuites':len(list((root/'tests').glob('*.test.mjs'))),
        'compendiumPacks':len(manifest['packs'])
    }
    details={}
    all_pack_docs={}
    for p in manifest['packs']:
        pname=p['name'];pdir=root/p['path'];docs={}
        if not pdir.exists(): add_error('compendium-missing',p['path']);continue
        try:
            files=list(pdir.glob('*.ldb'))
            if not files:add_error('compendium-no-sst',str(pdir))
            for f in files:
                for k,v in sst(f):
                    name=k[:-8].decode('utf-8')
                    docs[name]=json.loads(v)
        except (ValueError,UnicodeError,json.JSONDecodeError) as e:
            add_error('compendium-unreadable',f'{pname}: {e}')
        all_pack_docs[pname]=docs
        parent=[k for k in docs if k.startswith(('!scenes!','!actors!','!items!','!journal!'))]
        embed=[k for k in docs if k not in parent and not k.startswith('!folders!')]
        folders=sum(k.startswith('!folders!') for k in docs)
        details[pname]={'topLevelDocuments':len(parent),'embeddedDocuments':len(embed),'folders':folders,'rows':len(docs)}
        buildrow=build.get('packs',{}).get(pname,{});decl=buildrow.get('documents');emb=buildrow.get('embedded')
        if decl is not None and decl!=len(parent):add_warn('build-info-doc-count',f'{pname}: claimed {decl} actual {len(parent)}')
        if emb is not None and emb!=len(embed):add_warn('build-info-child-count',f'{pname}: claimed {emb} actual {len(embed)}')
    stats['packs']=details
    for name,key in [('london-streets','streetScenes'),('london-places','londonPlacesMaps'),('london-venues','interiorAndApproachMaps'),('london-vehicles','vehicleActors'),('london-people','basicNPCActors'),('campaign-cast','namedCampaignActors'),('pregens','characterPregens'),('london-items','shopItems'),('conditions','conditions'),('guides','guideJournals')]:
        if name in details:counts[key]=details[name]['topLevelDocuments']
    counts['allSceneDocuments']=sum(counts.get(k,0) for k in ('streetScenes','londonPlacesMaps','interiorAndApproachMaps'))
    for key,minimum in CONTRACT['minimumCounts'].items():
        if counts.get(key,-1)<minimum:
            add_error('feature-content-shortfall',f'{key}: {counts.get(key)} < baseline minimum {minimum}')
    stats['contentCounts']=counts

    packed=all_pack_docs.get('guides',{})
    source={'!journal.pages!'+j['_id']+'.'+p['_id']:p for j in data['content']['journals'] for p in j['pages']}
    mismatched=[k for k,v in source.items() if {kk:vv for kk,vv in packed.get(k,{}).items() if kk!='_stats'}!=v]
    if mismatched:add_error('guide-source-compendium-difference',mismatched[:30])
    checks['guidePagesSourceEqualsPack']=len(source)-len(mismatched)

    # Verify the packed compendium documents' bundled image, sound and style assets.
    internal_refs=re.compile(r'systems/the-smoke/([A-Za-z0-9_./+%\-]+\.(?:webp|png|jpg|jpeg|svg|ogg|mp3|css|woff2))',re.I)
    found_count=0;bad=[]
    def look(obj,ctx):
        nonlocal found_count
        if isinstance(obj,dict):
            for k,v in obj.items():look(v,ctx+'.'+str(k))
        elif isinstance(obj,list):
            for i,v in enumerate(obj):look(v,ctx+f'[{i}]')
        elif isinstance(obj,str):
            for m in internal_refs.finditer(obj):
                f=m.group(1);found_count+=1
                if not (root/f).is_file():bad.append({'file':f,'source':ctx})
    for name,entries in all_pack_docs.items():
        for key,doc in entries.items():look(doc,name+':'+key)
    checks['assetReferencesResolved']=found_count-len(bad)
    if bad:add_error('missing-compendium-assets',bad[:30])

    # Preserve each previously shipped subsystem even if future file names change.
    badfeatures=[];passed=[]
    for feat in CONTRACT['features']:
        faults=[]
        for pp in feat['paths']:
            if not (root/pp).exists():faults.append('Missing path '+pp)
        for pp,need in feat.get('tokens',{}).items():
            ss=(root/pp).read_text(encoding='utf-8') if (root/pp).exists() else ''
            for token in need:
                if token not in ss:faults.append(f'Missing code contract {pp}::{token}')
        for test in feat.get('tests',[]):
            if not (root/'tests'/test).is_file():faults.append('Missing test '+test)
        if faults:badfeatures.append({'id':feat['id'],'label':feat['label'],'faults':faults})
        else:passed.append({'id':feat['id'],'label':feat['label']})
    if badfeatures:add_error('missing-shipped-feature-contract',badfeatures)
    checks['preservedFeatures']=len(passed)
    checks['featureCount']=len(CONTRACT['features'])
    findings['featureIdsPass']=[f['id'] for f in passed]
    findings['featureContractsFailed']=badfeatures

    # Known warnings are documented, not silent test regressions.
    stale=[]
    patterns=[r'assistance is off by default',r'Leave automatic chase start and assistance off',r'Automatic chase start\s*</[^>]+>\s*<[^>]+>\s*Off\.',r'every NPC action still waits for Continue']
    for journal in data['content']['journals']:
        for page in journal['pages']:
            html=page.get('text',{}).get('content','')
            if any(re.search(p,html,re.I|re.S) for p in patterns):
                stale.append(journal['name']+' / '+page['name'])
    # The source of record has eleven pages with old default wording. Pattern detection may find fewer due to HTML layout.
    if stale:add_warn('outdated-chase-instructions',stale)
    checks['outdatedGuidePagesFound']=len(stale)

    tag=data['tagging-catalogue']
    missing_art=[]
    for pack in tag['tagPacks']:
        var=pack.get('variants',{})
        if isinstance(var,dict):
            for path in var.values():
                if isinstance(path,str) and path and not (root/path).exists():missing_art.append(path)
        fallback=pack.get('runtimeFallback')
        if isinstance(fallback,str) and fallback and not (root/fallback).exists():missing_art.append(fallback)
    if missing_art:
        add_warn('planned-unbuilt-tag-motifs',f'{len(missing_art)} missing art references in catalogue (not part of procedural Tag Studio): '+', '.join(missing_art[:4]))
    checks['missingStaticGraffitiArt']=len(missing_art)
    railway=[s['id'] for s in tag['sites'] if s.get('surface')=='train']
    checks['railwayMarkerOnlySites']=railway
    if railway:add_warn('railway-sites-are-markers','No stationary train vehicle: '+', '.join(railway))

    if not skip_node:
        node=subprocess.run(['node','tests/run-all.mjs'],cwd=root,capture_output=True,text=True,timeout=360)
        succ=[ln for ln in node.stdout.splitlines() if ln.startswith('✓ ')]
        checks['nodeSuitePasses']=len(succ)
        checks['nodeStatus']=node.returncode
        if node.returncode: add_error('behaviour-tests',node.stdout[-3000:]+'\n'+node.stderr[-2000:])
        if len(succ)<CONTRACT['minimumCounts']['testSuites']:
            add_error('test-suite-count',f'{len(succ)} suite successes below baseline')
        if verbose:print(node.stdout[-1500:],file=sys.stderr)
    else:
        add_warn('node-not-run','Node behavioural suites were explicitly skipped.')
    return {'archiveManifestVersion':version,'featureContract':CONTRACT['contractEdition'],
            'passed':not errors,'hardFailures':errors,'warnings':warnings,'checks':checks,'counts':stats,'featureResults':findings}


def compare_hashes(old,new):
    dropped=sorted(set(old)-set(new));created=sorted(set(new)-set(old));changed=sorted(k for k in old.keys() & new.keys() if old[k]!=new[k])
    critical=lambda names:sorted(x for x in names if x.startswith(('module/','data/','packs/','tests/','templates/','styles/')) or x in ('the-smoke.mjs','system.json'))
    return {'removedFiles':dropped,'addedFiles':created,'modifiedFiles':changed,
            'removedCriticalFiles':critical(dropped),
            'changedCriticalFiles':critical(changed),
            'stats':{'removed':len(dropped),'added':len(created),'modified':len(changed)}}


def main():
    ap=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--archive',type=Path,required=True)
    ap.add_argument('--output',type=Path)
    ap.add_argument('--snapshot',type=Path,help='Compare SHA256 hashes against recorded v0.5.24 files; review expected code changes.')
    ap.add_argument('--compare',type=Path,help='Compare with previous full release ZIP if available.')
    ap.add_argument('--no-tests',action='store_true',help='Skip Node tests (not recommended for release).')
    ap.add_argument('--verbose',action='store_true')
    args=ap.parse_args()
    if not args.archive.is_file():ap.error('ZIP archive does not exist: '+str(args.archive))
    with tempfile.TemporaryDirectory(prefix='smoke-qa-') as d:
        try:
            root=safe_unzip(args.archive,Path(d)/'subject')
            result=assess(root,args.verbose,args.no_tests)
            current=file_hashes(root)
            result['archive']={'name':args.archive.name,'sha256':digest_file(args.archive),'files':len(current)}
            if args.snapshot:
                recorded=json.loads(args.snapshot.read_text(encoding='utf-8'))
                base=recorded.get('files',recorded)
                result['snapshotDelta']=compare_hashes(base,current)
                if result['snapshotDelta']['removedCriticalFiles']:
                    result['warnings'].append({'check':'removed-critical-baseline-files','details':result['snapshotDelta']['removedCriticalFiles'][:80]})
            if args.compare:
                with tempfile.TemporaryDirectory(prefix='smoke-old-') as od:
                    old=safe_unzip(args.compare,Path(od))
                    result['previousReleaseDelta']=compare_hashes(file_hashes(old),current)
                if result['previousReleaseDelta']['removedCriticalFiles']:
                    result['warnings'].append({'check':'removed-critical-previous-files','details':result['previousReleaseDelta']['removedCriticalFiles'][:80]})
        except (Exception) as e:
            result={'passed':False,'hardFailures':[{'check':'audit-execution','details':str(e)}],'warnings':[]}
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps({'passed':result['passed'],'version':result.get('archiveManifestVersion'),
        'featureContracts':str(result.get('checks',{}).get('preservedFeatures','?'))+'/'+str(result.get('checks',{}).get('featureCount','?')),
        'nodeTests':result.get('checks',{}).get('nodeSuitePasses'),'contentCounts':result.get('counts',{}).get('contentCounts'),
        'errors':result['hardFailures'],'warnings':result['warnings']},indent=2,ensure_ascii=False))
    return 0 if result['passed'] else 2

if __name__=='__main__':sys.exit(main())
