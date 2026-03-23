// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {chunk} from 'lodash';
import React, {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react';
import {useIntl} from 'react-intl';
import {
    FlatList,
    Platform,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import {launchImageLibrary, type ImageLibraryOptions, type ImagePickerResponse} from 'react-native-image-picker';
import {getInfoAsync} from 'expo-file-system';
import type {Asset} from 'react-native-image-picker';

import CompassIcon from '@components/compass_icon';
import Emoji from '@components/emoji';
import ExpoImage from '@components/expo_image';
import TouchableEmoji from '@components/touchable_emoji';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {EMOJI_SIZE, EMOJIS_PER_ROW} from '@constants/emoji';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {extractFileInfo, lookupMimeType} from '@utils/file';
import {EmojiIndicesByAlias} from '@utils/emoji';
import {getEmojis} from '@utils/emoji/helpers';
import {
    addLocalDraftStickerFromSourceUri,
    loadLocalDraftStickers,
    type LocalDraftSticker,
    removeLocalDraftSticker,
} from '@utils/local_draft_stickers';
import {logError} from '@utils/log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type CustomEmojiModel from '@typings/database/models/servers/custom_emoji';

type TabKey = 'merged' | 'fun' | 'server' | 'local';

type DraftEmojiPanelProps = {
    customEmojis: CustomEmojiModel[];
    customEmojisEnabled: boolean;
    onPick: (shortName: string) => void;
    onSendLocalSticker: (file: FileInfo) => Promise<void>;
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

type MergedListItem =
    | {kind: 'header'; key: string; titleId: string; titleDefault: string}
    | {kind: 'row'; key: string; names: string[]};

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
    sectionHeader: {
        fontSize: 12,
        fontWeight: '600',
        color: changeOpacity(theme.centerChannelColor, 0.55),
        marginBottom: 6,
        marginTop: 4,
    },
    emojiRow: {
        flexDirection: 'row',
        flexWrap: 'nowrap',
        marginBottom: 6,
        justifyContent: 'flex-start',
    },
    localGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignContent: 'flex-start',
    },
    addCell: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: changeOpacity(theme.centerChannelColor, 0.28),
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        marginRight: 8,
    },
    localThumb: {
        borderRadius: 6,
        marginBottom: 8,
        marginRight: 8,
        overflow: 'hidden',
    },
}));

const DraftEmojiPanel = ({
    customEmojis,
    customEmojisEnabled,
    onPick,
    onSendLocalSticker,
    recentEmojis,
    skinTone,
    testID = 'draft_emoji.panel',
}: DraftEmojiPanelProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const {width: windowWidth} = useWindowDimensions();
    const [tab, setTab] = useState<TabKey>('merged');
    const [localStickers, setLocalStickers] = useState<LocalDraftSticker[]>([]);

    const cellWidth = Math.floor((windowWidth - H_PADDING * 2) / EMOJIS_PER_ROW);

    const allBuiltInSorted = useMemo(() => {
        return [...getEmojis(skinTone, [])].sort((a, b) => a.localeCompare(b));
    }, [skinTone]);

    const funSorted = useMemo(() => filterKnownAliases(FUN_EMOJI_ALIASES), []);

    const recentFiltered = useMemo(() => {
        return recentEmojis.filter((n) => EmojiIndicesByAlias.has(n) || (customEmojisEnabled && customEmojis.some((c) => c.name === n)));
    }, [recentEmojis, customEmojis, customEmojisEnabled]);

    const reloadLocalStickers = useCallback(() => {
        loadLocalDraftStickers().then(setLocalStickers).catch(() => setLocalStickers([]));
    }, []);

    useEffect(() => {
        reloadLocalStickers();
    }, [reloadLocalStickers, tab]);

    const mergedFlatData: MergedListItem[] = useMemo(() => {
        const out: MergedListItem[] = [];
        if (recentFiltered.length > 0) {
            out.push({
                kind: 'header',
                key: 'h-recent',
                titleId: 'draft_emoji.section_recent',
                titleDefault: 'Recently used',
            });
            chunk(recentFiltered, EMOJIS_PER_ROW).forEach((row, i) => {
                out.push({kind: 'row', key: `recent-row-${i}`, names: row});
            });
        }
        out.push({
            kind: 'header',
            key: 'h-all',
            titleId: 'draft_emoji.section_all',
            titleDefault: 'All emojis',
        });
        chunk(allBuiltInSorted, EMOJIS_PER_ROW).forEach((row, i) => {
            out.push({kind: 'row', key: `all-row-${i}`, names: row});
        });
        return out;
    }, [allBuiltInSorted, recentFiltered]);

    const renderBuiltInCell = useCallback((name: string) => (
        <View key={name} style={{width: cellWidth, alignItems: 'center'}}>
            <TouchableEmoji
                name={name}
                onEmojiPress={onPick}
            />
        </View>
    ), [cellWidth, onPick]);

    const renderMergedItem = useCallback(({item}: {item: MergedListItem}) => {
        if (item.kind === 'header') {
            return (
                <Text style={styles.sectionHeader}>
                    {intl.formatMessage({id: item.titleId, defaultMessage: item.titleDefault})}
                </Text>
            );
        }
        return (
            <View style={styles.emojiRow}>
                {item.names.map((n) => renderBuiltInCell(n))}
            </View>
        );
    }, [intl, renderBuiltInCell, styles.emojiRow, styles.sectionHeader]);

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

    const openStickerPicker = usePreventDoubleTap(useCallback(() => {
        const options: ImageLibraryOptions = {
            quality: 1,
            mediaType: 'photo',
            selectionLimit: 1,
        };
        launchImageLibrary(options, async (response: ImagePickerResponse) => {
            StatusBar.setHidden(false);
            if (response.errorMessage || response.didCancel || !response.assets?.[0]?.uri) {
                return;
            }
            const uri = response.assets[0].uri;
            try {
                await addLocalDraftStickerFromSourceUri(uri);
                reloadLocalStickers();
            } catch (e) {
                logError('[DraftEmojiPanel.openStickerPicker]', e);
            }
        });
    }, [reloadLocalStickers]));

    const sendStickerFile = useCallback(async (sticker: LocalDraftSticker) => {
        try {
            const uri = sticker.localUri;
            const name = uri.split('/').pop() || 'sticker.png';
            const mime = lookupMimeType(name);
            const path = uri.replace('file://', '');
            let fileSize = 0;
            try {
                const info = await getInfoAsync(path, {size: true});
                if ('size' in info) {
                    fileSize = info.size ?? 0;
                }
            } catch {
                // size optional
            }
            const asset = {
                uri,
                fileName: name,
                type: mime,
                fileSize,
            } as Asset;
            const extracted = await extractFileInfo([asset]);
            const file = extracted[0];
            if (!file?.localPath) {
                return;
            }
            await onSendLocalSticker(file as FileInfo);
        } catch (e) {
            logError('[DraftEmojiPanel.sendStickerFile]', e);
        }
    }, [onSendLocalSticker]);

    const onLongPressLocal = useCallback((sticker: LocalDraftSticker) => {
        removeLocalDraftSticker(sticker.id).then(reloadLocalStickers).catch(() => {/* ignore */});
    }, [reloadLocalStickers]);

    const localStickerCols = 4;
    const localCell = Math.floor((windowWidth - H_PADDING * 2 - (localStickerCols - 1) * 8) / localStickerCols);

    const renderLocalTab = (): ReactNode => {
        return (
            <View style={styles.localGrid}>
                <TouchableWithFeedback
                    onPress={openStickerPicker}
                    type={'opacity'}
                    testID={`${testID}.local.add`}
                >
                    <View style={[styles.addCell, {width: localCell, height: localCell}]}>
                        <CompassIcon
                            name='plus'
                            size={28}
                            color={changeOpacity(theme.centerChannelColor, 0.45)}
                        />
                    </View>
                </TouchableWithFeedback>
                {localStickers.map((s) => (
                    <TouchableWithFeedback
                        key={s.id}
                        onPress={() => sendStickerFile(s)}
                        onLongPress={() => onLongPressLocal(s)}
                        type={'opacity'}
                        testID={`${testID}.local.${s.id}`}
                    >
                        <View style={[styles.localThumb, {width: localCell, height: localCell}]}>
                            <ExpoImage
                                id={`draft-local-sticker-${s.id}`}
                                source={{uri: s.localUri}}
                                style={{width: localCell, height: localCell}}
                            />
                        </View>
                    </TouchableWithFeedback>
                ))}
            </View>
        );
    };

    const tabs: {key: TabKey; icon: string; labelId: string; defaultMessage: string}[] = useMemo(() => [
        {key: 'merged', icon: 'emoticon-happy-outline', labelId: 'draft_emoji.tab_emoji', defaultMessage: 'Emoji'},
        {key: 'fun', icon: 'star-outline', labelId: 'draft_emoji.tab_fun', defaultMessage: 'Fun'},
        {key: 'server', icon: 'emoticon-custom-outline', labelId: 'draft_emoji.tab_server_custom', defaultMessage: 'Server'},
        {key: 'local', icon: 'heart-outline', labelId: 'draft_emoji.tab_my_stickers', defaultMessage: 'My stickers'},
    ], []);

    let listContent: ReactNode;
    if (tab === 'merged') {
        listContent = (
            <FlatList
                key={'draft-emoji-merged'}
                data={mergedFlatData}
                keyExtractor={(it) => it.key}
                renderItem={renderMergedItem}
                initialNumToRender={12}
                keyboardShouldPersistTaps={'always'}
            />
        );
    } else if (tab === 'fun') {
        listContent = (
            <FlatList
                key={'draft-emoji-fun'}
                data={funSorted}
                numColumns={EMOJIS_PER_ROW}
                keyExtractor={(item) => `f-${item}`}
                renderItem={({item}) => (
                    <View style={{width: cellWidth, alignItems: 'center', marginBottom: 6}}>
                        <TouchableEmoji
                            name={item}
                            onEmojiPress={onPick}
                        />
                    </View>
                )}
                keyboardShouldPersistTaps={'always'}
            />
        );
    } else if (tab === 'server') {
        if (!customEmojisEnabled || customEmojis.length === 0) {
            listContent = (
                <Text style={styles.empty}>
                    {intl.formatMessage({id: 'draft_emoji.empty_custom', defaultMessage: 'No custom emojis on this server'})}
                </Text>
            );
        } else {
            listContent = (
                <FlatList
                    key={'draft-emoji-server'}
                    data={customEmojis}
                    numColumns={EMOJIS_PER_ROW}
                    keyExtractor={(item) => item.id}
                    renderItem={renderCustomItem}
                    initialNumToRender={28}
                    keyboardShouldPersistTaps={'always'}
                />
            );
        }
    } else {
        listContent = renderLocalTab();
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
