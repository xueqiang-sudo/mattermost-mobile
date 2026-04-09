// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {GENERIC_OVERLAY} from '@constants/screens';
import {dismissOverlay, showOverlay} from '@screens/navigation';

export const VIDEO_COMPRESS_OVERLAY_ID = 'video-compress-overlay';

let progressSetter: ((p: number) => void) | undefined;

function setVideoCompressProgressSetter(setter: typeof progressSetter) {
    progressSetter = setter;
}

export function reportVideoCompressProgress(progress: number) {
    progressSetter?.(progress);
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    text: {
        color: '#ffffff',
        marginTop: 16,
        fontSize: 16,
        textAlign: 'center',
        paddingHorizontal: 24,
    },
    sub: {
        color: '#dddddd',
        marginTop: 8,
        fontSize: 13,
    },
});

type BodyProps = {
    message: string;
    progressLabel: string;
};

function VideoCompressOverlayBody({message, progressLabel}: BodyProps) {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        setVideoCompressProgressSetter(setProgress);
        return () => setVideoCompressProgressSetter(undefined);
    }, []);

    const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);

    return (
        <View style={styles.root}>
            <ActivityIndicator
                color='#ffffff'
                size='large'
            />
            <Text style={styles.text}>{message}</Text>
            <Text style={styles.sub}>
                {`${progressLabel}: ${pct}%`}
            </Text>
        </View>
    );
}

export function showVideoCompressOverlay(message: string, progressLabel: string) {
    showOverlay(
        GENERIC_OVERLAY,
        {
            children: (
                <VideoCompressOverlayBody
                    message={message}
                    progressLabel={progressLabel}
                />
            ),
        },
        {overlay: {interceptTouchOutside: true}},
        VIDEO_COMPRESS_OVERLAY_ID,
    );
}

export async function hideVideoCompressOverlay() {
    await dismissOverlay(VIDEO_COMPRESS_OVERLAY_ID);
}
