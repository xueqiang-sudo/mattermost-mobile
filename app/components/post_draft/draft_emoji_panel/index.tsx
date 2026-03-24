// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {chunk} from 'lodash';
import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import TouchableEmoji from '@components/touchable_emoji';
import {EMOJIS_PER_ROW} from '@constants/emoji';
import {useTheme} from '@context/theme';
import {EmojiIndicesByAlias} from '@utils/emoji';
import {getEmojis} from '@utils/emoji/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import {
    COMMON_EMOJI_ALIASES,
    dedupeAliasesByEmojiGlyph,
    EMOJI_PRIORITY_ALIASES,
    H_PADDING,
    PANEL_SCROLL_MAX_HEIGHT,
} from './panel_constants';

type DraftEmojiPanelProps = {
    onPick: (shortName: string) => void;
    recentEmojis: string[];
    skinTone: string;
    testID?: string;
};

const RECENT_VISIBLE_COUNT = 7;
const ALL_EMOJIS_PER_ROW = EMOJIS_PER_ROW + 1;

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
        paddingBottom: 8,
    },
    recentStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        paddingVertical: 6,
        paddingHorizontal: 8,
        marginBottom: 10,
    },
    recentIconWrap: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
        marginRight: 8,
    },
    recentLabel: {
        fontSize: 12,
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginRight: 8,
        flexShrink: 0,
    },
    recentListWrap: {
        flex: 1,
        minWidth: 0,
    },
    recentEmptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        fontSize: 12,
    },
    recentEmojiRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    recentEmojiItem: {
        width: 55,
        alignItems: 'center',
        marginRight: 4,
    },
    emojiRow: {
        flexDirection: 'row',
        flexWrap: 'nowrap',
        marginBottom: 6,
        justifyContent: 'flex-start',
    },
}));

const DraftEmojiPanel = ({
    onPick,
    recentEmojis,
    skinTone,
    testID = 'draft_emoji.panel',
}: DraftEmojiPanelProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const {width: windowWidth} = useWindowDimensions();

    const cellWidth = Math.floor((windowWidth - (H_PADDING * 2)) / ALL_EMOJIS_PER_ROW);

    const recentFiltered = useMemo(() => {
        return dedupeAliasesByEmojiGlyph(recentEmojis.filter((n) => EmojiIndicesByAlias.has(n)));
    }, [recentEmojis]);

    // 仅展示少量最近使用，避免头部区域溢出和挤压主表情网格。
    const recentVisible = useMemo(() => recentFiltered.slice(0, RECENT_VISIBLE_COUNT), [recentFiltered]);
    const recentNameSet = useMemo(() => new Set(recentVisible), [recentVisible]);

    const allBuiltInSorted = useMemo(() => {
        const allAvailable = new Set(getEmojis(skinTone, []));
        const inSkinAndMap = COMMON_EMOJI_ALIASES.filter(
            (alias) => EmojiIndicesByAlias.has(alias) && allAvailable.has(alias),
        );
        const deduped = dedupeAliasesByEmojiGlyph(inSkinAndMap);
        const withoutRecent = deduped.filter((a) => !recentNameSet.has(a));
        const priorityIndex = new Map(EMOJI_PRIORITY_ALIASES.map((name, index) => [name, index]));

        return withoutRecent.sort((a, b) => {
            const ai = priorityIndex.get(a);
            const bi = priorityIndex.get(b);

            if (ai !== undefined && bi !== undefined) {
                return ai - bi;
            }
            if (ai !== undefined) {
                return -1;
            }
            if (bi !== undefined) {
                return 1;
            }

            return a.localeCompare(b);
        });
    }, [skinTone, recentNameSet]);

    const emojiRows = useMemo(() => chunk(allBuiltInSorted, ALL_EMOJIS_PER_ROW), [allBuiltInSorted]);

    const renderBuiltInCell = useCallback((name: string, keyPrefix = 'all') => {
        const cellStyle = {width: cellWidth, alignItems: 'center' as const};
        return (
            <View
                key={`${keyPrefix}-${name}`}
                style={cellStyle}
            >
                <TouchableEmoji
                    name={name}
                    onEmojiPress={onPick}
                />
            </View>
        );
    }, [cellWidth, onPick]);

    const renderEmojiRow = useCallback((row: {item: string[]}) => (
        <View style={styles.emojiRow}>
            {row.item.map((name: string) => renderBuiltInCell(name))}
        </View>
    ), [renderBuiltInCell, styles.emojiRow]);

    const renderRecentCell = useCallback((name: string) => (
        <View
            key={`recent-${name}`}
            style={styles.recentEmojiItem}
        >
            <TouchableEmoji
                name={name}
                onEmojiPress={onPick}
            />
        </View>
    ), [onPick, styles.recentEmojiItem]);

    return (
        <View
            style={styles.root}
            testID={testID}
        >
            <View style={styles.scrollRegion}>
                {/* 最近使用与表情图标放在一行，减少标题占用并和下方网格形成轻分区。 */}
                <View style={styles.recentStrip}>
                    <View style={styles.recentIconWrap}>
                        <CompassIcon
                            name='emoticon-happy-outline'
                            size={16}
                            color={theme.buttonBg}
                        />
                    </View>
                    <Text style={styles.recentLabel}>
                        {intl.formatMessage({id: 'draft_emoji.section_recent', defaultMessage: 'Recently used'})}
                    </Text>
                    <View style={styles.recentListWrap}>
                        {recentVisible.length > 0 ? (
                            <ScrollView
                                horizontal={true}
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.recentEmojiRow}
                            >
                                {recentVisible.map(renderRecentCell)}
                            </ScrollView>
                        ) : (
                            <Text style={styles.recentEmptyText}>
                                {intl.formatMessage({id: 'draft_emoji.empty_recent', defaultMessage: 'No recent emojis yet'})}
                            </Text>
                        )}
                    </View>
                </View>

                {/* 全部表情区不再显示标题，通过与顶部最近使用的视觉分层实现区分。 */}
                <FlatList
                    key={'draft-emoji-all'}
                    data={emojiRows}
                    keyExtractor={(_row: string[], index: number) => `emoji-row-${index}`}
                    renderItem={renderEmojiRow}
                    initialNumToRender={8}
                    windowSize={5}
                    removeClippedSubviews={true}
                    keyboardShouldPersistTaps={'always'}
                />
            </View>
        </View>
    );
};

export default DraftEmojiPanel;
