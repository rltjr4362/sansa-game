"use strict";
const Temple = (() => {
  const W=46, H=38, key=(x,y)=>y*W+x;
  function random(seed){
    return ()=>{ seed=(Math.imul(1664525,seed)+1013904223)>>>0; return seed/4294967296; };
  }
  function land(x,y){
    if(x<0 || y<0 || x>=W || y>=H) return false;
    const rim=1.04+.045*Math.sin(y*1.2+x*.4);
    const hill=(cx,cy,rx,ry)=>((x-cx)/rx)**2+((y-cy)/ry)**2<rim;
    return hill(11.6,10.4,12.4,11.2)||hill(30,13,14.8,9.2)||
      hill(17,25,13.5,11.5)||hill(32,24,9.4,9.8);
  }
  const halls=[
    {name:'대웅전',x:7,y:4,w:7,d:5,h:2.25,room:'shrine'},
    {name:'관음전',x:2,y:6,w:5,d:4,h:1.7,room:'shrine'},
    {name:'산신각',x:14,y:1,w:4,d:3,h:1.65,room:'shrine'},
    {name:'요사채',x:4,y:13,w:4,d:2,h:1.36},
    {name:'종루',x:16,y:14,w:3,d:2,h:2.06,open:true},
    {name:'산문',x:10,y:18,w:3,d:1,h:1.63,open:true,gate:true},
    {name:'농막',x:30,y:6,w:4,d:2,h:1.22,plain:true},
    {name:'산객당',x:8,y:22,w:7,d:4,h:1.65,room:'lodge',plain:true},
    {name:'공양간',x:19,y:24,w:5,d:4,h:1.63,room:'kitchen',plain:true},
    {name:'선방',x:28,y:20,w:7,d:4,h:1.66,room:'zen',plain:true}
  ];
  const beds=[26,31,36].map(x=>({x,y:11,w:4,d:4,access:[x+2,15]}));
  const inBed=(x,y)=>beds.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.d);
  const guestStops={
    gate:[[11,20],[12,20]],lodge:[[10,24],[12,24]],zen:[[30,22],[32,22]],kitchen:[[20,26],[22,26]]
  };
  function water(x,y){
    const dx=(x-18.5)/2.9,dy=(y-9)/2.1;
    return dx*dx+dy*dy<1;
  }
  function road(x,y){
    return (x>=7&&x<=14&&y>=9&&y<=13)||(x>=10&&x<=12&&y>=13&&y<=20)||
      (y===11&&x>=3&&x<=17)||(x===6&&y>=10&&y<=16)||(y===16&&x>=5&&x<=18)||
      (x===15&&y>=4&&y<=14)||(y===5&&x>=12&&x<=16)||(x===18&&y>=11&&y<=13)||
      (y===12&&x>=14&&x<=25)||(x===25&&y>=9&&y<=24)||
      (y>=15&&y<=16&&x>=25&&x<=40)||(y===9&&x>=25&&x<=38)||(x===34&&y>=8&&y<=15)||
      (x>=11&&x<=12&&y>=19&&y<=22)||(y===22&&x>=11&&x<=26)||
      (x===15&&y>=17&&y<=29)||(y>=26&&y<=27&&x>=9&&x<=19)||
      (y===29&&x>=14&&x<=31)||(x>=20&&x<=24&&y===28)||
      (y>=24&&y<=25&&x>=25&&x<=33)||(x===28&&y>=24&&y<=29);
  }
  const props=[];
  function prop(kind,x,y,size=1){props.push({kind,x,y,size,seed:(x*431+y*109+173)>>>0});}
  for(const [x,y] of [[8,10],[13,10],[10,17],[12,17],[15,5]]) prop('lantern',x,y);
  prop('pagoda',14,13);
  prop('well',28,9);prop('jar',24,26,1.1);prop('jar',25,26,.86);prop('jar',24,27,.78);
  prop('scarecrow',39,10);prop('lantern',9,26);prop('lantern',33,24);
  const scatter=random(38171);
  const forbidden=(x,y)=>halls.some(b=>x>=b.x-1&&x<=b.x+b.w&&y>=b.y-1&&y<=b.y+b.d);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(!land(x,y)||road(x,y)||water(x,y)||inBed(x,y)||forbidden(x,y)||props.some(p=>p.x===x&&p.y===y))continue;
    const edge=!land(x-2,y)||!land(x+2,y)||!land(x,y-2)||!land(x,y+2);
    const n=scatter();
    if(n<(edge?.38:.16)){
      const species=scatter();
      prop(species<.49?'pine':species<.83?'maple':'gold',x,y,.63+scatter()*.6);
    }else if(n<.51&&edge)prop('rock',x,y,.5+scatter()*.7);
  }
  const blocked=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)blocked[key(x,y)]=Number(!land(x,y)||water(x,y)||inBed(x,y)||(y===20&&!road(x,y)));
  for(const b of halls)for(let y=b.y;y<b.y+b.d;y++)for(let x=b.x;x<b.x+b.w;x++){
    const edge=x===b.x||x===b.x+b.w-1||y===b.y||y===b.y+b.d-1;
    const door=x===Math.floor(b.x+b.w/2)&&y===b.y+b.d-1;
    blocked[key(x,y)]=b.room?Number(edge&&!door):Number(!b.gate||x!==11);
  }
  for(const p of props)blocked[key(p.x,p.y)]=1;
  const walkable=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&!blocked[key(x,y)];
  // A* on tile centres. Four neighbours keep the robe clear of diagonal corners.
  function route(sx,sy,tx,ty){
    if(!walkable(sx,sy)||!walkable(tx,ty))return null;
    const start=key(sx,sy),end=key(tx,ty), costs=new Float64Array(W*H).fill(Infinity);
    const parent=new Int16Array(W*H).fill(-1),open=[{id:start,f:0}];
    costs[start]=0;
    while(open.length){
      open.sort((a,b)=>b.f-a.f);
      const id=open.pop().id, x=id%W,y=Math.floor(id/W);
      if(id===end){
        const steps=[];
        for(let k=end;k!==start;k=parent[k])steps.push([k%W+.5,Math.floor(k/W)+.5]);
        return steps.reverse();
      }
      for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
        if(!walkable(nx,ny))continue;
        const k=key(nx,ny),g=costs[id]+(road(nx,ny)?1:1.8);
        if(g>=costs[k])continue;
        costs[k]=g;parent[k]=id;open.push({id:k,f:g+Math.abs(tx-nx)+Math.abs(ty-ny)});
      }
    }
    return null;
  }
  // A visit ends at a walkable approach tile. Facing is in world space.
  const visits=[
    ['산문','산문을 지나 뜰로', 'idle',[[11,16]],-Math.PI/2],
    ['대웅전','아침저녁 독송','chant',[[10,7]],-Math.PI/2],
    ['앞마당','낙엽 쓸기','sweep',[[10,12],[12,13],[8,12]],.5],
    ['연못가','물결 바라보기','look',[[18,12],[16,11]],-Math.PI/2],
    ['관음전','두 손 모아 기도','pray',[[4,8]],-Math.PI/2],
    ['산신각','산신각에서 합장','pray',[[16,2]],-Math.PI/2],
    ['대웅전','불상 앞 방석에서 절하기','bow',[[10,7]],-Math.PI/2],
    ['요사채','툇마루 곁에서 쉼','rest',[[6,15],[7,15]],Math.PI/2],
    ['솔숲길','솔바람 듣기','look',[[8,16],[13,16]],Math.PI/2],
    ['들밭','밭고랑에 씨 뿌리기','sow',beds.map(b=>b.access),-Math.PI/2],
    ['들밭','어린 싹에 물 주기','water',beds.map(b=>b.access),-Math.PI/2],
    ['들밭','잘 익은 채소 거두기','harvest',beds.map(b=>b.access),-Math.PI/2],
    ['산객당','템플스테이 손님 맞이','welcome',[[11,24]],Math.PI/2],
    ['선방','손님과 함께 좌선','guided',[[31,22]],Math.PI/2],
    ['공양간','손님에게 공양 차리기','meal',[[21,26]],Math.PI/2],
    ['산객당','객실 마루 쓸기','housekeeping',[[12,24]],-Math.PI/2],
    ['솔숲길','선방 가는 길 쓸기','sweep',[[25,22],[26,24]],.52],
    ['선방','방석에 앉아 좌선하기','sit',[[31,22]],Math.PI/2]
  ];
  const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
  const turn=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
  const texts=[
    {title:'관음정근',lines:['관세음보살','관세음보살']},
    {title:'반야심경',lines:['색불이공 공불이색','색즉시공 공즉시색']},
    {title:'금강경 · 사구게',lines:['일체유위법 여몽환포영','여로역여전 응작여시관']}
  ];
  const lineSeconds=4.5;
  function passage(s){
    const e=s.encounter;
    if(e?.kind==='greet')return {title:'스님',line:e.reply};
    if(!e&&!(s.phase==='act'&&['chant','pray'].includes(visits[s.id][2])))return null;
    const text=texts[e?e.text:s.reading],age=e?e.age:s.age;
    const part=Math.min(text.lines.length-1,Math.floor(age/lineSeconds));
    return {title:text.title,line:text.lines[part],part};
  }
  function animals(seed){
    const rng=random(seed),pick=a=>a[Math.floor(rng()*a.length)];
    const yard=[2,3,7,8].flatMap(id=>visits[id][3]);
    const dog={x:10.5,y:12.5,face:0,step:0,rest:2,path:[],visitor:null};
    const white={...dog,x:12.5,path:[],white:true},cat={...dog,x:7.5,y:15.5,path:[],cat:true};
    const group={kind:'idle',age:0,pair:false},cone={x:white.x,y:white.y,visible:false,age:0};
    let nextPlay=5,catSpot='',quietVisit=0,waterBreak=false;
    function go(a,goal){
      const first=a.path[0],start=first||[a.x,a.y],steps=route(Math.floor(start[0]),Math.floor(start[1]),...goal);
      if(!steps)return false;
      a.path=first?[first,...steps]:steps;return true;
    }
    function advance(a,dt,pace){
      if(!a.path.length)return;
      const [x,y]=a.path[0],dx=x-a.x,dy=y-a.y,len=Math.hypot(dx,dy),dist=Math.min(len,dt*pace);
      a.face+=turn(a.face,Math.atan2(dy,dx))*Math.min(1,dt*9);a.step+=dist*9;
      if(dist>=len){a.x=x;a.y=y;a.path.shift();}else{a.x+=dx/len*dist;a.y+=dy/len*dist;}
    }
    function beside(a){
      const x=Math.floor(a.x),y=Math.floor(a.y);
      return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].find(([i,j])=>walkable(i,j));
    }
    function scene(kind,pair=false){group.kind=kind;group.pair=pair;group.age=0;}
    function roll(){
      const x=Math.floor(white.x),y=Math.floor(white.y);
      const dest=[[0,1],[1,0],[0,-1],[-1,0]].find(([dx,dy])=>walkable(x+dx,y+dy)&&walkable(x+2*dx,y+2*dy))||[0,0];
      Object.assign(cone,{fromX:white.x,fromY:white.y,toX:x+.5+dest[0]*2,toY:y+.5+dest[1]*2,age:0,visible:true,x:white.x,y:white.y});
      go(white,[Math.floor(cone.toX),Math.floor(cone.toY)]);scene('cone');
    }
    function companions(dt,s){
      const rain=s.rain>.45,med=[13,17].includes(s.id)&&s.phase!=='pause'&&!s.encounter;
      const busy=dog.visitor||s.meeting;
      if(quietVisit>0){quietVisit=Math.max(0,quietVisit-dt);cat.pose=quietVisit>5?'listen':quietVisit>2?'blink':'nuzzle';}
      else{
        const spot=rain?'eave':med?'mat':s.clock<630?'sunrise':s.clock<950?'stone':s.clock<1130?'shade':'porch';
        if(spot!==catSpot){
          const goal={eave:[6,15],mat:[28,26],sunrise:[12,26],stone:[11,16],shade:[13,16],porch:[7,15]}[spot];
          go(cat,goal);catSpot=spot;cat.stretch=1.4;
        }
        cat.stretch=Math.max(0,(cat.stretch||0)-dt);
        cat.pose=cat.stretch?'stretch':cat.path.length?'walk':'loaf';
        if(!cat.stretch)advance(cat,dt,1.2);
      }
      if(busy&&group.pair){scene('idle');nextPlay=s.time+10;}
      if(!white.request&&((rain&&group.kind!=='rain')||(med&&!rain&&group.kind!=='meditate'))){
        scene(rain?'rain':'meditate',!busy);go(white,rain?[7,15]:[29,25]);
        if(!busy)go(dog,rain?[5,15]:s.id===13?[31,25]:[28,28]);
      }else if((group.kind==='rain'&&!rain)||(group.kind==='meditate'&&!med)){
        if(group.kind==='meditate')dog.tapUntil=s.time+2;
        scene('idle');nextPlay=s.time+3;
      }
      if(group.kind==='idle'&&s.time>=nextPlay&&!busy){
        const goal=beside(dog);if(goal){go(white,goal);dog.path=dog.path.slice(0,1);scene('invite',true);}
      }
      const fast=group.kind==='chase';
      advance(white,dt,fast?2.7:1.55);
      if(group.pair&&!busy)advance(dog,dt,fast?2.4:1.55);
      white.pose=white.path.length?'walk':group.kind;dog.pose=group.pair&&!busy&&!dog.path.length?group.kind:'';
      if(cone.visible){
        cone.age+=dt;const u=smooth(Math.min(1,cone.age/1.8));cone.x=cone.fromX+(cone.toX-cone.fromX)*u;cone.y=cone.fromY+(cone.toY-cone.fromY)*u;
      }
      if(white.path.length||(group.pair&&dog.path.length))return;
      group.age+=dt;
      if(group.kind==='invite'&&group.age>2){
        if(rng()<.7){go(white,[12,13]);go(dog,[12,12]);scene('chase',true);waterBreak=false;}
        else{roll();go(dog,[Math.floor(white.x),Math.floor(white.y)]);}
      }else if(fast&&!waterBreak){go(white,[18,12]);go(dog,[17,12]);waterBreak=true;}
      else if(fast){scene('drink',true);}
      else if(group.kind==='drink'&&group.age>3){scene('rest',true);}
      else if(group.kind==='cone'&&group.age>3){
        if(rng()<.5){go(white,[Math.floor(cone.fromX),Math.floor(cone.fromY)]);scene('return');}
        else scene('rest');
      }else if(group.kind==='return'){cone.x=white.x;cone.y=white.y;scene('rest');}
      else if(group.kind==='rest'&&group.age>11){white.request=false;cone.visible=false;scene('idle');nextPlay=s.time+10+rng()*18;}
      white.shake=group.kind==='rain'&&group.age<2;
      if(group.kind==='rain'&&group.age>1&&group.age<1+dt&&catSpot==='eave'&&!quietVisit)go(cat,[6,16]);
    }
    function visit(kind){
      if(kind==='sitCat'){quietVisit=8;return;}
      white.request=true;roll();
    }
    const perches=[[8.5,12.5,.05],[13.5,11.5,.05],[16.5,11.5,.05],
      ...props.filter(p=>p.kind==='pine').map(p=>[p.x+.5,p.y+.5,1.92*p.size])];
    const birds=[0,1,2].map(i=>({x:perches[i][0],y:perches[i][1],z:perches[i][2],spot:perches[i],age:0,wait:1+i*2,flight:0,face:i}));
    function tick(dt,meeting,s){
      companions(dt,s);
      if(dog.visitor){
        const v=dog.visitor;v.age+=dt;
        dog.face+=turn(dog.face,v.age<v.duration-.5?v.face:v.returnFace)*Math.min(1,dt*8);
        if(v.age>=v.duration){dog.face=v.returnFace;dog.visitor=null;}
      }else if(!meeting&&group.pair){
        // The pair follows the shared scene until both have reached their marks.
      }else if(dog.path.length){
        const [x,y]=dog.path[0],dx=x-dog.x,dy=y-dog.y,len=Math.hypot(dx,dy),dist=Math.min(len,dt*1.6);
        dog.face+=turn(dog.face,Math.atan2(dy,dx))*Math.min(1,dt*12);
        dog.x+=dx/len*dist;dog.y+=dy/len*dist;dog.step+=dist*9;
        if(dist>=len){dog.x=x;dog.y=y;dog.path.shift();if(!dog.path.length)dog.rest=3+5*rng();}
      }else if(!meeting&&(dog.rest-=dt)<=0){
        const x=Math.floor(dog.x),y=Math.floor(dog.y),goal=pick(yard.filter(p=>p[0]!==x||p[1]!==y));
        dog.path=route(x,y,...goal);
      }
      for(const b of birds){
        b.age+=dt;
        if(!b.flight){
          if(b.age<b.wait)continue;
          const nearby=perches.filter(p=>{const dist=Math.hypot(p[0]-b.x,p[1]-b.y);return dist>5&&dist<18;});
          b.to=pick(nearby.length?nearby:perches.filter(p=>p!==b.spot));b.age=0;
          b.face=Math.atan2(b.to[1]-b.y,b.to[0]-b.x);b.heading=b.face;b.bank=(rng()-.5)*1.8;
          b.distance=Math.hypot(b.to[0]-b.x,b.to[1]-b.y);b.flight=1.2+b.distance*.32;
        }
        const t=Math.min(1,b.age/b.flight),u=.72*t+.28*smooth(t),arc=Math.sin(Math.PI*u)*b.bank;
        b.x=b.spot[0]+(b.to[0]-b.spot[0])*u-Math.sin(b.heading)*arc;
        b.y=b.spot[1]+(b.to[1]-b.spot[1])*u+Math.cos(b.heading)*arc;
        b.face=b.heading+Math.atan2(Math.PI*b.bank*Math.cos(Math.PI*u),b.distance);
        b.z=b.spot[2]+(b.to[2]-b.spot[2])*smooth(t)+Math.sin(t*Math.PI)*Math.min(2,b.distance*.12);
        if(t===1){b.spot=b.to;b.flight=0;b.wait=3+rng()*9;b.age=0;}
      }
    }
    return {dog,white,cat,birds,group,cone,visit,tick};
  }
  function create(seed=9301){
    const rng=random(seed);
    const s={x:11.5,y:19.5,face:-Math.PI/2,id:0,age:0,phase:'walk',time:0,
      clock:490,weather:'맑음',rain:0,mist:0,step:0,completed:0,path:[],deck:[],weatherLeft:58,
      animals:animals(seed^0x6815),encounter:null,meeting:null,reading:0,
      farm:beds.map((_,i)=>({stage:['soil','dry','ripe'][i],growth:i===2?1:0,since:[-12,-5,-25][i]})),
      bedIndex:null,harvests:0,pantry:0,retreat:{stage:'empty',people:[],next:6,dirty:false,stays:0}};
    const dog=s.animals.dog;
    const stay=s.retreat;
    let bowVisits=0,nextReading=0,requestedReading=1,nextMeeting=4,dutiesInRow=0,preferFarm=true;
    const daylight=()=>s.clock>=360&&s.clock<1080;
    function sendGuests(stop,stage){
      stay.stage=stage;
      stay.people.forEach((g,i)=>{
        g.path=route(Math.floor(g.x),Math.floor(g.y),...guestStops[stop][i]);
        if(!g.path)throw Error('손님이 도착할 수 없는 장소 '+stop);
      });
    }
    function updateValley(dt){
      for(const bed of s.farm){
        if(bed.stage!=='growing')continue;
        bed.growth=Math.min(1,bed.growth+dt*(daylight()?1:.25)*(1+.25*s.rain)/100);
        if(bed.growth===1){bed.stage='ripe';bed.since=s.time;}
      }
      if(stay.stage==='empty'){
        if(!stay.dirty&&s.time>=stay.next&&s.clock>=420&&s.clock<960){
          stay.people=guestStops.gate.map(([x,y],i)=>({x:x+.5,y:y+.5,path:[],face:0,step:0,pace:.97+i*.09}));
          sendGuests('lodge','arriving');
        }
        return;
      }
      if(stay.stage==='overnight'){
        if(s.time>=stay.next)sendGuests('gate','leaving');
        return;
      }
      if(!['arriving','toZen','toMeal','toBed','leaving'].includes(stay.stage))return;
      for(const g of stay.people){
        if(!g.path.length)continue;
        const [x,y]=g.path[0],dx=x-g.x,dy=y-g.y,len=Math.hypot(dx,dy),dist=Math.min(len,dt*g.pace);
        g.face+=turn(g.face,Math.atan2(dy,dx))*Math.min(1,dt*9);g.step+=dist*7;
        if(dist>=len){g.x=x;g.y=y;g.path.shift();}else{g.x+=dx/len*dist;g.y+=dy/len*dist;}
      }
      if(stay.people.some(g=>g.path.length))return;
      const arrived={arriving:'reception',toZen:'meditation',toMeal:'dining',toBed:'overnight',leaving:'empty'};
      stay.stage=arrived[stay.stage];stay.people.forEach(g=>g.face=-Math.PI/2);
      if(stay.stage==='overnight')stay.next=s.time+((s.clock<320?0:1440)+360-s.clock)/2;
      if(stay.stage==='empty'){stay.people=[];stay.dirty=true;stay.stays++;stay.next=s.time+60;}
    }
    function nextDuty(){
      const guestJob=stay.dirty?15:({reception:12,meditation:13,dining:14})[stay.stage];
      const ready=s.farm.map((bed,i)=>({bed,i})).filter(({bed})=>bed.stage!=='growing')
        .sort((a,b)=>a.bed.since-b.bed.since);
      if(daylight()&&ready.length&&(guestJob===undefined||preferFarm)){
        const {bed,i}=ready[0];s.bedIndex=i;preferFarm=false;
        plan(({soil:9,dry:10,ripe:11})[bed.stage],beds[i].access);return true;
      }
      if(guestJob!==undefined){preferFarm=true;plan(guestJob);return true;}
      return false;
    }
    function finishDuty(){
      if(s.bedIndex!==null){
        const bed=s.farm[s.bedIndex];
        if(s.id===9)bed.stage='dry';
        if(s.id===10){bed.stage='growing';bed.growth=0;}
        if(s.id===11){bed.stage='soil';bed.growth=0;s.harvests++;s.pantry=Math.min(12,s.pantry+2);}
        bed.since=s.time;s.bedIndex=null;
      }
      if(s.id===12)sendGuests('zen','toZen');
      if(s.id===13)sendGuests('kitchen','toMeal');
      if(s.id===14){s.pantry=Math.max(0,s.pantry-1);sendGuests('lodge','toBed');}
      if(s.id===15)stay.dirty=false;
    }
    function endMeeting(){
      if(!s.meeting)return;
      s.face=s.meeting.returnFace;s.meeting=null;dog.rest=1.5;
      nextMeeting=s.time+42+rng()*24;
    }
    function tryMeeting(){
      if(s.time<nextMeeting||dog.visitor||s.animals.group.pair||s.phase!=='act'||s.age<.5||
        !['idle','look','rest'].includes(visits[s.id][2]))return;
      // Finish a step already in progress before taking a new route.
      const step=dog.path[0],from=step||[dog.x,dog.y],mx=Math.floor(s.x),my=Math.floor(s.y);
      const paths=[[mx+1,my],[mx-1,my],[mx,my+1],[mx,my-1]]
        .map(([x,y])=>route(Math.floor(from[0]),Math.floor(from[1]),x,y))
        .filter(p=>p!==null).sort((a,b)=>a.length-b.length);
      nextMeeting=s.time+5;
      if(!paths.length||paths[0].length>13)return;
      dog.path=step?[step,...paths[0]]:paths[0];
      s.meeting={phase:'approach',age:0,returnFace:s.face};
    }
    s.touchDog=(kind,facing)=>{
      if(dog.visitor||!['pet','sniff'].includes(kind))return false;
      endMeeting();
      dog.visitor={kind,age:0,duration:kind==='pet'?4.8:3.8,face:facing,returnFace:dog.face};
      nextMeeting=Math.max(nextMeeting,s.time+12);
      return true;
    };
    s.interact=(kind,facing)=>{
      if(s.encounter||!['greet','recite'].includes(kind))return false;
      endMeeting();
      const greeting=s.weather==='가랑비'?'비가 옵니다. 처마 아래서 쉬어 가세요.':
        s.clock<350||s.clock>1100?'밤공기가 차네요. 평안한 밤 보내세요.':'반갑습니다. 마당에서 잠시 쉬어 가세요.';
      s.encounter={kind,age:0,duration:kind==='greet'?4.5:lineSeconds*2,face:facing,returnFace:s.face,reply:greeting,text:requestedReading};
      if(kind==='recite')requestedReading=requestedReading===1?2:1;
      return true;
    };
    function phase(name){s.phase=name;s.age=0;}
    function plan(id,access){
      s.id=id;
      const targets=visits[id][3], [tx,ty]=access||targets[Math.floor(rng()*targets.length)];
      s.path=route(Math.floor(s.x),Math.floor(s.y),tx,ty);
      if(!s.path)throw new Error('접근할 수 없는 장소 '+visits[id][0]);
      s.stride=.93+rng()*.16; phase(s.path.length?'walk':'orient'); 
    }
    function choose(){
      if(s.id===0){s.deck=[2,3,4,5,6,7,8,16,17];dutiesInRow=0;plan(1);return;}
      if(dutiesInRow<2&&nextDuty()){dutiesInRow++;return;}
      dutiesInRow=0;
      if(!s.deck.length){plan(0);return;}
      const daylight=s.clock>=350&&s.clock<1100;
      function preference(id){
        const [x,y]=visits[id][3][0],outside=[2,3,8].includes(id);
        let score=rng()*3-Math.hypot(s.x-x-.5,s.y-y-.5)*.09;
        if(outside)score+=daylight?1:-1;
        if(s.weather==='가랑비')score+=outside?-2:1;
        if(!daylight&&id===7)score+=1.5;
        return score;
      }
      const scores=s.deck.map(preference),i=scores.indexOf(Math.max(...scores));
      plan(s.deck.splice(i,1)[0]);
    }
    plan(0);
    s.tick=dt=>{
      s.time+=dt;s.clock=(s.clock+dt*2)%1440;s.animals.tick(dt,s.meeting,s);updateValley(dt);
      s.weatherLeft-=dt;
      if(s.weatherLeft<=0){
        const states=['맑음','옅은 안개','가랑비'].filter(v=>v!==s.weather);
        s.weather=states[Math.floor(rng()*2)];s.weatherLeft=55+rng()*50;
      }
      const blend=1-Math.exp(-dt/5);
      s.rain+=((s.weather==='가랑비'?1:0)-s.rain)*blend;
      s.mist+=((s.weather==='옅은 안개'?1:0)-s.mist)*blend;
      if(s.encounter){
        const e=s.encounter;e.age+=dt;
        s.face+=turn(s.face,e.age<e.duration-.7?e.face:e.returnFace)*Math.min(1,dt*6);
        if(e.age>=e.duration){s.face=e.returnFace;s.encounter=null;}
        return;
      }
      if(!s.meeting)tryMeeting();
      if(s.meeting){
        const m=s.meeting,dir=Math.atan2(dog.y-s.y,dog.x-s.x);
        s.face+=turn(s.face,dir)*Math.min(1,dt*6);m.age+=dt;
        if(m.phase==='approach'&&!dog.path.length){m.phase='pet';m.age=0;}
        if(m.phase==='pet'){
          dog.face+=turn(dog.face,dir+Math.PI)*Math.min(1,dt*8);
          if(m.age>=5.2)endMeeting();
        }
        return;
      }
      s.age+=dt;
      if(s.phase==='walk'){
        const [nx,ny]=s.path[0],dx=nx-s.x,dy=ny-s.y,len=Math.hypot(dx,dy);
        const speed=s.stride*(.6+.4*Math.min(1,s.age*2,s.path.length===1?len*2+.15:1));
        const dist=Math.min(len,dt*speed);
        s.face+=turn(s.face,Math.atan2(dy,dx))*Math.min(1,dt*10);
        s.x+=dx/len*dist;s.y+=dy/len*dist;s.step+=dist*7.8;
        if(dist>=len){s.x=nx;s.y=ny;s.path.shift();if(!s.path.length)phase('orient');}
      }else if(s.phase==='orient'){
        s.face+=turn(s.face,visits[s.id][4])*Math.min(1,dt*5);
        if(s.age>=1.1){
          phase('act');const kind=visits[s.id][2];
          s.duration=5+rng()*5;
          if(kind==='bow'){s.bowGoal=bowVisits++%3===1?108:3;s.duration=s.bowGoal*3.2;}
          if(kind==='chant'||kind==='pray'){s.reading=nextReading;nextReading=(nextReading+1)%texts.length;s.duration=lineSeconds*2;}
        }
      }else if(s.phase==='act'&&s.age>=s.duration){
        finishDuty();s.completed++;phase('pause');s.duration=1.2+rng()*1.6;
      }else if(s.phase==='pause'&&s.age>=s.duration)choose();
    };
    return s;
  }
  return {W,H,land,water,road,halls,props,beds,guestStops,walkable,route,visits,create,random,smooth,turn,passage};
})();

export { Temple };
