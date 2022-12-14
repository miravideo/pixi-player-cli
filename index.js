import { launch } from 'puppeteer-core';
import * as fs from 'fs';
import path from 'path';

// const executablePath  = '/Applications/Thorium.app/Contents/MacOS/Thorium';
const executablePath  = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const downloadPath    = path.resolve('./');
const url = 'http://localhost:8008/test.html';
// const url = 'https://cos.mirav.cn/audio_visualizer/index.html?draftID=c92fe5fa832c4046d64f77e4f03afbd2';

const uuid = () => {
  let d = new Date().getTime();//Timestamp
  let d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      let r = Math.random() * 16;//random number between 0 and 16
      if (d > 0) {//Use timestamp until depleted
          r = (d + r)%16 | 0;
          d = Math.floor(d/16);
      } else {//Use microseconds since page-load if supported
          r = (d2 + r)%16 | 0;
          d2 = Math.floor(d2/16);
      }
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }).toUpperCase();
}

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const waitFor = async (func, timeout=10) => {
  const ss = performance.now();
  while (performance.now() - ss < (timeout * 1000)) {
    if (func()) return true;
    await sleep(100);
    // console.log('waitFor', func, performance.now() - ss);
  }
  return false;
}

const burn = async (data, filename) => {
  let ss = performance.now();

  console.log('start!', executablePath);
  const browser = await launch({
    // headless: false, devtools: true,
    // slowMo: 250, // slow down by 250ms
    args: ["--use-gl=egl"],
    executablePath,
  });

  console.log('browser ready!', await browser.version(), performance.now() - ss);
  ss = performance.now();

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  console.log('tab ready!', performance.now() - ss);
  ss = performance.now();

  await page.goto(url);

  console.log('page loaded!', performance.now() - ss);
  ss = performance.now();

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

  console.log('player ready!', meta, performance.now() - ss);
  ss = performance.now();

  await page._client().send('Page.setDownloadBehavior', {
    behavior: 'allow', downloadPath,
  });
  console.log('set download!', performance.now() - ss);
  ss = performance.now();

  const res = await page.evaluate(async (filename) => {
    const playerUI = window.player || player;
    return await playerUI.export(filename);
  }, filename);

  console.log('burn done!', res, performance.now() - ss);
  ss = performance.now();

  const filepath = path.resolve(downloadPath, filename);
  await waitFor(() => fs.existsSync(filepath));

  const fileinfo = fs.statSync(filepath);
  if (fileinfo.size !== res.byteLength) {
    console.error('file size error!', fileinfo.size, res.byteLength);
  }

  console.log('download complete!', performance.now() - ss);
  await browser.close();
};

burn(null, `test_${uuid()}.mp4`);