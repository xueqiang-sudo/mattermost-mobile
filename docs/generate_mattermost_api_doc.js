/* eslint-disable no-console */
const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs/promises');
const path = require('path');
const YAML = require('yaml');

const execFileAsync = promisify(execFile);

const GITHUB_API_BASE = 'https://api.github.com';
const REPO_PATH = '/repos/mattermost/mattermost/contents/api/v4/source';
const REF = 'master';
const OUTPUT_FILE = path.join(__dirname, 'mattermost_api_doc.md');

async function curlGet(url, headers = []) {
    const args = ['-fsSL', '--http1.1', '--retry', '3', '--retry-delay', '1', '--max-time', '180', ...headers.flatMap((h) => ['-H', h]), url];
    const {stdout} = await execFileAsync('curl', args, {
        maxBuffer: 100 * 1024 * 1024,
        encoding: 'utf8',
    });
    return stdout;
}

async function fetchJson(url) {
    const body = await curlGet(url, [
        'Accept: application/vnd.github+json',
        'User-Agent: mattermost-mobile-api-doc-generator',
    ]);
    return JSON.parse(body);
}

async function loadApiSource() {
    const listUrl = `${GITHUB_API_BASE}${REPO_PATH}?ref=${REF}`;
    const files = await fetchJson(listUrl);
    const yamlFiles = files.
        filter((f) => f.type === 'file' && f.name.endsWith('.yaml')).
        sort((a, b) => yamlFileSortKey(a.name).localeCompare(yamlFileSortKey(b.name)));

    const source = {};
    for (const file of yamlFiles) {
        const fileData = await fetchJson(file.url);
        const encoded = (fileData.content || '').replace(/\n/g, '');
        const text = Buffer.from(encoded, 'base64').toString('utf8');
        source[file.name] = YAML.parse(text);
    }
    return source;
}

function yamlFileSortKey(name) {
    if (name === 'introduction.yaml') {
        return '\u0000';
    }
    if (name === 'definitions.yaml') {
        return '\u0001';
    }
    return name;
}

function anchorize(text) {
    return text.toLowerCase().trim().
        replace(/[`~!@#$%^&*()+={}\[\]|\\:;"'<>,.?/]/g, '').
        replace(/\s+/g, '-');
}

function stringifySchema(schema) {
    if (!schema) {
        return '_无_';
    }

    const lines = [];
    if (schema.$ref) {
        lines.push(`- $ref: \`${schema.$ref}\``);
    }
    if (schema.type) {
        lines.push(`- type: \`${schema.type}\``);
    }
    if (schema.format) {
        lines.push(`- format: \`${schema.format}\``);
    }
    if (schema.enum) {
        lines.push(`- enum: \`${JSON.stringify(schema.enum)}\``);
    }
    if (schema.default !== undefined) {
        lines.push(`- default: \`${JSON.stringify(schema.default)}\``);
    }
    if (schema.items) {
        lines.push('- items:');
        lines.push(`  ${stringifySchema(schema.items).replace(/\n/g, '\n  ')}`);
    }
    if (schema.oneOf) {
        lines.push(`- oneOf: ${schema.oneOf.length} 项`);
    }
    if (schema.anyOf) {
        lines.push(`- anyOf: ${schema.anyOf.length} 项`);
    }
    if (schema.allOf) {
        lines.push(`- allOf: ${schema.allOf.length} 项`);
    }
    if (schema.properties) {
        const keys = Object.keys(schema.properties);
        lines.push(`- properties: ${keys.length} 个`);
        if (keys.length) {
            const preview = keys.slice(0, 20).map((key) => `\`${key}\``).join(', ');
            lines.push(`- properties示例: ${preview}${keys.length > 20 ? ' ...' : ''}`);
        }
    }
    if (schema.required?.length) {
        lines.push(`- required: ${schema.required.map((x) => `\`${x}\``).join(', ')}`);
    }

    return lines.length ? lines.join('\n') : `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``;
}

function stringifyExample(example) {
    if (example === undefined || example === null) {
        return '_无_';
    }

    const raw = typeof example === 'string' ? example : JSON.stringify(example, null, 2);
    if (raw.length > 1200) {
        return `\`\`\`json\n${raw.slice(0, 1200)}\n... (truncated)\n\`\`\``;
    }
    return `\`\`\`json\n${raw}\n\`\`\``;
}

function resolveRef(obj, components) {
    if (!obj || !obj.$ref || !obj.$ref.startsWith('#/components/')) {
        return obj;
    }

    const [, , section, ...keys] = obj.$ref.split('/');
    let cur = components?.[section];
    for (const key of keys) {
        if (!cur) {
            return obj;
        }
        cur = cur[key];
    }
    return cur || obj;
}

function methodWeight(method) {
    const order = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
    const idx = order.indexOf(method.toLowerCase());
    return idx === -1 ? 999 : idx;
}

function buildOpenApiModel(sourceMap) {
    const intro = sourceMap['introduction.yaml'];
    if (!intro) {
        throw new Error('introduction.yaml not found in source');
    }

    const model = {
        openapi: intro.openapi || '3.0.0',
        info: intro.info || {},
        servers: intro.servers || [],
        tags: intro.tags || [],
        paths: {},
        components: {},
    };

    for (const [fileName, doc] of Object.entries(sourceMap)) {
        if (!doc || typeof doc !== 'object') {
            continue;
        }
        if (doc.paths && typeof doc.paths === 'object') {
            Object.assign(model.paths, doc.paths);
        }
        if (doc.components && typeof doc.components === 'object') {
            for (const [sectionName, sectionValue] of Object.entries(doc.components)) {
                model.components[sectionName] = {
                    ...(model.components[sectionName] || {}),
                    ...(sectionValue || {}),
                };
            }
        }
        if (fileName === 'definitions.yaml' && doc.definitions) {
            model.components.schemas = {
                ...(model.components.schemas || {}),
                ...doc.definitions,
            };
        }
    }

    if (!model.components.schemas) {
        model.components.schemas = {};
    }

    return model;
}

function groupOperations(spec) {
    const tagMeta = new Map((spec.tags || []).map((tag) => [tag.name, tag.description || '']));
    const grouped = new Map();

    for (const [apiPath, pathItem] of Object.entries(spec.paths || {})) {
        for (const [method, operationRaw] of Object.entries(pathItem || {})) {
            if (method.startsWith('x-')) {
                continue;
            }
            if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'].includes(method.toLowerCase())) {
                continue;
            }

            const operation = operationRaw || {};
            const opTags = Array.isArray(operation.tags) && operation.tags.length ? operation.tags : ['untagged'];
            const primaryTag = opTags[0];
            if (!grouped.has(primaryTag)) {
                grouped.set(primaryTag, []);
            }

            const mergedParams = [
                ...((pathItem.parameters || [])),
                ...((operation.parameters || [])),
            ];

            grouped.get(primaryTag).push({
                method: method.toUpperCase(),
                methodOrder: methodWeight(method),
                path: apiPath,
                summary: operation.summary || '',
                description: operation.description || '',
                operationId: operation.operationId || '',
                deprecated: !!operation.deprecated,
                parameters: mergedParams,
                requestBody: operation.requestBody,
                responses: operation.responses || {},
                tagDescription: tagMeta.get(primaryTag) || '',
            });
        }
    }

    const sortedTags = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
    return sortedTags.map((tag) => ({
        tag,
        description: tagMeta.get(tag) || '',
        operations: grouped.get(tag).sort((a, b) => {
            if (a.path !== b.path) {
                return a.path.localeCompare(b.path);
            }
            return a.methodOrder - b.methodOrder;
        }),
    }));
}

function buildMarkdown(spec) {
    const groups = groupOperations(spec);
    const lines = [];

    lines.push('# Mattermost Platform REST API');
    lines.push('');
    lines.push(`- OpenAPI版本: \`${spec.openapi || '3.0.0'}\``);
    lines.push(`- 生成时间: \`${new Date().toISOString()}\``);
    lines.push('- 数据源: `mattermost/mattermost` 仓库 `api/v4/source/*.yaml`（通过 GitHub Contents API 拉取）');
    lines.push('');
    lines.push('## 目录');
    lines.push('');

    for (const group of groups) {
        const tagAnchor = anchorize(`模块-${group.tag}`);
        lines.push(`- [模块：${group.tag}](#${tagAnchor})`);
        for (const op of group.operations) {
            const opTitle = `${op.method} ${op.path}`;
            const opAnchor = anchorize(opTitle);
            lines.push(`  - [${opTitle}](#${opAnchor})`);
        }
    }

    lines.push('');
    lines.push('## 全局说明');
    lines.push('');
    if (spec.info?.description) {
        lines.push(spec.info.description);
        lines.push('');
    }
    if (spec.servers?.length) {
        lines.push('### Servers');
        lines.push('');
        for (const s of spec.servers) {
            lines.push(`- \`${s.url}\``);
        }
        lines.push('');
    }

    for (const group of groups) {
        lines.push(`## 模块：${group.tag}`);
        lines.push('');
        if (group.description) {
            lines.push(group.description);
            lines.push('');
        }

        for (const op of group.operations) {
            lines.push(`### ${op.method} ${op.path}`);
            lines.push('');
            if (op.summary) {
                lines.push(`- 摘要: ${op.summary}`);
            }
            if (op.operationId) {
                lines.push(`- operationId: \`${op.operationId}\``);
            }
            lines.push(`- deprecated: \`${op.deprecated}\``);
            lines.push('');

            if (op.description) {
                lines.push('#### 描述');
                lines.push('');
                lines.push(op.description);
                lines.push('');
            }

            lines.push('#### 参数');
            lines.push('');
            if (!op.parameters.length) {
                lines.push('_无_');
                lines.push('');
            } else {
                lines.push('| 名称 | 位置 | 必填 | 描述 | Schema |');
                lines.push('|---|---|---|---|---|');
                for (const pRaw of op.parameters) {
                    const p = resolveRef(pRaw, spec.components);
                    const schema = p.schema ? `\`${JSON.stringify(p.schema)}\`` : '`-`';
                    lines.push(`| \`${p.name || '-'}\` | \`${p.in || '-'}\` | \`${p.required ? 'yes' : 'no'}\` | ${((p.description || '').replace(/\n/g, ' '))} | ${schema} |`);
                }
                lines.push('');
            }

            lines.push('#### 请求体');
            lines.push('');
            if (!op.requestBody) {
                lines.push('_无_');
                lines.push('');
            } else {
                const body = resolveRef(op.requestBody, spec.components);
                lines.push(`- required: \`${body.required ? 'yes' : 'no'}\``);
                if (body.description) {
                    lines.push(`- description: ${body.description}`);
                }
                lines.push('');
                for (const [contentType, media] of Object.entries(body.content || {})) {
                    lines.push(`- content-type: \`${contentType}\``);
                    lines.push(`  - schema:\n${stringifySchema(media.schema).split('\n').map((x) => `    ${x}`).join('\n')}`);
                    if (media.example !== undefined) {
                        lines.push(`  - example:\n${stringifyExample(media.example).split('\n').map((x) => `    ${x}`).join('\n')}`);
                    } else if (media.examples) {
                        const firstExample = Object.values(media.examples)[0];
                        const value = firstExample?.value ?? firstExample?.externalValue;
                        lines.push(`  - example:\n${stringifyExample(value).split('\n').map((x) => `    ${x}`).join('\n')}`);
                    }
                }
                lines.push('');
            }

            lines.push('#### 响应');
            lines.push('');
            const responseEntries = Object.entries(op.responses);
            if (!responseEntries.length) {
                lines.push('_无_');
                lines.push('');
            } else {
                for (const [code, rawResp] of responseEntries) {
                    const resp = resolveRef(rawResp, spec.components);
                    lines.push(`##### ${code}`);
                    lines.push('');
                    if (resp.description) {
                        lines.push(resp.description);
                        lines.push('');
                    }
                    const content = resp.content || {};
                    if (!Object.keys(content).length) {
                        lines.push('- content: _无_');
                        lines.push('');
                        continue;
                    }
                    for (const [contentType, media] of Object.entries(content)) {
                        lines.push(`- content-type: \`${contentType}\``);
                        lines.push(`  - schema:\n${stringifySchema(media.schema).split('\n').map((x) => `    ${x}`).join('\n')}`);
                        if (media.example !== undefined) {
                            lines.push(`  - example:\n${stringifyExample(media.example).split('\n').map((x) => `    ${x}`).join('\n')}`);
                        } else if (media.examples) {
                            const firstExample = Object.values(media.examples)[0];
                            const value = firstExample?.value ?? firstExample?.externalValue;
                            lines.push(`  - example:\n${stringifyExample(value).split('\n').map((x) => `    ${x}`).join('\n')}`);
                        }
                    }
                    lines.push('');
                }
            }
        }
    }

    return lines.join('\n');
}

async function main() {
    const sourceMap = await loadApiSource();
    const model = buildOpenApiModel(sourceMap);
    const markdown = buildMarkdown(model);
    await fs.writeFile(OUTPUT_FILE, markdown, 'utf8');
    console.log(`Generated: ${OUTPUT_FILE}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
