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
                const result: any = await client.doFetch('/api/v4/channels/ensure_smart_notebook_team', {
                    method: 'post',
                    body: {team_id: currentTeamId},
                });
                debugLog('[SmartNotebook] API result', {result, channelId: result?.channel_id});

                // 1. 先同步服务端的频道和分类数据（必须在本地 upsert 之前）
                // 因为后续的 addChannelToDefaultCategory 是纯本地操作，
                // 如果之后再 fetchCategories，prune 逻辑会删掉我们刚加的 category_channel
                debugLog('[SmartNotebook] Fetching channels and categories for team', {
                    currentTeamId,
                    channelId: result?.channel_id,
                });
                await Promise.all([
                    fetchMyChannelsForTeam(serverUrl, currentTeamId),
                    fetchCategories(serverUrl, currentTeamId),
                ]);
                debugLog('[SmartNotebook] Channels and categories fetched successfully');

                // 调试：查看服务端返回的分类数据
                const {database: db} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const allCategories = await db.get('Category').query().fetch();
                const teamCategories = allCategories.filter((c: any) => c.teamId === currentTeamId);
                debugLog('[SmartNotebook] Server returned categories for current team', {
                    currentTeamId,
                    count: teamCategories.length,
                    categories: teamCategories.map((c: any) => ({
                        id: c.id,
                        type: c.type,
                        displayName: c.displayName,
                    })),
                });

                // 2. 智能笔记本频道是用户级别的，同一个 channel_id 跨多个团队共享。
                // 后端 ensure_smart_notebook_team 已经把它绑到用户所属的所有 team（channelteams 表），
                // 但 mobile 的 fetchMyChannelsForTeam 走标准 API（GET /users/me/teams/{teamId}/channels）
                // 只返回 channel.team_id == teamId 的频道，不包含 channelteams 关联的跨团队频道。
                // 所以必须显式 upsert 本地 Channel 和 ChannelTeam 记录。
                if (result?.channel_id && result?.channel) {
                    try {
                        const {operator, database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

                        debugLog('[SmartNotebook] Starting local upsert', {
                            channelId: result.channel_id,
                            currentTeamId,
                            channelName: result.channel.name,
                            channelDisplayName: result.channel.display_name,
                        });

                        // 2.1 Upsert 本地 Channel 记录：把 team_id 写成当前 team，让标准 scope SQL 命中
                        const channelForCurrentTeam = {...result.channel, team_id: currentTeamId};
                        const channelModels = await operator.handleChannel({
                            channels: [channelForCurrentTeam],
                            prepareRecordsOnly: true,
                        }) || [];

                        debugLog('[SmartNotebook] Channel models prepared', {
                            count: channelModels.length,
                            channelId: result.channel_id,
                        });

                        // 2.2 Upsert 本地 ChannelTeam 关联（后端返回所有已绑定的 team_ids）
                        const teamIds: string[] = Array.isArray(result.team_ids) ? result.team_ids : [];
                        const ctPayload = teamIds.map((tid: string) => ({
                            id: `${result.channel_id}-${tid}`,
                            channel_id: result.channel_id,
                            team_id: tid,
                        }));

                        debugLog('[SmartNotebook] ChannelTeam payload prepared', {
                            count: ctPayload.length,
                            teamIds,
                        });

                        const ctModels = ctPayload.length
                            ? (await operator.handleChannelTeam({
                                channelTeams: ctPayload,
                                prepareRecordsOnly: true,
                            }) || [])
                            : [];

                        debugLog('[SmartNotebook] ChannelTeam models prepared', {
                            count: ctModels.length,
                        });

                        if (channelModels.length || ctModels.length) {
                            await operator.batchRecords(
                                [...channelModels, ...ctModels],
                                'ensureSmartNotebookTeamUpsert',
                            );
                            debugLog('[SmartNotebook] Upserted local Channel + ChannelTeam', {
                                channelId: result.channel_id,
                                currentTeamId,
                                channelModelsCount: channelModels.length,
                                ctModelsCount: ctModels.length,
                                boundTeams: teamIds.length,
                            });
                        } else {
                            debugLog('[SmartNotebook] No records to upsert (already up to date)', {
                                channelId: result.channel_id,
                                currentTeamId,
                            });
                        }

                        // 2.3 加到当前团队的默认分类（内部群）
                        // 注意：这必须在 fetchCategories 之后，否则 prune 逻辑会删掉刚加的 category_channel
                        const localChannel = await getChannelById(database, result.channel_id);
                        debugLog('[SmartNotebook] Local channel lookup', {
                            channelId: result.channel_id,
                            found: Boolean(localChannel),
                            channelTeamId: localChannel?.teamId,
                        });

                        if (localChannel) {
                            await addChannelToDefaultCategory(serverUrl, localChannel, false, currentTeamId);
                            debugLog('[SmartNotebook] Channel added to default category successfully', {
                                currentTeamId,
                                channelTeamId: localChannel.teamId,
                            });
                        } else {
                            debugLog('[SmartNotebook] WARNING: Local channel not found after upsert', {
                                channelId: result.channel_id,
                            });
                        }
                    } catch (error) {
                        debugLog('[SmartNotebook] Failed to upsert smart notebook locally', {error: String(error)});
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
