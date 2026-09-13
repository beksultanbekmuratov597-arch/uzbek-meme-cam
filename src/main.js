const MP_VERSION = "0.10.22-rc.20250304";
const MP_MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/+esm`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const el = {
  video: document.querySelector("#camera"),
  overlay: document.querySelector("#overlay"),
  meme: document.querySelector("#meme"),
  caption: document.querySelector("#caption"),
  status: document.querySelector("#status"),
  gesture: document.querySelector("#gesture"),
  confidence: document.querySelector("#confidence"),
  hint: document.querySelector("#cameraHint")
};

const ctx = el.overlay.getContext("2d");
let config, landmarker, lastVideoTime = -1, stableGesture = null, stableFrames = 0, activeGesture = null;
let demo = false, demoIndex = 0;

const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

init();

async function init(){
  config = await fetch("./config/memes.json").then(r=>r.json());
  showMeme(config.memes.find(m=>m.gesture===config.defaultGesture) || config.memes[0]);
  bindKeys();

  try{
    el.status.textContent = "Kamera ruxsati kutilmoqda…";
    await startCamera();
    el.status.textContent = "Kamera ulandi · model yuklanmoqda…";
  }catch(err){
    console.error("Camera error:", err);
    el.status.textContent = "Kamera ruxsati kerak";
    el.hint.textContent = "Safari kameraga ruxsat so‘rashi kerak";
    requestAnimationFrame(loop);
    return;
  }

  requestAnimationFrame(loop);

  try{
    el.status.textContent = "1/3 · MediaPipe JS yuklanmoqda…";

    const { FilesetResolver, HandLandmarker } = await import(MP_MODULE_URL);

    el.status.textContent = "2/3 · WASM yuklanmoqda…";
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    el.status.textContent = "3/3 · Hand model yuklanmoqda…";
    const modelResponse = await fetch(MODEL_URL, { cache: "force-cache" });
    if(!modelResponse.ok){
      throw new Error("Model HTTP " + modelResponse.status);
    }
    const modelBuffer = new Uint8Array(await modelResponse.arrayBuffer());

    const common = {
      runningMode:"VIDEO",
      numHands:2,
      minHandDetectionConfidence:.35,
      minHandPresenceConfidence:.35,
      minTrackingConfidence:.4
    };

    try{
      landmarker = await HandLandmarker.createFromOptions(vision,{
        ...common,
        baseOptions:{
          modelAssetBuffer:modelBuffer,
          delegate:"GPU"
        }
      });
      el.status.textContent = "Tayyor · GPU";
    }catch(gpuError){
      console.warn("GPU delegate ishlamadi, CPU ga o'tildi:", gpuError);

      landmarker = await HandLandmarker.createFromOptions(vision,{
        ...common,
        baseOptions:{
          modelAssetBuffer:modelBuffer
        }
      });

      el.status.textContent = "Tayyor · CPU";
    }

    el.hint.textContent = "Qo‘l ishorasini ko‘rsating";
  }catch(err){
    console.error("MediaPipe error:", err);
    const message = err?.message || String(err);
    el.status.textContent = "Model xatosi · " + message.slice(0, 70);
    el.hint.textContent = "MediaPipe: " + message.slice(0, 150);
  }
}

async function startCamera(){
  const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:false});
  el.video.srcObject = stream;
  await el.video.play();
  el.hint.textContent = "Qo‘l ishorasini ko‘rsating";
}

function bindKeys(){
  document.addEventListener("keydown",e=>{
    if(e.key.toLowerCase()==="d"){demo=!demo;el.status.textContent=demo?"Demo rejimi":"Tayyor"; if(demo) runDemo();}
    const i=Number(e.key)-1;
    if(Number.isInteger(i)&&config?.memes[i]) showMeme(config.memes[i],true);
  });
}

function runDemo(){
  if(!demo) return;
  const meme=config.memes[demoIndex++%config.memes.length];
  commit(meme.gesture,.99,true);
  setTimeout(runDemo,1300);
}

function loop(now){
  resize();
  if(!demo && landmarker && el.video.readyState>=2 && el.video.currentTime!==lastVideoTime){
    lastVideoTime=el.video.currentTime;

    try{
      const result=landmarker.detectForVideo(el.video,now);
      const hands=result.landmarks || [];
      draw(hands);

      if(!hands.length){
        el.status.textContent="Model ishlayapti · qo‘l topilmadi";
        stabilize(null,0);
      }else{
        const detected=classify(hands);
        if(detected){
          el.status.textContent="Qo‘l topildi · "+detected.gesture;
          stabilize(detected.gesture,detected.score);
        }else{
          el.status.textContent="Qo‘l topildi · gesture noma’lum";
          el.gesture.textContent="hand";
          el.confidence.textContent="—";
          stabilize(null,0);
        }
      }
    }catch(err){
      console.error("detectForVideo error:",err);
      el.status.textContent="Recognition xatosi";
    }
  }
  requestAnimationFrame(loop);
}

function classify(hands){
  if(hands.length>=2){
    const a=features(hands[0]);
    const b=features(hands[1]);
    if(a.fist&&b.fist) return {gesture:"double_fist",score:.96};
  }

  if(!hands.length) return null;
  const f=features(hands[0]);

  if(f.pinch) return {gesture:"pinch",score:.97};
  if(f.thumbUp) return {gesture:"thumbs_up",score:.96};
  if(f.index&&f.middle&&!f.ring&&!f.pinky) return {gesture:"peace",score:.95};
  if(f.index&&!f.middle&&!f.ring&&!f.pinky) return {gesture:"point",score:.94};
  if(f.index&&!f.middle&&!f.ring&&f.pinky) return {gesture:"rock",score:.93};
  if(!f.index&&!f.middle&&!f.ring&&f.pinky&&f.thumb) return {gesture:"shaka",score:.93};
  if(f.openPalm) return {gesture:"open_palm",score:.92};
  if(f.fist) return {gesture:"fist",score:.94};

  return null;
}

function features(lm){
  const palm=Math.max(dist(lm[0],lm[9]),.001);

  const ext=(tip,pip,mcp)=>{
    const straight=jointAngle(lm[mcp],lm[pip],lm[tip])>145;
    const awayFromPalm=dist(lm[tip],lm[0])>dist(lm[pip],lm[0])*1.015;
    const length=dist(lm[tip],lm[mcp])>palm*.48;
    return straight&&awayFromPalm&&length;
  };

  const index=ext(8,6,5);
  const middle=ext(12,10,9);
  const ring=ext(16,14,13);
  const pinky=ext(20,18,17);

  const thumbSpread=dist(lm[4],lm[5])/palm;
  const thumbReach=dist(lm[4],lm[0])/Math.max(dist(lm[3],lm[0]),.001);
  const thumb=thumbSpread>.52&&thumbReach>.96;
  const thumbUp=thumb
    && lm[4].y < lm[3].y
    && lm[4].y < lm[2].y
    && lm[4].y < lm[0].y - palm*.12;

  const pinch=dist(lm[4],lm[8])/palm<.34;
  const openCount=[index,middle,ring,pinky].filter(Boolean).length;

  return {
    index,
    middle,
    ring,
    pinky,
    thumb,
    thumbUp,
    pinch,
    openPalm:openCount>=4,
    fist:openCount===0&&!pinch&&!thumb
  };
}

function stabilize(gesture,score){
  el.gesture.textContent=gesture || "—";
  el.confidence.textContent=Math.round(score*100)+"%";
  if(gesture===stableGesture) stableFrames++; else {stableGesture=gesture;stableFrames=1;}
  if(gesture && stableFrames>=config.holdFrames && gesture!==activeGesture) commit(gesture,score);
}

function commit(gesture,score,force=false){
  const meme=config.memes.find(m=>m.gesture===gesture);
  if(!meme) return;
  activeGesture=gesture;
  showMeme(meme,force);
  el.gesture.textContent=gesture;
  el.confidence.textContent=Math.round(score*100)+"%";
}

function showMeme(meme){
  el.meme.src=meme.image;
  el.caption.textContent=meme.label;
  el.meme.classList.remove("pop");
  void el.meme.offsetWidth;
  el.meme.classList.add("pop");
}

function draw(hands){
  ctx.clearRect(0,0,el.overlay.width,el.overlay.height);
  ctx.save();
  ctx.strokeStyle="rgba(68,240,177,.9)";
  ctx.fillStyle="#fff";
  ctx.lineWidth=3*devicePixelRatio;
  ctx.shadowColor="rgba(68,240,177,.6)";
  ctx.shadowBlur=12*devicePixelRatio;
  for(const lm of hands){
    const pts=lm.map(p=>({x:(1-p.x)*el.overlay.width,y:p.y*el.overlay.height}));
    for(const [a,b] of connections){ctx.beginPath();ctx.moveTo(pts[a].x,pts[a].y);ctx.lineTo(pts[b].x,pts[b].y);ctx.stroke();}
    pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,3.2*devicePixelRatio,0,Math.PI*2);ctx.fill();});
  }
  ctx.restore();
}

function resize(){
  const r=el.overlay.getBoundingClientRect(), d=devicePixelRatio||1, w=Math.round(r.width*d), h=Math.round(r.height*d);
  if(el.overlay.width!==w||el.overlay.height!==h){el.overlay.width=w;el.overlay.height=h;}
}

function jointAngle(a,b,c){
  const ab={x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)};
  const cb={x:c.x-b.x,y:c.y-b.y,z:(c.z||0)-(b.z||0)};
  const dot=ab.x*cb.x+ab.y*cb.y+ab.z*cb.z;
  const mag=Math.max(Math.hypot(ab.x,ab.y,ab.z)*Math.hypot(cb.x,cb.y,cb.z),.000001);
  const cos=Math.max(-1,Math.min(1,dot/mag));
  return Math.acos(cos)*180/Math.PI;
}

function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));}
