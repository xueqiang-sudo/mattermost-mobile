// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {storeCategories} from '@actions/local/category';
import {General} from '@constants';
import {CHANNELS_CATEGORY, DMS_CATEGORY, FAVORITES_CATEGORY} from '@constants/categories';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getChannelCategory, queryCategoriesByTeamIds} from '@queries/servers/categories';
import {getChannelById} from '@queries/servers/channel';
import {getCurrentTeamId, getCurrentUserId} from '@queries/servers/system';
import {debugLog} from '@store/debug_log';
import {getFullErrorMessage} from '@utils/errors';
import {logDebug} from '@utils/log';
import {showFavoriteChannelSnackbar} from '@utils/snack_bar';

import {forceLogoutIfNecessary} from './session';

export type CategoriesRequest = {
     categories?: CategoryWithChannels[];
     error?: unknown;
 }

export const createCategory = async (serverUrl: string, teamId: string, displayName: string) => {
    try {
        debugLog('[createCategory] start', {teamId, displayName});
        const client = NetworkManager.getClient(serverUrl);
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const currentUserId = await getCurrentUserId(database);
        debugLog('[createCategory] currentUserId', currentUserId);

        const requestBody = {
            user_id: currentUserId,
            team_id: teamId,
            display_name: displayName,
            channel_ids: [],
        };
        debugLog('[createCategory] requestBody', requestBody);

        const newCategory = await client.createChannelCategory('me', teamId, requestBody as Partial<Category>);
        debugLog('[createCategory] success', newCategory);

        // Refresh local categories after creation
        await fetchCategories(serverUrl, teamId);

        return {category: newCategory};
    } catch (error) {
        const errorMsg = getFullErrorMessage(error);
        debugLog('[createCategory] error', errorMsg);
        logDebug('error on createCategory', errorMsg);
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

export const moveChannelToCategory = async (serverUrl: string, channelId: string, targetCategoryId: string) => {
    try {
        debugLog('[moveChannelToCategory] start', {serverUrl, channelId, targetCategoryId});
        const client = NetworkManager.getClient(serverUrl);
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const teamId = await getCurrentTeamId(database);
        if (!teamId) {
            debugLog('[moveChannelToCategory] no current team');
            return {error: 'no current team'};
        }
        debugLog('[moveChannelToCategory] teamId', teamId);

        const currentCategory = await getChannelCategory(database, teamId, channelId);
        if (!currentCategory) {
            debugLog('[moveChannelToCategory] channel does not belong to a category', {channelId, teamId});
            return {error: 'channel does not belong to a category'};
        }
        debugLog('[moveChannelToCategory] currentCategory', {id: currentCategory.id, type: currentCategory.type, displayName: currentCategory.displayName});

        const categories = await queryCategoriesByTeamIds(database, [teamId]).fetch();
        debugLog('[moveChannelToCategory] all categories count', categories.length);

        const targetCategory = categories.find((c) => c.id === targetCategoryId);
        if (!targetCategory) {
            debugLog('[moveChannelToCategory] target category not found', {targetCategoryId, availableIds: categories.map((c) => c.id)});
            return {error: 'target category not found'};
        }
        debugLog('[moveChannelToCategory] targetCategory', {id: targetCategory.id, type: targetCategory.type});

        // Skip if already in target category
        if (currentCategory.id === targetCategoryId) {
            debugLog('[moveChannelToCategory] already in target category, skip');
            return {data: true};
        }

        const sourceWithChannels = await currentCategory.toCategoryWithChannels();
        const targetWithChannels = await targetCategory.toCategoryWithChannels();
        debugLog('[moveChannelToCategory] before move', {
            sourceChannelCount: sourceWithChannels.channel_ids.length,
            targetChannelCount: targetWithChannels.channel_ids.length,
            channelInSource: sourceWithChannels.channel_ids.includes(channelId),
        });

        // Remove from source
        const channelIndex = sourceWithChannels.channel_ids.indexOf(channelId);
        if (channelIndex >= 0) {
            sourceWithChannels.channel_ids.splice(channelIndex, 1);
        }

        // Add to target (at the beginning)
        if (!targetWithChannels.channel_ids.includes(channelId)) {
            targetWithChannels.channel_ids.unshift(channelId);
        }

        debugLog('[moveChannelToCategory] calling API updateChannelCategories', {
            source: {id: sourceWithChannels.id, channels: sourceWithChannels.channel_ids.length},
            target: {id: targetWithChannels.id, channels: targetWithChannels.channel_ids.length},
        });
        await client.updateChannelCategories('me', teamId, [sourceWithChannels, targetWithChannels]);
        debugLog('[moveChannelToCategory] API call success');

        // Refresh local categories so the channel list re-renders immediately
        await fetchCategories(serverUrl, teamId);

        return {data: true};
    } catch (error) {
        logDebug('error on moveChannelToCategory', getFullErrorMessage(error));
        debugLog('[moveChannelToCategory] API error', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

export const fetchCategories = async (serverUrl: string, teamId: string, prune = false, fetchOnly = false): Promise<CategoriesRequest> => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {categories} = await client.getCategories('me', teamId);

        if (!fetchOnly) {
            storeCategories(serverUrl, categories, prune);
        }

        return {categories};
    } catch (error) {
        logDebug('error on fetchCategories', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

export const toggleFavoriteChannel = async (serverUrl: string, channelId: string, showSnackBar = false) => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const channel = await getChannelById(database, channelId);
        if (!channel) {
            return {error: 'channel not found'};
        }

        const currentTeamId = await getCurrentTeamId(database);
        const teamId = channel?.teamId || currentTeamId;
        const currentCategory = await getChannelCategory(database, teamId, channelId);

        if (!currentCategory) {
            return {error: 'channel does not belong to a category'};
        }

        const categories = await queryCategoriesByTeamIds(database, [teamId]).fetch();
        const isFavorited = currentCategory.type === FAVORITES_CATEGORY;
        let targetWithChannels: CategoryWithChannels;
        let favoriteWithChannels: CategoryWithChannels;

        if (isFavorited) {
            const categoryType = (channel.type === General.DM_CHANNEL || channel.type === General.GM_CHANNEL) ? DMS_CATEGORY : CHANNELS_CATEGORY;
            const targetCategory = categories.find((c) => c.type === categoryType);
            if (!targetCategory) {
                return {error: 'target category not found'};
            }
            targetWithChannels = await targetCategory.toCategoryWithChannels();
            targetWithChannels.channel_ids.unshift(channelId);

            favoriteWithChannels = await currentCategory.toCategoryWithChannels();
            const channelIndex = favoriteWithChannels.channel_ids.indexOf(channelId);
            favoriteWithChannels.channel_ids.splice(channelIndex, 1);
        } else {
            const favoritesCategory = categories.find((c) => c.type === FAVORITES_CATEGORY);
            if (!favoritesCategory) {
                return {error: 'No favorites category'};
            }
            favoriteWithChannels = await favoritesCategory.toCategoryWithChannels();
            favoriteWithChannels.channel_ids.unshift(channelId);

            targetWithChannels = await currentCategory.toCategoryWithChannels();
            const channelIndex = targetWithChannels.channel_ids.indexOf(channelId);
            targetWithChannels.channel_ids.splice(channelIndex, 1);
        }

        await client.updateChannelCategories('me', teamId, [targetWithChannels, favoriteWithChannels]);

        if (showSnackBar) {
            const onUndo = () => toggleFavoriteChannel(serverUrl, channelId, false);
            showFavoriteChannelSnackbar(!isFavorited, onUndo);
        }

        return {data: true};
    } catch (error) {
        logDebug('error on toggleFavoriteChannel', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};
