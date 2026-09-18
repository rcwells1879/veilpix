# WAN reference fixture

`wan3-reference-overrun.mp4` is a synthetic blue 256×256 video with silent AAC audio. Its H.264 track uses B-frames and lasts 15.208333 seconds, reproducing an encoder overrun in a nominal 15-second reference. It contains no user media.

Generated with:

```sh
ffmpeg -f lavfi -i color=c=blue:s=256x256:r=24 -f lavfi -i anullsrc=r=48000:cl=stereo -t 15.2 -c:v libx264 -pix_fmt yuv420p -g 48 -bf 3 -c:a aac -b:a 32k -movflags +faststart wan3-reference-overrun.mp4
```

The tests use this checked-in fixture; FFmpeg is not needed to run them.

# Video cut fixtures

`video-cut.mp4` is a synthetic 4-second, 160×96, 24 fps H.264 video with B-frames and an AAC frequency sweep. `video-cut-vfr.mp4` drops every fifth source frame without changing the other timestamps. No user media is included.

Generate with FFmpeg:

```sh
ffmpeg -f lavfi -i 'testsrc2=size=160x96:rate=24:duration=4' -f lavfi -i 'aevalsrc=0.3*sin(2*PI*(220*t+80*t*t)):s=48000:d=4' -c:v libx264 -crf 24 -g 48 -bf 2 -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart scripts/fixtures/video-cut.mp4
ffmpeg -i scripts/fixtures/video-cut.mp4 -vf "select='not(eq(mod(n,5),2))'" -fps_mode vfr -c:v libx264 -crf 24 -c:a copy -movflags +faststart scripts/fixtures/video-cut-vfr.mp4
```

Run `npm run test:video-trim` for timeline, range, padding, and validation checks. For native codec checks, start Vite and open `/veilpix/scripts/check-video-trim-browser.html`, then press **Run export tests**. This exercises center/start/end cuts, single-frame cuts, repeated cuts, variable frame rates, decoded frame comparisons, audio alignment, and browser/container duration agreement. Browser checks need WebCodecs and cannot run in the Node-only CI job.
