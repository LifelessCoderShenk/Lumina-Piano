const {app,BrowserWindow,ipcMain,session}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
const root=path.resolve(__dirname,'../.tmp/create-4k-smoke');
const ffmpeg=require('ffmpeg-static');
const durationSeconds=Number(process.env.LUMINA_STRESS_SECONDS || 60);
if(!Number.isFinite(durationSeconds)||durationSeconds<2||durationSeconds>1800)throw new Error('LUMINA_STRESS_SECONDS must be between 2 and 1800');
app.setPath('userData',path.join(root,'profile'));
function checked(value) {
 const resolved=path.resolve(value);
 if(!resolved.startsWith(root+path.sep)) throw new Error('Test path escaped its workspace');
 return resolved;
}
app.whenReady().then(async()=>{
 await fs.mkdir(root,{recursive:true});
 const temps=new Set();
 ipcMain.on('stress:progress',(_,p)=>console.log('EXPORT_PROGRESS',p));
 ipcMain.handle('stress:temp',async()=>{const dir=await fs.mkdtemp(path.join(root,'take-'));temps.add(dir);return dir;});
 ipcMain.handle('stress:mkdir',(_,p)=>fs.mkdir(checked(p),{recursive:true}));
 ipcMain.handle('stress:writeFile',(_,p,data)=>{const target=checked(p);if(target===path.join(root,'failed.mp4'))throw new Error('Injected disk-full failure');return fs.writeFile(target,data);});
 ipcMain.handle('stress:readFile',(_,p)=>fs.readFile(checked(p)));
 ipcMain.handle('stress:rm',async(_,p)=>{const dir=checked(p);if(!temps.has(dir))throw new Error('Only test temporary directories may be removed');await fs.rm(dir,{recursive:true,force:true});temps.delete(dir);});
 ipcMain.handle('stress:ffmpeg',(_,args)=>execute(ffmpeg,args,{windowsHide:true,timeout:180000,maxBuffer:8*1024*1024}));
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^wss?:/.test(details.url) || (/^https?:/.test(details.url)&&!details.url.startsWith('http://localhost:5173/'))}));
 const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(__dirname,'export-stress-preload.cjs')}});
 win.webContents.setAudioMuted(true);
 try {
  await win.loadURL('http://localhost:5173/scripts/readiness-smoke.html');
  const output=path.join(root,'performance.mp4');
  await fs.writeFile(path.join(root,'failed.mp4'),'previous export');
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const {useAppStore}=await import('/src/store/store.ts');
   const {loadProjectData}=await import('/src/midi/loadMidiProject.ts');
   const {ThreeRenderer}=await import('/src/renderer/ThreeRenderer.ts');
   const {registerActiveVisualizerRenderer}=await import('/src/renderer/activeVisualizerRenderer.ts');
   const {ExportEngine}=await import('/src/export/ExportEngine.ts');
   const project={ticksPerQuarter:480,totalTicks:1920,tempoMap:[{tick:0,bpm:120,microsecondsPerBeat:500000}],timeSignatures:[{tick:0,numerator:4,denominator:4}],tracks:[{id:'test',name:'Test',channel:0,notes:[60,64,67].map((pitch,i)=>({id:'note'+i,pitch,velocity:90,startTick:i*120,endTick:1200,visualEndTick:1200,sustainEndTick:1920}))}]};
   const {cameraSystem}=await import('/src/camera/CameraSystem.ts');cameraSystem.init(1280,720);
   await loadProjectData(project);
   useAppStore.setState({viewportWidth:1280,viewportHeight:720,visualizerSettings:{aspectRatio:'16:9',resolution:'4K',framerate:30}});
   useAppStore.getState().setParticleSettings({enabled:true});
   const canvas=document.createElement('canvas');document.body.append(canvas);
   const renderer=new ThreeRenderer();await renderer.init(canvas);renderer.resize(1280,720);registerActiveVisualizerRenderer(renderer);
   const previousSize={width:canvas.width,height:canvas.height};
   const engine=new ExportEngine();let frames=0;
   engine.onProgress(p=>{frames=Math.max(frames,p.framesRendered);window.stressProgress(p.phase);});
   await engine.export({outputPath:${JSON.stringify(output)},includeAudio:true});
   if(useAppStore.getState().isExporting)throw new Error('Export flag stuck');
   if(canvas.width!==previousSize.width||canvas.height!==previousSize.height)throw new Error('Preview dimensions not restored '+JSON.stringify({previousSize,after:{width:canvas.width,height:canvas.height},store:{width:useAppStore.getState().viewportWidth,height:useAppStore.getState().viewportHeight}}));
   await renderer.destroy();registerActiveVisualizerRenderer(null);
   return {frames,previewRestored:true};
  })()`);
  await execute(ffmpeg,['-v','error','-i',output,'-f','null','-'],{windowsHide:true,timeout:180000});
  if(temps.size)throw new Error('Temporary export files leaked');
  console.log('CREATE_4K_PASS',JSON.stringify({...result,bytes:(await fs.stat(output)).size,decoded:true,tempDirectoriesRemaining:temps.size}));app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
