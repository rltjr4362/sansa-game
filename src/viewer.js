import { Temple } from './world.js';
import { well } from './player.js';

export function createViewer(land,Scene,sim,visitor,play){
  const app=land.closest('main');
  const nodes=new Map([...app.querySelectorAll('[id]')].map(node=>[node.id,node]));
  const el=id=>nodes.get(id);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused=false,auto=!reduced,subs=true,speed=1,view=0,angle=Math.PI/4,start=angle,end=angle;
  let cameraAge=2.6,autoAge=0,idle=0,prevTime=null,lastPaint=-100,needsPaint=true;
  let zoom=1,targetZoom=1,voiceOn=false,voice=null,spoken='';
  const synth=window.speechSynthesis,target=el('monkTarget'),dogTarget=el('dogTarget');
  let selected=target,playing=true;
  const whiteTarget=el('whiteTarget'),catTarget=el('catTarget'),actors=[target,dogTarget,whiteTarget,catTarget],keys=['monk','dog','white','cat'];
  function localVoice(){
    voice=synth?.getVoices().find(v=>v.localService&&/^ko(?:[-_]|$)/i.test(v.lang));
    if(!voice)voiceOn=false;
    el('voice').disabled=!voice;options();
  }
  function speak(p){
    const key=voiceOn&&voice&&p&&!paused&&!document.hidden&&p.title!=='스님'?[p.title,p.part,p.line].join('/'):'';
    if(key===spoken)return;
    spoken=key;synth?.cancel();
    if(key){
      const u=new SpeechSynthesisUtterance(p.line);u.voice=voice;u.lang=voice.lang;u.rate=.86;u.volume=.55;synth.speak(u);
    }
  }
  const bearings=['남동','남서','북서','북동'],speeds=[1,1.5,2,.75];
  const districts={farm:{x:32,y:12}};
  const roomKeys={'대웅전':'mainHall','관음전':'mercy','산신각':'mountain','선방':'zen','공양간':'kitchen','산객당':'lodge'};
  for(const b of Temple.halls)if(b.room)districts[roomKeys[b.name]]={x:b.x+b.w/2,y:b.y+b.d/2,room:b.name};
  const crops=['배추','무','당근'],bedLabels={soil:'빈 고랑',dry:'물 줄 때',growing:'자라는 중',ripe:'수확할 때'};
  const stayLabels={empty:'다음 손님을 기다리는 중',arriving:'산문에서 올라오는 중',reception:'산객당에서 접수 대기',toZen:'선방으로 가는 길',meditation:'선방에서 좌선 준비',toMeal:'공양간으로 가는 길',dining:'공양간에서 공양 대기',toBed:'숙소로 돌아가는 길',overnight:'산객당에서 하룻밤',leaving:'산문으로 내려가는 길'};
  function label(id,value){const node=el(id);if(node.textContent!==value)node.textContent=value;}
  function options(){
    for(const [id,on] of [['auto',auto],['subs',subs]]){
      el(id).setAttribute('aria-pressed',String(on));el(id).querySelector('b').textContent=on?'켜짐':'꺼짐';
    }
    el('speed').querySelector('b').textContent=speed+'×';
    el('play').setAttribute('aria-label',paused?'재생':'일시정지');label('play',paused?'▶':'Ⅱ');
    label('bearing',bearings[view]);
    el('voice').setAttribute('aria-pressed',String(voiceOn));el('voice').querySelector('b').textContent=voice?(voiceOn?'켜짐':'꺼짐'):'한국어 음성 없음';
  }
  function rotate(delta,manual){
    if(playing)return;
    if(manual)auto=false;
    view=(view+delta+4)%4;start=angle;
    // Camera position moves from southeast to southwest with decreasing azimuth.
    const target=Math.PI/4-view*Math.PI/2;
    end=start+Temple.turn(start,target);
    cameraAge=reduced?2.6:0;autoAge=0;needsPaint=true;options();
  }
  function status(){
    const time=Math.floor(sim.clock),v=Temple.visits[sim.id];
    label('clock',[Math.floor(time/60),time%60].map(n=>String(n).padStart(2,'0')).join(':'));
    label('weather',sim.weather);
    if(playing){
      const possessed=play.actor()===sim;
      label('place',possessed?'스님 조종 중':'방문객');
      label('activity',possessed?'WASD 이동 · Shift 달리기 · Q 해제 · Tab 관찰':'WASD 이동 · Shift 달리기 · Space 상호작용 · Q 빙의 · Tab 관찰');
    }else observationStatus(v);
    const passage=Temple.passage(sim),p=play.speech()||passage;
    el('chant').hidden=!p||(!subs&&p.title!=='스님');
    if(p){label('source',p.title);label('words',p.line);}speak(passage);
    const region=el('region').value,note=el('regionNote');note.hidden=playing||!districts[region];
    if(!note.hidden)label('regionNote',region==='farm'?sim.farm.map((bed,i)=>crops[i]+' · '+bedLabels[bed.stage]).join('　'):
      (['mainHall','mercy','mountain'].includes(region)?(sim.phase==='act'&&v[0]===districts[region].room?v[1]:'고요한 법당'):(sim.retreat.dirty?'퇴실 후 청소를 기다리는 중':stayLabels[sim.retreat.stage])));
  }
  function observationStatus(v){
    const passage=Temple.passage(sim);
    label('place',sim.phase==='walk'?'발걸음 · '+v[0]:v[0]);
    if(sim.encounter)label('place','스님과의 만남');
    label('activity',sim.encounter?(sim.encounter.kind==='greet'?'합장 인사':passage.title+' 독송'):sim.phase==='walk'?'다음 일과 · '+v[1]:sim.phase==='pause'?'잠시 숨 고르기':sim.phase==='orient'?'옷매무새 가다듬기':v[1]);
    if(!sim.encounter&&sim.id===6&&sim.phase==='act')label('activity',(sim.bowGoal===108?'108배':'삼배')+' · '+Math.min(sim.bowGoal,Math.floor(sim.age/3.2)+1)+'번째 절');
    if(sim.meeting){
      label('place','스님과 강아지');label('activity',sim.meeting.phase==='pet'?'머리를 쓰다듬는 중':'강아지를 기다리는 중');
    }
    const visitor=sim.animals.dog.visitor;
    const animal=observedActor();
    if(animal===sim.animals.white||animal===sim.animals.cat){
      const cat=animal===sim.animals.cat,poses={walk:'사뿐사뿐 걷는 중',loaf:'앞발을 접고 쉬는 중',stretch:'길게 기지개 켜기',listen:'귀를 기울이는 중',blink:'천천히 눈인사',nuzzle:'손등에 볼을 비비는 중',idle:'마당 둘러보기',invite:'앞발을 낮춰 놀이 청하기',chase:'황구와 마당 달리기',cone:'솔방울 따라가기',return:'솔방울 물고 돌아오기',drink:'물 마시기',rest:'숨을 고르며 쉬는 중',rain:'처마 아래 비 피하기',meditate:'스님 곁에서 기다리기'};
      label('place',cat?'고양이':'백구');label('activity',poses[cat?sim.animals.cat.pose:sim.animals.group.kind]||'잠시 쉬는 중');
    }
    if(visitor){
      label('place','강아지와의 만남');label('activity',visitor.kind==='pet'?'꼬리를 살랑살랑 흔들어요':'손끝에 코를 대고 냄새를 맡아요');
    }
    if(!sim.encounter&&!visitor&&sim.phase==='act'){
      if(sim.bedIndex!==null)label('place',crops[sim.bedIndex]+'밭');
      if(sim.id===14&&sim.pantry>0)label('activity','거둔 채소로 공양 차리기');
    }
  }
  const customOption=new Option('자유 시점','custom');
  customOption.disabled=true;el('region').add(customOption);
  let focus=null,heldRoom=null;
  const cast=()=>[sim,sim.animals.dog,sim.animals.white,sim.animals.cat];
  function observedActor(){
    if(playing)return null;
    const key=focus?.key??el('region').value;
    const index=keys.indexOf(key);
    if(index>=0)return cast()[index];
    return el('meet').hidden?null:cast()[actors.indexOf(selected)];
  }
  function subjects(){
    const result=cast().map((obj,i)=>({key:keys[i],...Scene.position(obj,[.56,.31,.31,.25][i])}));
    sim.animals.birds.forEach((b,i)=>result.push({key:b,name:'새 '+(i+1),...Scene.position(b,b.z)}));
    if(sim.retreat.stage!=='overnight')sim.retreat.people.forEach((g,i)=>result.push({key:g,name:'템플스테이 손님 '+(i+1),...Scene.position(g,.52)}));
    return result.concat(Scene.smallSubjects);
  }
  function cursorPoint(x,y){
    const bounds=app.getBoundingClientRect();
    return {x:(x-bounds.left)/bounds.width,y:(y-bounds.top)/bounds.height};
  }
  function pickFocus(at,snap){
    const r=land.getBoundingClientRect(),box=app.getBoundingClientRect();
    const px=box.left+at.x*box.width,py=box.top+at.y*box.height;
    const point={x:(px-r.left)/r.width,y:(py-r.top)/r.height};
    let nearest=null,radius=Math.min(46,Math.max(25,box.width*.029));
    if(snap)for(const obj of subjects()){
      if(obj.visible===false)continue;
      const distance=Math.hypot((obj.x-point.x)*r.width,(obj.y-point.y)*r.height);
      if(distance<radius){nearest=obj;radius=distance;}
    }
    heldRoom=districts[el('region').value]?.room||heldRoom;
    focus={key:nearest?.key,point:nearest||point,at:{...at}};
    const index=keys.indexOf(nearest?.key);
    if(index>=0)el('region').value=keys[index];
    else{customOption.text=nearest?nearest.name+' 따라가기':'자유 시점';el('region').value='custom';}
    if(nearest)heldRoom=null;
  }
  function setZoom(value){
    targetZoom=Math.max(1,Math.min(4.5,value));label('zoomLevel',Math.round(targetZoom*100)+'%');
    if(targetZoom===1){el('region').value='all';focus=null;heldRoom=null;}
    el('zoomOut').disabled=targetZoom<=1;el('zoomIn').disabled=targetZoom>=4.5;needsPaint=true;
  }
  function zoomAt(value,at,choose=true){
    if(value<targetZoom-.0001){if(choose||focus?.key!=null||!focus)pickFocus(at,false);}
    else if(value>targetZoom+.0001&&choose&&focus?.key==null)pickFocus(at,true);
    setZoom(value);
  }
  el('region').onchange=()=>{
    const value=el('region').value;
    focus=null;heldRoom=null;
    if(keys.includes(value)){
      focus={key:value,at:{x:.5,y:.5},point:Scene.position(sim)};
    }
    meet(false);setZoom(value==='all'?1:districts[value]?.room?3.5:districts[value]?2.35:3);wake();
  };
  function screenPoint(point){
    return {x:point.x*cameraScale+panX,y:point.y*cameraScale+panY};
  }
  function frameSubjects(){
    const monk=Scene.position(sim),dog=Scene.position(sim.animals.dog,.31),district=districts[el('region').value];
    const white=Scene.position(sim.animals.white,.31),cat=Scene.position(sim.animals.cat,.25);
    if(!playing&&focus?.key!=null){
      const subject=subjects().find(obj=>obj.key===focus.key);
      if(subject)focus.point=subject;
      else{focus.key=null;customOption.text='자유 시점';el('region').value='custom';}
    }
    const p=playing?Scene.position(play.actor(),.45):focus?.point||(district?Scene.position(district,0):monk);
    const at=playing?center():focus?.at||center();
    const z=cameraScale=playing?2.5:zoom,offset=(n,a)=>Math.min(0,Math.max(1-z,a-n*z));
    panX=offset(p.x,at.x);panY=offset(p.y,at.y);
    land.style.transform=z===1?'none':'translate('+panX*100+'%,'+panY*100+'%) scale('+z+')';
    if(playing)return;
    const size=monk.size*app.clientWidth*z;
    for(const [node,pos,w,h] of [[target,monk,.65,1.2],[dogTarget,dog,1,.74],[whiteTarget,white,1,.74],[catTarget,cat,.72,.64]]){
      const point=screenPoint(pos);
      node.style.left=(point.x*100)+'%';node.style.top=(point.y*100)+'%';
      node.style.width=Math.max(36,size*w)+'px';node.style.height=Math.max(36,size*h)+'px';
    }
  }
  let cameraScale=1,panX=0,panY=0,audioCtx=null,soundOn=false,soundAt=0;
  let musicOn=false,musicBus,ambientBus,breeze,windFilter,nextNote=0,noteIndex=0,phrase=0;
  const phrases=[
    [62,66,69,71,69,66],[64,66,69,66,64,62],
    [59,62,64,66,64,59],[57,62,66,64,62,57]
  ];
  function makeAudio(){
    const Audio=window.AudioContext||window.webkitAudioContext;
    audioCtx=new Audio();
    musicBus=audioCtx.createGain();ambientBus=audioCtx.createGain();
    for(const bus of [musicBus,ambientBus]){bus.gain.value=0;bus.connect(audioCtx.destination);}
    // Low-pass filtered noise supplies both the soft wind and the brighter rain bed.
    const n=audioCtx.sampleRate*4,buffer=audioCtx.createBuffer(1,n,audioCtx.sampleRate),data=buffer.getChannelData(0);
    let brown=0;
    for(let i=0;i<n;i++){
      const white=Math.random()*2-1;brown=.975*brown+.025*white;
      data[i]=(brown*3+white*.20)*Math.min(1,i/1500,(n-1-i)/1500);
    }
    const air=audioCtx.createBufferSource();air.buffer=buffer;air.loop=true;
    windFilter=audioCtx.createBiquadFilter();windFilter.type='lowpass';windFilter.frequency.value=520;windFilter.Q.value=.55;
    breeze=audioCtx.createGain();breeze.gain.value=.11;
    air.connect(windFilter);windFilter.connect(breeze);breeze.connect(ambientBus);air.start();
  }
  function levels(){
    if(!audioCtx)return;
    for(const [bus,on,id] of [[musicBus,musicOn,'musicLevel'],[ambientBus,soundOn,'ambientLevel']]){
      bus.gain.setTargetAtTime(on?Number(el(id).value)/100:0,audioCtx.currentTime,.035);
    }
  }
  function syncAudio(){
    if(!audioCtx)return;
    const run=(musicOn||soundOn)&&!paused&&!document.hidden;
    (run?audioCtx.resume():audioCtx.suspend()).catch(()=>{});
  }
  for(const id of ['music','ambient']){
    const button=el(id);button.disabled=!(window.AudioContext||window.webkitAudioContext);
    button.onclick=()=>{
      if(!audioCtx)makeAudio();
      if(id==='music'){musicOn=!musicOn;nextNote=audioCtx.currentTime+.08;}else soundOn=!soundOn;
      const on=id==='music'?musicOn:soundOn;
      button.setAttribute('aria-pressed',String(on));button.querySelector('b').textContent=on?'켜짐':'꺼짐';
      levels();syncAudio();
    };
    el(id+'Level').oninput=levels;
  }
  function pluck(midi,start,amp,length){
    const hz=440*2**((midi-69)/12);
    for(const [multiple,strength,decay] of [[1,1,1],[2,.25,.53],[3,.09,.32]]){
      const osc=audioCtx.createOscillator(),g=audioCtx.createGain(),end=start+length*decay;
      osc.frequency.value=hz*multiple;g.gain.value=.00001;
      g.gain.setValueAtTime(.00001,start);g.gain.exponentialRampToValueAtTime(amp*strength,start+.045);
      g.gain.exponentialRampToValueAtTime(.00001,end);osc.connect(g);g.connect(musicBus);
      osc.onended=()=>{osc.disconnect();g.disconnect();};osc.start(start);osc.stop(end+.02);
    }
  }
  function landscapeAudio(){
    if(!audioCtx||paused||document.hidden||audioCtx.state!=='running')return;
    const now=audioCtx.currentTime;
    if(soundOn){
      windFilter.frequency.setTargetAtTime(470+sim.rain*2150+100*Math.sin(now*.14),now,.7);
      breeze.gain.setTargetAtTime(.105+.035*Math.sin(now*.21)+sim.rain*.18,now,.8);
    }
    if(!musicOn||now+.10<nextNote)return;
    const start=Math.max(now+.025,nextNote),midi=phrases[phrase][noteIndex];
    const night=sim.clock<360||sim.clock>=1140;
    pluck(midi,start,night?.095:.12,2.9);
    pluck(midi,start+.32,.019,2.1);
    if(noteIndex===0)pluck(midi-12,start+.07,.065,4.5);
    nextNote=start+[1.25,1.8,1.4,2.35,1.5,4.8][noteIndex]*(night?1.2:1);
    if(++noteIndex===6){noteIndex=0;phrase=(phrase+1)%phrases.length;}
  }
  function ambientTick(){
    if(!soundOn||paused||document.hidden||sim.time<soundAt)return;
    const {cat,white,dog,group}=sim.animals;
    const purr=observedActor()===cat&&zoom>1.5&&['nuzzle','blink','loaf'].includes(cat.pose);
    const drink=group.kind==='drink',paws=[white,dog,cat].find(a=>a.path.length&&a.y>=14&&a.y<16&&a.x<9);
    const drip=sim.rain>.4,source=purr?cat:drink?white:paws||{x:6.5,y:15.5};
    soundAt=sim.time+(purr?.8:drink?.65:paws?1.1:2.8);
    if(!purr&&!drink&&!paws&&!drip)return;
    const point=screenPoint(Scene.position(source,.3)),distance=Math.hypot(point.x-.5,point.y-.5);
    const volume=Math.max(0,1-distance*2.5)*(purr?.045:.027);if(!volume)return;
    const now=audioCtx.currentTime,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
    osc.type=purr?'triangle':'sine';const hz=purr?48:drink?530:paws?155:1070,duration=purr?.52:.15;
    osc.frequency.setValueAtTime(hz,now);osc.frequency.exponentialRampToValueAtTime(hz*(purr?.85:.52),now+duration);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(volume+.0001,now+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(gain);gain.connect(ambientBus);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start();osc.stop(now+duration);
  }
  function speechPosition(){
    const bubble=el('chant');if(bubble.hidden)return;
    const point=screenPoint(Scene.position(sim,1.95));
    const width=app.clientWidth,height=app.clientHeight,cx=point.x*width,head=point.y*height;
    if(cx<0||cx>width||head<2||head>height){bubble.hidden=true;return;}
    const left=Math.max(4,Math.min(width-bubble.offsetWidth-4,cx-12));
    bubble.style.left=left+'px';bubble.style.top=Math.max(bubble.offsetHeight+5,head)+'px';
    bubble.style.setProperty('--tip',Math.max(5,Math.min(bubble.offsetWidth-12,cx-left))+'px');
  }
  function interactionPosition(){
    const marker=el('interaction'),who=playing&&!paused&&!play.dialogueOpen()?play.target():null;
    marker.hidden=!who;
    if(!who)return;
    const point=screenPoint(Scene.position(who==='monk'?sim:{x:well.x+.5,y:well.y+.5},who==='monk'?1.65:.95));
    marker.hidden=point.x<0||point.x>1||point.y<0||point.y>1;
    label('interaction',who==='monk'?'Space 말걸기':'Space 물 긷기');
    marker.style.left=point.x*100+'%';marker.style.top=point.y*100+'%';
  }
  const center=()=>({x:.5,y:.5});
  let lastTap=null;
  el('zoomIn').onclick=()=>zoomAt(targetZoom+.5,lastTap||center());
  el('zoomOut').onclick=()=>zoomAt(targetZoom-.5,lastTap||center());
  const isWorld=node=>node===land||actors.includes(node);
  app.addEventListener('wheel',e=>{
    if(playing||!isWorld(e.target)||!e.deltaY)return;
    e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?app.clientHeight:1);
    zoomAt(targetZoom*Math.exp(-Math.max(-300,Math.min(300,delta))*.0025),cursorPoint(e.clientX,e.clientY));wake();
  },{passive:false});
  const fingers=new Map();let pinch=null,drag=null,ignoreTapUntil=0;
  function pinchGeometry(){
    const [a,b]=fingers.values();
    return {at:cursorPoint((a.x+b.x)/2,(a.y+b.y)/2),span:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
  }
  app.addEventListener('pointerdown',e=>{
    if(playing||!isWorld(e.target)||e.button!==0||fingers.size>=2)return;
    fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});e.target.setPointerCapture(e.pointerId);
    if(fingers.size===2){pinch={...pinchGeometry(),zoom:targetZoom,started:false};drag=null;}
    else drag={x:e.clientX,y:e.clientY,moved:false};
  });
  app.addEventListener('pointermove',e=>{
    if(!fingers.has(e.pointerId))return;
    fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch){
      const {at,span}=pinchGeometry(),value=pinch.zoom*span/pinch.span;
      if(!pinch.started&&Math.abs(span-pinch.span)<2)return;
      const decreasing=value<targetZoom-.0001;
      if(!pinch.started||decreasing&&focus?.key!=null){
        if(decreasing||focus?.key==null)pickFocus(pinch.started?at:pinch.at,!decreasing);
        pinch.started=true;
      }
      if(focus)focus.at=at;
      setZoom(value);
    }else if(drag&&targetZoom>1){
      if(!drag.moved){
        if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;
        pickFocus(cursorPoint(drag.x,drag.y),false);drag.moved=true;
      }
      focus.at=cursorPoint(e.clientX,e.clientY);needsPaint=true;
    }
  });
  function release(e){
    if(!fingers.has(e.pointerId))return;
    if(pinch||drag?.moved)ignoreTapUntil=performance.now()+550;
    else if(drag&&e.type==='pointerup'){
      lastTap=cursorPoint(e.clientX,e.clientY);
      if(targetZoom>1&&e.target===land){pickFocus(lastTap,true);needsPaint=true;}
    }
    fingers.delete(e.pointerId);pinch=null;drag=null;
  }
  for(const e of ['pointerup','pointercancel','lostpointercapture'])app.addEventListener(e,release);
  function wake(){idle=0;app.classList.remove('quiet');}
  for(const e of ['pointermove','pointerdown','keydown','focusin'])window.addEventListener(e,wake,{passive:true});
  el('play').onclick=()=>{paused=!paused;play.clearInput();syncAudio();options();status();needsPaint=true;};
  el('prev').onclick=()=>rotate(-1,true);el('next').onclick=()=>rotate(1,true);
  el('auto').onclick=()=>{auto=!auto;autoAge=0;options();};
  el('speed').onclick=()=>{speed=speeds[(speeds.indexOf(speed)+1)%speeds.length];options();};
  el('subs').onclick=()=>{subs=!subs;options();status();};
  el('voice').onclick=()=>{voiceOn=!voiceOn;options();status();};
  synth?.addEventListener('voiceschanged',localVoice);
  function menu(open){el('settings').hidden=!open;el('menu').setAttribute('aria-expanded',String(open));}
  function meet(open,node=selected){
    if(open&&playing)return;
    if(open){selected=node;if(targetZoom>1){const key=keys[actors.indexOf(node)];el('region').value=key;focus={key,point:Scene.position(sim),at:center()};heldRoom=null;needsPaint=true;}}
    const isDog=selected===dogTarget;
    el('meet').hidden=!open;
    for(const button of actors)button.setAttribute('aria-expanded',String(open&&button===selected));
    if(open){
      menu(false);el('monkActions').hidden=selected!==target;el('rollCone').hidden=selected!==whiteTarget;el('sitCat').hidden=selected!==catTarget;el('dogActions').hidden=!isDog;
      label('meetTitle',['스님과 대화','황구와 교감','백구와 놀기','고양이와 쉬기'][actors.indexOf(selected)]);
      el(['greet','sniff','rollCone','sitCat'][actors.indexOf(selected)]).focus({preventScroll:true});needsPaint=true;
    }
  }
  for(const [node,shortcut] of [[target,'talk'],[dogTarget,'visitDog'],[whiteTarget,'visitWhite'],[catTarget,'visitCat']]){
    const busy=()=>node===target?sim.encounter||play.actor()===sim:node===dogTarget&&sim.animals.dog.visitor;
    node.onclick=event=>{
      if(playing||performance.now()<ignoreTapUntil)return;
      let who=node;
      if(event.detail){
        let closest=Infinity;
        for(const actor of actors){
          const r=actor.getBoundingClientRect(),x=event.clientX,y=event.clientY;
          if(x<r.left||x>r.right||y<r.top||y>r.bottom)continue;
          const distance=Math.hypot(x-r.left-r.width/2,y-r.top-r.height/2);
          if(distance<closest){who=actor;closest=distance;}
        }
      }
      if(!(who===target?sim.encounter||play.actor()===sim:who===dogTarget&&sim.animals.dog.visitor))meet(el('meet').hidden||selected!==who,who);
    };
    el(shortcut).onclick=()=>{if(!busy())meet(true,node);};
  }
  el('dismiss').onclick=()=>{meet(false);selected.focus({preventScroll:true});};
  for(const id of ['greet','recite','sniff','pet','rollCone','sitCat'])el(id).onclick=()=>{
    if(playing||(selected===target&&play.actor()===sim))return;
    if(selected===whiteTarget||selected===catTarget)sim.animals.visit(id);else if(selected===dogTarget)sim.touchDog(id,Math.PI/2-angle);else sim.interact(id,Math.PI/2-angle);
    meet(false);selected.focus({preventScroll:true});status();needsPaint=true;
  };
  el('menu').onclick=()=>{meet(false);menu(el('settings').hidden);};
  window.addEventListener('pointerdown',e=>{
    if(!e.target.closest('.dock'))menu(false);
    if(!e.target.closest('#meet,.resident,#talk,#visitDog'))meet(false);
  });
  function toggleMode(){
    if(play.dialogueOpen())return;
    playing=!playing;
    app.dataset.mode=playing?'play':'observe';
    label('mode',playing?'관찰 모드 · Tab':'플레이 모드 · Tab');
    play.clearInput();
    meet(false);menu(false);
    fingers.clear();pinch=null;drag=null;
    if(playing){
      // Freeze the actual angle even if an observation turn is in progress.
      start=end=angle;cameraAge=2.6;
    }else{
      zoom=1;setZoom(1);autoAge=0;
    }
    app.focus({preventScroll:true});wake();needsPaint=true;
  }
  el('mode').onclick=toggleMode;
  window.addEventListener('keydown',e=>{
    if(e.defaultPrevented||play.dialogueOpen())return;
    if(e.key==='Tab'&&!e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&
        (e.target===document.body||e.target===app||e.target===land)){
      e.preventDefault();
      if(!e.repeat)toggleMode();
    }else if(e.key==='Escape'&&!el('meet').hidden){meet(false);selected.focus({preventScroll:true});}
    else if(e.key==='Escape'&&!el('settings').hidden){menu(false);el('menu').focus();}
  });
  if(!document.fullscreenEnabled)el('full').hidden=true;
  el('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await app.requestFullscreen();}catch{el('full').title='이 브라우저에서는 전체 화면을 사용할 수 없습니다.';}};
  document.addEventListener('fullscreenchange',()=>{el('full').setAttribute('aria-pressed',String(!!document.fullscreenElement));});
  window.addEventListener('resize',()=>{needsPaint=true;});
  document.addEventListener('visibilitychange',()=>{prevTime=null;needsPaint=true;syncAudio();if(document.hidden)speak(null);});
  function frame(ts){
    const dt=prevTime===null?0:Math.min(.20,Math.max(0,(ts-prevTime)/1000));prevTime=ts;
    if(!document.hidden){
      if(!paused){
        let left=dt*speed;
        while(left>1e-8){const step=Math.min(left,1/30);play.step(step,angle,playing);left-=step;}
        if(dt>0)play.frame(dt*speed);
        if(!sim.encounter&&!sim.meeting&&!sim.animals.dog.visitor&&!sim.animals.group.pair&&!['listen','blink','nuzzle'].includes(sim.animals.cat.pose)&&el('meet').hidden)autoAge+=dt;
        if(!playing&&auto&&targetZoom===1&&autoAge>=48)rotate(1,false);
      }
      const moving=cameraAge<2.6;
      const zooming=zoom!==targetZoom;
      zoom+=(targetZoom-zoom)*(reduced?1:1-Math.exp(-dt*13));
      if(Math.abs(targetZoom-zoom)<.001)zoom=targetZoom;
      cameraAge=Math.min(2.6,cameraAge+dt);angle=start+(end-start)*Temple.smooth(cameraAge/2.6);
      idle+=dt;
      if(!playing&&idle>9&&el('settings').hidden&&el('meet').hidden&&!app.querySelector(':focus-visible'))app.classList.add('quiet');
      if(needsPaint||moving||zooming||(!paused&&ts-lastPaint>=1000/30-1)){
        const room=playing?null:districts[el('region').value]?.room||heldRoom;
        Scene.render(sim,angle,cameraAge>=2.6,{visitor,protagonist:playing?play.actor():null,observed:observedActor(),room});
        frameSubjects();status();speechPosition();interactionPosition();landscapeAudio();ambientTick();
        lastPaint=ts;needsPaint=false;
      }
    }
    requestAnimationFrame(frame);
  }
  setZoom(1);localVoice();status();requestAnimationFrame(frame);
  return {
    inputEnabled:()=>playing&&!paused,
    refresh:()=>{needsPaint=true;}
  };
}
