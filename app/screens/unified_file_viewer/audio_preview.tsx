// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Dimensions, Pressable, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Audio, AVPlaybackStatus} from 'expo-av';
import Animated, {FadeIn, FadeOut} from 'react-native-reanimated';

import CompassIcon from '@components/compass_icon';
import {changeOpacity} from '@utils/theme';

type AudioPreviewProps = {
    uri: string;
    filename: string;
    onClose: () => void;
};

const {width: SCREEN_WIDTH} = Dimensions.get('window');

const AudioPreview = ({uri, filename, onClose}: AudioPreviewProps) => {
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const hideTimeoutRef = useRef<NodeJS.Timeout>();
    const [showControls, setShowControls] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadAudio = async () => {
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                });

                const {sound: newSound} = await Audio.Sound.createAsync(
                    {uri},
                    {shouldPlay: false},
                    onPlaybackStatusUpdate,
                );

                if (isMounted) {
                    setSound(newSound);
                }
            } catch (error) {
                console.error('Error loading audio:', error);
            }
        };

        loadAudio();

        return () => {
            isMounted = false;
            if (sound) {
                sound.unloadAsync();
            }
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, [uri]);

    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
            return;
        }

        if (status.isLoaded) {
            setCurrentTime(status.positionMillis / 1000);
            setDuration((status.durationMillis || 0) / 1000);
            setIsPlaying(status.isPlaying);
        }
    };

    const togglePlayPause = useCallback(async () => {
        if (!sound) {
            return;
        }

        if (isPlaying) {
            await sound.pauseAsync();
        } else {
            await sound.playAsync();
        }
    }, [sound, isPlaying]);

    const toggleControls = useCallback(() => {
        setShowControls((prev) => !prev);

        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }

        if (!showControls) {
            hideTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        }
    }, [showControls]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <View style={styles.container}>
            {/* Background gradient effect */}
            <View style={styles.background}/>

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
                    <Text style={styles.titleText} numberOfLines={1}>{filename}</Text>
                </Animated.View>
            )}

            {/* Center content */}
            <View style={styles.centerContent}>
                {/* Audio icon */}
                <View style={styles.iconContainer}>
                    <CompassIcon
                        name='music-note'
                        size={80}
                        color='#fff'
                    />
                </View>

                {/* Filename */}
                <Text style={styles.filenameText} numberOfLines={2}>
                    {filename}
                </Text>

                {/* Play/Pause button */}
                <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
                    <CompassIcon
                        name={isPlaying ? 'pause' : 'play'}
                        size={48}
                        color='#fff'
                    />
                </TouchableOpacity>
            </View>

            {/* Bottom controls */}
            {showControls && (
                <Animated.View
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(200)}
                    style={styles.bottomBar}
                >
                    {/* Progress bar */}
                    <View style={styles.progressContainer}>
                        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                        <View style={styles.progressBar}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {width: `${(currentTime / duration) * 100}%`},
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
        backgroundColor: '#1a1a1a',
    },
    background: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#2d2d2d',
        opacity: 0.8,
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
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        zIndex: 2,
    },
    closeButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    titleText: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    iconContainer: {
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
    },
    filenameText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '500',
        textAlign: 'center',
        marginBottom: 40,
    },
    playButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#07C160',
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

export default AudioPreview;
