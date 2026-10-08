import {classicUiLayout} from './classic-layout';

export const CHARACTER_PAGES=['paperdoll','status','state','skills'] as const;
export type CharacterPage=typeof CHARACTER_PAGES[number];

/** One page lifecycle shared by the production window and its calibration view. */
export function showCharacterPage(element:HTMLElement,page:CharacterPage){
 element.dataset.characterPage=page;
 element.querySelectorAll<HTMLElement>('[data-character-page]').forEach(node=>node.hidden=node.dataset.characterPage!==page);
 for(const selector of ['#equipment-items','#paperdoll-actor']){
  const node=element.querySelector<HTMLElement>(selector);if(node)node.hidden=page!=='paperdoll';
 }
 // Retained candidate controls stay out of the original client's painted window.
 element.querySelectorAll<HTMLButtonElement>('[data-character-tab]').forEach(button=>{button.hidden=true;});
}

export function wireCharacterPageButtons(element:HTMLElement,select:(page:CharacterPage)=>void){
 element.querySelectorAll<HTMLButtonElement>('[data-character-cycle]').forEach(button=>{
  button.addEventListener('click',()=>{
   const current=CHARACTER_PAGES.indexOf(element.dataset.characterPage as CharacterPage);
   const delta=button.dataset.characterCycle==='previous'?-1:1;
   select(CHARACTER_PAGES[((current<0?0:current)+delta+CHARACTER_PAGES.length)%CHARACTER_PAGES.length]);
  });
 });
}

export function nativeWindowPositionVersion(id:string){
 const layout=classicUiLayout();
 return id==='character-window'?layout.nationalCharacterWindow.positionVersion:id==='inventory-window'?layout.nationalInventoryWindow.positionVersion:'';
}
