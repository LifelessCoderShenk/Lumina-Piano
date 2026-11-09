const {app,BrowserWindow,ipcMain,session}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
const root=path.resolve(__dirname,'../.tmp/full-export-stress');
const ffmpeg=require('ffmpeg-static');
app.setPath('userData',path.join(root,'profile'));
function checked(value) {
 const resolved=path.resolve(value);
 if(!resolved.startsWith(root+path.sep)) throw new Error('Test path escaped its workspace');
 return resolved;
}
app.whenReady().then(async()=>{
 await fs.mkdir(root,{recursive:true});
 const temps=new Set();
 ipcMain.handle('stress:temp',async()=>{const dir=await fs.mkdtemp(path.join(root,'take-'));temps.add(dir);return dir;});
 ipcMain.handle('stress:mkdir',(_,p)=>fs.mkdir(checked(p),{recursive:true}));
 ipcMain.handle('stress:writeFile',(_,p,data)=>{const target=checked(p);if(target===path.join(root,'failed.mp4'))throw new Error('Injected disk-full failure');return fs.writeFile(target,data);});
 ipcMain.handle('stress:readFile',(_,p)=>fs.readFile(checked(p)));
 ipcMain.handle('stress:rm',async(_,p)=>{const dir=checked(p);if(!temps.has(dir))throw new Error('Only test temporary directories may be removed');await fs.rm(dir,{recursive:true,force:true});temps.delete(dir);});
 ipcMain.handle('stress:ffmpeg',(_,args)=>execute(ffmpeg,args,{windowsHide:true,timeout:180000,maxBuffer:8*1024*1024}));
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/.test(details.url)&&!details.url.startsWith('http://localhost:5173/')}));
 const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(__dirname,'export-stress-preload.cjs')}});
 win.webContents.setAudioMuted(true);
 try {
  await win.loadURL('http://localhost:5173/scripts/readiness-smoke.html');
  const output=path.join(root,'performance.mp4');
  await fs.writeFile(path.join(root,'failed.mp4'),'previous export');
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const {exportPerformanceVideo}=await import('/src/transcription/videoExport.ts');
   const {renderSampledPiano}=await import('/src/audio/renderSampledPiano.ts');
   const {normalizeTranscriptionSettings}=await import('/src/transcription/settings.ts');
   const notes=Array.from({length:240},(_,i)=>({id:'n'+i,pitch:48+i%24,channel:0,velocity:70+i%40,startMs:i*250,keyEndMs:i*250+150,endMs:i*250+400}));
   const settings=normalizeTranscriptionSettings({title:'Export stress fixture',keySignature:'C',bpm:120});
   const audio=await renderSampledPiano(notes,61);
   const start=performance.now();
   await exportPerformanceVideo(notes,settings,${JSON.stringify(output)},'mp4',{durationMs:60000,audio});
   const elapsedMs=performance.now()-start;
   const controller=new AbortController();
   let canceled=false;
   try {await exportPerformanceVideo(notes,settings,${JSON.stringify(path.join(root,'canceled.mp4'))},'mp4',{durationMs:60000,audio,signal:controller.signal,onProgress:p=>{if(p>0)controller.abort();}})}
   catch(error){if(error.name!=='AbortError')throw error;canceled=true;}
   if(!canceled)throw new Error('Cancellation was ignored');
   let writeFailure=false;
   try {await exportPerformanceVideo(notes.slice(0,8),settings,${JSON.stringify(path.join(root,'failed.mp4'))},'mp4',{durationMs:2000,audio});}
   catch(error){if(!error.message.includes('Injected disk-full failure'))throw error;writeFailure=true;}
   if(!writeFailure)throw new Error('Injected write failure was ignored');
   return {elapsedMs,canceled,writeFailure};
  })()`);
  await execute(ffmpeg,['-v','error','-i',output,'-f','null','-'],{windowsHide:true,timeout:180000});
  if(temps.size)throw new Error('Temporary export files leaked');
  const canceledExists=await fs.stat(path.join(root,'canceled.mp4')).then(()=>true,()=>false);
  if(canceledExists)throw new Error('Canceled export wrote final output');
  if(await fs.readFile(path.join(root,'failed.mp4'),'utf8')!=='previous export')throw new Error('Failed export replaced previous output');
  console.log('FULL_EXPORT_PASS',JSON.stringify({...result,bytes:(await fs.stat(output)).size,decoded:true,tempDirectoriesRemaining:temps.size}));app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
