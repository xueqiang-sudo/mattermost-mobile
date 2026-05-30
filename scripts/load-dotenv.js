// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '../.env');

/** Load repo-root .env when present. Shell env always wins (dotenv does not override). */
function loadDotEnvIfPresent() {
    if (!fs.existsSync(ENV_PATH)) {
        return false;
    }
    require('dotenv').config({path: ENV_PATH});
    return true;
}

module.exports = {
    ENV_PATH,
    loadDotEnvIfPresent,
};
