#!/usr/bin/env python3
"""Import exact national lighting data; no inferred replacement textures."""
import argparse
import hashlib
import json
from pathlib import Path
import struct

ROOT=Path(__file__).resolve().parents[1]
MASK_LOCKS=['84145ee99f244d48cef025d2eb8609a5fcbc4437736cacc0933fec2b4f3d5435','de8655f35f68fdd4740353a5dccb4a385777765df21ff8bd2a9e9f2db6902b9f','049dc4764cb3e24bb690d6a50be2d8ddf200533e7658671ee365ac1a9efc7d81','d0ab644b5b50316119675fe833d43529c8a53258a4d9dc6ae86c67f9c9d57ea5','f96581a8bae004dad05ddd086745ad602de45e54edfbc6534f95c55964cb5264','8148cfdf5b336317984577738441ad7e49a57f547cf9b77d0d1f826f17991279']
NPAL_LOCK='977c3a3f712e8845d7d6e0cd21634e89133270952ebd25981b622aedd36c2421'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def default_data_dir():
 roots=json.loads((ROOT/'content/classic-176/active-asset-sources.json').read_text(encoding='utf-8')).get('roots')
 value=roots.get('nationalData') if isinstance(roots,dict) else None
 if not isinstance(value,str) or not value.strip():raise ValueError('roots.nationalData must name the pinned original source')
 p=Path(value);return (p if p.is_absolute() else ROOT/p).resolve()
def read_mask(raw):
 if len(raw)<8:raise ValueError('truncated light header')
 width,height=struct.unpack_from('<ii',raw)
 if not (0<width<=4096 and 0<height<=4096):raise ValueError('unsupported light dimensions')
 end=8+width*height
 if len(raw)<end:raise ValueError('truncated light pixels')
 return width,height,raw[8:end],raw[end:]
def read_nearest(raw):
 if len(raw)!=48+5*65536:raise ValueError('unsupported nearest-index size')
 if raw[0]!=25 or raw[1:26]!=b'WEMADE Entertainment Inc.' or struct.unpack_from('<I',raw,32)[0]!=65536:raise ValueError('unsupported nearest-index header')
 return {name:raw[48+i*65536:48+(i+1)*65536] for i,name in enumerate(['mix','anti','heavy','light','dungeon'])}
def build(profile,data_dir):
 masks=profile.get('masks',[])
 if len(masks)!=6:raise ValueError('six pinned light masks are required')
 files={};entries=[]
 for level,spec in enumerate(masks):
  filename='lig0'+chr(ord('a')+level)+'.dat'
  if spec['level']!=level or spec['file']!=filename or spec['sha256']!=MASK_LOCKS[level]:raise ValueError('mask contract differs from pinned original')
  raw=(Path(data_dir)/filename).read_bytes()
  if sha(raw)!=MASK_LOCKS[level]:raise ValueError('mask source hash mismatch: '+filename)
  width,height,pixels,trailing=read_mask(raw)
  if any(spec[k]!=v for k,v in {'width':width,'height':height,'payloadOffset':8,'payloadBytes':len(pixels),'trailingBytes':len(trailing)}.items()):raise ValueError('mask geometry contract mismatch: '+filename)
  if max(pixels)>30:raise ValueError('original light pixels exceed level30')
  files[filename]=raw;entries.append({**spec,'bytes':len(raw),'pixelSha256':sha(pixels),'trailingSha256':sha(trailing),'url':'/lighting/'+filename})
 spec=profile['nearestIndex']
 if spec['file']!='npal.idx' or spec['sha256']!=NPAL_LOCK:raise ValueError('nearest-index contract differs from pinned original')
 raw=(Path(data_dir)/'npal.idx').read_bytes()
 if sha(raw)!=NPAL_LOCK:raise ValueError('nearest-index source hash mismatch')
 tables=read_nearest(raw);files['npal.idx']=raw
 manifest={'schemaVersion':1,'id':profile['id'],'scope':'Exact original data only; production fog activation, source-index framebuffer and target/browser visual comparison remain unresolved.','masks':entries,'nearestIndex':{**spec,'url':'/lighting/npal.idx','bytes':len(raw),'tableSha256':{k:sha(v) for k,v in tables.items()}}}
 files['library.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
 return files,manifest
def main(argv=None):
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--data-dir',type=Path);parser.add_argument('--output',type=Path,default=ROOT/'assets/web/lighting');parser.add_argument('--check',action='store_true');parser.add_argument('--report',type=Path);args=parser.parse_args(argv)
 data_dir=args.data_dir if args.data_dir is not None else default_data_dir()
 profile=json.loads((ROOT/'content/classic-176/scene-lighting.json').read_text(encoding='utf-8'))
 files,manifest=build(profile,data_dir);written=0
 for name,raw in files.items():
  p=args.output/name
  if p.is_file() and p.read_bytes()==raw:continue
  if args.check:raise ValueError('export differs: '+name)
  args.output.mkdir(parents=True,exist_ok=True);p.write_bytes(raw);written+=1
 report={'schemaVersion':1,'ok':True,'mode':'check' if args.check else 'export','dataDir':str(data_dir),'output':str(args.output),'written':written,'files':{str(args.output/n):sha(b) for n,b in files.items()},'scope':manifest['scope']}
 if args.report:
  with args.report.open('x',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
 print(json.dumps(report,ensure_ascii=False));return 0
if __name__=='__main__':raise SystemExit(main())
