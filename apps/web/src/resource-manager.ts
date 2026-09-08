import catalogUrl from '../../../content/classic-176/resource-catalog.json?url';
import './resource-manager.css';

type RecordValue=Record<string,any>;
type Section='overview'|'items'|'skills'|'monsters'|'maps'|'spawns'|'assets';
type Catalog={summary:Record<string,number>;diagnostics:Record<string,any>;mechanics:Record<string,any>;source:Record<string,string>;items:RecordValue[];skills:RecordValue[];monsters:RecordValue[];maps:RecordValue[];spawns:RecordValue[];assets:RecordValue[];templates:Record<string,RecordValue>};
const catalog=await fetch(catalogUrl).then(async response=>{if(!response.ok)throw new Error(`资源目录载入失败：${response.status}`);return response.json() as Promise<Catalog>;});
const tabs:{id:Section;label:string;count?:number}[]=[
 {id:'overview',label:'总览与机制'},
 {id:'items',label:'物品与装备',count:catalog.items.length},
 {id:'skills',label:'技能',count:catalog.skills.length},
 {id:'monsters',label:'怪物与掉落',count:catalog.monsters.length},
 {id:'maps',label:'地图分布',count:catalog.maps.length},
 {id:'spawns',label:'刷新点',count:catalog.spawns.length},
 {id:'assets',label:'素材库',count:catalog.assets.length},
];
const summaryLabels:Record<string,string>={items:'物品',skills:'技能',monsters:'怪物',maps:'地图',spawns:'刷新点',dropTables:'掉落表',dropRows:'掉落规则',assetLibraries:'素材库'};
const fieldLabels:Record<string,string>={id:'数据库 ID',idx:'记录 ID',name:'名称',category:'分类',stdMode:'StdMode',shape:'Shape',weight:'重量',imgIndex:'素材索引',iconIndex:'图标索引',iconSource:'图标来源',duraMax:'最大持久',ac:'防御',acMax:'防御上限',mac:'魔御',macMax:'魔御上限',dc:'攻击',dcMax:'攻击上限',mc:'魔法',mcMax:'魔法上限',sc:'道术',scMax:'道术上限',need:'佩戴条件',needLevel:'条件值',price:'价格',stock:'库存',attackSpeed:'攻击速度/间隔',agility:'敏捷',accuracy:'准确',magicAvoid:'魔法躲避',hpAdd:'生命加成',mpAdd:'魔法加成',effectType:'效果类型',effect:'效果编号',spell:'耗蓝参数',power:'威力',maxPower:'最大威力',defSpell:'附加耗蓝',defPower:'附加威力',defMaxPower:'附加最大威力',jobName:'职业',needLevels:'学习等级',trainLevels:'熟练阈值',aliases:'共用机制 ID',delay:'延迟',useName:'使用方式',reagent:'消耗材料',status:'状态',statusBit:'状态位',summon:'召唤',race:'Race',raceImg:'RaceImg',appr:'Appr',level:'等级',experience:'经验',hp:'HP',mp:'MP',hit:'命中',walkSpeed:'移动间隔',viewRange:'索敌范围',dropMode:'掉落模式',uncuttable:'禁止挖肉',width:'宽',height:'高',chunks:'地图块',minimapFrame:'小地图帧',mapId:'地图编号',x:'X',y:'Y',monster:'怪物',area:'刷新半径',count:'数量',respawnMinutes:'刷新分钟',frames:'有效帧',sourceFrames:'源帧数',missing:'缺失帧',empty:'空帧',format:'格式',source:'来源'};
const search=document.querySelector<HTMLInputElement>('#resource-search')!,filter=document.querySelector<HTMLSelectElement>('#resource-filter')!,baseline=document.querySelector<HTMLInputElement>('#baseline-only')!,missing=document.querySelector<HTMLInputElement>('#missing-only')!;
const list=document.querySelector<HTMLElement>('#resource-list')!,meta=document.querySelector<HTMLElement>('#resource-list-meta')!,pages=document.querySelector<HTMLElement>('#resource-pages')!,detail=document.querySelector<HTMLElement>('#resource-detail')!;
let section:Section='overview',page=0,selectedKey:string|undefined;
const pageSize=75;
const searchable=new Map<RecordValue,string>();
for(const group of [catalog.items,catalog.skills,catalog.monsters,catalog.maps,catalog.spawns,catalog.assets])for(const value of group)searchable.set(value,JSON.stringify(value).toLocaleLowerCase('zh-CN'));

function escape(value:unknown){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]!));}
function data():RecordValue[]{return section==='overview'?[]:catalog[section] as RecordValue[];}
function keyOf(value:RecordValue){return section==='items'?`item-${value.id}`:section==='skills'?`skill-${value.idx}`:section==='monsters'?`monster-${value.idx}`:section==='maps'?`map-${value.id}`:section==='spawns'?`spawn-${value.id}`:`asset-${value.id}`;}
function categoryOf(value:RecordValue){if(section==='items')return value.category;if(section==='skills')return value.jobName;if(section==='monsters')return value.dropSource?'有掉落表':'无掉落表';if(section==='maps')return value.minimapUrl?'有小地图':'无小地图';if(section==='spawns')return value.mapId;if(section==='assets')return value.id.split('/')[0];return '';}
function lacks(value:RecordValue){if(section==='items')return !value.iconUrl;if(section==='skills')return !value.iconUrl||!value.rulePinned;if(section==='monsters')return !value.visual||!value.dropSource;if(section==='maps')return !value.minimapUrl||!value.width;if(section==='spawns')return !catalog.maps.some(map=>map.id===value.mapId);if(section==='assets')return value.missing>0;return false;}
function filtered(){const query=search.value.trim().toLocaleLowerCase('zh-CN'),category=filter.value;return data().filter(value=>(!query||searchable.get(value)?.includes(query))&&(!category||categoryOf(value)===category)&&(!baseline.checked||value.baseline===true)&&(!missing.checked||lacks(value)));}
function visual(value:RecordValue){
 const src=section==='items'||section==='skills'?value.iconUrl:section==='maps'?value.minimapUrl:undefined;
 if(src)return `<span class="resource-thumb"><img src="${escape(src)}" alt=""></span>`;
 return `<span class="resource-thumb missing">${section==='spawns'?'点':'—'}</span>`;
}
function row(value:RecordValue){
 let title='',subtitle='',middle='',status='';
 if(section==='items'){title=value.name;subtitle=`#${value.id} · ${value.category}`;middle=`StdMode ${value.stdMode} · 图 ${value.imgIndex}`;status=value.baseline?'1.76':'';}
 if(section==='skills'){title=value.name;subtitle=`MagicId ${value.magicId} · ${value.jobName}`;middle=`${value.useName} · Lv ${value.needLevels.join('/')}`;status=value.rulePinned?'规则已接入':'待接入';}
 if(section==='monsters'){title=value.name;subtitle=`#${value.idx} · Lv ${value.level}`;middle=`${value.spawnIds.length} 刷新点 · ${value.drops.length} 条掉落`;status=value.visual?.quality??'缺图';}
 if(section==='maps'){title=value.name;subtitle=value.id;middle=`${value.width??'?'}×${value.height??'?'} · ${value.spawnIds.length} 刷新点`;status=value.minimapUrl?'有小地图':'缺小地图';}
 if(section==='spawns'){title=value.monster;subtitle=`${value.mapId} · ${value.x},${value.y}`;middle=`${value.count} 只 / ${value.area} 格 / ${value.respawnMinutes} 分钟`;status=`行 ${value.sourceLine}`;}
 if(section==='assets'){title=value.id;subtitle=value.source??value.format??'';middle=`${value.frames} 帧 · ${value.empty} 空帧`;status=value.missing?`缺 ${value.missing}`:'完整';}
 const warning=lacks(value)?'<span class="tag red">需处理</span>':'',base=value.baseline?'<span class="tag gold">1.76</span>':'';
 return `<button class="resource-row ${keyOf(value)===selectedKey?'selected':''}" data-key="${escape(keyOf(value))}">${visual(value)}<span class="row-title"><strong>${escape(title)}</strong><small>${escape(subtitle)}</small></span><span class="row-meta">${escape(middle)}<br>${base}${warning}</span><span class="row-status">${escape(status)}</span></button>`;
}
function renderList(){
 if(section==='overview'){renderOverview();return;}
 const values=filtered(),totalPages=Math.max(1,Math.ceil(values.length/pageSize));page=Math.min(page,totalPages-1);const slice=values.slice(page*pageSize,(page+1)*pageSize);
 meta.textContent=`${values.length.toLocaleString()} 条 · 第 ${page+1}/${totalPages} 页`;list.innerHTML=slice.map(row).join('')||'<div class="empty-detail"><p>没有符合条件的资源</p></div>';
 pages.innerHTML=`<button data-page="prev" ${page===0?'disabled':''}>上一页</button><span>${page+1} / ${totalPages}</span><button data-page="next" ${page>=totalPages-1?'disabled':''}>下一页</button>`;
 for(const button of Array.from(list.querySelectorAll<HTMLButtonElement>('[data-key]')))button.onclick=()=>{selectedKey=button.dataset.key;renderList();const value=slice.find(item=>keyOf(item)===selectedKey);if(value)renderDetail(value);};
 pages.querySelector<HTMLButtonElement>('[data-page=prev]')!.onclick=()=>{page--;renderList();};pages.querySelector<HTMLButtonElement>('[data-page=next]')!.onclick=()=>{page++;renderList();};
}
function tags(value:RecordValue){return `${value.baseline?'<span class="tag gold">国服 1.76 基线</span>':''}${lacks(value)?'<span class="tag red">存在缺失项</span>':'<span class="tag green">关联完整</span>'}`;}
function properties(value:RecordValue,fields:string[]){return `<div class="property-grid">${fields.filter(field=>value[field]!==undefined&&value[field]!==null&&value[field]!==''&&!(Array.isArray(value[field])&&!value[field].length)).map(field=>`<div class="property"><span>${escape(fieldLabels[field]??field)}</span><strong>${escape(Array.isArray(value[field])?value[field].join(' / '):typeof value[field]==='boolean'?(value[field]?'是':'否'):value[field])}</strong></div>`).join('')}</div>`;}
function relation(title:string,rows:string){return `<section class="detail-section"><h3>${escape(title)}</h3><div class="relation-list">${rows||'<div class="relation-item"><span>暂无记录</span><span>—</span></div>'}</div></section>`;}
function heading(value:RecordValue,subtitle:string,image?:string){return `<header class="detail-heading"><div class="detail-visual">${image?`<img src="${escape(image)}" alt="">`:'—'}</div><div><span class="eyebrow">${escape(section.toUpperCase())}</span><h2>${escape(value.name??value.id)}</h2><p>${escape(subtitle)}</p>${tags(value)}</div></header>`;}
function renderDetail(value:RecordValue){
 if(section==='items'){
  const drops=value.droppedBy.map((name:string)=>`<div class="relation-item"><span>${escape(name)}</span><span>怪物掉落</span></div>`).join('');
  detail.innerHTML=heading(value,`数据库 #${value.id} · ${value.category}`,value.iconUrl)+`<section class="detail-section"><h3>机制属性</h3>${properties(value,['stdMode','shape','imgIndex','iconSource','weight','duraMax','need','needLevel','price','stock','ac','acMax','mac','macMax','dc','dcMax','mc','mcMax','sc','scMax','attackSpeed','agility','accuracy','magicAvoid','hpAdd','mpAdd','overlapItem','reference'])}</section>${relation('掉落来源',drops)}`;
 }
 if(section==='skills')detail.innerHTML=heading(value,`MagicId ${value.magicId} · ${value.jobName}`,value.iconUrl)+`<section class="detail-section"><h3>执行与成长</h3>${properties(value,['useName','iconIndex','iconSource','aliases','effectType','effect','spell','defSpell','power','maxPower','defPower','defMaxPower','delay','needLevels','trainLevels','reagent','status','statusBit','summon','description'])}</section>${relation('耗蓝公式',`<div class="relation-item"><span>round(spell / 4 × (技能等级 + 1)) + defSpell</span><span>运行规则</span></div>`)}`;
 if(section==='monsters'){
  const spawns=value.spawnIds.map((id:number)=>catalog.spawns.find(spawn=>spawn.id===id)).filter(Boolean).map((spawn:RecordValue)=>`<div class="relation-item"><span>${escape(catalog.maps.find(map=>map.id===spawn.mapId)?.name??spawn.mapId)} · ${spawn.x},${spawn.y}</span><span>${spawn.count}只 / ${spawn.respawnMinutes}分</span></div>`).join('');
  const drops=value.drops.map((drop:RecordValue)=>`<div class="relation-item"><span>${escape(drop.item)}${drop.amount?` × ${drop.amount}`:''}</span><span>${drop.numerator}/${drop.denominator} · ${drop.chancePercent}%</span></div>`).join('');
  detail.innerHTML=heading(value,`#${value.idx} · Lv ${value.level}`)+`<div id="monster-preview" class="detail-visual" style="width:100%;height:130px">${value.visual?'正在读取动画素材…':'缺少已校准怪物素材'}</div><section class="detail-section"><h3>战斗属性</h3>${properties(value,['race','raceImg','appr','level','experience','hp','mp','ac','mac','dc','dcMax','mc','sc','hit','speed','walkSpeed','attackSpeed','viewRange','dropMode','uncuttable'])}</section>${relation(`刷新分布 · ${value.spawnIds.length}`,spawns)}${relation(`掉落规则 · ${value.drops.length}`,drops)}<p class="template-note">来源：${escape(value.dropSource??'没有掉落表')}</p>`;
  if(value.visual)void loadMonsterPreview(value.visual.library);
 }
 if(section==='maps'){
  const spawns=value.spawnIds.map((number:number)=>catalog.spawns.find(spawn=>spawn.id===number)).filter(Boolean).map((spawn:RecordValue)=>`<div class="relation-item"><span>${escape(spawn.monster)} · ${spawn.x},${spawn.y}</span><span>${spawn.count}只 / ${spawn.respawnMinutes}分</span></div>`).join('');
  detail.innerHTML=heading(value,value.id,value.minimapUrl)+`${value.minimapUrl?`<img class="map-preview" src="${escape(value.minimapUrl)}" alt="${escape(value.name)}地图">`:''}<section class="detail-section"><h3>地图属性</h3>${properties(value,['id','width','height','chunks','minimapFrame'])}</section>${relation(`怪物刷新分布 · ${value.spawnIds.length}`,spawns)}`;
 }
 if(section==='spawns'){const map=catalog.maps.find(item=>item.id===value.mapId);detail.innerHTML=heading({...value,name:value.monster},`${map?.name??value.mapId} · 配置行 ${value.sourceLine}`,map?.minimapUrl)+`<section class="detail-section"><h3>刷新规则</h3>${properties(value,['mapId','x','y','monster','area','count','respawnMinutes','sourceLine'])}</section>`;}
 if(section==='assets')detail.innerHTML=heading(value,`${value.frames} 个有效帧`)+`<section class="detail-section"><h3>素材库状态</h3>${properties(value,['id','source','format','frames','sourceFrames','missing','empty','sourceSha256'])}</section>`;
}
async function loadMonsterPreview(libraryName:string){
 const target=document.querySelector<HTMLElement>('#monster-preview');if(!target)return;
 try{const response=await fetch(`/actors/${libraryName}/library.json`),library=await response.json(),frame=library.frames[Object.keys(library.frames).sort((a,b)=>Number(a)-Number(b))[0]];if(!frame)throw new Error('没有有效帧');target.innerHTML=`<img src="/actors/${escape(libraryName)}/${escape(frame.file)}" alt="怪物素材预览">`;}
 catch(error){target.textContent=error instanceof Error?error.message:'素材载入失败';}
}
function renderOverview(){
 meta.textContent='字段含义、数据来源与目录诊断';pages.replaceChildren();
 const diag=catalog.diagnostics;
 list.innerHTML=`<div class="mechanic-card"><h3>数据来源</h3><dl>${Object.entries(catalog.source).map(([key,value])=>`<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join('')}</dl></div>${Object.entries(catalog.mechanics).map(([title,value])=>`<div class="mechanic-card"><h3>${escape(title)}</h3>${typeof value==='string'?`<p>${escape(value)}</p>`:`<dl>${Object.entries(value).map(([key,text])=>`<dt>${escape(key)}</dt><dd>${escape(text)}</dd>`).join('')}</dl>`}</div>`).join('')}`;
 detail.innerHTML=`<span class="eyebrow">CATALOG HEALTH</span><h2>目录诊断</h2><div class="diagnostic">${diag.itemsMissingIcons} 个物品仍缺背包图标；经典与扩展素材合计覆盖 ${catalog.summary.itemIcons}/${catalog.summary.items}。</div><div class="diagnostic">${diag.skillsMissingIcons} 个技能仍缺图标；${catalog.summary.skills-catalog.skills.filter(value=>value.rulePinned).length} 个技能仍未接入锁定规则。</div><div class="diagnostic">${diag.monstersMissingVisuals} 个怪物缺少已校准动画映射；当前覆盖 ${catalog.summary.monsterVisuals}/${catalog.summary.monsters}。</div><div class="diagnostic">${diag.orphanSpawnMaps.length} 个刷新地图未进入 570 张基线目录：${escape(diag.orphanSpawnMaps.join('、')||'无')}。</div><div class="diagnostic">${diag.unknownSpawnMonsters.length} 个刷新名称未在怪物表定义；掉落表引用 ${diag.unknownDropItems.length} 个未定义物品。</div><div class="diagnostic">MagicId 机制冲突：${escape(diag.duplicateMagicIds.join('、')||'无')}；${diag.magicIdAliases.length} 组角色/英雄技能共用同一机制 ID。</div>`;
}
function populateFilter(){const values=[...new Set(data().map(categoryOf).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));filter.innerHTML='<option value="">全部</option>'+values.map(value=>`<option>${escape(value)}</option>`).join('');}
function selectSection(next:Section){section=next;page=0;selectedKey=undefined;search.value='';baseline.checked=false;missing.checked=false;document.querySelectorAll<HTMLButtonElement>('#resource-tabs button').forEach(button=>button.classList.toggle('active',button.dataset.section===section));populateFilter();renderList();if(section!=='overview')detail.innerHTML='<div class="empty-detail"><strong>选择一项资源</strong><p>右侧会显示机制属性、素材和关联分布。</p></div>';}
function renderShell(){
 document.querySelector('#resource-summary')!.innerHTML=Object.entries(summaryLabels).map(([key,label])=>`<article class="summary-card"><strong>${catalog.summary[key].toLocaleString()}</strong><span>${label}</span></article>`).join('');
 document.querySelector('#resource-tabs')!.innerHTML=tabs.map(tab=>`<button data-section="${tab.id}" class="${tab.id===section?'active':''}">${tab.label}${tab.count!==undefined?`<span>${tab.count.toLocaleString()}</span>`:''}</button>`).join('');
 document.querySelectorAll<HTMLButtonElement>('#resource-tabs button').forEach(button=>button.onclick=()=>selectSection(button.dataset.section as Section));
 selectSection('overview');
}
for(const control of [search,filter,baseline,missing])control.addEventListener(control===search?'input':'change',()=>{page=0;renderList();});

const dialog=document.querySelector<HTMLDialogElement>('#resource-template')!,templateKind=document.querySelector<HTMLSelectElement>('#template-kind')!,templateName=document.querySelector<HTMLInputElement>('#template-name')!,templateJob=document.querySelector<HTMLSelectElement>('#template-job')!,templateIndex=document.querySelector<HTMLInputElement>('#template-index')!,templateOutput=document.querySelector<HTMLTextAreaElement>('#template-output')!;
function sqlValue(value:unknown){return value===null?'NULL':typeof value==='string'?`'${value.replaceAll("'","''")}'`:String(value);}
function renderTemplate(){
 const kind=templateKind.value,name=templateName.value.trim()||(kind==='item'?'新装备':'新技能'),template=structuredClone(catalog.templates[kind]);template.name=name;
 if(kind==='item'){template.imgIndex=Number(templateIndex.value);template.stdMode=5;templateOutput.value=`-- 1. 在 .runtime/sql/02-mir2_data.sql 的 stditems 中分配唯一 ID\nINSERT INTO \`stditems\` VALUES (${Object.values(template).map(sqlValue).join(', ')});\n\n-- 2. 把 Items.wil 图标帧 ${template.imgIndex} 与 StateItem.wil 装备帧核对\n-- 3. 如属于 1.76 基线，将 ${name} 加入 version-profile.json / p0Baseline.items\n-- 4. 重建并校验\npython3 tools/resource_catalog.py build\npython3 tools/resource_catalog.py validate`;}
 else{template.magicId=Number(templateIndex.value);template.job=Number(templateJob.value);templateOutput.value=`-- 1. 在 magics 中分配唯一 Idx 和 MagicId\nINSERT INTO \`magics\` VALUES (${Object.values(template).map(sqlValue).join(', ')});\n\n-- 2. 在 skill-rules.json 增加完整数值锁定\n"${name}": {"magicId": ${template.magicId}, "effectType": 0, "effect": 0, "spell": 0, "power": 0, "maxPower": 0, "defSpell": 0, "defPower": 0, "defMaxPower": 0, "job": ${template.job}, "needLevels": [1,3,5], "trainLevels": [200,300,500], "delay": 0, "description": ""}\n\n-- 3. 在 skill-combat.json 声明 use/job，并校准 magic-icons 与 magic-effects.ts\n-- 4. 重建并校验\npython3 tools/resource_catalog.py build\npython3 tools/skill_catalog_audit.py`;}
}
document.querySelector<HTMLButtonElement>('#open-template')!.onclick=()=>{templateIndex.value=String(catalog.templates[templateKind.value][templateKind.value==='item'?'imgIndex':'magicId']);renderTemplate();dialog.showModal();};templateKind.addEventListener('input',()=>{templateIndex.value=String(catalog.templates[templateKind.value][templateKind.value==='item'?'imgIndex':'magicId']);renderTemplate();});for(const control of [templateName,templateJob,templateIndex])control.addEventListener('input',renderTemplate);
document.querySelector<HTMLButtonElement>('#copy-template')!.onclick=async event=>{await navigator.clipboard.writeText(templateOutput.value);const button=event.currentTarget as HTMLButtonElement;button.textContent='已复制';button.classList.add('copy-done');setTimeout(()=>{button.textContent='复制模板';button.classList.remove('copy-done');},1200);};
renderShell();
