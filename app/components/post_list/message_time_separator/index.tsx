// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Text} from 'react-native';

import {useTheme} from '@context/theme';
import {formatTimeSeparatorLabel} from '@utils/wechat_message_time';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type MessageTimeSeparatorProps = {

    /** 消息时间戳（毫秒） */
    createAt: number;

    /** 用户时区，与聊天消息一致 */
    timezone?: string | null;

    /** 是否使用24小时制 */
    isMilitaryTime: boolean;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            alignSelf: 'center',
            marginVertical: 12,
        },
        text: {
            color: changeOpacity(theme.centerChannelColor, 0.5),
            fontSize: 12,
            ...typography('Body', 75, 'Regular'),
        },
    };
});

const MessageTimeSeparator = ({createAt, timezone, isMilitaryTime}: MessageTimeSeparatorProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const label = formatTimeSeparatorLabel(intl, createAt, timezone ?? undefined, isMilitaryTime);

    return (
        <Text style={[styles.container, styles.text]}>
            {label}
        </Text>
    );
};

export default React.memo(MessageTimeSeparator);