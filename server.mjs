import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import build from './build.mjs'

const staticFolder = './dist'
let wsServer;

const MIME_TYPES = {
  html: 'text/html; charset=UTF-8',
  json: 'application/json; charset=UTF-8',
  js: 'application/javascript; charset=UTF-8',
  css: 'text/css',
  png: 'image/png',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

const HEADERS = {
  'X-XSS-Protection': '1; mode=block',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000; includeSubdomains; preload',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const serveStatic = (staticPath) => async (req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(staticPath, url);
  try {
    let data = await fs.promises.readFile(filePath);
    const fileExt = path.extname(filePath).substring(1);
    const mimeType = MIME_TYPES[fileExt] || MIME_TYPES.html;
    if (fileExt === 'html') {
      data = `${data}
    <script>
    function connect() {
      let ws = new WebSocket('ws://' + window.location.host);
      console.log('Live reload server connected');

      ws.onmessage = (event) => {
        if (event.data === 'reload') window.location.reload();
      };

      ws.onclose = () => {
        console.log('Connection lost. Attempting to reconnect...');
        setTimeout(connect, 5000);
      };
    }
    connect();
    </script>`
    }
    res.writeHead(200, { ...HEADERS, 'Content-Type': mimeType });
    res.end(data);
  } catch (err) {
    res.statusCode = 404;
    res.end('"File is not found"');
  }
};

const watch = (path) => {
  fs.watch(path, () => {
    wsServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('reload');
      }
    });
  });
};

class Server {
  constructor() {
    const staticPath = path.join('.', staticFolder);
    this.staticHandler = serveStatic(staticPath);
    this.httpServer = http.createServer();
    const port = 4000;
    this.listen(port);
    console.log(`API on port ${port}`);
  }

  listen(port) {
    this.httpServer.on('request', async (req, res) => {
      this.staticHandler(req, res);
    });
    wsServer = new WebSocketServer({ server: this.httpServer });
    this.httpServer.listen(port);
  }
}

build();
watch(staticFolder);
new Server();