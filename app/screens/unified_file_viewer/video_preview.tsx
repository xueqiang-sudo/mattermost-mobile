// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Dimensions, Pressable, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Video, AVPlaybackStatus} from 'expo-av';
import Animated, {FadeIn, FadeOut} from 'react-native-reanimated';

import CompassIcon from '@components/compass_icon';
import {changeOpacity} from '@utils/theme';

type VideoPreviewProps = {
    uri: string;
    onClose: () => void;
};

const {width: SCREEN_WIDTH} = Dimensions.get('window');

const VideoPreview = ({uri, onClose}: VideoPreviewProps) => {
    const [showControls, setShowControls] = useState(true);
    const [isPlaying, setIsPlaying] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const hideTimeoutRef = useRef<NodeJS.Timeout>();
    const videoRef = useRef<Video | null>(null);

    const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
        if (!status || !status.isLoaded) {
            return;
        }
        setIsPlaying(status.isPlaying ?? false);
        setCurrentTime((status.positionMillis ?? 0) / 1000);
        setDuration((status.durationMillis ?? 0) / 1000);
    }, []);

    useEffect(() => {
        // Auto play when mounted
        (async () => {
            try {
                await videoRef.current?.playAsync();
            } catch {
                // ignore
            }
        })();
    }, []);

    const toggleControls = useCallback(() => {
        setShowControls((prev) => !prev);

        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }

        if (!showControls) {
            // Auto hide after 3 seconds
            hideTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        }
    }, [showControls]);

    const togglePlayPause = useCallback(async () => {
        const status = await videoRef.current?.getStatusAsync();
        if (status?.isPlaying) {
            await videoRef.current?.pauseAsync();
            setIsPlaying(false);
        } else {
            await videoRef.current?.playAsync();
            setIsPlaying(true);
        }
    }, []);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const onProgressChange = useCallback(async (value: number) => {
        if (!videoRef.current) return;
        const newTime = (value / 100) * duration;
        try {
            await videoRef.current.setPositionAsync(newTime * 1000);
            setCurrentTime(newTime);
        } catch {
            // ignore
        }
    }, [duration]);

    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []);

    return (
        <View style={styles.container}>
            <Video
                ref={videoRef}
                source={{uri}}
                style={styles.video}
                resizeMode='contain'
                shouldPlay={true}
                isLooping={false}
                onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                useNativeControls={false}
            />

            {/* Tap area to toggle controls */}
            <Pressable style={styles.tapArea} onPress={toggleControls}/>

            {/* Top bar with X button */}
            {showControls && (
                <Animated.View
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(200)}
                    style={styles.topBar}
                >
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <CompassIcon
                            name='close'
                            size={28}
                            color='#fff'
                        />
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* Bottom controls */}
            {showControls && (
                <Animated.View
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(200)}
                    style={styles.bottomBar}
                >
                    {/* Play/Pause button */}
                    <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
                        <CompassIcon
                            name={isPlaying ? 'pause' : 'play'}
                            size={32}
                            color='#fff'
                        />
                    </TouchableOpacity>

                    {/* Progress bar */}
                    <View style={styles.progressContainer}>
                        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                        <View style={styles.progressBar}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`},
                                ]}
                            />
                        </View>
                        <Text style={styles.timeText}>{formatTime(duration)}</Text>
                    </View>
                </Animated.View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    video: {
        flex: 1,
    },
    tapArea: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
    },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: 50,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        zIndex: 2,
    },
    closeButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 40,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        zIndex: 2,
    },
    playButton: {
        alignSelf: 'center',
        marginBottom: 16,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    timeText: {
        color: '#fff',
        fontSize: 12,
        minWidth: 45,
    },
    progressBar: {
        flex: 1,
        height: 3,
        backgroundColor: changeOpacity('#fff', 0.3),
        marginHorizontal: 8,
        borderRadius: 1.5,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#07C160',
    },
});

export default VideoPreview;
