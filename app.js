'use strict';
(() => {
const D=globalThis.FE_DATA,C=globalThis.PlannerCore,KEY='banshisenko-planner:v1';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chars=new Map(D.characters.map(c=>[c.id,c])),jobs=new Map(D.classes.map(c=>[c.id,c]));
let state=C.initial(D),route='dietrich',view='planner',pane='squad',detailId=null,detailRoute=route,compare=[],filterTag='',toastTimer,pendingImport=null,undoState=null,storageError=false;
const f={q:'',assignment:'all',role:'',job:'',strength:'',weakness:'',tag:''};
let corruptBackup=null;
try{const saved=localStorage.getItem(KEY);if(saved){try{state=C.validateState(JSON.parse(saved),D);}catch{corruptBackup=saved;storageError=true;}}}catch{storageError=true;}
if(storageError)$('#storage-warning').textContent=corruptBackup?'기존 저장 데이터를 읽지 못했습니다. 원본을 보존하고 임시 편성으로 열었습니다. 설정에서 복구용 원본을 내보내거나 정상 백업을 불러오세요.':'브라우저 저장소를 사용할 수 없습니다. 편집은 가능하며, 종료 전에 JSON으로 내보내주세요.';
$('#storage-warning').hidden=!storageError;
// Protection always starts enabled after imports; ordinary local sessions retain an explicit choice.
function safe(s){if(state.settings.spoilers)return String(s??'');let t=String(s??'');for(const c of D.characters)if(!C.visible(c,state))t=t.replaceAll(c.name,'[비공개]');return t;}
const e=s=>esc(safe(s));
const current=()=>D.routes.find(r=>r.id===route);
const isVisible=id=>chars.has(id)&&C.visible(chars.get(id),state);
const shownBuilds=r=>state.routes[r].filter(b=>isVisible(b.characterId));
const assigned=id=>D.routes.filter(r=>state.routes[r.id].some(b=>b.characterId===id));
const getBuild=(r,id)=>state.routes[r].find(b=>b.characterId===id);
const jobName=id=>jobs.get(id)?.name||'최종직 미정';
const fmt=n=>n===null||n===undefined?'미수록':(n>0?'+':'')+n;
function avatar(c){const g=c.growth,k=g.mg>=45?'magic':g.spd>=50?'fast':'physical';return `<span class="avatar ${k}" aria-hidden="true">${e(c.name[0])}</span>`;}
function options(values,value,empty='미정'){return `<option value="">${empty}</option>`+values.map(x=>{const [v,n]=Array.isArray(x)?x:[x,x];return `<option value="${esc(v)}" ${v===value?'selected':''}>${e(n)}</option>`;}).join('');}
function button(action,text,attrs=''){return `<button data-action="${action}" ${attrs}>${text}</button>`;}
function toast(msg,undo=false){clearTimeout(toastTimer);$('#toast').textContent=msg;if(undo)$('#toast').insertAdjacentHTML('beforeend',' <button data-action="undo">되돌리기</button>');$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,undo?8000:3300);}
function undo(){if(!undoState)return;state=undoState;undoState=null;save();render();if($('#detail-dialog').open)renderDetail();toast('편성 변경을 되돌렸습니다.');}
function save(){
 state.updatedAt=new Date().toISOString();
 if(corruptBackup){$('#save-status').textContent='임시 편집 · 백업 필요';return;}
 try{localStorage.setItem(KEY,JSON.stringify(state));storageError=false;$('#save-status').textContent='자동 저장됨';$('#storage-warning').hidden=true;}
 catch{storageError=true;$('#save-status').textContent='저장 실패 · 내보내기';$('#storage-warning').hidden=false;$('#storage-warning').textContent='브라우저에 저장하지 못했습니다. 현재 편성은 메모리에 유지됩니다. 데이터 내보내기로 백업해주세요.';}
}
function setTheme(){document.body.classList.toggle('dark',state.settings.theme==='dark');$('meta[name="theme-color"]').content=state.settings.theme==='dark'?'#191d20':'#f5f3ee';}
function renderRoutes(){
 $('#route-tabs').innerHTML=D.routes.map((r,i)=>`<button class="route-tab ${r.id===route?'active':''}" style="--tab-color:${r.color}" data-route="${r.id}" aria-pressed="${r.id===route}"><span class="route-emblem" aria-hidden="true">${['◇','♜','✧','☽'][i]}</span><span><strong>${r.name}</strong><small>ROUTE 0${i+1}</small></span><span class="count">${shownBuilds(r.id).length}</span></button>`).join('');
 document.documentElement.style.setProperty('--route',current().color);
}
function renderFilters(){
 const prof=['검','창','도끼','활','격투','흑마법','백마법','기마','비행','중장','보병','지휘'];
 $('#filters').innerHTML=`<label>부대 역할<select data-filter="role">${options(C.ROLES,f.role,'모든 역할')}</select></label><label>이번 루트의 최종직<select data-filter="job">${options(D.classes.map(j=>[j.id,j.name]),f.job,'모든 병종')}</select></label><div class="pair"><label>특기<select data-filter="strength">${options(prof,f.strength,'전체')}</select></label><label>약점<select data-filter="weakness">${options(prof,f.weakness,'전체')}</select></label></div><label>역할·특성 태그<input data-filter="tag" value="${esc(f.tag)}" placeholder="예: 필살, 기병 시너지"></label>${button('reset-filters','필터 초기화','class="quiet"')}`;
 $('#quick-filters').innerHTML=['물리','마법','활','기병','비행','중장','힐러'].map(t=>`<button data-quick="${t}" class="${filterTag===t?'active':''}" aria-pressed="${filterTag===t}">${t}</button>`).join('');
}
function matches(c){
 const routes=assigned(c.id),b=getBuild(route,c.id),tags=C.tags(c,state),g=c.growth,skills=[...(c.strengths||[])],text=[c.name,...c.aliases,...tags,c.personal,c.unique,...skills,...(c.weaknesses||[]),b?.roleLabel,jobName(b?.finalClass)].join(' ').toLowerCase();
 if(f.q&&!text.includes(f.q.toLowerCase()))return false;
 if(f.assignment==='current'&&!b||f.assignment==='planned'&&!routes.length||f.assignment==='unassigned'&&routes.length)return false;
 if(f.assignment.startsWith('route:')&&!routes.some(r=>r.id===f.assignment.slice(6)))return false;
 if(f.role&&!C.buildRoles(b||C.blankBuild(c.id)).includes(f.role))return false;
 if(f.job&&b?.finalClass!==f.job||f.strength&&!skills.includes(f.strength)||f.weakness&&!(c.weaknesses||[]).includes(f.weakness))return false;
 if(f.tag&&!tags.some(t=>t.includes(f.tag)))return false;
 const weapons=[b?.primary,b?.secondary],roles=C.buildRoles(b||C.blankBuild(c.id));
 if(filterTag==='물리'&&!(g.str>=40||roles.includes('물리딜')))return false;
 if(filterTag==='마법'&&!(g.mg>=40||roles.includes('마법딜')||weapons.includes('흑마법')))return false;
 if(filterTag==='활'&&!(skills.includes('활')||weapons.includes('활')||roles.includes('활')))return false;
 if(filterTag==='힐러'&&!(skills.includes('백마법')||roles.includes('힐 가능')))return false;
 if(['기병','비행','중장'].includes(filterTag)&&!(b?.movement===filterTag||skills.includes(filterTag==='기병'?'기마':filterTag)))return false;
 return true;
}
function renderCatalog(){
 const visible=D.characters.filter(c=>C.visible(c,state)),list=visible.filter(matches);
 $('#catalog-count').textContent=`${list.length} / ${visible.length}`;
 $('#character-list').innerHTML=list.length?list.map(c=>{
 const b=getBuild(route,c.id),t=C.tags(c,state),rs=assigned(c.id);
 return `<article class="character-card" draggable="true" data-drag="${c.id}">${avatar(c)}<div class="character-body"><button class="character-name" data-character="${c.id}">${e(c.name)}</button><div class="character-tags">${e(t.slice(0,2).join(' · ')||'성장률·특성 확인')}</div><div class="character-tags">${rs.length?e(rs.map(r=>r.name).join(' / ')):'미배정'}</div></div><div class="card-actions"><button class="add-button ${b?'added':''}" data-${b?'remove':'add'}="${c.id}" title="${b?'편성 취소':'부대에 추가'}" aria-label="${e(c.name)} ${current().name} ${b?'편성 취소':'부대에 추가'}">${b?'✓':'+'}</button><button class="compare-toggle ${compare.includes(c.id)?'active':''}" data-compare="${c.id}" aria-pressed="${compare.includes(c.id)}" aria-label="${e(c.name)} 후보 비교 ${compare.includes(c.id)?'해제':'선택'}">${compare.includes(c.id)?'선택됨':'비교'}</button></div></article>`;
 }).join(''):'<div class="empty">조건에 맞는 캐릭터가 없습니다.<br>검색어나 필터를 바꿔보세요.</div>';
 $('#compare-button').textContent=`후보 비교 ${compare.length}/3`;
 $('#compare-button').disabled=compare.length<2;
}
function renderSquad(){
 const builds=shownBuilds(route),a=C.analyze(builds);
 $('#route-kicker').textContent=`ROUTE 0${D.routes.findIndex(r=>r.id===route)+1} / 나의 부대`;
 $('#squad-title').textContent=current().name+' 부대';$('#squad-count').textContent=a.total;
 const hidden=state.routes[route].length-builds.length;
 $('#squad-summary').innerHTML=`<span><strong>${a.total}</strong>명 편성</span><span><strong>${Object.keys(a.classes).length}</strong>개 최종직</span><span><strong>${a.unconfigured}</strong>명 빌드 설정 중</span>${hidden?`<span>보호 중 ${hidden}명</span>`:''}`;
 $('#squad-list').innerHTML=builds.length?builds.map((b,i)=>{
 const c=chars.get(b.characterId),roles=C.buildRoles(b),cl=b.finalClass?`<button class="link" data-job="${b.finalClass}" data-for="${c.id}">${e(jobName(b.finalClass))}</button>`:'최종직 미정';
 return `<article class="squad-row" draggable="true" data-drag="${c.id}" data-order="${i}"><span class="row-order">${String(i+1).padStart(2,'0')}</span>${avatar(c)}<div class="squad-main"><button class="squad-name" data-character="${c.id}">${e(c.name)}</button><div class="build-line">${e(b.roleLabel||roles.slice(0,2).join(' · ')||'역할 미정')} · ${cl}</div>${b.primary||b.movement?`<div class="character-tags">${e([b.primary,b.secondary,b.movement].filter(Boolean).join(' · '))}</div>`:''}</div><div class="mini-stats" aria-label="힘 ${c.growth.str}, 마력 ${c.growth.mg}, 속도 ${c.growth.spd}"><span>${c.growth.str}</span><span>${c.growth.mg}</span><span>${c.growth.spd}</span></div><div class="row-menu"><div class="row-reorder"><button class="order-button" data-move="${c.id}" data-direction="-1" aria-label="${e(c.name)} 위로" ${i===0?'disabled':''}>⌃</button><button class="order-button" data-move="${c.id}" data-direction="1" aria-label="${e(c.name)} 아래로" ${i===builds.length-1?'disabled':''}>⌄</button></div><button data-character="${c.id}" aria-label="${e(c.name)} 빌드 설정">설정</button><button class="remove" data-remove="${c.id}" aria-label="${e(c.name)} 부대에서 제외">×</button></div></article>`;
 }).join(''):'<div class="empty">아직 편성한 동료가 없습니다.<br>캐릭터 목록의 + 버튼으로 첫 동료를 추가하세요.</div>';
}
function bars(counts,total){return Object.entries(counts).map(([n,v])=>`<div class="bar-row"><span>${n}</span><div class="bar"><i style="width:${total?v/total*100:0}%"></i></div><strong>${v}</strong></div>`).join('');}
function renderStats(){
 const a=C.analyze(shownBuilds(route)),groups=Object.entries(a.classes).sort((a,b)=>b[1].length-a[1].length);
 $('#stats').innerHTML=`<div class="panel-heading"><h2>부대 구성</h2><span class="tag accent">실시간</span></div><section class="stat-section"><div class="stat-head"><h3>역할 분포</h3><span>복수 집계</span></div>${bars(a.roles,a.total)}<p class="subtle">역할 미정 ${a.missing.roles}명</p></section><section class="stat-section"><div class="stat-head"><h3>무기 구성</h3><span>주·보조 합산</span></div><div class="weapon-grid">${Object.entries(a.weapons).map(([n,v])=>`<div class="weapon-count"><strong>${v}</strong>${n}</div>`).join('')}</div><p class="subtle" style="margin:12px 0 0">무기 미정 ${a.missing.weapons}명</p></section><section class="stat-section"><div class="stat-head"><h3>이동 타입</h3><span>미정 ${a.missing.movement}명</span></div>${bars(a.movement,a.total)}</section><section class="stat-section"><div class="stat-head"><h3>최종직 구성</h3><span>미정 ${a.missing.classes}명</span></div>${groups.length?groups.map(([id,ids])=>`<div class="class-count"><div class="class-top"><button class="link" data-job="${id}">${e(jobName(id))}</button><span class="${ids.length>=2?'repeat':''}">×${ids.length}${ids.length>=2?' 중복':''}</span></div><p>${ids.map(id=>e(chars.get(id).name)).join(' · ')}</p></div>`).join(''):'<p class="empty compact">최종직을 지정하면 직업별 인원과<br>중복을 여기에서 확인할 수 있습니다.</p>'}${Object.entries(a.roles).filter(([r,n])=>n>=4).map(([r,n])=>`<div class="info-strip"><span class="repeat">역할 중복</span> ${r} ${n}명</div>`).join('')}<p class="subtle" style="margin:12px 0 0">최종직 2명 이상 · 역할 4명 이상 표시.<br>중복은 구성 정보이며 우열 평가가 아닙니다.</p></section>`;
}
function renderOverview(){
 const counts=Object.fromEntries(D.routes.map(r=>[r.id,C.analyze(shownBuilds(r.id))]));
 const visible=D.characters.filter(c=>C.visible(c,state)),over=visible.filter(c=>assigned(c.id).length>1),unused=visible.filter(c=>!assigned(c.id).length);
 const metrics=[['인원',a=>a.total],...C.ROLES.map(r=>[r,a=>a.roles[r]]),...C.MOVEMENTS.map(r=>[r,a=>a.movement[r]])];
 $('#overview-view').innerHTML=`<div class="overview-cards">${D.routes.map(r=>`<article class="panel overview-card" style="--route:${r.color}"><h2>${r.name} 루트</h2><div class="big">${counts[r.id].total}<small>명</small></div><p class="subtle">빌드 설정 중 ${counts[r.id].unconfigured}명</p><button data-route="${r.id}" class="quiet">편성 열기 →</button></article>`).join('')}</div><div class="overview-grid"><div><section class="panel overview-section"><h2>루트별 역할·이동 비교</h2><p class="subtle">직접 설정한 역할과 이동 타입만 집계합니다.</p><div class="table-scroll"><table class="comparison-table"><thead><tr><th>구성</th>${D.routes.map(r=>`<th>${r.name}</th>`).join('')}</tr></thead><tbody>${metrics.map(([n,fn])=>`<tr><th>${n}</th>${D.routes.map(r=>`<td>${fn(counts[r.id])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section><section class="panel overview-section"><h2>미배정 캐릭터 <span class="count">${unused.length}</span></h2><p class="subtle">현재 공개 범위에서 어느 루트에도 배치하지 않은 동료</p><div class="name-list">${unused.map(c=>`<button data-character="${c.id}">${e(c.name)} +</button>`).join('')||'<p class="subtle">모든 동료가 하나 이상의 루트에 배치되어 있습니다.</p>'}</div></section></div><section class="panel overview-section"><h2>여러 루트에 함께하는 동료 <span class="count">${over.length}</span></h2><p class="subtle">같은 캐릭터도 루트별로 다른 빌드를 저장합니다.</p>${over.map(c=>`<div class="overlap-row"><button class="link" data-character="${c.id}">${e(c.name)}</button><span>${assigned(c.id).map(r=>r.name).join(' / ')}</span></div>`).join('')||'<p class="empty">중복 배치한 캐릭터가 없습니다.</p>'}</section></div>`;
}
function render(){
 setTheme();renderRoutes();renderCatalog();renderSquad();renderStats();if(view==='overview')renderOverview();
 $('#spoiler-status').textContent=state.settings.spoilers?'◇ 전체 캐릭터 공개':'◇ 2부까지 공개';
 $('#data-version').textContent=`자료 기준 ${D.version}`;
 $('#save-status').textContent=storageError?'저장 확인 필요':state.updatedAt?'자동 저장됨':'초기 편성 · 자동 저장';
}
function setView(v){view=v;$('#planner-view').hidden=v!=='planner';$('#overview-view').hidden=v!=='overview';$('.mobile-tabs').hidden=v!=='planner';$('#route-tabs').hidden=v!=='planner';$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('#page-title').textContent=v==='planner'?'다음 전투를 위한 편성':'네 번의 여정, 한눈에';$('#page-description').textContent=v==='planner'?'마음에 드는 동료를 모으고, 루트마다 새로운 빌드를 만들어보세요.':'중복으로 육성할 동료와 루트마다 달라지는 구성을 비교하세요.';render();}
function setPane(p){pane=p;$('#planner-view').dataset.pane=p;$$('[data-pane]').filter(b=>b.tagName==='BUTTON').forEach(b=>b.classList.toggle('active',b.dataset.pane===p));}
function add(id,r=route){if(!isVisible(id)||getBuild(r,id))return;state.routes[r].push(C.blankBuild(id));save();render();toast(`${chars.get(id).name} · ${D.routes.find(x=>x.id===r).name} 부대에 추가했습니다.`);}
function remove(id,r=route){if(!getBuild(r,id))return;undoState=C.clone(state);state.routes[r]=state.routes[r].filter(b=>b.characterId!==id);save();render();if($('#detail-dialog').open)renderDetail();toast(`${D.routes.find(x=>x.id===r).name} 부대에서 제외했습니다.`,true);}
function move(id,delta){const list=state.routes[route],a=list.findIndex(b=>b.characterId===id),b=a+delta;if(a<0||b<0||b>=list.length)return;[list[a],list[b]]=[list[b],list[a]];save();renderSquad();}
function showDialog(id){const d=$(id);if(!d.open)d.showModal();}
function closeDialog(d){if(d?.open)d.close();}
function traitDetails(c){return `<div class="traits">${[['개인 특성',c.personal],['유니크 특성',c.unique]].map(([n,t])=>{const value=safe(t);return `<details><summary><span>${n}</span>${e(value==='-'?'없음':value.split(/[:：\n]/)[0]||'미수록')}</summary><p>${e(value==='-'?'자료에 기재된 특성 없음':value||'미수록')}</p></details>`;}).join('')}</div>`;}
function growthTable(c,j=null){return `<table class="growth-table"><thead><tr><th>능력치</th><th>캐릭터 %</th>${j?'<th>병종 %p</th><th>합산 %</th>':'<th>성장 경향</th>'}</tr></thead><tbody>${C.STATS.map(([k,n])=>`<tr><th>${n}</th><td class="value">${c.growth[k]??'—'}%</td>${j?`<td>${fmt(j.growth[k])}</td><td>${c.growth[k]!=null&&j.growth[k]!=null?c.growth[k]+j.growth[k]:'—'}</td>`:`<td><span class="growth-mini-bar"><i style="width:${Math.min(100,c.growth[k]||0)}%"></i></span></td>`}</tr>`).join('')}</tbody></table>`;}
function renderDetail(){
 const c=chars.get(detailId);if(!c||!C.visible(c,state)){closeDialog($('#detail-dialog'));return;}
 const b=getBuild(detailRoute,c.id),rs=assigned(c.id),tags=C.tags(c,state);
 $('#detail-dialog').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">CHARACTER / 동료 정보</p><h2 id="detail-title">${e(c.name)}</h2></div><button class="icon-button" data-close="detail-dialog" aria-label="캐릭터 상세 닫기">×</button></div><div class="dialog-body detail-layout"><section><div class="detail-identity">${avatar(c)}<div><p>${rs.length?rs.map(r=>r.name).join(' · '):'아직 배정된 루트가 없습니다'}</p><div class="chips">${tags.map(t=>`<span class="tag accent">${e(t)}</span>`).join('')}</div></div></div><h3>캐릭터 성장률</h3>${growthTable(c)}<p class="subtle">성장률만으로 강함을 평가하지 않습니다.</p><div class="section-label">개인·유니크 특성</div>${traitDetails(c)}<div class="aptitudes"><div class="aptitude"><strong>특기</strong>${e(c.strengths===null?'미수록':c.strengths.join(' · ')||'기재된 항목 없음')}</div><div class="aptitude"><strong>약점</strong>${e(c.weaknesses===null?'미수록':c.weaknesses.join(' · ')||'기재된 항목 없음')}</div></div><p class="subtle" style="margin-top:8px">적성: 보완 자료에 기재된 항목만 표시</p><details class="tag-editor"><summary class="subtle">자동 태그 수정 / 생성 기준</summary><label class="field">태그 (쉼표로 구분)<input id="tag-edit" value="${esc(tags.join(', '))}" maxlength="2400"></label><div class="inline-actions">${button('save-tags','태그 저장')}${button('reset-tags','자동 태그 복원','class="quiet"')}</div><p class="rule-list">힘≥35·속도≥50: 고속 물리 / 힘≥40·수비≥40: 물리 딜탱 / 마력≥45: 마법 딜러 / 마방≥45: 마법탱 / 힘·마력≥35: 하이브리드 / 기술≥50: 고기술·필살형 / 매력≥45: 지원형.<br>시너지 태그는 특성 설명의 키워드로 생성하며 실제 발동 조건은 원문을 확인하세요.</p></details><div class="inline-actions" style="margin-top:16px"><button data-compare="${c.id}">${compare.includes(c.id)?'비교 선택 해제':'후보 비교에 추가'}</button>${button('compare','비교 보기',compare.length<2?'disabled':'')}</div></section><section class="build-panel"><h3>루트별 육성 빌드</h3><p class="subtle">이 루트에서만 사용하는 역할과 전직 계획입니다.</p><div class="detail-route-tabs">${D.routes.map(r=>`<button data-detail-route="${r.id}" class="${r.id===detailRoute?'active':''}" aria-pressed="${r.id===detailRoute}">${r.name}${getBuild(r.id,c.id)?' ✓':''}</button>`).join('')}</div>${b?buildForm(b):`<div class="empty">${D.routes.find(r=>r.id===detailRoute).name} 부대에 아직 없습니다.<br>추가한 뒤 이 루트의 빌드를 설정하세요.</div><button class="primary" data-detail-add="${c.id}" style="width:100%">이 부대에 추가</button>`}</section></div><div class="dialog-foot"><span>성장률·특성: cass07 / 적성: redfreshet</span><button data-close="detail-dialog">완료</button></div>`;
 const panel=$('#detail-dialog .build-panel');
 if(b)panel.insertAdjacentHTML('beforeend',`<button class="danger" data-detail-remove="${c.id}">이 루트에서 편성 취소</button>`);
 else if(undoState?.routes[detailRoute]?.some(x=>x.characterId===c.id))panel.insertAdjacentHTML('beforeend',`<div style="margin-top:12px">${button('undo','방금 제외 되돌리기')}</div>`);
}
function buildForm(b){
 return `<label class="field">내가 정한 역할 이름<input data-build="roleLabel" value="${esc(b.roleLabel)}" maxlength="150" placeholder="예: 마법 타조 / 전열 지원"></label><div class="field">집계할 역할 · 여러 개 선택</div><div class="role-options">${C.ROLES.map(r=>`<label><input type="checkbox" data-role="${r}" ${b.roles.includes(r)?'checked':''}>${r}</label>`).join('')}</div><p class="subtle">메인 힐러는 힐 가능, 활 역할은 원거리에도 포함됩니다.</p><div class="form-grid"><label class="field">주무기<select data-build="primary">${options(C.WEAPONS,b.primary)}</select></label><label class="field">보조무기<select data-build="secondary">${options(C.WEAPONS,b.secondary,'없음 / 미정')}</select></label><label class="field">이동 타입<select data-build="movement">${options(C.MOVEMENTS,b.movement)}</select></label><label class="field">최종직<select data-build="finalClass">${options(D.classes.map(j=>[j.id,j.name]),b.finalClass)}</select></label></div><div id="build-job-actions">${buildJobActions(b)}</div><label class="field">중간 전직 경로<input data-build="path" value="${esc(b.path)}" maxlength="3000" placeholder="병사 → 기갑 타조병 → 가디언 → 홀리 랜서"></label><div id="path-links" class="path-links">${pathLinks(b.path)}</div><label class="field">육성 메모<textarea data-build="notes" maxlength="20000" rows="4" placeholder="우선 훈련할 적성, 장비, 이번 회차의 목표…">${esc(b.notes)}</textarea></label><p class="subtle">입력한 내용은 즉시 자동 저장됩니다.</p>`;
}
function buildJobActions(b){return `<div class="inline-actions" style="margin:0 0 18px">${b.finalClass?`<button data-job="${b.finalClass}" data-for="${b.characterId}">병종 수치·조건 보기</button>${button('apply-class','병종의 이동 타입 적용','class="quiet"')}`:button('browse-classes','병종 찾아보기')}<span class="subtle">무기·역할은 직접 지정</span></div>`;}
function pathLinks(path){return path.split(/→|->|,|＞|>/).map(n=>{const j=D.classes.find(j=>j.name.replace(/\s/g,'')===n.trim().replace(/\s/g,''));return j?`<button data-job="${j.id}" data-for="${detailId}">${e(j.name)} ↗</button>`:'';}).join('');}
function openDetail(id){if(!isVisible(id))return;detailId=id;detailRoute=route;renderDetail();showDialog('#detail-dialog');}
function showClass(id,forId){
 const j=jobs.get(id);if(!j)return;const c=chars.get(forId)||chars.get(detailId),allowed=c&&C.visible(c,state)?c:null;
 $('#class-dialog').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">CLASS / ${e(j.tier)}</p><h2 id="class-title">${e(j.name)}</h2></div><button class="icon-button" data-close="class-dialog" aria-label="병종 정보 닫기">×</button></div><div class="dialog-body"><div class="class-facts"><div class="fact"><span>이동 타입</span>${e(j.movementType||'미수록')}</div><div class="fact"><span>기본 이동력 / 이동 보정</span>${j.movement??'미수록'} / ${fmt(j.movementBonus)}</div><div class="fact"><span>사용 가능 무기·마법</span>${e(j.weapons.join(' · ')||'자료에 미기재')}</div></div><p class="subtle">이동력은 캐릭터 특성·장비를 제외한 보완 자료 값입니다. 보정치와 구분해 확인하세요.</p><h3>${allowed?e(allowed.name)+'와 성장률 비교':'병종 성장률·능력치 보정'}</h3>${allowed?growthTable(allowed,j):''}<table class="growth-table" style="margin-top:14px"><thead><tr><th>능력치</th><th>병종 성장률 %p</th><th>실제 능력치 보정</th></tr></thead><tbody>${C.STATS.map(([k,n])=>`<tr><th>${n}</th><td>${fmt(j.growth[k])}</td><td>${fmt(j.modifiers?.[k])}</td></tr>`).join('')}</tbody></table><p class="subtle">성장률 보정은 레벨 성장에, 능력치 보정은 해당 병종의 능력치에 적용되는 서로 다른 수치입니다.</p><div class="section-label">전직 요구 조건</div><p class="class-skills">${e(j.requirements||'미수록')}${j.restrictions?'\n'+e(j.restrictions):''}</p><div class="section-label">마스터 스킬</div><p class="class-skills">${e(j.master||'미수록')}</p><details><summary class="subtle">병종 스킬 펼치기</summary><p class="class-skills">${e(j.skills.join('\n')||'자료에 기재된 항목 없음')}</p></details><p class="subtle" style="margin-top:18px">조건과 수치: cass07 · 사용 무기와 이동 타입: redfreshet.<br>자료가 상충할 수 있어 전직 직전에는 게임 화면을 확인하세요.</p></div><div class="dialog-foot"><span>스토리 해금 조건은 표시하지 않습니다.</span><button data-close="class-dialog">닫기</button></div>`;
 showDialog('#class-dialog');
}
function utility(title,body,foot=''){$('#utility-dialog').innerHTML=`<div class="dialog-head"><h2 id="utility-title">${title}</h2><button class="icon-button" data-close="utility-dialog" aria-label="닫기">×</button></div><div class="dialog-body">${body}</div>${foot?`<div class="dialog-foot">${foot}</div>`:''}`;showDialog('#utility-dialog');}
function settings(){utility('백업 및 설정',`<section class="settings-section"><h3>스포일러 보호</h3><p>기본 공개: 1·2부 합류가 확인된 인물과 Excel 명단. 합류 시점 미확인 인물도 숨깁니다. 스토리 설명과 신장직은 앱에 표시하지 않습니다.</p><label><input id="spoilers-toggle" type="checkbox" ${state.settings.spoilers?'checked':''}>전체 캐릭터 공개</label><p>공개를 해제하면 후반 인물의 이름이 나타날 수 있습니다. 다시 보호해도 기존 편성과 메모는 보존됩니다.</p></section><section class="settings-section"><h3>편성 백업</h3><p>루트별 빌드, 메모, 수정한 태그, 테마를 JSON 파일로 옮길 수 있습니다. 불러오기는 미리보기 후 적용됩니다.</p><div class="inline-actions">${button('export','↓ 데이터 내보내기','class="primary"')}${button('import','↑ 데이터 불러오기')}${corruptBackup?button('export-corrupt','복구용 저장 원본 내보내기'):''}</div><p>자동 저장: ${state.updatedAt?e(new Date(state.updatedAt).toLocaleString('ko-KR')):'아직 편집하지 않음'}</p></section><section class="settings-section"><h3>화면 모드</h3><button data-action="theme">${state.settings.theme==='dark'?'라이트 모드로 전환':'다크 모드로 전환'}</button></section><h3>초기 편성</h3><p>Excel 명단으로 되돌립니다. 직접 작성한 빌드와 메모는 사라집니다. 먼저 JSON으로 백업해주세요.</p>${button('reset-confirm','초기 편성으로 되돌리기','class="danger"')}`);}
function exportFile(value,name){const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function exportState(){exportFile({...state,exportedAt:new Date().toISOString()},`만자천홍-편성-${new Date().toISOString().slice(0,10)}.json`);toast('편성 백업 파일을 내보냈습니다.');}
function sources(){utility('자료 안내',`<p>게임을 하며 빠르게 확인하기 위한 개인용 플래너입니다. 캐릭터·병종 이름은 한국어 자료원 표기를 우선합니다.</p><ul class="source-list"><li><a href="https://cass07.github.io/fe18-db/" target="_blank" rel="noopener noreferrer">cass07 · 만자천홍 데이터베이스</a><br>캐릭터 성장률, 개인·유니크 특성, 병종 성장률, 능력치 보정, 전직 요구치, 마스터 스킬</li><li><a href="https://redfreshet.com/game-tools/fe-banshisenko/" target="_blank" rel="noopener noreferrer">redfreshet · FE万紫千紅 攻略ツール</a><br>특기·약점, 병종의 사용 가능 무기, 이동 타입·이동력, 1·2부 합류 여부</li><li>파엠.xlsx · Sheet1<br>각 열의 첫 셀을 루트 주인공으로 포함. 카이 11명 / 디트리히 13명 / 세오도라 11명 / 레다 8명. 역할과 직업은 Excel에 없어 미정으로 시작합니다.</li></ul><p class="info-strip">자료 기준: ${D.version}. 자료원 링크는 외부 사이트의 스포일러 제한을 보장하지 않습니다.</p><h3>자동 집계 기준</h3><p>캐릭터의 참고 태그와 편성 역할은 별개입니다. 역할은 복수 선택, 무기는 주·보조에서 같은 종류를 한 명당 한 번, 이동 타입·최종직은 한 개씩 집계합니다. 메인 힐러는 힐 가능, 활 역할은 원거리에도 포함됩니다.</p><p>성장률 태그는 수치 기준, 시너지 태그는 특성 키워드로 생성합니다. 수정은 캐릭터 전체에 적용되며 루트별 역할은 따로 저장됩니다. 필터의 물리·마법은 성장률 40 이상 또는 지정 역할, 활·이동·힐러는 특기 또는 지정 빌드를 참고합니다.</p><h3>자료 한계</h3><p>빈 값은 미수록으로 표시합니다. 전직 가능 여부나 습득 마법을 자동 확정하지 않습니다. 사용 무기·이동력 보완 자료와 주 자료원의 불일치가 있을 수 있습니다. 플레이 전에 게임 내 수치를 확인해주세요.</p><h3>저장</h3><p>서버 전송 없이 이 브라우저에만 자동 저장합니다. 브라우저·기기·실행 주소가 달라지면 저장소가 달라지므로 JSON 백업을 이용하세요. 파일 직접 열기에서도 동작하지만 브라우저별 저장 정책은 다를 수 있습니다.</p>`);}
function showComparison(){
 compare=compare.filter(isVisible);if(compare.length<2){toast('비교할 캐릭터를 2명 이상 선택해주세요.');return;}
 utility('후보 캐릭터 비교',`<p class="subtle">캐릭터의 원래 성장률을 나란히 확인합니다. 병종 보정과 부대 역할은 포함하지 않습니다.</p><div class="compare-grid" style="grid-template-columns:repeat(${compare.length},minmax(0,1fr))">${compare.map(id=>{const c=chars.get(id);return `<section class="candidate"><h3>${e(c.name)}</h3><div class="chips" style="margin-bottom:14px">${C.tags(c,state).map(t=>`<span class="tag">${e(t)}</span>`).join('')}</div>${growthTable(c)}<p class="subtle" style="margin-top:12px">특기: ${e(c.strengths?.join(' · ')||'기재된 항목 없음')}<br>약점: ${e(c.weaknesses?.join(' · ')||'기재된 항목 없음')}</p>${traitDetails(c)}<button data-add="${id}" ${getBuild(route,id)?'disabled':''} style="margin-top:12px">${current().name} ${getBuild(route,id)?'배정됨':'부대에 추가'}</button></section>`;}).join('')}</div>`,`${button('clear-compare','비교 선택 초기화')}<button data-close="utility-dialog">닫기</button>`);
}
function browseClasses(){utility('병종 찾아보기',`<p class="subtle">병종을 눌러 성장률·능력치 보정과 전직 조건을 확인하세요.</p>${[1,2,3,4,5].map(rank=>`<h3>${D.classes.find(j=>j.rank===rank)?.tier||''}</h3><div class="name-list">${D.classes.filter(j=>j.rank===rank).map(j=>`<button data-job="${j.id}" data-for="${detailId||''}">${e(j.name)}</button>`).join('')}</div>`).join('')}`);}
document.addEventListener('click',ev=>{
 const b=ev.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.close){closeDialog(document.getElementById(b.dataset.close));return;}
 if(b.dataset.view){setView(b.dataset.view);return;}
 if(b.dataset.route){route=b.dataset.route;setView('planner');return;}
 if(b.dataset.pane){setPane(b.dataset.pane);return;}
 if(b.dataset.character){openDetail(b.dataset.character);return;}
 if(b.dataset.add){add(b.dataset.add);if($('#utility-dialog').open&&compare.length>=2&&$('#utility-title').textContent==='후보 캐릭터 비교')showComparison();return;}
 if(b.dataset.remove){remove(b.dataset.remove);return;}
 if(b.dataset.move){move(b.dataset.move,Number(b.dataset.direction));return;}
 if(b.dataset.compare){const id=b.dataset.compare;if(compare.includes(id))compare=compare.filter(x=>x!==id);else if(compare.length<3)compare.push(id);else{toast('후보는 한 번에 3명까지 비교할 수 있습니다.');return;}renderCatalog();if($('#detail-dialog').open)renderDetail();return;}
 if(b.dataset.detailRoute){detailRoute=b.dataset.detailRoute;renderDetail();return;}
 if(b.dataset.detailAdd){add(b.dataset.detailAdd,detailRoute);renderDetail();return;}
 if(b.dataset.detailRemove){remove(b.dataset.detailRemove,detailRoute);return;}
 if(b.dataset.job){showClass(b.dataset.job,b.dataset.for);return;}
 if(b.dataset.quick){filterTag=filterTag===b.dataset.quick?'':b.dataset.quick;renderFilters();renderCatalog();return;}
 const action=b.dataset.action;
 if(action==='theme'){state.settings.theme=state.settings.theme==='dark'?'light':'dark';save();setTheme();if($('#utility-dialog').open&&$('#utility-title').textContent==='백업 및 설정')settings();}
 else if(action==='settings')settings();
 else if(action==='undo')undo();
 else if(action==='sources')sources();
 else if(action==='export')exportState();
 else if(action==='export-corrupt')exportFile(corruptBackup,'만자천홍-저장원본-복구용.json');
 else if(action==='import'){$('#import-file').value='';$('#import-file').click();}
 else if(action==='compare')showComparison();
 else if(action==='clear-compare'){compare=[];renderCatalog();closeDialog($('#utility-dialog'));if($('#detail-dialog').open)renderDetail();}
 else if(action==='browse-classes')browseClasses();
 else if(action==='focus-search'){setPane('catalog');$('#search').focus();$('#catalog').scrollIntoView({behavior:'smooth',block:'start'});}
 else if(action==='filters'){$('#filters').hidden=!$('#filters').hidden;b.setAttribute('aria-expanded',String(!$('#filters').hidden));}
 else if(action==='reset-filters'){Object.keys(f).forEach(k=>f[k]=k==='assignment'?'all':'');filterTag='';$('#search').value='';$('#assignment-filter').value='all';renderFilters();renderCatalog();}
 else if(action==='save-tags'){const t=$('#tag-edit').value.split(',').map(s=>s.trim()).filter(Boolean);if(t.length>30||t.some(t=>t.length>80)){toast('태그는 30개, 태그 하나는 80자까지 저장할 수 있습니다.');return;}state.characterTags[detailId]=[...new Set(t)];save();render();renderDetail();toast('캐릭터 태그를 저장했습니다.');}
 else if(action==='reset-tags'){delete state.characterTags[detailId];save();render();renderDetail();}
 else if(action==='apply-class'){const build=getBuild(detailRoute,detailId),j=jobs.get(build.finalClass);if(j?.movementType){build.movement=j.movementType;save();render();renderDetail();toast('병종의 이동 타입을 적용했습니다.');}}
 else if(action==='reset-confirm')utility('초기 편성으로 되돌릴까요?','<p>현재 빌드·메모·수정 태그를 지우고 Excel의 명단으로 되돌립니다.</p><p>필요하다면 먼저 현재 편성을 내보내주세요.</p>',`${button('export','현재 편성 내보내기')}${button('reset-apply','초기화 적용','class="danger"')}`);
 else if(action==='reset-apply'){undoState=C.clone(state);state=C.initial(D);corruptBackup=null;save();compare=[];closeDialog($('#utility-dialog'));closeDialog($('#detail-dialog'));render();toast('초기 편성으로 되돌렸습니다.',true);}
 else if(action==='spoilers-confirm'){state.settings.spoilers=true;save();render();settings();}
 else if(action==='import-apply'&&pendingImport){undoState=C.clone(state);state=pendingImport;pendingImport=null;state.settings.spoilers=false;corruptBackup=null;compare=[];detailId=null;closeDialog($('#detail-dialog'));closeDialog($('#class-dialog'));closeDialog($('#utility-dialog'));save();render();toast('백업을 불러왔습니다. 스포일러 보호는 켜진 상태입니다.');}
});
document.addEventListener('input',ev=>{
 const t=ev.target;
 if(t.id==='search'){f.q=t.value;renderCatalog();}
 if(t.dataset.filter){f[t.dataset.filter]=t.value;renderCatalog();}
 if(t.dataset.build&&t.tagName!=='SELECT'){const b=getBuild(detailRoute,detailId);if(!b)return;b[t.dataset.build]=t.value;save();renderSquad();renderCatalog();if(t.dataset.build==='path')$('#path-links').innerHTML=pathLinks(b.path);}
});
document.addEventListener('change',ev=>{
 const t=ev.target;
 if(t.id==='assignment-filter'){f.assignment=t.value;renderCatalog();}
 if(t.dataset.filter){f[t.dataset.filter]=t.value;renderCatalog();}
 if(t.dataset.build&&t.tagName==='SELECT'){const b=getBuild(detailRoute,detailId);b[t.dataset.build]=t.value;save();render();if(t.dataset.build==='finalClass')$('#build-job-actions').innerHTML=buildJobActions(b);}
 if(t.dataset.role){const b=getBuild(detailRoute,detailId);b.roles=t.checked?[...new Set([...b.roles,t.dataset.role])]:b.roles.filter(r=>r!==t.dataset.role);save();render();}
 if(t.id==='spoilers-toggle'){
  if(t.checked){t.checked=false;utility('전체 캐릭터를 공개할까요?','<p>후반에 합류하거나 합류 시점이 확인되지 않은 인물의 이름·특성이 목록과 비교 화면에 나타납니다.</p><p>이 선택은 설정에서 언제든 되돌릴 수 있습니다.</p>',`${button('settings','보호 유지')}${button('spoilers-confirm','전체 공개','class="primary"')}`);}
  else{state.settings.spoilers=false;compare=compare.filter(isVisible);save();render();closeDialog($('#detail-dialog'));closeDialog($('#class-dialog'));settings();}
 }
});
$('#import-file').addEventListener('change',async ev=>{
 const file=ev.target.files[0];if(!file)return;
 try{if(file.size>2_000_000)throw new Error('백업 파일은 2MB 이하만 불러올 수 있습니다.');const value=JSON.parse(await file.text());pendingImport=C.validateState(value,D);const count=D.routes.map(r=>`<span>${r.name} ${pendingImport.routes[r.id].length}명</span>`).join('');utility('백업 불러오기 미리보기',`<p>현재 편성을 아래 파일의 편성으로 교체합니다.</p><p>${esc(file.name)}</p><div class="backup-preview">${count}</div><p>빌드·메모·태그를 함께 복원합니다. 스포일러 보호는 켜진 상태로 적용되며 숨겨진 편성은 보존됩니다.</p>`,`${button('export','현재 편성 먼저 내보내기')}${button('import-apply','이 백업 적용','class="primary"')}`);}
 catch(err){pendingImport=null;utility('불러올 수 없습니다',`<p>${esc(err instanceof SyntaxError?'JSON 형식이 올바르지 않습니다. 현재 편성은 유지됩니다.':err.message)}</p>`);}
});
document.addEventListener('dragstart',ev=>{const row=ev.target.closest('[data-drag]');if(!row)return;ev.dataTransfer.setData('text/plain',row.dataset.drag);ev.dataTransfer.effectAllowed='copyMove';});
$('#squad').addEventListener('dragover',ev=>{ev.preventDefault();$('#squad').classList.add('dragover');});
$('#squad').addEventListener('dragleave',ev=>{if(!$('#squad').contains(ev.relatedTarget))$('#squad').classList.remove('dragover');});
$('#squad').addEventListener('drop',ev=>{
 ev.preventDefault();$('#squad').classList.remove('dragover');const id=ev.dataTransfer.getData('text/plain');if(!isVisible(id))return;
 const target=ev.target.closest('[data-drag]')?.dataset.drag;
 if(!getBuild(route,id))add(id);
 if(target&&target!==id){const list=state.routes[route],from=list.findIndex(b=>b.characterId===id),to=list.findIndex(b=>b.characterId===target);if(from>=0&&to>=0){list.splice(to,0,list.splice(from,1)[0]);save();render();}}
});
document.addEventListener('keydown',ev=>{
 const typing=/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName);
 if(ev.key==='/'&&!typing&&!$('dialog[open]')){ev.preventDefault();setView('planner');setPane('catalog');$('#search').focus();}
 if((ev.ctrlKey||ev.metaKey)&&ev.key==='z'&&!typing&&undoState){ev.preventDefault();undo();}
});
$$('dialog').forEach(d=>d.addEventListener('click',ev=>{if(ev.target!==d)return;const r=d.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)d.close();}));
window.addEventListener('storage',ev=>{if(ev.key===KEY&&ev.newValue){$('#storage-warning').hidden=false;$('#storage-warning').textContent='다른 탭에서 편성이 변경되었습니다. 이 탭의 편성을 내보낸 뒤 새로고침하면 최신 저장을 읽을 수 있습니다.';}});
for(const r of D.routes)$('#assignment-filter').insertAdjacentHTML('beforeend',`<option value="route:${r.id}">${r.name} 배정</option>`);
renderFilters();render();
})();
