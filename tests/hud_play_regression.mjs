import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8');
const file=ts.createSourceFile('play.ts',source,ts.ScriptTarget.Latest,true);
function route(type,context){
 let block;
 function visit(node){if(ts.isIfStatement(node)&&ts.isBinaryExpression(node.expression)&&node.expression.left.getText(file)==='message.type'&&node.expression.right.text===type)block=node.thenStatement;ts.forEachChild(node,visit);}
 visit(file);assert.ok(block,`production ${type} route missing`);
 vm.createContext(context);vm.runInContext(ts.transpileModule(block.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
}
{
 const calls=[];
 route('mapDescription',{message:{type:'mapDescription',title:'比奇省',musicId:7},classicHud:{mapDescription:title=>calls.push(title)}});
 assert.deepEqual(calls,['比奇省']);
 console.log('PASS: production map description branch takes the gateway title without deriving it from map ID');
}
{
 const calls=[],message={type:'weights',weight:35,wearWeight:5,handWeight:3};
 route('weights',{message,characterPanel:{weights:v=>calls.push(['panel',v])},classicHud:{weights:v=>calls.push(['hud',v])}});
 assert.deepEqual(calls,[['panel',message],['hud',message]]);
 console.log('PASS: actual play weight branch updates both character window and HUD from the same authority');
}
{
 const calls=[];
 for(const [phase,darkLevel] of [[0,2],[3,0]])route('daylight',{message:{type:'daylight',phase,darkLevel},classicHud:{daylight:(p,d)=>calls.push([p,d])},worldTone:{setDarkLevel(){}}});
 assert.deepEqual(calls,[[0,2],[3,0]]);
 console.log('PASS: actual play daylight branch retains morning zero and separate darkness');
}
{
 const calls=[];route('myStatus',{message:{type:'myStatus',status:4},classicHud:{hungerStatus:v=>calls.push(v)}});assert.deepEqual(calls,[4]);
 console.log('PASS: actual play status branch drives hunger indicator from the native projected value');
}
{
 const calls=[],entities=new Map([[1,{id:1,self:true,name:'player'}],[2,{id:2,self:false,name:'monster'}]]);
 const context={entities,update:e=>entities.set(e.id,e),audio:{play(){}},characterPanel:{resources:v=>calls.push(['panel',v])},classicHud:{resource:v=>calls.push(['hud',v])},combatTarget:undefined,stopCombat(){},combatStatus:{textContent:''}};
 route('health',{...context,message:{type:'health',id:1,hp:25,maxHp:100,damage:5}});
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['panel',{hp:25,maxHp:100}],['hud',{hp:25,maxHp:100}]]);
 route('health',{...context,message:{type:'health',id:2,hp:10,maxHp:200,damage:5}});
 assert.equal(calls.length,2);
 console.log('PASS: native hit health immediately updates player HUD while monster health cannot overwrite it');
}
{
 let selectAction,activate;
 function visit(node){
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='activateSkillSlot')activate=node;
  if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='skillBar'&&ts.isNewExpression(node.initializer)&&node.initializer.expression.getText(file)==='SkillBar'){
   const actions=node.initializer.arguments?.[1];
   if(actions&&ts.isObjectLiteralExpression(actions))for(const property of actions.properties)if(ts.isPropertyAssignment(property)&&property.name.getText(file)==='select')selectAction=property.initializer;
  }
  ts.forEachChild(node,visit);
 }
 visit(file);assert.ok(activate);assert.ok(selectAction);
 const hostile={magicId:10,name:'火球术'},passive={magicId:11,name:'攻杀剑术'},self={magicId:12,name:'治愈术'},skills=[hostile,passive,self];
 const context={selectedMagic:undefined,classicHud:{selected:undefined,selectSkill(id){this.selected=id;}},connection:{textContent:''},mining:{cancel(){}},worldInputAvailable:()=>true,worldInputBlocked:()=>false,skillUseOf:id=>id===11?'passive':id===12?'self':'hostile'};
 context.skillBar={selected:undefined,skillAt:index=>skills[index],selectSlot(index){this.selected=skills[index].magicId;context.selectAction(skills[index]);return true;},castSelf(skill){this.selected=undefined;context.selectAction(undefined);return true;},cancelSelection(){if(this.selected===undefined)return false;this.selected=undefined;context.selectAction(undefined);return true;}};
 const unit=`var selectAction=${selectAction.getText(file)};\n${activate.getText(file)}`;
 vm.createContext(context);
 vm.runInContext(ts.transpileModule(unit,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 assert.equal(context.activateSkillSlot(0),true);assert.equal(context.selectedMagic,hostile);assert.equal(context.classicHud.selected,hostile.magicId);
 context.skillBar.cancelSelection();assert.equal(context.selectedMagic,undefined);assert.equal(context.classicHud.selected,undefined);
 assert.equal(context.activateSkillSlot(1),true);assert.equal(context.classicHud.selected,undefined);
 assert.equal(context.activateSkillSlot(2),true);assert.equal(context.selectedMagic,undefined);assert.equal(context.classicHud.selected,undefined);
 console.log('PASS: production HUD/skill selection route keeps target, cancel, passive and self-cast presentation synchronized');
}
