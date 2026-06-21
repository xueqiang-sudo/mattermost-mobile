// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Text} from 'react-native';

import FormattedMarkdownText from '@components/formatted_markdown_text';
import FormattedText from '@components/formatted_text';
import Markdown from '@components/markdown';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {secureGetFromRecord} from '@utils/types';

import {getPostTypeMessagesForChannelActivity, getSystemMessagesForLastUsers} from './messages';

import type {AvailableScreens} from '@typings/screens/navigation';

type LastUsersProps = {
    actor: string;
    channelId?: string;
    compact?: boolean;
    location: AvailableScreens;
    postType: string;
    usernames: string[];
    theme: Theme;
    useDiscussionGroupCopy: boolean;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        baseText: {
            color: changeOpacity(theme.centerChannelColor, 0.6),
            fontSize: 16,
            lineHeight: 20,
        },
        linkText: {
            color: theme.linkColor,
            fontSize: 16,
            lineHeight: 20,
        },
        messageCompact: {
            color: changeOpacity(theme.centerChannelColor, 0.45),
            ...typography('Body', 75, 'Regular'),
            lineHeight: 18,
            textAlign: 'center',
        },
        linkTextCompact: {
            color: changeOpacity(theme.centerChannelColor, 0.45),
            ...typography('Body', 75, 'Regular'),
            lineHeight: 18,
        },
    };
});

const LastUsers = ({actor, channelId, compact, location, postType, theme, usernames, useDiscussionGroupCopy}: LastUsersProps) => {
    const [expanded, setExpanded] = useState(false);
    const intl = useIntl();
    const style = getStyleSheet(theme);
    const postTypeMessages = useMemo(
        () => getPostTypeMessagesForChannelActivity(useDiscussionGroupCopy),
        [useDiscussionGroupCopy],
    );
    const systemMessages = useMemo(
        () => getSystemMessagesForLastUsers(useDiscussionGroupCopy),
        [useDiscussionGroupCopy],
    );

    const onPress = () => {
        setExpanded(true);
    };

    if (expanded) {
        const lastIndex = usernames.length - 1;
        const lastUser = usernames[lastIndex];
        const expandedMessage = secureGetFromRecord(postTypeMessages, postType)?.many_expanded;

        // We default to empty string, but this should never happen
        const formattedMessage = expandedMessage ? intl.formatMessage(expandedMessage, {
            users: usernames.slice(0, lastIndex).join(', '),
            lastUser,
            actor,
        }) : '';

        if (compact) {
            return (
                <Text style={style.messageCompact}>
                    {formattedMessage.replace(/\*\*([^*]+)\*\*/g, '$1')}
                </Text>
            );
        }

        return (
            <Markdown
                baseTextStyle={style.baseText}
                channelId={channelId}
                location={location}
                value={formattedMessage}
                theme={theme}
            />
        );
    }

    const firstUser = usernames[0];
    const numOthers = usernames.length - 1;

    const message = secureGetFromRecord(systemMessages, postType);
    const textStyle = compact ? style.messageCompact : style.baseText;
    const linkStyle = compact ? style.linkTextCompact : style.linkText;

    if (compact) {
        const andPrefix = intl.formatMessage(
            {id: 'last_users_message.first', defaultMessage: '{firstUser} and '},
            {firstUser},
        );
        const othersLabel = intl.formatMessage(
            {id: 'last_users_message.others', defaultMessage: '{numOthers} others '},
            {numOthers},
        );
        const typeLabel = message ? intl.formatMessage(message, {actor}) : '';
        const plainType = typeLabel.replace(/\*\*([^*]+)\*\*/g, '$1');

        return (
            <Text style={textStyle}>
                {andPrefix}
                <Text
                    onPress={onPress}
                    style={linkStyle}
                >
                    {othersLabel}
                </Text>
                {plainType}
            </Text>
        );
    }

    return (
        <Text>
            <FormattedMarkdownText
                channelId={channelId}
                id={'last_users_message.first'}
                defaultMessage={'{firstUser} and '}
                location={location}
                values={{firstUser}}
                baseTextStyle={style.baseText}
                style={style.baseText}
            />
            <Text>{' '}</Text>
            <Text
                onPress={onPress}
                style={style.linkText}
            >
                <FormattedText
                    id={'last_users_message.others'}
                    defaultMessage={'{numOthers} others '}
                    values={{numOthers}}
                />
            </Text>
            <FormattedMarkdownText
                channelId={channelId}
                id={message?.id || ''}
                defaultMessage={message?.defaultMessage || ''}
                location={location}
                values={{actor}}
                baseTextStyle={style.baseText}
                style={style.baseText}
            />
        </Text>
    );
};

export default LastUsers;
