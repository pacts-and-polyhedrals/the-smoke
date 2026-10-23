#!/usr/bin/env python3
"""Rebuild changed shipped packs from canonical merged data/content.json.
Offline BUILD TREE only. Never operate on a running Foundry instance or world.
Defaults to comparison only; --write requires an explicit request. Refuses nonempty
WALs or any removed document IDs. Native Foundry acceptance remains separate.
"""
from pathlib import Path
import argparse,copy,json,collections
from write_leveldb_snapshot import read_snapshot,write_snapshot,verify_snapshot
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--write',action='store_true');a=p.parse_args();root=a.root
manifest=json.loads((root/'system.json').read_text());assert manifest['id']=='the-smoke'
c=json.loads((root/'data/content.json').read_text());assert c['version']==manifest['version']
enc=lambda d:json.dumps(d,ensure_ascii=False,separators=(',',':')).encode()
by_type={'weapon':'Weapons','ammo':'Ammo','armour':'Armour','outfit':'Clobber','gear':'Tools & Gear','consumable':'Food & Medicine','drug':'Drugs','perk':'Perks'}
for pack,kind,docs in [('london-items','items',[x for x in c['items']if x['type']!='condition']),('london-people','actors',[x for x in c['actors']if x['type']=='npc']),('guides','journal',c['journals'])]:
 folder=root/'packs'/pack;old=read_snapshot(folder);records={k:v for k,v in old.items()if k.startswith(b'!folders!')}
 folders={json.loads(v)['name']:json.loads(v)['_id']for v in records.values()}
 for src in docs:
  key=f'!{kind}!{src["_id"]}'.encode();prior=json.loads(old.get(key,b'{}'));doc={**prior,**copy.deepcopy(src)}
  doc['_stats']={**prior.get('_stats',{}),'systemId':'the-smoke','systemVersion':manifest['version']}
  if kind=='items':doc['folder']=prior.get('folder')or folders.get(by_type.get(src['type']))
  if kind in ['actors','journal']:
   emb='items'if kind=='actors'else'pages';doc[emb]=[x['_id']for x in src.get(emb,[])]
   for child in src.get(emb,[]):
    ck=f'!{kind}.{emb}!{src["_id"]}.{child["_id"]}'.encode();cp=json.loads(old.get(ck,b'{}'));cd={**cp,**child}
    cd['_stats']={**cp.get('_stats',{}),'systemId':'the-smoke','systemVersion':manifest['version']};records[ck]=enc(cd)
  records[key]=enc(doc)
 removed=set(old)-set(records)
 if removed:raise ValueError(f'{pack}: would remove {len(removed)} records. Review source IDs instead of blindly rebuilding.')
 if a.write:write_snapshot(folder,records)
 actual=read_snapshot(folder)
 assert all(json.loads(actual[k])==json.loads(v)for k,v in records.items())and set(actual)==set(records),f'{pack}: source differs; use --write only in a backed-up build tree'
 verify_snapshot(folder)
 print(pack,len(docs),'roots;',len(records),'total records; source, CRCs, manifest and readback match')
print('Native Foundry loading is NOT certified by this offline check.')
