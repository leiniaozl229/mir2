export type MonsterVisualRule={raceImg:number;appr:number;library:string;quality:'exact'|'candidate';names:string[]};

// OpenMir2 serialises monster appearance as RaceImg (low byte) and Appr
// (high word).  Appr is reused by several families, so the pair is the
// authoritative lookup key.  Candidate rules are deliberate fallbacks for
// classic entries whose original library is not in the curated asset pack.
export const monsterVisualRules:MonsterVisualRule[]=[
 {raceImg:11,appr:160,library:'Monster003',quality:'exact',names:['鸡']},
 {raceImg:11,appr:161,library:'Monster004',quality:'exact',names:['鹿']},
 {raceImg:17,appr:25,library:'Monster006',quality:'exact',names:['多钩猫']},
 {raceImg:19,appr:80,library:'Monster019',quality:'exact',names:['山洞蝙蝠']},
 {raceImg:14,appr:20,library:'Monster022',quality:'exact',names:['骷髅']},
 {raceImg:23,appr:37,library:'Monster022',quality:'candidate',names:['变异骷髅']},
 {raceImg:15,appr:21,library:'Monster024',quality:'exact',names:['掷斧骷髅']},
 {raceImg:14,appr:22,library:'Monster025',quality:'exact',names:['骷髅战士']},
 {raceImg:14,appr:23,library:'Monster026',quality:'exact',names:['骷髅战将']},
 {raceImg:14,appr:150,library:'Monster026',quality:'candidate',names:['骷髅精灵']},
 {raceImg:19,appr:100,library:'Monster030',quality:'exact',names:['半兽人']},
 {raceImg:16,appr:24,library:'Monster020',quality:'exact',names:['洞蛆']},
 {raceImg:19,appr:30,library:'Monster030',quality:'exact',names:['沃玛战士']},
 {raceImg:19,appr:32,library:'Monster032',quality:'exact',names:['沃玛勇士']},
 {raceImg:40,appr:40,library:'Monster070',quality:'exact',names:['僵尸1']},
 {raceImg:41,appr:50,library:'Monster070',quality:'candidate',names:['僵尸2']},
 {raceImg:42,appr:51,library:'Monster072',quality:'exact',names:['僵尸3']},
 {raceImg:19,appr:110,library:'Monster045',quality:'exact',names:['红野猪']},
 {raceImg:19,appr:111,library:'Monster046',quality:'exact',names:['黑野猪']},
 {raceImg:19,appr:163,library:'Monster061',quality:'candidate',names:['毒蜘蛛']},
 {raceImg:19,appr:45,library:'Monster020',quality:'candidate',names:['盔甲虫']},
 {raceImg:19,appr:43,library:'Monster103',quality:'exact',names:['羊']},
 {raceImg:19,appr:38,library:'Monster112',quality:'exact',names:['虎蛇']},
 {raceImg:104,appr:47,library:'Monster047',quality:'candidate',names:['祖玛弓箭手']},
 {raceImg:101,appr:61,library:'Monster061',quality:'exact',names:['祖玛雕像']},
 {raceImg:101,appr:62,library:'Monster062',quality:'exact',names:['祖玛卫士']},
];

const byFeature=new Map(monsterVisualRules.map(rule=>[`${rule.raceImg}:${rule.appr}`,rule.library]));

export function resolveMonsterVisual(feature:number,name:string){
 const rule=byFeature.get(`${feature&255}:${feature>>>16}`);
 if(rule)return rule;
 // Name fallback covers synthetic packets and old servers that omit feature;
 // authoritative browser packets always take the pair lookup above.
 if(/鸡/.test(name))return 'Monster003';
 if(/鹿/.test(name))return 'Monster004';
 if(/变异骷髅/.test(name))return 'Monster022';
 if(/骷髅/.test(name))return 'Monster022';
 if(/洞蛆/.test(name))return 'Monster020';
 if(/僵尸/.test(name))return 'Monster070';
 if(/猪/.test(name))return 'Monster045';
 return undefined;
}
