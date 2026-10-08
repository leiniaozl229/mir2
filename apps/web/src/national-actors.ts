import profile from '../../../content/classic-176/national-gameplay.json';

export type ActorAction={start:number;count:number;skip:number;interval:number};
export type PlayerLayers={bodyName:string;offset:number;hairName?:string;hairOffset:number;weaponName?:string;weaponOffset:number;sex:number};

export function playerLayers(feature:number):PlayerLayers|undefined{
 if((feature&255)!==0)return;
 const weapon=(feature>>>8)&255,dress=feature>>>24,hair=(feature>>>16)&255,sex=dress&1;
 const stride=profile.player.framesPerGender;
 return {bodyName:'NHum',offset:dress*stride,sex,
  hairName:hair>0?'NHair':undefined,
  hairOffset:(Math.min(hair,profile.player.hairShapes-1)*2+sex)*stride,
  weaponName:weapon>=2?'NWeapon':undefined,weaponOffset:weapon*stride};
}

export function monsterLayers(feature:number){
 const appearance=feature>>>16,group=Math.floor(appearance/10);
 if(group>=profile.monster.libraryCount)return;
 const overrides=profile.monster.offsetOverrides as Record<string,number>;
 return {bodyName:`Mon${group+1}`,offset:overrides[String(appearance)]??(appearance%10)*profile.monster.strides[group]};
}

export function nationalAction(action:string,race=0):ActorAction|undefined{
 const players=profile.player.actions as Record<string,ActorAction>;
 if(race===0)return players[action==='backstep'?'walking':action==='rushBlocked'?'rushKung':action];
 const name=(profile.monster.raceActions as Record<string,string>)[race]??profile.monster.defaultAction;
 const actions=profile.monster.actions as Record<string,Record<string,ActorAction>>;
 return actions[name]?.[['running','backstep'].includes(action)?'walking':action];
}

export function actionFrame(action:ActorAction,direction:number,frame:number,offset=0){
 return offset+action.start+(direction&7)*(action.count+action.skip)+frame;
}

export function weaponZIndex(sex:number,index:number){return profile.player.weaponOrder[sex&1]?.[index]===1?2:-1;}
export function singleAction(action:string){return ['walking','running','rush','backstep','rushBlocked','attack','heavyAttack','wideAttack','spell','harvest','struck','dying'].includes(action);}
