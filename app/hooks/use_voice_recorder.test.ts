// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, renderHook} from '@testing-library/react-hooks';

import {useVoiceRecorder} from './use_voice_recorder';

const mockRequestMultiple = jest.fn();
const mockSetAudioModeAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('react-native-permissions', () => ({
    PERMISSIONS: {
        IOS: {MICROPHONE: 'ios.permission'},
        ANDROID: {RECORD_AUDIO: 'android.permission'},
    },
    RESULTS: {GRANTED: 'granted'},
    requestMultiple: (...args: unknown[]) => mockRequestMultiple(...args),
}));

jest.mock('react-native-reanimated', () => ({
    useSharedValue: (value: number) => ({value}),
}));

jest.mock('expo-file-system', () => ({
    getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
    deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

const mockRecordingFactory = jest.fn();

jest.mock('expo-av', () => ({
    Audio: {
        setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
        RecordingOptionsPresets: {
            HIGH_QUALITY: {
                android: {extension: '.m4a'},
                ios: {extension: '.m4a'},
            },
        },
        AndroidOutputFormat: {
            THREE_GPP: 'THREE_GPP',
        },
        AndroidAudioEncoder: {
            AMR_NB: 'AMR_NB',
        },
        IOSOutputFormat: {
            MPEG4AAC: 'MPEG4AAC',
        },
        Recording: jest.fn(() => mockRecordingFactory()),
    },
}));

const createRecordingMock = (overrides?: Partial<Record<keyof ReturnType<typeof baseRecording>, unknown>>) => {
    const mock = baseRecording();
    Object.assign(mock, overrides);
    return mock;
};

const baseRecording = () => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    setProgressUpdateInterval: jest.fn(),
    startAsync: jest.fn().mockResolvedValue(undefined),
    setOnRecordingStatusUpdate: jest.fn(),
    stopAndUnloadAsync: jest.fn().mockResolvedValue({durationMillis: 1000}),
    getURI: jest.fn().mockReturnValue('file:///tmp/voice.aac'),
});

describe('useVoiceRecorder', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRequestMultiple.mockResolvedValue({
            'ios.permission': 'granted',
            'android.permission': 'granted',
        });
        mockGetInfoAsync.mockResolvedValue({size: 1234});
        mockDeleteAsync.mockResolvedValue(undefined);
        mockSetAudioModeAsync.mockResolvedValue(undefined);
    });

    it('should return permission_denied when microphone permission is rejected', async () => {
        mockRequestMultiple.mockResolvedValue({
            'ios.permission': 'denied',
            'android.permission': 'denied',
        });
        const onRecorded = jest.fn();
        const onError = jest.fn();
        const {result} = renderHook(() => useVoiceRecorder(onRecorded, onError));

        await act(async () => {
            await result.current.startRecording();
        });

        expect(onError).toHaveBeenCalledWith('permission_denied');
        expect(onRecorded).not.toHaveBeenCalled();
    });

    it('should recover and record successfully after first start failure', async () => {
        const onRecorded = jest.fn();
        const onError = jest.fn();
        const firstRecording = createRecordingMock({
            prepareToRecordAsync: jest.fn().mockRejectedValue(new Error('prepare failed')),
        });
        const secondRecording = createRecordingMock();

        mockRecordingFactory.
            mockReturnValueOnce(firstRecording).
            mockReturnValueOnce(secondRecording);

        const dateNowSpy = jest.spyOn(Date, 'now');
        dateNowSpy.
            mockReturnValueOnce(1000).
            mockReturnValueOnce(2500);

        const {result} = renderHook(() => useVoiceRecorder(onRecorded, onError));

        await act(async () => {
            await result.current.startRecording();
        });
        expect(onError).toHaveBeenCalledWith('record_failed');

        await act(async () => {
            await result.current.startRecording();
            await result.current.stopRecordingAndSend();
        });

        expect(onRecorded).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(1);
        dateNowSpy.mockRestore();
    });

    it('should recover after stop failure and allow next recording', async () => {
        const onRecorded = jest.fn();
        const onError = jest.fn();
        const failStopRecording = createRecordingMock({
            stopAndUnloadAsync: jest.fn().mockRejectedValue(new Error('stop failed')),
        });
        const successRecording = createRecordingMock();
        mockRecordingFactory.
            mockReturnValueOnce(failStopRecording).
            mockReturnValueOnce(successRecording);

        const dateNowSpy = jest.spyOn(Date, 'now');
        dateNowSpy.
            mockReturnValueOnce(1000).
            mockReturnValueOnce(2000).
            mockReturnValueOnce(3000).
            mockReturnValueOnce(4500);

        const {result} = renderHook(() => useVoiceRecorder(onRecorded, onError));

        await act(async () => {
            await result.current.startRecording();
            await result.current.stopRecordingAndSend();
        });
        expect(onError).toHaveBeenCalledWith('process_failed');

        await act(async () => {
            await result.current.startRecording();
            await result.current.stopRecordingAndSend();
        });

        expect(onRecorded).toHaveBeenCalledTimes(1);
        dateNowSpy.mockRestore();
    });
});
