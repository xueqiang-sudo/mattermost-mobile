// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Text, type StyleProp, type TextStyle} from 'react-native';

import {getConversationTimestampFormat, type ConversationTimestampFormat} from '@utils/datetime';

type Props = {
    timestamp: number;
    style?: StyleProp<TextStyle>;

    /** 用户时区，与聊天消息一致；空则使用设备默认 */
    timeZone?: string | null;
    isMilitaryTime: boolean;
};

function formatTimestamp(fmt: ConversationTimestampFormat, intl: ReturnType<typeof useIntl>, timeZone?: string): string {
    const tzOpts = timeZone ? {timeZone} : {};
    switch (fmt.type) {
        case 'time':
            return fmt.value;
        case 'yesterday':
            return intl.formatMessage({id: 'date_separator.yesterday', defaultMessage: 'Yesterday'});
        case 'weekday':
            return fmt.date.toLocaleDateString(intl.locale, {weekday: 'short', ...tzOpts});
        case 'date':
            return fmt.value;
        default:
            return '';
    }
}

export default function FormattedConversationTime({timestamp, style, timeZone, isMilitaryTime}: Props) {
    const intl = useIntl();
    const fmt = getConversationTimestampFormat(timestamp, {
        locale: intl.locale,
        timeZone: timeZone ?? undefined,
        isMilitaryTime,
    });
    const text = formatTimestamp(fmt, intl, timeZone ?? undefined);
    return (
        <Text
            style={style}
            numberOfLines={1}
        >
            {text}
        </Text>
    );
}
