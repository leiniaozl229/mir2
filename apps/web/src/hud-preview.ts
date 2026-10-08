import type {ClassicHud} from './classic-hud';
import type {CharacterAttributes} from './character-panel';

/** Calibration fixtures only. Every view is rendered by the production HUD. */
export function bindHudPreviewControls(root:HTMLElement,base:CharacterAttributes,hud:Pick<ClassicHud,'replaceAttributes'|'hungerStatus'|'daylight'>,onChanged:(attributes:CharacterAttributes,interactive:boolean)=>void){
 const roles:Record<string,{job:number;level:number}>={low:{job:0,level:27},high:{job:0,level:28},mage:{job:1,level:27},taoist:{job:2,level:27}};
 const value=(name:string)=>root.querySelector<HTMLInputElement|HTMLSelectElement>(`[data-hud-preview-${name}]`)?.value??'';
 const percent=(name:string)=>{const number=Number(value(name));return Number.isFinite(number)?Math.max(0,Math.min(100,number))/100:0;};
 const render=(interactive:boolean)=>{
  const role=roles[value('role')]??roles.low;
  const attributes={...base,...role,hp:Math.round(base.maxHp*percent('hp')),mp:Math.round(base.maxMp*percent('mp')),experience:Math.round(base.maxExperience*percent('xp')),weight:Math.round(base.maxWeight*percent('weight'))};
  hud.replaceAttributes(attributes);hud.hungerStatus(Number(value('hunger')));hud.daylight(Number(value('daylight')),0);
  onChanged(attributes,interactive);
 };
 const update=()=>render(true);
 root.addEventListener('input',update);root.addEventListener('change',update);render(false);
 return ()=>{root.removeEventListener('input',update);root.removeEventListener('change',update);};
}
