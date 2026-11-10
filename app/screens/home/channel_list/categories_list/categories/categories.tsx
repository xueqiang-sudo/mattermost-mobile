// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, StyleSheet, View} from 'react-native';

import {switchToChannelById} from '@actions/remote/channel';
import Loading from '@components/loading';
import {Events} from '@constants';
import {CHANNEL} from '@constants/screens';
import {useServerUrl} from '@context/server';
import {useIsTablet} from '@hooks/device';
import {useTeamSwitch} from '@hooks/team_switch';
import NetworkManager from '@managers/network_manager';
import PerformanceMetricsManager from '@managers/performance_metrics_manager';
import {fetchMyChannelsForTeam} from '@actions/remote/channel';
import {fetchCategories} from '@actions/remote/category';
import {addChannelToDefaultCategory} from '@actions/local/category';
import {getChannelById} from '@queries/servers/channel';
import DatabaseManager from '@database/manager';
import {debugLog} from '@store/debug_log';

import CollapsibleChannelList from './collapsible_channel_list';
import LoadCategoriesError from './error';
import UnreadCategories from './unreads';

import type CategoryModel from '@typings/database/models/servers/category';
import type ChannelModel from '@typings/database/models/servers/channel';

type Props = {
    categories: CategoryModel[];
    currentTeamId: string;
    currentUserId: string;
    onlyUnreads: boolean;
    unreadsOnTop: boolean;
}

const styles = StyleSheet.create({
    mainList: {
        flex: 1,
        backgroundColor: '#F5F5F5',
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
    onlyUnreads,
    unreadsOnTop,
}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const isTablet = useIsTablet();
    const switchingTeam = useTeamSwitch();
    const teamId = categories[0]?.teamId;
    const showOnlyUnreadsCategory = onlyUnreads && !unreadsOnTop;

    // Split into built-in categories (all non-custom) and custom categories
    const {builtInCategories, customCategories} = useMemo(() => {
        const builtIn: CategoryModel[] = [];
        const custom: CategoryModel[] = [];

        for (const cat of categories) {
            if (cat.type === 'custom') {
                custom.push(cat);
            } else {
                builtIn.push(cat);
            }
        }
        custom.sort((a, b) => a.sortOrder - b.sortOrder);

        return {builtInCategories: builtIn, customCategories: custom};
    }, [categories]);

    const [initiaLoad, setInitialLoad] = useState(!categories.length);

    const onChannelSwitch = useCallback(async (c: Channel | ChannelModel) => {
        DeviceEventEmitter.emit(Events.ACTIVE_SCREEN, CHANNEL);
        PerformanceMetricsManager.startMetric('mobile_channel_switch');
        switchToChannelById(serverUrl, c.id);
    }, [serverUrl]);

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

    // 对齐 webapp：团队切换时自动绑定智能笔记本频道
    const ensuredTeamsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        debugLog('[SmartNotebook] useEffect triggered', {
            currentTeamId,
            currentUserId,
            switchingTeam,
            hasEnsured: ensuredTeamsRef.current.has(currentTeamId || ''),
        });

        if (!currentTeamId || !currentUserId || switchingTeam) {
            debugLog('[SmartNotebook] Skipped: missing params or switching', {
                currentTeamId,
                currentUserId,
                switchingTeam,
            });
            return;
        }

        if (ensuredTeamsRef.current.has(currentTeamId)) {
            debugLog('[SmartNotebook] Skipped: already ensured for team', {currentTeamId});
            return;
        }
        ensuredTeamsRef.current.add(currentTeamId);

        const ensureSmartNotebookTeam = async () => {
            debugLog('[SmartNotebook] Calling ensure_smart_notebook_team API', {currentTeamId});
            try {
                const client = NetworkManager.getClient(serverUrl);
                const result = await client.doFetch('/api/v4/channels/ensure_smart_notebook_team', {
                    method: 'post',
                    body: {team_id: currentTeamId},
                });
                debugLog('[SmartNotebook] API result', {result, channelId: result?.channel_id});

                // Always fetch channels and categories after ensure, regardless of result
                debugLog('[SmartNotebook] Fetching channels and categories for team', {currentTeamId});
                await Promise.all([
                    fetchMyChannelsForTeam(serverUrl, currentTeamId),
                    fetchCategories(serverUrl, currentTeamId),
                ]);
                debugLog('[SmartNotebook] Channels and categories fetched successfully');

                // If we got a channel_id, ensure it's in the default category
                if (result?.channel_id) {
                    debugLog('[SmartNotebook] Adding channel to default category', {channelId: result.channel_id});
                    const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                    const channel = await getChannelById(database, result.channel_id);
                    if (channel) {
                        debugLog('[SmartNotebook] Channel found in database, adding to category', {channelTeamId: channel.teamId});
                        await addChannelToDefaultCategory(serverUrl, channel, false);
                        debugLog('[SmartNotebook] Channel added to default category successfully');
                    } else {
                        debugLog('[SmartNotebook] Channel not found in database after fetch');
                    }
                }
            } catch (error) {
                debugLog('[SmartNotebook] API error', {error: String(error)});
            }
        };

        ensureSmartNotebookTeam();
    }, [currentTeamId, currentUserId, switchingTeam, serverUrl]);

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
                <CollapsibleChannelList
                    key={teamId || 'no-team'}
                    builtInCategories={builtInCategories}
                    customCategories={customCategories}
                    currentUserId={currentUserId}
                    currentTeamId={currentTeamId}
                    locale={intl.locale}
                    isTablet={isTablet}
                    onChannelSwitch={onChannelSwitch}
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
