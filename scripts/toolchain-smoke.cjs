const fs = require('node:fs/promises');
const path = require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../.tmp/toolchain-smoke');await fs.mkdir(path.join(root,'input/nested'),{recursive:true});
 await fs.writeFile(path.join(root,'input/nested/note.txt'),'archive round trip');
 for(const [index,location] of ['.','node_modules/@electron/packager','node_modules/@electron/universal'].entries()){
  const loader=require('node:module').createRequire(path.resolve(__dirname,'..',location,'package.json'));const asar=await import(require('node:url').pathToFileURL(loader.resolve('@electron/asar')).href);const output=path.join(root,index+'.asar');
  await asar.createPackage(path.join(root,'input'),output);
  if(asar.extractFile(output,'nested/note.txt').toString()!=='archive round trip')throw new Error('Archive mismatch');
 }
 console.log('ARCHIVE_COMPATIBILITY_PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
