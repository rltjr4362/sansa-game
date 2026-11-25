import { Temple as T } from './world.js';
import { VIEW_SQUASH } from './player.js';

export function createScene(canvas) {
  let c=canvas.getContext('2d',{alpha:false});
  const TAU=Math.PI*2, mix=(a,b,t)=>a+(b-a)*t,clamp=t=>Math.max(0,Math.min(1,t));
  const noise=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  function surface(w,h){const v=document.createElement('canvas');v.width=w;v.height=h;return v;}
  function poly(g,pts,color){
    g.fillStyle=color;g.beginPath();g.moveTo(...pts[0]);for(let i=1;i<pts.length;i++)g.lineTo(...pts[i]);g.closePath();g.fill();
  }
  function line(g,a,b,col,w=1){
    g.strokeStyle=col;g.lineWidth=w;g.beginPath();g.moveTo(...a);g.lineTo(...b);g.stroke();
  }
  function rect(g,x,y,w,h,col){g.fillStyle=col;g.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));}
  function oval(g,x,y,rx,ry,col){g.fillStyle=col;g.beginPath();g.ellipse(x,y,rx,ry,0,0,TAU);g.fill();}
  const U=24,ground=surface(T.W*U,T.H*U),g=ground.getContext('2d'),edges=[];
  function soil(x,y){
    if(!T.land(x,y))return 'void';
    if(T.water(x,y))return 'water';
    return T.road(x,y)?'sand':'grass';
  }
  // Paint the ground once in world space, including path shoulders and moss.
  function paintGround(){
    const rand=T.random(71253);
    const grass=['#adb58e','#b0b890','#afb790','#b2b890'],sand=['#dbc7a9','#dbc9ad','#ddcaae'],pond=['#82a9a9','#7ea2a4','#85a9a9'];
    for(let y=0;y<T.H;y++)for(let x=0;x<T.W;x++){
      const kind=soil(x,y);if(kind==='void')continue;
      const a=x*U,b=y*U,wet=kind==='water',path=kind==='sand',colors=wet?pond:path?sand:grass;
      rect(g,a,b,U,U,colors[Math.floor(rand()*colors.length)]);
      for(let i=0;i<(path?26:wet?15:50);i++){
        const px=a+rand()*(U-3),py=b+rand()*(U-2);
        const col=wet?(i%3?'#91b5b0':'#74a1a2'):path?(i%2?'#cfbea8':'#e3d2b5'):(i%3?'#a3ae8a':'#c0c59c');
        rect(g,px,py,1+rand()*3,1+rand()*1.2,col);
        if(!wet&&!path&&i%7===0){rect(g,px+1,py-2,1,2,col);if(i%14===0)rect(g,px,py-3,1,1,'#e6d2a6');}
      }
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const next=soil(x+dx,y+dy);
        if(next==='void')edges.push({x,y,dx,dy});
        if((!wet&&next==='water')||(path&&next==='grass')){
          for(let j=0;j<U;j+=2){
            const n=2+Math.floor(rand()*4),px=dx===0?a+j:dx>0?a+U-n:a,py=dy===0?b+j:dy>0?b+U-n:b;
            rect(g,px,py,dx?n:2,dy?n:2, next==='water'?(j%6?'#a1a192':'#c6bba3'):(j%6?'#bab998':'#c9c9a5'));
          }
        }
      }
    }
    // Worn stepping stones through the entry and around the pond.
    // Dry stone revetment below the upper precinct; paths cut through as stairs.
    for(let x=0;x<T.W;x++){
      if(!T.land(x,20))continue;
      const px=x*U,py=20*U;
      if(T.road(x,20)){
        for(let j=0;j<6;j++){rect(g,px,py+j*4,U,4,'#bfb4a9');rect(g,px,py+j*4,U,1,'#e3d8c2');}
      }else{
        rect(g,px,py,U,U,'#969590');
        for(let row=0;row<4;row++)for(let j=0;j<3;j++){
          const left=Math.max(0,j*12-(row%2)*5),right=Math.min(U,(j+1)*12-(row%2)*5);
          if(right>left+1)rect(g,px+left,py+row*6,right-left-1,5,row%2?'#b8b4a8':'#adada1');
        }
      }
    }
    for(const b of T.beds){
      const x=b.x*U,y=b.y*U,bw=b.w*U,bh=b.d*U;
      rect(g,x,y,bw,bh,'#b99b88');rect(g,x+2,y+2,bw-4,bh-4,'#aa8b7f');
      for(let j=0;j<6;j++){
        const yy=y+(j+.52)*bh/6;
        rect(g,x+3,yy,bw-6,4,'#927c79');rect(g,x+4,yy-2,bw-8,2,'#bea08a');
      }
      for(let i=0;i<90;i++)rect(g,x+rand()*(bw-3),y+rand()*(bh-3),2,1,'#c8aa92');
    }
    for(const [x,y] of [[11,19],[11,18],[11,17],[11,16],[11,15],[11,14],[11,13],[11,12],[11,11],[11,10],[15,8],[15,7],[15,6],[15,5],[15,4]]){
      const px=(x+.5)*U,py=(y+.5)*U,hw=5+rand()*3;
      poly(g,[[px-hw,py-3],[px+4,py-5],[px+hw,py-2],[px+hw-1,py+4],[px-hw+2,py+4]],'#c0b6a8');
      rect(g,px-hw+2,py-3,hw,1,'#e0d6be');
    }
  }
  paintGround();
  const center={x:T.W/2-.8,y:T.H/2-.8};
  const radius=Math.max(...edges.map(e=>Math.hypot(e.x+.5-center.x,e.y+.5-center.y)))+1.1;
  // Level courtyards joined by short sloping corridors on the mountainside.
  function elevation(y){return 1.9*clamp((22-y)/3)+1.35*clamp((6-y)/2)-1.15*clamp((y-30)/2);}
  let angle=Math.PI/4,cs=1,sn=1,scale=1,ox=0,oy=0,w=0,h=0;
  function project(x,y,z=0){
    z+=elevation(y);
    x-=center.x;y-=center.y;
    return [ox+scale*(x*cs-y*sn),oy+scale*((x*sn+y*cs)*VIEW_SQUASH-z*.91)];
  }
  const depth=(x,y)=>x*sn+y*cs;
  function resize(){
    const width=canvas.clientWidth,height=canvas.clientHeight;
    const dpr=Math.min(2,devicePixelRatio||1);
    const density=Math.min(2,Math.max(dpr,Math.min(2,2000/Math.max(1,width))));
    w=canvas.width=Math.max(1,Math.round(width*density));h=canvas.height=Math.max(1,Math.round(height*density));
    scale=Math.min(w*.94/(2*radius),h*.79/(radius*1.06+4));ox=w*.5;oy=h*.55;
    c.imageSmoothingEnabled=false;
  }
  function terrain(){
    for(const e of edges){
      if(e.dx*sn+e.dy*cs<=0)continue;
      const x=e.x+(e.dx>0?1:0),y=e.y+(e.dy>0?1:0),u=e.dy?1:0,v=e.dx?1:0;
      const p=(t,z)=>project(x+u*t,y+v*t,z);
      const n=noise(x,y),base=-.92-n*.18;
      poly(c,[p(0,.015),p(1,.015),p(1,base),p(0,base)],e.dx?'#a2918a':'#ae9c91');
      poly(c,[p(0,-.2),p(.65,-.32),p(1,-.27),p(1,-.51),p(.4,-.45),p(0,-.49)],'#c0b19f');
      poly(c,[p(.1,-.5),p(.48,-.48),p(.62,-.73),p(.3,-.83)],'#978c88');
      poly(c,[p(0,0),p(1,0),p(1,-.15),p(.45,-.12),p(.22,-.23),p(0,-.17)],'#979e82');
    }
    for(let y=0;y<T.H;y++){
      const o=project(0,y),next=project(0,y+1);c.save();
      c.transform(scale*cs/U,scale*sn*VIEW_SQUASH/U,(next[0]-o[0])/U,(next[1]-o[1])/U,...o);
      c.drawImage(ground,0,y*U,ground.width,U,0,0,ground.width,U+.18);c.restore();
    }
  }
  const artCache=new Map();
  function treeArt(p){
    if(artCache.has(p))return artCache.get(p);
    const img=surface(69,79),t=img.getContext('2d'),r=T.random(p.seed),pine=p.kind==='pine';
    // Broken silhouettes and stepped colour blocks keep each crown legible at a distance.
    function clump(x,y,rx,ry,pal){
      const contour=[];
      for(let i=0;i<18;i++){
        const a=i*TAU/18,n=.88+r()*.23;
        contour.push([Math.round(x+Math.cos(a)*rx*n),Math.round(y+Math.sin(a)*ry*n)]);
      }
      poly(t,contour,pal[0]);
      t.save();t.clip();
      for(let i=0;i<65;i++){
        const xx=x+(r()*2-1)*rx, yy=y+(r()*2-1)*ry;
        const high=(y-yy)/ry*.45+(x-xx)/rx*.15+r()*.7;
        const col=pal[high>.74?3:high>.38?2:1];
        rect(t,xx,yy,2+r()*6,pine?1+r()*2:2+r()*4,col);
      }
      t.restore();
    }
    const pal=pine?['#314e42','#3c5b46','#56734c','#829051']:p.kind==='gold'?['#936c3d','#b88941','#d2a448','#edc66b']:['#884d37','#b3673f','#cd8050','#e6a05e'];
    const bend=r()*9-3;
    poly(t,[[30,75],[34,58],[30+bend,42],[33+bend,35],[38+bend,57],[36,73],[40,76]],'#564735');
    line(t,[33,70],[36,56],'#9c8057',2);
    line(t,[36,59],[16,45],'#5c4934',3);line(t,[35,52],[54,38],'#62513a',3);
    if(pine){
      clump(16,43,15,7,pal);clump(46,35,17,8,pal);clump(23,29,15,8,pal);clump(35,19,18,10,pal);
    }else{
      clump(18,42,15,14,pal);clump(46,40,18,15,pal);clump(31,32,21,20,pal);clump(33,23,15,12,pal);
    }
    artCache.set(p,img);return img;
  }
  function sprite(p,time){
    const [x,y]=project(p.x+.5,p.y+.5),k=scale/31*p.size;
    if(['pine','maple','gold'].includes(p.kind)){
      const a=treeArt(p); const sway=Math.sin(time*.8+p.seed)*.015;
      c.save();c.translate(x,y);c.transform(1,0,sway,1,0,0);c.drawImage(a,-34*k,-75*k,69*k,79*k);c.restore();
    }else if(['well','jar','scarecrow'].includes(p.kind)){
      c.save();c.translate(x,y);c.scale(k,k);
      if(p.kind==='jar'){
        oval(c,0,-5,8,7,'#785039');oval(c,-2,-7,5.6,4.6,'#936849');oval(c,0,-11,6,2,'#534836');
        line(c,[-3,-9],[-4,-6],'#c19a68',1);
      }else if(p.kind==='well'){
        oval(c,0,-3,11,5,'#787d6b');rect(c,-11,-8,22,5,'#a7a18c');oval(c,0,-8,11,4,'#c1b79a');oval(c,0,-8,7,2.5,'#526a60');
        line(c,[-8,-8],[-8,-23],'#795c44',2);line(c,[8,-8],[8,-23],'#795c44',2);line(c,[-10,-23],[10,-23],'#8b6a4b',3);
        line(c,[1,-22],[1,-9],'#baa57d',1);
      }else{
        line(c,[0,0],[0,-27],'#725b41',2);line(c,[-10,-16],[10,-16],'#755c42',2);
        poly(c,[[-7,-17],[6,-17],[4,-12],[4,-7],[-5,-8],[-4,-13]],'#748d83');
        oval(c,0,-21,3.5,4,'#d2ae71');poly(c,[[-7,-23],[0,-28],[6,-23]],'#bc965a');
      }
      c.restore();
    }else if(p.kind==='rock'){
      c.save();c.translate(x,y);c.scale(k,k);
      poly(c,[[-9,0],[-7,-7],[-2,-10],[6,-8],[10,-2],[6,2],[-4,3]],'#727667');
      poly(c,[[-7,-7],[-2,-10],[6,-8],[4,-5],[-4,-3]],'#adac91');c.restore();
    }else{
      c.save();c.translate(x,y);c.scale(k,k);
      if(p.kind==='buddha'){
        oval(c,0,-4,9,4,'#757766');rect(c,-8,-5,16,4,'#a7a389');
        oval(c,0,-8,7,4,'#c0b58f');oval(c,0,-13,4.5,7,'#b5aa83');
        oval(c,0,-21,4,4.5,'#c8b994');rect(c,-3,-26,6,3,'#848773');rect(c,-1,-28,3,3,'#93957f');
        line(c,[-4,-12],[2,-9],'#8c8d73',1.4);
      }else{
        const levels=p.kind==='pagoda'?3:1;
        rect(c,-6,-3,12,4,'#787e70');rect(c,-4,-5,8,3,'#a6a793');
        rect(c,-2,-13,4,9,'#989b88');
        for(let i=0;i<levels;i++){
          const yy=-12-i*7,ww=8-i*1.5;
          rect(c,-3,yy-5,6,6,i===0&&levels===1?'#dca967':'#a5a693');
          if(levels===1)rect(c,-1,yy-4,2,4,'#ffe3a0');
          poly(c,[[-ww,yy-4],[-ww+2,yy-6],[-1,yy-9],[2,yy-9],[ww-2,yy-6],[ww,yy-5],[1,yy-4]],'#747f73');
          line(c,[-ww+2,yy-6],[0,yy-9],'#b7b9a0');
        }
        rect(c,-1,-24-(levels-1)*7,2,4,'#8d9482');
      }
      c.restore();
    }
  }
  function building(b){
    const {x,y,w:ww,d,h:height}=b;
    const p=(u,v,z)=>project(x+u,y+v,z);
    function box(u,v,sw,sd,z,bottom,colors){
      const ring=[[u,v],[u+sw,v],[u+sw,v+sd],[u,v+sd]];
      const dots=[-cs,sn,cs,-sn];
      for(let i=0;i<4;i++)if(dots[i]>0){
        const a=ring[i],e=ring[(i+1)%4];
        poly(c,[p(...a,bottom),p(...e,bottom),p(...e,z),p(...a,z)],colors[i%2]);
      }
      poly(c,ring.map(a=>p(...a,z)),colors[2]);
    }
    if(!b.gate){
      box(-.12,-.12,ww+.24,d+.24,.19,0,['#9a957d','#898c79','#c3b99b']);
      box(-.07,-.07,ww+.14,d+.14,.3,.19,['#c2baa1','#a7aa93','#dbd0b0']);
    }
    const eave=height+.31, open=b.open;
    const surfaces=[
      {n:-cs,l:ww,pt:(u,z)=>p(ww-u,0,z)},
      {n:sn,l:d,pt:(u,z)=>p(ww,u,z)},
      {n:cs,l:ww,pt:(u,z)=>p(u,d,z),front:true},
      {n:-sn,l:d,pt:(u,z)=>p(0,d-u,z)}
    ];
    function wall(s){
      const l=s.l,P=s.pt,bays=Math.max(1,Math.round(l/1.1));
      const quad=(a,z1,e,z2,col)=>poly(c,[P(a,z1),P(e,z1),P(e,z2),P(a,z2)],col);
      if(!open){
        quad(0,.3,l,height-.18,s.front?'#b59c70':'#d3be96');
        for(let i=0;i<bays;i++){
          const a=(i+.12)*l/bays,e=(i+.88)*l/bays,door=s.front&&!b.plain&&b.name!=='요사채';
          if(door&&i===Math.floor(bays/2)){
            quad(a,.31,e,height-.22,'#453e32');
            quad(a+.06,.34,e-.06,.57,'#795136');
            const [ax,ay]=P((a+e)/2,.73);
            oval(c,ax,ay,scale*.14,scale*.09,'#c89b51');
            oval(c,ax,ay-scale*.09,scale*.077,scale*.12,'#d3ad68');
            oval(c,ax,ay-scale*.24,scale*.068,scale*.071,'#e4c384');
            continue;
          }
          quad(a,.39,e,height-.24,door?'#694d39':'#aa8867');
          quad(a+.05,.65,e-.05,height-.3,door?'#968763':'#e1cfa3');
          for(let j=1;j<4;j++){const u=mix(a,e,j/4);line(c,P(u,.65),P(u,height-.28),'#715b41',.85);}
          for(let j=1;j<5;j++){const z=mix(.65,height-.3,j/5);line(c,P(a,z),P(e,z),'#786047',.75);}
          if(door){quad(a+.04,.4,e-.04,.59,'#826347');}
        }
      }
      for(let i=0;i<=bays;i++){
        if(open&&i>0&&i<bays)continue;
        const u=i*l/bays;
        quad(u-.075,b.gate?0:.29,u+.09,height-.07,b.plain?'#775541':'#90412e');
        quad(u-.054,.31,u-.005,height-.16,'#bf7751');
        quad(u-.10,b.gate?0:.29,u+.11,.44,'#aaa58b');
      }
      quad(-.11,height-.20,l+.11,height-.12,'#82422d');
      quad(-.17,height-.15,l+.17,height+.04,b.plain?'#746345':'#376b57');
      for(let u=.04;u<l;u+=.28){
        quad(u,height-.10,Math.min(l,u+.11),height-.04,'#d59968');
        line(c,P(u,height+.03),P(u+.12,height-.028),'#9ba678',.9);
      }
      quad(-.2,height+.04,l+.2,height+.105,'#b78b5d');
      if(s.front&&!b.gate){
        const u=l/2,span=Math.min(.83,l*.28);
        quad(u-span,height-.42,u+span,height-.02,'#644333');quad(u-span+.04,height-.38,u+span-.04,height-.06,'#304d47');
        const base=P(u-span+.09,height-.32),ux=P(u+span-.09,height-.32),up=P(u-span+.09,height-.10);
        c.save();c.transform((ux[0]-base[0])/33,(ux[1]-base[1])/33,(base[0]-up[0])/8,(base[1]-up[1])/8,...base);
        c.font='bold 9px Batang,serif';c.fillStyle='#f1d89c';c.textAlign='center';c.fillText(b.name,16.5,0);c.restore();
        if(b.name==='대웅전'||b.name==='관음전'){
          for(const u of [.23,l-.23]){
            const tip=P(u,height-.54),top=P(u,height-.12);
            line(c,top,tip,'#6f5034',1);
            oval(c,tip[0],tip[1],scale*.102,scale*.123,'#b9654b');
            rect(c,tip[0]-scale*.07,tip[1]-scale*.07,scale*.10,scale*.08,'#e8986c');
            rect(c,tip[0]-.6,tip[1]+scale*.11,1,scale*.09,'#ae7444');
          }
        }
      }
    }
    if(open){
      for(const s of surfaces.filter(s=>s.n<=0))wall(s);
      if(!b.gate){
        const [xx,yy]=p(ww/2,d/2,1.46),k=scale;
        line(c,[xx,yy-k*.49],[xx,yy],'#695641',2);
        oval(c,xx,yy,k*.25,k*.14,'#83744c');
        poly(c,[[xx-k*.25,yy],[xx+k*.25,yy],[xx+k*.31,yy+k*.66],[xx+k*.36,yy+k*.76],[xx-k*.36,yy+k*.76],[xx-k*.30,yy+k*.65]],'#67684e');
        oval(c,xx,yy+k*.76,k*.36,k*.065,'#545a49');
        line(c,[xx-k*.30,yy+k*.65],[xx+k*.31,yy+k*.65],'#b29c66',2);
        line(c,[xx-k*.21,yy+k*.10],[xx-k*.25,yy+k*.57],'#a39867',2);
      }
    }
    for(const s of surfaces.filter(s=>s.n>0))wall(s);
    // Four curved roof planes meet at a level ridge; each tile follows its slope.
    const over=b.gate?.55:.47, ridgeH=b.gate?.7:ww>4?1.16:.88;
    const corners=[[-over,-over],[ww+over,-over],[ww+over,d+over],[-over,d+over]];
    const ends=[[.50,d/2],[ww-.50,d/2],[ww-.50,d/2],[.50,d/2]];
    const strips=[];
    for(let f=0;f<4;f++){
      const a=corners[f],e=corners[(f+1)%4],ra=ends[f],re=ends[(f+1)%4];
      const side=f%2===1, count=Math.ceil((side?d+over*2:ww+over*2)*4.6);
      function roof(u,v){
        const xx=mix(mix(a[0],e[0],u),mix(ra[0],re[0],u),v),yy=mix(mix(a[1],e[1],u),mix(ra[1],re[1],u),v);
        const rise=ridgeH*(v*.42+v*v*.58)+.25*Math.pow(Math.abs(2*u-1),3)*(1-v);
        return [xx,yy,eave+rise];
      }
      for(let i=0;i<count;i++){
        const a=i/count,b=(i+1)/count,mid=roof((a+b)/2,.4);
        const straw=b.name==='농막';
        const cols=straw?['#ac8d57','#b29761','#a88c59']:f===0||f===3?['#4c5d61','#596c6b','#526464']:['#5e7275','#6d7e7d','#617476'];
        strips.push({z:depth(x+mid[0],y+mid[1]),draw:()=>{
          const nodes=[roof(a,0),roof(b,0),roof(b,.5),roof(b,1),roof(a,1),roof(a,.5)].map(v=>p(...v));
          poly(c,nodes,cols[i%3]);line(c,nodes[0],nodes[5],straw?'#d3b780':'#929b90',.85);line(c,nodes[5],nodes[4],straw?'#c3a16e':'#89978e',.75);
          const l=roof(a,0),r=roof(b,0);
          poly(c,[p(...l),p(...r),p(r[0],r[1],r[2]-.105),p(l[0],l[1],l[2]-.105)],i%2?'#384b4c':'#697976');
        }});
      }
    }
    strips.sort((a,b)=>a.z-b.z);for(const strip of strips)strip.draw();
    const ridgeZ=eave+ridgeH;
    line(c,p(.44,d/2,ridgeZ),p(ww-.44,d/2,ridgeZ),'#394c4d',scale*.11);
    line(c,p(.44,d/2,ridgeZ+.05),p(ww-.44,d/2,ridgeZ+.05),'#b1b4a3',scale*.044);
    for(const u of [.44,ww-.44])line(c,p(u,d/2,ridgeZ),p(u+(u<1?-.14:.14),d/2,ridgeZ+.14),'#586866',scale*.1);
  }
  function drawDog(d,time,meeting,emote){
    const [x,y]=project(d.x,d.y),k=scale/17,side=Math.cos(d.face)*cs-Math.sin(d.face)*sn;
    const pet=d.visitor?.kind==='pet'||meeting?.phase==='pet',offered=d.visitor?.kind==='sniff';
    const walking=d.walking||!d.visitor&&d.path.length>0,gait=walking?Math.sin(d.step):0;
    const pose=d.walking?'walk':emote==='sit'?'rest':emote==='jump'?'invite':d.pose;
    const sniff=offered||emote==='sniff'?-1.4+Math.sin(time*7)*.8:pet?-1.4:walking?0:1.6*(1+Math.sin(time*2));
    c.save();c.translate(x,y);c.scale(side<0?-k:k,k);
    if(['rest','meditate'].includes(pose))c.scale(1.08,.62);
    if(pose==='rain'&&d.shake)c.rotate(.12*Math.sin(time*30));
    oval(c,0,0,8,2.4,'#53604655');
    if(emote==='jump'&&!d.walking)c.translate(0,-3*Math.max(0,Math.sin(time*8)));
    for(const [x,step] of [[-5,gait],[4,-gait],[-3,-gait],[6,gait]]){
      line(c,[x,-4],[x+step*1.6,-.8],'#a27949',2);
      rect(c,x+step*1.6-1,-1,2.4,1.6,'#f4dfae');
    }
    const wag=pet||emote==='wag'||d.tapUntil>time;
    const lift=Math.abs(gait)*.65,tail=Math.sin(time*(wag?10:walking?7:4))*(wag?2.4:1.2);
    c.translate(0,-lift);
    line(c,[-5,-5],[-9,-8+tail],'#b78e5b',3);line(c,[-9,-8+tail],[-8,-11+tail],'#f1d6a1',3);
    line(c,[-8,-11+tail],[-5,-10+tail],'#edd3a3',2);
    oval(c,0,-5,6.5,3.5,d.white?'#dedbd0':'#ba8951');oval(c,1,-4.2,4.2,2.1,d.white?'#fff8e5':'#e7c894');
    c.translate(-1.4*(1-Math.abs(side)),sniff+(['invite','drink','cone'].includes(pose)?3:0));
    poly(c,[[3,-9],[3,-15],[7,-11],[10,-14],[10,-9]],d.white?'#c0b6a6':'#8c6440');
    oval(c,6.6,-8.6,4.35,3.9,'#a47c50');oval(c,6.8,-9,3.9,3.5,d.white?'#fff8e8':'#ddb078');
    line(c,[3.7,-6],[7.1,-5.4],'#5a7668',1.3);oval(c,9.5,-7.6,2.6,1.7,'#fae1b1');
    rect(c,8,-10,pet?2:1.3,1.1,'#3b4136');rect(c,11,-8.7,1.7,1.4,'#474238');
    if(d.visitor){
      const v=d.visitor,ease=T.smooth(v.age/.5)*T.smooth((v.duration-v.age)/.5);
      const hx=offered?13:6+Math.sin(v.age*4)*1.5,hy=offered?-8:-13;
      c.globalAlpha=ease;
      line(c,[hx+6,hy-4],[hx+2,hy-1],'#697c6b',2.8);
      oval(c,hx+.5,hy,2.3,1.25,'#e8bd95');c.globalAlpha=1;
    }
    c.restore();
  }
  function drawCat(a,time,emote){
    const [x,y]=project(a.x,a.y),k=scale/19,dir=Math.cos(a.face)*cs-Math.sin(a.face)*sn<0?-1:1;
    const facePose=emote==='purr'?(Math.floor(time*2)%2?'nuzzle':'blink'):emote==='sit'?'loaf':emote==='sniff'?'listen':a.pose;
    const pose=a.walking?'walk':facePose;
    const loaf=['loaf','blink','listen','nuzzle'].includes(pose),stretch=pose==='stretch',rub=pose==='nuzzle'?Math.sin(time*3)*2:0;
    c.save();c.translate(x,y);c.scale(k*dir,k);oval(c,0,0,6,1.6,'#4f59484a');
    if(emote==='jump'&&!a.walking)c.translate(0,-3*Math.max(0,Math.sin(time*8)));
    if(!loaf){const step=(a.walking||a.path.length)?Math.sin(a.step):0;for(const x of [-3,3])rect(c,x+step*Math.sign(x),-3,1.6,3,'#705e51');}
    const tail=emote==='wag'?Math.sin(time*8)*2:Math.sin(time*2);
    const y0=loaf?-3:-5;line(c,[-3,y0],[-7,y0-1],'#796a60',2);line(c,[-7,y0-1],[-8,y0-5+tail],'#685b52',1.7);
    oval(c,0,y0,stretch?7:5.4,loaf?3.1:3.5,'#a39783');
    for(let i=-2;i<=1;i++)rect(c,i*1.7,y0-2.7,1,2,'#70665c');
    c.translate(rub,stretch?3:0);poly(c,[[1,y0-3],[1,y0-8],[4,y0-6],[7,y0-8],[7,y0-2]],'#7d7065');
    oval(c,4,y0-3,3.4,2.7,'#c7b59a');rect(c,5,y0-3.6,pose==='blink'?2:1,1,'#465047');
    if(pose==='nuzzle'||pose==='blink'){line(c,[10,-6],[8,-5],'#d4a781',2);}
    c.restore();
  }
  function drawBird(b,i,time){
    const [x,y]=project(b.x,b.y,b.z),k=scale/17,dir=Math.cos(b.face)*cs-Math.sin(b.face)*sn<0?-1:1;
    const wing=b.flight?Math.sin(time*16+i)*3.5*clamp(Math.cos(b.age*2+i)*2+.5)-1.5:0,peek=b.flight?0:Math.sin(time*3+i)*.45;
    const back=['#74563e','#536a69','#71624c'][i];
    c.save();c.translate(x,y);c.scale(k*dir,k);
    if(!b.flight){line(c,[-1,-1],[-1,1],'#715b42',.8);line(c,[1,-1],[1,1],'#715b42',.8);}
    poly(c,[[-2,-2],[-6,-4],[-5,-1],[-1,0]],back);
    oval(c,0,-2,3.5,2.1,'#e0c798');oval(c,2,-3.7+peek,2,2,back);
    poly(c,[[3.5,-4+peek],[5.8,-3.4+peek],[3.6,-2.9+peek]],'#b88a48');
    poly(c,[[1,-2],[-2,-2],[-4.5,-3+wing],[-1.5,-4+wing*.7]],back);
    rect(c,2.7,-4.4+peek,1,1,'#303d34');c.restore();
  }
  function monk(s){
    const [x,y]=project(s.x,s.y),k=scale/16;
    const interaction=s.encounter;
    const kind=s.walking?'walk':s.phase==='act'?T.visits[s.id][2]:s.phase;
    const type=s.meeting?s.meeting.phase:interaction?'pray':kind==='housekeeping'?'sweep':kind;
    if(interaction)s={...s,age:interaction.age,duration:interaction.duration};
    if(s.meeting)s={...s,age:s.meeting.age,duration:5.2};
    const strength=type==='walk'?1:T.smooth(s.age/.85)*T.smooth((s.duration-s.age)/.85);
    const act=Number.isFinite(strength)?strength:0,walk=type==='walk'?Math.sin(s.step):0;
    const look=type==='look'?.7*Math.sin(s.age*.8)*act:0,face=s.face+look;
    const fx=Math.cos(face)*cs-Math.sin(face)*sn,fy=Math.cos(face)*sn+Math.sin(face)*cs;
    const dir=fx<0?-1:1,front=fy>-.15;
    const breath=Math.sin(s.time*2.1)*.32,bow=type==='bow'?T.smooth((1-Math.cos(s.age/3.2*TAU))*.78)*act:0;
    const fieldwork=['sow','harvest','water'].includes(type),reach=fieldwork?act*(.55+.4*Math.sin(s.age*2.8)):0;
    const sitting=['rest','pet','sit','guided'].includes(type);
    const sit=sitting?act:0,lean=bow*8+(type==='pet'?act*3:0)+reach*3,lower=bow*12+sit*5+reach*4;
    c.save();c.translate(Math.round(x),Math.round(y));c.scale(k*dir,k);
    oval(c,0,0,6.6,2.2,'#5a62486b');
    rect(c,-4,-2+walk,3.6,2.8,'#454c46');rect(c,1,-2-walk,3.6,2.8,'#54594e');
    const base=-2+Math.abs(walk)*.65,shoulder=-15+lower+breath;
    poly(c,[[-3+lean,shoulder-1],[3+lean,shoulder-1],[5+lean,shoulder+3],[5+sit,base],[-5-sit,base],[-4,shoulder+3]],'#636e6a');
    poly(c,[[-2+lean,shoulder],[2+lean,shoulder],[4,base-1],[-3,base-1]],'#abb0a0');
    poly(c,[[-4+lean,shoulder+1],[-1+lean,shoulder-1],[3+lean,shoulder+2],[1,base-1],[-3,base]],'#a4623c');
    line(c,[-2+lean,shoulder+1],[2,base-2],'#d38a53',1.5);
    let hand=shoulder+6,hx=3+lean;
    if(sitting&&['sit','guided'].includes(type)){
      oval(c,0,base,6.7,2.5,'#7c8981');hand=base-3;hx=2;
    }
    if(fieldwork){hx+=2+reach*3;hand+=reach*2;}
    if(type==='welcome'){hx+=act*2;hand-=act*4;}
    if(type==='meal'){hx+=act*3;hand-=act*2;}
    if(type==='chant'||type==='pray'){hand-=act*(5+Math.sin(s.age*2)*.5);hx+=act*1.6;}
    else if(type==='sweep'){hx+=act*(3+Math.sin(s.age*3.4)*2);hand+=Math.sin(s.age*3.4)*2*act;}
    else if(type==='walk'){hx+=walk*1.9;}
    else if(type==='bow'){hx+=bow*4;hand=Math.min(-1,hand+bow*2);}
    else if(type==='pet'){
      const d=s.animals.dog,[dx,dy]=project(d.x,d.y,.48);
      hx=mix(hx,(dx-x)*dir/k-4+Math.sin(s.age*4)*1.6,act);
      hand=mix(hand,(dy-y)/k-1+Math.cos(s.age*4)*.65,act);
    }
    line(c,[2+lean,shoulder+2],[hx,hand],'#828d84',3.8);
    rect(c,hx-1,hand-1,2.5,2.6,'#dbb593');
    if(type==='chant'||type==='pray'){
      line(c,[lean-3,shoulder+3],[hx-1,hand+1],'#9a9f8e',2.7);rect(c,hx-2,hand-2,2,2,'#eac4a1');
      for(let i=0;i<5;i++){const a=i*Math.PI/4;rect(c,hx+Math.cos(a)*1.6,hand+1+Math.sin(a)*3,1,1,'#634e38');}
    }
    const nod=interaction?.kind==='greet'?2.3*Math.sin(act*Math.PI/2):0;
    const headX=lean+.4,headY=shoulder-4+.3*Math.abs(walk)+bow*4+nod;
    oval(c,headX,headY,3.9,4.2,front?'#d8b393':'#aaaca0');
    oval(c,headX-.4,headY-1.6,3.55,2.8,'#bcc1b1');
    rect(c,headX-2,headY-3,2.5,1,'#dadaca');
    if(front){rect(c,headX+1.7,headY,1,1,'#665f50');rect(c,headX+3,headY+1,1.4,1.5,'#c7a384');}
    if(type==='sweep'){
      const swing=Math.sin(s.age*3.4)*4;
      line(c,[hx-3,hand-5],[hx+swing+3,base-1],'#715735',1.3);
      poly(c,[[hx+swing+2,base-3],[hx+swing+4,base-3],[hx+swing+8,base+1],[hx+swing+2,base+2]],'#c1964d');
      for(let i=0;i<3;i++)rect(c,hx+swing+7+i*2,base+Math.sin(i+s.age*3),1.5,1,'#ae8754');
    }
    if(type==='water'){
      oval(c,hx,hand+2,3.2,2.3,'#638681');line(c,[hx+2,hand+2],[hx+6,hand],'#73958d',1.4);
      for(let i=0;i<4;i++){const f=(s.age*1.8+i/4)%1;rect(c,hx+6+f*4,hand+f*f*6,1,1,'#c5dede');}
    }else if(type==='harvest'||type==='sow'){
      oval(c,-5,-2,3.7,2.3,'#ad8552');line(c,[-8,-3],[-2,-3],'#765f40',1);
      if(type==='harvest'){oval(c,hx,hand-1,2,1.7,'#8eaa61');line(c,[hx,hand-1],[hx+1,hand-4],'#718d55',1);}
      else for(let i=0;i<3;i++){const f=(s.age*1.55+i/3)%1;rect(c,hx+f*4,hand+f*5,1,1,'#e2bd73');}
    }else if(type==='meal'){
      line(c,[hx-4,hand+1],[hx+5,hand+1],'#85664b',1.7);
      oval(c,hx+1,hand,2.8,1.4,'#d9d5bb');rect(c,hx+1,hand-2,1.7,1,'#9eae71');
    }
    c.restore();
  }
  function guestFigure(g,i,s){
    const [x,y]=project(g.x,g.y),k=scale/17.7;
    const walking=g.path.length>0,moving=walking?Math.sin(g.step):0;
    const session=s.phase==='act'&&!s.encounter&&((s.id===13&&s.retreat.stage==='meditation')||(s.id===14&&s.retreat.stage==='dining'));
    const seated=session?4:0,dir=Math.cos(g.face)*cs-Math.sin(g.face)*sn<0?-1:1;
    c.save();c.translate(x,y);c.scale(dir*k,k);oval(c,0,0,5.5,1.7,'#515c4759');
    rect(c,-3,-3+moving,2.7,3,'#56544a');rect(c,1,-3-moving,2.7,3,'#56544a');
    const top=-13+seated+Math.abs(moving)*.55;
    poly(c,[[-3,top],[2.5,top],[4,-2],[-4,-2]],i?'#8e6878':'#688b87');
    if(session)oval(c,0,-1,5.5,2.3,i?'#776975':'#677b72');
    if(walking){rect(c,-4.8,top+1,3.5,6,'#ad875b');line(c,[-1,top],[2,-4],'#d0b892',1.1);}
    const nod=s.id===12&&s.phase==='act'&&s.retreat.stage==='reception'?(1-Math.cos(s.age*1.2))*.6:0;
    oval(c,.4,top-3+nod,3.5,3.7,'#dcba98');oval(c,-.2,top-4.8+nod,3.5,2.3,i?'#51493f':'#615345');
    if(i)oval(c,-2.8,top-2,1.7,2.3,'#564a43');
    line(c,[1,top+2],[session?3:2+moving,session?-4:top+6],'#d6b596',1.8);
    if(session&&s.id===14)oval(c,3,-4,2.2,1.1,'#dbd8b9');c.restore();
  }
  function visitorFigure(actor){
    const [x,y]=project(actor.x,actor.y),k=scale/16;
    const stride=actor.walking?Math.sin(actor.step):0;
    const dir=Math.cos(actor.face)*cs-Math.sin(actor.face)*sn<0?-1:1;
    const front=Math.cos(actor.face)*sn+Math.sin(actor.face)*cs>-.15;
    const top=-14+Math.abs(stride)*.65;
    c.save();c.translate(Math.round(x),Math.round(y));c.scale(k*dir,k);
    oval(c,0,0,6,1.9,'#515c4759');
    rect(c,-4,-4+stride,3,4,'#41465e');rect(c,1,-4-stride,3,4,'#525675');
    rect(c,-5,top+2,4,10,'#83574a');rect(c,-6,top+4,4,7,'#b78463');
    rect(c,-5,top+5,2,2,'#e3b98c');
    poly(c,[[-3,top],[3,top],[4,-3],[-4,-3]],'#85789d');
    line(c,[-2,top+.7],[1,-5],'#d5b492',1.15);
    line(c,[2,top+2],[2+stride,top+7],'#b1a1c2',2.8);
    rect(c,1+stride,top+6,2,2,'#d9ad8f');
    oval(c,.4,top-2.5,3.7,3.8,front?'#e6c09e':'#ac8c79');
    rect(c,-3.6,top-6.7,7,3,'#50516b');rect(c,-4,top-5,9,2,'#666785');
    if(front)rect(c,2.3,top-2,1,1,'#605042');
    c.restore();
  }
  function gardens(s){
    T.beds.forEach((b,i)=>{
      const crop=s.farm[i];if(crop.stage==='soil')return;
      const size=crop.stage==='ripe'?1:crop.stage==='dry'?.2:.25+.7*crop.growth;
      for(let row=0;row<6;row++)for(let col=0;col<5;col++){
        const [x,y]=project(b.x+(col+.55)*b.w/5,b.y+(row+.48)*b.d/6,.04);
        const r=scale*.19*size*(.88+.2*noise(row,col));
        oval(c,x,y,r*1.2,r*.42,'#4a5e4180');
        oval(c,x-r*.48,y-r*.48,r*.72,r*.48,i===0?'#92aa61':'#789853');
        oval(c,x+r*.36,y-r*.7,r*.66,r*.61,i===0?'#b4c477':'#9fb565');
        oval(c,x,y-r*.26,r*.52,r*.43,i===0?'#cdcf8e':i===1?'#d5cfa7':'#cf8b50');
      }
    });
    if(s.retreat.dirty){
      for(let i=0;i<15;i++){const [x,y]=project(9.6+noise(i,57)*4,26.1+noise(i,27)*.7);rect(c,x,y,2,1,'#ad8255');}
    }
    if(s.pantry){
      const [x,y]=project(24.6,28,.05);
      oval(c,x,y,scale*.30,scale*.13,'#9c764b');oval(c,x,y-scale*.10,scale*.28,scale*.09,'#c4a26c');
      for(let i=0;i<Math.min(6,s.pantry);i++)oval(c,x+(noise(i,92)-.5)*scale*.34,y-scale*.13,scale*.07,scale*.06,'#92a15d');
    }
  }
  const skyBands=[
    [0,'#646684','#949aa7','#737a8e','#687083','#656e7d'],
    [300,'#9597aa','#d9c5b5','#a9aaae','#999ea2','#899497'],
    [440,'#d0d8d2','#f1e0c2','#c4c9be','#aeb8b5','#9faba7'],
    [730,'#c0d4d2','#ece2c6','#c1ccc2','#a9b7b1','#98a7a2'],
    [1000,'#dad6c6','#efdab8','#c5c0b2','#b1b2a7','#a4a9a0'],
    [1120,'#c8a8ad','#efcfb0','#bcadad','#a6a6a6','#959ca0'],
    [1230,'#8788a1','#b7adb1','#9395a2','#828997','#7a828f'],
    [1440,'#646684','#949aa7','#737a8e','#687083','#656e7d']
  ];
  function tint(a,b,t){
    const rgb=[1,3,5].map(k=>Math.round(mix(parseInt(a.slice(k,k+2),16),parseInt(b.slice(k,k+2),16),t)));
    return 'rgb('+rgb.join(',')+')';
  }
  function palette(clock){
    const j=skyBands.findIndex(row=>row[0]>clock),a=skyBands[j-1],b=skyBands[j],t=T.smooth((clock-a[0])/(b[0]-a[0]));
    return a.slice(1).map((col,i)=>tint(col,b[i+1],t));
  }
  const travelerPixels=[
    '     ooooo     ','   oohhhhhoo   ','  ohhgggggggo  ',' ohggggggggggo ',
    ' ogggEEggEEggo ',' ogggEEggEEggo ','  ogggggggggo  ','   ooggoggoo   ',
    '   swogogoos   ','  shwwwwwwwhs  ','  ogwwwwwwsgo  ','   swwwwwshs   ',
    '   swwwsshws   ','  swwwshwwwss  ','  sssssssssss  '
  ];
  const pupPixels=[
    '         oo   ','  o     oggo  ','  goooooogEgoo','  oggggggggo  ','   oggggggo   '
  ];
  function skySprite(rows,ink,feet){
    const img=surface(Math.max(...rows.map(row=>row.length)),rows.length+2),g=img.getContext('2d');
    rows.forEach((row,y)=>Array.from(row).forEach((p,x)=>{if(ink[p])rect(g,x,y,1,1,ink[p]);}));
    for(const [x,y] of feet)rect(g,x,rows.length-1+y,3,2,ink.o);
    return img;
  }
  const processionSprites=[
    // 솔방울 요정
    {
      rows:['     gg', '    gg', '    oo', '   ohoo', '  oohhhoo', '  ohhhohoo', ' oohhhohooo',
        ' ooooffoooo', '   ofefeo', '   offffo', '    oggo', '   oggggo', '   oooooo'],
      ink:{o:'#654e45',h:'#ad7955',f:'#f4ceab',g:'#7d9a6d',e:'#473c34'}
    },
    // 연잎 토끼
    {
      rows:['    oo oo', '    of of', '    of of', '    ofofo', '  gggggggg', ' gghhghgg',
        '  gggggggo', '   ofefef', '   offffoo', '    oggo', '   ogghgo', '   oooooo'],
      ink:{o:'#5d6b60',h:'#a8c4a2',f:'#f6e5d6',g:'#7ba492',e:'#51464e'}
    },
    // 동자 꼬마
    {
      rows:['    ooo', '   ooooo', '  ooooooo', '  ooffffoo', '  ooffefeo', '   offffo',
        '    gooo', '   ghgggo', '  gghggfgo', '  oghhggo', '   oghggo', '   oooooo'],
      ink:{o:'#524852',h:'#ccb5cf',f:'#e9bfa2',g:'#917fa2',e:'#493c43'}
    }
  ].map(({rows,ink})=>[0,1].map(step=>skySprite(rows,ink,[[3-step,step],[6+step,1-step]])));
  function drawProcession(actor){
    const [x,y]=project(actor.x,actor.y),k=scale/17;
    const stride=Math.sin(actor.step),sprite=processionSprites[actor.kind][Number(stride>0)];
    const dir=Math.cos(actor.face)*cs-Math.sin(actor.face)*sn<0?-1:1;
    oval(c,x,y,scale*.29,scale*.09,'#515c4759');
    c.save();c.translate(Math.round(x),Math.round(y));c.scale(dir*k,k);
    c.imageSmoothingEnabled=false;
    c.drawImage(sprite,-sprite.width/2,-sprite.height-Math.abs(stride)*.5);
    c.restore();
  }
  const skyWalkers=[
    {o:'#195d48',h:'#70e49b',g:'#26b578',E:'#143833',s:'#94bbc2',w:'#fff9e5'},
    {o:'#846123',h:'#ffed98',g:'#f4c65f',E:'#5b482e',s:'#b08a48',w:'#fff0ac'},
    {o:'#75502e',g:'#e6ae5a',E:'#332f27'}
  ].map((ink,i)=>[0,1].map(step=>skySprite(i===2?pupPixels:travelerPixels,ink,[[3-step,step],[9+step,1-step]])));
  const smallSubjects=[];
  function skyProcession(s){
    const a=s.clock/1440*TAU, x=w*(.5-.34*Math.sin(a)), y=h*(.20+.035*Math.cos(2*a));
    const r=Math.min(w*.036,h*.083), night=s.clock<330||s.clock>1180;
    const glow=c.createRadialGradient(x,y,r*.92,x,y,r*1.7);
    glow.addColorStop(0,night?'#dfdcff70':'#ffdf9c95');glow.addColorStop(1,'#fff4dc00');
    c.fillStyle=glow;c.fillRect(x-2*r,y-2*r,4*r,4*r);
    // A tilted great circle on a sphere. The projected foot stays on the surface.
    function ground(t){return {x:x+r*Math.cos(t),y:y-r*.51*Math.sin(t),z:Math.sin(t)};}
    const phase=s.time*.16+.95, angles=[phase,phase-1.02,phase+.63+.035*Math.sin(s.time*.64)];
    const walkers=angles.map((t,i)=>{
      const p=ground(t), unit=r*[.031,.028,.024][i]*(1+.06*p.z);
      return {...p,i,unit,lean:Math.atan2(Math.cos(t),.75)*.93,dir:p.z>=0?-1:1,
        stride:Math.sin(s.time*(i===2?7.6:i===1?5.9:5.6)+i)};
    });
    function anchor(p,dx,dy){
      const u=dx*p.dir*p.unit,v=dy*p.unit;
      return [p.x+u*Math.cos(p.lean)-v*Math.sin(p.lean),p.y+u*Math.sin(p.lean)+v*Math.cos(p.lean)];
    }
    function drawFigure(p){
      const sprite=skyWalkers[p.i][Number(p.stride>0)];
      c.save();c.translate(p.x,p.y);c.rotate(p.lean);c.scale(p.dir*p.unit,p.unit);
      c.imageSmoothingEnabled=false;c.drawImage(sprite,-sprite.width/2,-sprite.height);
      c.restore();
    }
    for(const p of walkers){
      const [px,py]=anchor(p,0,p.i===2?-3:-9);
      smallSubjects[p.i]={key:'sky'+p.i,name:['초록 외계인','금빛 친구','하늘 강아지'][p.i],x:px/w,y:py/h,visible:p.z>=0||Math.hypot(px-x,py-y)>r};
    }
    function pass(front){
      const owner=walkers[0],dog=walkers[2],hand=anchor(owner,4.8,-6.5),collar=anchor(dog,3.5,-4);
      const leash=t=>[hand[0]+(collar[0]-hand[0])*t,hand[1]+(collar[1]-hand[1])*t+r*.13*Math.sin(t*Math.PI)];
      for(let j=0;j<16;j++)if((Math.sin(angles[0]+(angles[2]-angles[0])*(j+.5)/16)>=0)===front)
        line(c,leash(j/16),leash((j+1)/16),'#907681',Math.max(1,r*.02));
      for(const p of walkers.filter(p=>(p.z>=0)===front).sort((a,b)=>a.z-b.z)){
        if(front)oval(c,p.x,p.y,p.unit*(p.i===2?4.4:3.6),p.unit*1.05,'#927c792f');
        drawFigure(p);
      }
    }
    pass(false);
    const light=c.createRadialGradient(x-.28*r,y-.37*r,.08*r,x,y,r);
    light.addColorStop(0,night?'#fff8f0':'#fff6cf');light.addColorStop(.72,night?'#e8e2ec':'#ffe6ae');
    light.addColorStop(1,night?'#c9c7df':'#f4c994');oval(c,x,y,r,r,light);
    if(night)for(const [dx,dy,sz] of [[-.33,-.21,.13],[.31,.15,.16],[.46,.33,.07],[-.16,.53,.09]])
      oval(c,x+r*dx,y+r*dy,r*sz,r*sz*.7,'#b9b5ca69');
    pass(true);
  }
  const skyCache=surface(1,1),mountainCache=surface(1,1);
  let landscapeKey='';
  function mountains(s){
    // A baked ridgeline keeps the hundreds of distant pine marks inexpensive.
    const key=w+'x'+h+'-'+Math.floor(s.clock/3);
    const colors=palette(s.clock);
    if(key!==landscapeKey){
      landscapeKey=key;mountainCache.width=w;mountainCache.height=h;
      skyCache.width=w;skyCache.height=h;
      const backdrop=skyCache.getContext('2d'),sky=mountainCache.getContext('2d'),grad=backdrop.createLinearGradient(0,0,0,h);
      grad.addColorStop(0,colors[0]);grad.addColorStop(.48,colors[1]);grad.addColorStop(1,colors[3]);
      backdrop.fillStyle=grad;backdrop.fillRect(0,0,w,h);
      const isNight=s.clock<330||s.clock>1180;
      if(isNight)for(let j=0;j<60;j++)rect(backdrop,noise(j,71)*w,noise(j,32)*h*.28,1,1,'#dbd9c7');
      for(let band=0;band<3;band++){
        const cy=h*(.27+band*.095),amp=Math.min(h*.11,w*.11);
        function ridge(px){
          const u=px/w;
          return cy+amp*(.49*Math.sin(u*12.5+band*3.6)+.19*Math.sin(u*27+band*1.7)+.11*Math.sin(u*51+band*4)+.08*Math.sin(u*96+band*.7));
        }
        const pts=[[0,h]];
        for(let x=0;x<=w+4;x+=3)pts.push([x,Math.round(ridge(x)+noise(x,band)*2)]);
        pts.push([w,h]);poly(sky,pts,colors[band+2]);
        if(band>0){
          for(let x=0;x<w;x+=3){
            const v=2+noise(x,band)*6,yn=ridge(x)+1;
            poly(sky,[[x-2,yn+2],[x,yn-v],[x+2,yn+2]],colors[band+2]);
          }
        }
      }
      const haze=sky.createLinearGradient(0,h*.37,0,h);haze.addColorStop(0,'#f2e7cb00');haze.addColorStop(.55,'#dfe0c855');haze.addColorStop(1,'#c7cfbb55');
      sky.fillStyle=haze;sky.fillRect(0,0,w,h);
      for(let i=0;i<135;i++){
        const xx=noise(i,23)*w,yy=h*(.5+noise(i,29)*.52);
        rect(sky,xx,yy,3+noise(i,41)*17,1,i%3?'#eeeed324':'#7c8b8d21');
      }
      textureScenery(backdrop);textureScenery(sky);
    }
    c.drawImage(skyCache,0,0);
    skyProcession(s);
    c.drawImage(mountainCache,0,0);
    // Thin wisps drift across the distant ridges.
    for(let i=0;i<11;i++){
      const px=((noise(i,8)*w+s.time*(.55+i*.023))%(w*1.4))-w*.2;
      const yy=h*(.22+noise(i,2)*.33),sw=w*(.035+noise(i,45)*.1);
      oval(c,px,yy,sw,1+h*.003,'rgba(255,242,209,'+(.16+s.mist*.2)+')');
      rect(c,px-sw*.6,yy+3,sw*.8,1,'#f2e7cc35');
    }
  }
  function pondLife(s){
    for(let i=0;i<3;i++){
      const t=s.time*(.14+i*.026)+i*2.3,rx=.82+i*.21,ry=.55+i*.11;
      const wx=19+rx*Math.cos(t),wy=9.5+ry*Math.sin(t),[x,y]=project(wx,wy,.012);
      smallSubjects[3+i]={key:'fish'+i,name:'연못 물고기',x:x/w,y:y/h,visible:true};
      const [aheadX,aheadY]=project(wx-rx*Math.sin(t),wy+ry*Math.cos(t),.012);
      c.save();c.translate(x,y);c.rotate(Math.atan2(aheadY-y,aheadX-x));c.scale(scale/26,scale/26);
      const tail=Math.sin(t*21)*1.25;
      poly(c,[[-2,0],[-6,tail-1.7],[-5,tail+1.5]],'#c38b60');
      oval(c,0,0,3.7,1.45,i===1?'#d9c99b':'#c98956');oval(c,1.3,-.2,1.1,.85,i===1?'#bc7c54':'#e2caa1');
      c.restore();
    }
    for(let i=0;i<40;i++){
      const xx=16+noise(i,155)*6,yy=7+noise(i,98)*5;if(!T.water(Math.floor(xx),Math.floor(yy)))continue;
      const [x,y]=project(xx,yy,.035),sway=Math.sin(s.time*1.3+i);
      if(i%4){
        rect(c,x+sway*1.5,y,scale*(.075+.04*sway),1,'#aac9aa');
      }else{
        oval(c,x,y,scale*.12,scale*.044,'#778d59');rect(c,x-1,y-2,2,2,'#f0cf9c');
      }
    }
    for(let i=0;i<32;i++){
      const x=15.8+noise(i,261)*6.3,y=6.6+noise(i,442)*5.7;
      if(T.water(Math.floor(x),Math.floor(y))||![[.36,0],[-.36,0],[0,.36],[0,-.36]].some(([dx,dy])=>T.water(Math.floor(x+dx),Math.floor(y+dy))))continue;
      const [px,py]=project(x,y,.03),sw=Math.sin(i+s.time)*.05*scale;
      line(c,[px,py],[px-2+sw,py-scale*.19],'#657844',1.4);
      line(c,[px+1,py],[px+3+sw,py-scale*.24],'#889456',1);
      rect(c,px+2+sw,py-scale*.27,1.5,3,'#a68550');
    }
    // A small spiral of incense rises from the stone altar in front of the hall.
    const [ax,ay]=project(9.5,9.5,.84);
    for(let j=0;j<8;j++){
      const v=((s.time*.26+j/8)%1),drift=Math.sin(v*6+s.time*.6)*v*scale*.12;
      rect(c,ax+drift,ay-v*scale*.48,1+v*1.4,1,'rgba(239,232,205,'+(.39*(1-v))+')');
    }
  }
  function weather(s){
    const night=clamp((Math.cos(s.clock/1440*TAU)-.02)*1.13);
    const dusk=Math.exp(-Math.pow((s.clock-1090)/90,2));
    c.fillStyle='rgba(53,60,90,'+(.45*night)+')';c.fillRect(0,0,w,h);
    c.fillStyle='rgba(224,146,83,'+(dusk*.15)+')';c.fillRect(0,0,w,h);
    if(night>.05){
      for(const p of T.props.filter(p=>p.kind==='lantern')){
        const [x,y]=project(p.x+.5,p.y+.5,.63),r=scale*.34;
        const light=c.createRadialGradient(x,y,0,x,y,r);
        light.addColorStop(0,'rgba(255,211,119,'+night*.58+')');light.addColorStop(1,'#f0cda400');
        c.fillStyle=light;c.fillRect(x-r,y-r,r*2,r*2);
      }
    }
    c.fillStyle='rgba(219,227,206,'+(s.mist*.24)+')';c.fillRect(0,0,w,h);
    c.fillStyle='rgba(58,84,89,'+(s.rain*.18)+')';c.fillRect(0,0,w,h);
    if(s.rain>.015){
      for(let i=0;i<100;i++){
        const x=((noise(i,23)*w-s.time*17) % w+w)%w, y=(noise(i,17)*h+s.time*(73+i%8))%h;
        line(c,[x,y],[x-2,y+5],'rgba(226,234,213,'+(.4*s.rain)+')');
      }
    }
    for(let i=0;i<17;i++){
      const x=((noise(i,891)*w+s.time*(3+i%4))%w),y=(noise(i,456)*h+s.time*(2+i%3)+Math.sin(s.time*.7+i)*3)%h;
      rect(c,x,y,1.5+Math.sin(s.time+i),1,'rgba(239,194,113,'+(.68*(1-s.rain))+')');
    }
  }
  // Static halls are rasterized once per settled view. Moving foliage stays live.
  const hallImages=new Map();
  function drawHall(b,settled){
    if(!settled){building(b);return;}
    const key=[angle,scale,w,h].join(',');
    let art=hallImages.get(b);
    if(!art||art.key!==key){
      const pts=[];
      for(const x of [b.x-.8,b.x+b.w+.8])for(const y of [b.y-.8,b.y+b.d+.8])for(const z of [0,b.h+2])pts.push(project(x,y,z));
      const left=Math.floor(Math.min(...pts.map(p=>p[0])))-3,top=Math.floor(Math.min(...pts.map(p=>p[1])))-3;
      const img=surface(Math.ceil(Math.max(...pts.map(p=>p[0]))-left+4),Math.ceil(Math.max(...pts.map(p=>p[1]))-top+4));
      const display=c;c=img.getContext('2d');c.translate(-left,-top);
      try{building(b);}finally{c=display;}
      art={key,img,left,top};hallImages.set(b,art);
    }
    c.drawImage(art.img,art.left,art.top);
  }
  function inside(b,p){return p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.d;}
  function roomView(b,s,occupants){
    const {x,y,w:width,d}=b,mid=Math.floor(x+width/2)+.5;
    const floor=(x1,y1,ww,dd,col,z=0)=>poly(c,[[x1,y1],[x1+ww,y1],[x1+ww,y1+dd],[x1,y1+dd]].map(v=>project(...v,z)),col);
    floor(x,y,width,d,'#8b624a');
    for(let j=0;j<d*2;j++)floor(x+.07,y+j*.5+.04,width-.14,.43,j%2?'#dcb48a':'#cda47c');
    const corners=[[x,y],[x+width,y],[x+width,y+d],[x,y+d]];
    for(let i=0;i<4;i++)if([-cs,sn,cs,-sn][i]<0){
      const a=corners[i],e=corners[(i+1)%4],P=(v,z)=>project(...v,z);
      poly(c,[P(a,0),P(e,0),P(e,1.12),P(a,1.12)],'#e9d6ac');
      line(c,P(a,.22),P(e,.22),'#98694e',scale*.09);
      line(c,P(a,1.12),P(e,1.12),'#805c48',scale*.12);
      for(let j=0;j<=4;j++){const v=[mix(a[0],e[0],j/4),mix(a[1],e[1],j/4)];line(c,P(v,0),P(v,1.12),'#97654d',scale*.09);}
    }
    const things=[];
    function furnish(xx,yy,draw){
      things.push({z:depth(xx,yy),draw:()=>{const [px,py]=project(xx,yy);c.save();c.translate(px,py);c.scale(scale/20,scale/20);draw();c.restore();}});
    }
    function cushion(xx,yy,col,spread=1){
      const d=.18+.66*spread;
      floor(xx-.59,yy-.42,1.18,d,'#765252');
      floor(xx-.52,yy-.39,1.04,d-.06,col,.035);
    }
    if(b.room==='shrine'){
      const preparing=inside(b,s)&&T.visits[s.id][0]===b.name;
      cushion(mid,y+d-1.5,'#c88573',preparing?(s.phase==='walk'?0:s.phase==='orient'?T.smooth(s.age):1):0);
      furnish(mid,y+.65,()=>{
        c.scale(b.name==='대웅전'?1.35:1,b.name==='대웅전'?1.35:1);
        rect(c,-13,-5,26,5,'#965d43');rect(c,-14,-7,28,2,'#c99357');
        for(const xx of [-9,-3,3,9])rect(c,xx-2,-4,4,2,'#c9a568');
        oval(c,0,-20,8,10,'#ba8650');oval(c,0,-20,7.3,9.3,'#e5c47e');
        oval(c,0,-8,7,2,'#ae7751');oval(c,0,-10,6.5,2.6,'#deb45d');
        poly(c,[[-5,-11],[-3,-18],[0,-20],[3,-18],[5,-11]],'#c08b43');
        line(c,[-2.5,-18],[2,-12],'#f1d18a',1.2);
        oval(c,0,-21,3.25,3.7,'#e6b867');oval(c,0,-24,3.15,1.9,'#78664c');oval(c,0,-26,1.1,1.1,'#78664c');
        for(const xx of [-1.4,1.4])line(c,[xx-.5,-21],[xx+.45,-21],'#8c6946',.55);
        oval(c,-2.3,-15,1.1,2,'#eaca83');oval(c,2,-12.8,1.7,.85,'#eaca83');
        for(const side of [-10,10]){rect(c,side,-12,1.5,5,'#fff0c5');oval(c,side+.7,-13,1,1.7,'#efac4d');}
      });
      furnish(mid+1,y+d-1.8,()=>{rect(c,-4,-3,9,3,'#80543d');poly(c,[[-4,-4],[0,-3],[4,-4],[4,-6],[0,-5],[-4,-6]],'#f3e4b7');});
    }else if(b.room==='zen'){
      for(const xx of [mid-1,mid,mid+1])cushion(xx,y+d-1.5,'#829c89');
      furnish(mid,y+.65,()=>{rect(c,-7,-3,14,3,'#926b51');oval(c,0,-4,3.4,1.9,'#766752');rect(c,0,-9,1,5,'#ac8662');});
    }else if(b.room==='kitchen'){
      furnish(mid,y+.75,()=>{
        rect(c,-11,-7,22,7,'#99795d');rect(c,-4,-5,8,5,'#594a40');oval(c,0,-2,2.6,1.7,'#e99d5e');
        oval(c,0,-8,7,4,'#575f5b');oval(c,0,-10,7.5,2,'#89928a');
        for(let i=0;i<3;i++){const t=(s.time*.45+i/3)%1;oval(c,Math.sin(5*t)*2,-12-t*7,1+t,1.4,'rgba(255,246,223,'+(.7*(1-t))+')');}
      });
      furnish(mid+1.5,y+2,()=>{rect(c,-5,-5,10,2,'#956f52');rect(c,-4,-3,2,3,'#755944');oval(c,1,-6,3,1.5,'#e7dfba');});
    }else{
      for(const xx of [mid-1,mid+1]){floor(xx-.45,y+.4,.9,1.25,'#879b9a');floor(xx-.38,y+.5,.76,.34,'#f1dfbd');}
      furnish(x+.8,y+d-1,()=>{rect(c,-5,-7,10,7,'#896448');rect(c,-4,-5,8,1,'#bb9165');rect(c,0,-4,1,1,'#e8d39c');});
    }
    things.push(...occupants);
    things.sort((a,b)=>a.z-b.z).forEach(t=>t.draw());
  }
  const rooms=T.halls.filter(b=>b.room);
  const cutaway=surface(1,1);
  function cutWindow({actor,height}, companion){
    const x=companion?(actor.x+companion.x)/2:actor.x;
    const y=companion?(actor.y+companion.y)/2:actor.y;
    const [px,py]=project(x,y,companion?.42:height);
    const radius=Math.max(1,Math.ceil(scale*(companion?1.45:1.14)));
    return {x:px,y:py,radius,left:Math.round(px-radius),top:Math.round(py-radius)};
  }
  function overlaps(cut,minX,minY,maxX,maxY){
    const {x,y,radius:r}=cut;
    return minX<x+r&&maxX>x-r&&minY<y+r&&maxY>y-r;
  }
  function drawThroughWindow(draw,cut){
    const {radius:r,left,top}=cut,size=r*2;
    // Mask only the current foreground object. Restoring older scene pixels here
    // would erase actors and furniture already drawn in front of the protagonist.
    c.save();
    c.beginPath();c.rect(0,0,w,h);c.rect(left,top,size,size);c.clip('evenodd');
    draw();c.restore();

    if(cutaway.width!==size){cutaway.width=size;cutaway.height=size;}
    const patch=cutaway.getContext('2d'),display=c;
    patch.clearRect(0,0,size,size);patch.imageSmoothingEnabled=false;
    patch.save();patch.translate(-left,-top);c=patch;
    try{draw();}finally{c=display;patch.restore();}
    const feather=patch.createRadialGradient(r,r,0,r,r,r);
    feather.addColorStop(0,'rgba(0,0,0,.97)');
    feather.addColorStop(.60,'rgba(0,0,0,.91)');
    feather.addColorStop(1,'transparent');
    patch.save();patch.globalCompositeOperation='destination-out';patch.fillStyle=feather;
    patch.fillRect(0,0,size,size);patch.restore();
    c.drawImage(cutaway,left,top);
  }
  function actorSlot(items,entry){
    const actor=entry.actor,px=project(actor.x,actor.y)[0];
    let slot=items.findIndex(item=>item.z>entry.z);
    if(slot<0)slot=items.length;
    let lo=0,hi=items.length;
    for(let i=0;i<items.length;i++){
      const hall=items[i].hall;
      if(!hall)continue;
      const {x,y,w,d}=hall;
      const across=[x,x+w].flatMap(xx=>[y,y+d].map(yy=>project(xx,yy)[0]));
      if(px<Math.min(...across)||px>Math.max(...across))continue;
      const front=(sn>0?actor.x>=x+w:actor.x<=x)||(cs>0?actor.y>=y+d:actor.y<=y);
      if(front)lo=Math.max(lo,i+1);else hi=Math.min(hi,i);
    }
    return Math.min(hi,Math.max(lo,slot));
  }
  // Apply paper grain to cached scenery before drawing the pixel sprites.
  const paper=surface(128,128),pg=paper.getContext('2d');
  const grain=pg.createImageData(128,128);
  for(let i=0;i<128*128;i++){
    const n=noise(i,147),j=i*4;
    grain.data[j]=grain.data[j+1]=grain.data[j+2]=n>.5?255:70;
    grain.data[j+3]=Math.round(19*Math.abs(2*n-1));
  }
  pg.putImageData(grain,0,0);
  function textureScenery(ctx){
    ctx.save();ctx.globalCompositeOperation='source-atop';ctx.fillStyle=ctx.createPattern(paper,'repeat');
    ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();
  }
  textureScenery(g);
  function render(s,a,settled,{visitor,protagonist,observed,room,animalEmote,easterFigures}){
    angle=a;cs=Math.cos(a);sn=Math.sin(a);
    mountains(s);
    oval(c,ox+scale*.25,oy+scale*1.18,scale*19.2,scale*8.5,'#435c5524');
    terrain();gardens(s);pondLife(s);
    const items=[];
    const {dog,birds}=s.animals;
    const {white,cat,cone}=s.animals;
    const [bx,by]=project(18,12.5,.04);
    oval(c,bx,by,scale*.25,scale*.10,'#856b51');oval(c,bx,by-scale*.045,scale*.20,scale*.065,'#a4c6b9');
    const guests=s.retreat.stage==='overnight'?[]:s.retreat.people;
    const cast=[
      {actor:s,height:.85,draw:()=>monk(s)},
      {actor:visitor,height:.80,draw:()=>visitorFigure(visitor)},
      {actor:dog,height:.30,draw:()=>drawDog(dog,s.time,s.meeting,animalEmote('dog'))},
      {actor:white,height:.30,draw:()=>drawDog(white,s.time,null,animalEmote('white'))},
      {actor:cat,height:.25,draw:()=>drawCat(cat,s.time,animalEmote('cat'))},
      ...guests.map((actor,i)=>({actor,height:.65,draw:()=>guestFigure(actor,i,s)})),
      ...easterFigures.map(actor=>({actor,height:.45,draw:()=>drawProcession(actor)}))
    ];
    const occupants=new Map(rooms.map(hall=>[hall,[]])),outdoors=[];
    for(const entry of cast){
      entry.z=depth(entry.actor.x,entry.actor.y);
      entry.room=rooms.find(hall=>inside(hall,entry.actor));
      if(entry.room)occupants.get(entry.room).push(entry);
      else outdoors.push(entry);
    }
    if(cone.visible){
      const carry=s.animals.group.kind==='return',wx=carry?white.x:cone.x,wy=carry?white.y:cone.y;
      items.push({z:depth(wx,wy)+.05,draw:()=>{const [x,y]=project(wx,wy,carry?.35:.04);oval(c,x,y,scale*.12,scale*.075,'#715237');rect(c,x-1,y-1,2,1,'#bf9966');}});
    }
    const twilight=T.smooth((Math.cos(s.clock/1440*TAU)+.18)*2.4)*(1-s.rain);
    if(twilight>.025){
      for(let i=0;i<12;i++){
        const x=(i%2?16.2:7.3)+noise(i,63)*2+.25*Math.sin(s.time*.55+i);
        const y=(i%2?11.2:15.7)+noise(i,72)*1.3+.2*Math.cos(s.time*.44+i);
        const z=.36+.27*Math.sin(s.time*.73+i),light=twilight*(.5+.5*Math.sin(s.time*1.4+i*2.1))**2;
        items.push({z:depth(x,y),draw:()=>{
          const [px,py]=project(x,y,z);oval(c,px,py,scale*.12,scale*.12,'rgba(235,218,118,'+light*.19+')');
          rect(c,px,py,1.7,1.7,'rgba(255,242,146,'+light+')');
        }});
      }
    }
    birds.forEach((b,i)=>{
      const z=b.flight&&b.z>3.3?Infinity:depth(b.x,b.y)+.02;
      items.push({z,draw:()=>drawBird(b,i,s.time)});
    });
    for(const p of T.props){
      const x=p.x+.5,y=p.y+.5,[xx,yy]=project(x,y);
      const tree=['pine','maple','gold'].includes(p.kind);
      oval(c,xx+scale*.13,yy+scale*.04,scale*(tree?.55:.24)*p.size,scale*(tree?.19:.10)*p.size,'#51604147');
      items.push({z:depth(x,y),draw:cut=>{
        const paint=()=>sprite(p,s.time),k=scale/31*p.size;
        if(tree&&cut&&overlaps(cut,xx-36*k,yy-75*k,xx+36*k,yy+4*k))drawThroughWindow(paint,cut);
        else paint();
      }});
    }
    for(const hall of T.halls){
      const {x,y,w,d}=hall;
      const shade=[[x,y],[x+w,y],[x+w+.55,y+d+.45],[x+.55,y+d+.45]];
      poly(c,shade.map(([xx,yy])=>project(xx,yy)),'#55634847');
      items.push({z:depth(x+w/2,y+d/2),hall,draw:cut=>{
        let opening=0;
        if(hall.room){
          const people=occupants.get(hall),doorX=Math.floor(x+w/2)+.5,doorY=y+d;
          const distance=Math.min(...[s,visitor,protagonist||s,...guests].map(p=>Math.hypot(p.x-doorX,p.y-doorY)));
          opening=people.length||hall.name===room?1:T.smooth(1-distance);
          if(opening>0)roomView(hall,s,people);
        }
        if(opening===1)return;
        const shell=()=>{
          c.save();c.globalAlpha=1-opening;drawHall(hall,settled);c.restore();
        };
        if(cut){
          const xs=[],ys=[];
          for(const xx of [x-.8,x+w+.8])for(const yy of [y-.8,y+d+.8])for(const z of [0,hall.h+2]){
            const [px,py]=project(xx,yy,z);xs.push(px);ys.push(py);
          }
          if(overlaps(cut,Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys))){
            drawThroughWindow(shell,cut);return;
          }
        }
        shell();
      }});
    }
    items.sort((a,b)=>a.z-b.z);
    for(const entry of outdoors.sort((a,b)=>a.z-b.z))items.splice(actorSlot(items,entry),0,entry);
    const lead=cast.find(entry=>entry.actor===(protagonist||observed||s))||cast[0];
    const companion=!protagonist&&lead.actor===s&&s.meeting?.phase==='pet'
      ? cast.find(entry=>entry.actor===dog) : null;
    const order=entry=>entry.room?items.findIndex(item=>item.hall===entry.room):items.indexOf(entry);
    const cutSlot=companion?Math.max(order(lead),order(companion)):order(lead);
    const cut=cutWindow(lead,companion?.actor);
    items.forEach((item,i)=>item.draw(i>cutSlot?cut:null));
    weather(s);
  }
  resize();window.addEventListener('resize',resize);
  function position(s,height=.56){
    const [x,y]=project(s.x,s.y,height);
    return {x:x/w,y:y/h,size:scale/w};
  }
  return {render,resize,position,smallSubjects};
}
