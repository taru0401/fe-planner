(function (root) {
  'use strict';
  const STATS = [['hp','HP'],['str','힘'],['mg','마력'],['dex','기술'],['spd','속도'],['lck','행운'],['def','수비'],['res','마방'],['cha','매력']];
  const ROLES = ['전열','물리딜','마법딜','활','원거리','탱커','힐 가능','메인 힐러','지원'];
  const WEAPONS = ['검','창','도끼','활','격투','흑마법','백마법'];
  const MOVEMENTS = ['보병','기병','비행','중장'];
  // Parts 1-2 are played per route and reach advanced classes (rank 4); part 3 is one shared army.
  const PART2_MAX_RANK = 4;
  const SQUADS = 5;
  const SQUAD_SIZE = 8;
  const FINAL_SIZE = 25;
  const SCHEMA = 2;
  const clone = x => JSON.parse(JSON.stringify(x));
  // mounts: family -> mount id chosen for that family ('' = explicitly none); only used on the Kai route and in part 3.
  const blankBuild = id => ({characterId:id,roleLabel:'',roles:[],primary:'',secondary:'',movement:'',finalClass:'',path:'',notes:'',mounts:{}});
  // squad 0 is the bench; 1-5 are part-3 squads. final marks the final-chapter lineup.
  const blankPart3 = id => ({...blankBuild(id),squad:0,final:false});
  // Missing weapon data is unknown, not an empty equipment allowance.
  function classWeapons(job) {
    const known=WEAPONS.filter(w=>job?.weapons?.includes(w));
    return known.length?known:[...WEAPONS];
  }
  function applyClass(build,job) {
    build.finalClass=job?.id||'';
    build.movement=MOVEMENTS.includes(job?.movementType)?job.movementType:'';
    const allowed=classWeapons(job),cleared=[];
    for(const field of ['primary','secondary'])if(build[field]&&!allowed.includes(build[field])){cleared.push(build[field]);build[field]='';}
    return cleared;
  }
  function initial(data) {
    return {schemaVersion:SCHEMA,dataVersion:data.version,updatedAt:null,settings:{theme:'light',spoilers:false},routes:Object.fromEntries(data.routes.map(r=>[r.id,r.initial.map(blankBuild)])),part3:[],characterTags:{}};
  }
  // sideStory: part-1 side-story leads who join in part 3; their names are already known by then.
  function visible(c,state) { return !!(state.settings.spoilers || c.excelKnown || c.sideStory || (c.availablePart && c.availablePart<=2)); }
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
  // Version 1 had no part 3. Master classes chosen there move to the part-3 build of that character.
  function migrate1(raw,data) {
    const rank=new Map(data.classes.map(j=>[j.id,j.rank]));
    const part3=[];
    for(const r of data.routes)for(const b of Array.isArray(raw.routes?.[r.id])?raw.routes[r.id]:[]){
      if(!b||!(rank.get(b.finalClass)>PART2_MAX_RANK))continue;
      if(!part3.some(x=>x.characterId===b.characterId))part3.push({...blankPart3(b.characterId),roleLabel:b.roleLabel,roles:b.roles,primary:b.primary,secondary:b.secondary,movement:b.movement,finalClass:b.finalClass});
      b.finalClass='';
    }
    return {...raw,schemaVersion:SCHEMA,part3};
  }
  function validateState(raw,data) {
    const fail=()=>{throw new Error('지원하지 않거나 손상된 편성 파일입니다. 현재 편성은 유지됩니다.');};
    if(raw&&raw.schemaVersion===1)raw=migrate1(clone(raw),data);
    if(!raw||raw.schemaVersion!==SCHEMA||!raw.routes||!raw.settings||!raw.characterTags||!Array.isArray(raw.part3))fail();
    const clean=initial(data), chars=new Set(data.characters.map(c=>c.id)), jobs=new Set(data.classes.map(c=>c.id));
    const str=(s,max)=>{if(typeof s!=='string'||s.length>max)fail();return s;};
    const one=(s,options)=>{if(!['',...options].includes(s))fail();return s;};
    const build=(b,seen)=>{
      if(!b||!chars.has(b.characterId)||seen.has(b.characterId))fail();seen.add(b.characterId);
      if(!Array.isArray(b.roles)||b.roles.some(r=>!ROLES.includes(r))||b.roles.length>ROLES.length)fail();
      const mounts={};
      if(b.mounts&&typeof b.mounts==='object'&&!Array.isArray(b.mounts))for(const [k,v] of Object.entries(b.mounts).slice(0,10))if(typeof v==='string'&&k.length<=20&&v.length<=20)mounts[k]=v;
      return {characterId:b.characterId,mounts,roleLabel:str(b.roleLabel,150),roles:[...new Set(b.roles)],primary:one(b.primary,WEAPONS),secondary:one(b.secondary,WEAPONS),movement:one(b.movement,MOVEMENTS),finalClass:one(b.finalClass,[...jobs]),path:str(b.path??'',3000),notes:str(b.notes,20000)};
    };
    for(const r of data.routes){
      const list=raw.routes[r.id];
      if(!Array.isArray(list)||list.length>chars.size)fail();
      const seen=new Set();
      clean.routes[r.id]=list.map(b=>build(b,seen));
    }
    if(raw.part3.length>chars.size)fail();
    const seen3=new Set(),filled=Array(SQUADS+1).fill(0);let finals=0;
    clean.part3=raw.part3.map(b=>{
      const x=build(b,seen3);
      let squad=Number.isInteger(b.squad)&&b.squad>=0&&b.squad<=SQUADS?b.squad:0;
      if(squad&&filled[squad]>=SQUAD_SIZE)squad=0;
      filled[squad]++;
      const final=b.final===true&&finals<FINAL_SIZE;
      if(final)finals++;
      return {...x,squad,final};
    });
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
  const API={STATS,ROLES,WEAPONS,MOVEMENTS,PART2_MAX_RANK,SQUADS,SQUAD_SIZE,FINAL_SIZE,clone,blankBuild,blankPart3,classWeapons,applyClass,initial,visible,buildRoles,analyze,validateState};
  root.PlannerCore=API;
  if(typeof module!=='undefined')module.exports=API;
})(globalThis);
