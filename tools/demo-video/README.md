# Demo video

`record.js` drives the real page with Playwright and records the walkthrough shown in the "Full video" section (`media/co2trace-demo-{es,en}.mp4` and their `.jpg` posters). It hovers the example gallery, opens Your own data (the account box: types the company, continues without an account), types the setup and the first ledger lines of the bottler example (Agua Mineral Cerro Alto in Spanish, Blue Mesa Sparkling Water in English), then loads the full example with `index.html?demo=agua`, opens the activity data, attaches a bill, verifies it, walks the dashboard and exports. Captions, title cards and a visible cursor are overlaid during recording. Frames come from the DevTools screencast and are encoded to H.264 with ffmpeg.

Sound: `audio.js` synthesises an upbeat corporate-style music bed (I–V–vi–IV at 104 BPM) and UI sound effects (click, key, whoosh, pop, chime) at the cues `record.js` logs, and the WAV is muxed into the MP4 as AAC. Everything is generated from code, so there are no samples or music licences to track.

Re-record after visible design changes:

```sh
cd /tmp/demo-video && npm init -y && npm i playwright@1 ffmpeg-static@5 && npx playwright install chromium
cp <repo>/tools/demo-video/record.js <repo>/tools/demo-video/audio.js .
(cd <repo> && python3 -m http.server 8731 --bind 127.0.0.1 &)
node record.js es http://127.0.0.1:8731/index.html . && node record.js en http://127.0.0.1:8731/index.html .
cp co2trace-demo-*.mp4 co2trace-demo-*.jpg <repo>/media/
```

Update the length in the "Full video" eyebrow (`#demo`) if it changes. Keep the example figures in `example()`, the scroll walkthrough (`#how`, `data-en` / `data-es-n` counts) and the video in step.
