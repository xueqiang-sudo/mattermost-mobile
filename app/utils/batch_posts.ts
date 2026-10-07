// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {DeviceEventEmitter} from 'react-native';

import {deletePost} from '@actions/remote/post';
import {Events} from '@constants';
import DatabaseManager from '@database/manager';
import {logDebug} from '@utils/log';

type BatchInfo = {
    batchId: string;
    postIds: string[];
    channelId: string;
    timestamp: number;
}

// Store recent batches for undo functionality
const recentBatches: Map<string, BatchInfo> = new Map();
const BATCH_EXPIRY_TIME = 30000; // 30 seconds

/**
 * Store a batch for undo functionality
 */
export const storeBatchForUndo = (batchId: string, postIds: string[], channelId: string) => {
    const batchInfo: BatchInfo = {
        batchId,
        postIds,
        channelId,
        timestamp: Date.now(),
    };
    recentBatches.set(batchId, batchInfo);
    logDebug('BATCH_UNDO', `Stored batch ${batchId} with ${postIds.length} posts`);

    // Auto-remove after expiry time
    setTimeout(() => {
        recentBatches.delete(batchId);
        logDebug('BATCH_UNDO', `Batch ${batchId} expired`);
    }, BATCH_EXPIRY_TIME);
};

/**
 * Get the most recent batch for a channel
 */
export const getRecentBatch = (channelId: string): BatchInfo | undefined => {
    const now = Date.now();
    for (const batch of recentBatches.values()) {
        if (batch.channelId === channelId && (now - batch.timestamp) < BATCH_EXPIRY_TIME) {
            return batch;
        }
    }
    return undefined;
};

/**
 * Get batch info by batchId
 */
export const getBatchById = (batchId: string): BatchInfo | undefined => {
    const batch = recentBatches.get(batchId);
    if (batch && (Date.now() - batch.timestamp) < BATCH_EXPIRY_TIME) {
        return batch;
    }
    return undefined;
};

/**
 * Delete a single post from a batch
 */
export const deletePostFromBatch = async (serverUrl: string, postId: string) => {
    try {
        const operator = DatabaseManager.serverDatabases[serverUrl]?.operator;
        if (!operator) {
            logDebug('BATCH_UNDO', `Database not found for ${serverUrl}`);
            return {error: 'Database not found'};
        }

        const database = operator.database;
        const post = await database.get('Post').find(postId);

        if (!post) {
            logDebug('BATCH_UNDO', `Post ${postId} not found`);
            return {error: 'Post not found'};
        }

        // Delete the post
        await deletePost(serverUrl, post);
        logDebug('BATCH_UNDO', `Deleted post ${postId}`);

        return {data: true};
    } catch (error) {
        logDebug('BATCH_UNDO', `Error deleting post ${postId}: ${error}`);
        return {error};
    }
};

/**
 * Delete all posts in a batch
 */
export const deleteBatchPosts = async (serverUrl: string, batchId: string) => {
    try {
        const batch = recentBatches.get(batchId);
        if (!batch) {
            logDebug('BATCH_UNDO', `Batch ${batchId} not found`);
            return {error: 'Batch not found'};
        }

        logDebug('BATCH_UNDO', `Deleting batch ${batchId} with ${batch.postIds.length} posts`);

        // Delete all posts in parallel
        const deletePromises = batch.postIds.map(postId =>
            deletePostFromBatch(serverUrl, postId)
        );

        await Promise.all(deletePromises);

        // Remove batch from storage
        recentBatches.delete(batchId);

        logDebug('BATCH_UNDO', `Batch ${batchId} deleted successfully`);
        return {data: true};
    } catch (error) {
        logDebug('BATCH_UNDO', `Error deleting batch ${batchId}: ${error}`);
        return {error};
    }
};

/**
 * Update batch after a post is deleted
 */
export const removePostFromBatch = (batchId: string, postId: string) => {
    const batch = recentBatches.get(batchId);
    if (batch) {
        batch.postIds = batch.postIds.filter(id => id !== postId);
        if (batch.postIds.length === 0) {
            recentBatches.delete(batchId);
            logDebug('BATCH_UNDO', `Batch ${batchId} is now empty, removed`);
        } else {
            logDebug('BATCH_UNDO', `Removed post ${postId} from batch ${batchId}, ${batch.postIds.length} posts remaining`);
        }
    }
};
