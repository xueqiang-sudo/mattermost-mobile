// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import ProgressBar from '@components/progress_bar';
import {isUploading, subscribeProgress} from '@utils/file/optimistic_upload_progress';

type Props = {
    /** 进度订阅键（乐观发送时为 pending 文件 id）。 */
    progressKey?: string;
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 5,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    barContainer: {
        width: '80%',
    },
});

/**
 * 乐观发送时覆盖在图片/视频缩略图上的上传进度条。
 * 按 clientId 订阅 optimistic_upload_progress，上传完成后自动隐藏。
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

    return (
        <View style={styles.overlay}>
            <View style={styles.barContainer}>
                <ProgressBar
                    color='#FFFFFF'
                    progress={progress}
                />
            </View>
        </View>
    );
};

export default UploadProgressOverlay;
