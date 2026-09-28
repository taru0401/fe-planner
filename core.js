(function (root) {
  'use strict';
  const STATS = [['hp','HP'],['str','힘'],['mg','마력'],['dex','기술'],['spd','속도'],['lck','행운'],['def','수비'],['res','마방'],['cha','매력']];
  const ROLES = ['전열','물리딜','마법딜','활','원거리','탱커','힐 가능','메인 힐러','지원'];
  const WEAPONS = ['검','창','도끼','활','격투','흑마법','백마법'];
  const MOVEMENTS = ['보병','기병','비행','중장'];
  const clone = x => JSON.parse(JSON.stringify(x));
  const blankBuild = id => ({characterId:id,roleLabel:'',roles:[],primary:'',secondary:'',movement:'',finalClass:'',path:'',notes:''});
  function initial(data) {
    return {schemaVersion:1,dataVersion:data.version,updatedAt:null,settings:{theme:'light',spoilers:false},routes:Object.fromEntries(data.routes.map(r=>[r.id,r.initial.map(blankBuild)])),characterTags:{}};
  }
  function visible(c,state) { return !!(state.settings.spoilers || c.excelKnown || (c.availablePart && c.availablePart<=2)); }
  function growthTags(c) {
    const g=c.growth,t=[];
    if(g.str>=35&&g.spd>=50)t.push('고속 물리');
    if(g.str>=40&&g.def>=40)t.push('물리 딜탱');
    if(g.mg>=45)t.push('마법 딜러');
    if(g.res>=45)t.push('마법탱');
    if(g.str>=35&&g.mg>=35)t.push('하이브리드');
    if(g.dex>=50)t.push('고기술/필살형');
    if(g.cha>=45)t.push('지원형');
    return t;
  }
  function synergyTags(c) {
    const s=c.personal+' '+c.unique,t=[];
    const rules=[['기병 시너지',/기병|기마|기승|탑승|말에/],['비행 시너지',/비행|천익/],['활 시너지',/활을|활로|활 장비|활 공격|활 사용|활 명중/],['필살',/필살/],['추격',/추격/],['회복',/회복|치유/],['전열 지원',/인접|주위|주변|아군/],['마법 시너지',/마법|마력/]];
    for(const [tag,re] of rules)if(re.test(s))t.push(tag);
    return t;
  }
  function tags(c,state) {return Object.hasOwn(state.characterTags,c.id)?state.characterTags[c.id]:[...growthTags(c),...synergyTags(c)];}
  function buildRoles(b) {
    const r=new Set(b.roles);
    if(r.has('메인 힐러'))r.add('힐 가능');
    if(r.has('활'))r.add('원거리');
    return [...r];
  }
  function analyze(builds) {
    const roles=Object.fromEntries(ROLES.map(x=>[x,0])), weapons=Object.fromEntries(WEAPONS.map(x=>[x,0])), movement=Object.fromEntries(MOVEMENTS.map(x=>[x,0])),classes={};
    let unconfigured=0;
    for(const b of builds){
      buildRoles(b).forEach(r=>roles[r]++);
      new Set([b.primary,b.secondary].filter(Boolean)).forEach(w=>weapons[w]++);
      if(b.movement)movement[b.movement]++;
      if(b.finalClass)(classes[b.finalClass]??=[]).push(b.characterId);
      if(!b.roles.length||!b.primary||!b.movement||!b.finalClass)unconfigured++;
    }
    return {total:builds.length,roles,weapons,movement,classes,unconfigured,missing:{roles:builds.filter(b=>!b.roles.length).length,weapons:builds.filter(b=>!b.primary&&!b.secondary).length,movement:builds.filter(b=>!b.movement).length,classes:builds.filter(b=>!b.finalClass).length}};
  }
  function validateState(raw,data) {
    const fail=()=>{throw new Error('지원하지 않거나 손상된 편성 파일입니다. 현재 편성은 유지됩니다.');};
    if(!raw||raw.schemaVersion!==1||!raw.routes||!raw.settings||!raw.characterTags)fail();
    const clean=initial(data), chars=new Set(data.characters.map(c=>c.id)), jobs=new Set(data.classes.map(c=>c.id));
    const str=(s,max)=>{if(typeof s!=='string'||s.length>max)fail();return s;};
    const one=(s,options)=>{if(!['',...options].includes(s))fail();return s;};
    for(const r of data.routes){
      const list=raw.routes[r.id];
      if(!Array.isArray(list)||list.length>chars.size)fail();
      const seen=new Set();
      clean.routes[r.id]=list.map(b=>{
        if(!b||!chars.has(b.characterId)||seen.has(b.characterId))fail();seen.add(b.characterId);
        if(!Array.isArray(b.roles)||b.roles.some(r=>!ROLES.includes(r))||b.roles.length>ROLES.length)fail();
        return {characterId:b.characterId,roleLabel:str(b.roleLabel,150),roles:[...new Set(b.roles)],primary:one(b.primary,WEAPONS),secondary:one(b.secondary,WEAPONS),movement:one(b.movement,MOVEMENTS),finalClass:one(b.finalClass,[...jobs]),path:str(b.path,3000),notes:str(b.notes,20000)};
      });
    }
    if(typeof raw.characterTags!=='object'||Array.isArray(raw.characterTags))fail();
    clean.characterTags={};
    for(const [id,t] of Object.entries(raw.characterTags)){
      if(!chars.has(id)||!Array.isArray(t)||t.length>30)fail();
      clean.characterTags[id]=[...new Set(t.map(x=>str(x,80)))];
    }
    clean.settings.theme=one(raw.settings.theme,['light','dark'])||'light';
    if(typeof raw.settings.spoilers!=='boolean')fail();
    clean.settings.spoilers=raw.settings.spoilers;
    clean.updatedAt=typeof raw.updatedAt==='string'?raw.updatedAt:null;
    return clean;
  }
  const API={STATS,ROLES,WEAPONS,MOVEMENTS,clone,blankBuild,initial,visible,growthTags,synergyTags,tags,buildRoles,analyze,validateState};
  root.PlannerCore=API;
  if(typeof module!=='undefined')module.exports=API;
})(globalThis);
