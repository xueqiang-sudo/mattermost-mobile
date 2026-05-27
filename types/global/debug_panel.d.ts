// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Compile-time constant injected by the inline Babel plugin in babel.config.js.
// Value is determined by the SHOW_DEBUG_PANEL environment variable at bundle time.
// When false, all code inside `if (__DEBUG_PANEL__)` blocks is eliminated by Metro's DCE.
declare const __DEBUG_PANEL__: boolean;
