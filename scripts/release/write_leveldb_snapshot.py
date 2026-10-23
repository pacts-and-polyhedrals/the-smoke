#!/usr/bin/env python3
"""Offline LevelDB snapshot writer for build outputs only, never live world data.
Writes standard uncompressed SSTs, CRC32C trailers and a minimal VersionEdit manifest.
Format references: google/leveldb doc/table_format.md, doc/log_format.md,
table/block_builder.cc, table/table_builder.cc and db/version_edit.cc.
"""
from pathlib import Path
import struct,sys,json
sys.path.insert(0,str(Path(__file__).parents[1]/'regression'))
from read_leveldb_sst import sst,handle,block,entries,varint

def vint(n):
    if not isinstance(n,int) or n<0:raise ValueError('nonnegative integer required')
    out=bytearray()
    while n>=128:out.append((n&127)|128);n>>=7
    out.append(n);return bytes(out)
def lp(b):return vint(len(b))+b
CT=[]
for i in range(256):
    c=i
    for _ in range(8):c=(c>>1)^ (0x82F63B78 if c&1 else 0)
    CT.append(c)
def crc(b):
    c=0xffffffff
    for z in b:c=CT[(c^z)&255]^(c>>8)
    return c^0xffffffff
def mask(c):return (((c>>15)|((c<<17)&0xffffffff))+0xa282ead8)&0xffffffff
assert crc(b'123456789')==0xe3069283

def make_block(pairs):
    # A restart at each entry is valid and keeps reconstruction intentionally simple.
    out=bytearray();restart=[]
    for k,v in pairs:
        restart.append(len(out));out+=b'\0'+vint(len(k))+vint(len(v))+k+v
    if not restart:restart=[0]
    out+=b''.join(struct.pack('<I',x)for x in restart)+struct.pack('<I',len(restart))
    return bytes(out)
def read_snapshot(folder):
    result={}
    for path in Path(folder).glob('*.ldb'):
        for k,v in sst(path):
            user=k[:-8];tag=struct.unpack('<Q',k[-8:])[0];seq=tag>>8
            if user not in result or seq>result[user][0]:result[user]=(seq,tag&255,v)
    # The approved build only has empty WALs. Refuse any unparsed data instead of losing it.
    if any(p.stat().st_size for p in Path(folder).glob('*.log')):raise ValueError('Nonempty WAL: use a full LevelDB client')
    return {k:v for k,(seq,typ,v)in result.items()if typ==1}
def write_snapshot(folder,records):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    existing=list(folder.glob('*.ldb'));tn=int(existing[0].stem)if len(existing)==1 else 5
    mn=int(next(folder.glob('MANIFEST-*')).name.split('-')[-1])if list(folder.glob('MANIFEST-*'))else 2
    ln=int(next(folder.glob('*.log')).stem)if list(folder.glob('*.log'))else 4
    ordered=[(k+struct.pack('<Q',(i+1)<<8|1),v)for i,(k,v)in enumerate(sorted(records.items()))]
    if not ordered:raise ValueError('Do not emit an empty pack')
    out=bytearray();index=[];batch=[];size=0
    def put(raw):
        off=len(out);out.extend(raw);out.append(0);out.extend(struct.pack('<I',mask(crc(raw+b'\0'))));return vint(off)+vint(len(raw))
    for pair in ordered:
        batch.append(pair);size+=len(pair[0])+len(pair[1])+16
        if size>=16384:index.append((batch[-1][0],put(make_block(batch))));batch=[];size=0
    if batch:index.append((batch[-1][0],put(make_block(batch))))
    meta=put(make_block([]));idx=put(make_block(index));footer=meta+idx
    out.extend(footer+b'\0'*(40-len(footer))+bytes.fromhex('57fb808b247547db'))
    manifest=(vint(1)+lp(b'leveldb.BytewiseComparator')+vint(2)+vint(ln)+vint(3)+vint(max(tn,mn,ln)+1)+vint(4)+vint(len(ordered))+
              vint(7)+vint(0)+vint(tn)+vint(len(out))+lp(ordered[0][0])+lp(ordered[-1][0]))
    assert len(manifest)<32761
    framed=struct.pack('<IH',mask(crc(b'\x01'+manifest)),len(manifest))+b'\x01'+manifest
    for path in folder.iterdir():
        if path.is_file():path.unlink()
    (folder/f'{tn:06d}.ldb').write_bytes(out)
    (folder/f'MANIFEST-{mn:06d}').write_bytes(framed)
    (folder/'CURRENT').write_text(f'MANIFEST-{mn:06d}\n')
    (folder/f'{ln:06d}.log').write_bytes(b'')
    assert read_snapshot(folder)==records
    verify_snapshot(folder)
    return {'entries':len(records),'tableBytes':len(out),'table':f'{tn:06d}.ldb'}
def verify_snapshot(folder):
    folder=Path(folder);current=(folder/'CURRENT').read_text().strip();m=(folder/current).read_bytes()
    ch,sz,typ=struct.unpack('<IHB',m[:7]);assert typ==1 and sz==len(m)-7 and ch==mask(crc(m[6:]))
    fields={};p=7
    def read_lp(data,pos):n,pos=varint(data,pos);return data[pos:pos+n],pos+n
    while p<len(m):
        tag,p=varint(m,p)
        if tag==1:fields['comparator'],p=read_lp(m,p)
        elif tag in (2,3,4,9):fields[tag],p=varint(m,p)
        elif tag==7:
            level,p=varint(m,p);num,p=varint(m,p);size,p=varint(m,p);first,p=read_lp(m,p);last,p=read_lp(m,p)
            table=folder/f'{num:06d}.ldb';assert table.stat().st_size==size;rows=list(sst(table));assert rows[0][0]==first and rows[-1][0]==last
        else:raise AssertionError(f'unexpected manifest tag {tag}')
    assert fields['comparator']==b'leveldb.BytewiseComparator'
    for path in folder.glob('*.ldb'):
        f=path.read_bytes();meta,pos=handle(f[-48:-8],0);idx,_=handle(f[-48:-8],pos)
        hs=[meta,idx]+[handle(v,0)[0]for k,v in entries(block(f,idx))]
        for off,size in hs:
            assert struct.unpack('<I',f[off+size+1:off+size+5])[0]==mask(crc(f[off:off+size+1]))
        rows=list(sst(path));assert [k[:-8]for k,v in rows]==sorted(k[:-8]for k,v in rows)
        assert max(struct.unpack('<Q',k[-8:])[0]>>8 for k,v in rows)<=fields[4]
    return True
if __name__=='__main__':
    for path in sys.argv[1:]:verify_snapshot(path);print(path,'CRC, manifest, order, bounds and sequence verified')
