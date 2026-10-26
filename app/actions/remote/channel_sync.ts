// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 全量异步增量同步 - 登录后后台同步所有频道消息
 * 类似微信的同步机制：基于本地已有数据，只加载新消息
 */

import {fetchPosts, fetchPostsSince} from '@actions/remote/post';
import {queryMyChannels} from '@queries/servers/channel';
import {getPostsForChannel} from '@queries/servers/post';
import DatabaseManager from '@database/manager';
import {debugLog} from '@store/debug_log';
import {logInfo} from '@utils/log';

type SyncOptions = {
    concurrent?: number;
    messagesPerChannel?: number;
    priority?: 'high' | 'low';
};

/**
 * 登录后触发全量异步同步
 * @param serverUrl 服务器地址
 */
export async function startBackgroundSync(serverUrl: string): Promise<void> {
    debugLog('BackgroundSync', `Starting background sync for ${serverUrl}`);
    logInfo('BackgroundSync: Starting background message sync');

    try {
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        // 获取用户加入的所有频道
        const myChannels = await queryMyChannels(database).fetch();

        if (!myChannels || myChannels.length === 0) {
            debugLog('BackgroundSync', 'No channels found, skipping sync');
            return;
        }

        debugLog('BackgroundSync', `Found ${myChannels.length} channels to sync`);

        // 按优先级分类
        const highPriorityChannels: string[] = [];
        const normalPriorityChannels: string[] = [];

        for (const channel of myChannels) {
            const channelId = channel.id;

            // 高优先级：未读消息的频道
            if (channel.lastViewedAt < channel.lastPostAt) {
                highPriorityChannels.push(channelId);
            } else {
                normalPriorityChannels.push(channelId);
            }
        }

        debugLog('BackgroundSync', `High priority: ${highPriorityChannels.length}, Normal: ${normalPriorityChannels.length}`);

        // 先同步高优先级频道（并发数 3）
        if (highPriorityChannels.length > 0) {
            await syncChannelsBatch(serverUrl, highPriorityChannels, {
                concurrent: 3,
                messagesPerChannel: 50,
                priority: 'high',
            });
        }

        // 再同步普通优先级频道（并发数 2）
        if (normalPriorityChannels.length > 0) {
            await syncChannelsBatch(serverUrl, normalPriorityChannels, {
                concurrent: 2,
                messagesPerChannel: 50,
                priority: 'low',
            });
        }

        debugLog('BackgroundSync', 'Background sync completed successfully');
        logInfo('BackgroundSync: Background message sync completed');
    } catch (error) {
        debugLog('BackgroundSync', `Background sync failed: ${error}`);
        logInfo(`BackgroundSync: Background sync failed: ${error}`);
        // 不抛出错误，避免影响用户体验
    }
}

/**
 * 批量同步频道（控制并发数）
 */
async function syncChannelsBatch(
    serverUrl: string,
    channelIds: string[],
    options: SyncOptions,
): Promise<void> {
    const {concurrent = 2, messagesPerChannel = 50, priority = 'low'} = options;

    debugLog('BackgroundSync', `Syncing ${channelIds.length} channels with concurrency ${concurrent}`);

    // 分批并发，避免同时发太多请求
    for (let i = 0; i < channelIds.length; i += concurrent) {
        const batch = channelIds.slice(i, i + concurrent);

        debugLog('BackgroundSync', `Processing batch ${Math.floor(i / concurrent) + 1}: ${batch.length} channels`);

        // 并发同步这一批频道
        const results = await Promise.allSettled(
            batch.map(channelId => syncSingleChannel(serverUrl, channelId, messagesPerChannel))
        );

        // 记录成功/失败数量
        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        debugLog('BackgroundSync', `Batch completed: ${succeeded} succeeded, ${failed} failed`);

        // 如果是低优先级，批次之间等待一下，避免影响用户操作
        if (priority === 'low' && i + concurrent < channelIds.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

/**
 * 同步单个频道的消息（增量同步）
 */
async function syncSingleChannel(
    serverUrl: string,
    channelId: string,
    messagesPerChannel: number,
): Promise<void> {
    const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

    try {
        // 查询本地数据库中该频道的最新消息时间戳
        const localPosts = await getPostsForChannel(database, channelId).fetch();

        let since = 0;
        if (localPosts && localPosts.length > 0) {
            // 找到最新的时间戳
            since = Math.max(...localPosts.map(p => p.createAt));
        }

        if (since === 0) {
            // 首次同步：加载最近 N 条
            debugLog('BackgroundSync', `Channel ${channelId}: First sync, loading ${messagesPerChannel} posts`);
            await fetchPosts(serverUrl, channelId, 0, messagesPerChannel, false);
        } else {
            // 增量同步：只加载 since 之后的新消息
            debugLog('BackgroundSync', `Channel ${channelId}: Incremental sync since ${since}`);
            await fetchPostsSince(serverUrl, channelId, since, false);
        }

        debugLog('BackgroundSync', `Channel ${channelId}: Sync completed`);
    } catch (error) {
        debugLog('BackgroundSync', `Channel ${channelId}: Sync failed - ${error}`);
        // 不抛出错误，继续同步其他频道
    }
}

/**
 * 停止后台同步（可选，用于用户主动取消）
 */
export function stopBackgroundSync(): void {
    debugLog('BackgroundSync', 'Background sync stopped');
    // TODO: 如果需要取消正在进行的同步，可以在这里实现
}
