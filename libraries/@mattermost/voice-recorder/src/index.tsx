// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {NativeModules, Platform} from 'react-native';

import type {Spec, RecordingResult, StartRecordingOptions} from './NativeVoiceRecorder';

export {VOICE_RECORDER_PERMISSION_DENIED_CODE} from './NativeVoiceRecorder';

const LINKING_ERROR =
  'The package \'@mattermost/voice-recorder\' doesn\'t seem to be linked. Make sure: \n\n' +
  Platform.select({ios: "- You have run 'pod install'\n", default: ''}) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

// @ts-expect-error global
const isTurboModuleEnabled = global.__turboModuleProxy != null;

const VoiceRecorderModule: Spec = isTurboModuleEnabled ? require('./NativeVoiceRecorder').default : NativeModules.VoiceRecorder;

const VoiceRecorder = VoiceRecorderModule || new Proxy(
    {},
    {
        get() {
            throw new Error(LINKING_ERROR);
        },
    },
);

export type RecordingResultType = RecordingResult;
export type StartRecordingOptionsType = StartRecordingOptions;

// 新增：实时录音 API
export function startRealtimeRecording(
  onAudioChunk: (chunkBase64: string) => void,
  options?: StartRecordingOptions
): Promise<boolean> {
  return VoiceRecorder.startRealtimeRecording(options || {}, onAudioChunk);
}

export function stopRealtimeRecording(): Promise<void> {
  return VoiceRecorder.stopRealtimeRecording();
}

export default VoiceRecorder;
