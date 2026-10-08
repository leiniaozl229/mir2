import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=file=>fs.readFileSync(file,'utf8');
const nativePaletteResource=JSON.parse(read('content/classic-176/actor-status-palette.json'));
const source=read('apps/web/src/chat-colors.ts').replace(/^import .*;\r?\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{},nativePaletteResource};vm.createContext(context);vm.runInContext(compiled,context);
const {classicPaletteColor,applyClassicChatColors}=context.exports;

assert.equal(classicPaletteColor(0),'rgb(0, 0, 0)');
assert.equal(classicPaletteColor(7),'rgb(192, 192, 192)');
assert.equal(classicPaletteColor(8),'rgb(85, 128, 151)');
for(const invalid of [-1,256,1.5,NaN,'8',null,undefined])assert.equal(classicPaletteColor(invalid),undefined);
const element={style:{}};applyClassicChatColors(element,4,5);
assert.equal(element.style.color,'rgb(0, 0, 128)');
assert.equal(element.style.backgroundColor,'rgb(128, 0, 128)');
const fallback={style:{}};applyClassicChatColors(fallback,undefined,undefined);
assert.deepEqual(fallback.style,{});
console.log('PASS 256-entry Prguse palette RGB conversion, invalid-index fallback and separate native chat foreground/background');
