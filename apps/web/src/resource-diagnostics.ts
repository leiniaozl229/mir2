type ResourceRecord={assetScope?:string;contentVersion?:string;identityStatus?:string;missingReason?:string|null;iconMapping?:{kind?:string;sourceIndex?:number;proposedIndex?:number|null;proposedSelected?:boolean};pressedIconIndex?:number;pressedIconResolution?:{missingReason?:string|null};iconResolution?:{sourceId?:string|null;sourceVerified?:boolean;sourceVersion?:string;namespace?:string;index?:number;sourceFrameCount?:number|null;candidates?:Array<{sourceId?:string;sourceVersion?:string;namespace?:string;selected?:boolean;missingReason?:string}>}};
const reasons:Record<string,string>={frame_out_of_range:'索引超出当前源范围',frame_empty_placeholder:'原源为空帧或占位帧',unknown_source:'源身份未确认',extension_mapping_unconfirmed:'扩展映射未确认',library_missing:'图库未导出',frame_missing:'该帧未导出',source_identity_mismatch:'源锁与图库不一致'};
function escape(value:unknown){return String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function resourceHasIdentityConflict(value:ResourceRecord){return value.identityStatus==='conflict';}
type MapSelection={mapId?:string;layer?:string;indexCount?:number;status?:string;selected?:boolean;manifestLocksMatch?:boolean;historicalPairingVerified?:boolean;selectionEvidence?:string};
type MapResource={sourceRole?:string;missing?:number;mapBindingActive?:boolean;exportSnapshotMapBindingActive?:boolean;mapSourceSelections?:MapSelection[]};
export function mapBindingNeedsReview(value:MapResource){return (value.mapSourceSelections??[]).some(selection=>!selection.manifestLocksMatch||!selection.historicalPairingVerified||selection.status==='enabled'&&!selection.selected);}
export function mapBindingStatus(value:MapResource){
 const selected=(value.mapSourceSelections??[]).filter(selection=>selection.selected&&selection.manifestLocksMatch);
 if(value.sourceRole==='reference_candidate')return selected.length?`${selected.map(selection=>selection.mapId).join(' / ')}参考源已选择${selected.every(selection=>selection.historicalPairingVerified)?'':'，原版配对待核'}`:'参考候选，未绑定';
 return value.sourceRole!=='active_required'?'源身份待确认':value.missing?`缺 ${value.missing}`:'导出范围齐全';
}
export function mapBindingDiagnostics(value:MapResource){
 const selections=value.mapSourceSelections??[];
 if(!selections.length)return '';
 const rows=selections.map(selection=>`<div class="relation-item"><span>${escape(selection.mapId)} · ${escape(selection.layer)} · ${escape(selection.indexCount)} 个原索引</span><span>${selection.selected&&selection.manifestLocksMatch?'当前渲染已选择':'未选择'} · ${selection.historicalPairingVerified?'配对已核':'原版配对待核'} · ${escape(selection.selectionEvidence)}</span></div>`).join('');
 return `<section class="detail-section resource-map-bindings"><h3>地图素材选择</h3><div class="relation-list">${rows}</div><p class="template-note">选择仅作用于所列地图、图层和原索引。国服源覆盖与历史版本配对独立验收。</p></section>`;
}
/** Administration diagnostics never select or preview an unconfirmed candidate. */
export function iconDiagnostics(value:ResourceRecord){
 const resolution=value.iconResolution;
 if(!resolution)return '';
 const rows:[string,unknown][]=[['素材范围',value.assetScope],['内容版本',value.contentVersion],['生效源',resolution.sourceId],['源版本',resolution.sourceVersion],['命名空间',resolution.namespace],['源锁验证',resolution.sourceVerified?'通过':'未通过'],['精确索引',resolution.index],['源帧数',resolution.sourceFrameCount],['缺图原因',value.missingReason?reasons[value.missingReason]??value.missingReason:'—']];
 if(value.iconMapping)rows.push(['选帧规则',value.iconMapping.kind],['服务端源索引',value.iconMapping.sourceIndex]);
 if(value.iconMapping?.proposedIndex!=null)rows.push(['旧拟议索引',value.iconMapping.proposedIndex],['拟议映射状态',value.iconMapping.proposedSelected?'已选择':'未选作生效素材']);
 if(value.pressedIconIndex!=null)rows.push(['按下帧索引',value.pressedIconIndex],['按下帧缺项',value.pressedIconResolution?.missingReason?reasons[value.pressedIconResolution.missingReason]??value.pressedIconResolution.missingReason:'—']);
 if(resourceHasIdentityConflict(value))rows.push(['技能身份','编号与其他效果冲突，需独立核对']);
 const candidates=(resolution.candidates??[]).map(candidate=>`<div class="relation-item"><span>${escape(candidate.sourceId)} · ${escape(candidate.sourceVersion)} · ${escape(candidate.namespace)}</span><span>${candidate.selected?'已选择':'未选作生效素材'} · ${escape(reasons[candidate.missingReason??'']??candidate.missingReason)}</span></div>`).join('');
 return `<section class="detail-section resource-icon-diagnostics"><h3>素材来源与缺项</h3><div class="property-grid">${rows.map(([label,text])=>`<div class="property"><span>${escape(label)}</span><strong>${escape(text)}</strong></div>`).join('')}</div>${candidates?`<h4>参考候选</h4><div class="relation-list">${candidates}</div>`:''}</section>`;
}
