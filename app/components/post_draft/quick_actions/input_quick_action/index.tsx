// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';

import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {ICON_SIZE} from '@constants/post_draft';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

type Props = {
    testID?: string;
    disabled?: boolean;
    updateValue: React.Dispatch<React.SetStateAction<string>>;
    focus: () => void;
}

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        disabled: {
            tintColor: changeOpacity(theme.centerChannelColor, 0.16),
        },
        icon: {
            alignItems: 'center',
            justifyContent: 'center',
            padding: 10,
        },
    };
});

export default function InputQuickAction({
    testID,
    disabled,
    updateValue,
    focus,
}: Props) {
    const theme = useTheme();
    const onPress = useCallback(() => {
        updateValue((v) => {
            // If there's existing text and it doesn't end with a space, add a space before @
            if (v.length > 0 && !v.endsWith(' ')) {
                return `${v} @`;
            }
            return `${v}@`;
        });
        focus();
    }, [updateValue, focus]);

    const actionTestID = disabled ?
        `${testID}.disabled` :
        testID;
    const style = getStyleSheet(theme);
    const iconColor = disabled ?
        changeOpacity(theme.centerChannelColor, 0.16) :
        changeOpacity(theme.centerChannelColor, 0.64);

    return (
        <TouchableWithFeedback
            testID={actionTestID}
            disabled={disabled}
            onPress={onPress}
            style={style.icon}
            type={'opacity'}
        >
            <CompassIcon
                name='at'
                color={iconColor}
                size={ICON_SIZE}
            />
        </TouchableWithFeedback>
    );
}
