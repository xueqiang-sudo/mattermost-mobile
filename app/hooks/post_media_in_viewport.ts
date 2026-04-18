// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useState} from 'react';
import {DeviceEventEmitter} from 'react-native';

import {Events} from '@constants';

/**
 * 与 PostList `ITEM_IN_VIEWPORT` 约定一致：`${location}-${postId}`。
 * 用于聊天内图片/视频等仅在进入（或邻近进入）可视区域后再加载网络资源。
 */
export function usePostMediaInViewport(postId: string | undefined, location: string | undefined): boolean {
    const [inViewPort, setInViewPort] = useState(false);

    useEffect(() => {
        if (!postId || location == null || location === '') {
            return undefined;
        }

        const key = `${location}-${postId}`;
        const sub = DeviceEventEmitter.addListener(Events.ITEM_IN_VIEWPORT, (viewableItems: Record<string, boolean>) => {
            if (key in viewableItems) {
                setInViewPort(true);
            }
        });

        return () => sub.remove();
    }, [location, postId]);

    return inViewPort;
}
