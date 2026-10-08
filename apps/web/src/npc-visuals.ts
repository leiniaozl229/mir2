import contract from '../../../content/classic-176/npc-visuals.json';

export type NativeNpcPose={appearance:number;offset:number;direction:number;indices:number[];interval:number};

/** Appearance is a library segment identity, not an image index. */
export function nativeNpcPose(feature:number,direction:number):NativeNpcPose|undefined{
 if((feature&255)!==50)return;
 const appearance=feature>>>16,offset=contract.appearanceOffsets[appearance];
 if(offset===undefined||!Number.isInteger(direction))return;
 const poseDirection=(direction&255)%contract.directions,standing=contract.standing;
 const first=offset+standing.start+poseDirection*(standing.count+standing.skip);
 const indices=Array.from({length:standing.count},(_,frame)=>first+frame);
 if(indices.some(index=>index<0||index>=contract.sourceFrameCount))return;
 return {appearance,offset,direction:poseDirection,indices,interval:standing.interval};
}

export function nativeNpcLibraryMatches(library:{sourceSha256?:string;indexSha256?:string;sourceFrameCount?:number;profile?:string}){
 return library.profile==='national-2003-gameplay'&&library.sourceSha256===contract.sourceSha256&&library.indexSha256===contract.indexSha256&&library.sourceFrameCount===contract.sourceFrameCount;
}
