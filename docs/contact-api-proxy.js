#!/usr/bin/env node
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const PORT = 3456;
const CONTACT_HTML_FILE = path.join(__dirname, 'contact-api-tester.html');
const SUPPLIER_CUSTOMER_HTML_FILE = path.join(__dirname, 'supplier-customer-api-tester.html');
const DEPARTMENT_HTML_FILE = path.join(__dirname, 'department-api-tester.html');

function formatTime() {
    const now = new Date();
    return now.toISOString();
}

function truncate(str, maxLen = 200) {
    if (!str || typeof str !== 'string') {
        return '';
    }
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

function logRequest(method, targetUrl, reqBody) {
    console.log('\n' + '─'.repeat(60));
    console.log(`[${formatTime()}] 代理请求`);
    console.log('─'.repeat(60));
    console.log(`  方法: ${method}`);
    console.log(`  目标: ${targetUrl}`);
    if (reqBody) {
        const preview = truncate(reqBody, 500);
        console.log(`  请求体: ${preview}`);
    }
}

function logResponse(status, statusText, body, durationMs, err) {
    const statusColor = status >= 200 && status < 300 ? '\x1b[32m' : '\x1b[31m'; // green/red
    const reset = '\x1b[0m';
    console.log(`  响应: ${statusColor}${status} ${statusText}${reset}`);
    console.log(`  耗时: ${durationMs}ms`);
    if (body) {
        const len = typeof body === 'string' ? body.length : 0;
        const preview = truncate(body, 300);
        console.log(`  响应体长度: ${len} 字符`);
        console.log(`  响应体预览: ${preview}`);
    }
    if (err) {
        console.log(`  \x1b[31m错误: ${err.message}\x1b[0m`);
    }
    console.log('─'.repeat(60) + '\n');
}

function getClient(url) {
    return url.startsWith('https') ? https : http;
}

function fetchUrl(url, method, headers, body) {
    return new Promise((resolve, reject) => {
        const client = getClient(url);
        const parsed = new URL(url);
        const opts = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method,
            headers: {
                ...headers,
                host: parsed.host,
            },
        };
        if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
            opts.headers['content-length'] = Buffer.byteLength(body);
        }
        const req = client.request(opts, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    body: Buffer.concat(chunks).toString(),
                });
            });
        });
        req.on('error', reject);
        if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
            req.write(body);
        }
        req.end();
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    if (url.pathname === '/proxy' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) {
            body += chunk;
        }
        const start = Date.now();
        try {
            const {targetUrl, method, headers, body: reqBody} = JSON.parse(body);
            logRequest(method, targetUrl, reqBody || undefined);

            const result = await fetchUrl(targetUrl, method, headers || {}, reqBody || '');
            const duration = Date.now() - start;
            logResponse(result.status, result.statusText, result.body, duration);

            res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
            res.end(JSON.stringify(result));
        } catch (e) {
            const duration = Date.now() - start;
            logResponse(500, 'Proxy Error', e.message, duration, e);

            res.writeHead(500, {'Content-Type': 'application/json; charset=utf-8'});
            res.end(JSON.stringify({status: 500, statusText: 'Proxy Error', body: e.message}));
        }
        return;
    }

    if (url.pathname === '/' || url.pathname === '/contact-api-tester.html') {
        fs.readFile(CONTACT_HTML_FILE, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('500 - Failed to read HTML');
                return;
            }
            res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
            res.end(data);
        });
        return;
    }

    if (url.pathname === '/supplier-customer-api-tester.html') {
        fs.readFile(SUPPLIER_CUSTOMER_HTML_FILE, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('500 - Failed to read HTML');
                return;
            }
            res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
            res.end(data);
        });
        return;
    }

    if (url.pathname === '/department-api-tester.html') {
        fs.readFile(DEPARTMENT_HTML_FILE, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('500 - Failed to read HTML');
                return;
            }
            res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
            res.end(data);
        });
        return;
    }

    res.writeHead(404);
    res.end('404 - Not Found');
});

server.listen(PORT, () => {
    console.log('\n  API 测试工具代理已启动（Contact / Supplier-Customer / Department）');
    console.log(`  请在浏览器访问: http://localhost:${PORT}/contact-api-tester.html`);
    console.log(`  请在浏览器访问: http://localhost:${PORT}/supplier-customer-api-tester.html`);
    console.log(`  请在浏览器访问: http://localhost:${PORT}/department-api-tester.html\n`);
});
