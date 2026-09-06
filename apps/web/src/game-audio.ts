type Clip='movement'|'swing'|'struck'|'skeletonAttack'|'levelUp';

const files:Record<Clip,string>={
 movement:'/audio/1.wav',swing:'/audio/50.wav',struck:'/audio/60.wav',
 skeletonAttack:'/audio/022-1.wav',levelUp:'/audio/levelup.wav'
};

export class GameAudio{
 private enabled=localStorage.getItem('mir2-audio')!=='off';
 private readonly clips=new Map<Clip,HTMLAudioElement>();
 constructor(private readonly toggle:HTMLButtonElement){
  for(const [name,file] of Object.entries(files) as [Clip,string][]){const audio=new Audio(file);audio.preload='auto';this.clips.set(name,audio);}
  toggle.onclick=()=>{this.enabled=!this.enabled;localStorage.setItem('mir2-audio',this.enabled?'on':'off');this.render();};this.render();
 }
 play(name:Clip,volume=.35){if(!this.enabled)return;const template=this.clips.get(name);if(!template)return;const audio=template.cloneNode(true) as HTMLAudioElement;audio.volume=volume;void audio.play().catch(()=>{});}
 private render(){this.toggle.textContent=this.enabled?'声音：开':'声音：关';this.toggle.setAttribute('aria-pressed',String(this.enabled));}
}
