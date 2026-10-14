// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {nativeApplicationVersion} from 'expo-application';
import {RESULTS, checkNotifications} from 'react-native-permissions';

import {fetchChannelById, fetchMyChannelsForTeam, handleKickFromChannel, type MyChannelsRequest} from '@actions/remote/channel';
import {type MyPreferencesRequest, fetchMyPreferences} from '@actions/remote/preference';
import {fetchConfigAndLicense, fetchDataRetentionPolicy} from '@actions/remote/systems';
import {fetchMyTeams, fetchTeamMembersForClassification, handleKickFromTeam, type MyTeamsRequest} from '@actions/remote/team';
import {fetchMe, type MyUserRequest} from '@actions/remote/user';
import {setTeamSyncInfo} from '@queries/servers/system';
import {debugLog} from '@store/debug_log';
import {General, Preferences, Screens} from '@constants';
import {SYSTEM_IDENTIFIERS} from '@constants/database';
import {PUSH_PROXY_STATUS_VERIFIED} from '@constants/push_proxy';
import DatabaseManager from '@database/manager';
import EphemeralStore from '@store/ephemeral_store';
import {getPreferenceValue} from '@helpers/api/preference';
import {selectDefaultTeam} from '@helpers/api/team';
import {DEFAULT_LOCALE} from '@i18n';
import NetworkManager from '@managers/network_manager';
import {getDeviceToken} from '@queries/app/global';
import {getChannelById} from '@queries/servers/channel';
import {prepareEntryModels, truncateCrtRelatedTables} from '@queries/servers/entry';
import {getHasCRTChanged} from '@queries/servers/preference';
import {getCurrentChannelId, getCurrentTeamId, getIsDataRetentionEnabled, getLastFullSync, setCurrentTeamAndChannelId, getConfigValue} from '@queries/servers/system';
import {getTeamChannelHistory} from '@queries/servers/team';
import NavigationStore from '@store/navigation_store';
import {isDefaultChannel, isDMorGM, sortChannelsByDisplayName} from '@utils/channel';
import {getFullErrorMessage} from '@utils/errors';
import {isMinimumServerVersion, isTablet} from '@utils/helpers';
import {logDebug, logError} from '@utils/log';
import {processIsCRTEnabled} from '@utils/thread';

import type {Database, Model} from '@nozbe/watermelondb';
import type {Team} from '@typings/api/teams';

export type AppEntryData = {
    initialTeamId: string;
    teamData: MyTeamsRequest;
    chData?: MyChannelsRequest;
    prefData: MyPreferencesRequest;
    meData: MyUserRequest;
    removeTeamIds?: string[];
    removeChannelIds?: string[];
    isCRTEnabled: boolean;
    initialChannelId?: string;
    gmConverted: boolean;
}

export type AppEntryError = {
    error: unknown;
}

export type EntryResponse = {
    models: Model[];
    initialTeamId: string;
    initialChannelId: string;
    prefData: MyPreferencesRequest;
    teamData: MyTeamsRequest;
    chData?: MyChannelsRequest;
    meData?: MyUserRequest;
    gmConverted: boolean;
} | {
    error: unknown;
}

export const entry = async (serverUrl: string, teamId?: string, channelId?: string, since = 0, groupLabel?: RequestGroupLabel): Promise<EntryResponse> => {
    const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
    const result = await entryRest(serverUrl, teamId, channelId, since, groupLabel);

    // Fetch data retention policies
    if (!result.error) {
        const isDataRetentionEnabled = await getIsDataRetentionEnabled(database);
        if (isDataRetentionEnabled) {
            fetchDataRetentionPolicy(serverUrl, false, groupLabel);
        }
    }

    return result;
};

const entryRest = async (serverUrl: string, teamId?: string, channelId?: string, since = 0, groupLabel?: RequestGroupLabel) => {
    try {
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        let lastDisconnectedAt = since || await getLastFullSync(database);

        const [confResp, prefData] = await Promise.all([
            fetchConfigAndLicense(serverUrl, false, groupLabel),
            fetchMyPreferences(serverUrl, true, groupLabel),
        ]);

        const isCRTEnabled = Boolean(prefData.preferences && processIsCRTEnabled(prefData.preferences, confResp.config?.CollapsedThreads, confResp.config?.FeatureFlagCollapsedThreads, confResp.config?.Version));
        if (prefData.preferences) {
            const crtToggled = await getHasCRTChanged(database, prefData.preferences);
            if (crtToggled) {
                const currentServerUrl = await DatabaseManager.getActiveServerUrl();
                const isSameServer = currentServerUrl === serverUrl;
                if (isSameServer) {
                    lastDisconnectedAt = 0;
                }
                const {error} = await truncateCrtRelatedTables(serverUrl);

                if (error) {
                    throw new Error(`Resetting CRT on ${serverUrl} failed`);
                }
            }
        }

        // let's start fetching in parallel all we can
        debugLog('entry', `fetching teams and user data...`);
        const promises: [Promise<MyTeamsRequest>, Promise<MyUserRequest>] = [
            fetchMyTeams(serverUrl, true, groupLabel),
            fetchMe(serverUrl, true, groupLabel),
        ];

        const [teamData, meData] = await Promise.all(promises);

        debugLog('entry', `fetchMyTeams result: teams=${teamData.teams?.length || 0}, memberships=${teamData.memberships?.length || 0}, error=${teamData.error ? 'YES' : 'NO'}`);
        debugLog('entry', `fetchMe result: user=${meData.user?.id || 'NONE'}, error=${meData.error ? 'YES' : 'NO'}`);

        // Only fail on critical errors (teams/me). Non-critical failures
        // (config/preferences) are logged but tolerated — aligned with webapp
        // loadMe() which silently ignores partial failures.
        const criticalError = teamData.error || meData.error;
        if (criticalError) {
            debugLog('entry', `CRITICAL ERROR: ${criticalError instanceof Error ? criticalError.message : String(criticalError)}`);
            logError('entry: critical error during team/me fetch', teamData.error || meData.error);
            return {error: criticalError};
        }

        // Log non-critical errors but continue
        if (confResp.error) {
            logDebug('entry: fetchConfigAndLicense failed (non-critical, continuing)', confResp.error);
        }
        if (prefData.error) {
            logDebug('entry: fetchMyPreferences failed (non-critical, continuing)', prefData.error);
        }

        let initialTeamId = teamId || '';
        let initialChannelId = channelId || '';
        let gmConverted = false;

        if (channelId) {
            const existingChannel = await getChannelById(database, channelId);
            if (existingChannel && existingChannel.type === General.GM_CHANNEL) {
                // Okay, so now we know the channel exists in mobile app's database as a GM.
                // We now need to also check if channel on server is actually type P (group chat),
                // and if so, which team does it belong to now. That team will become the
                // active team on mobile app after this point.

                const fetchResult = await fetchChannelById(serverUrl, channelId);

                // Although you can convert GM only to type P, a group chat can further be converted to a public channel.
                // So between the mobile app being on the GM and reconnecting,
                // it may have become either a public channel or type P. So we need to check for both.
                if (fetchResult.channel?.type === General.PRIVATE_CHANNEL || fetchResult.channel?.type === General.OPEN_CHANNEL) {
                    initialTeamId = fetchResult.channel.team_id;
                    initialChannelId = channelId;
                    gmConverted = true;
                }
            }
        }

        if (!teamData.error && teamData.teams?.length === 0) {
            debugLog('entry', `WARNING: teams array is EMPTY (no error but no teams returned), creating default team`);

            // 新用户没有团队时，自动创建默认团队（类似 webapp 第一个管理员的流程）
            try {
                const client = NetworkManager.getClient(serverUrl);
                const currentUser = meData.user;
                const nickname = currentUser?.nickname || currentUser?.username || '';

                // 根据语言生成团队名称（支持多语言）
                const locale = currentUser?.locale || EphemeralStore.currentLocale || 'en';
                let teamDisplayName: string;
                let teamName: string;

                if (locale.startsWith('zh')) {
                    // 中文："{昵称}的空间" 或 "我的空间"
                    teamDisplayName = nickname ? `${nickname}的空间` : '我的空间';
                    teamName = nickname ? `${nickname}-space` : 'my-space';
                } else {
                    // 英文及其他语言："{Nickname}'s Space" 或 "My Space"
                    teamDisplayName = nickname ? `${nickname}'s Space` : 'My Space';
                    teamName = nickname ? `${nickname.toLowerCase()}-space` : 'my-space';
                }

                // 清理 URL 名称中的非法字符
                teamName = teamName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'my-space';

                const defaultTeam: Team = {
                    id: '',
                    create_at: 0,
                    update_at: 0,
                    delete_at: 0,
                    display_name: teamDisplayName,
                    name: teamName,
                    description: '',
                    email: '',
                    type: 'O',
                    company_name: '',
                    allowed_domains: '',
                    invite_id: '',
                    allow_open_invite: false,
                    scheme_id: '',
                    group_constrained: false,
                    last_team_icon_update: 0,
                };

                debugLog('entry', `Creating default team: name="${teamDisplayName}", url="${teamName}"`);
                const createdTeam = await client.createTeam(defaultTeam);
                debugLog('entry', `Default team created successfully: id=${createdTeam.id}, name=${createdTeam.display_name}`);

                // 重新获取团队和成员信息
                const [newTeams, newMemberships] = await Promise.all([
                    client.getMyTeams(groupLabel),
                    client.getMyTeamMembers(groupLabel),
                ]);

                debugLog('entry', `After team creation: teams=${newTeams.length}, memberships=${newMemberships.length}`);

                // 更新 teamData
                teamData.teams = newTeams;
                teamData.memberships = newMemberships;
            } catch (createError) {
                debugLog('entry', `Failed to create default team: ${createError instanceof Error ? createError.message : String(createError)}`);
                // 创建失败不阻塞，继续正常流程
            }

            initialTeamId = '';
        }

        const inTeam = teamData.teams?.find((t) => t.id === initialTeamId);
        if (initialTeamId && !inTeam && !teamData.error) {
            debugLog('entry', `WARNING: initialTeamId=${initialTeamId} not found in teams list, resetting`);
            initialTeamId = '';
        }

        if (!initialTeamId && teamData.teams?.length && teamData.memberships?.length) {
            debugLog('entry', `no initialTeamId, selecting default team from ${teamData.teams.length} teams`);
            // If no initial team was set in the database but got teams in the response
            const teamOrderPreference = getPreferenceValue<string>(prefData.preferences || [], Preferences.CATEGORIES.TEAMS_ORDER, '', '');
            const teamMembers = new Set(teamData.memberships.filter((m) => m.delete_at === 0).map((m) => m.team_id));
            const myTeams = teamData.teams.filter((t) => teamMembers.has(t.id));
            const defaultTeam = selectDefaultTeam(myTeams, meData.user?.locale || DEFAULT_LOCALE, teamOrderPreference, confResp.config?.ExperimentalPrimaryTeam);
            if (defaultTeam?.id) {
                initialTeamId = defaultTeam.id;
                debugLog('entry', `selected default team: ${defaultTeam.display_name || defaultTeam.name} (${defaultTeam.id})`);
            } else {
                debugLog('entry', `WARNING: selectDefaultTeam returned no team! myTeams=${myTeams.length}`);
            }
        }

        let chData: MyChannelsRequest = {
            channels: [],
            memberships: [],
            categories: [],
        };
        if (initialTeamId) {
            chData = await fetchMyChannelsForTeam(serverUrl, initialTeamId, false, lastDisconnectedAt, true, false, isCRTEnabled, groupLabel);

            // Debug: log channel fetch results
            const allChannels = chData?.channels || [];
            const dmGm = allChannels.filter(c => c.type === 'D' || c.type === 'G');
            const teamChannels = allChannels.filter(c => c.team_id === initialTeamId);
            const crossTeamDmGm = allChannels.filter(c => (c.type === 'D' || c.type === 'G') && c.team_id === '');
            debugLog('entryCommon', `fetchMyChannelsForTeam returned ${allChannels.length} channels total`);
            debugLog('entryCommon', `  teamChannels: ${teamChannels.length}, DM/GM: ${dmGm.length}, crossTeamDM/GM: ${crossTeamDmGm.length}`);
            debugLog('entryCommon', `  memberships: ${chData?.memberships?.length || 0}, categories: ${chData?.categories?.length || 0}`);
            if (dmGm.length > 0) {
                const dmGmInfo = dmGm.map(c => `${c.id.substring(0, 8)}(type=${c.type},team='${c.team_id}',name='${c.display_name || c.name?.substring(0, 20)}')`).join(', ');
                debugLog('entryCommon', `  DM/GM details: ${dmGmInfo}`);
            }
        }

        initialChannelId = await entryInitialChannelId(database, initialChannelId, teamId, initialTeamId, meData?.user?.locale || '', chData?.channels, chData?.memberships);

        const initialTeamData = initialTeamId ? {
            teams: teamData.teams?.filter((t) => t.id === initialTeamId),
            memberships: teamData.memberships?.filter((m) => m.team_id === initialTeamId),
        } : teamData;

        const dt = Date.now();


        const modelPromises = await prepareEntryModels({operator, teamData: initialTeamData, chData, prefData, meData, isCRTEnabled});
        const models = (await Promise.all(modelPromises)).flat();
        logDebug('Process models on entry', groupLabel, models.length, `${Date.now() - dt}ms`);

        // Mark initial team as fully synced if this is a fresh sync (since=0)
        if (initialTeamId && !since) {
            await setTeamSyncInfo(operator, {
                teamId: initialTeamId,
                lastFullSync: Date.now(),
                fullySynced: true,
            });
        }

        // Fire-and-forget: fetch all team members for channel classification
        // (internal vs external). Without this, TEAM_MEMBERSHIP only has the
        // current user's record(s) and classification always returns 'external'.
        if (initialTeamId) {
            fetchTeamMembersForClassification(serverUrl, initialTeamId);
        }

        return {models, initialChannelId, initialTeamId, prefData, teamData, chData, meData, gmConverted};
    } catch (error) {
        logError('entryRest', groupLabel, error);
        return {error};
    }
};

export async function entryInitialChannelId(database: Database, requestedChannelId = '', requestedTeamId = '', initialTeamId: string, locale: string, channels?: Channel[], memberships?: ChannelMember[]) {
    const membershipIds = new Set(memberships?.map((m) => m.channel_id));
    const requestedChannel = channels?.find((c) => (c.id === requestedChannelId) && membershipIds.has(c.id));

    // If team and channel are the requested, return the channel
    if (initialTeamId === requestedTeamId && requestedChannel) {
        return requestedChannelId;
    }

    // DM or GMs don't care about changes in teams, so return directly
    if (requestedChannel && isDMorGM(requestedChannel)) {
        return requestedChannelId;
    }

    // Check if we are still members of any channel on the history
    const teamChannelHistory = await getTeamChannelHistory(database, initialTeamId);
    for (const c of teamChannelHistory) {
        if (membershipIds.has(c) || c === Screens.GLOBAL_DRAFTS) {
            return c;
        }
    }

    // Check if we are member of the default channel.
    const defaultChannel = channels?.find((c) => isDefaultChannel(c) && c.team_id === initialTeamId);
    const iAmMemberOfTheTeamDefaultChannel = Boolean(defaultChannel && membershipIds.has(defaultChannel.id));
    if (iAmMemberOfTheTeamDefaultChannel) {
        return defaultChannel!.id;
    }

    // Get the first channel of the list, based on the locale.
    const myFirstTeamChannel = channels?.filter((c) =>
        c.team_id === requestedTeamId &&
        c.type === General.OPEN_CHANNEL &&
        membershipIds.has(c.id),
    ).sort(sortChannelsByDisplayName.bind(null, locale))[0];
    return myFirstTeamChannel?.id || '';
}

export const setExtraSessionProps = async (serverUrl: string, groupLabel?: RequestGroupLabel) => {
    try {
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const serverVersion = await getConfigValue(database, 'Version');
        const deviceToken = await getDeviceToken();

        // For new servers, we want to send all the information.
        // For old servers, we only want to send the information when there
        // is a device token. Sending the rest of the information should not
        // create any issue.
        if (isMinimumServerVersion(serverVersion, 10, 1, 0) || deviceToken) {
            const res = await checkNotifications();
            const granted = res.status === RESULTS.GRANTED || res.status === RESULTS.LIMITED;
            const client = NetworkManager.getClient(serverUrl);
            client.setExtraSessionProps(deviceToken, !granted, nativeApplicationVersion, groupLabel);
        }
        return {};
    } catch (error) {
        logDebug('error on setExtraSessionProps', getFullErrorMessage(error));
        return {error};
    }
};

export async function verifyPushProxy(serverUrl: string, groupLabel?: RequestGroupLabel) {
    try {
        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        operator.handleSystem({systems: [{id: SYSTEM_IDENTIFIERS.PUSH_VERIFICATION_STATUS, value: PUSH_PROXY_STATUS_VERIFIED}], prepareRecordsOnly: false});
    } catch (error) {
        logDebug('error on verifyPushProxy', getFullErrorMessage(error));
    }
}

export async function handleEntryAfterLoadNavigation(
    serverUrl: string,
    teamMembers: TeamMembership[],
    channelMembers: ChannelMember[],
    currentTeamId: string,
    currentChannelId: string,
    initialTeamId: string,
    initialChannelId: string,
    gmConverted: boolean,
) {
    try {
        const {operator, database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const currentTeamIdAfterLoad = await getCurrentTeamId(database);
        const currentChannelIdAfterLoad = await getCurrentChannelId(database);
        const mountedScreens = NavigationStore.getScreensInStack();
        const isChannelScreenMounted = mountedScreens.includes(Screens.CHANNEL);
        const tabletDevice = isTablet();

        if (!currentTeamIdAfterLoad) {
            // First load or no team
            if (tabletDevice) {
                await setCurrentTeamAndChannelId(operator, initialTeamId, initialChannelId);
            } else {
                await setCurrentTeamAndChannelId(operator, initialTeamId, '');
            }
        } else if (currentTeamIdAfterLoad !== currentTeamId) {
            // Switched teams while loading
            if (!teamMembers.find((t) => t.team_id === currentTeamIdAfterLoad && t.delete_at === 0)) {
                await handleKickFromTeam(serverUrl, currentTeamIdAfterLoad);
            }
        } else if (currentTeamIdAfterLoad !== initialTeamId) {
            if (gmConverted) {
                await setCurrentTeamAndChannelId(operator, initialTeamId, currentChannelId);
            } else {
                await handleKickFromTeam(serverUrl, currentTeamIdAfterLoad);
            }
        } else if (currentChannelIdAfterLoad !== currentChannelId) {
            // Switched channels while loading
            if (!channelMembers.find((m) => m.channel_id === currentChannelIdAfterLoad)) {
                if (tabletDevice || isChannelScreenMounted) {
                    await handleKickFromChannel(serverUrl, currentChannelIdAfterLoad);
                } else {
                    await setCurrentTeamAndChannelId(operator, initialTeamId, initialChannelId);
                }
            }
        } else if (currentChannelIdAfterLoad && currentChannelIdAfterLoad !== initialChannelId) {
            if (tabletDevice || isChannelScreenMounted) {
                await handleKickFromChannel(serverUrl, currentChannelIdAfterLoad);
            } else {
                await setCurrentTeamAndChannelId(operator, initialTeamId, initialChannelId);
            }
        }
    } catch (error) {
        logDebug('could not manage the entry after load navigation', error);
    }
}
