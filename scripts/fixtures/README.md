# WAN reference fixture

`wan3-reference-overrun.mp4` is a synthetic blue 256×256 video with silent AAC audio. Its H.264 track uses B-frames and lasts 15.208333 seconds, reproducing an encoder overrun in a nominal 15-second reference. It contains no user media.

Generated with:

```sh
ffmpeg -f lavfi -i color=c=blue:s=256x256:r=24 -f lavfi -i anullsrc=r=48000:cl=stereo -t 15.2 -c:v libx264 -pix_fmt yuv420p -g 48 -bf 3 -c:a aac -b:a 32k -movflags +faststart wan3-reference-overrun.mp4
```

The tests use this checked-in fixture; FFmpeg is not needed to run them.
