// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
const platform = process.env.IOS === 'true' ? 'ios' : 'android';
const shard = process.env.CI_NODE_INDEX ? process.env.CI_NODE_INDEX : '';
const artifactsRoot = process.env.DETOX_ARTIFACTS_LOCATION ?? './detox_artifacts_test';

module.exports = {
    setupFilesAfterEnv: ['<rootDir>/e2e/test/setup.ts'],
    maxWorkers: 1,
    testSequencer: '<rootDir>/e2e/custom_sequencer.js',
    testTimeout: 180000,

    // This config file lives under the repo's `e2e/` directory.
    // When using a relative `rootDir`, Jest resolves it relative to this file's directory.
    // We need to point back to the real Detox package directory.
    rootDir: '../detox',
    testMatch: ['<rootDir>/e2e/test/**/*.e2e.ts'],
    transform: {
        '\\.ts?$': 'ts-jest',
    },
    reporters: [
        '<rootDir>/node_modules/detox/runners/jest/reporter.js',
        ['<rootDir>/node_modules/jest-junit/index.js', {
            suiteName: 'Mobile App E2E with Detox and Jest',
            outputDirectory: artifactsRoot,
            outputName: `${platform}-junit${shard}.xml`,
            uniqueOutputName: false,
        }],
        ['<rootDir>/node_modules/jest-html-reporters/index.js', {
            pageTitle: 'Mobile App E2E with Detox and Jest',
            publicPath: artifactsRoot,
            filename: `${platform}-report${shard}.html`,
            expand: false,
        }],
        ['<rootDir>/node_modules/jest-stare/lib/index.js', {
            reportHeadline: 'Mobile App E2E with Detox and Jest',
            resultDir: `${artifactsRoot}/jest-stare`,
            resultJson: `${platform}-data${shard}.json`,
            resultHtml: `${platform}-main${shard}.html`,
        }],
    ],
    globalSetup: '<rootDir>/node_modules/detox/runners/jest/globalSetup.js',
    globalTeardown: '<rootDir>/node_modules/detox/runners/jest/globalTeardown.js',
    testEnvironment: '<rootDir>/node_modules/detox/runners/jest/testEnvironment/index.js',
    verbose: true,
    moduleNameMapper: {
        '^@support/(.*)': '<rootDir>/e2e/support/$1',
    },
};

