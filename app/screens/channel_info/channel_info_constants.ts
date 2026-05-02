// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {changeOpacity} from '@utils/theme';

/** Horizontal padding for Channel Info modal content (matches plan: 20). */
export const CHANNEL_INFO_SCREEN_PADDING_H = 20;

/** Vertical gap between major sections. */
export const CHANNEL_INFO_SECTION_GAP = 16;

/** Gap between hero card and actions card. */
export const CHANNEL_INFO_HERO_TO_ACTIONS_GAP = 12;

/** Inner padding for info cards. */
export const CHANNEL_INFO_CARD_INNER_PADDING = 16;

/** Shared corner radius for cards and modal quick actions. */
export const CHANNEL_INFO_CARD_RADIUS = 12;

export function makeChannelInfoModalOptionBoxStyle(theme: Theme) {
    return {
        borderRadius: CHANNEL_INFO_CARD_RADIUS,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
    };
}
