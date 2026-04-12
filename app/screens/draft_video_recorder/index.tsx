// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {AppState, BackHandler, Platform, StyleSheet, Text, View, type AppStateStatus} from 'react-native';
import {
    Camera,
    useCameraDevice,
    useCameraPermission,
    useMicrophonePermission,
    type VideoFile,
} from 'react-native-vision-camera';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {useTheme} from '@context/theme';
import {dismissModal} from '@screens/navigation';
import {logError} from '@utils/log';
import {makeStyleSheetFromTheme} from '@utils/theme';

import type {DraftVideoRecorderPassProps} from './show_modal';
import type {AvailableScreens} from '@typings/screens/navigation';

const MAX_RECORD_MS = 60_000;

const getStyleSheet = makeStyleSheetFromTheme((_theme: Theme) => ({
    root: {
        flex: 1,
        backgroundColor: '#000000',
    },
    cameraBox: {
        flex: 1,
    },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.select({ios: 52, default: 40}),
        zIndex: 10,
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    timerPill: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    timerText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontVariant: ['tabular-nums'],
    },
    hint: {
        position: 'absolute',
        top: Platform.select({ios: 108, default: 96}),
        alignSelf: 'center',
        paddingHorizontal: 20,
        zIndex: 9,
    },
    hintText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 13,
        textAlign: 'center',
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: Platform.select({ios: 36, default: 24}),
        paddingTop: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
    },
    recordOuter: {
        width: 76,
        height: 76,
        borderRadius: 38,
        borderWidth: 4,
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    recordInner: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: '#E02828',
    },
    recordInnerStop: {
        width: 28,
        height: 28,
        borderRadius: 4,
        backgroundColor: '#E02828',
    },
    permissionBox: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    permissionText: {
        color: '#FFFFFF',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 20,
    },
}));

type Props = DraftVideoRecorderPassProps & {
    componentId: AvailableScreens;
};

function formatCountdown(remainingMs: number): string {
    const s = Math.max(0, Math.ceil(remainingMs / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
}

const DraftVideoRecorder = ({componentId, onVideoRecorded}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const cameraRef = useRef<Camera>(null);
    const recordingEndsAtRef = useRef(0);
    const [position, setPosition] = useState<'back' | 'front'>('back');
    const [isRecording, setIsRecording] = useState(false);
    const [uiTick, setUiTick] = useState(0);
    const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

    const {hasPermission: hasCameraPermission, requestPermission: requestCameraPermission} = useCameraPermission();
    const {hasPermission: hasMicPermission, requestPermission: requestMicPermission} = useMicrophonePermission();

    const device = useCameraDevice(position);

    const isActive = appState === 'active';

    useEffect(() => {
        const sub = AppState.addEventListener('change', setAppState);
        return () => sub.remove();
    }, []);

    // Prompt for microphone once camera is allowed so recordings include audio when the user accepts.
    useEffect(() => {
        if (!hasCameraPermission || hasMicPermission || isRecording) {
            return;
        }
        void requestMicPermission();
    }, [hasCameraPermission, hasMicPermission, isRecording, requestMicPermission]);

    const closeModal = useCallback(async () => {
        await dismissModal({componentId});
    }, [componentId]);

    const handleHardwareBack = useCallback(() => {
        if (isRecording) {
            void cameraRef.current?.cancelRecording();
            return true;
        }
        void closeModal();
        return true;
    }, [closeModal, isRecording]);

    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
        return () => sub.remove();
    }, [handleHardwareBack]);

    useEffect(() => {
        if (!isRecording) {
            return;
        }
        const id = setInterval(() => {
            setUiTick((n) => n + 1);
            if (Date.now() >= recordingEndsAtRef.current) {
                void cameraRef.current?.stopRecording();
            }
        }, 200);
        return () => clearInterval(id);
    }, [isRecording]);

    const remainingMs = useMemo(() => {
        if (!isRecording) {
            return MAX_RECORD_MS;
        }
        return Math.max(0, recordingEndsAtRef.current - Date.now());
        // eslint-disable-next-line react-hooks/exhaustive-deps -- uiTick drives recompute while recording
    }, [isRecording, uiTick]);

    const startRecording = useCallback(() => {
        const cam = cameraRef.current;
        if (!cam) {
            return;
        }
        recordingEndsAtRef.current = Date.now() + MAX_RECORD_MS;
        setIsRecording(true);
        // Audio is muxed when <Camera audio={true} /> and microphone permission is granted (VisionCamera 4).
        cam.startRecording({
            flash: 'off',
            fileType: Platform.OS === 'ios' ? 'mov' : 'mp4',
            videoCodec: 'h264',
            onRecordingError: (error) => {
                setIsRecording(false);
                if (error.code === 'capture/recording-canceled') {
                    void closeModal();
                    return;
                }
                logError('[DraftVideoRecorder] recording error', error);
            },
            onRecordingFinished: (video: VideoFile) => {
                setIsRecording(false);
                void (async () => {
                    await dismissModal({componentId});
                    onVideoRecorded(video);
                })();
            },
        });
    }, [closeModal, componentId, onVideoRecorded]);

    const stopRecording = useCallback(async () => {
        try {
            await cameraRef.current?.stopRecording();
        } catch (e) {
            logError('[DraftVideoRecorder.stopRecording]', e);
            setIsRecording(false);
        }
    }, []);

    const cancelRecording = useCallback(async () => {
        try {
            await cameraRef.current?.cancelRecording();
        } catch (e) {
            logError('[DraftVideoRecorder.cancelRecording]', e);
            setIsRecording(false);
        }
    }, []);

    const handleClosePress = useCallback(() => {
        if (isRecording) {
            void cancelRecording();
            return;
        }
        void closeModal();
    }, [cancelRecording, closeModal, isRecording]);

    const handleRecordPress = useCallback(() => {
        if (isRecording) {
            void stopRecording();
        } else {
            startRecording();
        }
    }, [isRecording, startRecording, stopRecording]);

    const flipCamera = useCallback(() => {
        if (isRecording) {
            return;
        }
        setPosition((p) => (p === 'back' ? 'front' : 'back'));
    }, [isRecording]);

    if (!hasCameraPermission) {
        return (
            <View style={styles.root}>
                <View style={styles.permissionBox}>
                    <Text style={styles.permissionText}>
                        {intl.formatMessage({
                            id: 'mobile.draft_video_recorder.camera_permission',
                            defaultMessage: 'Camera access is required to record video.',
                        })}
                    </Text>
                    <TouchableWithFeedback
                        onPress={() => void requestCameraPermission()}
                        type='opacity'
                    >
                        <Text style={styles.permissionText}>
                            {intl.formatMessage({
                                id: 'mobile.draft_video_recorder.grant_camera',
                                defaultMessage: 'Allow camera access',
                            })}
                        </Text>
                    </TouchableWithFeedback>
                </View>
            </View>
        );
    }

    if (!device) {
        return (
            <View style={styles.root}>
                <View style={[styles.topBar, {justifyContent: 'flex-start'}]}>
                    <TouchableWithFeedback
                        onPress={handleClosePress}
                        type='opacity'
                    >
                        <View style={styles.iconButton}>
                            <CompassIcon
                                name='close'
                                size={26}
                                color='#FFFFFF'
                            />
                        </View>
                    </TouchableWithFeedback>
                </View>
                <View style={styles.permissionBox}>
                    <Loading color='#FFFFFF'/>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <View style={styles.cameraBox}>
                <Camera
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={isActive}
                    video={true}
                    audio={hasMicPermission}
                    photo={false}
                    enableZoomGesture={false}
                />
            </View>

            <View style={styles.topBar}>
                <TouchableWithFeedback
                    onPress={handleClosePress}
                    type='opacity'
                >
                    <View style={styles.iconButton}>
                        <CompassIcon
                            name='close'
                            size={26}
                            color='#FFFFFF'
                        />
                    </View>
                </TouchableWithFeedback>
                <View style={styles.timerPill}>
                    <Text style={styles.timerText}>
                        {formatCountdown(remainingMs)}
                    </Text>
                </View>
                <TouchableWithFeedback
                    onPress={flipCamera}
                    disabled={isRecording}
                    type='opacity'
                >
                    <View style={[styles.iconButton, isRecording && {opacity: 0.35}]}>
                        <CompassIcon
                            name='sync'
                            size={24}
                            color='#FFFFFF'
                        />
                    </View>
                </TouchableWithFeedback>
            </View>

            <View style={styles.hint}>
                <Text style={styles.hintText}>
                    {intl.formatMessage({
                        id: 'mobile.draft_video_recorder.hint',
                        defaultMessage: 'Up to 1 minute. Tap stop when done, or close to discard.',
                    })}
                </Text>
                {!hasMicPermission && (
                    <TouchableWithFeedback
                        onPress={() => void requestMicPermission()}
                        type='opacity'
                    >
                        <Text style={[styles.hintText, {marginTop: 8}]}>
                            {intl.formatMessage({
                                id: 'mobile.draft_video_recorder.mic_permission',
                                defaultMessage: 'Tap to enable microphone for audio in your video.',
                            })}
                        </Text>
                    </TouchableWithFeedback>
                )}
            </View>

            <View style={styles.bottomBar}>
                <TouchableWithFeedback
                    onPress={handleRecordPress}
                    testID='draft_video_recorder.record'
                    type='opacity'
                >
                    <View style={styles.recordOuter}>
                        {isRecording ? (
                            <View style={styles.recordInnerStop}/>
                        ) : (
                            <View style={styles.recordInner}/>
                        )}
                    </View>
                </TouchableWithFeedback>
            </View>
        </View>
    );
};

export default DraftVideoRecorder;
