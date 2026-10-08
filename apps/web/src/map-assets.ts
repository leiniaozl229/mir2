import activeSources from '../../../content/classic-176/active-asset-sources.json';
import mapBindings from '../../../content/classic-176/map-asset-bindings.json';
import ga0Candidate from '../../../content/classic-176/ga0-tiles-candidate.json';
import mapObjectCandidates from '../../../content/classic-176/map-object-bank-candidates.json';
import mapTileCandidates from '../../../content/classic-176/map-tile-candidates.json';

export const MAP_LAYER_NAMES=['background','middle','objects'] as const;
export const MAP_LIBRARY_NAMES=['Tiles','SmTiles','Objects','Objects2','Objects3','Objects4','Objects5','Objects6','Objects7'] as const;
export const MAP_OBJECT_LIBRARY_NAMES=MAP_LIBRARY_NAMES.slice(2);
export type MapLayer=typeof MAP_LAYER_NAMES[number];
export const MAP_OBJECT_CANDIDATE_LIBRARY_NAMES=['Objects8','Objects9','Objects10','Objects13','Objects14'] as const;
export type NativeMapLibraryName=typeof MAP_LIBRARY_NAMES[number];
export type MapObjectCandidateLibraryName=typeof MAP_OBJECT_CANDIDATE_LIBRARY_NAMES[number];
export type MapLibraryName=NativeMapLibraryName|MapObjectCandidateLibraryName;
export type MapFrame={index:number;sourceIndex?:number;sourceSha256?:string;indexSha256?:string;sha256:string;file:string;width:number;height:number;offsetX:number;offsetY:number};
export type MapLibrary={frames:Record<string,MapFrame>;empty?:number[];missing?:number[];sourceSha256?:string;indexSha256?:string;sourceFrameCount?:number;format?:string;candidateId?:string;role?:string;provenance?:string};
export type MapAssetContext={mapId:string;mapSourceSha256?:string;layer:MapLayer;library:MapLibraryName;index:number};
export type MapAssetBinding={id:string;mapId:string;mapSourceSha256:string;status:'pending'|'enabled';mapVersionPairingVerified:false;selectionEvidence:'reference_source';selectionPolicy:string;layer:MapLayer;library:MapLibraryName;namespace:string;sourceId:string;sourceSha256:string;sourceFrameCount:number;sourceFormat:string;indices:number[];nativeNamespace:string;nativeSourceId:string;nativeSourceSha256:string;nativeIndexSha256:string;nativeSourceFrameCount:number;preserveNativeIndices:number[];protectedNativeIndices:number[]};
export type MapAssetBindingContract={schemaVersion:number;bindings:MapAssetBinding[]};
export type MapFrameResolution={status:'ready'|'empty'|'missing';domain:'national'|'reference_candidate'|'unknown';index:number;namespace:string;sourceId?:string;frame?:MapFrame;url?:string;reason?:string;mapVersionPairingVerified?:false};
export type MapAssetSources={native:MapLibrary|undefined;candidates?:ReadonlyMap<string,MapLibrary>};

type SourceEntry={id:string;namespace:string;category:string;kind:string;role:string;provenance:string;sourceFiles:Array<{purpose?:string;sha256:string}>;library?:{manifests:string[];format?:string;sourceFrameCount:number}};
type ReferenceCandidateSource={library:MapLibraryName;namespace:string;sourceId:string;sourceSha256:string;sourceFrameCount:number;sourceFormat:string;indices:number[];pairingVerified:false};
type MapObjectCandidateSource=ReferenceCandidateSource&{library:MapObjectCandidateLibraryName;area:number};
type MapObjectCandidateBinding={id:string;mapId:string;mapSourceSha256:string;area:number;library:MapObjectCandidateLibraryName;namespace:string;sourceId:string;sourceSha256:string;sourceFrameCount:number;sourceFormat:string;indices:number[];mapManifestSha256:string;mapVersionPairingVerified:false};
type MapObjectCandidateContract={schemaVersion:number;id:string;role:string;provenance:string;status:string;mapVersionPairingVerified:false;areaToLibrary:Record<string,string>;libraries:MapObjectCandidateSource[];bindings:MapObjectCandidateBinding[];unresolvedMaps:Array<unknown>};
type MapTileCandidateSource=ReferenceCandidateSource&{library:'Tiles';sourceBytes:number};
type MapTileCandidateBinding={id:string;mapId:string;mapSourceSha256:string;layer:'background';library:'Tiles';namespace:string;sourceId:string;sourceSha256:string;sourceFrameCount:number;sourceFormat:string;indices:number[];mapManifestSha256:string;mapVersionPairingVerified:false};
type MapTileCandidateContract={schemaVersion:number;id:string;role:string;provenance:string;status:string;complete:false;mapVersionPairingVerified:false;native:{namespace:string;sourceId:string;sourceSha256:string;indexSha256:string;sourceFrameCount:number;format:string};libraries:MapTileCandidateSource[];bindings:MapTileCandidateBinding[];unresolvedMaps:Array<unknown>};
const sourceEntries=activeSources.assets as SourceEntry[];
const defaultBindings=mapBindings as MapAssetBindingContract;
const objectCandidateContract=mapObjectCandidates as MapObjectCandidateContract;
const tileCandidateContract=mapTileCandidates as MapTileCandidateContract;
const sha256=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sameIndices=(a:readonly number[],b:readonly number[])=>{const expected=new Set(b);return a.length===b.length&&new Set(a).size===a.length&&a.every(value=>Number.isSafeInteger(value)&&expected.has(value));};
const nativeEntries=new Map(MAP_LIBRARY_NAMES.map(name=>{const namespace=`/libraries/${name}`,matches=sourceEntries.filter(entry=>entry.category==='map'&&entry.kind==='library'&&entry.namespace===namespace&&entry.role==='active_required'&&entry.provenance==='native_pixels'&&entry.library?.manifests.includes(`assets/web${namespace}/library.json`));return [namespace,matches.length===1?matches[0]:undefined] as const;}));
const allObjectLibraries=new Set<string>([...MAP_OBJECT_LIBRARY_NAMES,...MAP_OBJECT_CANDIDATE_LIBRARY_NAMES]);
const expectedAreaByCandidateLibrary:Record<MapObjectCandidateLibraryName,number>={Objects8:7,Objects9:8,Objects10:9,Objects13:12,Objects14:13};
const candidateSourceByNamespace=new Map<string,ReferenceCandidateSource>();
const candidateBindings:MapObjectCandidateBinding[]=[];
const tileCandidateBindings:MapTileCandidateBinding[]=[];
function validateObjectCandidateContract(contract:MapObjectCandidateContract){
 if(!contract||!Array.isArray(contract.libraries)||!Array.isArray(contract.bindings)||!Array.isArray(contract.unresolvedMaps)||contract.schemaVersion!==1||contract.role!=='reference_candidate'||contract.provenance!=='reference_source'||contract.status!=='candidate-unverified'||contract.mapVersionPairingVerified!==false||contract.unresolvedMaps.length!==0)return;
 const byLibrary=new Map<string,MapObjectCandidateSource>();
 for(const source of contract.libraries){
  if(!MAP_OBJECT_CANDIDATE_LIBRARY_NAMES.includes(source.library)||source.area!==expectedAreaByCandidateLibrary[source.library]||source.namespace!==`/libraries/reference-map-candidates/${source.library}`||source.sourceId!==`crystal-shandamir2-${source.library.toLowerCase()}`||!sha256(source.sourceSha256)||!Number.isSafeInteger(source.sourceFrameCount)||source.sourceFrameCount<=0||source.sourceFormat!=='crystal-lib-v2'||source.pairingVerified!==false||byLibrary.has(source.library)||!Array.isArray(source.indices)||new Set(source.indices).size!==source.indices.length||source.indices.some(index=>!Number.isSafeInteger(index)||index<0||index>=source.sourceFrameCount))return;
  byLibrary.set(source.library,source);
 }
 const seen=new Set<string>(),unions=new Map<string,Set<number>>();
 for(const binding of contract.bindings){
  const source=byLibrary.get(binding.library),key=`${binding.mapId}:${binding.library}`;
  if(!source||seen.has(key)||!binding.mapId||!sha256(binding.mapSourceSha256)||!sha256(binding.mapManifestSha256)||binding.area!==source.area||binding.namespace!==source.namespace||binding.sourceId!==source.sourceId||binding.sourceSha256!==source.sourceSha256||binding.sourceFrameCount!==source.sourceFrameCount||binding.sourceFormat!==source.sourceFormat||binding.mapVersionPairingVerified!==false||!Array.isArray(binding.indices)||!binding.indices.length||new Set(binding.indices).size!==binding.indices.length||binding.indices.some(index=>!Number.isSafeInteger(index)||index<0||index>=source.sourceFrameCount))return;
  seen.add(key);let union=unions.get(binding.library);if(!union){union=new Set();unions.set(binding.library,union);}for(const index of binding.indices)union.add(index);
 }
 for(const [library,source] of byLibrary){const union=unions.get(library);if(!union||!sameIndices([...union].sort((a,b)=>a-b),source.indices))return;}
  for(const source of byLibrary.values())candidateSourceByNamespace.set(source.namespace,source);
 candidateBindings.splice(0,candidateBindings.length,...contract.bindings);
}
validateObjectCandidateContract(objectCandidateContract);
function validateTileCandidateContract(contract:MapTileCandidateContract){
 if(!contract||!Array.isArray(contract.libraries)||!Array.isArray(contract.bindings)||!Array.isArray(contract.unresolvedMaps)||contract.schemaVersion!==1||contract.role!=='reference_candidate'||contract.provenance!=='reference_source'||contract.status!=='candidate-unverified'||contract.complete!==false||contract.mapVersionPairingVerified!==false||contract.unresolvedMaps.length!==0)return;
 const entry=nativeEntries.get('/libraries/Tiles'),data=entry?.sourceFiles.find(file=>file.purpose==='data'),lookup=entry?.sourceFiles.find(file=>file.purpose==='index'),native=contract.native;
 if(!entry||!data||!lookup||native.namespace!=='/libraries/Tiles'||native.sourceId!==entry.id||native.sourceSha256!==data.sha256||native.indexSha256!==lookup.sha256||native.sourceFrameCount!==entry.library?.sourceFrameCount||native.format!==entry.library?.format)return;
 const sources=new Map<string,MapTileCandidateSource>();
 for(const source of contract.libraries){
  if(source.library!=='Tiles'||source.namespace!=='/libraries/reference-map-candidates/Tiles'||source.sourceId!=='crystal-shandamir2-tiles'||source.sourceSha256!=='98ea436fdba1de0b401b67bb76d75fdde0360e458461f6acc5fedc592d2d1865'||source.sourceBytes!==78884815||source.sourceFrameCount!==31775||source.sourceFormat!=='crystal-lib-v2'||source.pairingVerified!==false||sources.has(source.namespace)||!Array.isArray(source.indices)||new Set(source.indices).size!==source.indices.length||source.indices.some(index=>!Number.isSafeInteger(index)||index<0||index>=source.sourceFrameCount||index>=native.sourceFrameCount))return;
  sources.set(source.namespace,source);candidateSourceByNamespace.set(source.namespace,source);
 }
 const seen=new Set<string>(),union=new Set<number>();
 for(const binding of contract.bindings){
  const source=sources.get(binding.namespace),key=`${binding.mapId}:${binding.mapSourceSha256}`;
  if(!source||seen.has(key)||!binding.mapId||!sha256(binding.mapSourceSha256)||!sha256(binding.mapManifestSha256)||binding.layer!=='background'||binding.library!=='Tiles'||binding.sourceId!==source.sourceId||binding.sourceSha256!==source.sourceSha256||binding.sourceFrameCount!==source.sourceFrameCount||binding.sourceFormat!==source.sourceFormat||binding.mapVersionPairingVerified!==false||!Array.isArray(binding.indices)||!binding.indices.length||new Set(binding.indices).size!==binding.indices.length||binding.indices.some(index=>!source.indices.includes(index)))return;
  seen.add(key);for(const index of binding.indices)union.add(index);
 }
 if(sources.size!==1||!sameIndices([...union].sort((a,b)=>a-b),[...sources.values()][0]?.indices??[]))return;
 tileCandidateBindings.splice(0,tileCandidateBindings.length,...contract.bindings);
}
validateTileCandidateContract(tileCandidateContract);

/** The national client reads MAP btArea at byte 10; invalid area IDs >14 fall back to Objects. */
export function mapObjectLibraryForArea(area:number):MapLibraryName|undefined{
 if(!Number.isInteger(area)||area<0||area>255)return undefined;
 if(area===0||area>14)return 'Objects';
 if(area===7)return 'Objects8';
 if(area===8)return 'Objects9';
 if(area===9)return 'Objects10';
 if(area===12)return 'Objects13';
 if(area===13)return 'Objects14';
 if(area>6)return undefined; // Unsupported Objects11/12/15 are not silently remapped.
 return `Objects${area+1}` as MapLibraryName;
}
type SelectedBinding=MapAssetBinding&{selectedIndices:ReadonlySet<number>};

function validateBinding(binding:MapAssetBinding):SelectedBinding|undefined{
 const candidate=ga0Candidate,entry=nativeEntries.get(binding.nativeNamespace);
 const data=entry?.sourceFiles.find(file=>file.purpose==='data'),lookup=entry?.sourceFiles.find(file=>file.purpose==='index');
 if(binding.mapId!==candidate.map.id||binding.mapSourceSha256!==candidate.map.sha256||binding.layer!=='background'||binding.library!=='Tiles'||binding.nativeNamespace!=='/libraries/Tiles')return;
 if(binding.selectionPolicy!=='exact-missing-original-indices-only'||binding.selectionEvidence!=='reference_source'||binding.mapVersionPairingVerified!==false||binding.sourceId!==candidate.id||binding.namespace!==candidate.namespace||binding.sourceSha256!==candidate.source.sha256||binding.sourceFrameCount!==candidate.sourceFrameCount||binding.sourceFormat!=='crystal-lib-v2')return;
 if(!entry||binding.nativeSourceId!==entry.id||binding.nativeSourceSha256!==data?.sha256||binding.nativeIndexSha256!==lookup?.sha256||binding.nativeSourceFrameCount!==entry.library?.sourceFrameCount)return;
 if(!sameIndices(binding.indices,candidate.map.originalIndices)||binding.indices.some(index=>index<binding.nativeSourceFrameCount||index>=binding.sourceFrameCount)||binding.preserveNativeIndices.length!==125||new Set(binding.preserveNativeIndices).size!==125||binding.preserveNativeIndices.some(index=>!Number.isSafeInteger(index)||index<0||index>=binding.nativeSourceFrameCount)||!sameIndices(binding.protectedNativeIndices,candidate.nonExactSharedIndices)||!binding.protectedNativeIndices.every(index=>binding.preserveNativeIndices.includes(index)))return;
 return {...binding,selectedIndices:new Set(binding.indices)};
}
// Imported contracts and loaded manifests stay immutable throughout a map session.
// Default selection is compiled once; caller-supplied test contracts are checked anew.
const selectedBindings=defaultBindings.schemaVersion===1?defaultBindings.bindings.filter(binding=>binding.status==='enabled').map(validateBinding).filter((binding):binding is SelectedBinding=>Boolean(binding)):[];
function bindingFor(context:Pick<MapAssetContext,'mapId'|'mapSourceSha256'>,contract:MapAssetBindingContract){
 if(contract.schemaVersion!==1)return;
 const matches=(contract===defaultBindings?selectedBindings:contract.bindings.filter(binding=>binding.status==='enabled').map(validateBinding).filter((binding):binding is SelectedBinding=>Boolean(binding))).filter(binding=>binding.mapId===context.mapId&&binding.mapSourceSha256===context.mapSourceSha256);
 if(matches.length!==1)return;
 return matches[0];
}

/** Only an enabled, map-hash-bound selection requests the separate candidate export. */
export function mapCandidateSources(context:Pick<MapAssetContext,'mapId'|'mapSourceSha256'>,contract=defaultBindings){
 const sources:{namespace:string;sourceId:string;library:MapLibraryName}[]=[];
 const binding=bindingFor(context,contract);
 if(binding)sources.push({namespace:binding.namespace,sourceId:binding.sourceId,library:'Tiles'});
 for(const candidate of tileCandidateBindings){
  if(candidate.mapId!==context.mapId||candidate.mapSourceSha256!==context.mapSourceSha256)continue;
  if(!sources.some(source=>source.namespace===candidate.namespace))sources.push({namespace:candidate.namespace,sourceId:candidate.sourceId,library:'Tiles'});
 }
 for(const candidate of candidateBindings){
  if(candidate.mapId!==context.mapId||candidate.mapSourceSha256!==context.mapSourceSha256)continue;
  if(!sources.some(source=>source.namespace===candidate.namespace))sources.push({namespace:candidate.namespace,sourceId:candidate.sourceId,library:candidate.library});
 }
 return sources;
}

function validFrame(frame:MapFrame,index:number,source:string,indexSource?:string,requireOrigin=false){
 // Older national exports carry source identity at library level; new per-frame fields must match when present.
 return Boolean(frame&&frame.index===index&&(frame.sourceIndex===index||!requireOrigin&&frame.sourceIndex===undefined)&&(frame.sourceSha256===source||!requireOrigin&&frame.sourceSha256===undefined)&&(!indexSource||frame.indexSha256===undefined||frame.indexSha256===indexSource)&&sha256(frame.sha256)&&Number.isInteger(frame.width)&&Number.isInteger(frame.height)&&frame.width>0&&frame.height>0&&frame.width<=4096&&frame.height<=4096&&Number.isInteger(frame.offsetX)&&Number.isInteger(frame.offsetY)&&frame.offsetX>=-32768&&frame.offsetX<=32767&&frame.offsetY>=-32768&&frame.offsetY<=32767&&/^[A-Za-z0-9_.-]+\.png$/i.test(frame.file)&&!frame.file.startsWith('.'));
}
const candidateSelections=new WeakMap<MapLibrary,Map<readonly number[],boolean>>();
function candidateIndicesMatch(candidate:MapLibrary,indices:readonly number[]){
 let selections=candidateSelections.get(candidate);if(!selections){selections=new Map();candidateSelections.set(candidate,selections);}
 let result=selections.get(indices);if(result===undefined){result=sameIndices(Object.keys(candidate.frames??{}).map(Number),indices);selections.set(indices,result);}return result;
}
/** Checks the declared identity and exact exported index set; image bytes are audited offline. */
export function isMapCandidateLibrary(namespace:string,library:MapLibrary){
 const matches=selectedBindings.filter(binding=>binding.namespace===namespace);
 if(matches.length===1&&candidateIdentityMatches(library,matches[0]))return true;
 const source=candidateSourceByNamespace.get(namespace);
 return Boolean(source&&referenceCandidateIdentityMatches(library,source));
}
function candidateIdentityMatches(candidate:MapLibrary,binding:SelectedBinding){
 return Boolean(candidate&&candidate.frames&&typeof candidate.frames==='object'&&!Array.isArray(candidate.frames)&&candidate.sourceSha256===binding.sourceSha256&&candidate.sourceFrameCount===binding.sourceFrameCount&&candidate.candidateId===binding.sourceId&&candidate.role==='reference_candidate'&&candidate.provenance==='reference_source'&&candidate.format===binding.sourceFormat&&candidateIndicesMatch(candidate,binding.indices));
}
const referenceCandidateIdentityCache=new WeakMap<MapLibrary,Map<ReferenceCandidateSource,boolean>>();
function referenceCandidateIdentityMatches(candidate:MapLibrary,source:ReferenceCandidateSource){
 let cache=referenceCandidateIdentityCache.get(candidate);if(!cache){cache=new Map();referenceCandidateIdentityCache.set(candidate,cache);}
 const cached=cache.get(source);if(cached!==undefined)return cached;
 const valid=validateReferenceCandidateIdentity(candidate,source);cache.set(source,valid);return valid;
}
function validateReferenceCandidateIdentity(candidate:MapLibrary,source:ReferenceCandidateSource){
 if(!candidate||!candidate.frames||typeof candidate.frames!=='object'||Array.isArray(candidate.frames)||candidate.sourceSha256!==source.sourceSha256||candidate.sourceFrameCount!==source.sourceFrameCount||candidate.candidateId!==source.sourceId||candidate.role!=='reference_candidate'||candidate.provenance!=='reference_source'||candidate.format!==source.sourceFormat||!Array.isArray(candidate.empty)||!Array.isArray(candidate.missing)||candidate.missing.length!==0)return false;
 const frameKeys=Object.keys(candidate.frames);
 if(frameKeys.some(key=>!/^\d+$/.test(key)||String(Number(key))!==key))return false;
 const empty=candidate.empty;
 if(new Set(empty).size!==empty.length||empty.some(index=>!Number.isSafeInteger(index)||index<0||index>=source.sourceFrameCount)||frameKeys.some(key=>empty.includes(Number(key))))return false;
 const selected=[...frameKeys.map(Number),...empty].sort((a,b)=>a-b);
 return sameIndices(selected,source.indices);
}
function resolveReferenceCandidate(binding:{namespace:string;sourceId:string;sourceSha256:string;sourceFrameCount:number;sourceFormat:string},index:number,sources:MapAssetSources):MapFrameResolution{
 const selected:MapFrameResolution={status:'missing',domain:'reference_candidate',index,namespace:binding.namespace,sourceId:binding.sourceId,mapVersionPairingVerified:false,reason:'candidate_not_loaded'};
 const candidate=sources.candidates?.get(binding.namespace),source=candidateSourceByNamespace.get(binding.namespace);
 if(!candidate||!source)return selected;
 if(!referenceCandidateIdentityMatches(candidate,source))return {...selected,reason:'candidate_identity_mismatch'};
 if(candidate.empty?.includes(index))return {...selected,status:'empty',reason:'candidate_frame_empty'};
 const frame=candidate.frames?.[String(index)];
 if(!frame||candidate.missing?.includes(index))return selected;
 if(!validFrame(frame,index,binding.sourceSha256,undefined,true))return {...selected,reason:'candidate_frame_metadata_invalid'};
 return {...selected,status:'ready',frame,url:`${binding.namespace}/${frame.file}`,reason:undefined};
}

function resolveTileCandidate(context:MapAssetContext,binding:MapTileCandidateBinding,sources:MapAssetSources):MapFrameResolution{
 const index=context.index,namespace='/libraries/Tiles',entry=nativeEntries.get(namespace),native=sources.native;
 const absent:MapFrameResolution={status:'missing',domain:'national',index,namespace,reason:'source_identity_mismatch'};
  const data=entry?.sourceFiles.find(file=>file.purpose==='data'),lookup=entry?.sourceFiles.find(file=>file.purpose==='index'),frameCount=entry?.library?.sourceFrameCount;
  if(!entry||!native||!data||!lookup||frameCount===undefined||native.sourceSha256!==data.sha256||native.indexSha256!==lookup.sha256||native.sourceFrameCount!==frameCount||native.format!==entry.library?.format)return absent;
  if(index>=frameCount)return {...absent,reason:'frame_out_of_range'};
 if(native.empty?.includes(index)||native.missing?.includes(index))return resolveReferenceCandidate(binding,index,sources);
 const frame=native.frames?.[String(index)];
 if(!frame)return resolveReferenceCandidate(binding,index,sources);
 if(!validFrame(frame,index,data.sha256,lookup.sha256))return {...absent,reason:'frame_metadata_invalid'};
 if(frame.width===1&&frame.height===1)return resolveReferenceCandidate(binding,index,sources);
 return {status:'ready',domain:'national',index,namespace,sourceId:entry.id,frame,url:`${namespace}/${frame.file}`};
}

/** Every animation step resolves its own exact index, source and URL. */
export function resolveMapFrame(context:MapAssetContext,sources:MapAssetSources,contract=defaultBindings):MapFrameResolution{
 const {index,layer,library}=context,namespace=`/libraries/${library}`;
 const absent:MapFrameResolution={status:'missing',domain:'unknown',index,namespace,reason:'source_unknown'};
 if(!Number.isSafeInteger(index)||index<0)return {...absent,reason:'invalid_index'};
 const layerMatches=layer==='background'?library==='Tiles':layer==='middle'?library==='SmTiles':layer==='objects'&&allObjectLibraries.has(library);
 if(!layerMatches)return {...absent,reason:'layer_library_mismatch'};
 if(layer==='background'&&library==='Tiles'){
  const binding=tileCandidateBindings.find(candidate=>candidate.mapId===context.mapId&&candidate.mapSourceSha256===context.mapSourceSha256&&candidate.indices.includes(index));
  if(binding)return resolveTileCandidate(context,binding,sources);
 }
 if(layer==='objects'&&MAP_OBJECT_CANDIDATE_LIBRARY_NAMES.includes(library as MapObjectCandidateLibraryName)){
  const binding=candidateBindings.find(candidate=>candidate.mapId===context.mapId&&candidate.mapSourceSha256===context.mapSourceSha256&&candidate.library===library&&candidate.indices.includes(index));
  if(!binding)return {...absent,reason:'candidate_binding_missing'};
  return resolveReferenceCandidate(binding,index,sources);
 }
 const entry=nativeEntries.get(namespace);
 if(!entry||!sources.native)return absent;
 const native=sources.native,data=entry.sourceFiles.find(file=>file.purpose==='data'),lookup=entry.sourceFiles.find(file=>file.purpose==='index');
 if(!data||native.sourceSha256!==data.sha256||lookup&&native.indexSha256!==lookup.sha256||native.sourceFrameCount!==entry.library!.sourceFrameCount||entry.library!.format&&native.format!==entry.library!.format)return {...absent,reason:'source_identity_mismatch'};
 const state:MapFrameResolution={status:'missing',domain:'national',index,namespace,sourceId:entry.id,reason:'frame_missing'};
 if(native.empty?.includes(index))return {...state,status:'empty',reason:'frame_empty'};
 const frame=native.frames?.[String(index)];
 if(index<entry.library!.sourceFrameCount&&!native.missing?.includes(index)&&frame&&validFrame(frame,index,data.sha256,lookup?.sha256))return {...state,status:'ready',frame,url:`${namespace}/${frame.file}`,reason:undefined};
 if(index>=entry.library!.sourceFrameCount)state.reason='frame_out_of_range';
 else if(frame&&!validFrame(frame,index,data.sha256,lookup?.sha256))state.reason='frame_metadata_invalid';
 const binding=bindingFor(context,contract);
 if(!binding||layer!==binding.layer||library!==binding.library||!binding.selectedIndices.has(index)){
  // The reference WIL returns nil whenever an authenticated native-library
  // index is outside ImageCount. Keep exact candidate bindings ahead of this
  // branch so an explicitly selected replacement frame can still render.
  if(index>=entry.library!.sourceFrameCount)return {...state,status:'empty',reason:'reference_out_of_range_nil'};
  return state;
 }
 const candidate=sources.candidates?.get(binding.namespace);
 if(!candidate)return {...state,reason:'candidate_not_loaded'};
 if(!candidateIdentityMatches(candidate,binding))return {...state,reason:'candidate_identity_mismatch'};
 const selected:MapFrameResolution={status:'missing',domain:'reference_candidate',index,namespace:binding.namespace,sourceId:binding.sourceId,mapVersionPairingVerified:false,reason:'candidate_frame_missing'};
 if(candidate.empty?.includes(index))return {...selected,status:'empty',reason:'candidate_frame_empty'};
 const candidateFrame=candidate.frames?.[String(index)];
 if(index>=binding.sourceFrameCount||candidate.missing?.includes(index)||!candidateFrame)return selected;
 if(!validFrame(candidateFrame,index,binding.sourceSha256,undefined,true))return {...selected,reason:'candidate_frame_metadata_invalid'};
 return {...selected,status:'ready',frame:candidateFrame,url:`${binding.namespace}/${candidateFrame.file}`,reason:undefined};
}
