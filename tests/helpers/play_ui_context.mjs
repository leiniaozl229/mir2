import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/** Compatibility fixtures exercise their existing gameplay without an exit/settings intent.
 * The new exit lifecycle has separate real-controller tests. Shared send/selection helpers
 * below are extracted from production, rather than mirroring their implementation. */
export function installPlayUiContext(context){
 context.selectedServer??=undefined;
 context.classicAuth??={};context.classicAuth.isEntrySceneOpen??=()=>false;
 context.clearAuthenticationWait??=()=>{};
 context.setWorldConnectionState??=()=>{};
 context.gatewayFeatures??={characterDeletion:false};context.selectionRevision??=0;context.characterDelete??={isBusy:()=>false,interrupt(){},destroy(){},disconnected:()=>false,handle:()=>false,reject:()=>false};
 if(context.classicAuth)context.classicAuth.setDeleteEnabled??=()=>{};
 context.logout??={isWaiting:()=>false,isAccepted:()=>false,isBusy:()=>false,disconnected:()=>false,interrupt(){},handleState:()=>false,reject:()=>false};
 context.settings??={isOpen:()=>false,hide(){},destroy(){},interceptKey:()=>false};
 context.skillKeyDialog??={isOpen:()=>false,interrupt(){},destroy(){},interceptKey:()=>false};
 context.guildEditor??={isOpen:()=>false,cancel(){},interceptKey:()=>false};
 context.cancelGuildActionPrompt??=()=>{};
 context.recordGuildChat??=()=>{};
 context.renderGuild??=()=>{};
 context.renderAttackMode??=()=>{};
 context.logoutWait??={hidden:true};context.logoutWaitingView??={interceptKey:()=>false,destroy(){}};context.sessionGeneration??=0;
 context.systemDialog??={};context.systemDialog.isOpen??=()=>false;
 context.audio??={};context.audio.dispose??=()=>{};
 context.displaySettings??={set(){}};
 context.worldTone??={clear(){},destroy(){},setDead(){},setDarkLevel(){}};
 if(context.minimap)context.minimap.debugState??=()=>({mode:'compact'});
 if(context.document)context.document.body??={classList:{contains:()=>context.worldInputAvailable?.()??false}};
 if(!vm.isContext(context))vm.createContext(context);
 const source=fs.readFileSync(new URL('../../apps/web/src/play.ts',import.meta.url),'utf8'),file=ts.createSourceFile('play.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const names=['worldCommandsAvailable','showCharacterSelection','cycleMinimap','deferWorldCommand'];
 const code=file.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>node.getText(file)).join('\n');
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return context;
}
