#!/usr/bin/env node
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const {execSync} = require('child_process');
const {chdir} = require('process');

function revertPatch() {
    // eslint-disable-next-line no-console
    console.log('Reverting 16KB page size patch changes...');

    try {
    // 获取 git 根目录
        const gitRoot = execSync('git rev-parse --show-toplevel', {encoding: 'utf8'}).trim();
        // eslint-disable-next-line no-console
        console.log(`Git root directory: ${gitRoot}`);

        // 切换到 git 根目录
        chdir(gitRoot);

        // 执行 git checkout 命令恢复指定文件
        execSync('git checkout -- package.json package-lock.json app.json ios/Podfile.lock android/app/src/main/AndroidManifest.xml app/components/expo_image/index.tsx android/buildscript-gradle.lockfile patches/', {stdio: 'inherit'});

        // 执行 git clean 命令清理 patches/ 目录
        execSync('git clean -fd patches/ package.json.orig android/app/src/main/assets/index.android.bundle', {stdio: 'inherit'});

        // eslint-disable-next-line no-console
        console.log('✓ Patch changes reverted');
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error reverting patch changes:', error.message);
        process.exit(1);
    }
}

// 执行恢复操作
revertPatch();
