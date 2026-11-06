const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
app.setPath('userData', path.join(__dirname, '../.tmp/readiness-smoke-profile'));
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: /^https?:/.test(details.url) && !details.url.startsWith('http://localhost:5173/') });
  });
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.webContents.setAudioMuted(true);
  try {
    await win.loadURL('http://localhost:5173/scripts/readiness-smoke.html');
    const result = await win.webContents.executeJavaScript(`(async () => {
      const { renderSampledPiano } = await import('/src/audio/renderSampledPiano.ts');
      const notes = [{pitch:60,velocity:100,startMs:0,endMs:2000}, {pitch:64,velocity:80,startMs:500,endMs:2300}, {pitch:60,velocity:60,startMs:1000,endMs:2500}];
      const buffer = await renderSampledPiano(notes);
      const data = buffer.getChannelData(0);
      const rms = (start,end) => Math.sqrt(data.slice(start*44100,end*44100).reduce((sum,v)=>sum+v*v,0)/((end-start)*44100));
      let peak=0; for (const value of data) { if(!Number.isFinite(value)) throw new Error('Non-finite audio'); peak=Math.max(peak,Math.abs(value)); }
      const result={duration:buffer.duration,channels:buffer.numberOfChannels,peak,sustainRms:rms(1.8,2),tailRms:rms(3.1,3.4)};
      if(result.peak<=0 || result.peak>=1 || result.sustainRms<=0 || result.tailRms>0.000001) throw new Error(JSON.stringify(result));
      return result;
    })()`);
    console.log('AUDIO_SMOKE_PASS', JSON.stringify(result));
    await win.webContents.executeJavaScript(`(async () => {
      const { useAppStore } = await import('/src/store/store.ts');
      const { createLuminaProjectDocument } = await import('/src/project/luminaProject.ts');
      const { writeRecovery } = await import('/src/project/recoveryStorage.ts');
      useAppStore.setState({ projectData: { ticksPerQuarter:480,totalTicks:1920,
        tempoMap:[{tick:0,bpm:120,microsecondsPerBeat:500000}],timeSignatures:[{tick:0,numerator:4,denominator:4}],
        tracks:[{id:'qa',name:'QA',channel:0,notes:[{id:'note',pitch:60,velocity:80,startTick:0,endTick:480,visualEndTick:480,sustainEndTick:1920}]}]
      }});
      await writeRecovery(createLuminaProjectDocument(useAppStore.getState(),'QA recovery'));
    })()`);
    await win.loadURL('http://localhost:5173/scripts/readiness-smoke.html');
    const recovered = await win.webContents.executeJavaScript(`(async () => {
      const { readRecovery, writeRecovery } = await import('/src/project/recoveryStorage.ts');
      const document = await readRecovery();
      if(document?.name !== 'QA recovery' || document.projectData.tracks[0].notes[0].sustainEndTick !== 1920) throw new Error('Recovery did not survive reload');
      await writeRecovery(null);
      if(await readRecovery() !== null) throw new Error('Discard did not persist');
      return {persistedAcrossReload:true,pedalPreserved:true,discardVerified:true};
    })()`);
    console.log('RECOVERY_SMOKE_PASS',JSON.stringify(recovered));
    app.exit(0);
  } catch(error) { console.error(error); app.exit(1); }
});
