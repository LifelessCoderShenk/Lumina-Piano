"""Assemble an explicitly edited walkthrough from real UI captures and export."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
ffmpeg=root/'node_modules/ffmpeg-static/ffmpeg.exe'
out=root/'website/capture/output'
media=root/'website/public/media'
def run(*args):
    subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-nostdin','-y',*map(str,args)],check=True)
shots=[('01-import.png',4),('02-loaded.png',3),('03-wrong-note.png',4),('04-corrected.png',4),('05-style.png',5),('06-export-settings.png',4),('07-exported.png',3)]
manifest=''.join(f"file '../workflow-stills/{name}'\nduration {duration}\n" for name,duration in shots)+"file '../workflow-stills/07-exported.png'\n"
(out/'stills.txt').write_text(manifest,encoding='utf-8')
run('-f','concat','-safe','0','-i',out/'stills.txt','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','27','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1','-r','30','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k',out/'guide.mp4')
run('-i',out/'workflow-performance.mp4','-vf','scale=1280:720,setsar=1','-r','30','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000',out/'result.mp4')
(out/'join.txt').write_text("file 'guide.mp4'\nfile 'result.mp4'\n",encoding='utf-8')
run('-f','concat','-safe','0','-i',out/'join.txt','-c','copy','-movflags','+faststart',media/'lumina-workflow.mp4')
run('-i',root/'website/capture/workflow-stills/02-loaded.png','-frames:v','1','-q:v','2',media/'lumina-workflow-poster.jpg')
(media/'lumina-workflow.vtt').write_text('''WEBVTT

00:00.000 --> 00:04.000
1. Import a piece with Add MIDI.
A guided edit of real Lumina app captures.

00:04.000 --> 00:07.000
The original eight-bar miniature is loaded.

00:07.000 --> 00:11.000
2. Select the first melody note.
F5 is a deliberate mistake in this example.

00:11.000 --> 00:15.000
Move it down one semitone to E5.
Keep the rest of the performance.

00:15.000 --> 00:20.000
3. Choose a look and enable generated hands.
Set the output to 16:9, 1080p, 30 fps.

00:20.000 --> 00:24.000
4. Export with Include Audio enabled.

00:24.000 --> 00:27.000
The export is complete.
Next: the resulting piano video.

00:27.000 --> 00:32.000
[Piano music]
Lumina-generated hands follow the corrected MIDI.

00:32.000 --> 00:50.800
[Piano music continues]
''',encoding='utf-8')
print('Assembled guide and captions.')
