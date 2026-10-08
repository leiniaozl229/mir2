import profile from '../../../content/classic-176/audio-playback.json';

export type AudioPhase='login'|'select'|'world'|'silent';
type Clip=keyof typeof profile.effects|'levelUp';
export type AudioPreferences={enabled:boolean;musicVolume:number;effectsVolume:number};
type Voice={audio:HTMLAudioElement;file:string;generation:number;playAttempt:number;music:boolean;baseVolume:number;release:()=>void};

/** Original file mapping and independent effect voices, with explicit browser lifecycle. */
export class GameAudio{
 private enabled=true;private phase:AudioPhase='silent';private suspended=false;private blurred=false;private disposed=false;private generation=0;
 private readonly clips=new Map<string,HTMLAudioElement>();private readonly voices=new Set<Voice>();private music:Voice|undefined;
 private blocked=false;private errors:{file:string;reason:string}[]=[];
 private musicVolume=1;private effectsVolume=1;private readonly preferenceListeners=new Set<(value:AudioPreferences)=>void>();
 private readonly gesture=(event:Event)=>{if(event.isTrusted&&this.blocked&&!this.suspended)this.startMusic();};
 private readonly hidden=()=>this.suspend(document.hidden||this.blurred);
 private readonly blur=()=>{this.blurred=true;this.suspend(true);};
 private readonly focus=()=>{this.blurred=false;this.suspend(document.hidden);};
 private readonly pageHide=()=>this.suspend(true);
 private readonly pageShow=()=>this.suspend(document.hidden||this.blurred);
 constructor(private readonly toggle:HTMLButtonElement){
  try{this.enabled=localStorage.getItem('mir2-audio')!=='off';}catch{}
   try{const value=JSON.parse(localStorage.getItem('mir2-audio-levels')??'null');if(value){this.musicVolume=this.volume(value.musicVolume,1);this.effectsVolume=this.volume(value.effectsVolume,1);}}catch{}
  document.addEventListener('pointerdown',this.gesture,true);document.addEventListener('keydown',this.gesture,true);
  document.addEventListener('visibilitychange',this.hidden);window.addEventListener('blur',this.blur);window.addEventListener('focus',this.focus);window.addEventListener('pagehide',this.pageHide);window.addEventListener('pageshow',this.pageShow);
   this.suspended=document.hidden;toggle.onclick=()=>this.setEnabled(!this.enabled);this.render();
 }
  preferences():AudioPreferences{return {enabled:this.enabled,musicVolume:this.musicVolume,effectsVolume:this.effectsVolume};}
  subscribe(listener:(value:AudioPreferences)=>void){this.preferenceListeners.add(listener);listener(this.preferences());return ()=>{this.preferenceListeners.delete(listener);};}
  setEnabled(value:boolean){if(this.disposed||typeof value!=='boolean'||value===this.enabled)return;this.enabled=value;this.persistPreferences();if(value)this.startMusic();else this.clear();this.render();this.notifyPreferences();}
  toggleEnabled(){this.setEnabled(!this.enabled);}
  setVolumes(value:Partial<Pick<AudioPreferences,'musicVolume'|'effectsVolume'>>){
   if(this.disposed)return;const music=this.volume(value.musicVolume,this.musicVolume),effects=this.volume(value.effectsVolume,this.effectsVolume);
   if(music===this.musicVolume&&effects===this.effectsVolume)return;this.musicVolume=music;this.effectsVolume=effects;
   for(const voice of this.voices)voice.audio.volume=voice.baseVolume*(voice.music?music:effects);
   this.persistPreferences();this.notifyPreferences();
  }
  private volume(value:unknown,fallback:number){return typeof value==='number'&&Number.isFinite(value)?Math.min(1,Math.max(0,value)):fallback;}
  private persistPreferences(){try{localStorage.setItem('mir2-audio',this.enabled?'on':'off');localStorage.setItem('mir2-audio-levels',JSON.stringify({musicVolume:this.musicVolume,effectsVolume:this.effectsVolume}));}catch{}}
  private notifyPreferences(){const value=this.preferences();for(const listener of this.preferenceListeners)listener({...value});}
 setPhase(phase:AudioPhase){if(this.disposed)return;if(this.phase===phase){this.startMusic();return;}this.clear();this.phase=phase;this.startMusic();}
 play(name:Clip,volume=profile.defaultVolume){
  const file=(profile.effects as Partial<Record<Clip,string>>)[name];
  if(!file||!this.enabled||this.suspended||this.disposed)return false;
  this.createVoice(file,false,volume);return true;
 }
 /** Original frame2 weapon sound; extra skill sound requires the actual special kind. */
 playMelee(entity:{feature:number;meleeKind?:string},parts={weapon:true,skill:true}){
  if((entity.feature&255)!==0)return false;
  const special:Partial<Record<string,Clip>>={power:(entity.feature>>>24)&1?'powerFemale':'powerMale',thrusting:'thrusting',halfMoon:'halfMoon',fire:'fire'};
  const extra=entity.meleeKind?special[entity.meleeKind]:undefined;
  if(!extra&&!['normal','heavy','big'].includes(entity.meleeKind??''))return false;
  const shape=Math.floor(((entity.feature>>>8)&255)/profile.meleeImpact.weaponShapeDivisor);
  const groups=Object.entries(profile.meleeImpact.weaponGroups) as [Clip,number[]][];
  const weapon=groups.find(([,values])=>values.includes(shape))?.[0]??profile.meleeImpact.defaultWeapon as Clip;
  const played=parts.weapon&&this.play(weapon);return extra&&parts.skill?this.play(extra)||played:played;
 }
 clear(){this.generation++;for(const voice of [...this.voices])voice.release();this.music=undefined;this.blocked=false;}
  dispose(){if(this.disposed)return;this.clear();this.disposed=true;this.toggle.onclick=null;document.removeEventListener('pointerdown',this.gesture,true);document.removeEventListener('keydown',this.gesture,true);document.removeEventListener('visibilitychange',this.hidden);window.removeEventListener('blur',this.blur);window.removeEventListener('focus',this.focus);window.removeEventListener('pagehide',this.pageHide);window.removeEventListener('pageshow',this.pageShow);this.clips.clear();this.preferenceListeners.clear();}
 debugState(){return {enabled:this.enabled,phase:this.phase,suspended:this.suspended,blocked:this.blocked,voices:this.voices.size,music:this.music?.file,errors:this.errors.map(error=>({...error})),disposed:this.disposed};}
 private suspend(value:boolean){
  if(this.disposed||this.suspended===value)return;this.suspended=value;
  if(value){for(const voice of [...this.voices]){if(voice.music){voice.playAttempt++;voice.audio.pause();}else voice.release();}}
  else if(this.music)this.tryPlay(this.music);else this.startMusic();
 }
 private startMusic(){
  if(!this.enabled||this.suspended||this.disposed)return;
  const file=(profile.music as Partial<Record<AudioPhase,string>>)[this.phase];if(!file)return;
  if(this.music){if(this.music.file===file){if(this.blocked||this.music.audio.paused)this.tryPlay(this.music);return;}this.music.release();}
  const voice=this.createVoice(file,true,profile.defaultVolume);if(this.voices.has(voice))this.music=voice;
 }
 private createVoice(file:string,music:boolean,volume:number){
  let template=this.clips.get(file);if(!template){template=new Audio(`/audio/${encodeURIComponent(file)}`);template.preload='auto';this.clips.set(file,template);}
   const audio=template.cloneNode(true) as HTMLAudioElement;audio.loop=music;const baseVolume=this.volume(volume,profile.defaultVolume);audio.volume=baseVolume*(music?this.musicVolume:this.effectsVolume);
   const voice:Voice={audio,file,music,baseVolume,generation:this.generation,playAttempt:0,release:()=>{
   if(!this.voices.delete(voice))return;audio.removeEventListener('ended',ended);audio.removeEventListener('error',failed);audio.pause();try{audio.currentTime=0;}catch{}if(this.music===voice)this.music=undefined;
  }};
  const ended=()=>voice.release(),failed=()=>{if(voice.generation===this.generation){this.recordError(file,'media-error');if(voice.music)this.blocked=true;}voice.release();};
  audio.addEventListener('ended',ended);audio.addEventListener('error',failed);this.voices.add(voice);this.tryPlay(voice);return voice;
 }
 private tryPlay(voice:Voice){
  if(!this.voices.has(voice)||this.suspended||!this.enabled||this.disposed)return;
  const attempt=++voice.playAttempt;
  let result:Promise<void>|undefined;try{result=voice.audio.play();}catch(error){this.playFailed(voice,error,attempt);return;}
  void result?.then(()=>{if(attempt!==voice.playAttempt)return;if(voice.generation!==this.generation||this.disposed||!this.voices.has(voice)){voice.audio.pause();return;}if(this.suspended)voice.audio.pause();else if(voice.music)this.blocked=false;}).catch(error=>this.playFailed(voice,error,attempt));
 }
 private playFailed(voice:Voice,error:unknown,attempt:number){
  if(attempt!==voice.playAttempt||voice.generation!==this.generation||!this.voices.has(voice)||this.disposed)return;
  const reason=error instanceof Error?error.name:'play-error';this.recordError(voice.file,reason);
  if(voice.music)this.blocked=true;if(!voice.music||reason!=='NotAllowedError')voice.release();
 }
 private recordError(file:string,reason:string){this.errors.push({file,reason});if(this.errors.length>12)this.errors.shift();}
 private render(){this.toggle.textContent=this.enabled?'声音：开':'声音：关';this.toggle.setAttribute('aria-pressed',String(this.enabled));this.toggle.setAttribute('aria-label',this.enabled?'关闭声音':'开启声音');this.toggle.title=this.enabled?'关闭声音（F12）':'开启声音（F12）';}
}
