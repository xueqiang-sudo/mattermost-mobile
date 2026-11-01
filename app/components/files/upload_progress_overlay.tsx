// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';

import {isUploading, subscribeProgress} from '@utils/file/optimistic_upload_progress';

type Props = {
    /** 进度订阅键（乐观发送时为 pending 文件 id）。 */
    progressKey?: string;
};

const SIZE = 56;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ring: {
        width: SIZE,
        height: SIZE,
        transform: [{rotate: '-90deg'}],
    },
});

/**
 * 乐观发送时覆盖在图片/视频缩略图上的上传进度圆圈（微信风格）。
 * 按 progressKey 订阅 optimistic_upload_progress，上传完成后自动隐藏。
 */
const UploadProgressOverlay = ({progressKey}: Props) => {
    const [progress, setProgress] = useState(() => 0);
    const [visible, setVisible] = useState(() => Boolean(progressKey && isUploading(progressKey)));

    useEffect(() => {
        if (!progressKey) {
            setVisible(false);
            return undefined;
        }

        if (!isUploading(progressKey)) {
            setVisible(false);
            return undefined;
        }

        setVisible(true);
        const unsubscribe = subscribeProgress(progressKey, (p) => {
            setProgress(p);
            if (p >= 1) {
                setVisible(false);
            }
        });

        return unsubscribe;
    }, [progressKey]);

    if (!visible) {
        return null;
    }

    const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)));

    return (
        <View style={styles.overlay}>
            <Svg width={SIZE} height={SIZE} style={styles.ring}>
                <Circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    stroke='rgba(255,255,255,0.25)'
                    strokeWidth={STROKE}
                    fill='transparent'
                />
                <Circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    stroke='#FFFFFF'
                    strokeWidth={STROKE}
                    fill='transparent'
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={offset}
                    strokeLinecap='round'
                />
            </Svg>
        </View>
    );
};

export default UploadProgressOverlay;
