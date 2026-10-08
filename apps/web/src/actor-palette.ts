import {BufferImageSource,Filter,GlProgram,GpuProgram,Texture,UniformGroup} from 'pixi.js';
import profile from '../../../content/classic-176/actor-status.json';
import lookup from '../../../content/classic-176/actor-status-palette.json';

export type PaletteEffect='green'|'red'|'blue'|'yellow'|'fuchsia'|'gray';
if(lookup.schemaVersion!==1||lookup.source.sha256!==profile.drawEffect.palette.sourceSha256||lookup.source.paletteSha256!==profile.drawEffect.palette.paletteSha256||lookup.lookup.width!==256||lookup.lookup.height!==6||lookup.effects.length!==6)throw new Error('Actor palette resource differs from the locked national contract');

// One small native-palette LUT is shared by every actor and status filter.
// Actor textures remain immutable: clearing a poison only detaches its filter.
let sharedLookup:Texture|undefined;
export function actorPaletteBytes(){
 return new Uint8Array(lookup.effects.flatMap(effect=>(lookup.brightnessMaps[effect as PaletteEffect]).flatMap(index=>[...lookup.palette[index],255])));
}
function paletteTexture(){
 if(!sharedLookup)sharedLookup=new Texture({source:new BufferImageSource({resource:actorPaletteBytes(),width:256,height:6,format:'rgba8unorm',scaleMode:'nearest',addressMode:'clamp-to-edge',alphaMode:'no-premultiply-alpha',label:'national-actor-color-levels'})});
 return sharedLookup;
}

/** Diagnostic CPU lookup using exactly the bundled color-level resource.
 * Input/output are straight RGBA bytes; GPU samples are premultiplied.
 */
export function mapActorPalettePixel(effect:PaletteEffect,rgba:readonly number[]){
 if(rgba[3]===0)return [0,0,0,0];
 const brightness=Math.floor((rgba[0]+rgba[1]+rgba[2])/3);
 const index=lookup.brightnessMaps[effect][Math.max(0,Math.min(255,brightness))];
 return [...lookup.palette[index],rgba[3]];
}

const vertex=`
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(){
 vec2 position=aPosition*uOutputFrame.zw+uOutputFrame.xy;
 position.x=position.x*(2.0/uOutputTexture.x)-1.0;
 position.y=position.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
 gl_Position=vec4(position,0.0,1.0);
 vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);
}`;
export const ACTOR_PALETTE_FRAGMENT=`precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uPaletteTexture;
uniform float uEffectRow;
void main(){
 vec4 color=texture(uTexture,vTextureCoord);
 if(color.a<=0.0){finalColor=vec4(0.0);return;}
 // Recover source RGB bytes before integer division. Alpha is never used
 // as brightness, and the final LUT color is premultiplied exactly once.
 vec3 rgb=floor(clamp(color.rgb/color.a,0.0,1.0)*255.0+0.5);
 float brightness=floor((rgb.r+rgb.g+rgb.b)/3.0);
 vec2 uv=vec2((brightness+0.5)/256.0,(uEffectRow+0.5)/6.0);
 vec3 mapped=texture(uPaletteTexture,uv).rgb;
 finalColor=vec4(mapped*color.a,color.a);
}`;
export const ACTOR_PALETTE_WGSL=`
struct GlobalFilterUniforms {
 uInputSize:vec4<f32>, uInputPixel:vec4<f32>, uInputClamp:vec4<f32>,
 uOutputFrame:vec4<f32>, uGlobalFrame:vec4<f32>, uOutputTexture:vec4<f32>,
};
struct PaletteUniforms {uEffectRow:f32,};
@group(0) @binding(0) var<uniform> gfu:GlobalFilterUniforms;
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
@group(1) @binding(0) var<uniform> paletteUniforms:PaletteUniforms;
@group(1) @binding(1) var uPaletteTexture:texture_2d<f32>;
@group(1) @binding(2) var uPaletteSampler:sampler;
struct VertexOutput {@builtin(position) position:vec4<f32>, @location(0) uv:vec2<f32>,};
@vertex fn mainVertex(
 @location(0) aPosition: vec2<f32>,
)->VertexOutput{
 var position=aPosition*gfu.uOutputFrame.zw+gfu.uOutputFrame.xy;
 position.x=position.x*(2.0/gfu.uOutputTexture.x)-1.0;
 position.y=position.y*(2.0*gfu.uOutputTexture.z/gfu.uOutputTexture.y)-gfu.uOutputTexture.z;
 return VertexOutput(vec4<f32>(position,0.0,1.0),aPosition*(gfu.uOutputFrame.zw*gfu.uInputSize.zw));
}
@fragment fn mainFragment(
 @location(0) uv: vec2<f32>,
)->@location(0) vec4<f32>{
 let color=textureSample(uTexture,uSampler,uv);
 if(color.a<=0.0){return vec4<f32>(0.0);}
 let rgb=floor(clamp(color.rgb/color.a,vec3<f32>(0.0),vec3<f32>(1.0))*255.0+vec3<f32>(0.5));
 let brightness=floor((rgb.r+rgb.g+rgb.b)/3.0);
 let mapped=textureSampleLevel(uPaletteTexture,uPaletteSampler,vec2<f32>((brightness+0.5)/256.0,(paletteUniforms.uEffectRow+0.5)/6.0),0.0).rgb;
 return vec4<f32>(mapped*color.a,color.a);
}`;

export function createActorPaletteFilter(effect:PaletteEffect){
 const texture=paletteTexture();
 return new Filter({
  glProgram:GlProgram.from({vertex,fragment:ACTOR_PALETTE_FRAGMENT,name:'national-actor-color-levels',preferredFragmentPrecision:'highp'}),
  gpuProgram:GpuProgram.from({vertex:{source:ACTOR_PALETTE_WGSL,entryPoint:'mainVertex'},fragment:{source:ACTOR_PALETTE_WGSL,entryPoint:'mainFragment'}}),
  resolution:1,antialias:'off',padding:0,
  resources:{paletteUniforms:new UniformGroup({uEffectRow:{value:lookup.effects.indexOf(effect),type:'f32'}}),uPaletteTexture:texture.source,uPaletteSampler:texture.source.style},
 });
}
