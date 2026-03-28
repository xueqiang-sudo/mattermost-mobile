// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {NativeModules, Platform} from 'react-native';

import type {Spec, RecordingResult} from './NativeVoiceRecorder';

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

export default VoiceRecorder;
