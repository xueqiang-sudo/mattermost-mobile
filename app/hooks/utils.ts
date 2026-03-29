// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useMemo, useRef, useState} from 'react';

const DELAY = 300;

/**
 * 防止双击的 hook
 * 特点：
 * 1. 首次点击立即响应
 * 2. 在防抖时间内返回 isDisabled = true，用于 UI 显示禁用状态
 */
export const usePreventDoubleTap = <T extends Function>(callback: T) => {
    const lastTapRef = useRef<number | null>(null);
    const [isDisabled, setIsDisabled] = useState(false);

    const execute = useCallback((...args: unknown[]) => {
        const now = Date.now();

        // 首次点击或超过防抖时间，立即执行
        if (!lastTapRef.current || now - lastTapRef.current >= DELAY) {
            lastTapRef.current = now;
            setIsDisabled(true);
            callback(...args);

            // 防抖时间后恢复可点击状态
            setTimeout(() => {
                setIsDisabled(false);
            }, DELAY);
        }

        // 否则忽略此次点击（防抖）
    }, [callback]);

    return useMemo(() => {
        return Object.assign(execute, {isDisabled});
    }, [execute, isDisabled]);
};

export const useDebounce = <T extends Function>(callback: T, delay: number) => {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const cancel = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
    }, []);

    const execute = useCallback((...args: unknown[]) => {
        cancel();
        timeoutRef.current = setTimeout(() => callback(...args), delay);
    }, [callback, delay, cancel]);

    return useMemo(() => {
        return Object.assign(execute, {cancel});
    }, [execute, cancel]);
};
