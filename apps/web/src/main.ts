import {createMapView} from './map-view';
import './style.css';
const status=document.querySelector<HTMLOutputElement>('#status')!;
const xInput=document.querySelector<HTMLInputElement>('#x')!,yInput=document.querySelector<HTMLInputElement>('#y')!;
const collision=document.querySelector<HTMLInputElement>('#collision')!;
const view=await createMapView(document.querySelector<HTMLElement>('#viewport')!,status);
async function move(x:number,y:number){try{await view.setCenter(x,y);xInput.value=String(view.center.x);yInput.value=String(view.center.y);}catch(error){status.textContent=String(error);}}
document.querySelector('#jump')!.addEventListener('submit',e=>{e.preventDefault();void move(Number(xInput.value),Number(yInput.value));});
collision.addEventListener('change',()=>{void view.setCollision(collision.checked);});
let drag:{x:number;y:number;cx:number;cy:number}|undefined;
view.app.canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,cx:view.center.x,cy:view.center.y};view.app.canvas.setPointerCapture(e.pointerId);});
view.app.canvas.addEventListener('pointerup',e=>{if(!drag)return;const scale=800/view.app.canvas.getBoundingClientRect().width;void move(drag.cx-(e.clientX-drag.x)*scale/48,drag.cy-(e.clientY-drag.y)*scale/32);drag=undefined;});
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;const d:Record<string,number[]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(d[e.key]){e.preventDefault();void move(view.center.x+d[e.key][0],view.center.y+d[e.key][1]);}});
