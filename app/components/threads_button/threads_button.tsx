// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {DeviceEventEmitter} from 'react-native';

import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {Events} from '@constants';
import {THREAD} from '@constants/screens';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

const BUTTON_SIZE = 28;

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    headerButton: {
        backgroundColor: changeOpacity(theme.sidebarText, 0.08),
        height: BUTTON_SIZE,
        width: BUTTON_SIZE,
        borderRadius: BUTTON_SIZE / 2,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    headerButtonActive: {
        backgroundColor: changeOpacity(theme.sidebarText, 0.2),
    },
    icon: {
        color: changeOpacity(theme.sidebarText, 0.8),
        fontSize: 18,
    },
    iconActive: {
        color: theme.sidebarText,
    },
}));

type Props = {
    /** Reserved for parity with drafts/playbooks entry points. */
    isOnHome?: boolean;
    shouldHighlightActive?: boolean;
    variant?: 'header';
};

const ThreadsButton = ({
    shouldHighlightActive,
    variant = 'header',
}: Props) => {
    const theme = useTheme();
    const styles = getStyles(theme);

    const handlePress = usePreventDoubleTap(useCallback(() => {
        DeviceEventEmitter.emit(Events.ACTIVE_SCREEN, THREAD);
    }, []));

    if (variant !== 'header') {
        return null;
    }

    return (
        <TouchableWithFeedback
            onPress={handlePress}
            style={[styles.headerButton, shouldHighlightActive && styles.headerButtonActive]}
            testID='channel_list_header.threads.button'
            type='opacity'
        >
            <CompassIcon
                name='message-text-outline'
                style={[styles.icon, shouldHighlightActive && styles.iconActive]}
            />
        </TouchableWithFeedback>
    );
};

export default ThreadsButton;
