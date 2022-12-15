import { launch } from 'puppeteer-core';
import EventEmitter from "eventemitter3";
import * as fs from 'fs';
import path from 'path';
import { waitFor } from './utils.js';
import Server from './server.js';

export class Burner extends EventEmitter {
  constructor({useLog=true}={}) {
    super();
    this._start = performance.now();
    this._timer = this._start;
    this.enableLog(useLog);
  }

  enableLog(enable) {
    this.useLog = enable;
  }

  log(...args) {
    if (!this.useLog) return;
    console.log(...args, {
      cost: Number(((performance.now() - this._timer) * 0.001).toFixed(3)), 
      total: Number(((performance.now() - this._start) * 0.001).toFixed(3))
    });
    this._timer = performance.now();
  }

  async burn(options, filename) {
    if (this.burning) return;
    this.burning = true;
    const { executablePath, downloadPath } = options;
    this.log('Starting browser:', executablePath);
    const browser = await launch({
      // headless: false, devtools: true,
      // slowMo: 250, // slow down by 250ms
      args: ["--use-gl=egl"],
      executablePath,
    });

    const browserVersion = await browser.version();
    this.log('Browser ready!', browserVersion);
    this.emit('progress', { progress: 0.01, state: 'BrowserReady', browserVersion });

    const page = await browser.newPage();
    page.on('console', msg => {
      const txt = msg.text().trim();
      if (txt.includes('PixiJS')) return;
      if (txt.startsWith('preloading ') && txt.endsWith('%')) {
        const p = txt.replace('preloading ', '').replace('%', '');
        if (!isNaN(p)) this.emit('progress', { 
          progress: 0.1 + (0.2 * Number(p) * 0.01), 
          state: 'Preloading'
        });
        this.log('Player:', txt);
      } else if (txt.startsWith('burning ') && txt.endsWith('x') && txt.split(' ').length === 3) {
        let [ _, p, speed ] = txt.split(' ');
        p = p.replace('%', '');
        if (!isNaN(p)) this.emit('progress', { 
          progress: 0.3 + (0.6 * Number(p) * 0.01), 
          state: 'Burning', speed,
        });
        this.log('Burner:', txt);
      } else {
        return this.useLog && console.log('PAGE LOG:', txt);
      }
    });
    this.log('Tab ready!');

    const svr = new Server();
    const url = await svr.start(options);
    this.log('Serve on:', url);
  
    await page.goto(url);
    this.log('Page loaded!');
    this.emit('progress', { progress: 0.1, state: 'PageLoaded', url });
  
    const meta = await page.evaluate(async () => {
      return new Promise(async (resolve) => {
        const sleep = (ms) => {
          return new Promise(resolve => setTimeout(resolve, ms));
        }
  
        const ss = performance.now();
        while (performance.now() - ss < (10 * 1000)) {
          if (window.player?.core) break;
          await sleep(100);
        }
  
        const playerUI = window.player;
        if (!playerUI.core) return resolve({});
  
        if (playerUI.core.duration) return resolve({ duration: playerUI.core.duration });
        playerUI.on('loadedmetadata', async (meta) => resolve(meta));
      });
    });
  
    this.log('Player ready!', meta);
    this.emit('progress', { progress: 0.3, state: 'PlayerReady', meta });

    await page._client().send('Page.setDownloadBehavior', {
      behavior: 'allow', downloadPath,
    });
  
    const info = await page.evaluate(async (filename) => {
      const playerUI = window.player || player;
      return await playerUI.export(filename);
    }, filename);
    this.log('Burn done!', info);

    this.emit('progress', { progress: 0.95, state: 'BurnDone', info });

    const filepath = path.resolve(downloadPath, filename);
    await waitFor(() => fs.existsSync(filepath));

    const fileinfo = fs.statSync(filepath);
    if (fileinfo.size !== info.byteLength) {
      console.error('file size error!', fileinfo.size, info.byteLength);
    }

    this.log('Saved:', filepath);
    this.emit('progress', { progress: 0.99, state: 'Saved', filepath });
    await browser.close();
    await svr.stop();
    this.burning = false;
    this.emit('progress', { progress: 1, state: 'Done' });
  }
}

// npm run burn xxx.json|.xml [output.mp4]
if (process.argv.length >= 3) {
  let executablePath = process.env['PIXI_BURNER_EXECPATH'] || '/Applications/Thorium.app/Contents/MacOS/Thorium';

  const input = path.resolve(process.argv[2]);
  const output = process.argv[3] ? path.resolve(process.argv[3]) : '';

  // default set
  const sourceNames = path.basename(input).split('.');
  sourceNames.pop();
  let filename = sourceNames.join('.') + '.mp4';
  let downloadPath = path.dirname(input);

  if (output) {
    if (output.toLowerCase().endsWith('.mp4')) {
      downloadPath = path.dirname(output);
      filename = path.basename(output);
    } else { // output give as folder path
      downloadPath = output;
    }
  }

  const opts = {
    host: 'https://cos.mirav.cn/player',
    // host: 'http://localhost:8008/dist', min: false, // for debug
    // cache: true,
    value: fs.readFileSync(process.argv[2], 'utf8'),
    executablePath,
    downloadPath,
  };

  (async () => {
    const burner = new Burner();
    await burner.burn(opts, filename);
    process.exit(0); // exit express
  })();
}