// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Animated, {Easing, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

import {moveChannelToCategory, toggleFavoriteChannel} from '@actions/remote/category';
import {fetchDirectChannelsInfo} from '@actions/remote/channel';
import ChannelItem from '@components/channel_item';
import CompassIcon from '@components/compass_icon';
import {ROW_HEIGHT as CHANNEL_ROW_HEIGHT} from '@components/channel_item/channel_item';
import {Events} from '@constants';
import {CHANNELS_CATEGORY, DMS_CATEGORY, FAVORITES_CATEGORY} from '@constants/categories';
import {DRAFT, THREAD} from '@constants/screens';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {queryCategoriesByTeamIds} from '@queries/servers/categories';
import {getChannelCategory} from '@queries/servers/categories';
import DatabaseManager from '@database/manager';
import {bottomSheet, dismissBottomSheet} from '@screens/navigation';
import {showSnackBar} from '@utils/snack_bar';
import {isDMorGM} from '@utils/channel';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type CategoryModel from '@typings/database/models/servers/category';
import type ChannelModel from '@typings/database/models/servers/channel';

type Props = {
    sortedChannels: ChannelModel[];
    category: CategoryModel;
    onChannelSwitch: (channel: Channel | ChannelModel) => void;
    unreadIds: Set<string>;
    unreadsOnTop: boolean;
};

const extractKey = (item: ChannelModel) => item.id;

const getOptionStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    optionIcon: {
        color: theme.centerChannelColor,
        fontSize: 22,
        marginRight: 16,
        width: 24,
        textAlign: 'center',
    },
    optionText: {
        color: theme.centerChannelColor,
        ...typography('Body', 100),
        flex: 1,
    },
    categoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    categoryText: {
        color: theme.centerChannelColor,
        ...typography('Body', 100),
        flex: 1,
    },
    currentBadge: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        ...typography('Body', 50),
        marginLeft: 8,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginHorizontal: 20,
    },
    sectionTitle: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'SemiBold'),
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 8,
    },
}));

const CategoryBody = ({sortedChannels, unreadIds, unreadsOnTop, category, onChannelSwitch}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const [isChannelScreenActive, setChannelScreenActive] = useState(true);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.ACTIVE_SCREEN, (screen: string) => {
            setChannelScreenActive(screen !== DRAFT && screen !== THREAD);
        });

        return () => {
            listener.remove();
        };
    }, []);

    const ids = useMemo(() => {
        const filteredChannels = unreadsOnTop ? sortedChannels.filter((c) => !unreadIds.has(c.id)) : sortedChannels;

        return filteredChannels;
    }, [category.type, sortedChannels, unreadIds, unreadsOnTop]);

    const unreadChannels = useMemo(() => {
        return unreadsOnTop ? [] : ids.filter((c) => unreadIds.has(c.id));
    }, [ids, unreadIds, unreadsOnTop]);

    const directChannels = useMemo(() => {
        return ids.concat(unreadChannels).filter(isDMorGM);
    }, [ids.length, unreadChannels.length]);

    const showCategoryPicker = useCallback(async (channel: ChannelModel | Channel) => {
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const teamId = category.teamId;

        const allCategories = await queryCategoriesByTeamIds(database, [teamId]).fetch();
        // Filter to custom + channels (exclude DMs and favorites for move targets)
        const targetCategories = allCategories.filter((c) => c.type !== DMS_CATEGORY);

        const currentCat = await getChannelCategory(database, teamId, channel.id);

        const renderContent = () => {
            const handleSelect = async (targetCategoryId: string) => {
                await dismissBottomSheet();
                const {error} = await moveChannelToCategory(serverUrl, channel.id, targetCategoryId);
                if (error) {
                    showSnackBar({
                        barType: 'UNFAVORITE_CHANNEL' as any,
                        customMessage: intl.formatMessage({
                            id: 'channel_info.move_category_error',
                            defaultMessage: 'Failed to move channel. Please try again.',
                        }),
                    });
                } else {
                    const targetCat = targetCategories.find((c) => c.id === targetCategoryId);
                    showSnackBar({
                        barType: 'FAVORITE_CHANNEL' as any,
                        customMessage: intl.formatMessage(
                            {id: 'channel_info.moved_to_category', defaultMessage: 'Moved to {categoryName}'},
                            {categoryName: targetCat?.displayName || ''},
                        ),
                    });
                }
            };

            const optionStyles = getOptionStyles(theme);

            return (
                <View>
                    <Text style={optionStyles.sectionTitle}>
                        {intl.formatMessage({id: 'channel_info.select_category', defaultMessage: 'Select Category'})}
                    </Text>
                    {targetCategories.map((cat) => {
                        const isCurrent = currentCat?.id === cat.id;
                        return (
                            <TouchableOpacity
                                key={cat.id}
                                onPress={() => handleSelect(cat.id)}
                                style={optionStyles.categoryRow}
                            >
                                <CompassIcon
                                    name={cat.type === FAVORITES_CATEGORY ? 'star' : cat.type === CHANNELS_CATEGORY ? 'folder-outline' : 'folder'}
                                    size={20}
                                    color={theme.centerChannelColor}
                                    style={{marginRight: 12}}
                                />
                                <Text style={optionStyles.categoryText}>{cat.displayName}</Text>
                                {isCurrent && (
                                    <Text style={optionStyles.currentBadge}>
                                        {intl.formatMessage({id: 'common.current', defaultMessage: 'current'})}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            );
        };

        bottomSheet({
            closeButtonId: 'close-category-picker',
            renderContent,
            snapPoints: ['50%'],
            theme,
            title: intl.formatMessage({id: 'channel_info.move_to_category', defaultMessage: 'Move to Category'}),
            scrollable: true,
        });
    }, [category.teamId, intl, serverUrl, theme]);

    const handleLongPress = useCallback(async (channel: ChannelModel | Channel) => {
        // Only show options for non-DM/GM channels
        if (isDMorGM(channel)) {
            return;
        }

        const optionStyles = getOptionStyles(theme);

        const renderContent = () => {
            const handleFavorite = async () => {
                await dismissBottomSheet();
                toggleFavoriteChannel(serverUrl, channel.id, true);
            };

            const handleMoveToCategory = () => {
                dismissBottomSheet().then(() => {
                    setTimeout(() => showCategoryPicker(channel), 200);
                });
            };

            return (
                <View>
                    <TouchableOpacity
                        onPress={handleFavorite}
                        style={optionStyles.optionRow}
                    >
                        <CompassIcon name='star-outline' style={optionStyles.optionIcon}/>
                        <Text style={optionStyles.optionText}>
                            {intl.formatMessage({id: 'channel_info.favorite', defaultMessage: 'Favorite'})}
                        </Text>
                    </TouchableOpacity>
                    <View style={optionStyles.divider}/>
                    <TouchableOpacity
                        onPress={handleMoveToCategory}
                        style={optionStyles.optionRow}
                    >
                        <CompassIcon name='folder-move-outline' style={optionStyles.optionIcon}/>
                        <Text style={optionStyles.optionText}>
                            {intl.formatMessage({id: 'channel_info.move_to_category', defaultMessage: 'Move to Category'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            );
        };

        bottomSheet({
            closeButtonId: 'close-channel-options',
            renderContent,
            snapPoints: [200],
            theme,
            title: ('displayName' in channel ? channel.displayName : channel.display_name) || channel.name,
        });
    }, [intl, serverUrl, showCategoryPicker, theme]);

    const renderItem = useCallback(({item}: {item: ChannelModel}) => {
        return (
            <ChannelItem
                channel={item}
                onPress={onChannelSwitch}
                onLongPress={handleLongPress}
                key={item.id}
                testID={`channel_list.category.${category.displayName.replace(/ /g, '_').toLocaleLowerCase()}.channel_item`}
                shouldHighlightActive={isChannelScreenActive}
                shouldHighlightState={true}
                isOnHome={true}
            />
        );
    }, [category.displayName, handleLongPress, isChannelScreenActive, onChannelSwitch]);

    const sharedValue = useSharedValue(category.collapsed);

    useEffect(() => {
        sharedValue.value = category.collapsed;
    }, [category.collapsed]);

    useEffect(() => {
        if (directChannels.length) {
            fetchDirectChannelsInfo(serverUrl, directChannels.filter((c) => !c.displayName));
        }
    }, [directChannels.length]);

    const height = ids.length ? ids.length * CHANNEL_ROW_HEIGHT : 0;
    const unreadHeight = unreadChannels.length ? unreadChannels.length * CHANNEL_ROW_HEIGHT : 0;

    const animatedStyle = useAnimatedStyle(() => {
        const opacity = unreadHeight > 0 ? 1 : 0;
        const heightDuration = unreadHeight > 0 ? 200 : 300;
        return {
            height: withTiming(sharedValue.value ? unreadHeight : height, {duration: heightDuration}),
            opacity: withTiming(sharedValue.value ? opacity : 1, {duration: sharedValue.value ? 200 : 300, easing: Easing.inOut(Easing.exp)}),
        };
    }, [height, unreadHeight]);

    const listStyle = useMemo(() => ({
        height: category.collapsed ? unreadHeight : height,
    }), [category.collapsed, height, unreadHeight]);

    return (
        <Animated.View style={animatedStyle}>
            <FlatList
                data={category.collapsed ? unreadChannels : ids}
                renderItem={renderItem}
                keyExtractor={extractKey}

                strictMode={true}
                style={listStyle}
            />
        </Animated.View>
    );
};

export default CategoryBody;
