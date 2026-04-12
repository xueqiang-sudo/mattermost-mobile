// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {AppState, BackHandler, Platform, StyleSheet, Text, useWindowDimensions, View, type AppStateStatus} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Svg, {Circle, Path} from 'react-native-svg';
import Reanimated, {clamp, runOnJS, useAnimatedProps, useAnimatedReaction, useSharedValue} from 'react-native-reanimated';
import {
    Camera,
    useCameraDevice,
    useCameraFormat,
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
/** Usage hint auto-hides so the camera preview stays unobstructed. */
const HINT_AUTO_HIDE_MS = 4_500;
/** Shorter toast after recording starts (user already saw the idle hint). */
const RECORDING_HINT_AUTO_HIDE_MS = 3_800;

/**
 * >1: same finger spread maps to a larger zoom delta (exponent on pinch scale).
 * VisionCamera maps zoom in log-like fashion; this makes the gesture feel immediate.
 */
const PINCH_ZOOM_EXPONENT = 1.48;

Reanimated.addWhitelistedNativeProps({zoom: true});
const ReanimatedCamera = Reanimated.createAnimatedComponent(Camera);

/** Record button outer diameter (progress ring matches this). */
const RECORD_BTN_SIZE = 84;
const RECORD_RING_STROKE = 4;
const RECORD_RING_RADIUS = (RECORD_BTN_SIZE - RECORD_RING_STROKE) / 2;
const RECORD_RING_C = 2 * Math.PI * RECORD_RING_RADIUS;

/** Matches `hint` left+right inset; pill may use full width between margins. */
const HINT_HORIZONTAL_INSET = 32;
/** Upper cap so hint lines do not span unreasonably wide on tablet/landscape. */
const HINT_PILL_MAX_WIDTH_CAP = 640;

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
    zoomIndicator: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.38)',
        backgroundColor: 'rgba(0,0,0,0.18)',
        alignSelf: 'center',
    },
    zoomIndicatorText: {
        color: 'rgba(255,255,255,0.92)',
        fontSize: 13,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
        letterSpacing: 0.4,
    },
    hint: {
        position: 'absolute',
        left: 16,
        right: 16,
        top: Platform.select({ios: 108, default: 96}),
        alignItems: 'center',
        zIndex: 9,
    },
    micNudgeWrap: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: RECORD_BTN_SIZE + 16 + Platform.select({ios: 36, default: 24}) + 10,
        alignItems: 'center',
        zIndex: 8,
    },
    micNudgePill: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.52)',
    },
    micNudgeText: {
        color: 'rgba(255,255,255,0.88)',
        fontSize: 12,
        textAlign: 'center',
    },
    hintPill: {
        alignSelf: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    hintTitle: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
        flexShrink: 0,
    },
    hintSubtitle: {
        color: 'rgba(255,255,255,0.78)',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 4,
        flexShrink: 0,
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
        gap: 24,
    },
    bottomSideSlot: {
        width: 52,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recordTouch: {
        width: RECORD_BTN_SIZE,
        height: RECORD_BTN_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recordIdleOuter: {
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
        backgroundColor: '#FFFFFF',
    },
    recordRingSvg: {
        ...StyleSheet.absoluteFillObject,
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
    const {width: windowWidth} = useWindowDimensions();
    const hintPillMaxWidth = useMemo(
        () => Math.min(Math.max(0, windowWidth - HINT_HORIZONTAL_INSET), HINT_PILL_MAX_WIDTH_CAP),
        [windowWidth],
    );
    const cameraRef = useRef<Camera>(null);
    const recordingEndsAtRef = useRef(0);
    const isRecordingRef = useRef(false);
    const leavingRecorderDueToLifecycleRef = useRef(false);
    const [position, setPosition] = useState<'back' | 'front'>('back');
    const [isRecording, setIsRecording] = useState(false);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);
    const [uiTick, setUiTick] = useState(0);
    const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
    const [torchOn, setTorchOn] = useState(false);
    const [zoomLabel, setZoomLabel] = useState('1×');
    const [hintVisible, setHintVisible] = useState(true);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    const {hasPermission: hasCameraPermission, requestPermission: requestCameraPermission} = useCameraPermission();
    const {hasPermission: hasMicPermission, requestPermission: requestMicPermission} = useMicrophonePermission();

    const device = useCameraDevice(position);
    const format = useCameraFormat(device, [
        {fps: 30},
    ]);

    const zoom = useSharedValue(1);
    const pinchStartZoom = useSharedValue(1);
    const neutralZoomSv = useSharedValue(1);

    const syncZoomLabel = useCallback((rel: number) => {
        let s: string;
        if (Math.abs(rel - 1) < 0.06) {
            s = '1×';
        } else if (Math.abs(rel - Math.round(rel)) < 0.06) {
            s = `${Math.round(rel)}×`;
        } else {
            s = `${rel.toFixed(1)}×`;
        }
        setZoomLabel(s);
    }, []);

    useEffect(() => {
        if (device == null) {
            return;
        }
        zoom.value = device.neutralZoom;
        neutralZoomSv.value = device.neutralZoom;
        setZoomLabel('1×');
    }, [device, zoom, neutralZoomSv]);

    const pinchGesture = useMemo(() => {
        if (device == null) {
            return Gesture.Pinch().enabled(false);
        }
        const minZ = device.minZoom;
        const maxZ = device.maxZoom;
        return Gesture.Pinch()
            .onBegin(() => {
                pinchStartZoom.value = zoom.value;
            })
            .onUpdate((e) => {
                'worklet';
                const next = pinchStartZoom.value * (e.scale ** PINCH_ZOOM_EXPONENT);
                zoom.value = clamp(next, minZ, maxZ);
            });
    }, [device]);

    const animatedProps = useAnimatedProps(() => ({zoom: zoom.value}));

    useAnimatedReaction(
        () => {
            const n = neutralZoomSv.value;
            if (n <= 0) {
                return 50;
            }
            return Math.round((zoom.value / n) * 50);
        },
        (curr, prev) => {
            if (curr === prev) {
                return;
            }
            const n = neutralZoomSv.value;
            const rel = n > 0 ? curr / 50 : 1;
            runOnJS(syncZoomLabel)(rel);
        },
        [syncZoomLabel],
    );

    const isActive = appState === 'active';
    /** LED must be off while not fully foreground (lock / app switcher), independent of React torch toggle state. */
    const torchHardwareOn = torchOn && appState === 'active';

    const canUseTorch = Boolean(device?.hasTorch && position === 'back');

    useEffect(() => {
        if (!canUseTorch && torchOn) {
            setTorchOn(false);
        }
    }, [canUseTorch, torchOn]);

    // Prompt for microphone once camera is allowed so recordings include audio when the user accepts.
    useEffect(() => {
        if (!hasCameraPermission || hasMicPermission || isRecording) {
            return;
        }
        void requestMicPermission();
    }, [hasCameraPermission, hasMicPermission, isRecording, requestMicPermission]);

    useEffect(() => {
        if (!device || !hintVisible) {
            return;
        }
        const ms = isRecording ? RECORDING_HINT_AUTO_HIDE_MS : HINT_AUTO_HIDE_MS;
        const id = setTimeout(() => setHintVisible(false), ms);
        return () => clearTimeout(id);
    }, [device, hintVisible, isRecording]);

    useEffect(() => {
        if (!isRecording) {
            return;
        }
        setHintVisible(true);
    }, [isRecording]);

    const closeModal = useCallback(async () => {
        setTorchOn(false);
        await dismissModal({componentId});
    }, [componentId]);

    const closeModalRef = useRef(closeModal);
    closeModalRef.current = closeModal;

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            appStateRef.current = next;
            setAppState(next);

            const leaveRecorder = () => {
                if (leavingRecorderDueToLifecycleRef.current) {
                    return;
                }
                leavingRecorderDueToLifecycleRef.current = true;
                setTorchOn(false);
                if (isRecordingRef.current) {
                    void cameraRef.current?.cancelRecording();
                }
                void closeModalRef.current();
            };

            // Resume: allow a new lifecycle exit if this screen instance is still mounted (e.g. rare dismiss failure).
            if (next === 'active') {
                leavingRecorderDueToLifecycleRef.current = false;
                return;
            }

            // `inactive` usually fires while JS still runs (lock, app switcher, control center), before `background`.
            // If we only react on `background`, the bridge may stall and torch stays on until unlock — fix by exiting here.
            if (next === 'inactive') {
                leaveRecorder();
                return;
            }
            if (next === 'background') {
                leaveRecorder();
            }
        });
        return () => sub.remove();
    }, []);

    const handleHardwareBack = useCallback(() => {
        if (isRecording) {
            setTorchOn(false);
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

    const recordingProgress = useMemo(() => {
        if (!isRecording) {
            return 0;
        }
        return Math.min(1, Math.max(0, 1 - remainingMs / MAX_RECORD_MS));
    }, [isRecording, remainingMs]);

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
                setTorchOn(false);
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
        setTorchOn(false);
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
        setTorchOn(false);
        setPosition((p) => (p === 'back' ? 'front' : 'back'));
    }, [isRecording]);

    const toggleTorch = useCallback(() => {
        if (!canUseTorch || appState !== 'active') {
            return;
        }
        setTorchOn((v) => !v);
    }, [appState, canUseTorch]);

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

    const ringDashOffset = RECORD_RING_C * (1 - recordingProgress);

    return (
        <View style={styles.root}>
            <View style={styles.cameraBox} collapsable={false}>
                <GestureDetector gesture={pinchGesture}>
                    <ReanimatedCamera
                        ref={cameraRef}
                        collapsable={false}
                        style={StyleSheet.absoluteFill}
                        device={device}
                        format={format}
                        isActive={isActive}
                        video={true}
                        audio={hasMicPermission}
                        photo={false}
                        enableZoomGesture={false}
                        animatedProps={animatedProps}
                        torch={torchHardwareOn ? 'on' : 'off'}
                    />
                </GestureDetector>
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

            {hintVisible && (
                <View style={styles.hint}>
                    <View style={[styles.hintPill, {maxWidth: hintPillMaxWidth}]}>
                        <TouchableWithFeedback
                            onPress={() => setHintVisible(false)}
                            type='opacity'
                            accessibilityRole='button'
                            accessibilityLabel={intl.formatMessage({
                                id: 'mobile.draft_video_recorder.hint_dismiss_a11y',
                                defaultMessage: 'Tap to hide these tips',
                            })}
                        >
                            <View>
                                <Text style={styles.hintTitle}>
                                    {intl.formatMessage({
                                        id: 'mobile.draft_video_recorder.hint_title',
                                        defaultMessage: 'Up to 1 minute',
                                    })}
                                </Text>
                                <Text style={styles.hintSubtitle}>
                                    {intl.formatMessage(
                                        isRecording ?
                                            {
                                                id: 'mobile.draft_video_recorder.hint_subtitle',
                                                defaultMessage: 'Tap the button below to stop and save. Close to discard.',
                                            } :
                                            {
                                                id: 'mobile.draft_video_recorder.hint_subtitle_idle',
                                                defaultMessage: 'Tap the button below to start recording. Pinch to zoom. Close to exit.',
                                            },
                                    )}
                                </Text>
                            </View>
                        </TouchableWithFeedback>
                        {!hasMicPermission && (
                            <TouchableWithFeedback
                                onPress={() => void requestMicPermission()}
                                type='opacity'
                            >
                                <Text style={[styles.hintSubtitle, {marginTop: 8}]}>
                                    {intl.formatMessage({
                                        id: 'mobile.draft_video_recorder.mic_permission',
                                        defaultMessage: 'Tap to enable microphone for audio in your video.',
                                    })}
                                </Text>
                            </TouchableWithFeedback>
                        )}
                    </View>
                </View>
            )}

            {!hintVisible && !hasMicPermission && !isRecording && (
                <View style={styles.micNudgeWrap} pointerEvents='box-none'>
                    <TouchableWithFeedback
                        onPress={() => void requestMicPermission()}
                        type='opacity'
                    >
                        <View style={[styles.micNudgePill, {maxWidth: hintPillMaxWidth}]}>
                            <Text style={styles.micNudgeText}>
                                {intl.formatMessage({
                                    id: 'mobile.draft_video_recorder.mic_permission',
                                    defaultMessage: 'Tap to enable microphone for audio in your video.',
                                })}
                            </Text>
                        </View>
                    </TouchableWithFeedback>
                </View>
            )}

            <View style={styles.bottomBar}>
                <View style={styles.bottomSideSlot}>
                    {canUseTorch && (
                        <TouchableWithFeedback
                            onPress={toggleTorch}
                            type='opacity'
                            testID='draft_video_recorder.torch'
                        >
                            <View style={styles.iconButton}>
                                <Svg
                                    width={22}
                                    height={22}
                                    viewBox='0 0 24 24'
                                >
                                    <TorchGlyph
                                        fill={torchHardwareOn ? '#FFD54F' : '#FFFFFF'}
                                    />
                                </Svg>
                            </View>
                        </TouchableWithFeedback>
                    )}
                </View>

                <TouchableWithFeedback
                    onPress={handleRecordPress}
                    testID='draft_video_recorder.record'
                    type='opacity'
                >
                    <View style={styles.recordTouch}>
                        {isRecording && (
                            <Svg
                                style={styles.recordRingSvg}
                                width={RECORD_BTN_SIZE}
                                height={RECORD_BTN_SIZE}
                            >
                                <Circle
                                    cx={RECORD_BTN_SIZE / 2}
                                    cy={RECORD_BTN_SIZE / 2}
                                    r={RECORD_RING_RADIUS}
                                    stroke='rgba(255,255,255,0.28)'
                                    strokeWidth={RECORD_RING_STROKE}
                                    fill='none'
                                />
                                <Circle
                                    cx={RECORD_BTN_SIZE / 2}
                                    cy={RECORD_BTN_SIZE / 2}
                                    r={RECORD_RING_RADIUS}
                                    stroke='#FFFFFF'
                                    strokeWidth={RECORD_RING_STROKE}
                                    fill='none'
                                    strokeDasharray={`${RECORD_RING_C}`}
                                    strokeDashoffset={ringDashOffset}
                                    strokeLinecap='round'
                                    transform={`rotate(-90 ${RECORD_BTN_SIZE / 2} ${RECORD_BTN_SIZE / 2})`}
                                />
                            </Svg>
                        )}
                        {isRecording ? (
                            <View style={styles.recordInnerStop}/>
                        ) : (
                            <View style={styles.recordIdleOuter}>
                                <View style={styles.recordInner}/>
                            </View>
                        )}
                    </View>
                </TouchableWithFeedback>

                <View style={styles.bottomSideSlot}>
                    <View
                        style={styles.zoomIndicator}
                        pointerEvents='none'
                        testID='draft_video_recorder.zoom_badge'
                    >
                        <Text style={styles.zoomIndicatorText}>{zoomLabel}</Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

/** Lightning / torch glyph (24 viewBox). */
function TorchGlyph({fill}: {fill: string}) {
    return (
        <Path
            d='M7 2v11h3v9l7-12h-4l4-8H7z'
            fill={fill}
        />
    );
}

export default DraftVideoRecorder;
