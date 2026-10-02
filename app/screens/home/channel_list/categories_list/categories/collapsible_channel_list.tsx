// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, SectionList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Q} from '@nozbe/watermelondb';
import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {switchMap, combineLatestWith, distinctUntilChanged, map} from 'rxjs/operators';

import {deleteCategory} from '../../../apps/workbench_api';
import {fetchDirectChannelsInfo} from '@actions/remote/channel';
import ChannelItem from '@components/channel_item';
import CompassIcon from '@components/compass_icon';
import {FAVORITES_CATEGORY} from '@constants/categories';
import {MM_TABLES} from '@constants/database';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {queryChannelsById} from '@queries/servers/channel';
import {queryCategoriesByTeamIds} from '@queries/servers/categories';
import {queryPreferencesByCategoryAndName} from '@queries/servers/preference';
import {getLocalizedMessage} from '@i18n';
import {buildGmMemberMap, classifyChannel} from '@utils/channel_classification';
import {isDMorGM} from '@utils/channel';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {showSnackBar} from '@utils/snack_bar';
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
    teamMemberIds: ReadonlySet<string>;
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
        ...typography('Heading', 300, 'SemiBold'),
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
    onChannelSwitch,
}: RenderProps) => {
    const theme = useTheme();
    const styles = getStyles(theme);
    const serverUrl = useServerUrl();
    const intl = useIntl();
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['internal', 'external']));

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

    const handleDeleteCategory = useCallback(async (categoryId: string, categoryName: string, teamId: string) => {
        Alert.alert(
            '删除分类',
            `确定要删除"${categoryName}"分类吗？`,
            [
                {text: '取消', style: 'cancel'},
                {
                    text: '删除',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteCategory(serverUrl, teamId, categoryId);
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
        const canDelete = section.isCustomCategory && section.data.length === 0;

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
                            onPress={() => canDelete && handleDeleteCategory(section.categoryId!, section.title, section.teamId!)}
                            disabled={!canDelete}
                            style={[styles.trashIcon, !canDelete && styles.trashIconDisabled]}
                        >
                            <CompassIcon
                                name='delete-outline'
                                size={18}
                                color={canDelete ? theme.errorTextColor : changeOpacity(theme.centerChannelColor, 0.3)}
                            />
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
        );
    }, [expandedSections, theme, toggleSection, handleDeleteCategory]);

    const renderItem = useCallback(({item}: {item: ChannelModel}) => {
        return (
            <ChannelItem
                channel={item}
                onPress={onChannelSwitch}
                key={item.id}
                testID='channel_list.channel_item'
                shouldHighlightActive={true}
                shouldHighlightState={true}
                isOnHome={true}
            />
        );
    }, [onChannelSwitch]);

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
    ['builtInCategories', 'customCategories', 'teamMemberIds', 'currentUserId', 'currentTeamId'],
    ({builtInCategories, customCategories, teamMemberIds, currentUserId, currentTeamId, database, locale, isTablet, onChannelSwitch}: EnhanceProps) => {
        // Use the passed currentTeamId directly (ensures proper reset on team switch)
        const currentTeamId$ = of$(currentTeamId);

        // Get channel IDs from custom categories
        const customCategoryChannelIds = of$(customCategories).pipe(
            switchMap((cats) => {
                return from((async () => {
                    const customIds = new Set<string>();
                    for (const cat of cats) {
                        const cc = await cat.categoryChannels.fetch();
                        for (const c of cc) {
                            customIds.add(c.channelId);
                        }
                    }
                    return customIds;
                })());
            }),
        );

        // Get favorited channel IDs
        const favoritedChannelIds = of$(builtInCategories).pipe(
            switchMap((cats) => {
                return from((async () => {
                    const favoritesCategory = cats.find(cat => cat.type === FAVORITES_CATEGORY);
                    if (!favoritesCategory) {
                        return new Set<string>();
                    }
                    const favoriteChannels = await favoritesCategory.categoryChannels.fetch();
                    return new Set(favoriteChannels.map(cc => cc.channelId));
                })());
            }),
        );

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

        // Filter: channels in current team (by team_id) OR DM/GM (cross-team), not in custom categories.
        // DM/GM channels have teamId='' (empty) but should still appear in the sidebar.
        const builtInChannelIds = allUserChannels.pipe(
            combineLatestWith(customCategoryChannelIds, currentTeamId$),
            map(([channels, customIds, teamId]) => {
                const filtered = channels.filter(ch => {
                    // DM/GM channels are cross-team — always include them
                    const isDmOrGm = ch.type === 'D' || ch.type === 'G';
                    const isInTeam = ch.teamId === teamId || isDmOrGm;
                    const notInCustom = !customIds.has(ch.id);
                    return isInTeam && notInCustom;
                });
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

        // Classify channels into internal/external
        const classified = channels.pipe(
            combineLatestWith(gmMemberMap, of$(currentUserId), of$(teamMemberIds), favoritedChannelIds, botUserIds),
            map(([chs, gmMembers, userId, teamMembers, favoritedIds, bots]) => {
                const internal: ChannelModel[] = [];
                const external: ChannelModel[] = [];

                for (const channel of chs) {
                    const group = classifyChannel(channel, userId, teamMembers, gmMembers, bots);

                    if (group === 'internal') {
                        internal.push(channel);
                    } else {
                        external.push(channel);
                    }
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

        // Get custom category channels
        const customCategorySections = of$(customCategories).pipe(
            combineLatestWith(favoritedChannelIds),
            switchMap(([cats, favoritedIds]) => {
                return from((async () => {
                    const sections: Section[] = [];
                    for (const cat of cats) {
                        const categoryChannels = await cat.categoryChannels.fetch();
                        const channelIds = categoryChannels.map(cc => cc.channelId);
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
            onChannelSwitch: of$(onChannelSwitch),
        };
    },
);

const CollapsibleChannelList = withDatabase(enhanced(CollapsibleChannelListRenderer));

export default CollapsibleChannelList;
