import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {BufferImageSource,Container,Filter,GpuProgram,Texture,UniformGroup} from 'pixi.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const pixi={BufferImageSource,Filter,GpuProgram,Texture,UniformGroup,GlProgram:{from:options=>({...options,_uniformData:{},destroy(){}})}};
const paletteContext={exports:{},Uint8Array,require:name=>name==='pixi.js'?pixi:{default:JSON.parse(read('content/classic-176/'+(name.endsWith('actor-status-palette.json')?'actor-status-palette.json':'actor-status.json')))}};
vm.createContext(paletteContext);vm.runInContext(compile(read('apps/web/src/actor-palette.ts')),paletteContext);
const destruction=new WeakMap();
const actualFactory={createActorPaletteFilter:effect=>{const filter=paletteContext.exports.createActorPaletteFilter(effect),destroy=filter.destroy.bind(filter);destruction.set(filter,0);filter.destroy=(...args)=>{destruction.set(filter,destruction.get(filter)+1);destroy(...args);};return filter;}};
const toneContext={exports:{},require:()=>actualFactory};vm.createContext(toneContext);vm.runInContext(compile(read('apps/web/src/world-tone.ts')),toneContext);
const {WorldTone}=toneContext.exports;
let passed=0;const pass=name=>{passed++;console.log('PASS '+name);};
{
 const world=new Container(),floor=new Container(),actors=new Container(),hud=new Container();world.addChild(floor,actors);
 const other=new Filter(),hudFilter=new Filter();world.filters=[other];hud.filters=[hudFilter];
 const tone=new WorldTone(world);tone.setDead(false);assert.deepEqual(Array.from(world.filters),[other]);
 tone.setDead(true);const gray=world.filters[1];assert.ok(gray instanceof Filter);assert.equal(gray.resources.paletteUniforms.uniforms.uEffectRow,5);
 for(let n=0;n<8;n++)tone.setDead(true);
 assert.deepEqual(Array.from(world.filters),[other,gray]);assert.deepEqual(hud.filters,[hudFilter]);assert.equal((floor.filters??[]).length,0);assert.equal((actors.filters??[]).length,0);
 tone.setDead(false);assert.deepEqual(Array.from(world.filters),[other]);assert.equal(destruction.get(gray),0);tone.setDead(true);assert.equal(world.filters[1],gray);
 tone.setDarkLevel(2);assert.equal(tone.debugState().darkLevel,2);assert.equal(tone.debugState().fogApplied,false);
 tone.clear();assert.deepEqual(Array.from(world.filters),[other]);assert.equal(tone.debugState().dead,false);assert.equal(tone.debugState().darkLevel,undefined);
 const sharedLut=gray.resources.uPaletteTexture;tone.destroy();assert.equal(destruction.get(gray),1);assert.deepEqual(Array.from(world.filters),[other]);assert.deepEqual(hud.filters,[hudFilter]);assert.equal(sharedLut.destroyed,false);
 tone.setDead(true);tone.destroy();assert.deepEqual(Array.from(world.filters),[other]);
 pass('actual Pixi world owns one palette grayscale filter across death/revive/clear/dispose and preserves unrelated layers/filters/shared LUT');
}
{
 const world=new Container(),tone=new WorldTone(world);tone.setDead(true);const gray=world.filters[0],other=new Filter();world.filters=[other,gray];tone.clear();assert.deepEqual(Array.from(world.filters),[other]);
 for(const [level,expected] of [[0,0],[1,1],[2,2],[3,3],[65535,65535],[-1,undefined],[1.5,undefined],[NaN,undefined],[Infinity,undefined]]){tone.setDarkLevel(level);assert.equal(tone.debugState().darkLevel,expected);assert.equal(tone.debugState().fogApplied,false);}
 tone.destroy();pass('clear preserves filters added after death; darkness zero/unknown values are retained separately without invented fog');
}
const file=ts.createSourceFile('play.ts',read('apps/web/src/play.ts'),ts.ScriptTarget.Latest,true);
const functionCode=name=>{const node=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node);return compile(node.getText(file));};
function route(type,context){let node;function walk(n){if(ts.isIfStatement(n)&&n.expression.getText(file).startsWith(`message.type==='${type}'`))node=n.thenStatement;ts.forEachChild(n,walk);}walk(file);assert.ok(node);if(!vm.isContext(context))vm.createContext(context);vm.runInContext(compile(node.getText(file)),context);}
{
 const entities=new Map(),visuals=new Map(),world=new Container(),tone=new WorldTone(world),context={entities,visuals,worldTone:tone,view:{depth:new Container()},OnlineActor:class{constructor(){this.container=new Container();}update(){}},interact(){},paperdoll:{setFeature(){}},renderTargets(){},refreshMiniMapMarkers(){},magicEffects:{},audio:{}};
 vm.createContext(context);vm.runInContext(functionCode('update'),context);
 context.update({id:1,self:true,feature:0,dead:false});context.update({id:2,self:false,feature:3,dead:true});assert.equal(tone.debugState().dead,false);
 context.update({id:1,self:true,feature:0,dead:true});assert.equal(tone.debugState().dead,true);
 context.update({id:2,self:false,feature:3,dead:false});assert.equal(tone.debugState().dead,true);
 route('appearance',{...context,message:{type:'entityAlive',id:1,x:5,y:6,direction:2},combatTarget:undefined,stopCombat(){},showDeathWindow(){},restoreAliveWindow(){}});
 assert.equal(tone.debugState().dead,false);assert.equal(entities.get(1).dead,false);
 tone.destroy();pass('actual play update and alive branch apply self death immediately, ignore remote deaths and restore full-color revival');
}
{
 const entities=new Map([[1,{id:1,self:true,light:1,x:5}],[2,{id:2,self:false,light:2,x:6}]]),updates=[];
 route('actorLight',{message:{type:'actorLight',id:1,light:0},entities,update:e=>{updates.push(e);entities.set(e.id,e);}});
 route('actorLight',{message:{type:'actorLight',id:2,light:5},entities,update:e=>{updates.push(e);entities.set(e.id,e);}});
 route('actorLight',{message:{type:'actorLight',id:99,light:4},entities,update:e=>updates.push(e)});
 assert.equal(entities.get(1).light,0);assert.equal(entities.get(2).light,5);assert.equal(updates.length,2);assert.equal(entities.get(1).x,5);
 const calls=[];route('daylight',{message:{type:'daylight',phase:0,darkLevel:2},classicHud:{daylight:(p,d)=>calls.push(['hud',p,d])},worldTone:{setDarkLevel:d=>calls.push(['world',d])}});
 assert.deepEqual(calls,[['hud',0,2],['world',2]]);
 pass('actual play actor-light zero/remote/removal branches preserve identity and daylight sends separate authority to HUD/world');
}
console.log(`${passed} world-tone groups passed; real Pixi metadata and TS/AST execution, no browser/GPU/original comparison.`);
