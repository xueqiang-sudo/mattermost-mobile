#!/usr/bin/env node
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const {spawnSync} = require('child_process');

const {loadDotEnvIfPresent} = require('./load-dotenv');

// .env is optional; missing file does not fail the command.
loadDotEnvIfPresent();

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('[with-env] Missing command');
    process.exit(1);
}

const [command, ...commandArgs] = args;
const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
