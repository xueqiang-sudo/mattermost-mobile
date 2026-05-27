// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Dead Code Elimination gate.
// When __DEBUG_PANEL__ is replaced with `false` by Babel at bundle time,
// Metro's Terser will eliminate the entire if(false){} block and its require(),
// so debug_panel.tsx and all its dependencies are NOT included in the bundle.
/* eslint-disable global-require */
if (__DEBUG_PANEL__) {
    module.exports = require('./debug_panel');
} else {
    module.exports = {default: () => null};
}
