// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
//

/* eslint-disable max-lines */

import {Q} from '@nozbe/watermelondb';

import {markChannelAsUnread, updateLastPostAt} from '@actions/local/channel';
import {addPostAcknowledgement, removePost, removePostAcknowledgement, storePostsForChannel} from '@actions/local/post';
import {addRecentReaction} from '@actions/local/reactions';
import {createThreadFromNewPost} from '@actions/local/thread';
import {fetchChannelStats} from '@actions/remote/channel';
import {ActionType, General, Post, ServerErrors} from '@constants';
import DatabaseManager from '@database/manager';
import {sanitizeLikeString} from '@helpers/database';
import {filterPostsInOrderedArray} from '@helpers/api/post';
import {getNeededAtMentionedUsernames} from '@helpers/api/user';
import NetworkManager from '@managers/network_manager';
import {getMyChannel, prepareMissingChannelsForAllTeams, queryAllMyChannel} from '@queries/servers/channel';
import {queryAllCustomEmojis} from '@queries/servers/custom_emoji';
import {getFilesByIds, queryFilesForPost} from '@queries/servers/file';
import {getPostById, getRecentPostsInChannel} from '@queries/servers/post';
import {getCurrentUserId} from '@queries/servers/system';
import {getIsCRTEnabled, prepareThreadsFromReceivedPosts} from '@queries/servers/thread';
import {queryAllUsers} from '@queries/servers/user';
import EphemeralStore from '@store/ephemeral_store';
import {setFetchingThreadState} from '@store/fetching_thread_store';
import {getValidEmojis, matchEmoticons} from '@utils/emoji/helpers';
import {getFullErrorMessage, isServerError} from '@utils/errors';
import {hasArrayChanged} from '@utils/helpers';
import {logDebug, logError} from '@utils/log';
import {debugLog} from '@store/debug_log';
import {processPostsFetched} from '@utils/post';
import {getPostIdsForCombinedUserActivityPost} from '@utils/post_list';

import {processChannelPostsByTeam} from './post.auxiliary';
import {forceLogoutIfNecessary} from './session';

import type {Client} from '@client/rest';
import type Model from '@nozbe/watermelondb/Model';
import type PostModel from '@typings/database/models/servers/post';

type PostsRequest = {
    error?: unknown;
    order?: string[];
    posts?: Post[];
    previousPostId?: string;
}

export type PostsForChannel = PostsRequest & {
    actionType?: string;
    authors?: UserProfile[];
    channelId?: string;
    error?: unknown;
};

type PostsObjectsRequest = {
    error?: unknown;
    order?: string[];
    posts?: IDMappedObjects<Post>;
    previousPostId?: string;
}

type AuthorsRequest = {
    authors?: UserProfile[];
    error?: unknown;
}

export type BatchFileMeta = {
    client_id: string;
    name: string;
    size: number;
    mime_type: string;
    file_id: string;
};

export async function createPost(serverUrl: string, post: Partial<Post>, files: FileInfo[] = [], skipPendingPostCreation = false): Promise<{data?: {postId?: string; pendingFiles?: BatchFileMeta[]}; error?: unknown}> {
    const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
    if (!operator) {
        return {error: `${serverUrl} database not found`};
    }
    const {database} = operator;

    let client: Client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    const currentUserId = await getCurrentUserId(database);
    const timestamp = Date.now();
    const pendingPostId = post.pending_post_id || `${currentUserId}:${timestamp}`;

    if (!skipPendingPostCreation) {
        const existing = await getPostById(database, pendingPostId);
        if (existing && !existing.props?.failed) {
            return {data: {postId: existing.id}};
        }
    }

    let newPost = {
        ...post,
        id: '',
        pending_post_id: pendingPostId,
        create_at: timestamp,
        update_at: timestamp,
        delete_at: 0,
    } as Post;

    // Note: Don't include file_ids in newPost when sending to server
    // Files haven't been uploaded yet, so server doesn't know about pending file IDs
    // file_ids will be added later via patchPost after upload completes

    const databasePost = {
        ...newPost,
        id: pendingPostId,
    };

    // Add file_ids to databasePost for local storage only
    if (files.length) {
        const fileIds = files.map((file) => file.id);
        databasePost.file_ids = fileIds;
    }

    const initialPostModels: Model[] = [];

    if (files.length) {
        for (const f of files) {
            // Set the pending post Id
            f.post_id = pendingPostId;
        }
        const filesModels = await operator.handleFiles({files, prepareRecordsOnly: true});
        initialPostModels.push(...filesModels);
    }

    const postModels = await operator.handlePosts({
        actionType: ActionType.POSTS.RECEIVED_NEW,
        order: [databasePost.id],
        posts: [databasePost],
        prepareRecordsOnly: true,
    });
    initialPostModels.push(...postModels);

    const customEmojis = await queryAllCustomEmojis(database).fetch();
    const emojisInMessage = matchEmoticons(newPost.message);
    const reactionModels = await addRecentReaction(serverUrl, getValidEmojis(emojisInMessage, customEmojis), true);
    if (!('error' in reactionModels) && reactionModels.length) {
        initialPostModels.push(...reactionModels);
    }

    if (!skipPendingPostCreation) {
        await operator.batchRecords(initialPostModels, 'createPost - initial');
    }

    const isCRTEnabled = await getIsCRTEnabled(database);

    let created;
    try {
        created = await client.createPost({...newPost, create_at: 0});
        if (!created.metadata && newPost.metadata) {
            created = {
                ...created,
                metadata: newPost.metadata,
            };
        }
    } catch (error) {
        logDebug('Error sending a post', getFullErrorMessage(error));
        const errorPost = {
            ...newPost,
            id: pendingPostId,
            props: {
                ...newPost.props,
                failed: true,
            },
            update_at: Date.now(),
        };

        // If the failure was because: the root post was deleted or
        // TownSquareIsReadOnly=true then remove the post
        if (isServerError(error) && (
            error.server_error_id === ServerErrors.DELETED_ROOT_POST_ERROR ||
            error.server_error_id === ServerErrors.TOWN_SQUARE_READ_ONLY_ERROR ||
            error.server_error_id === ServerErrors.PLUGIN_DISMISSED_POST_ERROR
        )) {
            await removePost(serverUrl, databasePost);
        } else {
            const models = await operator.handlePosts({
                actionType: ActionType.POSTS.RECEIVED_NEW,
                order: [errorPost.id],
                posts: [errorPost],
                prepareRecordsOnly: true,
            });
            if (isCRTEnabled) {
                const {models: threadModels} = await createThreadFromNewPost(serverUrl, errorPost, true);
                if (threadModels?.length) {
                    models.push(...threadModels);
                }
            }
            await operator.batchRecords(models, 'createPost - failure');
        }

        return {data: {postId: pendingPostId}};
    }

    // Extract pending_files from server response (contains server-generated file_ids)
    // This is used for batch file uploads where FileInfo records are pre-created with metadata
    let pendingFilesFromServer: BatchFileMeta[] | undefined;
    if (created.props?.pending_files && Array.isArray(created.props.pending_files)) {
        pendingFilesFromServer = created.props.pending_files as BatchFileMeta[];
    }

    // If we have pending files and server returned file_ids, use them
    // Otherwise fall back to using local pending file ids
    if (files.length > 0 && pendingFilesFromServer && pendingFilesFromServer.length > 0) {
        // Use server-generated file_ids
        const serverFileIds = pendingFilesFromServer.map(pf => pf.file_id);
        created = {
            ...created,
            file_ids: serverFileIds,
        };
    } else if (files.length > 0) {
        // Fall back to local pending file ids
        const pendingFileIds = files.map((file) => file.id);
        created = {
            ...created,
            file_ids: pendingFileIds,
        };
    }

    const models = await operator.handlePosts({
        actionType: ActionType.POSTS.RECEIVED_NEW,
        order: [created.id],
        posts: [created],
        prepareRecordsOnly: true,
    });

    // Create file records with the real post ID
    // Files are passed with post_id: '' (empty), so we set it to the real post ID
    if (files.length > 0) {
        // If server returned file_ids, use those for the local File records
        const filesWithPostId = files.map((f, idx) => {
            const serverFileId = pendingFilesFromServer?.[idx]?.file_id;
            return {
                ...f,
                post_id: created.id,
                // If server generated a file_id, use it; otherwise keep local id
                id: serverFileId || f.id,
            };
        });
        const fileModels = await operator.handleFiles({files: filesWithPostId, prepareRecordsOnly: true});
        models.push(...fileModels);
    }

    const isCrtReply = isCRTEnabled && created.root_id !== '';
    if (!isCrtReply) {
        const {member} = await updateLastPostAt(serverUrl, created.channel_id, created.create_at, true);
        if (member) {
            models.push(member);
        }
    }
    if (isCRTEnabled) {
        const {models: threadModels} = await createThreadFromNewPost(serverUrl, created, true);
        if (threadModels?.length) {
            models.push(...threadModels);
        }
    }
    await operator.batchRecords(models, 'createPost - success');

    newPost = created;

    return {data: {postId: created.id, pendingFiles: pendingFilesFromServer}};
}

/**
 * Create multiple pending posts in a single database transaction.
 * This minimizes observe() triggers from N to 1, preventing UI jitter
 * when uploading multiple files via the "+" button.
 */
export async function createBatchPendingPosts(
    serverUrl: string,
    postsWithFiles: Array<{
        post: Partial<Post>;
        files: FileInfo[];
    }>,
): Promise<{
    data?: Array<{
        pendingPostId: string;
        post: Post;
        files: FileInfo[];
    }>;
    error?: unknown;
}> {
    try {
        const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
        if (!operator) {
            return {error: `${serverUrl} database not found`};
        }
        const {database} = operator;

        const currentUserId = await getCurrentUserId(database);
        const results: Array<{
            pendingPostId: string;
            post: Post;
            files: FileInfo[];
        }> = [];
        // 每条 post 单独一组 models，便于按组写入（微信式一组一组渲染）
        const perPostModels: Model[][] = [];

        const baseTimestamp = Date.now();

        for (let i = 0; i < postsWithFiles.length; i++) {
            const {post, files} = postsWithFiles[i];
            const timestamp = baseTimestamp + i; // Ensure unique timestamps
            const pendingPostId = post.pending_post_id || `${currentUserId}:${timestamp}`;

            // Check for existing post
            const existing = await getPostById(database, pendingPostId);
            if (existing && !existing.props?.failed) {
                results.push({
                    pendingPostId: existing.id,
                    post: existing as unknown as Post,
                    files: [],
                });
                perPostModels.push([]);
                continue;
            }

            const newPost = {
                ...post,
                id: '',
                pending_post_id: pendingPostId,
                create_at: timestamp,
                update_at: timestamp,
                delete_at: 0,
            } as Post;

            const databasePost = {
                ...newPost,
                id: pendingPostId,
            };

            // Add file_ids to databasePost for local storage
            if (files.length) {
                const fileIds = files.map((file) => file.id);
                databasePost.file_ids = fileIds;
            }

            const groupModels: Model[] = [];

            // Prepare file models
            if (files.length) {
                for (const f of files) {
                    f.post_id = pendingPostId;
                }
                const filesModels = await operator.handleFiles({files, prepareRecordsOnly: true});
                groupModels.push(...filesModels);
            }

            // Prepare post model
            const postModels = await operator.handlePosts({
                actionType: ActionType.POSTS.RECEIVED_NEW,
                order: [databasePost.id],
                posts: [databasePost],
                prepareRecordsOnly: true,
            });
            groupModels.push(...postModels);

            results.push({
                pendingPostId,
                post: newPost,
                files,
            });
            perPostModels.push(groupModels);
        }

        // Handle recent reactions once for the first post (attach to first group)
        if (results.length > 0) {
            const firstPost = results[0].post;
            const customEmojis = await queryAllCustomEmojis(database).fetch();
            const emojisInMessage = matchEmoticons(firstPost.message);
            const reactionModels = await addRecentReaction(serverUrl, getValidEmojis(emojisInMessage, customEmojis), true);
            if (!('error' in reactionModels) && reactionModels.length && perPostModels[0]) {
                perPostModels[0].push(...reactionModels);
            }
        }

        // 【两阶段写入】先全量 File → 再全量 Post+其他。
        //
        // 阶段 1：全量写 File。此时 Post 不存在，PostList 不会渲染。
        // 阶段 2：全量写 Post（含 reaction 等非 File 模型），一次 batch 完成。
        //         FlashList 收到完整的 posts 列表后统一测量布局，
        //         避免逐条写入导致的布局计算混乱和位置重叠。
        const allFiles: Model[] = [];
        const allNonFiles: Model[] = [];
        for (const models of perPostModels) {
            if (!models || models.length === 0) continue;
            for (const m of models) {
                if ((m as {table?: string})?.table === 'File') {
                    allFiles.push(m);
                } else {
                    allNonFiles.push(m);
                }
            }
        }

        // 阶段 1：全量写 File
        if (allFiles.length > 0) {
            await operator.batchRecords(allFiles, 'createBatchPendingPosts_files');
        }

        // 阶段 2：全量写 Post（含 reaction 等非 File 模型）
        if (allNonFiles.length > 0) {
            await operator.batchRecords(allNonFiles, 'createBatchPendingPosts_posts');
        }

        return {data: results};
    } catch (error) {
        console.error('[createBatchPendingPosts] error:', error);
        return {error};
    }
}

/**
 * Update a post's file_ids after background upload completes.
 * This is used for optimistic UI: create post immediately, upload files in background.
 */
export async function updatePostFileIds(serverUrl: string, postId: string, files: FileInfo[]): Promise<{data?: boolean; error?: unknown}> {
    const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
    if (!operator) {
        return {error: `${serverUrl} database not found`};
    }
    const {database} = operator;

    let client: Client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    try {
        // Get the current post
        const existingPost = await getPostById(database, postId);
        if (!existingPost) {
            return {error: 'Post not found'};
        }

        // 构建 pendingFileId → 上传后 FileInfo 的映射
        const uploadedByOldId = new Map<string, FileInfo>();
        for (const file of files) {
            const oldId = file.clientId || file.id;
            uploadedByOldId.set(oldId, file);
        }

        debugLog('POST', `updatePostFileIds: postId=${postId}, pendingPostId=${existingPost.pending_post_id}`, {
            uploadedFiles: files.map(f => ({id: f.id, clientId: f.clientId, name: f.name})),
            uploadedByOldIdKeys: Array.from(uploadedByOldId.keys()),
        });

        // 查询当前 post 关联的所有 File 记录（可能用 serverId 或 pending_post_id 查）
        const existingFiles = await queryFilesForPost(database, postId).fetch();
        let pendingFiles: typeof existingFiles = [];
        if (existingPost.pending_post_id && existingPost.pending_post_id !== postId) {
            pendingFiles = await queryFilesForPost(database, existingPost.pending_post_id).fetch();
        }
        const allFileRecords = [...existingFiles, ...pendingFiles];

        debugLog('POST', `updatePostFileIds: found ${existingFiles.length} files by postId, ${pendingFiles.length} by pendingPostId`, {
            existingFileIds: existingFiles.map(f => f.id),
            pendingFileIds: pendingFiles.map(f => f.id),
        });

        const models: Model[] = [];
        const newFileIds: string[] = [];

        // 精确匹配：只删除已完成上传的 pending File，保留仍在上传中的
        for (const fileRecord of allFileRecords) {
            const uploaded = uploadedByOldId.get(fileRecord.id);
            if (uploaded) {
                // 这个 pending File 已上传完成，删除旧记录
                models.push(fileRecord.prepareDestroyPermanently());
                newFileIds.push(uploaded.id!);
                uploadedByOldId.delete(fileRecord.id);
                debugLog('POST', `updatePostFileIds: replacing ${fileRecord.id} → ${uploaded.id}`);
            } else {
                // 这个 File 还在上传中，保留不动
                newFileIds.push(fileRecord.id);
                debugLog('POST', `updatePostFileIds: keeping pending ${fileRecord.id}`);
            }
        }

        // 为已上传完成的文件创建新的 File 记录（使用真实 server ID）
        const newFiles: FileInfo[] = [];
        for (const [, uploaded] of uploadedByOldId) {
            uploaded.post_id = postId;
            newFiles.push(uploaded);
            newFileIds.push(uploaded.id!);
            debugLog('POST', `updatePostFileIds: creating new file record ${uploaded.id} (no pending record found)`);
        }
        if (newFiles.length > 0) {
            const fileModels = await operator.handleFiles({files: newFiles, prepareRecordsOnly: true});
            models.push(...fileModels);
        }

        // 更新 post 的 file_ids（保留未完成的 pending ID + 已完成的 server ID）
        // 清除 pending_files 和 upload_progress（上传完成，接收端不再需要显示"上传中"）
        const newProps = {
            ...existingPost.props,
            upload_status: 'completed',
            pending_files: null,
            upload_progress: null,
        };
        existingPost.prepareUpdate((p) => {
            p.fileIds = newFileIds;
            p.updateAt = Date.now();
            p.props = newProps;
        });
        models.push(existingPost);

        await operator.batchRecords(models, 'updatePostFileIds');

        debugLog('POST', `updatePostFileIds: complete`, {
            newFileIds,
            serverFileIds: newFileIds.filter((id) => !id.startsWith('pending_')),
        });

        // Update on server using patchPost（只发 server IDs，不发 pending IDs）
        // 清除 pending_files 和 upload_progress，让接收端切换到"未下载"状态
        await client.patchPost({
            id: postId,
            file_ids: newFileIds.filter((id) => !id.startsWith('pending_')),
            props: newProps,
        });

        return {data: true};
    } catch (error) {
        logError('[updatePostFileIds]', error);
        return {error};
    }
}

/**
 * Mark a post's upload as failed.
 */
export async function markPostUploadFailed(serverUrl: string, postId: string, fileName: string): Promise<void> {
    const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
    if (!operator) {
        return;
    }
    const {database} = operator;

    try {
        const existingPost = await getPostById(database, postId);
        if (!existingPost) {
            return;
        }

        const updatedPost = {
            id: postId,
            props: {
                ...existingPost.props,
                failed: true,
                upload_status: 'failed',
                failed_file: fileName,
            },
            update_at: Date.now(),
        };

        const models = await operator.handlePosts({
            actionType: ActionType.POSTS.RECEIVED_NEW,
            order: [postId],
            posts: [updatedPost as Post],
            prepareRecordsOnly: true,
        });

        await operator.batchRecords(models, 'markPostUploadFailed');
    } catch (error) {
        logError('[markPostUploadFailed]', error);
    }
}

export const retryFailedPost = async (serverUrl: string, post: PostModel) => {
    const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
    if (!operator) {
        return {error: `${serverUrl} database not found`};
    }
    const {database} = operator;

    let client: Client;
    try {
        client = NetworkManager.getClient(serverUrl);
    } catch (error) {
        return {error};
    }

    const isCRTEnabled = await getIsCRTEnabled(database);

    try {
        const timestamp = Date.now();
        const apiPost = await post.toApi();
        const newPost = {
            ...apiPost,
            props: {
                ...apiPost.props,
                failed: false,
            },
            id: '',
            create_at: timestamp,
            update_at: timestamp,
            delete_at: 0,
        } as Post;

        // Update the local post to reflect the pending state in the UI
        // timestamps will remain the same as the initial attempt for createAt
        // but updateAt will be use for the optimistic post UI
        post.prepareUpdate((p) => {
            p.props = newPost.props || null;
            p.updateAt = timestamp;
        });
        await operator.batchRecords([post], 'retryFailedPost - first update');

        const created = await client.createPost(newPost);
        const models = await operator.handlePosts({
            actionType: ActionType.POSTS.RECEIVED_NEW,
            order: [created.id],
            posts: [created],
            prepareRecordsOnly: true,
        });
        const isCrtReply = isCRTEnabled && created.root_id !== '';
        if (!isCrtReply) {
            const {member} = await updateLastPostAt(serverUrl, created.channel_id, created.create_at, true);
            if (member) {
                models.push(member);
            }
        }
        await operator.batchRecords(models, 'retryFailedPost - success update');
    } catch (error) {
        logDebug('error on retryFailedPost', getFullErrorMessage(error));
        if (isServerError(error) && (
            error.server_error_id === ServerErrors.DELETED_ROOT_POST_ERROR ||
            error.server_error_id === ServerErrors.TOWN_SQUARE_READ_ONLY_ERROR ||
            error.server_error_id === ServerErrors.PLUGIN_DISMISSED_POST_ERROR
        )) {
            await removePost(serverUrl, post);
        } else {
            post.prepareUpdate((p) => {
                p.props = {
                    ...p.props,
                    failed: true,
                };
            });
            await operator.batchRecords([post], 'retryFailedPost - error update');
        }

        return {error};
    }

    return {};
};

export async function fetchPostsForChannel(serverUrl: string, channelId: string, fetchOnly = false, skipAuthors = false, groupLabel?: RequestGroupLabel): Promise<PostsForChannel> {
    try {
        if (!fetchOnly) {
            EphemeralStore.addLoadingMessagesForChannel(serverUrl, channelId);
        }
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        let postAction: Promise<PostsRequest>|undefined;
        let actionType: string|undefined;
        const myChannel = await getMyChannel(database, channelId);
        const postsInChannel = await getRecentPostsInChannel(database, channelId);
        const since = myChannel?.lastFetchedAt || postsInChannel?.[0]?.createAt || 0;
        if (since) {
            postAction = fetchPostsSince(serverUrl, channelId, since, true, groupLabel);
            actionType = ActionType.POSTS.RECEIVED_SINCE;
        } else {
            postAction = fetchPosts(serverUrl, channelId, 0, General.POST_CHUNK_SIZE, true, groupLabel);
            actionType = ActionType.POSTS.RECEIVED_IN_CHANNEL;
        }

        const data = await postAction;
        if (data.error) {
            throw data.error;
        }
        let authors: UserProfile[] = [];
        if (data.posts?.length && data.order?.length) {
            if (!skipAuthors) {
                const {authors: fetchedAuthors} = await fetchPostAuthors(serverUrl, data.posts, true, groupLabel);
                authors = fetchedAuthors || [];
            }

            if (!fetchOnly) {
                await storePostsForChannel(
                    serverUrl, channelId,
                    data.posts, data.order, data.previousPostId ?? '',
                    actionType, authors,
                );
            }
        }

        return {posts: data.posts, order: data.order, authors, actionType, previousPostId: data.previousPostId, channelId};
    } catch (error) {
        logDebug('error on fetchPostsForChannel', getFullErrorMessage(error));
        return {error};
    } finally {
        if (!fetchOnly) {
            EphemeralStore.stopLoadingMessagesForChannel(serverUrl, channelId);
        }
    }
}

export const fetchPostsForUnreadChannels = async (
    serverUrl: string, teams: Team[], channels: Channel[], memberships: ChannelMembership[],
    excludeChannelId?: string, isCRTEnabled?: boolean, groupLabel?: RequestGroupLabel,
): Promise<void> => {
    const teamIndexMap = new Map<string, number>();
    teams.forEach((team, index) => teamIndexMap.set(team.id, index));

    const channelsMap = new Map<string, Channel>();
    for (const channel of channels) {
        if (channel.id !== excludeChannelId && !channel.delete_at) {
            channelsMap.set(channel.id, channel);
        }
    }

    const sortedUnreadchannelIdsByTeam = memberships.filter((member) => {
        const channel = channelsMap.get(member.channel_id);
        if (channel) {
            const unreads = isCRTEnabled ? (channel.total_msg_count_root ?? 0) - (member.msg_count_root ?? 0) : channel.total_msg_count - member.msg_count;
            return unreads > 0; // Keep only channels with unreads
        }

        return false;
    }).
        sort((a, b) => {
            const channelA = channelsMap.get(a.channel_id);
            const channelB = channelsMap.get(b.channel_id);

            if (!channelA || !channelB) {
                return 0; // If either channel is undefined, treat as equal
            }

            // Priority for channels with an empty team_id
            if (channelA.team_id === '' && channelB.team_id !== '') {
                return -1;
            }
            if (channelB.team_id === '' && channelA.team_id !== '') {
                return 1;
            }

            // Get team indices for sorting
            const teamIndexA = teamIndexMap.get(channelA.team_id) ?? Number.MAX_SAFE_INTEGER;
            const teamIndexB = teamIndexMap.get(channelB.team_id) ?? Number.MAX_SAFE_INTEGER;

            // Sort by team index first
            if (teamIndexA !== teamIndexB) {
                return teamIndexA - teamIndexB;
            }

            // If team index is the same, sort by last_viewed_at in descending order
            return b.last_viewed_at - a.last_viewed_at;
        }).
        reduce((acc, member) => {
            const channel = channelsMap.get(member.channel_id);
            const teamId = channel!.team_id || '';
            if (!acc[teamId]) {
                acc[teamId] = [];
            }
            acc[teamId].push(channel!.id);

            return acc;
        }, {} as Record<string, string[]>);

    for (const channelIds of Object.values(sortedUnreadchannelIdsByTeam)) {
        /* eslint-disable-next-line no-await-in-loop */
        await processChannelPostsByTeam(serverUrl, channelIds, false, groupLabel, isCRTEnabled);
    }
};

/**
 * 冷启动时为首页聊天列表补全"最后一条消息预览"。
 *
 * 背景：`fetchPostsForUnreadChannels` 只为有未读消息的频道拉 posts。
 * 对于用户已读完（无未读）但最近有活动的频道，本地 Post 表为空，
 * 首页条目只能显示标题 + 时间，没有最后一条消息预览。必须进入
 * 聊天窗口（`fetchPostsForChannel`）再退出，UI 响应式查询才能拿到数据。
 *
 * 本函数补齐：取按 last_post_at 倒序的前 N 个「无本地 post 记录」的
 * 活跃频道，批量拉一次 posts，让 `observeLastPostInChannel` 在首页
 * 就能渲染出预览。
 */
export const fetchLastPostForRecentChannels = async (
    serverUrl: string,
    channels: Channel[],
    excludeChannelId?: string,
    groupLabel?: RequestGroupLabel,
    isCRTEnabled?: boolean,
): Promise<void> => {
    try {
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        // 一次性拿到本地已有 posts 的 channel_id 集合
        const existingPostsInChannel = await database.get('PostsInChannel').query().fetch();
        const hasPostsSet = new Set(existingPostsInChannel.map((c: any) => c.channelId));

        const candidateChannels = channels
            .filter((c) => c.id !== excludeChannelId && !c.delete_at && !hasPostsSet.has(c.id))
            .sort((a, b) => (b.last_post_at ?? 0) - (a.last_post_at ?? 0));

        // 取按 last_post_at 倒序的前 N 个，避免一次性拉太多
        const limit = 20;
        const topRecent = candidateChannels.slice(0, limit);
        if (topRecent.length === 0) {
            return;
        }

        const missingByTeam: Record<string, string[]> = {};
        for (const channel of topRecent) {
            const teamId = channel.team_id || '';
            if (!missingByTeam[teamId]) {
                missingByTeam[teamId] = [];
            }
            missingByTeam[teamId].push(channel.id);
        }

        for (const channelIds of Object.values(missingByTeam)) {
            /* eslint-disable-next-line no-await-in-loop */
            await processChannelPostsByTeam(serverUrl, channelIds, false, groupLabel, isCRTEnabled);
        }
    } catch (error) {
        logDebug('fetchLastPostForRecentChannels failed', getFullErrorMessage(error));
    }
};

export async function fetchPosts(serverUrl: string, channelId: string, page = 0, perPage = General.POST_CHUNK_SIZE, fetchOnly = false, groupLabel?: RequestGroupLabel): Promise<PostsRequest> {
    try {
        if (!fetchOnly) {
            EphemeralStore.addLoadingMessagesForChannel(serverUrl, channelId);
        }
        const {operator, database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const client = NetworkManager.getClient(serverUrl);
        const isCRTEnabled = await getIsCRTEnabled(database);
        const data = await client.getPosts(channelId, page, perPage, isCRTEnabled, isCRTEnabled, groupLabel);
        const result = processPostsFetched(data);
        if (!fetchOnly && result.posts.length) {
            const models = await operator.handlePosts({
                ...result,
                actionType: ActionType.POSTS.RECEIVED_IN_CHANNEL,
                prepareRecordsOnly: true,
            });

            const {authors} = await fetchPostAuthors(serverUrl, result.posts, true, groupLabel);
            if (authors?.length) {
                const userModels = await operator.handleUsers({
                    users: authors,
                    prepareRecordsOnly: true,
                });
                models.push(...userModels);
            }

            if (isCRTEnabled) {
                const threadModels = await prepareThreadsFromReceivedPosts(operator, result.posts, false);
                if (threadModels?.length) {
                    models.push(...threadModels);
                }
            }

            if (models.length) {
                await operator.batchRecords(models, 'fetchPosts');
            }
        }
        return result;
    } catch (error) {
        logDebug('error on fetchPosts', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    } finally {
        if (!fetchOnly) {
            EphemeralStore.stopLoadingMessagesForChannel(serverUrl, channelId);
        }
    }
}

export async function fetchPostsBefore(serverUrl: string, channelId: string, postId: string, perPage = General.POST_CHUNK_SIZE, fetchOnly = false) {
    try {
        if (!fetchOnly) {
            EphemeralStore.addLoadingMessagesForChannel(serverUrl, channelId);
        }
        const client = NetworkManager.getClient(serverUrl);
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const isCRTEnabled = await getIsCRTEnabled(database);
        const data = await client.getPostsBefore(channelId, postId, 0, perPage, isCRTEnabled, isCRTEnabled);
        const result = processPostsFetched(data);

        if (result.posts.length && !fetchOnly) {
            try {
                const models = await operator.handlePosts({
                    actionType: ActionType.POSTS.RECEIVED_BEFORE,
                    ...result,
                    prepareRecordsOnly: true,
                });
                const {authors} = await fetchPostAuthors(serverUrl, result.posts, true);
                if (authors?.length) {
                    const userModels = await operator.handleUsers({
                        users: authors,
                        prepareRecordsOnly: true,
                    });
                    models.push(...userModels);
                }

                if (isCRTEnabled) {
                    const threadModels = await prepareThreadsFromReceivedPosts(operator, result.posts, false);
                    if (threadModels?.length) {
                        models.push(...threadModels);
                    }
                }

                await operator.batchRecords(models, 'fetchPostsBefore');
            } catch (error) {
                logError('FETCH POSTS BEFORE ERROR', error);
            }
        }
        return result;
    } catch (error) {
        logDebug('error on fetchPostsBefore', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error as ClientErrorProps);
        return {error};
    } finally {
        if (!fetchOnly) {
            EphemeralStore.stopLoadingMessagesForChannel(serverUrl, channelId);
        }
    }
}

export async function fetchPostsSince(serverUrl: string, channelId: string, since: number, fetchOnly = false, groupLabel?: RequestGroupLabel): Promise<PostsRequest> {
    try {
        if (!fetchOnly) {
            EphemeralStore.addLoadingMessagesForChannel(serverUrl, channelId);
        }
        const client = NetworkManager.getClient(serverUrl);
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const isCRTEnabled = await getIsCRTEnabled(database);
        const data = await client.getPostsSince(channelId, since, isCRTEnabled, isCRTEnabled, groupLabel);
        const result = processPostsFetched(data);
        if (!fetchOnly) {
            const models = await operator.handlePosts({
                ...result,
                actionType: ActionType.POSTS.RECEIVED_SINCE,
                prepareRecordsOnly: true,
            });

            const {authors} = await fetchPostAuthors(serverUrl, result.posts, true, groupLabel);
            if (authors?.length) {
                const userModels = await operator.handleUsers({
                    users: authors,
                    prepareRecordsOnly: true,
                });
                models.push(...userModels);
            }

            if (isCRTEnabled) {
                const threadModels = await prepareThreadsFromReceivedPosts(operator, result.posts, false);
                if (threadModels?.length) {
                    models.push(...threadModels);
                }
            }
            await operator.batchRecords(models, 'fetchPostsSince');
        }
        return result;
    } catch (error) {
        logDebug('error on fetchPostsSince', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error as ClientErrorProps);
        return {error};
    } finally {
        if (!fetchOnly) {
            EphemeralStore.stopLoadingMessagesForChannel(serverUrl, channelId);
        }
    }
}

export const fetchPostAuthors = async (serverUrl: string, posts: Post[], fetchOnly = false, groupLabel?: RequestGroupLabel): Promise<AuthorsRequest> => {
    try {
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const client = NetworkManager.getClient(serverUrl);

        const currentUserId = await getCurrentUserId(database);
        const users = await queryAllUsers(database).fetch();
        const existingUserIds = new Set<string>();
        const existingUserNames = new Set<string>();
        let excludeUsername;
        users.forEach((u) => {
            existingUserIds.add(u.id);
            existingUserNames.add(u.username);
            if (u.id === currentUserId) {
                excludeUsername = u.username;
            }
        });

        const usernamesToLoad = getNeededAtMentionedUsernames(existingUserNames, posts, excludeUsername);
        const userIdsToLoad = new Set<string>();
        for (const p of posts) {
            const {user_id} = p;
            if (user_id !== currentUserId) {
                userIdsToLoad.add(user_id);
            }
        }
        const promises: Array<Promise<UserProfile[]>> = [];
        if (userIdsToLoad.size) {
            promises.push(client.getProfilesByIds(Array.from(userIdsToLoad), {}, groupLabel));
        }

        if (usernamesToLoad.size) {
            promises.push(client.getProfilesByUsernames(Array.from(usernamesToLoad), groupLabel));
        }

        if (promises.length) {
            const authorsResult = await Promise.allSettled(promises);
            const result = authorsResult.reduce<UserProfile[][]>((acc, item) => {
                if (item.status === 'fulfilled') {
                    acc.push(item.value);
                }
                return acc;
            }, []);

            const authors = result.flat();
            if (!fetchOnly && authors.length) {
                await operator.handleUsers({
                    users: authors,
                    prepareRecordsOnly: false,
                });
            }

            return {authors};
        }

        return {authors: [] as UserProfile[]};
    } catch (error) {
        logDebug('error on fetchPostAuthors', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

export async function fetchPostThread(serverUrl: string, postId: string, options?: FetchPaginatedThreadOptions, fetchOnly = false, groupLabel?: RequestGroupLabel) {
    try {
        setFetchingThreadState(postId, true);
        const client = NetworkManager.getClient(serverUrl);

        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const isCRTEnabled = await getIsCRTEnabled(database);

        // Not doing any version check as server versions below 6.7 will ignore the additional params from the client.
        const data = await client.getPostThread(postId, {
            collapsedThreads: isCRTEnabled,
            collapsedThreadsExtended: isCRTEnabled,
            ...options,
        }, groupLabel);
        const result = processPostsFetched(data);
        let posts: Model[] = [];
        if (result.posts.length && !fetchOnly) {
            const models: Model[] = [];
            posts = await operator.handlePosts({
                ...result,
                actionType: ActionType.POSTS.RECEIVED_IN_THREAD,
                prepareRecordsOnly: true,
            });
            models.push(...posts);

            const {authors} = await fetchPostAuthors(serverUrl, result.posts, true, groupLabel);
            if (authors?.length) {
                const userModels = await operator.handleUsers({
                    users: authors,
                    prepareRecordsOnly: true,
                });
                models.push(...userModels);
            }

            if (isCRTEnabled) {
                const threadModels = await prepareThreadsFromReceivedPosts(operator, result.posts, true);
                if (threadModels?.length) {
                    models.push(...threadModels);
                }
            }
            await operator.batchRecords(models, 'fetchPostThread');
        }
        setFetchingThreadState(postId, false);
        return {posts: result.posts};
    } catch (error) {
        logDebug('error on fetchPostThread', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        setFetchingThreadState(postId, false);
        return {error};
    }
}

export async function fetchPostsAround(serverUrl: string, channelId: string, postId: string, perPage = General.POST_AROUND_CHUNK_SIZE, isCRTEnabled = false) {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const [after, post, before] = await Promise.all<PostsObjectsRequest>([
            client.getPostsAfter(channelId, postId, 0, perPage, isCRTEnabled, isCRTEnabled),
            client.getPostThread(postId, {
                collapsedThreads: isCRTEnabled,
                collapsedThreadsExtended: isCRTEnabled,
                fetchAll: true,
            }),
            client.getPostsBefore(channelId, postId, 0, perPage, isCRTEnabled, isCRTEnabled),
        ]);

        const preData: PostResponse = {
            posts: {
                ...filterPostsInOrderedArray(after.posts, after.order),
                [postId]: post.posts![postId],
                ...filterPostsInOrderedArray(before.posts, before.order),
            },
            order: [],
        };

        const data = processPostsFetched(preData);

        let posts: Model[] = [];
        const models: Model[] = [];
        if (data.posts?.length) {
            try {
                const {authors} = await fetchPostAuthors(serverUrl, data.posts, true);
                if (authors?.length) {
                    const userModels = await operator.handleUsers({
                        users: authors,
                        prepareRecordsOnly: true,
                    });
                    models.push(...userModels);
                }
            } catch (error) {
                logError('FETCH AUTHORS ERROR', error);
            }

            posts = await operator.handlePosts({
                actionType: ActionType.POSTS.RECEIVED_AROUND,
                ...data,
                prepareRecordsOnly: true,
            });

            models.push(...posts);

            if (isCRTEnabled) {
                const threadModels = await prepareThreadsFromReceivedPosts(operator, data.posts, false);
                if (threadModels?.length) {
                    models.push(...threadModels);
                }
            }
            await operator.batchRecords(models, 'fetchPostsAround');
        }

        return {posts: data.posts};
    } catch (error) {
        logDebug('error on fetchPostsAround', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
}

export async function fetchMissingChannelsFromPosts(serverUrl: string, posts: Post[], fetchOnly = false) {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const channelIds = new Set(await queryAllMyChannel(database).fetchIds());
        const channelPromises: Array<Promise<Channel>> = [];
        const userPromises: Array<Promise<ChannelMembership>> = [];

        posts.forEach((post) => {
            const id = post.channel_id;

            if (!channelIds.has(id)) {
                channelPromises.push(client.getChannel(id));
                userPromises.push(client.getMyChannelMember(id));
            }
        });

        const channels = await Promise.all(channelPromises);
        const channelMemberships = await Promise.all(userPromises);

        if (!fetchOnly && channels.length && channelMemberships.length) {
            const isCRTEnabled = await getIsCRTEnabled(database);
            const modelPromises = prepareMissingChannelsForAllTeams(operator, channels, channelMemberships, isCRTEnabled);
            if (modelPromises.length) {
                const channelModelsArray = await Promise.all(modelPromises);
                if (channelModelsArray.length) {
                    const models = channelModelsArray.flatMap((mdls) => {
                        if (!mdls || mdls.length) {
                            return [];
                        }
                        return mdls;
                    });
                    if (models.length) {
                        await operator.batchRecords(models, 'fetchMissingChannelsFromPosts');
                    }
                }
            }
        }

        return {
            channels,
            channelMemberships,
        };
    } catch (error) {
        logDebug('error on fetchMissingChannelsFromPosts', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
}

export async function fetchPostById(serverUrl: string, postId: string, fetchOnly = false, groupLabel?: RequestGroupLabel) {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const post = await client.getPost(postId, groupLabel);
        if (!fetchOnly) {
            const models: Model[] = [];
            const {authors} = await fetchPostAuthors(serverUrl, [post], true, groupLabel);
            const posts = await operator.handlePosts({
                actionType: ActionType.POSTS.RECEIVED_NEW,
                order: [post.id],
                posts: [post],
                prepareRecordsOnly: true,
            });
            models.push(...posts);

            if (authors?.length) {
                const users = await operator.handleUsers({
                    users: authors,
                    prepareRecordsOnly: true,
                });
                models.push(...users);
            }

            const isCRTEnabled = await getIsCRTEnabled(database);
            if (isCRTEnabled) {
                const threadModels = await prepareThreadsFromReceivedPosts(operator, [post], false);
                if (threadModels?.length) {
                    models.push(...threadModels);
                }
            }

            await operator.batchRecords(models, 'fetchPostById');
        }

        return {post};
    } catch (error) {
        logDebug('error on fetchPostById', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
}

export const togglePinPost = async (serverUrl: string, postId: string) => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const post = await getPostById(database, postId);
        if (post) {
            const isPinned = post.isPinned;
            const request = isPinned ? client.unpinPost : client.pinPost;

            await request(postId);
            await database.write(async () => {
                await post.update((p) => {
                    p.isPinned = !isPinned;
                });
            });
        }
        return {post};
    } catch (error) {
        logDebug('error on togglePinPost', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

export const deletePost = async (serverUrl: string, postToDelete: PostModel | Post) => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        if (postToDelete.type === Post.POST_TYPES.COMBINED_USER_ACTIVITY && postToDelete.props?.system_post_ids) {
            const systemPostIds = getPostIdsForCombinedUserActivityPost(postToDelete.id);
            const promises = systemPostIds.map((id) => client.deletePost(id));
            await Promise.all(promises);
        } else {
            await client.deletePost(postToDelete.id);
        }

        const post = await removePost(serverUrl, postToDelete);
        return {post};
    } catch (error) {
        logDebug('error on deletePost', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

export const deletePostBatch = async (serverUrl: string, batchId: string) => {
    try {
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const client = NetworkManager.getClient(serverUrl);

        // Find all posts with this batch_id.
        // batchId 含下划线（webapp 格式 batch_<ts>_<rand>），而 '_' 是 SQL LIKE 单字符
        // 通配符，必须 sanitize，否则会误匹配其他批次。
        const safeBatchId = sanitizeLikeString(batchId);
        const posts = await database.get('Post').query(
            Q.where('props', Q.like(`%"batch_id":"${safeBatchId}"%`)),
        ).fetch();

        if (posts.length === 0) {
            return {error: 'No posts found for batch'};
        }

        // Delete all posts on server
        const promises = posts.map((p) => client.deletePost(p.id));
        await Promise.all(promises);

        // Remove all posts locally
        for (const p of posts) {
            await removePost(serverUrl, p);
        }

        return {count: posts.length};
    } catch (error) {
        logDebug('error on deletePostBatch', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

export const markPostAsUnread = async (serverUrl: string, postId: string) => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const [userId, post] = await Promise.all([getCurrentUserId(database), getPostById(database, postId)]);
        if (post && userId) {
            await client.markPostAsUnread(userId, postId);
            const {channelId} = post;

            const [channel, channelMember] = await Promise.all([
                client.getChannel(channelId),
                client.getChannelMember(channelId, userId),
            ]);
            if (channel && channelMember) {
                const isCRTEnabled = await getIsCRTEnabled(database);
                let totalMessages = channel.total_msg_count;
                let messages = channelMember.msg_count;
                let mentionCount = channelMember.mention_count;

                if (isCRTEnabled) {
                    totalMessages = channel.total_msg_count_root!;
                    messages = channelMember.msg_count_root!;
                    mentionCount = channelMember.mention_count_root!;
                }

                const messageCount = totalMessages - messages;
                await markChannelAsUnread(serverUrl, channelId, messageCount, mentionCount, post.createAt);
                return {post};
            }
        }
        return {post};
    } catch (error) {
        logDebug('error on markPostAsUnread', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

export const editPost = async (serverUrl: string, postId: string, postMessage: string, file_ids: string[], removed_file_ids: string[]) => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const post = await getPostById(database, postId);
        if (post) {
            const originalFiles = await queryFilesForPost(database, postId).fetch();
            const originalFileIds = originalFiles.map((f) => f.id);

            const {update_at, edit_at, message: updatedMessage, message_source} = await client.patchPost({message: postMessage, id: postId, file_ids});
            await database.write(async () => {
                await post.update((p) => {
                    p.updateAt = update_at;
                    p.editAt = edit_at;
                    p.message = updatedMessage;
                    p.messageSource = message_source || '';
                });
            });

            if (removed_file_ids.length > 0) {
                const filesToDelete = await getFilesByIds(database, removed_file_ids);
                if (filesToDelete.length > 0) {
                    const fileDeleteModels = filesToDelete.map((file) => {
                        file.prepareDestroyPermanently();
                        return file;
                    });
                    await operator.batchRecords(fileDeleteModels, 'delete files');
                }
            }

            const filesChanged = hasArrayChanged(originalFileIds, file_ids);

            if (filesChanged && post.channelId) {
                const channelId = post.channelId;
                fetchChannelStats(serverUrl, channelId);
            }
        }
        return {post};
    } catch (error) {
        logDebug('error on editPost', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

export const revealBoRPost = async (serverUrl: string, postId: string) => {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const post = await getPostById(database, postId);
        if (!post) {
            return {post: undefined};
        }

        const revealedPost = await client.revealBoRPost(postId);
        await operator.handlePosts({
            actionType: ActionType.POSTS.RECEIVED_IN_CHANNEL,
            order: [revealedPost.id],
            posts: [revealedPost],
            prepareRecordsOnly: false,
        });

        return {post};
    } catch (error) {
        logDebug('error on revealBoRPost', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
};

export async function fetchSavedPosts(serverUrl: string, teamId?: string, channelId?: string, page?: number, perPage?: number) {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const userId = await getCurrentUserId(database);
        const data = await client.getSavedPosts(userId, channelId, teamId, page, perPage);
        const posts = data.posts || {};
        const order = data.order || [];
        const postsArray = order.map((id) => posts[id]);

        if (!postsArray.length) {
            return {
                order,
                posts: postsArray,
            };
        }

        const promises: Array<Promise<Model[]>> = [];

        const {authors} = await fetchPostAuthors(serverUrl, postsArray, true);
        const {channels, channelMemberships} = await fetchMissingChannelsFromPosts(serverUrl, postsArray, true);

        if (authors?.length) {
            promises.push(
                operator.handleUsers({
                    users: authors,
                    prepareRecordsOnly: true,
                }),
            );
        }

        if (channels?.length && channelMemberships?.length) {
            const isCRTEnabled = await getIsCRTEnabled(database);
            const channelPromises = prepareMissingChannelsForAllTeams(operator, channels, channelMemberships, isCRTEnabled);
            if (channelPromises.length) {
                promises.push(...channelPromises);
            }
        }

        promises.push(
            operator.handlePosts({
                actionType: '',
                order: [],
                posts: postsArray,
                previousPostId: '',
                prepareRecordsOnly: true,
            }),
        );

        const isCRTEnabled = await getIsCRTEnabled(database);
        if (isCRTEnabled) {
            promises.push(prepareThreadsFromReceivedPosts(operator, postsArray, false));
        }

        const modelArrays = await Promise.all(promises);
        const models = modelArrays.flatMap((mdls) => {
            if (!mdls || !mdls.length) {
                return [];
            }
            return mdls;
        });

        await operator.batchRecords(models, 'fetchSavedPosts');

        return {
            order,
            posts: postsArray,
        };
    } catch (error) {
        logDebug('error on fetchSavedPosts', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
}

export async function fetchPinnedPosts(serverUrl: string, channelId: string) {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const {database, operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);

        const data = await client.getPinnedPosts(channelId);
        const posts = data.posts || {};
        const order = data.order || [];
        const postsArray = order.map((id) => posts[id]);

        if (!postsArray.length) {
            return {
                order,
                posts: postsArray,
            };
        }

        const promises: Array<Promise<Model[]>> = [];
        const isCRTEnabled = await getIsCRTEnabled(database);

        const {authors} = await fetchPostAuthors(serverUrl, postsArray, true);
        const {channels, channelMemberships} = await fetchMissingChannelsFromPosts(serverUrl, postsArray, true);

        if (authors?.length) {
            promises.push(
                operator.handleUsers({
                    users: authors,
                    prepareRecordsOnly: true,
                }),
            );
        }

        if (channels?.length && channelMemberships?.length) {
            const channelPromises = prepareMissingChannelsForAllTeams(operator, channels, channelMemberships, isCRTEnabled);
            if (channelPromises.length) {
                promises.push(...channelPromises);
            }
        }

        promises.push(
            operator.handlePosts({
                actionType: '',
                order: [],
                posts: postsArray,
                previousPostId: '',
                prepareRecordsOnly: true,
            }),
        );

        if (isCRTEnabled) {
            promises.push(prepareThreadsFromReceivedPosts(operator, postsArray, false));
        }

        const modelArrays = await Promise.all(promises);
        const models = modelArrays.flatMap((mdls) => {
            if (!mdls || !mdls.length) {
                return [];
            }
            return mdls;
        });

        await operator.batchRecords(models, 'fetchPinnedPosts');

        return {
            order,
            posts: postsArray,
        };
    } catch (error) {
        logDebug('error on fetchPinnedPosts', getFullErrorMessage(error));
        forceLogoutIfNecessary(serverUrl, error);
        return {error};
    }
}

export async function acknowledgePost(serverUrl: string, postId: string) {
    try {
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const client = NetworkManager.getClient(serverUrl);
        EphemeralStore.setAcknowledgingPost(postId);

        const userId = await getCurrentUserId(database);
        const {acknowledged_at: acknowledgedAt} = await client.acknowledgePost(postId, userId);

        return addPostAcknowledgement(serverUrl, postId, userId, acknowledgedAt, false);
    } catch (error) {
        forceLogoutIfNecessary(serverUrl, error as ClientErrorProps);
        return {error};
    } finally {
        EphemeralStore.unsetAcknowledgingPost(postId);
    }
}

export async function unacknowledgePost(serverUrl: string, postId: string) {
    try {
        const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        const client = NetworkManager.getClient(serverUrl);
        EphemeralStore.setUnacknowledgingPost(postId);
        const userId = await getCurrentUserId(database);
        await client.unacknowledgePost(postId, userId);

        return removePostAcknowledgement(serverUrl, postId, userId, false);
    } catch (error) {
        forceLogoutIfNecessary(serverUrl, error as ClientErrorProps);
        return {error};
    } finally {
        EphemeralStore.unsetUnacknowledgingPost(postId);
    }
}
