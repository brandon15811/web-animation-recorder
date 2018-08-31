# web-animation-recorder

Using the [Puppeteer](https://github.com/GoogleChrome/puppeteer)/[Chrome Dev Tools](https://github.com/ChromeDevTools/devtools-protocol) API, this runs CSS animations step by step, and takes screenshots at each step to produce videos.

## Requirements
 - [FFmpeg](https://www.ffmpeg.org/)
 - CSS Animation or [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)  powered animation 
    - Javascript powered animations are not supported at the time


## Usage
```
usage: record.js [-h] [--fps FPS] [--index INDEX] selector address

Record CSS animations from a website. Output will be written to output.mp4

Positional arguments:
  selector       CSS selector to record
  address        Website address of animation to record

Optional arguments:
  -h, --help     Show this help message and exit.
  --fps FPS      Frames per second to record at (default: 30)
  --index INDEX  Animation index to choose, try a different index if the
                 wrong animation is recorded (default: 0)
```

## Demos (Click images for full quality links)

### [Animista Logo](http://animista.net)

[![Animista](https://thumbs.gfycat.com/AshamedDownrightCreature-size_restricted.gif)](https://gfycat.com/AshamedDownrightCreature)

### [CSS Xbox One Achievement](https://codepen.io/djekl/pen/jqVKXV) by [Alan Wynn](https://codepen.io/djekl)

[![CSS Xbox One Achievement](https://thumbs.gfycat.com/SmartBriskAsiaticlesserfreshwaterclam-size_restricted.gif)](https://gfycat.com/SmartBriskAsiaticlesserfreshwaterclam)

### [Cubewave 11](https://codepen.io/cobra_winfrey/pen/VGPGjr) by [Adam Kuhn](https://codepen.io/cobra_winfrey)

[![Cubewave 11](https://thumbs.gfycat.com/IllustriousObeseBelugawhale-size_restricted.gif)](https://gfycat.com/IllustriousObeseBelugawhale)
