// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, FlatList, StyleSheet, View} from 'react-native';

import {switchToChannelById} from '@actions/remote/channel';
import Loading from '@components/loading';
import {Events} from '@constants';
import {CHANNELS_CATEGORY, DMS_CATEGORY, FAVORITES_CATEGORY} from '@constants/categories';
import {CHANNEL} from '@constants/screens';
import {useServerUrl} from '@context/server';
import {useIsTablet} from '@hooks/device';
import {useTeamSwitch} from '@hooks/team_switch';
import PerformanceMetricsManager from '@managers/performance_metrics_manager';

import BuiltinChannelGroups from './builtin_channel_groups';
import CategoryBody from './body';
import LoadCategoriesError from './error';
import CategoryHeader from './header';
import UnreadCategories from './unreads';

import type CategoryModel from '@typings/database/models/servers/category';
import type ChannelModel from '@typings/database/models/servers/channel';

const BUILT_IN_TYPES = new Set([CHANNELS_CATEGORY, DMS_CATEGORY, FAVORITES_CATEGORY]);

type Props = {
    categories: CategoryModel[];
    currentTeamId: string;
    currentUserId: string;
    teamMemberIds: ReadonlySet<string>;
    onlyUnreads: boolean;
    unreadsOnTop: boolean;
}

const styles = StyleSheet.create({
    mainList: {
        flex: 1,
    },
    loadingView: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
});

const Categories = ({
    categories,
    currentTeamId,
    currentUserId,
    teamMemberIds,
    onlyUnreads,
    unreadsOnTop,
}: Props) => {
    const intl = useIntl();
    const listRef = useRef<FlatList>(null);
    const serverUrl = useServerUrl();
    const isTablet = useIsTablet();
    const switchingTeam = useTeamSwitch();
    const teamId = categories[0]?.teamId;
    const showOnlyUnreadsCategory = onlyUnreads && !unreadsOnTop;

    // Split into built-in categories (all non-custom) and custom categories
    // This matches the webapp logic: classify channels from ALL non-custom categories
    const {builtInCategories, customCategories, customCategoryChannelIds} = useMemo(() => {
        const builtIn: CategoryModel[] = [];
        const custom: CategoryModel[] = [];
        const customChannelIds = new Set<string>();

        for (const cat of categories) {
            if (cat.type === 'custom') {
                custom.push(cat);
                // Collect channel IDs from custom categories
                cat.categoryChannels.fetch().then(cc => {
                    for (const c of cc) {
                        customChannelIds.add(c.channelId);
                    }
                });
            } else {
                // All non-custom categories (channels, DMs, favorites, etc.) go to built-in
                builtIn.push(cat);
            }
        }
        // Sort custom categories by sortOrder
        custom.sort((a, b) => a.sortOrder - b.sortOrder);

        // Debug logging
        console.log('[Categories] Total:', categories.length, 'Built-in:', builtIn.length, 'Custom:', custom.length);
        console.log('[Categories] Built-in types:', builtIn.map(c => c.type));
        console.log('[Categories] Custom names:', custom.map(c => c.displayName));
        console.log('[Categories] teamMemberIds size:', teamMemberIds.size);

        return {builtInCategories: builtIn, customCategories: custom, customCategoryChannelIds: customChannelIds};
    }, [categories, teamMemberIds]);

    // For the FlatList, combine: builtin groups item + custom categories
    type ListItem = {type: 'builtin'} | {type: 'custom'; category: CategoryModel} | 'UNREADS';

    const listItems = useMemo<ListItem[]>(() => {
        if (showOnlyUnreadsCategory) {
            return ['UNREADS' as const];
        }

        const items: ListItem[] = [];

        if (unreadsOnTop) {
            items.push('UNREADS');
        }

        // Built-in groups (internal/external) as a single item
        if (builtInCategories.length > 0) {
            items.push({type: 'builtin'});
        }

        // Custom categories
        for (const cat of customCategories) {
            items.push({type: 'custom', category: cat});
        }

        return items;
    }, [builtInCategories, customCategories, unreadsOnTop, showOnlyUnreadsCategory]);

    const [initiaLoad, setInitialLoad] = useState(!listItems.length);

    const onChannelSwitch = useCallback(async (c: Channel | ChannelModel) => {
        DeviceEventEmitter.emit(Events.ACTIVE_SCREEN, CHANNEL);
        PerformanceMetricsManager.startMetric('mobile_channel_switch');

        // console.error('qgstest onChannelSwitch', c.id, c);
        // switchToChannelById(serverUrl, 'jxt7qqgf9pd7uy3zjpr4kmi1tr');
        switchToChannelById(serverUrl, c.id);
    }, [serverUrl]);

    const extractKey = useCallback((item: ListItem) => {
        if (item === 'UNREADS') return 'UNREADS';
        if (item.type === 'builtin') return 'builtin_groups';
        return item.category.id;
    }, []);

    const renderCategory = useCallback((data: {item: ListItem}) => {
        const {item} = data;
        if (item === 'UNREADS') {
            return (
                <UnreadCategories
                    currentTeamId={teamId}
                    isTablet={isTablet}
                    onChannelSwitch={onChannelSwitch}
                    onlyUnreads={showOnlyUnreadsCategory}
                />
            );
        }
        if (item.type === 'builtin') {
            return (
                <BuiltinChannelGroups
                    builtInCategories={builtInCategories}
                    customCategoryChannelIds={customCategoryChannelIds}
                    teamMemberIds={teamMemberIds}
                    currentUserId={currentUserId}
                    locale={intl.locale}
                    isTablet={isTablet}
                    onChannelSwitch={onChannelSwitch}
                />
            );
        }
        // Custom category
        return (
            <>
                <CategoryHeader category={item.category}/>
                <CategoryBody
                    category={item.category}
                    isTablet={isTablet}
                    locale={intl.locale}
                    onChannelSwitch={onChannelSwitch}
                />
            </>
        );
    }, [teamId, intl.locale, isTablet, onChannelSwitch, showOnlyUnreadsCategory, builtInCategories, customCategoryChannelIds, teamMemberIds, currentUserId]);

    useEffect(() => {
        const t = setTimeout(() => {
            setInitialLoad(false);
        }, 0);

        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (switchingTeam) {
            return;
        }

        PerformanceMetricsManager.endMetric('mobile_team_switch', serverUrl);
    }, [switchingTeam]);

    if (!categories.length) {
        return <LoadCategoriesError/>;
    }

    return (
        <>
            {!switchingTeam && !initiaLoad && showOnlyUnreadsCategory &&
            <View key={teamId || 'no-team'} style={styles.mainList}>
                <UnreadCategories
                    currentTeamId={teamId}
                    isTablet={isTablet}
                    onChannelSwitch={onChannelSwitch}
                    onlyUnreads={showOnlyUnreadsCategory}
                />
            </View>
            }
            {!switchingTeam && !initiaLoad && !showOnlyUnreadsCategory && (
                <FlatList
                    key={teamId || 'no-team'}
                    data={listItems}
                    ref={listRef}
                    renderItem={renderCategory}
                    style={styles.mainList}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    keyExtractor={extractKey}
                    initialNumToRender={listItems.length}
                    extraData={teamId}

                    // @ts-expect-error strictMode not included in the types
                    strictMode={true}
                />
            )}
            {(switchingTeam || initiaLoad) && (
                <View style={styles.loadingView}>
                    <Loading
                        size='large'
                        themeColor='sidebarText'
                        testID='categories.loading'
                    />
                </View>
            )}
        </>
    );
};

export default Categories;
