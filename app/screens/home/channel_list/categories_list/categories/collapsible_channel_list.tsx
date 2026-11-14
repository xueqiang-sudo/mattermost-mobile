// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, SectionList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {debugLog} from '@store/debug_log';
import {Q} from '@nozbe/watermelondb';
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {switchMap, combineLatestWith, distinctUntilChanged, map} from 'rxjs/operators';

import {deleteCategory} from '../../../apps/workbench_api';
import {fetchDirectChannelsInfo} from '@actions/remote/channel';
import ChannelItem from '@components/channel_item';
import ConversationListSwipeableItem from '../../conversation_list/conversation_list_swipeable_item';
import CompassIcon from '@components/compass_icon';
import {CHANNELS_CATEGORY, DMS_CATEGORY, FAVORITES_CATEGORY} from '@constants/categories';
import {MM_TABLES} from '@constants/database';
import {Preferences} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {queryChannelsById, parseUserIdsFromGroupedChannelName} from '@queries/servers/channel';
import {queryCategoriesByTeamIds} from '@queries/servers/categories';
import {queryPreferencesByCategoryAndName} from '@queries/servers/preference';
import {observeUserIdsInTeam} from '@queries/servers/user';
import {getLocalizedMessage} from '@i18n';
import {buildGmMemberMap, classifyChannel} from '@utils/channel_classification';
import {isDMorGM} from '@utils/channel';
import {getUserIdFromChannelName} from '@utils/user';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {showSnackBar} from '@utils/snack_bar';
import {logDebug} from '@utils/log';
import {getFullErrorMessage} from '@utils/errors';
import {bottomSheet, dismissBottomSheet} from '@screens/navigation';
import {bottomSheetSnapPoint} from '@utils/helpers';
import SlideUpPanelItem, {ITEM_HEIGHT, ITEM_HEIGHT_WITH_SUBTITLE} from '@components/slide_up_panel_item';
import {moveChannelToCategory} from '@actions/remote/category';
import {getChannelById} from '@queries/servers/channel';
import {getCurrentTeamId, getCurrentUserId} from '@queries/servers/system';
import DatabaseManager from '@database/manager';
import {from} from 'rxjs';

import type {WithDatabaseArgs} from '@typings/database/database';
import type CategoryModel from '@typings/database/models/servers/category';
import type ChannelModel from '@typings/database/models/servers/channel';
import type ChannelMembershipModel from '@typings/database/models/servers/channel_membership';
import type MyChannelModel from '@typings/database/models/servers/my_channel';
import type UserModel from '@typings/database/models/servers/user';

const {SERVER: {CHANNEL_MEMBERSHIP, MY_CHANNEL, USER}} = MM_TABLES;

type Section = {
    title: string;
    data: ChannelModel[];
    key: string;
    type: 'internal' | 'external' | 'custom';
    categoryId?: string;
    teamId?: string;
    isCustomCategory: boolean;
    actualCount: number;
};

type EnhanceProps = {
    builtInCategories: CategoryModel[];
    customCategories: CategoryModel[];
    currentUserId: string;
    currentTeamId: string;
    locale: string;
    isTablet: boolean;
    onChannelSwitch: (channel: Channel | ChannelModel) => void;
} & WithDatabaseArgs;

type RenderProps = {
    sections: Section[];
    locale: string;
    isTablet: boolean;
    currentUserId: string;
    onChannelSwitch: (channel: Channel | ChannelModel) => void;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginHorizontal: 8,
        marginTop: 4,
        borderRadius: 8,
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    sectionTitle: {
        ...typography('Body', 100, 'Regular'),
        marginLeft: 8,
    },
    sectionHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    badge: {
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        minWidth: 20,
        alignItems: 'center',
    },
    badgeText: {
        ...typography('Body', 50, 'SemiBold'),
    },
    trashIcon: {
        marginLeft: 12,
        padding: 4,
    },
    trashIconDisabled: {
        opacity: 0.3,
    },
}));

const CollapsibleChannelListRenderer = ({
    sections,
    currentUserId,
    onChannelSwitch,
}: RenderProps) => {
    const theme = useTheme();
    const styles = getStyles(theme);
    const serverUrl = useServerUrl();
    const intl = useIntl();
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['internal', 'external']));
    const swipeableRegistrar = useRef<{current: React.RefObject<any> | null}>({current: null});

    const toggleSection = useCallback((sectionKey: string) => {
        setExpandedSections((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(sectionKey)) {
                newSet.delete(sectionKey);
            } else {
                newSet.add(sectionKey);
            }
            return newSet;
        });
    }, []);

    const handleDeleteCategory = useCallback(async (categoryId: string, categoryName: string, teamId: string, channelCount: number) => {
        // If category has channels, show error message
        if (channelCount > 0) {
            Alert.alert(
                intl.formatMessage({id: 'category.delete_title', defaultMessage: 'Cannot Delete Category'}),
                intl.formatMessage(
                    {id: 'category.delete_has_channels', defaultMessage: 'Please remove all channels from this category before deleting it.'},
                ),
                [
                    {text: intl.formatMessage({id: 'category.ok', defaultMessage: 'OK'})},
                ],
            );
            return;
        }

        // If category is empty, show confirmation and delete
        Alert.alert(
            intl.formatMessage({id: 'category.delete_title', defaultMessage: 'Delete this category?'}),
            intl.formatMessage(
                {id: 'category.delete_empty', defaultMessage: 'Are you sure you want to delete the category "{name}"?'},
                {name: categoryName},
            ),
            [
                {text: intl.formatMessage({id: 'category.cancel', defaultMessage: 'Cancel'}), style: 'cancel'},
                {
                    text: intl.formatMessage({id: 'category.delete', defaultMessage: 'Delete'}),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteCategory(serverUrl, currentUserId, teamId, categoryId);
                            showSnackBar({
                                barType: 'FAVORITE_CHANNEL' as any,
                                customMessage: intl.formatMessage(
                                    {id: 'category.deleted', defaultMessage: 'Category "{name}" deleted'},
                                    {name: categoryName},
                                ),
                            });
                        } catch (error) {
                            showSnackBar({
                                barType: 'UNFAVORITE_CHANNEL' as any,
                                customMessage: intl.formatMessage(
                                    {id: 'category.delete_error', defaultMessage: 'Failed to delete category'},
                                ),
                            });
                        }
                    },
                },
            ],
        );
    }, [serverUrl, intl]);

    const renderSectionHeader = useCallback(({section}: {section: Section}) => {
        const isExpanded = expandedSections.has(section.key);
        const canDelete = section.isCustomCategory; // Always allow clicking delete to show appropriate message

        return (
            <TouchableOpacity
                onPress={() => toggleSection(section.key)}
                style={styles.sectionHeader}
            >
                <View style={styles.sectionHeaderLeft}>
                    <CompassIcon
                        name={isExpanded ? 'chevron-down' : 'chevron-right'}
                        size={16}
                        color={changeOpacity(theme.centerChannelColor, 0.64)}
                    />
                    <Text style={[styles.sectionTitle, {color: theme.centerChannelColor}]}>
                        {section.title}
                    </Text>
                </View>
                <View style={styles.sectionHeaderRight}>
                    <View style={[styles.badge, {backgroundColor: changeOpacity(theme.centerChannelColor, 0.08)}]}>
                        <Text style={[styles.badgeText, {color: changeOpacity(theme.centerChannelColor, 0.64)}]}>
                            {section.actualCount}
                        </Text>
                    </View>
                    {section.isCustomCategory && (
                        <TouchableOpacity
                            onPress={() => handleDeleteCategory(section.categoryId!, section.title, section.teamId!, section.actualCount)}
                            disabled={!canDelete}
                            style={[styles.trashIcon, !canDelete && styles.trashIconDisabled]}
                        >
                            <CompassIcon
                                name='trash-can-outline'
                                size={18}
                                color={canDelete ? theme.errorTextColor : changeOpacity(theme.centerChannelColor, 0.3)}
                            />
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
        );
    }, [expandedSections, theme, toggleSection, handleDeleteCategory]);

    const handleChannelLongPress = useCallback((channel: ChannelModel, sectionType?: 'internal' | 'external' | 'custom', categoryId?: string) => {
        // Public channels (O) and smart notebook channels (sn_ prefix) cannot be long-pressed
        // They always belong to the internal group
        if (channel.type === 'O' || channel.name?.startsWith('sn_')) {
            return;
        }
        const showCategorySelection = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const teamId = await getCurrentTeamId(database);
                if (!teamId) return;
                const cats = await queryCategoriesByTeamIds(database, [teamId]).fetch();
                const customCategories = cats.filter((c) => c.type === 'custom');

                const renderCategoryContent = () => (
                    <>
                        {customCategories.map((cat) => (
                            <SlideUpPanelItem
                                key={cat.id}
                                leftIcon='folder-outline'
                                text={cat.displayName}
                                onPress={async () => {
                                    await dismissBottomSheet();
                                    try {
                                        const {error} = await moveChannelToCategory(serverUrl, channel.id, cat.id);
                                        if (error) throw error;
                                        showSnackBar({
                                            barType: 'FAVORITE_CHANNEL' as any,
                                            customMessage: intl.formatMessage(
                                                {id: 'category.moved_success', defaultMessage: 'Moved to {categoryName}'},
                                                {categoryName: cat.displayName},
                                            ),
                                        });
                                    } catch {
                                        showSnackBar({
                                            barType: 'UNFAVORITE_CHANNEL' as any,
                                            customMessage: intl.formatMessage({id: 'category.move_failed', defaultMessage: 'Failed to move channel'}),
                                        });
                                    }
                                }}
                                testID={`channel_menu.category.${cat.id}`}
                            />
                        ))}
                        <SlideUpPanelItem
                            leftIcon='close'
                            text={intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'})}
                            onPress={() => dismissBottomSheet()}
                            testID='channel_menu.category.cancel'
                        />
                    </>
                );

                const catItemCount = customCategories.length + 1;
                bottomSheet({
                    closeButtonId: 'close-channel-category-select',
                    renderContent: renderCategoryContent,
                    snapPoints: [1, bottomSheetSnapPoint(catItemCount, ITEM_HEIGHT)],
                    theme,
                    title: intl.formatMessage({id: 'category.select_category', defaultMessage: 'Select Category'}),
                });
            } catch {
                // ignore
            }
        };

        const renderContent = () => {
            const items: React.ReactElement[] = [];

            // Internal/External groups: show "Move to category" + "Cancel"
            if (sectionType === 'internal' || sectionType === 'external') {
                items.push(
                    <SlideUpPanelItem
                        key='move'
                        leftIcon='folder-move-outline'
                        text={intl.formatMessage({id: 'category.move_to', defaultMessage: 'Move to category'})}
                        onPress={async () => {
                            await dismissBottomSheet();
                            showCategorySelection();
                        }}
                        testID='channel_menu.move_to_category'
                    />,
                );
            }

            // Custom categories: show "Remove from category" + "Cancel"
            if (sectionType === 'custom') {
                items.push(
                    <SlideUpPanelItem
                        key='remove'
                        leftIcon='close-circle-outline'
                        text={intl.formatMessage({id: 'category.remove_from', defaultMessage: 'Remove from category'})}
                        subtitle={intl.formatMessage({id: 'category.remove_hint', defaultMessage: 'Will auto-classify to Internal or External based on members'})}
                        onPress={async () => {
                            await dismissBottomSheet();
                            try {
                                debugLog('[RemoveCat]', 'step1: start', {channelId: channel.id});
                                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                                const ch = await getChannelById(database, channel.id);
                                if (!ch) {
                                    debugLog('[RemoveCat]', 'FAILED: channel not found', {channelId: channel.id});
                                    throw new Error('Channel not found');
                                }
                                debugLog('[RemoveCat]', 'step2: got channel', {type: ch.type, name: ch.displayName});

                                const curUserId = await getCurrentUserId(database);
                                const teamId = await getCurrentTeamId(database);
                                if (!teamId || !curUserId) {
                                    debugLog('[RemoveCat]', 'FAILED: missing team/user', {teamId, curUserId});
                                    throw new Error('Missing team or user ID');
                                }
                                debugLog('[RemoveCat]', 'step3: got teamId', {teamId});

                                const teamMemberIds = new Set<string>();
                                const teamMembers = await database.get('TeamMember').query().fetch();
                                for (const member of teamMembers) {
                                    if ((member as any).teamId === teamId) {
                                        teamMemberIds.add((member as any).userId);
                                    }
                                }

                                const allChannels = await database.get('Channel').query().fetch();
                                const allMemberships = await database.get('ChannelMembership').query().fetch();
                                const gmMemberIds = buildGmMemberMap(allChannels as any, allMemberships as any);

                                const botUserIds = new Set<string>();
                                const users = await database.get('User').query().fetch();
                                for (const user of users) {
                                    if ((user as any).isBot) {
                                        botUserIds.add((user as any).id);
                                    }
                                }

                                const classification = classifyChannel(ch, curUserId, teamMemberIds, gmMemberIds, botUserIds);
                                debugLog('[RemoveCat]', 'step4: classified', {classification});

                                // Remove from custom category: move to the correct built-in category
                                // DM/GM channels → direct_messages, regular channels → channels
                                const cats = await queryCategoriesByTeamIds(database, [teamId]).fetch();
                                debugLog('[RemoveCat]', 'step5: categories', {count: cats.length, types: cats.map(c => `${c.type}(${c.id.substring(0,8)})`).join(',')});
                                const isDmOrGm = ch.type === 'D' || ch.type === 'G';
                                const targetType = isDmOrGm ? DMS_CATEGORY : CHANNELS_CATEGORY;
                                const targetCategory = cats.find((c) => c.type === targetType);
                                debugLog('[RemoveCat]', 'step6: target', {targetType, found: Boolean(targetCategory), targetId: targetCategory?.id});

                                if (targetCategory) {
                                    debugLog('[RemoveCat]', 'step7: calling moveChannelToCategory', {channelId: channel.id, targetId: targetCategory.id});
                                    const {error} = await moveChannelToCategory(serverUrl, channel.id, targetCategory.id);
                                    if (error) {
                                        debugLog('[RemoveCat]', 'FAILED: moveChannelToCategory error', {error: String(error)});
                                        throw error;
                                    }
                                    debugLog('[RemoveCat]', 'step8: moveChannelToCategory success');
                                } else {
                                    debugLog('[RemoveCat]', 'WARNING: targetCategory not found, skipping move', {targetType});
                                }

                                const messageKey = classification === 'internal'
                                    ? 'category.auto_classified_internal'
                                    : 'category.auto_classified_external';
                                debugLog('[RemoveCat]', 'step9: showing success snackbar', {classification});
                                showSnackBar({
                                    barType: 'FAVORITE_CHANNEL' as any,
                                    customMessage: intl.formatMessage({
                                        id: messageKey,
                                        defaultMessage: classification === 'internal'
                                            ? '已自动分类到内部群'
                                            : '已自动分类到外部群',
                                    }),
                                });
                            } catch (error) {
                                debugLog('[RemoveCat]', 'CATCH: failed', {channelId: channel.id, error: getFullErrorMessage(error)});
                                logDebug('[autoClassify] failed', {
                                    channelId: channel.id,
                                    error: getFullErrorMessage(error),
                                });
                                showSnackBar({
                                    barType: 'UNFAVORITE_CHANNEL' as any,
                                    customMessage: intl.formatMessage({id: 'category.auto_classify_failed', defaultMessage: '自动分类失败'}),
                                });
                            }
                        }}
                        testID='channel_menu.auto_classify'
                    />,
                );
            }

            items.push(
                <SlideUpPanelItem
                    key='cancel'
                    leftIcon='close'
                    text={intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'})}
                    onPress={() => dismissBottomSheet()}
                    testID='channel_menu.cancel'
                />,
            );

            return <>{items}</>;
        };

        // Calculate total height based on actual item heights
        const totalHeight = sectionType === 'custom'
            ? ITEM_HEIGHT_WITH_SUBTITLE + ITEM_HEIGHT  // "Remove from category" with subtitle + "Cancel"
            : ITEM_HEIGHT * 2;  // "Move to category" + "Cancel"
        bottomSheet({
            closeButtonId: 'close-channel-category-menu',
            renderContent,
            snapPoints: [1, totalHeight],
            theme,
            title: '',
        });
    }, [serverUrl, theme, intl]);

    const renderItem = useCallback(({item, section}: {item: ChannelModel; section: Section}) => {
        return (
            <ConversationListSwipeableItem
                channel={item}
                onPress={onChannelSwitch}
                onLongPress={(ch) => handleChannelLongPress(ch, section.type, section.categoryId)}
                swipeableRegistrar={swipeableRegistrar.current}
                shouldHighlightActive={true}
                shouldHighlightState={true}
                isOnHome={true}
            />
        );
    }, [onChannelSwitch, handleChannelLongPress]);

    // Filter sections based on expanded state
    const processedSections = sections.map((section) => ({
        ...section,
        data: expandedSections.has(section.key) ? section.data : [],
    }));

    return (
        <SectionList
            sections={processedSections}
            keyExtractor={(item) => item.id}
            renderSectionHeader={renderSectionHeader}
            renderItem={renderItem}
            style={styles.container}
            showsVerticalScrollIndicator={true}
            stickySectionHeadersEnabled={false}
        />
    );
};

const enhanced = withObservables(
    ['builtInCategories', 'customCategories', 'currentUserId', 'currentTeamId'],
    ({builtInCategories, customCategories, currentUserId, currentTeamId, database, locale, isTablet, onChannelSwitch}: EnhanceProps) => {
        // Use the passed currentTeamId directly (ensures proper reset on team switch)
        const currentTeamId$ = of$(currentTeamId);

        // Observe TEAM_MEMBERSHIP reactively so classification updates
        // when fetchTeamMembersForClassification writes new members
        const teamMemberIds$ = currentTeamId ? observeUserIdsInTeam(database, currentTeamId) : of$(new Set<string>());

        // Get channel IDs from custom categories (observe CategoryChannel table reactively)
        const customCategoryIds = customCategories.map(cat => cat.id);
        const customCategoryChannelIds = customCategoryIds.length > 0
            ? database.get(MM_TABLES.SERVER.CATEGORY_CHANNEL).query(
                Q.where('category_id', Q.oneOf(customCategoryIds)),
            ).observe().pipe(
                map((categoryChannels) => {
                    const ids = new Set<string>();
                    for (const cc of categoryChannels) {
                        ids.add(cc.channelId);
                    }
                    return ids;
                }),
            )
            : of$(new Set<string>());

        // Get favorited channel IDs (observe CategoryChannel table reactively)
        const favoritesCategory = builtInCategories.find(cat => cat.type === FAVORITES_CATEGORY);
        const favoritedChannelIds = favoritesCategory
            ? database.get(MM_TABLES.SERVER.CATEGORY_CHANNEL).query(
                Q.where('category_id', favoritesCategory.id),
            ).observe().pipe(
                map((categoryChannels) => new Set(categoryChannels.map(cc => cc.channelId))),
            )
            : of$(new Set<string>());

        // Get channel IDs from built-in categories (DM/GM channels are placed here by the server per team)
        // Observe CategoryChannel table reactively so new channels added to categories trigger updates
        const builtInCategoryIds = builtInCategories.map(cat => cat.id);
        const builtInCategoryChannelIds = builtInCategoryIds.length > 0
            ? database.get(MM_TABLES.SERVER.CATEGORY_CHANNEL).query(
                Q.where('category_id', Q.oneOf(builtInCategoryIds)),
            ).observe().pipe(
                switchMap((categoryChannels) => {
                    const ids = new Set<string>();
                    for (const cc of categoryChannels) {
                        ids.add(cc.channelId);
                    }
                    return of$(ids);
                }),
            )
            : of$(new Set<string>());

        // Get ALL channels the user is a member of
        const allUserChannels = database.get<MyChannelModel>(MY_CHANNEL)
            .query()
            .observe()
            .pipe(
                switchMap((myChannels) => {
                    const channelIds = myChannels.map(m => m.id);
                    if (channelIds.length === 0) {
                        return of$([] as ChannelModel[]);
                    }
                    return queryChannelsById(database, channelIds).observe();
                }),
            );

        // Filter: channels in current team (by team_id), DM/GM only if in a built-in category for this team.
        // This matches webapp behavior where DM/GM channels are team-scoped via category membership.
        const builtInChannelIds = allUserChannels.pipe(
            combineLatestWith(customCategoryChannelIds, currentTeamId$, builtInCategoryChannelIds),
            map(([channels, customIds, teamId, builtInIds]) => {
                const filtered = channels.filter(ch => {
                    const isDmOrGm = ch.type === 'D' || ch.type === 'G';
                    // Smart notebook channels (sn_ prefix) are cross-team, like DM/GM
                    const isSmartNotebook = ch.name?.startsWith('sn_');
                    // Non-DM/GM/SmartNotebook: match by team_id
                    // DM/GM/SmartNotebook: only include if in a built-in category for this team
                    const isInTeam = (isDmOrGm || isSmartNotebook) ? builtInIds.has(ch.id) : ch.teamId === teamId;
                    const notInCustom = !customIds.has(ch.id);
                    return isInTeam && notInCustom;
                });

                // Debug: log filtering results
                const totalDmGm = channels.filter(ch => ch.type === 'D' || ch.type === 'G');
                const dmGmInBuiltIn = totalDmGm.filter(ch => builtInIds.has(ch.id));
                const dmGmNotInBuiltIn = totalDmGm.filter(ch => !builtInIds.has(ch.id));
                if (dmGmNotInBuiltIn.length > 0) {
                    const details = dmGmNotInBuiltIn.map(ch => `${ch.id.substring(0, 8)}(${ch.type})`).join(', ');
                }

                return filtered.map(ch => ch.id);
            }),
        );

        // Observe all channels with those IDs
        const channels = builtInChannelIds.pipe(
            switchMap((ids) =>
                ids.length > 0
                    ? queryChannelsById(database, ids).observe()
                    : of$([] as ChannelModel[]),
            ),
        );

        // For GM channels, observe their memberships
        const gmMemberMap = channels.pipe(
            switchMap((chs) => {
                const gmIds = chs
                    .filter((c) => c.type === 'G' || c.type === 'P')
                    .map((c) => c.id);
                if (gmIds.length === 0) {
                    return of$(new Map<string, string[]>());
                }
                return database.get<ChannelMembershipModel>(CHANNEL_MEMBERSHIP)
                    .query(Q.where('channel_id', Q.oneOf(gmIds)))
                    .observe()
                    .pipe(
                        map((memberships) => buildGmMemberMap(chs, memberships)),
                    );
            }),
        );

        // Observe bot user IDs among channel members
        const botUserIds = channels.pipe(
            switchMap((chs) => {
                const channelIds = chs
                    .filter(c => c.type === 'G' || c.type === 'P' || c.type === 'D')
                    .map(c => c.id);
                if (channelIds.length === 0) {
                    return of$(new Set<string>());
                }
                return database.get<ChannelMembershipModel>(CHANNEL_MEMBERSHIP)
                    .query(Q.where('channel_id', Q.oneOf(channelIds)))
                    .observe()
                    .pipe(
                        switchMap((memberships) => {
                            const userIds = [...new Set(memberships.map(m => m.userId))];
                            if (userIds.length === 0) {
                                return of$(new Set<string>());
                            }
                            return database.get<UserModel>(USER)
                                .query(Q.where('id', Q.oneOf(userIds)))
                                .observe()
                                .pipe(
                                    map((users) => {
                                        const botIds = new Set<string>();
                                        for (const u of users) {
                                            if (u.isBot) {
                                                botIds.add(u.id);
                                            }
                                        }
                                        return botIds;
                                    }),
                                );
                        }),
                    );
            }),
        );

        // Observe hidden DM/GM preferences (user explicitly closed these channels).
        // Aligned with webapp: DM/GM channels with show preference = 'false' are excluded.
        const hiddenDmPrefs = queryPreferencesByCategoryAndName(
            database, Preferences.CATEGORIES.DIRECT_CHANNEL_SHOW, undefined, 'false',
        ).observeWithColumns(['value']);
        const hiddenGmPrefs = queryPreferencesByCategoryAndName(
            database, Preferences.CATEGORIES.GROUP_CHANNEL_SHOW, undefined, 'false',
        ).observeWithColumns(['value']);
        const hiddenChannelIds = hiddenDmPrefs.pipe(
            combineLatestWith(hiddenGmPrefs),
            map(([dms, gms]) => {
                const hidden = new Set<string>();
                // GM prefs: name = channel ID
                for (const p of gms) {
                    hidden.add(p.name);
                }
                // DM prefs: name = other user ID (need to map to channel ID later)
                for (const p of dms) {
                    hidden.add(`dm_user:${p.name}`);
                }
                return hidden;
            }),
        );

        // Classify channels into internal/external
        const classified = channels.pipe(
            combineLatestWith(gmMemberMap, of$(currentUserId), teamMemberIds$, favoritedChannelIds, botUserIds, hiddenChannelIds),
            map(([chs, gmMembers, userId, teamMembers, favoritedIds, bots, hidden]) => {
                const internal: ChannelModel[] = [];
                const external: ChannelModel[] = [];

                // Debug: log data availability

                // 检查数据是否完全加载：如果有 GM 频道但 gmMembers 为空，说明数据还在加载
                const hasGmChannels = chs.some(c => c.type === 'G' || c.type === 'P');
                const isDataReady = !hasGmChannels || gmMembers.size > 0 || chs.every(c => {
                    if (c.type !== 'G' && c.type !== 'P') return true;
                    // 对于 GM 频道，检查是否能解析名称或有成员数据
                    const canParseName = Boolean(parseUserIdsFromGroupedChannelName(c.name));
                    const hasMemberData = gmMembers.has(c.id);
                    return canParseName || hasMemberData;
                });

                // 如果数据未就绪，所有 GM 频道暂时归类为 external（避免错误分类）
                if (!isDataReady) {
                    return {internal: [], external: chs};
                }

                for (const channel of chs) {
                    // Filter out hidden (manually closed) DM/GM channels — aligned with webapp
                    if (channel.type === 'D') {
                        const otherUserId = getUserIdFromChannelName(userId, channel.name);
                        if (hidden.has(`dm_user:${otherUserId}`)) {
                            continue;
                        }
                    } else if (channel.type === 'G') {
                        if (hidden.has(channel.id)) {
                            continue;
                        }
                    }

                    const group = classifyChannel(channel, userId, teamMembers, gmMembers, bots);

                    if (group === 'internal') {
                        internal.push(channel);
                    } else {
                        external.push(channel);
                    }
                }

                if (external.length > 0) {
                    const extDetails = external.map(ch => `${ch.id.substring(0, 8)}(${ch.type},${ch.display_name || ch.name?.substring(0, 15)})`).join(', ');
                }

                // Sort internal channels: public first, then favorited, then others
                internal.sort((a, b) => {
                    const aIsPublic = a.type === 'O';
                    const bIsPublic = b.type === 'O';
                    const aIsFavorited = favoritedIds.has(a.id);
                    const bIsFavorited = favoritedIds.has(b.id);

                    // Public channels first
                    if (aIsPublic && !bIsPublic) return -1;
                    if (!aIsPublic && bIsPublic) return 1;

                    // Then favorited channels
                    if (aIsFavorited && !bIsFavorited) return -1;
                    if (!aIsFavorited && bIsFavorited) return 1;

                    return 0;
                });

                // Sort external channels: favorited first, then others
                external.sort((a, b) => {
                    const aIsFavorited = favoritedIds.has(a.id);
                    const bIsFavorited = favoritedIds.has(b.id);

                    if (aIsFavorited && !bIsFavorited) return -1;
                    if (!aIsFavorited && bIsFavorited) return 1;

                    return 0;
                });

                return {internal, external};
            }),
            distinctUntilChanged((a, b) => {
                if (a.internal.length !== b.internal.length || a.external.length !== b.external.length) {
                    return false;
                }
                return a.internal.every((ch, i) => ch.id === b.internal[i]?.id) &&
                       a.external.every((ch, i) => ch.id === b.external[i]?.id);
            }),
        );

        // Get custom category channels (observe CategoryChannel table reactively)
        const customCategoryCatIds = customCategories.map(cat => cat.id);
        const customCategoryChannelRecords = customCategoryCatIds.length > 0
            ? database.get(MM_TABLES.SERVER.CATEGORY_CHANNEL).query(
                Q.where('category_id', Q.oneOf(customCategoryCatIds)),
            ).observe()
            : of$([] as any[]);

        const customCategorySections = customCategoryChannelRecords.pipe(
            combineLatestWith(of$(customCategories), favoritedChannelIds),
            switchMap(([categoryChannels, cats, favoritedIds]) => {
                // Group category channels by category ID
                const channelsByCat = new Map<string, string[]>();
                for (const cc of categoryChannels) {
                    const ids = channelsByCat.get(cc.categoryId) || [];
                    ids.push(cc.channelId);
                    channelsByCat.set(cc.categoryId, ids);
                }

                return from((async () => {
                    const sections: Section[] = [];
                    for (const cat of cats) {
                        const channelIds = channelsByCat.get(cat.id) || [];
                        if (channelIds.length > 0) {
                            const channelModels = await queryChannelsById(database, channelIds).fetch();

                            // Sort custom category channels: favorited first, then others
                            channelModels.sort((a, b) => {
                                const aIsFavorited = favoritedIds.has(a.id);
                                const bIsFavorited = favoritedIds.has(b.id);

                                if (aIsFavorited && !bIsFavorited) return -1;
                                if (!aIsFavorited && bIsFavorited) return 1;

                                return 0;
                            });

                            sections.push({
                                title: cat.displayName,
                                data: channelModels,
                                key: `custom_${cat.id}`,
                                type: 'custom',
                                categoryId: cat.id,
                                teamId: cat.teamId,
                                isCustomCategory: true,
                                actualCount: channelModels.length,
                            });
                        } else {
                            sections.push({
                                title: cat.displayName,
                                data: [],
                                key: `custom_${cat.id}`,
                                type: 'custom',
                                categoryId: cat.id,
                                teamId: cat.teamId,
                                isCustomCategory: true,
                                actualCount: 0,
                            });
                        }
                    }
                    return sections;
                })());
            }),
        );

        // Build final sections
        const sections = classified.pipe(
            combineLatestWith(customCategorySections, currentTeamId$, of$(locale)),
            map(([{internal, external}, customSections, teamId, loc]) => {
                const internalTitle = getLocalizedMessage(loc, 'sidebar.classification.internal', 'Internal');
                const externalTitle = getLocalizedMessage(loc, 'sidebar.classification.external', 'External');

                const result: Section[] = [];

                if (internal.length > 0) {
                    result.push({
                        title: internalTitle,
                        data: internal,
                        key: 'internal',
                        type: 'internal',
                        teamId,
                        isCustomCategory: false,
                        actualCount: internal.length,
                    });
                }

                if (external.length > 0) {
                    result.push({
                        title: externalTitle,
                        data: external,
                        key: 'external',
                        type: 'external',
                        teamId,
                        isCustomCategory: false,
                        actualCount: external.length,
                    });
                }

                result.push(...customSections);

                return result;
            }),
        );

        return {
            sections,
            locale: of$(locale),
            isTablet: of$(isTablet),
            currentUserId: of$(currentUserId),
            onChannelSwitch: of$(onChannelSwitch),
        };
    },
);

const CollapsibleChannelList = withDatabase(enhanced(CollapsibleChannelListRenderer));

export default CollapsibleChannelList;
