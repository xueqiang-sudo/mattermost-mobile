// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import streamingStore from '@agents/store/streaming_store';
import {isAgentPost} from '@agents/utils';
import {DeviceEventEmitter} from 'react-native';

import {storeMyChannelsForTeam, markChannelAsUnread, markChannelAsViewed, updateLastPostAt} from '@actions/local/channel';
import {addPostAcknowledgement, markPostAsDeleted, removePostAcknowledgement} from '@actions/local/post';
import {createThreadFromNewPost, updateThread} from '@actions/local/thread';
import {fetchChannelStats, fetchMyChannel} from '@actions/remote/channel';
import {fetchPostAuthors, fetchPostById} from '@actions/remote/post';
import {openChannelIfNeeded} from '@actions/remote/preference';
import {fetchThread} from '@actions/remote/thread';
import {fetchMissingProfilesByIds} from '@actions/remote/user';
import {ActionType, Events, Screens} from '@constants';
import {MM_TABLES} from '@constants/database';
import {PostTypes} from '@constants/post';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getChannelById, getMyChannel} from '@queries/servers/channel';
import {getPostById, syncPermalinkPreviewsForEditedPost} from '@queries/servers/post';
import {getCurrentChannelId, getCurrentTeamId, getCurrentUserId} from '@queries/servers/system';
import {getIsCRTEnabled} from '@queries/servers/thread';
import EphemeralStore from '@store/ephemeral_store';
import NavigationStore from '@store/navigation_store';
import {debugLog} from '@store/debug_log';
import {hasArrayChanged, isTablet} from '@utils/helpers';
import {logError, logWarning} from '@utils/log';
import {isFromWebhook, isSystemMessage, shouldIgnorePost} from '@utils/post';

import type {Model} from '@nozbe/watermelondb';
import {Q} from '@nozbe/watermelondb';
import type MyChannelModel from '@typings/database/models/servers/my_channel';
import type PostsInChannelModel from '@typings/database/models/servers/posts_in_channel';

const {FILE, POSTS_IN_CHANNEL} = MM_TABLES.SERVER;

function preparedMyChannelHack(myChannel: MyChannelModel) {
    if (!myChannel._preparedState) {
        myChannel._preparedState = null;
    }
}

export async function handleNewPostEvent(serverUrl: string, msg: WebSocketMessage) {
    try {
        await _handleNewPostEventInner(serverUrl, msg);
    } catch (error) {
        logError('handleNewPostEvent failed:', error);
    }
}

async function _handleNewPostEventInner(serverUrl: string, msg: WebSocketMessage) {
    debugLog('[WS:handleNewPostEvent] ===== 开始处理新 post 事件 =====');
    const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
    if (!operator) {
        debugLog('[WS:handleNewPostEvent] ❌ 未找到 operator');
        return;
    }

    const {database} = operator;

    let post: Post;
    try {
        post = JSON.parse(msg.data.post);
    } catch {
        debugLog('[WS:handleNewPostEvent] ❌ 解析 post JSON 失败');
        return;
    }

    debugLog('[WS:handleNewPostEvent] 📨 收到 post:', {
        id: post.id,
        pending_post_id: post.pending_post_id,
        channel_id: post.channel_id,
        user_id: post.user_id,
        message: post.message?.substring(0, 50),
        file_ids: post.file_ids,
        has_metadata: !!post.metadata,
        metadata_files: post.metadata?.files?.length || 0,
    });

    // 【关键修复】检查这个 post 是否正在通过 createPost API 创建中
    // 如果是，跳过 WebSocket 处理，让 HTTP 响应先处理完
    // 这样可以避免 WebSocket 和 HTTP 响应同时处理导致 post 渲染两次
    // 同时检查 pending_post_id 和 server post.id（因为 WebSocket 事件可能剥离 pending_post_id）
    if (post.pending_post_id && EphemeralStore.isCreatingPost(post.pending_post_id)) {
        debugLog('[WS:handleNewPostEvent] ⏭️ 跳过：post 正在通过 HTTP 创建中（pending_post_id 匹配）', {
            pending_post_id: post.pending_post_id,
            post_id: post.id,
            has_files: !!post.file_ids?.length,
        });
        return;
    }

    // 【新增检查】服务端可能在 WebSocket 事件中剥离 pending_post_id，但 post.id 仍然存在
    // 如果 server post.id 正在创建中，也要跳过，避免重复处理
    if (post.id && EphemeralStore.isCreatingServerPost(post.id)) {
        debugLog('[WS:handleNewPostEvent] ⏭️ 跳过：post 正在通过 HTTP 创建中（server post.id 匹配）', {
            pending_post_id: post.pending_post_id,
            post_id: post.id,
            has_files: !!post.file_ids?.length,
        });
        return;
    }

    debugLog('[WS:handleNewPostEvent] 🚀 开始处理 WebSocket post', {
        post_id: post.id,
        pending_post_id: post.pending_post_id,
        isCreatingPost: post.pending_post_id ? EphemeralStore.isCreatingPost(post.pending_post_id) : false,
        isCreatingServerPost: post.id ? EphemeralStore.isCreatingServerPost(post.id) : false,
        has_files: !!post.file_ids?.length,
        file_count: post.file_ids?.length || 0,
    });

    const currentUserId = await getCurrentUserId(database);

    const existing = await getPostById(database, post.pending_post_id) || await getPostById(database, post.id);
    debugLog('[WS:handleNewPostEvent] 🔍 查询 existing post:', {
        found: !!existing,
        searched_pending_id: post.pending_post_id,
        searched_id: post.id,
    });

    if (existing) {
        try {
            // Post already in DB (from optimistic send + HTTP response).
            // Just ensure PostsInChannel.latest covers this post.
            const chunks = (await database.get(POSTS_IN_CHANNEL).query(
                Q.where('channel_id', post.channel_id),
                Q.sortBy('latest', Q.desc),
            ).fetch()) as PostsInChannelModel[];

            if (chunks.length > 0) {
                const chunk = chunks[0];
                const postCovered = chunk.earliest <= post.create_at && chunk.latest >= post.create_at;
                if (!postCovered) {
                    if (chunk._preparedState === 'update') {
                        chunk.cancelPrepareUpdate();
                    }
                    chunk.prepareUpdate((r) => {
                        r.earliest = Math.min(r.earliest, post.create_at);
                        r.latest = Math.max(r.latest, post.create_at);
                    });
                    // batchRecords internally calls database.write() — do NOT nest
                    await operator.batchRecords([chunk], 'handleNewPostEvent_existingPost_PIC');
                }
            }

            // 【关键修复】当 post.id 变化时（pendingPostId → serverPostId），
            // 需要同步更新 File 记录的 post_id，否则 File 关联断裂。
            // 场景：用户发送带文件的 post → 本地用 pendingPostId 创建 File →
            // 服务端返回 serverPostId → 如果不更新 File.post_id，重新进入聊天时
            // 查询 post.id 找不到对应的 File。
            if (post.pending_post_id && post.id !== post.pending_post_id) {
                const files = await database.get(FILE).query(
                    Q.where('post_id', post.pending_post_id),
                ).fetch();
                if (files.length > 0) {
                    const updates = files.map((f) => {
                        if (f._preparedState === 'update') {
                            f.cancelPrepareUpdate();
                        }
                        f.prepareUpdate((r) => {
                            r.post_id = post.id;
                        });
                        return f;
                    });
                    await operator.batchRecords(updates, 'handleNewPostEvent_updateFilePostId');
                }
            }
        } catch (e) {
            logError('handleNewPostEvent: failed for existing post', e);
        }
        return;
    }

    const isCRTEnabled = await getIsCRTEnabled(database);
    if (isCRTEnabled) {
        await createThreadFromNewPost(serverUrl, post, false);
    }

    // Ensure the channel membership
    let myChannel = await getMyChannel(database, post.channel_id);
    if (myChannel) {
        const isCrtReply = isCRTEnabled && post.root_id !== '';

        // Don't change lastPostAt if the post is thread post
        if (!isCrtReply) {
            const {member} = await updateLastPostAt(serverUrl, post.channel_id, post.create_at, false);
            if (member) {
                myChannel = member;
            }
        }
    } else {
        const myChannelRequest = await fetchMyChannel(serverUrl, '', post.channel_id, true);
        if (myChannelRequest.error) {
            return;
        }

        // We want to have this on the database so we can make any needed update later
        const myChannelModels = await storeMyChannelsForTeam(serverUrl, '', myChannelRequest.channels!, myChannelRequest.memberships!, false);
        if (myChannelModels.error) {
            return;
        }

        myChannel = await getMyChannel(database, post.channel_id);
        if (!myChannel) {
            return;
        }
    }

    // If we don't have the root post for this post, fetch it from the server
    if (post.root_id) {
        const rootPost = await getPostById(database, post.root_id);

        if (!rootPost) {
            fetchPostById(serverUrl, post.root_id);
        }
    }

    const currentChannelId = await getCurrentChannelId(database);

    if (post.channel_id === currentChannelId) {
        const data = {
            channelId: post.channel_id,
            rootId: post.root_id,
            userId: post.user_id,
            now: Date.now(),
        };
        DeviceEventEmitter.emit(Events.USER_STOP_TYPING, data);
    }

    const models: Model[] = [];

    const {authors} = await fetchPostAuthors(serverUrl, [post], true);
    if (authors?.length) {
        const authorsModels = await operator.handleUsers({users: authors, prepareRecordsOnly: true});
        models.push(...authorsModels);
    }

    const ignored = shouldIgnorePost(post);
    if (!ignored) {
        let markAsViewed = false;

        if (!myChannel.manuallyUnread) {
            if (
                post.user_id === currentUserId &&
                !isSystemMessage(post) &&
                !isFromWebhook(post)
            ) {
                markAsViewed = true;
            } else if ((post.channel_id === currentChannelId)) {
                const isChannelScreenMounted = NavigationStore.getScreensInStack().includes(Screens.CHANNEL);

                const isTabletDevice = isTablet();
                if (isChannelScreenMounted || isTabletDevice) {
                    markAsViewed = false;
                }
            }
        }

        if (markAsViewed) {
            preparedMyChannelHack(myChannel);
            const {member: viewedAt} = await markChannelAsViewed(serverUrl, post.channel_id, false, true);
            if (viewedAt) {
                models.push(viewedAt);
            }
        } else if (!isCRTEnabled || !post.root_id) {
            const hasMentions = msg.data.mentions?.includes(currentUserId);
            preparedMyChannelHack(myChannel);
            const {member: unreadAt} = await markChannelAsUnread(
                serverUrl,
                post.channel_id,
                myChannel.messageCount + 1,
                myChannel.mentionsCount + (hasMentions ? 1 : 0),
                myChannel.lastViewedAt,
                true,
            );
            if (unreadAt) {
                models.push(unreadAt);
            }
        }

        openChannelIfNeeded(serverUrl, post.channel_id);
    }

    let actionType: string = ActionType.POSTS.RECEIVED_NEW;
    if (isCRTEnabled && post.root_id) {
        actionType = ActionType.POSTS.RECEIVED_IN_THREAD;
    }

    const outOfOrderWebsocketEvent = EphemeralStore.getLastPostWebsocketEvent(serverUrl, post.id);
    if (outOfOrderWebsocketEvent?.deleted) {
        for (const model of models) {
            if (model._preparedState === 'update') {
                model.cancelPrepareUpdate();
            }
        }
        return;
    }

    if (outOfOrderWebsocketEvent?.post) {
        post = outOfOrderWebsocketEvent.post;
    }

    // 【关键修复】在写 Post 之前确保 File 记录已就绪。
    //
    // 问题：原实现在 Post 写入后才兜底拉取 File 记录。Post 先写入 → FlashList
    // 渲染 → hasFiles=false（File 还没写入）→ 再异步拉取 File → 写入 File →
    // observer 触发 → 但 FlashList 不重新测量已渲染的条目。导致 webapp 发送的
    // 文件/图片在 mobile 实时看不到，必须退出再进聊天窗口才行。
    //
    // 方案：若 post 有 file_ids 或 pending_files，在写 Post 之前先从服务端拉取完整 FileInfo，
    // 并注入到 metadata.files，让 handlePosts 内部统一提取 File 记录，
    // 和 Post 一起写入同一个 batch。
    //
    // 注意：某些 WebSocket 版本可能发送不完整的 metadata.files（字段缺失），
    // 因此始终拉取以确保数据完整性。
    const postFileIds = post.file_ids as string[] | undefined;
    const pendingFiles = (post.props?.pending_files as Array<{client_id: string; name: string; size: number; mime_type: string}> | undefined);

    debugLog('[WS:handleNewPostEvent] 📎 检查文件信息:', {
        has_file_ids: !!(postFileIds && postFileIds.length > 0),
        file_ids_count: postFileIds?.length || 0,
        file_ids: postFileIds,
        has_pending_files: !!(pendingFiles && pendingFiles.length > 0),
        pending_files_count: pendingFiles?.length || 0,
    });

    // 处理已上传完成的文件（file_ids）
    if (postFileIds && postFileIds.length > 0) {
        try {
            const existingFiles = await database.get(FILE).query(
                Q.where('post_id', post.id),
            ).fetch();
            debugLog('[WS:handleNewPostEvent] 💾 查询本地 File 记录:', {
                post_id: post.id,
                existing_count: existingFiles.length,
                need_fetch: existingFiles.length < postFileIds.length,
            });

            // 仅当本地尚无该 post 的 File 记录时拉取（新 post 场景）
            if (existingFiles.length < postFileIds.length) {
                debugLog('[WS:handleNewPostEvent] 🌐 从服务端拉取 FileInfo...');
                const client = NetworkManager.getClient(serverUrl);
                const fileInfos = await client.getFileInfosForPost(post.id);
                debugLog('[WS:handleNewPostEvent] ✅ 服务端返回 FileInfo:', {
                    count: fileInfos?.length || 0,
                    file_ids: fileInfos?.map((f) => f.id),
                });

                if (fileInfos && fileInfos.length > 0) {
                    // 注入到 metadata.files，handlePosts 内部会统一提取并创建 File 记录
                    if (!post.metadata) {
                        post.metadata = {} as any;
                    }
                    post.metadata.files = fileInfos;
                    debugLog('[WS:handleNewPostEvent] 💉 已注入 metadata.files:', {
                        count: fileInfos.length,
                    });
                }
            } else {
                debugLog('[WS:handleNewPostEvent] ⏭️ 本地已有 File 记录，跳过拉取');
            }
        } catch (fileErr) {
            debugLog('[WS:handleNewPostEvent] ❌ 拉取 FileInfo 失败:', fileErr);
            logWarning('handleNewPostEvent: failed to fetch missing files', fileErr);
        }
    }

    // 处理 pending 文件（上传中状态，file_ids 为空但有 pending_files）
    if (pendingFiles && pendingFiles.length > 0 && (!postFileIds || postFileIds.length === 0)) {
        try {
            debugLog('[WS:handleNewPostEvent] 📤 处理 pending 文件:', {
                count: pendingFiles.length,
                files: pendingFiles.map(pf => ({client_id: pf.client_id, name: pf.name})),
            });

            // 检查本地是否已有 pending File 记录
            const existingFiles = await database.get(FILE).query(
                Q.where('post_id', post.id),
            ).fetch();

            // 为每个 pending file 创建临时的 File 记录
            const pendingFileInfos: FileInfo[] = [];
            for (const pf of pendingFiles) {
                const pendingId = `pending_${pf.client_id}`;

                // 检查是否已存在
                if (existingFiles.some(f => f.id === pendingId)) {
                    debugLog('[WS:handleNewPostEvent] ⏭️ pending file 已存在，跳过:', {pendingId});
                    continue;
                }

                const extension = pf.name.includes('.') ? pf.name.split('.').pop() || '' : '';
                pendingFileInfos.push({
                    id: pendingId,
                    user_id: post.user_id,
                    post_id: post.id,
                    create_at: post.create_at || Date.now(),
                    update_at: post.update_at || Date.now(),
                    delete_at: 0,
                    name: pf.name,
                    extension,
                    size: pf.size,
                    mime_type: pf.mime_type,
                    has_preview_image: pf.mime_type?.startsWith('image/') || false,
                    mini_preview: '',
                    link: '',
                    localPath: '',
                    pdfPreviewId: '',
                    imageThumbnail: '',
                } as FileInfo);
            }

            if (pendingFileInfos.length > 0) {
                // 注入到 metadata.files，handlePosts 会创建 File 记录
                if (!post.metadata) {
                    post.metadata = {} as any;
                }
                post.metadata.files = [...(post.metadata.files || []), ...pendingFileInfos];
                debugLog('[WS:handleNewPostEvent] 💉 已注入 pending files 到 metadata.files:', {
                    count: pendingFileInfos.length,
                });
            }
        } catch (pendingErr) {
            debugLog('[WS:handleNewPostEvent] ❌ 处理 pending files 失败:', pendingErr);
            logWarning('handleNewPostEvent: failed to handle pending files', pendingErr);
        }
    }

    debugLog('[WS:handleNewPostEvent] 🔧 调用 handlePosts...');
    const postModels = await operator.handlePosts({
        actionType,
        order: [post.id],
        posts: [post],
        prepareRecordsOnly: true,
    });
    debugLog('[WS:handleNewPostEvent] ✅ handlePosts 返回:', {
        models_count: postModels.length,
    });

    models.push(...postModels);

    debugLog('[WS:handleNewPostEvent] 💾 调用 batchRecords, 总 models 数:', models.length);
    await operator.batchRecords(models, 'handleNewPostEvent');
    debugLog('[WS:handleNewPostEvent] ✅ batchRecords 完成');
}

export async function handlePostEdited(serverUrl: string, msg: WebSocketMessage) {
    debugLog('[WS:handlePostEdited] ===== 开始处理 post 编辑事件 =====');
    const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
    if (!operator) {
        debugLog('[WS:handlePostEdited] ❌ 未找到 operator');
        return;
    }
    const {database} = operator;

    let post: Post;
    try {
        post = JSON.parse(msg.data.post);
    } catch {
        debugLog('[WS:handlePostEdited] ❌ 解析 post JSON 失败');
        return;
    }

    debugLog('[WS:handlePostEdited] 📨 收到 post 编辑事件:', {
        id: post.id,
        pending_post_id: post.pending_post_id,
        channel_id: post.channel_id,
        user_id: post.user_id,
        file_ids: post.file_ids,
    });

    // 【关键修复】检查这个 post 是否正在通过 createPost API 创建中
    // 当用户发送带文件的帖子时，流程是：
    //   1. createPost (pending) → 服务器发送 "posted" 事件
    //   2. 文件上传完成 → patchPost 添加 file_ids → 服务器发送 "post_edited" 事件
    // 如果 "post_edited" 事件在 createPost 流程还未完成时到达，会导致重复更新
    // 因此需要检查 EphemeralStore，如果帖子正在创建中，跳过此编辑事件
    if (post.pending_post_id && EphemeralStore.isCreatingPost(post.pending_post_id)) {
        debugLog('[WS:handlePostEdited] ⏭️ 跳过：post 正在通过 HTTP 创建中（pending_post_id 匹配）', {
            pending_post_id: post.pending_post_id,
            post_id: post.id,
        });
        return;
    }

    // 【新增检查】服务端可能在 WebSocket 事件中剥离 pending_post_id，但 post.id 仍然存在
    // 如果 server post.id 正在创建中，也要跳过，避免重复处理
    if (post.id && EphemeralStore.isCreatingServerPost(post.id)) {
        debugLog('[WS:handlePostEdited] ⏭️ 跳过：post 正在通过 HTTP 创建中（server post.id 匹配）', {
            pending_post_id: post.pending_post_id,
            post_id: post.id,
        });
        return;
    }

    const permalinkModels: Model[] = [];
    try {
        const updatedPermalinkPosts = await syncPermalinkPreviewsForEditedPost(database, post);
        if (updatedPermalinkPosts.length) {
            permalinkModels.push(...updatedPermalinkPosts);
        }
    } catch (error) {
        logWarning('Failed to sync permalink previews for edited post:', error);
    }

    const oldPost = await getPostById(database, post.id);
    if (!oldPost) {
        EphemeralStore.addEditingPost(serverUrl, post);

        // If we have permalink updates but no post to process, batch just the permalinks
        if (permalinkModels.length) {
            operator.batchRecords(permalinkModels, 'handlePostEdited - permalink sync only');
        }
        return;
    }

    const models: Model[] = [...permalinkModels];

    if (post.type === PostTypes.EPHEMERAL && post.create_at === 0) {
        // Updated ephemeral messages don't have a create_at value
        // since the server has no persistence for ephemeral messages,
        // so we need to use the old post's create_at value
        post.create_at = oldPost.createAt;
    }

    const oldFileIds = oldPost.metadata?.files?.map((f) => f.id).filter((id): id is string => Boolean(id)) || [];
    const newFileIds = post.file_ids || [];
    const filesChanged = hasArrayChanged(oldFileIds, newFileIds);

    if (oldPost.isPinned !== post.is_pinned || filesChanged) {
        fetchChannelStats(serverUrl, post.channel_id);
    }

    const {authors} = await fetchPostAuthors(serverUrl, [post], true);
    if (authors?.length) {
        const authorsModels = await operator.handleUsers({users: authors, prepareRecordsOnly: true});
        models.push(...authorsModels);
    }

    let actionType: string = ActionType.POSTS.RECEIVED_NEW;
    const isCRTEnabled = await getIsCRTEnabled(database);
    if (isCRTEnabled && post.root_id) {
        actionType = ActionType.POSTS.RECEIVED_IN_THREAD;
    }

    const postModels = await operator.handlePosts({
        actionType,
        order: [post.id],
        posts: [post],
        prepareRecordsOnly: true,
    });
    models.push(...postModels);

    await operator.batchRecords(models, 'handlePostEdited');

    if (isAgentPost(post)) {
        streamingStore.removePost(post.id);
    }
}

export async function handlePostDeleted(serverUrl: string, msg: WebSocketMessage) {
    try {
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const post: Post = JSON.parse(msg.data.post);

        const oldPost = await getPostById(database, post.id);
        if (!oldPost) {
            EphemeralStore.addRemovingPost(serverUrl, post.id);
            return;
        }

        const models: Model[] = [];

        const {model: deleteModel} = await markPostAsDeleted(serverUrl, post, true);
        if (deleteModel) {
            models.push(deleteModel);
        }

        // Check if the deleted post had files to refresh channel stats
        const hadFiles = (oldPost.metadata?.files?.length || 0) > 0;
        if (hadFiles) {
            fetchChannelStats(serverUrl, post.channel_id);
        }

        // update thread when a reply is deleted and CRT is enabled
        if (post.root_id) {
            const isCRTEnabled = await getIsCRTEnabled(database);
            if (isCRTEnabled) {
                // Update reply_count of the thread;
                // Note: reply_count includes current deleted count, So subtract 1 from reply_count
                const {model: threadModel} = await updateThread(serverUrl, post.root_id, {reply_count: post.reply_count - 1}, true);
                if (threadModel) {
                    models.push(threadModel);
                }

                const channel = await getChannelById(database, post.channel_id);
                if (channel) {
                    let {teamId} = channel;
                    if (!teamId) {
                        teamId = await getCurrentTeamId(database); // In case of DM/GM
                    }
                    fetchThread(serverUrl, teamId, post.root_id);
                }
            }
        }

        if (models.length) {
            await operator.batchRecords(models, 'handlePostDeleted');
        }
    } catch {
        // Do nothing
    }
}

export async function handlePostUnread(serverUrl: string, msg: WebSocketMessage) {
    const {channel_id: channelId, team_id: teamId} = msg.broadcast;
    const {
        mention_count: mentionCount,
        mention_count_root: mentionCountRoot,
        msg_count: msgCount,
        msg_count_root: msgCountRoot,
        last_viewed_at: lastViewedAt,
    } = msg.data;

    const database = DatabaseManager.serverDatabases[serverUrl]?.database;
    if (!database) {
        return;
    }
    const [myChannel, isCRTEnabled] = await Promise.all([
        getMyChannel(database, channelId),
        getIsCRTEnabled(database),
    ]);

    let messages = msgCount;
    let mentions = mentionCount;
    if (isCRTEnabled) {
        messages = msgCountRoot;
        mentions = mentionCountRoot;
    }

    if (!myChannel?.manuallyUnread) {
        const {channels} = await fetchMyChannel(serverUrl, teamId, channelId, true);
        const channel = channels?.[0];
        const postNumber = isCRTEnabled ? channel?.total_msg_count_root : channel?.total_msg_count;
        const delta = postNumber ? postNumber - messages : messages;

        markChannelAsUnread(serverUrl, channelId, delta, mentions, lastViewedAt);
    }
}

export async function handlePostAcknowledgementAdded(serverUrl: string, msg: WebSocketMessage) {
    try {
        const acknowledgement = JSON.parse(msg.data.acknowledgement);
        const {user_id, post_id, acknowledged_at} = acknowledgement;
        const database = DatabaseManager.serverDatabases[serverUrl]?.database;
        if (!database) {
            return;
        }
        const currentUserId = await getCurrentUserId(database);
        if (EphemeralStore.isAcknowledgingPost(post_id) && currentUserId === user_id) {
            return;
        }

        addPostAcknowledgement(serverUrl, post_id, user_id, acknowledged_at);
        fetchMissingProfilesByIds(serverUrl, [user_id]);
    } catch (error) {
        // Do nothing
    }
}

export async function handlePostAcknowledgementRemoved(serverUrl: string, msg: WebSocketMessage) {
    try {
        const acknowledgement = JSON.parse(msg.data.acknowledgement);
        const {user_id, post_id} = acknowledgement;
        const database = DatabaseManager.serverDatabases[serverUrl]?.database;
        if (!database) {
            return;
        }
        const currentUserId = await getCurrentUserId(database);
        if (EphemeralStore.isUnacknowledgingPost(post_id) && currentUserId === user_id) {
            return;
        }
        await removePostAcknowledgement(serverUrl, post_id, user_id);
    } catch (error) {
        // Do nothing
    }
}
