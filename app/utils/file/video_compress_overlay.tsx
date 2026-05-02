// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Platform, StyleSheet, Text, View} from 'react-native';

import ProgressBar from '@components/progress_bar';
import {GENERIC_OVERLAY} from '@constants/screens';
import {useTheme} from '@context/theme';
import {dismissOverlay, showOverlay} from '@screens/navigation';

export const VIDEO_COMPRESS_OVERLAY_ID = 'video-compress-overlay';

let progressSetter: ((p: number) => void) | undefined;
let messageSetter: ((m: string) => void) | undefined;

/** Only forward progress to the full-screen overlay while it is active (avoids stray UI updates when compress runs inline in draft). */
let overlaySessionActive = false;

function setVideoCompressProgressSetter(setter: typeof progressSetter) {
    progressSetter = setter;
}

function setVideoCompressMessageSetter(setter: typeof messageSetter) {
    messageSetter = setter;
}

export function reportVideoCompressProgress(progress: number) {
    if (!overlaySessionActive) {
        return;
    }
    progressSetter?.(progress);
}

export function reportVideoCompressOverlayMessage(message: string) {
    if (!overlaySessionActive) {
        return;
    }
    messageSetter?.(message);
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
    barWrap: {
        width: 280,
        marginTop: 20,
        alignSelf: 'center',
    },
    androidBarTrack: {
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.16)',
    },
    androidBarFill: {
        height: 4,
        borderRadius: 2,
    },
    sub: {
        color: '#dddddd',
        marginTop: 10,
        fontSize: 13,
    },
});

type BodyProps = {
    message: string;
    progressLabel: string;
};

/** Avoid Reanimated `ProgressBar` in full-screen overlay on Android (ReanimatedNativeHierarchyManager crashes). */
function AndroidLinearProgress({progress, color}: {progress: number; color: string}) {
    const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
    return (
        <View style={styles.androidBarTrack}>
            <View
                style={[
                    styles.androidBarFill,
                    {width: `${pct}%`, backgroundColor: color},
                ]}
            />
        </View>
    );
}

function VideoCompressOverlayBody({message: initialMessage, progressLabel}: BodyProps) {
    const theme = useTheme();
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState(initialMessage);

    useEffect(() => {
        setVideoCompressProgressSetter(setProgress);
        setVideoCompressMessageSetter(setMessage);
        return () => {
            setVideoCompressProgressSetter(undefined);
            setVideoCompressMessageSetter(undefined);
        };
    }, []);

    const clamped = Math.min(1, Math.max(0, progress));
    const pct = Math.round(clamped * 100);

    return (
        <View style={styles.root}>
            <ActivityIndicator
                color='#ffffff'
                size='large'
            />
            <Text style={styles.text}>{message}</Text>
            <View style={styles.barWrap}>
                {Platform.OS === 'android' ? (
                    <AndroidLinearProgress
                        progress={clamped}
                        color={theme.buttonBg || '#ffffff'}
                    />
                ) : (
                    <ProgressBar
                        progress={clamped}
                        color={theme.buttonBg || '#ffffff'}
                    />
                )}
            </View>
            <Text style={styles.sub}>
                {`${progressLabel}: ${pct}%`}
            </Text>
        </View>
    );
}

export function showVideoCompressOverlay(message: string, progressLabel: string) {
    overlaySessionActive = true;
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
    overlaySessionActive = false;
    await dismissOverlay(VIDEO_COMPRESS_OVERLAY_ID);
}
