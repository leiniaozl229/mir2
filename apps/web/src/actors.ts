import './style.css';
type Frame={file:string;offsetX:number;offsetY:number;width:number;height:number};
type Action={start:number;count:number;skip:number;interval:number;reverse:number};
type Library={frames:Record<string,Frame>;empty:number[];actions:Record<string,Action>};
const paths=['CArmour00','CHair00','Monster000','Monster003','Monster004','Monster020','Monster022','Monster024','Monster025','Monster026','Monster030','Monster032','Monster045','Monster046','Monster070','Monster072','Monster047','Monster061','Monster062','Monster006','Monster019','Monster103','Monster112'];
const libraries=await Promise.all(paths.map(async name=>{const response=await fetch(`/actors/${name}/library.json`);if(!response.ok)throw new Error(name);return response.json() as Promise<Library>;}));
const actor=document.querySelector<HTMLSelectElement>('#actor')!,action=document.querySelector<HTMLSelectElement>('#action')!;
const status=document.querySelector<HTMLOutputElement>('#status')!;
const cells=['北','东北','东','东南','南','西南','西','西北'].map(direction=>{
 const cell=document.createElement('section');cell.className='direction';
 const name=document.createElement('span');name.textContent=direction;cell.append(name);
 const body=document.createElement('img'),hair=document.createElement('img');body.alt='';hair.alt='';cell.append(body,hair);
 document.querySelector('#directions')!.append(cell);return {body,hair};
});
const playerActions:Record<string,Action>={standing:{start:0,count:4,skip:0,interval:500,reverse:0},walking:{start:32,count:6,skip:0,interval:100,reverse:0},attack:{start:136,count:6,skip:0,interval:100,reverse:0}};
let generation=0,start=performance.now(),currentAction=playerActions.standing;
let chosen=0,genderOffset=0,ready=false;
async function load(){
 const mine=++generation;ready=false;
 chosen=({monster:2,chicken:3,deer:4,'cave-maggot':5,skeleton:6,'axe-skeleton':7,'bone-warrior':8,'bone-elite':9,'wooma-soldier':10,'wooma-hero':11,'red-boar':12,'black-boar':13,'zombie-1':14,'zombie-2':14,'zombie-3':15,'zuma-archer':16,'zuma-statue':17,'zuma-guard':18,'hooking-cat':19,'cave-bat':20,sheep:21,'tiger-snake':22,'poison-spider':17,'armour-insect':5} as Record<string,number>)[actor.value]??0;genderOffset=actor.value==='female'?808:0;
 currentAction=chosen>=2?libraries[chosen].actions[{standing:'0',walking:'1',attack:'9'}[action.value]!]:playerActions[action.value];
 status.textContent='正在加载全部方向…';
 const loads:Promise<void>[]=[];
 for(let direction=0;direction<8;direction++)for(let frame=0;frame<currentAction.count;frame++)for(const lib of chosen>=2?[chosen]:[0,1]){
  const index=genderOffset+currentAction.start+direction*(currentAction.count+currentAction.skip)+frame;
  const image=libraries[lib].frames[index];
  if(!image){if(!libraries[lib].empty.includes(index))throw new Error(`缺少 ${paths[lib]}:${index}`);continue;}
  const preload=new Image();preload.src=`/actors/${paths[lib]}/${image.file}`;loads.push(preload.decode());
 }
 await Promise.all(loads);if(mine!==generation)return;
 start=performance.now();ready=true;status.textContent=`8 个方向 · 每方向 ${currentAction.count} 帧 · 每帧 ${currentAction.interval} ms`;
}
function draw(time:number){
 if(ready){let frame=Math.floor((time-start)/currentAction.interval)%currentAction.count;if(currentAction.reverse)frame=currentAction.count-1-frame;
 cells.forEach((cell,direction)=>{
  const index=genderOffset+currentAction.start+direction*(currentAction.count+currentAction.skip)+frame;
  for(const [element,lib] of [[cell.body,chosen],[cell.hair,1]] as const){
   const image=libraries[lib].frames[index];const visible=!!image&&!(element===cell.hair&&chosen>=2);element.hidden=!visible;
   if(!visible)continue;const url=`/actors/${paths[lib]}/${image.file}`;if(element.getAttribute('src')!==url)element.src=url;
   element.style.left=`${75+image.offsetX}px`;element.style.top=`${125+image.offsetY}px`;
  }
 });}
 requestAnimationFrame(draw);
}
function reload(){void load().catch(error=>{status.textContent=`素材加载失败：${error.message}`;});}
actor.addEventListener('change',reload);action.addEventListener('change',reload);reload();requestAnimationFrame(draw);
