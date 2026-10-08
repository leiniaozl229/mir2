import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const json=file=>JSON.parse(read(file));
const clone=value=>structuredClone(value);
const contract=json('content/classic-176/map-asset-bindings.json'),binding=contract.bindings[0];
const native=json('assets/web/libraries/Tiles/library.json');
const candidate=json('assets/web/libraries/reference-ga0/Tiles/library.json');
const registry=json('content/classic-176/ga0-tiles-candidate.json');
const context={exports:{},require:name=>({default:json(path.posix.normalize(`apps/web/src/${name}`))})};
vm.createContext(context);vm.runInContext(ts.transpileModule(read('apps/web/src/map-assets.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {resolveMapFrame,mapCandidateSources,isMapCandidateLibrary,mapObjectLibraryForArea,MAP_LIBRARY_NAMES}=context.exports;
const at=(index,overrides={})=>({mapId:binding.mapId,mapSourceSha256:binding.mapSourceSha256,layer:'background',library:'Tiles',index,...overrides});
const sources=(n=native,c=candidate)=>({native:n,candidates:new Map([[binding.namespace,c]])});
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};

{
 assert.equal(binding.status,'enabled');assert.equal(binding.indices.length,408);assert.equal(binding.preserveNativeIndices.length,125);
 for(const index of binding.indices){const result=resolveMapFrame(at(index),sources());assert.equal(result.status,'ready');assert.equal(result.domain,'reference_candidate');assert.equal(result.frame.sourceIndex,index);assert.equal(result.url,`${binding.namespace}/${candidate.frames[index].file}`);assert.equal(result.mapVersionPairingVerified,false);}
 assert.equal(registry.mapBindingActive,false,'historical export snapshot remains unbound');assert.equal(isMapCandidateLibrary(binding.namespace,candidate),true);
 pass('real enabled binding resolves all exact 408 frames while keeping reference provenance and historical snapshot');
}
{
 for(const index of binding.preserveNativeIndices){const result=resolveMapFrame(at(index),sources());assert.equal(result.status,'ready');assert.equal(result.domain,'national');assert.equal(result.url,`/libraries/Tiles/${native.frames[index].file}`);}
 for(const index of [9,14]){assert.equal(resolveMapFrame(at(index),sources()).frame.width,1);assert.equal(resolveMapFrame(at(index),sources()).domain,'national');}
 pass('all 125 existing frames and native tiny 9/14 stay national without candidate offset or placeholder substitution');
}
{
 for(const overrides of [{mapId:'0'},{mapSourceSha256:'0'.repeat(64)},{mapSourceSha256:undefined},{layer:'middle',library:'SmTiles'},{layer:'objects',library:'Objects'}]){const result=resolveMapFrame(at(binding.indices[0],overrides),sources());assert.notEqual(result.domain,'reference_candidate');assert.notEqual(result.status,'ready');}
 assert.equal(mapCandidateSources({mapId:'0',mapSourceSha256:binding.mapSourceSha256}).length,0);assert.equal(mapCandidateSources({mapId:'GA0',mapSourceSha256:'0'.repeat(64)}).length,0);
 pass('map ID/hash and layer/library gate prevents candidate use on other maps or animation layers');
}
{
 const pending=clone(contract);pending.bindings[0].status='pending';assert.equal(mapCandidateSources(at(10320),pending).filter(source=>source.library==='Tiles').length,0);assert.equal(resolveMapFrame(at(10320),sources(),pending).reason,'reference_out_of_range_nil');
 const duplicate=clone(contract);duplicate.bindings.push(clone(binding));assert.equal(mapCandidateSources(at(10320),duplicate).filter(source=>source.library==='Tiles').length,0);
 pass('pending and ambiguous enabled selections do not fetch or render candidate frames');
}
{
 for(const [key,value] of [['selectionPolicy','all'],['sourceFormat','wil-classic'],['sourceSha256','0'.repeat(64)],['namespace','/libraries/Tiles'],['sourceFrameCount',31774],['nativeSourceId','wrong'],['nativeSourceSha256','0'.repeat(64)],['nativeIndexSha256','0'.repeat(64)],['nativeSourceFrameCount',7911],['mapVersionPairingVerified',true]]){const changed=clone(contract);changed.bindings[0][key]=value;assert.equal(mapCandidateSources(at(10320),changed).filter(source=>source.library==='Tiles').length,0,key);}
 pass('policy, both source identities, namespace, frame count and separate pairing fact fail closed');
}
{
 for(const edit of [b=>b.indices.pop(),b=>b.indices.push(9),b=>b.indices[0]=b.indices[1],b=>b.protectedNativeIndices=[],b=>b.protectedNativeIndices=[9],b=>b.preserveNativeIndices[0]=-1,b=>b.preserveNativeIndices[0]=7910,b=>b.preserveNativeIndices[0]=1.5,b=>b.preserveNativeIndices[0]=b.preserveNativeIndices[1]]){const changed=clone(contract);edit(changed.bindings[0]);assert.equal(mapCandidateSources(at(10320),changed).filter(source=>source.library==='Tiles').length,0);}
 pass('exact 408 selection, exact protected 9/14 and valid 125 native range reject widened or malformed contracts');
}
{
 for(const key of ['sourceSha256','indexSha256','format','sourceFrameCount']){const changed=clone(native);changed[key]=key==='sourceFrameCount'?1:'wrong';assert.equal(resolveMapFrame(at(10320),sources(changed)).reason,'source_identity_mismatch');assert.equal(resolveMapFrame(at(9),sources(changed)).status,'missing');}
 pass('untrusted national library cannot authorize native or candidate rendering');
}
{
 for(const [key,value] of [['sourceSha256','0'.repeat(64)],['format','wil-classic'],['candidateId','wrong'],['role','active_required'],['provenance','native_pixels'],['sourceFrameCount',31774]]){const changed=clone(candidate);changed[key]=value;assert.equal(isMapCandidateLibrary(binding.namespace,changed),false,key);assert.equal(resolveMapFrame(at(10320),sources(native,changed)).reason,'candidate_identity_mismatch');}
 for(const edit of [c=>delete c.frames[10320],c=>c.frames[9]=clone(c.frames[10320]),c=>c.frames=[]]){const changed=clone(candidate);edit(changed);assert.equal(isMapCandidateLibrary(binding.namespace,changed),false);}
 pass('candidate loading validates declared identity and the exact manifest export set');
}
{
 for(const [key,value] of [['index',10321],['sourceIndex',10321],['sourceSha256','0'.repeat(64)],['sha256','bad'],['width',0],['height',-1],['offsetX',32768],['offsetY',NaN],['file','../9.png']]){const changed=clone(candidate);changed.frames[10320][key]=value;const result=resolveMapFrame(at(10320),sources(native,changed));assert.equal(result.status,'missing',key);assert.equal(result.reason,'candidate_frame_metadata_invalid');}
 pass('exact candidate index/source/hash format/geometry/path metadata is checked without claiming runtime image byte verification');
}
{
 const changed=clone(native);changed.frames[9].sourceIndex=14;assert.equal(resolveMapFrame(at(9),sources(changed)).status,'missing');changed.frames[9].sourceIndex=9;changed.frames[9].sha256='wrong';assert.equal(resolveMapFrame(at(9),sources(changed)).status,'missing');
 for(const index of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.equal(resolveMapFrame(at(index),sources()).status,'missing');
 const index=binding.indices.at(-1)+1;assert.equal(resolveMapFrame(at(index),sources()).status,'empty');assert.equal(resolveMapFrame(at(index),sources()).reason,'reference_out_of_range_nil');assert.equal(resolveMapFrame(at(index),sources()).domain,'national');
 pass('native identity and invalid indices fail closed; adjacent out-of-range indices follow WIL nil instead of borrowing a neighboring frame');
}
{
 const n=clone(native),c=clone(candidate);n.empty=[9];assert.equal(resolveMapFrame(at(9),sources(n,c)).status,'empty');c.empty=[10320];assert.equal(resolveMapFrame(at(10320),sources(n,c)).status,'empty');c.empty=[];c.missing=[10320];assert.equal(resolveMapFrame(at(10320),sources(n,c)).status,'missing');
 pass('explicit empty/missing frames retain their declared state and cannot become another source or index');
}
{
 assert.deepEqual([...MAP_LIBRARY_NAMES],['Tiles','SmTiles','Objects','Objects2','Objects3','Objects4','Objects5','Objects6','Objects7']);
 assert.deepEqual([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,255].map(mapObjectLibraryForArea),['Objects','Objects2','Objects3','Objects4','Objects5','Objects6','Objects7','Objects8','Objects9','Objects10',undefined,undefined,'Objects13','Objects14',undefined,'Objects','Objects']);
 for(const library of ['SmTiles','Objects','Objects2','Objects3','Objects4','Objects5','Objects6','Objects7']){const n=json(`assets/web/libraries/${library}/library.json`),layer=library==='SmTiles'?'middle':'objects';for(const index of Object.keys(n.frames).slice(0,4).map(Number)){const result=resolveMapFrame(at(index,{layer,library}),{native:n,candidates:new Map([[binding.namespace,candidate]])});assert.equal(result.status,'ready',`${library}#${index}: ${result.reason??''}`);assert.equal(result.domain,'national');assert.equal(result.url,`/libraries/${library}/${n.frames[index].file}`);}}
 const bank4=json('assets/web/libraries/Objects4/library.json'),bank4Index=Number(Object.keys(bank4.frames)[0]);assert.equal(resolveMapFrame(at(bank4Index,{layer:'objects',library:'Objects4'}),{native:bank4}).status,'ready');
 pass('btArea routes native banks and only the five map-hash-bound extended bank candidates; unsupported areas never remap');
}
{
 const candidateContract=json('content/classic-176/map-object-bank-candidates.json');
 assert.equal(candidateContract.status,'candidate-unverified');assert.equal(candidateContract.mapVersionPairingVerified,false);assert.equal(candidateContract.bindings.length,34);
 for(const source of candidateContract.libraries){
  const manifest=json(`assets/web/libraries/reference-map-candidates/${source.library}/library.json`);
  assert.equal(isMapCandidateLibrary(source.namespace,manifest),true,source.library);
  for(const binding of candidateContract.bindings.filter(entry=>entry.library===source.library)){
   const candidateSources=mapCandidateSources({mapId:binding.mapId,mapSourceSha256:binding.mapSourceSha256}).filter(entry=>entry.library===source.library);assert.equal(candidateSources.length,1);assert.equal(candidateSources[0].namespace,source.namespace);
   for(const index of binding.indices){
    const result=resolveMapFrame({mapId:binding.mapId,mapSourceSha256:binding.mapSourceSha256,layer:'objects',library:binding.library,index},{native:undefined,candidates:new Map([[source.namespace,manifest]])});
    if(manifest.empty.includes(index))assert.equal(result.status,'empty',`${binding.mapId}/${source.library}#${index}`);
    else{assert.equal(result.status,'ready',`${binding.mapId}/${source.library}#${index}: ${result.reason??''}`);assert.equal(result.domain,'reference_candidate');assert.equal(result.frame.sourceIndex,index);assert.equal(result.url,`${source.namespace}/${manifest.frames[index].file}`);}
   }
  }
 }
 const binding=candidateContract.bindings.find(entry=>entry.mapId==='GA0'&&entry.library==='Objects10'),source=candidateContract.libraries.find(entry=>entry.library==='Objects10'),manifest=json('assets/web/libraries/reference-map-candidates/Objects10/library.json'),index=binding.indices[0];
 const wrongHash=resolveMapFrame({mapId:binding.mapId,mapSourceSha256:'0'.repeat(64),layer:'objects',library:binding.library,index},{candidates:new Map([[source.namespace,manifest]])});assert.notEqual(wrongHash.status,'ready');assert.notEqual(wrongHash.domain,'reference_candidate');
 const wrongMap=resolveMapFrame({mapId:'0',mapSourceSha256:binding.mapSourceSha256,layer:'objects',library:binding.library,index},{candidates:new Map([[source.namespace,manifest]])});assert.notEqual(wrongMap.status,'ready');
 const bad=clone(manifest);bad.sourceSha256='0'.repeat(64);assert.equal(isMapCandidateLibrary(source.namespace,bad),false);
 pass('all 34 bindings resolve only their exact candidate indices; 11 explicit nil frames, source identities and map hashes stay isolated');
}
{
 const tileContract=json('content/classic-176/map-tile-candidates.json'),tileBinding=tileContract.bindings.find(entry=>entry.mapId==='63'),tileSource=tileContract.libraries[0],tileCandidate=json('assets/web/libraries/reference-map-candidates/Tiles/library.json'),tileNative=json('assets/web/libraries/Tiles/library.json'),index=tileBinding.indices[0];
 assert.equal(tileBinding.layer,'background');assert.equal(tileSource.sourceSha256,'98ea436fdba1de0b401b67bb76d75fdde0360e458461f6acc5fedc592d2d1865');assert.equal(isMapCandidateLibrary(tileSource.namespace,tileCandidate),true);
 const context={mapId:tileBinding.mapId,mapSourceSha256:tileBinding.mapSourceSha256,layer:'background',library:'Tiles',index},result=resolveMapFrame(context,{native:tileNative,candidates:new Map([[tileSource.namespace,tileCandidate]])});
 assert.equal(result.status,'ready');assert.equal(result.domain,'reference_candidate');assert.equal(result.url,`${tileSource.namespace}/${tileCandidate.frames[index].file}`);assert.equal(result.mapVersionPairingVerified,false);
 const wrongHash=resolveMapFrame({...context,mapSourceSha256:'0'.repeat(64)},{native:tileNative,candidates:new Map([[tileSource.namespace,tileCandidate]])});assert.equal(wrongHash.status,'ready');assert.equal(wrongHash.domain,'national');assert.equal(wrongHash.frame.width,1);
 const protectedIndex=json('assets/web/maps/63/map.json').dependencies.Tiles.find(value=>tileNative.frames[String(value)]?.width>1&&tileNative.frames[String(value)]?.height>1),protectedResult=resolveMapFrame({...context,index:protectedIndex},{native:tileNative,candidates:new Map([[tileSource.namespace,tileCandidate]])});assert.equal(protectedResult.domain,'national');assert.equal(protectedResult.url,`/libraries/Tiles/${tileNative.frames[protectedIndex].file}`);
 pass('map-hash-bound Tiles candidate replaces only native 1x1 placeholders; healthy national tiles remain authoritative');
}
assert.equal(groups,14);
