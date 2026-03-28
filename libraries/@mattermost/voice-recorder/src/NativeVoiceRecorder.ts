// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type TurboModule, TurboModuleRegistry} from 'react-native'

import type {Int32} from 'react-native/Libraries/Types/CodegenTypes'

export type RecordingResult = Readonly<{
  success: boolean
  filePath?: string | null
  durationMs?: Int32
  error?: string | null
}>

export interface Spec extends TurboModule {
  addListener: (eventType: string) => void
  removeListeners: (count: number) => void

  startRecording: (format?: string) => Promise<boolean>

  stopRecording: () => Promise<RecordingResult>

  cancelRecording: () => Promise<void>

  deleteRecordingFile: (filePath: string) => Promise<boolean>

  cleanExpiredRecordingFiles: (prefix: string, maxAgeMs: number) => Promise<number>
}

export default TurboModuleRegistry.getEnforcing<Spec>('VoiceRecorder')
