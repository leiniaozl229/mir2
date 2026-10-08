import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8');
const ast=ts.createSourceFile('play.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=new Set(['overlap','layoutActorLabels']);
const declarations=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name&&names.has(node.name.text));
assert.equal(declarations.length,names.size,'production actor label layout functions missing');
const code=ts.transpileModule(`${declarations.map(node=>node.getText(ast)).join('\n')}\nglobalThis.layout=layoutActorLabels;`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

class Label {
 constructor(x,y,width,height){this.x=x;this.y=y;this.width=width;this.height=height;this.offsetX=0;this.offsetY=0;this.visible=true;}
 setLabelOffset(y,x=0){this.offsetY=y;this.offsetX=x;}
 labelBoundsAt(y,x=0){return {x:this.x+x,y:this.y+y,width:this.width,height:this.height};}
 labelBounds(){return this.labelBoundsAt(this.offsetY,this.offsetX);}
 setLabelVisible(visible){this.visible=visible;}
}
function crowdedScene(count,x,y){
 const entities=new Map(),visuals=new Map();
 for(let id=count;id>0;id--){
  entities.set(id,{id,x:10,y:10,self:id===count,name:`怪物${id}`});
  visuals.set(id,new Label(x,y,72,14));
 }
 const context={entities,visuals};vm.createContext(context);vm.runInContext(code,context);context.layout();
 const visible=[...visuals.values()].filter(label=>label.visible),rects=visible.map(label=>label.labelBounds());
 assert.equal(visible.length,count,`all ${count} labels should fit the stage at origin ${x},${y}`);
 for(const rect of rects){assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=800&&rect.y+rect.height<=600,`label escaped stage: ${JSON.stringify(rect)}`);}
 for(let left=0;left<rects.length;left++)for(let right=left+1;right<rects.length;right++){
  const a=rects[left],b=rects[right];
  assert.ok(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),`labels overlap: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
 }
 assert.equal(visuals.get(count).offsetX,0,'self name keeps its preferred position');
}

crowdedScene(36,360,240);
crowdedScene(36,8,4);
crowdedScene(36,720,576);
console.log('PASS dense actor labels use deterministic multi-column placement, keep the self label first, and remain inside stage edges');
