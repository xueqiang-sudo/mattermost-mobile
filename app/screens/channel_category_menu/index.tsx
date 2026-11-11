// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {moveChannelToCategory} from '@actions/remote/category';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {queryCategoriesByTeamIds} from '@queries/servers/categories';
import {getCurrentTeamId, getCurrentUserId} from '@queries/servers/system';
import {dismissModal} from '@screens/navigation';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {classifyChannel, buildGmMemberMap} from '@utils/channel_classification';
import {getChannelById} from '@queries/servers/channel';

import type {AvailableScreens} from '@typings/screens/navigation';
import type CategoryModel from '@typings/database/models/servers/category';

type Props = {
    componentId: AvailableScreens;
    channelId: string;
    currentCategoryId?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.5),
        justifyContent: 'flex-end',
    },
    content: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingHorizontal: 16,
        paddingBottom: 32,
        maxHeight: '70%',
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
        marginTop: 10,
        marginBottom: 16,
    },
    title: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 16,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    menuIcon: {
        marginRight: 12,
    },
    menuTextContainer: {
        flex: 1,
    },
    menuText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
    },
    menuHint: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        marginTop: 4,
    },
    categoryItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    categoryText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        marginBottom: 8,
    },
    backText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.buttonBg,
        marginLeft: 8,
    },
}));

export default function ChannelCategoryMenu({componentId, channelId, currentCategoryId}: Props) {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);
    const [view, setView] = useState<'main' | 'selectCategory'>('main');
    const [categories, setCategories] = useState<CategoryModel[]>([]);

    const {database} = useMemo(() => {
        return DatabaseManager.getServerDatabaseAndOperator(serverUrl);
    }, [serverUrl]);

    const loadCategories = useCallback(async () => {
        try {
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {
                return;
            }
            const cats = await queryCategoriesByTeamIds(database, [teamId]).fetch();
            setCategories(cats);
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    }, [database]);

    // Load categories on mount so handleAutoClassify has them
    useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const handleMoveToCategory = useCallback(async () => {
        await loadCategories();
        setView('selectCategory');
    }, [loadCategories]);

    const handleSelectCategory = useCallback(async (categoryId: string, categoryName: string) => {
        try {
            const {error} = await moveChannelToCategory(serverUrl, channelId, categoryId);
            if (error) {
                throw error;
            }
            handleClose();
            showSnackBar({
                barType: 'FAVORITE_CHANNEL' as any,
                customMessage: intl.formatMessage(
                    {id: 'category.moved_success', defaultMessage: 'Moved to {categoryName}'},
                    {categoryName},
                ),
            });
        } catch (error) {
            showSnackBar({
                barType: 'UNFAVORITE_CHANNEL' as any,
                customMessage: intl.formatMessage({id: 'category.move_failed', defaultMessage: 'Failed to move channel'}),
            });
        }
    }, [channelId, handleClose, intl, serverUrl]);

    const handleAutoClassify = useCallback(async () => {
        try {
            const channel = await getChannelById(database, channelId);
            if (!channel) {
                throw new Error('Channel not found');
            }

            const currentUserId = await getCurrentUserId(database);
            const teamId = await getCurrentTeamId(database);
            if (!teamId || !currentUserId) {
                throw new Error('Missing team or user ID');
            }

            // Get team members
            const teamMemberIds = new Set<string>();
            const teamMembers = await database.get('TeamMember').query().fetch();
            for (const member of teamMembers) {
                if ((member as any).teamId === teamId) {
                    teamMemberIds.add((member as any).userId);
                }
            }

            // Get GM members
            const allChannels = await database.get('Channel').query().fetch();
            const allMemberships = await database.get('ChannelMembership').query().fetch();
            const gmMemberIds = buildGmMemberMap(allChannels as any, allMemberships as any);

            // Get bot user IDs
            const botUserIds = new Set<string>();
            const users = await database.get('User').query().fetch();
            for (const user of users) {
                if ((user as any).isBot) {
                    botUserIds.add((user as any).id);
                }
            }

            // Classify channel
            const classification = classifyChannel(
                channel,
                currentUserId,
                teamMemberIds,
                gmMemberIds,
                botUserIds,
            );

            // Find the default 'channels' category
            // Internal and external are virtual groups, not actual categories
            // Both should be moved to the default 'channels' category
            const channelsCategory = categories.find(c => c.type === 'channels');

            if (channelsCategory) {
                const {error} = await moveChannelToCategory(serverUrl, channelId, channelsCategory.id);
                if (error) {
                    throw error;
                }
            }

            handleClose();

            const messageKey = classification === 'internal'
                ? 'category.auto_classified_internal'
                : 'category.auto_classified_external';

            showSnackBar({
                barType: 'FAVORITE_CHANNEL' as any,
                customMessage: intl.formatMessage({
                    id: messageKey,
                    defaultMessage: classification === 'internal'
                        ? 'Auto-classified to Internal'
                        : 'Auto-classified to External',
                }),
            });
        } catch (error) {
            showSnackBar({
                barType: 'UNFAVORITE_CHANNEL' as any,
                customMessage: intl.formatMessage({id: 'category.auto_classify_failed', defaultMessage: 'Failed to auto-classify'}),
            });
        }
    }, [channelId, categories, database, handleClose, intl, serverUrl]);

    const handleRemoveFromCategory = useCallback(async () => {
        try {
            // Auto-classify will move the channel to the appropriate default category
            await handleAutoClassify();

            showSnackBar({
                barType: 'FAVORITE_CHANNEL' as any,
                customMessage: intl.formatMessage({
                    id: 'category.removed_success',
                    defaultMessage: 'Removed from category and auto-classified',
                }),
            });
        } catch (error) {
            showSnackBar({
                barType: 'UNFAVORITE_CHANNEL' as any,
                customMessage: intl.formatMessage({id: 'category.remove_failed', defaultMessage: 'Failed to remove from category'}),
            });
        }
    }, [handleAutoClassify, intl]);

    const renderMainMenu = () => (
        <>
            <TouchableOpacity
                style={style.menuItem}
                onPress={handleMoveToCategory}
            >
                <CompassIcon
                    name='folder-move'
                    size={20}
                    color={theme.centerChannelColor}
                    style={style.menuIcon}
                />
                <View style={style.menuTextContainer}>
                    <Text style={style.menuText}>
                        {intl.formatMessage({id: 'category.move_to', defaultMessage: 'Move to category'})}
                    </Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity
                style={style.menuItem}
                onPress={handleAutoClassify}
            >
                <CompassIcon
                    name='auto-fix'
                    size={20}
                    color={theme.centerChannelColor}
                    style={style.menuIcon}
                />
                <View style={style.menuTextContainer}>
                    <Text style={style.menuText}>
                        {intl.formatMessage({id: 'category.auto_classify', defaultMessage: 'Auto-classify'})}
                    </Text>
                    <Text style={style.menuHint}>
                        {intl.formatMessage({
                            id: 'category.auto_classify_hint',
                            defaultMessage: 'Automatically classify based on member rules',
                        })}
                    </Text>
                </View>
            </TouchableOpacity>

            {currentCategoryId && (
                <TouchableOpacity
                    style={style.menuItem}
                    onPress={handleRemoveFromCategory}
                >
                    <CompassIcon
                        name='close-circle-outline'
                        size={20}
                        color={theme.centerChannelColor}
                        style={style.menuIcon}
                    />
                    <View style={style.menuTextContainer}>
                        <Text style={style.menuText}>
                            {intl.formatMessage({id: 'category.remove_from', defaultMessage: 'Remove from category'})}
                        </Text>
                    </View>
                </TouchableOpacity>
            )}
        </>
    );

    const renderCategorySelection = () => (
        <>
            <TouchableOpacity
                style={style.backButton}
                onPress={() => setView('main')}
            >
                <CompassIcon name='arrow-left' size={20} color={theme.buttonBg}/>
                <Text style={style.backText}>
                    {intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'})}
                </Text>
            </TouchableOpacity>

            {categories.map((category) => (
                <TouchableOpacity
                    key={category.id}
                    style={style.categoryItem}
                    onPress={() => handleSelectCategory(category.id, category.displayName)}
                >
                    <Text style={style.categoryText}>
                        {category.displayName}
                    </Text>
                </TouchableOpacity>
            ))}
        </>
    );

    return (
        <SafeAreaView edges={['bottom']} style={style.container}>
            <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={handleClose}
            />
            <View style={style.content}>
                <View style={style.handle}/>
                <Text style={style.title}>
                    {view === 'main'
                        ? intl.formatMessage({id: 'category.menu_title', defaultMessage: 'Channel Actions'})
                        : intl.formatMessage({id: 'category.select_category', defaultMessage: 'Select Category'})
                    }
                </Text>
                {view === 'main' ? renderMainMenu() : renderCategorySelection()}
            </View>
        </SafeAreaView>
    );
}
