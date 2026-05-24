#!/usr/bin/env node
/**
 * 本地静态页 + 极光推送 API 代理（绕过浏览器 CORS）。
 * 用法: node test_demos/jpush_test_server.js
 * 打开: http://127.0.0.1:8765/jpush_test.html
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.JPUSH_TEST_PORT) || 8765;
const JPUSH_HOST = 'api.jpush.cn';
const JPUSH_PATH = '/v3/push';
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, body) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(body));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function proxyToJPush(body, authHeader) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: JPUSH_HOST,
            port: 443,
            path: JPUSH_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': body.length,
            },
        };
        if (authHeader) {
            options.headers.Authorization = authHeader;
        }

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function serveStatic(req, res) {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') {
        urlPath = '/jpush_test.html';
    }
    const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, ''));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
            res.end(err.code === 'ENOENT' ? 'Not Found' : 'Internal Error');
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
        res.end(data);
    });
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        });
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/api/push') {
        try {
            const body = await readBody(req);
            const auth = req.headers.authorization;
            const result = await proxyToJPush(body, auth);
            res.writeHead(result.status, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(result.body);
        } catch (e) {
            sendJson(res, 502, {error: 'proxy_failed', message: e.message});
        }
        return;
    }

    if (req.method === 'GET') {
        serveStatic(req, res);
        return;
    }

    res.writeHead(405);
    res.end('Method Not Allowed');
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`JPush 测试页: http://127.0.0.1:${PORT}/jpush_test.html`);
    console.log('按 Ctrl+C 停止');
});
