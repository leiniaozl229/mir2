import fs from 'node:fs';
import path from 'node:path';

// VM fixtures execute the same source selection and asset-state code as production.
const read=(root,file)=>fs.readFileSync(path.join(root,file),'utf8');
const source=(root,file)=>read(root,file).replace(/^import .*;\r?\n/gm,'');
export function iconFrameProductionSource(root){
 return `const activeSources=${read(root,'content/classic-176/active-asset-sources.json')};\n${source(root,'apps/web/src/icon-frames.ts')}\n`;
}
export function itemIconProductionSource(root){
 return `${iconFrameProductionSource(root)}const itemAssets=${read(root,'content/classic-176/item-assets.json')};\n${source(root,'apps/web/src/item-icons.ts')}\n`;
}
