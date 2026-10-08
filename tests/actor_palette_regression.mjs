import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {BufferImageSource,Filter,GpuProgram,Texture,UniformGroup} from 'pixi.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const contract=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/actor-status.json'),'utf8'));
const resource=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/actor-status-palette.json'),'utf8'));
const code=ts.transpileModule(fs.readFileSync(path.join(root,'apps/web/src/actor-palette.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
// Real Pixi texture/uniform/filter/GpuProgram metadata; only GlProgram's
// canvas-dependent program factory is replaced. No GPU is compiled here.
const pixi={BufferImageSource,Filter,GpuProgram,Texture,UniformGroup,GlProgram:{from:options=>({...options,_uniformData:{},destroy(){}})}};
const context={exports:{},Uint8Array,require:name=>name==='pixi.js'?pixi:{default:name.endsWith('actor-status-palette.json')?resource:contract}};
vm.createContext(context);vm.runInContext(code,context);
const api=context.exports,channels={green:[0,1,0],red:[1,0,0],blue:[0,0,1],yellow:[1,1,0],fuchsia:[1,0,1],gray:[1,1,1]};
let passed=0;const pass=label=>{passed++;console.log(`PASS ${label}`);};
// Independent reference derivation: div 3, Manhattan distance, nonzero
// candidates and first minimum, including palette entries with sum%3!=0.
function expectedIndex(effect,brightness){
 const target=channels[effect].map(c=>c*brightness);
 const distances=resource.palette.slice(1).map(rgb=>rgb.reduce((sum,c,i)=>sum+Math.abs(c-target[i]),0));
 return 1+distances.indexOf(Math.min(...distances));
}
for(const effect of resource.effects){
 for(let brightness=0;brightness<256;brightness++)assert.equal(resource.brightnessMaps[effect][brightness],expectedIndex(effect,brightness));
 for(let index=0;index<256;index++){
  const rgb=resource.palette[index],targetIndex=index?expectedIndex(effect,Math.floor(rgb.reduce((a,b)=>a+b,0)/3)):0;
  assert.equal(resource.sourceIndexMaps[effect][index],targetIndex);
  for(const alpha of index?[1,64,128,255]:[0])assert.deepEqual(Array.from(api.mapActorPalettePixel(effect,[...rgb,alpha])),index?[...resource.palette[targetIndex],alpha]:[0,0,0,0]);
 }
}
assert.ok(resource.palette.slice(1).some(rgb=>rgb.reduce((a,b)=>a+b,0)%3!==0));
pass('1536 brightness + 1536 source-index cases independently match div/nearest/first-tie rules and preserve alpha');

const bytes=api.actorPaletteBytes();
assert.equal(bytes.length,256*6*4);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),resource.lookup.rgbaSha256);
for(let row=0;row<6;row++)for(let x=0;x<256;x++)assert.deepEqual(Array.from(bytes.slice((row*256+x)*4,(row*256+x)*4+4)),[...resource.palette[expectedIndex(resource.effects[row],x)],255]);
pass('the production 6144-byte row-major texture matches every independent palette color and its locked hash');

const filters=resource.effects.map(effect=>api.createActorPaletteFilter(effect));
const source=filters[0].resources.uPaletteTexture;
for(let row=0;row<filters.length;row++){
 const filter=filters[row];assert.equal(filter.resources.uPaletteTexture,source);assert.equal(filter.resources.paletteUniforms.uniforms.uEffectRow,row);
 assert.equal(filter.resolution,1);assert.equal(filter.padding,0);assert.equal(filter.antialias,'off');assert.equal(filter.blendMode,'normal');
 assert.equal(filter.resources.uPaletteSampler,source.style);assert.equal(source.style.scaleMode,'nearest');assert.equal(source.style.addressModeU,'clamp-to-edge');
 assert.deepEqual(filter.gpuProgram.layout,[{gfu:0,uTexture:1,uSampler:2},{paletteUniforms:0,uPaletteTexture:1,uPaletteSampler:2}]);
 assert.equal(filter.gpuProgram.attributeData.aPosition.format,'float32x2');
}
assert.equal(source.width,256);assert.equal(source.height,6);assert.equal(source.format,'rgba8unorm');assert.equal(source.alphaMode,'no-premultiply-alpha');assert.deepEqual(Array.from(source.resource),Array.from(bytes));
const program=filters[0].gpuProgram;assert.ok(filters.every(filter=>filter.gpuProgram===program));
filters[0].destroy();assert.equal(source.destroyed,false);assert.equal(program.fragment.source,api.ACTOR_PALETTE_WGSL);
for(const filter of filters.slice(1))filter.destroy();assert.equal(source.destroyed,false);
pass('real Pixi filter bindings/nearest texture metadata parse, and actor destruction retains the shared LUT/program');

// Shader strings implement the same byte stages. This guards accidental
// fractional RGB averaging, matrix regression and premultiplied-alpha loss;
// it is source review, not an actual GLSL/WGSL compiler/runtime result.
assert.match(api.ACTOR_PALETTE_FRAGMENT,/floor\(clamp\(color\.rgb\/color\.a/);
assert.match(api.ACTOR_PALETTE_FRAGMENT,/floor\(\(rgb\.r\+rgb\.g\+rgb\.b\)\/3\.0\)/);
assert.match(api.ACTOR_PALETTE_FRAGMENT,/mapped\*color\.a,color\.a/);
assert.match(api.ACTOR_PALETTE_WGSL,/textureSampleLevel\(uPaletteTexture/);
assert.match(api.ACTOR_PALETTE_WGSL,/vec4<f32>\(mapped\*color\.a,color\.a\)/);
const rgba=[17,91,181,255];assert.equal(Math.floor((17+91+181)/3),96);
assert.deepEqual(Array.from(api.mapActorPalettePixel('red',rgba)),[...resource.palette[expectedIndex('red',96)],255]);
assert.deepEqual(Array.from(api.mapActorPalettePixel('green',[255,255,255,0])),[0,0,0,0]);
pass('GL/WGSL source uses integer byte recovery/division/LUT and transparent output; actual GPU compilation remains pending');
console.log(`${passed} actor-palette groups passed; no browser_runtime/native_runtime/visual_comparison is claimed.`);
