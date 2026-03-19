// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useRef} from 'react';
import {Navigation} from 'react-native-navigation';

/**
 * 监听 RNN：当 `watchedComponentId` 对应的屏幕即将展示时执行 callback。
 * 典型场景：从 Modal 返回后，底层屏（如 Home）或当前屏会收到 willAppear。
 * `watchedComponentId` 为空时不注册监听。
 */
export function useOnComponentWillAppear(
    watchedComponentId: string | undefined,
    callback: () => void,
): void {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        if (!watchedComponentId) {
            return;
        }
        const listener = Navigation.events().registerComponentWillAppearListener(({componentId}) => {
            if (componentId !== watchedComponentId) {
                return;
            }
            callbackRef.current();
        });
        return () => listener.remove();
    }, [watchedComponentId]);
}
