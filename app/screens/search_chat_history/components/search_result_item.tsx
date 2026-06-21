// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';

import ProfilePicture from '@components/profile_picture';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {displayUsername} from '@utils/user';

import type UserModel from '@typings/database/models/servers/user';

type Props = {
    post: Post;
    author?: UserModel;
    searchTerm: string;
    onPress: (post: Post) => void;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    avatar: {
        marginRight: 10,
        marginTop: 2,
    },
    content: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 2,
    },
    name: {
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'SemiBold'),
        marginRight: 8,
    },
    time: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        ...typography('Body', 75),
    },
    preview: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 100),
    },
    highlight: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.16),
        color: theme.buttonBg,
    },
}));

const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

const HighlightedText = ({text, keyword, style, highlightStyle}: {
    text: string;
    keyword: string;
    style: any;
    highlightStyle: any;
}) => {
    const parts = useMemo(() => {
        if (!keyword.trim()) {
            return [{text, highlight: false}];
        }
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        const splits = text.split(regex);
        return splits.filter(Boolean).map((part) => ({
            text: part,
            highlight: part.toLowerCase() === keyword.toLowerCase(),
        }));
    }, [text, keyword]);

    return (
        <Text style={style} numberOfLines={2}>
            {parts.map((part, i) => (
                <Text key={i} style={part.highlight ? highlightStyle : undefined}>
                    {part.text}
                </Text>
            ))}
        </Text>
    );
};

const SearchResultItem = ({post, author, searchTerm, onPress}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const name = displayUsername(author);
    const time = formatTime(post.create_at);
    const message = post.message.slice(0, 200);

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={() => onPress(post)}
            activeOpacity={0.6}
        >
            <View style={styles.avatar}>
                <ProfilePicture
                    author={author}
                    size={36}
                    showStatus={false}
                />
            </View>
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.name} numberOfLines={1}>{name}</Text>
                    <Text style={styles.time}>{time}</Text>
                </View>
                <HighlightedText
                    text={message}
                    keyword={searchTerm}
                    style={styles.preview}
                    highlightStyle={styles.highlight}
                />
            </View>
        </TouchableOpacity>
    );
};

export default SearchResultItem;
