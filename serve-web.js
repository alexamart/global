import { createServer } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { join, resolve, extname, normalize } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const siteRoot = resolve(__dirname, 'globalgames');
const port = Number(process.env.PORT || 5174);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveRequestPath(requestPath) {
  const urlPath = new URL(requestPath, 'http://localhost').pathname;
  if (urlPath === '/' || urlPath === '/web' || urlPath === '/web/' || urlPath === '/web/index.html') {
    return '/index.html';
  }

  if (urlPath.startsWith('/web/')) {
    return urlPath.slice('/web'.length) || '/index.html';
  }

  return urlPath;
}

function resolveFilePath(requestPath) {
  const relativePath = resolveRequestPath(requestPath);
  const normalized = normalize(relativePath).replace(/^\\+/, '');
  const candidate = resolve(siteRoot, normalized.startsWith('/') ? normalized.slice(1) : normalized);

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  if (!extname(candidate)) {
    const withHtml = `${candidate}.html`;
    if (existsSync(withHtml) && statSync(withHtml).isFile()) {
      return withHtml;
    }
  }

  const indexCandidate = resolve(siteRoot, 'index.html');
  return indexCandidate;
}

function sendFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
}

const BACKEND_BASE = `http://localhost:${process.env.BACKEND_PORT || 4100}`;

async function proxyApiRequest(req, res, requestUrl) {
  const targetUrl = new URL(requestUrl, BACKEND_BASE).toString();
  const headers = { ...req.headers };
  delete headers.host;

  const backendResponse = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
  });

  const responseHeaders = {};
  for (const [key, value] of backendResponse.headers.entries()) {
    responseHeaders[key] = value;
  }

  res.writeHead(backendResponse.status, responseHeaders);
  if (backendResponse.body) {
    backendResponse.body.pipe(res);
  } else {
    res.end();
  }
}

const server = createServer((req, res) => {
  const requestUrl = req.url || '/';
  const url = new URL(requestUrl, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    proxyApiRequest(req, res, url.pathname + url.search).catch((error) => {
      console.error('API proxy error:', error);
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad gateway');
    });
    return;
  }

  try {
    const filePath = resolveFilePath(requestUrl);
    sendFile(res, filePath);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

const listenHost = '::';
server.listen(port, listenHost, () => {
  console.log(`Serving Global Games at http://localhost:${port}/web`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && listenHost === '::') {
    console.warn(`IPv6 listen failed on port ${port}; retrying on 0.0.0.0`);
    server.listen(port, '0.0.0.0');
    return;
  }

  console.error(error);
  process.exit(1);
});
