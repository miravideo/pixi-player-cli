import express from 'express';
import * as fs from 'fs';
import { resolve } from 'path';
import portFinder from 'portfinder';

class Server {
  constructor() {
    this.app = express();
  }

  async start(options) {
    const { app } = this;
    let {
      host, min=true, port,
      // todo: more player config
    } = options;
    if (!host) host = 'https://cos.mirav.cn/player';
    if (!port) port = await portFinder.getPortPromise({ port: 9000 });

    let html = fs.readFileSync('burner.html', 'utf8');
    html = html.replaceAll('{{host}}', host);
    html = html.replaceAll('{{min}}', min ? '.min' : '');
    html = html.replace('{{options}}', JSON.stringify(options));

    app.use(function(req, res, next) {
      res.header("Access-Control-Allow-Origin", "*");
      next();
    });

    app.use('/', (req, res) => {
      res.send(html);
    });

    return new Promise((resolve) => {
      this.server = app.listen(port, () => {
        // console.log(`serve on port ${port}`)
        resolve(`http://localhost:${port}`);
      });
    });
  }

  async stop() {
    this.app = null;
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close((err) => {
          this.server = null;
          resolve();
        });
      });
    }
  }
}

export default Server