"""Assemble an explicitly edited walkthrough from real UI captures and export."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
ffmpeg=root/'node_modules/ffmpeg-static/ffmpeg.exe'
out=root/'website/capture/output'
media=root/'website/public/media'
def run(*args):
    subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-nostdin','-y',*map(str,args)],check=True)
shots=[('01-import.png',3),('02-loaded.png',2),('03-wrong-note.png',3),('04-corrected.png',3),('05-style.png',3),('06-export-settings.png',2),('07-exported.png',2)]
manifest=''.join(f"file '../workflow-stills/{name}'\nduration {duration}\n" for name,duration in shots)+"file '../workflow-stills/07-exported.png'\n"
(out/'stills.txt').write_text(manifest,encoding='utf-8')
run('-f','concat','-safe','0','-i',out/'stills.txt','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','18','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1','-r','60','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k',out/'guide.mp4')
run('-i',out/'workflow-performance.mp4','-vf','scale=1280:720,setsar=1','-r','60','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000',out/'result.mp4')
(out/'join.txt').write_text("file 'guide.mp4'\nfile 'result.mp4'\n",encoding='utf-8')
run('-f','concat','-safe','0','-i',out/'join.txt','-c','copy','-movflags','+faststart',media/'lumina-workflow.mp4')
run('-ss','8','-i',out/'workflow-performance.mp4','-frames:v','1','-q:v','2',media/'lumina-workflow-poster.jpg')
(media/'lumina-workflow.vtt').write_text('''WEBVTT

00:00.000 --> 00:05.000
Import MIDI

00:05.000 --> 00:11.000
Correct a note

00:11.000 --> 00:14.000
Choose your look

00:14.000 --> 00:18.000
Export

00:18.000 --> 00:41.800
[Piano music]
''',encoding='utf-8')
print('Assembled guide and captions.')
