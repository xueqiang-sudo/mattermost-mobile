// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type TurboModule, TurboModuleRegistry} from 'react-native';

import type {Int32} from 'react-native/Libraries/Types/CodegenTypes';

export type RecordingResult = Readonly<{
  success: boolean;
  filePath?: string | null;
  durationMs?: Int32;
  error?: string | null;
}>

export type StartRecordingOptions = Readonly<{
  format?: string;
  prefix?: string;
}>

/** Native `promise.reject` code when `RECORD_AUDIO` / microphone permission is not granted. */
export const VOICE_RECORDER_PERMISSION_DENIED_CODE = 'PERMISSION_DENIED' as const;

export interface Spec extends TurboModule {
  addListener: (eventType: string) => void;
  removeListeners: (count: number) => void;

  /**
   * Resolves `true` when recording starts.
   * Rejects with `code` {@link VOICE_RECORDER_PERMISSION_DENIED_CODE} if permission is denied at the OS level,
   * or `RECORD_ERROR` for other failures.
   */
  startRecording: (options?: StartRecordingOptions) => Promise<boolean>;

  stopRecording: () => Promise<RecordingResult>;

  cancelRecording: () => Promise<void>;

  deleteRecordingFile: (filePath: string) => Promise<boolean>;

  cleanExpiredRecordingFiles: (prefix: string, maxAgeMs: number) => Promise<number>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('VoiceRecorder');
