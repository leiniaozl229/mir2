import nativePaletteResource from '../../../content/classic-176/actor-status-palette.json';

type RGB = readonly number[];
const nativePalette:readonly RGB[]=nativePaletteResource.palette;

export function classicPaletteColor(index:unknown):string|undefined{
 if(typeof index!=='number'||!Number.isInteger(index)||index<0||index>=nativePalette.length)return undefined;
 const rgb=nativePalette[index];
 if(!rgb||rgb.length!==3||rgb.some(value=>!Number.isInteger(value)||value<0||value>255))return undefined;
 return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

export function applyClassicChatColors(element:HTMLElement,foreground:unknown,background:unknown){
 const foregroundColor=classicPaletteColor(foreground),backgroundColor=classicPaletteColor(background);
 if(foregroundColor!==undefined)element.style.color=foregroundColor;
 if(backgroundColor!==undefined)element.style.backgroundColor=backgroundColor;
}
