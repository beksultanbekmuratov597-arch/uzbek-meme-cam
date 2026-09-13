const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL = "../node_modules/@mediapipe/tasks-vision/wasm";

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
    const { FilesetResolver, HandLandmarker } = await import(
      "../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs"
    );
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    landmarker = await HandLandmarker.createFromOptions(vision,{
      baseOptions:{modelAssetPath:MODEL_URL,delegate:"GPU"},
      runningMode:"VIDEO",
      numHands:2,
      minHandDetectionConfidence:.5,
      minHandPresenceConfidence:.5,
      minTrackingConfidence:.5
    });
    el.status.textContent = "Tayyor";
  }catch(err){
    console.error("MediaPipe error:", err);
    el.status.textContent = "Kamera ishlayapti · model xatosi";
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
    const result=landmarker.detectForVideo(el.video,now);
    draw(result.landmarks || []);
    const detected=classify(result.landmarks || []);
    if(detected) stabilize(detected.gesture,detected.score);
    else stabilize(null,0);
  }
  requestAnimationFrame(loop);
}

function classify(hands){
  if(hands.length>=2){
    const a=features(hands[0]), b=features(hands[1]);
    if(a.fist&&b.fist) return {gesture:"double_fist",score:.92};
  }
  if(!hands.length) return null;
  const f=features(hands[0]);

  if(f.pinch) return {gesture:"pinch",score:.96};
  if(f.index&&f.middle&&!f.ring&&!f.pinky) return {gesture:"peace",score:.92};
  if(f.index&&!f.middle&&!f.ring&&!f.pinky) return {gesture:"point",score:.9};
  if(f.index&&!f.middle&&!f.ring&&f.pinky) return {gesture:"rock",score:.88};
  if(!f.index&&!f.middle&&!f.ring&&!f.pinky&&f.thumb) return {gesture:"shaka",score:.84};
  if(f.openPalm) return {gesture:"open_palm",score:.82};
  if(f.fist) return {gesture:"fist",score:.9};
  return null;
}

function features(lm){
  const palm=Math.max(dist(lm[0],lm[9]),.001);
  const ext=(tip,pip,mcp)=>dist(lm[tip],lm[0])>dist(lm[pip],lm[0])*1.05 && dist(lm[tip],lm[mcp])>palm*.55;
  const index=ext(8,6,5), middle=ext(12,10,9), ring=ext(16,14,13), pinky=ext(20,18,17);
  const thumb=dist(lm[4],lm[5])>palm*.55;
  const pinch=dist(lm[4],lm[8])<palm*.38;
  const count=[index,middle,ring,pinky].filter(Boolean).length;
  return {index,middle,ring,pinky,thumb,pinch,openPalm:count===4,fist:count===0&&!pinch};
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

function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));}
