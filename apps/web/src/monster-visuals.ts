import {monsterLayers} from './national-actors';
export type MonsterVisualRule={raceImg:number;appr:number;library:string;quality:'exact'|'candidate';names:string[]};

// OpenMir2 serialises monster appearance as RaceImg (low byte) and Appr
// (high word). The catalogue below supplies named calibration examples.
// Rendering resolves the original Mon library and source offset directly.
// The quality flag records historical reference evidence, not runtime QA.
export const monsterVisualRules:MonsterVisualRule[]=[
 {raceImg:11,appr:160,library:'Mon17',quality:'exact',names:['鸡']},
 {raceImg:11,appr:161,library:'Mon17',quality:'exact',names:['鹿']},
 {raceImg:17,appr:25,library:'Mon3',quality:'exact',names:['多钩猫']},
 {raceImg:19,appr:80,library:'Mon9',quality:'exact',names:['山洞蝙蝠']},
 {raceImg:14,appr:20,library:'Mon3',quality:'exact',names:['骷髅']},
 {raceImg:23,appr:37,library:'Mon4',quality:'candidate',names:['变异骷髅']},
 {raceImg:15,appr:21,library:'Mon3',quality:'exact',names:['掷斧骷髅']},
 {raceImg:14,appr:22,library:'Mon3',quality:'exact',names:['骷髅战士']},
 {raceImg:14,appr:23,library:'Mon3',quality:'exact',names:['骷髅战将']},
 {raceImg:14,appr:150,library:'Mon16',quality:'candidate',names:['骷髅精灵']},
 {raceImg:19,appr:100,library:'Mon11',quality:'exact',names:['半兽人']},
 {raceImg:16,appr:24,library:'Mon3',quality:'exact',names:['洞蛆']},
 {raceImg:19,appr:30,library:'Mon4',quality:'exact',names:['沃玛战士']},
 {raceImg:19,appr:32,library:'Mon4',quality:'exact',names:['沃玛勇士']},
 {raceImg:40,appr:40,library:'Mon5',quality:'exact',names:['僵尸1']},
 {raceImg:41,appr:50,library:'Mon6',quality:'candidate',names:['僵尸2']},
 {raceImg:42,appr:51,library:'Mon6',quality:'exact',names:['僵尸3']},
 {raceImg:19,appr:110,library:'Mon12',quality:'exact',names:['红野猪']},
 {raceImg:19,appr:111,library:'Mon12',quality:'exact',names:['黑野猪']},
 {raceImg:19,appr:163,library:'Mon17',quality:'candidate',names:['毒蜘蛛']},
 {raceImg:19,appr:45,library:'Mon5',quality:'candidate',names:['盔甲虫']},
 {raceImg:19,appr:43,library:'Mon5',quality:'exact',names:['羊']},
 {raceImg:19,appr:38,library:'Mon4',quality:'exact',names:['虎蛇']},
 {raceImg:104,appr:47,library:'Mon5',quality:'candidate',names:['祖玛弓箭手']},
 {raceImg:101,appr:61,library:'Mon7',quality:'exact',names:['祖玛雕像']},
 {raceImg:101,appr:62,library:'Mon7',quality:'exact',names:['祖玛卫士']},
];

export function resolveMonsterVisual(feature:number,_name:string){
 // National libraries use the server appearance directly. Names and curated
 // Crystal aliases must not replace a valid appearance with another monster.
 return monsterLayers(feature)?.bodyName;
}
