"""Create a captioned walkthrough from authentic app captures and its export."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
ffmpeg = root / 'node_modules/ffmpeg-static/ffmpeg.exe'
out = root / 'website/capture/output'
media = root / 'website/public/media'
stills = root / 'website/capture/workflow-stills'
out.mkdir(exist_ok=True)

def run(*args):
    subprocess.run([str(ffmpeg), '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', *map(str, args)], check=True)

# Preserve the entire frame; captions get their own space below the app.
frame = 'scale=1280:624:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:0:color=0x0b0b0d,setsar=1'
shots = [
    ('01-import.png', 3, '01  /  IMPORT', 'Open your MIDI file'),
    ('02-loaded.png', 3, '01  /  IMPORT', 'Your performance is ready to edit'),
    ('03-wrong-note.png', 3, '02  /  EDIT', 'Select the note you want to change'),
    ('04-corrected.png', 3, '02  /  EDIT', 'Correct its pitch without another take'),
    ('05-style.png', 4, '03  /  STYLE', 'Choose your colors and effects'),
    ('06-export-settings.png', 3, '04  /  EXPORT', 'Set the video quality'),
    ('07-export-dialog.png', 3, '04  /  EXPORT', 'Save your finished performance'),
]
segments = []
for i, (name, duration, title, caption) in enumerate(shots):
    target = out / f'chapter-{i}.mp4'
    filters = frame + f",drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='{title}':fontsize=16:fontcolor=0xaac9df:x=32:y=643,drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='{caption}':fontsize=27:fontcolor=white:x=32:y=670,fade=t=in:st=0:d=0.18,fade=t=out:st={duration-0.18}:d=0.18"
    run('-loop', '1', '-i', stills / name, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', duration, '-vf', filters, '-r', '60', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', target)
    segments.append(target.name)
result = out / 'polished-result.mp4'
run('-i', out / 'workflow-performance.mp4', '-vf', frame + ",drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='THE FINISHED PERFORMANCE':fontsize=16:fontcolor=0xaac9df:x=32:y=643,drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='Made in Lumina Piano':fontsize=27:fontcolor=white:x=32:y=670,fade=t=in:st=0:d=0.3", '-af', 'afade=t=in:st=0:d=0.3', '-r', '60', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', result)
segments.append(result.name)
(out / 'polished-join.txt').write_text(''.join(f"file '{name}'\n" for name in segments), encoding='utf-8')
run('-f', 'concat', '-safe', '0', '-i', out / 'polished-join.txt', '-c', 'copy', '-movflags', '+faststart', media / 'lumina-workflow.mp4')
run('-ss', '13', '-i', media / 'lumina-workflow.mp4', '-frames:v', '1', '-q:v', '2', media / 'lumina-workflow-poster.jpg')
print('Created walkthrough with embedded captions.')
