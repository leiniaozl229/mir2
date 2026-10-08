import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {itemIconProductionSource} from './item_icon_test_source.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const production=['apps/web/src/classic-layout.ts','apps/web/src/mining-controller.ts','apps/web/src/inventory.ts','apps/web/src/item-quickbar.ts','apps/web/src/service-window.ts','apps/web/src/shop.ts','apps/web/src/repair.ts','apps/web/src/storage.ts','apps/web/src/ground-items.ts'];
const source=`${itemIconProductionSource(root)}const uiLayout=${read('content/classic-176/ui-layout.json')};const uiInteractions=${read('content/classic-176/ui-interactions.json')};const serviceUi=${read('content/classic-176/service-ui.json')};\n${production.map(file=>read(file).replace(/^import .*;\r?\n/gm,'')).join('\n')}`;
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const families={items:'Items',stateitem:'stateitem',dnitems:'DnItems'};
const national=Object.fromEntries(Object.keys(families).map(family=>[family,JSON.parse(read(`assets/web/ui-national/${family}/library.json`))]));
const gameplay=Object.fromEntries(Object.entries(families).map(([family,name])=>[family,JSON.parse(read(`assets/web/items/${name}/library.json`))]));
const clone=value=>structuredClone(value),pending=()=>new Promise(()=>{}),flush=async()=>{for(let i=0;i<14;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};

function environment(options={}){
 const requests=[],nationalRequests=[],textureRequests=[],unloads=[],timers=new Map(),imageAlpha=new Map();let nextTimer=0;
 class Events{
  listeners=new Map();addEventListener(type,fn){const list=this.listeners.get(type)??[];list.push(fn);this.listeners.set(type,list);}removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(x=>x!==fn));}
 }
 const document=new Events();document.defaultView=new Events();
 class Element extends Events{
  constructor(tag='div'){super();this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.className='';this.hidden=false;this.disabled=false;this.ownerDocument=document;this.offsetLeft=0;this.offsetTop=0;this.style={setProperty(name,value){this[name]=value;}};this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...names])].join(' ');},remove:(...names)=>{this.className=this.className.split(' ').filter(name=>!names.includes(name)).join(' ');},contains:name=>this.className.split(' ').includes(name)};}
  append(...children){for(const child of children){this.children.push(child);child.parentElement=this;}}
  replaceChildren(...children){for(const child of this.children)child.parentElement=undefined;this.children=[];this.append(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=undefined;}
  querySelector(selector){return this.querySelectorAll(selector)[0];}
  querySelectorAll(selector){return this.children.flatMap(walk).filter(node=>selector==='[data-slot]'?node.dataset.slot!==undefined:selector==='.item-cell.selected'?node.classList.contains('selected'):false);}
  closest(){return undefined;}matches(){return false;}
  getContext(){if(this.tag!=='canvas')return undefined;let resource;return {drawImage(value){resource=value;},getImageData(){return {data:Uint8ClampedArray.from([100,110,120,(resource?._alpha??imageAlpha.get(resource?.src)??true)?255:0])};}};}
 }
 document.createElement=tag=>new Element(tag);document.body=new Element('body');
 class Container{
  children=[];position={set:(x,y)=>{this.x=x;this.y=y;}};addChild(...children){this.children.push(...children);}destroy(){this.destroyed=true;}getBounds(){return {x:this.x??0,y:this.y??0,width:48,height:32};}
 }
 class Texture{constructor(width=0,height=0,resource={_alpha:true}){this.width=width;this.height=height;this.source={resource};}static EMPTY=new Texture();}
 class Sprite{constructor(texture){this.texture=texture;this.anchor={set:(...args)=>{this.anchorValue=args;}};this.position={set:(...args)=>{this.positionValue=args;}};}}
 class Text extends Sprite{constructor(options){super(Texture.EMPTY);this.text=options.text;}}
 function nativeTexture(url){const base=url.split('?')[0],family=base.includes('/dnitems/')?'dnitems':base.includes('/stateitem/')?'stateitem':'items';const frame=Object.values(national[family].frames).find(f=>base.endsWith('/'+f.file));assert.ok(frame,`unregistered frame requested: ${url}`);return new Texture(frame.width,frame.height);}
 const Assets={load:url=>{textureRequests.push(url);return options.texture?options.texture(url,{nativeTexture,Texture}):Promise.resolve(nativeTexture(url));},unload:url=>{unloads.push(url);return options.unload?options.unload(url):Promise.resolve();}};
 const context={exports:{},document,HTMLElement:Element,Container,Texture,Sprite,Text,Assets,
  setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
  loadNationalUiLibrary:family=>{nationalRequests.push(family);if(family==='prguse')return Promise.resolve({frames:{}});return options.national?options.national(family):Promise.resolve(national[family]);},
  fetch:url=>{requests.push(url);return options.fetch?options.fetch(url):Promise.resolve({ok:true,json:async()=>gameplay[Object.keys(families).find(family=>url===`/items/${families[family]}/library.json`)]});}};
 vm.createContext(context);vm.runInContext(compiled,context);
 return {document,Element,Container,Texture,context,requests,nationalRequests,textureRequests,unloads,timers,imageAlpha,...context.exports};
}
const walk=element=>[element,...element.children.flatMap(walk)];
const find=(element,fn)=>walk(element).find(fn),icon=(element)=>find(element,node=>node.dataset.iconState!==undefined),control=(panel,name)=>find(panel,node=>node.dataset.serviceControl===name);
const event=()=>({defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},clientX:20,clientY:30,shiftKey:false});
const state=view=>JSON.parse(JSON.stringify(view.debugState()));
const sword={name:'木剑',makeIndex:101,durability:8500,maxDurability:10000,stdMode:5,weight:1,looks:30};
const potion={...sword,name:'金创药(小量)',makeIndex:102,stdMode:0,looks:1};
const bag=env=>{const panel=new env.Element(),sent=[];const view=new env.InventoryView(panel,{drop:id=>sent.push(['drop',id]),equip:(id,slot)=>sent.push(['equip',id,slot]),use:id=>sent.push(['use',id])});return {panel,view,sent};};
const shop=env=>{const panel=new env.Element(),sent=[];const view=new env.ShopView(panel,{details(){},buy(){},quote:(...args)=>{sent.push(['quote',...args]);return true;},sell:(...args)=>{sent.push(['sell',...args]);return true;}});return {panel,view,sent};};

{
 const env=environment();assert.equal(env.iconIndexOf({name:'祖玛井中月',looks:5144}),5144);assert.equal(env.itemIconIndex({name:'无极棍',looks:1144}),1144);
 const assets=new env.ItemIconAssets('items',()=>{});await flush();const missing=env.itemIconElement({name:'祖玛井中月',looks:5144},assets);assert.equal(missing.dataset.iconState,'missing');assert.equal(missing.dataset.iconIndex,'5144');assert.equal(missing.dataset.iconMapping,'proposed_unselected');assert.equal(missing.dataset.proposedIconIndex,'48');assert.equal(missing.onclick,undefined);assert.equal(assets.retry(),false);
 pass('raw Looks remains exact; name overrides and default-frame proposals are visible diagnostics and never selected');
}
{
 const env=environment();const assets=new env.ItemIconAssets('items',()=>{});await flush();const value=assets.state(sword);assert.equal(value.status,'ready');assert.equal(value.url,`/ui-national/items/${national.items.frames[30].file}`);assert.equal(value.domain,'national');
 assert.equal(env.resolveIconFrame(30,[{namespace:'/ui-national/items',library:{...national.items,sourceSha256:'bad'}}]).status,'missing');assert.equal(env.resolveIconFrame(30,[{namespace:'/items/Items',library:{...gameplay.items,indexSha256:'bad'}}]).status,'missing');assert.equal(env.resolveIconFrame(30,[{namespace:'/ui/Items',library:national.items}],{allowReference:true}).status,'missing');
 pass('national preference requires registered namespace and matching WIL/WIX identity; unrelated reference names do not qualify');
}
{
 const env=environment({national:()=>Promise.reject(new Error('network'))});const assets=new env.ItemIconAssets('items',()=>{});await flush();assert.equal(assets.state(sword).url,`/items/Items/${gameplay.items.frames[30].file}`);
 assert.equal(national.items.sourceSha256,gameplay.items.sourceSha256);assert.equal(national.items.indexSha256,gameplay.items.indexSha256);
 pass('alternate export is allowed only at the same exact index in the registered identical national family');
}
{
 const env=environment();const assets=new env.ItemIconAssets('stateitem',()=>{});await flush();assert.equal(assets.state(potion).status,'missing');assert.equal(assets.state(sword).url,`/ui-national/stateitem/${national.stateitem.frames[30].file}`);
 assert.equal(assets.state({name:'扩展服装',looks:10030}).status,'missing');assert.equal(assets.retry(),false);assert.deepEqual(env.requests,['/items/stateitem/library.json']);
 pass('stateitem is an independent family; its placeholder or absent StN extension never borrows Items');
}
{
 const env=environment();const asset=new env.ItemIconAssets('items',()=>{});await flush();const tiny=Object.values(national.items.frames).find(f=>f.width<=4||f.height<=1);assert.ok(tiny);assert.equal(asset.state({name:'占位物品',looks:tiny.index}).status,'missing');
 assert.equal(env.usableIconFrame({...national.items.frames[30],opaquePixels:0}),undefined);assert.equal(env.resolveIconFrame(30,[{namespace:'/ui-national/items',library:{...national.items,frames:{30:{...national.items.frames[30],index:31}}}}]).reason,'frame_index_mismatch');
 pass('tiny, declared transparent and wrong-identity frames cannot become real icons');
}
{
 const env=environment();const asset=new env.ItemIconAssets('items',()=>{});await flush();const image=env.itemIconElement(sword,asset);image.naturalWidth=image.width;image.naturalHeight=image.height;env.imageAlpha.set(image.src,false);image.onload();assert.equal(asset.state(sword).status,'missing');assert.equal(asset.state(sword).reason,'decoded_empty');assert.equal(asset.retry(),false);
 assert.equal(env.itemIconHasPixels({_alpha:true},8,4),true);assert.equal(env.itemIconHasPixels({_alpha:false},8,4),false);assert.equal(env.itemIconHasPixels({},8,4,{createElement:()=>({})}),undefined);
 pass('decoded alpha-zero frames remain explicit missing while unavailable readback makes no pixel claim');
}
{
 let calls=0;const env=environment({fetch:()=>{calls++;return calls===1?Promise.reject(new Error('network')):Promise.resolve({ok:true,json:async()=>gameplay.items});}});
 const first=env.loadFallbackItemIcons(),duplicate=env.loadFallbackItemIcons();assert.equal(first,duplicate);await assert.rejects(first,/network/);await flush();const retry=env.loadFallbackItemIcons();assert.notEqual(first,retry);assert.equal(await retry,gameplay.items);assert.equal(env.loadFallbackItemIcons(),retry);assert.equal(calls,2);
 pass('failed fallback-library promise is evicted; concurrent and successful loads remain deduplicated');
}
{
 let calls=0;const env=environment({fetch:()=>{calls++;return Promise.resolve(calls===1?{ok:true,json:async()=>{throw new Error('JSON failure');}}:calls===2?{ok:false}:{ok:true,json:async()=>gameplay.items});}});
 await assert.rejects(env.loadFallbackItemIcons(),/JSON failure/);await flush();await assert.rejects(env.loadFallbackItemIcons(),/图标加载失败/);await flush();assert.equal(await env.loadFallbackItemIcons(),gameplay.items);assert.equal(calls,3);
 pass('JSON and HTTP manifest failures can be retried without retaining a rejected cache entry');
}
{
 let failed=true;const env=environment({national:()=>failed?Promise.reject(new Error('offline')):Promise.resolve(national.items),fetch:()=>failed?Promise.reject(new Error('offline')):Promise.resolve({ok:true,json:async()=>gameplay.items})});const assets=new env.ItemIconAssets('items',()=>{});await flush();assert.equal(assets.state(sword).status,'failed');const retry=env.itemIconElement(sword,assets),e=event();failed=false;retry.onclick(e);assert.equal(e.stopped,true);await flush();assert.equal(assets.state(sword).status,'ready');
 pass('explicit retry reloads failed manifests using the real selection helper and stops parent item activation');
}
{
 const env=environment();const assets=new env.ItemIconAssets('items',()=>{});await flush();const old=env.itemIconElement(sword,assets);old.onerror();assert.equal(assets.state(sword).status,'failed');const retry=env.itemIconElement(sword,assets);assert.equal(retry.textContent,'重试');retry.onkeydown({...event(),key:'Enter'});assert.equal(assets.state(sword).status,'ready');old.onerror();assert.equal(assets.state(sword).status,'ready');const image=env.itemIconElement(sword,assets);assert.equal(image.src,`${old.src}?retry=1`);assert.equal(env.itemIconElement(potion,assets).src,`/ui-national/items/${national.items.frames[1].file}`);image.naturalWidth=1;image.naturalHeight=1;image.onload();assert.equal(assets.state(sword).status,'failed');
 pass('image retry rejects old-generation failures and checks decoded dimensions against exact frame metadata');
}
{
 const load=deferred(),env=environment({national:()=>load.promise,fetch:pending}),h=bag(env);h.view.replace([sword]);const cell=h.panel.children[0];cell.onclick(event());const held=env.document.body.children.at(-1);assert.equal(h.view.heldItem().makeIndex,101);assert.equal(held.hidden,false);load.resolve(national.items);await flush();assert.equal(h.view.heldItem().makeIndex,101);assert.equal(held.children[0].src,`/ui-national/items/${national.items.frames[30].file}`);assert.equal(held.style.left,'30px');assert.equal(held.style.top,'40px');assert.deepEqual(h.sent,[]);
 pass('asynchronous icon completion updates the held preview without dropping selection, moving it or sending an action');
}
{
 const env=environment(),h=bag(env);h.view.replace([sword]);await flush();icon(h.panel).onerror();h.view.retryIcons();h.view.requestDrop(101);const before=state(h.view);icon(h.panel).onerror();h.view.retryIcons();assert.deepEqual(state(h.view),before);assert.equal(h.panel.children[0].disabled,true);assert.deepEqual(h.sent,[['drop',101]]);h.view.resolve(101,false,true);
 pass('icon retry preserves the bag authoritative instance and an already-sent item action lock');
}
{
 const load=deferred(),env=environment({national:()=>load.promise,fetch:pending}),h=bag(env);h.view.replace([sword]);h.panel.children[0].onclick(event());h.view.clear();load.resolve(national.items);await flush();assert.equal(state(h.view).items.length,0);assert.equal(state(h.view).known,false);assert.equal(env.document.body.children.at(-1).hidden,true);assert.equal(h.panel.children.some(x=>x.dataset.itemId!==undefined),false);
 pass('late atlas completion after clearing inventory cannot restore a removed item or its held preview');
}
{
 const env=environment(),panel=new env.Element(),sent=[],view=new env.EquipmentView(panel,slot=>{sent.push(slot);return true;});view.replace([{slot:1,item:sword},{slot:7,item:potion}]);await flush();const appearance=find(panel,node=>node.classList.contains('equipment-appearance')),frame=national.stateitem.frames[30];assert.ok(appearance);assert.equal(appearance.style.left,`${env.EQUIPMENT_APPEARANCE_ORIGIN.x+frame.offsetX}px`);assert.equal(appearance.style.top,`${env.EQUIPMENT_APPEARANCE_ORIGIN.y+frame.offsetY}px`);assert.ok(icon(appearance).src.includes('/stateitem/'));
 const empty=find(panel,node=>node.dataset.slot==='7');assert.equal(icon(empty).dataset.iconState,'missing');assert.equal(empty.disabled,false);empty.onclick();assert.deepEqual(sent,[7]);const before=state(view);assert.equal(view.retryIcons(),false);assert.deepEqual(state(view),before);view.rejectPending();
 pass('paperdoll uses stateitem signed geometry; missing accessory art retains takeoff and its authority lock');
}
{
 const env=environment(),panel=new env.Element(),used=[],view=new env.ItemQuickBar(panel,{use:id=>{used.push(id);return true;}});view.replace([{...potion,looks:5022}]);await flush();const button=panel.children[0];assert.equal(icon(button).dataset.iconState,'missing');assert.equal(button.draggable,true);button.onclick(event());assert.deepEqual(used,[102]);const before=state(view);assert.equal(view.retryIcons(),false);assert.deepEqual(state(view),before);assert.equal(panel.children[0].disabled,true);view.rejectPending();
 pass('missing quickbar art retains consumable identity, binding and server-pending use behavior');
}
{
 const env=environment(),h=shop(env);h.view.openSell(7,[sword]);h.view.offerInventoryItem(sword);await flush();const before=state(h.view),timerCount=env.timers.size;icon(h.panel).onerror();h.view.assets.retryIcons();assert.deepEqual(state(h.view),before);assert.equal(env.timers.size,timerCount);assert.deepEqual(h.sent,[['quote',7,101]]);
 h.view.showSellQuote(7,sword,123);control(h.panel,'confirm').onclick(event());const sale=state(h.view);icon(h.panel).onerror();h.view.assets.retryIcons();assert.deepEqual(state(h.view),sale);assert.equal(state(h.view).quote.price,123);assert.equal(state(h.view).pending.kind,'sale');h.view.clear();
 pass('asset failure and retry retain pending quote/sale, offered instance, price and transaction identity');
}
{
 const env=environment(),h=shop(env),other={...sword,makeIndex:202,looks:31,name:'另一把剑'};h.view.openSell(7,[sword,other]);h.view.offerInventoryItem(sword);h.view.showSellQuote(7,sword,123);await flush();const old=icon(h.panel);h.view.cancelSelection();h.view.offerInventoryItem(other);const before=state(h.view);old.onerror();h.view.assets.retryIcons();assert.deepEqual(state(h.view),before);assert.equal(icon(h.panel).dataset.iconIndex,'31');assert.equal(state(h.view).selectedItem.makeIndex,202);assert.deepEqual(h.sent,[['quote',7,101],['quote',7,202]]);h.view.clear();
 pass('a previous item image callback cannot replace a newer service selection or bind its quote to the old instance');
}
{
 const load=deferred(),env=environment({national:()=>load.promise,fetch:pending}),h=shop(env);h.view.openSell(7,[sword]);h.view.offerInventoryItem(sword);h.view.clear();load.resolve(national.items);await flush();assert.equal(h.panel.hidden,true);assert.equal(h.panel.children.length,0);assert.equal(state(h.view).selectedItem,undefined);assert.equal(state(h.view).pending,undefined);
 pass('late library completion preserves a closed NPC service window and never resurrects its item or wait');
}
{
 const env=environment(),repairPanel=new env.Element(),repair=new env.RepairView(repairPanel,{quote:()=>true,repair:()=>true}),storagePanel=new env.Element(),storage=new env.StorageView(storagePanel,{store:()=>true,take:()=>true});repair.open(7,[sword]);repair.offerInventoryItem(sword);storage.openDeposit(7,[sword]);storage.offerInventoryItem(sword);control(storagePanel,'confirm').onclick(event());await flush();
 const beforeRepair=state(repair),beforeStore=state(storage);icon(repairPanel).onerror();repair.assets.retryIcons();icon(storagePanel).onerror();storage.assets.retryIcons();assert.deepEqual(state(repair),beforeRepair);assert.deepEqual(state(storage),beforeStore);assert.equal(state(repair).pending.kind,'quote');assert.equal(state(storage).pending.kind,'store');repair.clear();storage.clear();
 pass('shared service icon retry preserves actual repair quotation and storage-deposit waits');
}
{
 const env=environment({fetch:()=>Promise.reject(new Error('alternate offline'))}),layer=new env.Container(),list=new env.Element(),picked=[],view=new env.GroundItems(layer,item=>picked.push(item),list),item={id:501,x:25,y:25,looks:30,name:'木剑'};view.add(item);await flush();assert.deepEqual(env.textureRequests,[`/ui-national/dnitems/${national.dnitems.frames[30].file}`]);assert.equal(layer.children[0].children[0].texture.width,national.dnitems.frames[30].width);assert.deepEqual(layer.children[0].children[0].positionValue,[24,16]);list.children[0].onclick();assert.equal(picked[0],item);
 pass('ground uses exact DnItems independently of an alternate-export failure and retains real pickup identity');
}
{
 const env=environment(),layer=new env.Container(),list=new env.Element(),picked=[],view=new env.GroundItems(layer,item=>picked.push(item),list),item={id:502,x:25,y:25,looks:5147,name:'祖玛炼狱'};view.add(item);await flush();assert.equal(env.textureRequests.length,0);assert.equal(list.children[0].dataset.iconState,'missing');list.children[0].onclick();assert.equal(picked[0],item);assert.equal(await view.retryIcons(),false);assert.equal(view.get(502),item);
 pass('out-of-source ground appearance stays explicit missing while its instance, position and pickup remain available');
}
{
 const texture=deferred(),env=environment({texture:()=>texture.promise}),layer=new env.Container(),list=new env.Element(),view=new env.GroundItems(layer,()=>{},list),item={id:503,x:25,y:25,looks:30,name:'木剑'};view.add(item);await flush();const removed=layer.children[0];view.clear();texture.resolve(new env.Texture(36,24));await flush();assert.equal(removed.destroyed,true);assert.equal(removed.children[0].texture,env.Texture.EMPTY);assert.equal(state(view).length,0);assert.equal(list.children.length,0);
 pass('late texture completion cannot paint a cleared ground generation or restore its pickup list');
}
{
 const first=deferred(),second=deferred();const env=environment({texture:url=>url.endsWith(national.dnitems.frames[30].file)?first.promise:second.promise}),layer=new env.Container(),view=new env.GroundItems(layer,()=>{}),old={id:504,x:25,y:25,looks:30,name:'旧物'},next={...old,x:26,looks:31,name:'新物'};view.add(old);await flush();view.add(next);await flush();first.resolve(new env.Texture(36,24));await flush();assert.equal(layer.children[1].children[0].texture,env.Texture.EMPTY);second.resolve(new env.Texture(32,22));await flush();assert.equal(layer.children[1].children[0].texture.width,32);assert.equal(view.get(504),next);
 pass('same ground ID replacement ignores an earlier image and uses the current authoritative item and position');
}
{
 const failures=new Map();let allow=false;const env=environment({texture:(url,{nativeTexture})=>{if(failures.has(url))return failures.get(url);const request=allow?Promise.resolve(nativeTexture(url)):Promise.reject(new Error('PNG offline'));failures.set(url,request);return request;},unload:url=>{failures.delete(url);return Promise.resolve();}}),layer=new env.Container(),list=new env.Element(),picked=[],view=new env.GroundItems(layer,item=>picked.push(item),list),item={id:505,x:25,y:25,looks:30,name:'木剑'};view.add(item);await flush();assert.equal(list.children[0].dataset.iconState,'failed');const before=state(view);allow=true;const retry=view.retryIcons();assert.equal(view.retryIcons(),retry);await retry;await flush();assert.deepEqual(state(view),before);assert.deepEqual(env.unloads,[`/ui-national/dnitems/${national.dnitems.frames[30].file}`]);assert.equal(layer.children[0].children[0].texture.width,36);assert.deepEqual(picked,[]);assert.equal(list.children[0].dataset.iconState,'ready');
 pass('ground retries only failed texture URLs, clears the rejected loader cache and preserves item/pickup state');
}
{
 const env=environment({texture:(url,{nativeTexture})=>{const result=nativeTexture(url);result.source.resource={_alpha:false};return Promise.resolve(result);}}),layer=new env.Container(),list=new env.Element(),view=new env.GroundItems(layer,()=>{},list);view.add({id:506,x:25,y:25,looks:30,name:'透明物品'});await flush();assert.equal(list.children[0].dataset.iconState,'missing');assert.equal(layer.children[0].children[0].texture,env.Texture.EMPTY);assert.equal(await view.retryIcons(),false);assert.equal(env.unloads.length,0);
 pass('decoded transparent ground frames are missing data and are never presented as a retryable network failure');
}
{
 const env=environment(),assets=new env.ItemIconAssets('items',()=>{});await flush();const item={name:'原同帧物品',looks:48},old=env.itemIconElement(item,assets,{isCurrent:()=>true}),current=env.itemIconElement(item,assets,{isCurrent:()=>true}),frame=national.items.frames[48];assert.equal(current.tag,'img');
 current.isConnected=true;current.naturalWidth=frame.width;current.naturalHeight=frame.height;current.onload();old.isConnected=false;old.naturalWidth=frame.width;old.naturalHeight=frame.height;old._alpha=false;old.onerror();old.onload();await flush();assert.equal(assets.state(item).status,'ready');assert.equal(assets.failedImageUrls().length,0);
 pass('detached same-frame image error and alpha-zero load cannot contaminate a successful current image');
}
{
 const env=environment(),assets=new env.ItemIconAssets('items',()=>{});await flush();const create=env.document.createElement,frame=national.items.frames[30];env.document.createElement=tag=>{const node=create(tag);if(tag==='img'){node.isConnected=false;node._alpha=false;Object.defineProperty(node,'src',{get:()=>node.cachedUrl,set:value=>{node.cachedUrl=value;node.naturalWidth=frame.width;node.naturalHeight=frame.height;node.onload();}});}return node;};
 const image=env.itemIconElement(sword,assets);assert.equal(assets.state(sword).status,'ready');image.isConnected=true;await flush();assert.equal(assets.state(sword).status,'missing');assert.equal(assets.state(sword).reason,'decoded_empty');
 pass('a cached load firing during src assignment is adopted after the newly created image is appended');
}
{
 const success=image=>{const family=image.src.includes('/stateitem/')?'stateitem':'items',frame=Object.values(national[family].frames).find(value=>image.src.endsWith('/'+value.file));assert.ok(frame);image.naturalWidth=frame.width;image.naturalHeight=frame.height;image.onload();};
 const stale=image=>{image._alpha=false;image.onerror();image.onload();};
 const env=environment(),inventory=bag(env);inventory.view.replace([sword]);await flush();const oldBag=icon(inventory.panel);success(oldBag);inventory.view.replace([{...sword,durability:7000}]);success(icon(inventory.panel));const beforeBag=state(inventory.view);stale(oldBag);assert.deepEqual(state(inventory.view),beforeBag);assert.equal(icon(inventory.panel).dataset.iconState,'ready');
 const equipmentPanel=new env.Element(),equipment=new env.EquipmentView(equipmentPanel,()=>true);equipment.replace([{slot:7,item:sword}]);await flush();const oldEquipment=icon(equipmentPanel);success(oldEquipment);equipment.replace([{slot:7,item:{...sword,makeIndex:202}}]);success(icon(equipmentPanel));const beforeEquipment=state(equipment);stale(oldEquipment);assert.deepEqual(state(equipment),beforeEquipment);assert.equal(icon(equipmentPanel).dataset.iconState,'ready');
 const quickPanel=new env.Element(),quick=new env.ItemQuickBar(quickPanel,{use:()=>true});quick.replace([potion]);await flush();const oldQuick=icon(quickPanel);success(oldQuick);quick.clear();quick.replace([{...potion,makeIndex:303}]);quickPanel.children[0].onclick(event());success(icon(quickPanel));const beforeQuick=state(quick);stale(oldQuick);assert.deepEqual(state(quick),beforeQuick);assert.equal(icon(quickPanel).dataset.iconState,'ready');assert.equal(state(quick).pending[0],303);quick.rejectPending();
 const service=shop(env);service.view.openSell(7,[sword]);service.view.offerInventoryItem(sword);await flush();const oldService=icon(service.panel);success(oldService);service.view.clear();service.view.openSell(7,[{...sword,makeIndex:404}]);service.view.offerInventoryItem({...sword,makeIndex:404});success(icon(service.panel));const beforeService=state(service.view);stale(oldService);assert.deepEqual(state(service.view),beforeService);assert.equal(icon(service.panel).dataset.iconState,'ready');assert.equal(state(service.view).pending.makeIndex,404);service.view.clear();
 pass('bag/equipment replacement, quickbar rebinding and service reopen reject old-render callbacks even with the same source URL');
}
{
 const env=environment(),h=bag(env);h.view.replace([sword]);await flush();h.panel.children[0].onclick(event());const preview=env.document.body.children.at(-1),old=preview.children[0];h.view.cancelSelection();h.panel.children[0].onclick(event());const before=state(h.view);old.naturalWidth=national.items.frames[30].width;old.naturalHeight=national.items.frames[30].height;old._alpha=false;old.onerror();old.onload();assert.deepEqual(state(h.view),before);assert.equal(h.view.heldItem().makeIndex,101);assert.equal(preview.children[0].dataset.iconState,'ready');
 pass('deselecting and picking up the same instance invalidates the previous held-preview image callbacks');
}

assert.equal(groups,29);
console.log(`item icon consumers production regression: ${groups} groups PASS`);
for(const file of ['apps/web/src/item-icons.ts','apps/web/src/icon-frames.ts','content/classic-176/active-asset-sources.json','content/classic-176/item-assets.json','tests/item_icon_test_source.mjs',...production,'tests/item_icon_consumers_regression.mjs'])console.log(`SHA256 ${crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')} ${file}`);
console.log('Scope: actual production item consumers, source resolver and asset state under fake DOM/Pixi/network/timers; no browser, original executable or server economic completion claim.');
