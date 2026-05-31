// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// This module is only bundled when __DEBUG_PANEL__ is true.
// Call sites should guard with `if (__DEBUG_PANEL__)` or use restoreDebugPanelOverlay()
// which no-ops when the panel is disabled.

export const DEBUG_PANEL_OVERLAY_ID = 'debug_panel_overlay';

const RESTORE_DELAY_MS = 0;

let restoreTimer: ReturnType<typeof setTimeout> | null = null;

export function showDebugPanelOverlay() {
    if (!__DEBUG_PANEL__) {
        return;
    }

    const {Screens} = require('@constants');
    const {dismissOverlay, showOverlay} = require('@screens/navigation');

    dismissOverlay(DEBUG_PANEL_OVERLAY_ID).catch(() => {
        // ignore if overlay does not exist yet
    });

    showOverlay(
        Screens.DEBUG_PANEL,
        {},
        {
            overlay: {interceptTouchOutside: false},
            layout: {
                backgroundColor: 'transparent',
                componentBackgroundColor: 'transparent',
            },
        },
        DEBUG_PANEL_OVERLAY_ID,
    );
}

export function restoreDebugPanelOverlay() {
    if (!__DEBUG_PANEL__) {
        return;
    }

    if (restoreTimer) {
        clearTimeout(restoreTimer);
    }

    restoreTimer = setTimeout(() => {
        restoreTimer = null;
        showDebugPanelOverlay();
    }, RESTORE_DELAY_MS);
}
