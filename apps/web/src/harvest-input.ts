export type HarvestPointerInput={altKey:boolean;button:number};

export function requestsHarvest(input:HarvestPointerInput){
 return input.altKey&&input.button===0;
}
