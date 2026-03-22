// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState, type ReactNode} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import Emoji from '@components/emoji';
import TouchableEmoji from '@components/touchable_emoji';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {EMOJI_SIZE, EMOJIS_PER_ROW} from '@constants/emoji';
import {useTheme} from '@context/theme';
import {EmojiIndicesByAlias} from '@utils/emoji';
import {getEmojis} from '@utils/emoji/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type CustomEmojiModel from '@typings/database/models/servers/custom_emoji';

type TabKey = 'recent' | 'all' | 'fun' | 'custom';

type DraftEmojiPanelProps = {
    customEmojis: CustomEmojiModel[];
    customEmojisEnabled: boolean;
    onPick: (shortName: string) => void;
    recentEmojis: string[];
    skinTone: string;
    testID?: string;
};

const PANEL_SCROLL_MAX_HEIGHT = 228;
const TAB_BAR_HEIGHT = 48;
const H_PADDING = 10;

/** Curated fun / expressive built-ins (WeChat-style “stickers” vibe using standard emoji). */
const FUN_EMOJI_ALIASES: readonly string[] = [
    'joy', 'rofl', 'grinning', 'smiley', 'smile', 'grin', 'laughing', 'satisfied', 'sweat_smile', 'wink', 'blush',
    'yum', 'sunglasses', 'heart_eyes', 'kissing_heart', 'thinking_face', 'neutral_face', 'smiling_imp', 'ghost',
    'skull', 'alien', 'robot_face', 'jack_o_lantern', 'muscle', 'raised_hands', 'clap', 'wave', 'thumbsup',
    'thumbsdown', 'ok_hand', 'pray', 'fire', '100', 'heart', 'broken_heart', 'tada', 'gift', 'dart',
];

function filterKnownAliases(names: readonly string[]): string[] {
    return names.filter((n) => EmojiIndicesByAlias.has(n));
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    root: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(0,0,0,0.08)',
        backgroundColor: theme.centerChannelBg,
    },
    scrollRegion: {
        maxHeight: PANEL_SCROLL_MAX_HEIGHT,
        paddingHorizontal: H_PADDING,
        paddingTop: 8,
    },
    tabBar: {
        flexDirection: 'row',
        height: TAB_BAR_HEIGHT,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(0,0,0,0.06)',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingBottom: Platform.select({ios: 2, android: 0}),
    },
    tabPress: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    tabLabel: {
        fontSize: 10,
        marginTop: 2,
        color: changeOpacity(theme.centerChannelColor, 0.52),
    },
    tabLabelActive: {
        color: theme.buttonBg,
    },
    empty: {
        padding: 18,
        textAlign: 'center',
        color: changeOpacity(theme.centerChannelColor, 0.48),
        fontSize: 14,
    },
}));

const DraftEmojiPanel = ({
    customEmojis,
    customEmojisEnabled,
    onPick,
    recentEmojis,
    skinTone,
    testID = 'draft_emoji.panel',
}: DraftEmojiPanelProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const {width: windowWidth} = useWindowDimensions();
    const [tab, setTab] = useState<TabKey>('recent');

    const cellWidth = Math.floor((windowWidth - H_PADDING * 2) / EMOJIS_PER_ROW);

    const allBuiltInSorted = useMemo(() => {
        return [...getEmojis(skinTone, [])].sort((a, b) => a.localeCompare(b));
    }, [skinTone]);

    const funSorted = useMemo(() => filterKnownAliases(FUN_EMOJI_ALIASES), []);

    const recentFiltered = useMemo(() => {
        return recentEmojis.filter((n) => EmojiIndicesByAlias.has(n) || (customEmojisEnabled && customEmojis.some((c) => c.name === n)));
    }, [recentEmojis, customEmojis, customEmojisEnabled]);

    const renderBuiltInItem = useCallback(({item}: {item: string}) => (
        <View style={{width: cellWidth, alignItems: 'center', marginBottom: 6}}>
            <TouchableEmoji
                name={item}
                onEmojiPress={onPick}
            />
        </View>
    ), [cellWidth, onPick]);

    const renderCustomItem = useCallback(({item}: {item: CustomEmojiModel}) => (
        <View style={{width: cellWidth, alignItems: 'center', marginBottom: 6}}>
            <TouchableWithFeedback
                onPress={() => onPick(item.name)}
                type={'opacity'}
            >
                <Emoji
                    emojiName={item.name}
                    size={EMOJI_SIZE - 2}
                />
            </TouchableWithFeedback>
        </View>
    ), [cellWidth, onPick]);

    const tabs: {key: TabKey; icon: string; labelId: string; defaultMessage: string}[] = useMemo(() => [
        {key: 'recent', icon: 'clock-outline', labelId: 'draft_emoji.tab_recent', defaultMessage: 'Recent'},
        {key: 'all', icon: 'emoticon-happy-outline', labelId: 'draft_emoji.tab_all', defaultMessage: 'All'},
        {key: 'fun', icon: 'star-outline', labelId: 'draft_emoji.tab_fun', defaultMessage: 'Fun'},
        {key: 'custom', icon: 'emoticon-custom-outline', labelId: 'draft_emoji.tab_custom', defaultMessage: 'Custom'},
    ], []);

    let listContent: ReactNode;
    if (tab === 'recent') {
        if (recentFiltered.length === 0) {
            listContent = (
                <Text style={styles.empty}>
                    {intl.formatMessage({id: 'draft_emoji.empty_recent', defaultMessage: 'No recent emojis yet'})}
                </Text>
            );
        } else {
            listContent = (
                <FlatList
                    data={recentFiltered}
                    numColumns={EMOJIS_PER_ROW}
                    keyExtractor={(item) => `r-${item}`}
                    renderItem={renderBuiltInItem}
                    scrollIndicatorInsets={{right: 1}}
                    keyboardShouldPersistTaps={'always'}
                />
            );
        }
    } else if (tab === 'all') {
        listContent = (
            <FlatList
                data={allBuiltInSorted}
                numColumns={EMOJIS_PER_ROW}
                keyExtractor={(item) => `a-${item}`}
                renderItem={renderBuiltInItem}
                initialNumToRender={42}
                maxToRenderPerBatch={56}
                windowSize={5}
                keyboardShouldPersistTaps={'always'}
            />
        );
    } else if (tab === 'fun') {
        listContent = (
            <FlatList
                data={funSorted}
                numColumns={EMOJIS_PER_ROW}
                keyExtractor={(item) => `f-${item}`}
                renderItem={renderBuiltInItem}
                keyboardShouldPersistTaps={'always'}
            />
        );
    } else {
        if (!customEmojisEnabled || customEmojis.length === 0) {
            listContent = (
                <Text style={styles.empty}>
                    {intl.formatMessage({id: 'draft_emoji.empty_custom', defaultMessage: 'No custom emojis on this server'})}
                </Text>
            );
        } else {
            listContent = (
                <FlatList
                    data={customEmojis}
                    numColumns={EMOJIS_PER_ROW}
                    keyExtractor={(item) => item.id}
                    renderItem={renderCustomItem}
                    initialNumToRender={28}
                    keyboardShouldPersistTaps={'always'}
                />
            );
        }
    }

    return (
        <View
            style={styles.root}
            testID={testID}
        >
            <View style={styles.scrollRegion}>
                {listContent}
            </View>
            <View style={styles.tabBar}>
                {tabs.map((t) => {
                    const active = tab === t.key;
                    const color = active ? theme.buttonBg : changeOpacity(theme.centerChannelColor, 0.45);
                    return (
                        <Pressable
                            key={t.key}
                            accessibilityRole={'button'}
                            onPress={() => setTab(t.key)}
                            style={styles.tabPress}
                            testID={`${testID}.tab.${t.key}`}
                        >
                            <CompassIcon
                                name={t.icon}
                                size={22}
                                color={color}
                            />
                            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                                {intl.formatMessage({id: t.labelId, defaultMessage: t.defaultMessage})}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
};

export default DraftEmojiPanel;
