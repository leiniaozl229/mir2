"""Exact native lighting import and malformed/source-corruption boundaries."""
import copy
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('scene_lighting_export',ROOT/'scripts/export-scene-lighting.py')
exporter=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(exporter)
PROFILE=json.loads((ROOT/'content/classic-176/scene-lighting.json').read_text(encoding='utf-8'))

class SceneLightingTests(unittest.TestCase):
 def test_default_root_uses_active_original_not_runtime_link(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);p=root/'content/classic-176/active-asset-sources.json';p.parent.mkdir(parents=True)
   p.write_text(json.dumps({'roots':{'nationalData':'original'}}))
   with patch.object(exporter,'ROOT',root):self.assertEqual(exporter.default_data_dir(),(root/'original').resolve())
 def test_missing_root_does_not_guess_runtime_or_working_directory(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);p=root/'content/classic-176/active-asset-sources.json';p.parent.mkdir(parents=True)
   for data in [{},{'roots':None},{'roots':{'nationalData':42}},{'roots':{'nationalData':''}}]:
    with self.subTest(data=data),patch.object(exporter,'ROOT',root):
     p.write_text(json.dumps(data))
     with self.assertRaisesRegex(ValueError,'nationalData'):exporter.default_data_dir()
 def test_light_payload_is_row_major_and_native_trailing_bytes_preserved(self):
  raw=struct.pack('<ii',3,2)+bytes([1,2,3,4,5,6])+b'trailing'
  self.assertEqual(exporter.read_mask(raw),(3,2,bytes([1,2,3,4,5,6]),b'trailing'))
 def test_truncated_or_oversize_mask_cannot_allocate_or_be_accepted(self):
  for raw in [b'',b'1234567',struct.pack('<ii',2,2)+b'123',struct.pack('<ii',-1,2),struct.pack('<ii',1,0),struct.pack('<ii',4097,1),struct.pack('<ii',1,2**30)]:
   with self.subTest(raw=raw):
    with self.assertRaises(ValueError):exporter.read_mask(raw)
 def test_nearest_header_alignment_and_every_original_table_byte(self):
  header=bytearray(48);header[0]=25;header[1:26]=b'WEMADE Entertainment Inc.';struct.pack_into('<I',header,32,65536)
  tables=[bytes((i+x)%256 for x in range(65536)) for i in range(5)]
  actual=exporter.read_nearest(bytes(header)+b''.join(tables))
  self.assertEqual(list(actual),['mix','anti','heavy','light','dungeon'])
  for i,name in enumerate(actual):self.assertEqual(actual[name],tables[i])
 def test_nearest_rejects_wrong_size_title_count_and_unaligned_header(self):
  header=bytearray(48);header[0]=25;header[1:26]=b'WEMADE Entertainment Inc.';struct.pack_into('<I',header,32,65536);good=bytes(header)+bytes(5*65536)
  for raw in [good[:-1],good+b'0',bytes([0])+good[1:],good[:32]+struct.pack('<I',good.__len__())+good[36:],good[:31]+struct.pack('<I',65536)+good[35:]]:
   with self.subTest(size=len(raw)):
    with self.assertRaises(ValueError):exporter.read_nearest(raw)
 def test_mask_contract_cannot_unlock_sources_or_escape_original_directory(self):
  for key,value in [('sha256','0'*64),('file','../unrelated.dat'),('level',9)]:
   p=copy.deepcopy(PROFILE);p['masks'][0][key]=value
   with self.assertRaisesRegex(ValueError,'pinned original'):exporter.build(p,ROOT)
 def test_corrupt_source_fails_before_writing_any_exports(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);(root/'lig0a.dat').write_bytes(struct.pack('<ii',1,1)+b'0');out=root/'output'
   with self.assertRaisesRegex(ValueError,'source hash mismatch'):exporter.main(['--data-dir',str(root),'--output',str(out)])
   self.assertFalse(out.exists())
 def test_check_does_not_repair_corrupt_output(self):
  with tempfile.TemporaryDirectory() as directory:
   out=Path(directory);p=out/'fixture.dat';p.write_bytes(b'corrupt')
   with patch.object(exporter,'build',return_value=({'fixture.dat':b'original'},{'scope':'fixture'})):
    with self.assertRaisesRegex(ValueError,'export differs'):exporter.main(['--check','--output',str(out)])
   self.assertEqual(p.read_bytes(),b'corrupt')
 def test_repeat_export_writes_zero_and_keeps_original_bytes(self):
  with tempfile.TemporaryDirectory() as directory:
   out=Path(directory);files={'fixture.dat':b'original','library.json':b'{}'}
   with patch.object(exporter,'build',return_value=(files,{'scope':'fixture'})):
    exporter.main(['--output',str(out)])
    before={p.name:p.stat().st_mtime_ns for p in out.iterdir()}
    exporter.main(['--output',str(out)]);self.assertEqual(before,{p.name:p.stat().st_mtime_ns for p in out.iterdir()})
    exporter.main(['--check','--output',str(out)])
 def test_installed_original_lighting_data_matches_exports_without_writes(self):
  data=exporter.default_data_dir()
  if not (data/'lig0a.dat').is_file():self.skipTest('pinned original package absent')
  files,manifest=exporter.build(PROFILE,data)
  self.assertEqual(len(files),8);self.assertEqual(manifest['masks'][0]['trailingBytes'],904)
  for name,raw in files.items():self.assertEqual((ROOT/'assets/web/lighting'/name).read_bytes(),raw)

if __name__=='__main__':unittest.main()
