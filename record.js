const fs = require('fs');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const ArgumentParser = require('argparse').ArgumentParser;

//TODO: Comment this out when publishing
// import { Protocol } from "devtools-protocol/types/protocol"

class WebAnimationRecorder {
    constructor(selector, url, framesPerSecond, animationIndex) {
        this.selector = selector;
        this.url = url;
        this.framesPerSecond = framesPerSecond;
        this.animationIndex = animationIndex;
    }

    async setupBrowser() {
        this.browser = await puppeteer.launch({
            /*
            * Notes about disabling headless mode here:
            * 
            * The screen will flash heavily while recording
            * 
            * Each screenshot will focus the window (so several times per second),
            * so the computer will be unusable while the recording is running
            * Close chrome itself instead of the program to stop the recording if needed
            * while recording with headless mode disabled
            */
            headless: true,
        });
        this.page = await this.browser.newPage();

        this.client = await this.page.target().createCDPSession();
        /**
         * Used to make calls like Animation.enable() instead of client.send('Animation.enable')
         *  
         * @type Protocol.ProtocolApi 
         * */
        this.cdp = this.createProxy(this.client);
    }

    async gatherAnimations() {
        /** 
         * @typedef AnimationGroup
         * @prop {number} startTime
         * @prop {Array<Protocol.Animation.Animation>} list
         */

        /** @type Array<AnimationGroup> */
        this.animationGroups = [];
        this.lastAnimationTime = null;

        this.containerObject = null;
        this.selectorPromise = new Promise(async (resolve) => {
            console.log('Waiting for selector to become active');
            await this.page.waitForSelector(this.selector, {
                visible: true,
                timeout: 10000
            });

            console.log('Gathering animations');

            const rootNode = await this.cdp.DOM.getDocument();

            const containerNode = await this.cdp.DOM.querySelector({
                nodeId: rootNode.root.nodeId,
                selector: this.selector
            });
            this.containerObject = await this.cdp.DOM.resolveNode({ nodeId: containerNode.nodeId });
            resolve();
        })

        const animationStartedCallback = this.animationStarted.bind(this);
        this.client.on('Animation.animationStarted', animationStartedCallback);

        await this.cdp.Animation.enable();

        await this.page.goto(this.url, { waitUntil: 'networkidle2' });

        await new Promise((resolve) => {
            const waitInterval = setInterval(() => {
                if (this.lastAnimationTime !== null && new Date().getTime() > this.lastAnimationTime + 2000) {
                    clearInterval(waitInterval);
                    resolve();
                }
            }, 1000);
        })
        this.client.removeListener('Animation.animationStarted', animationStartedCallback);
    }

    async prepareRecording() {
        console.log('Getting ready to record');
        let currentTime = 0;
        console.log('Total animations found:', this.animationGroups.length);

        if (this.animationIndex > this.animationGroups.length - 1) {
            throw new Error('Animation index provided is greater than total animations')
        }

        //Figure out how long the animation lasts
        this.animationLength = this.animationGroups[this.animationIndex].list.reduce(function (a, b) {
            return Math.max(a, b.source.delay + b.source.duration);
        }, 0);
        const area = await this.page.$(this.selector);

        this.animationIDList = this.animationGroups[this.animationIndex].list.map(x => x.id);

        this.interval = 1000 / this.framesPerSecond;
        this.maxBounds = {
            width: 0,
            height: 0,
            x: Infinity,
            y: Infinity
        };

        //Calculate max bounds of animation so recording captures the whole animation
        while (currentTime < this.animationLength) {
            await this.cdp.Animation.seekAnimations({
                animations: this.animationIDList,
                currentTime: currentTime
            });

            const boundingBox = await area.boundingBox();
            this.maxBounds.width = Math.round(Math.max(boundingBox.width, this.maxBounds.width));
            this.maxBounds.height = Math.round(Math.max(boundingBox.height, this.maxBounds.height));
            this.maxBounds.x = Math.round(Math.min(boundingBox.x, this.maxBounds.x));
            this.maxBounds.y = Math.round(Math.min(boundingBox.y, this.maxBounds.y));
            currentTime = currentTime + this.interval;
        }

        //Make height and width even for ffmpeg
        if (this.maxBounds.height % 2 !== 0) this.maxBounds.height++;
        if (this.maxBounds.width % 2 !== 0) this.maxBounds.width++;

        this.ffmpeg = spawn('ffmpeg', [
            '-y', //Overwrite output file
            '-framerate', this.framesPerSecond,
            '-f', 'image2pipe',
            '-i', '-',
            '-c:v', 'libx264',
            '-profile:v', 'high',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            'output.mp4'
        ]);


        this.ffmpeg.on('close', (code) => {
            if (code !== 0) {
                console.error('ffmpeg encountered an error. Check ffmpeg.log for more details')
            }
        });

        const logWriteStream = fs.createWriteStream('ffmpeg.log');

        this.ffmpeg.stdout.pipe(logWriteStream);
        this.ffmpeg.stderr.pipe(logWriteStream);
    }

    async record() {
        let currentTime = 0;
        let lastPercentage;

        //Log progress
        const progressInterval = setInterval(() => {
            lastPercentage = Math.round((currentTime / this.animationLength) * 100);
            console.log(`${lastPercentage}% done`);
        }, 3000);

        console.log('Starting recording');

        //Actually make screenshots
        while (currentTime < this.animationLength) {
            await this.cdp.Animation.seekAnimations({
                animations: this.animationIDList,
                currentTime: currentTime
            });

            const pic = await this.page.screenshot({
                omitBackground: true,
                clip: this.maxBounds
            });
            this.ffmpeg.stdin.write(pic);
            currentTime = currentTime + this.interval;
        }

        clearInterval(progressInterval);
        if (lastPercentage !== 100) console.log('100% done');
        await this.browser.close();
        this.ffmpeg.stdin.end();
        console.log('Recording is available at output.mp4');
    }

    /** @param {Protocol.Animation.AnimationStartedEvent} event */
    async animationStarted(event) {
        //Wait until the containerObject variable is set
        await this.selectorPromise;

        this.lastAnimationTime = new Date().getTime();

        const animNode = await this.cdp.DOM.resolveNode({ backendNodeId: event.animation.source.backendNodeId });

        //Check if animation is inside selector
        const result = await this.cdp.Runtime.callFunctionOn({
            functionDeclaration: 'function ' + this.containsNodeHelper.toString(),
            objectId: this.containerObject.object.objectId,
            arguments: [
                {
                    objectId: animNode.object.objectId
                }
            ],
            returnByValue: true
        });
        if (!result.result.value) {
            return;
        }

        await this.cdp.Animation.setPaused({ animations: [event.animation.id], paused: true });
        //Animations are grouped by start time
        const group = this.animationGroups.find(x => x.startTime === event.animation.startTime);

        if (group) {
            group.list.push(event.animation);
        } else {
            const newGroup = {
                startTime: event.animation.startTime,
                list: [
                    event.animation
                ]
            }
            this.animationGroups.push(newGroup);
        }
    }

    //Used to make calls like Animation.enable() instead of client.send('Animation.enable')
    createProxy(client) {
        return new Proxy({}, {
            get: function (outerTarget, outerProp) {
                return new Proxy({}, {
                    get: function (innerTarget, innerProp) {
                        return function (arg) {
                            return client.send(`${outerProp}.${innerProp}`, arg);
                        }
                    }
                });;
            }
        });
    }

    //Passed into Runtime.callFunctionOn
    containsNodeHelper(childNode) {
        return this.contains(childNode);
    }
}

async function run() {
    const parser = new ArgumentParser({
        description: 'Record CSS animations from a website. Output will be written to output.mp4'
    });

    parser.addArgument('--fps', {
        help: 'Frames per second to record at (default: 30)',
        defaultValue: 30,
        type: 'int',
    })
    parser.addArgument('--index', {
        help: 'Animation index to choose, try a different index if the wrong animation is recorded (default: 0)',
        defaultValue: 0,
        type: 'int'
    })
    parser.addArgument('selector', {
        help: 'CSS selector to record'
    })
    parser.addArgument('address', {
        help: 'Website address of animation to record'
    })
    
    const args = parser.parseArgs();

    const recorder = new WebAnimationRecorder(args.selector, args.address, args.fps, args.index);
    await recorder.setupBrowser();
    await recorder.gatherAnimations();
    await recorder.prepareRecording();
    await recorder.record();
}
run();

//Get stack traces in case the program crashes
process.on('unhandledRejection', (err) => { throw err });