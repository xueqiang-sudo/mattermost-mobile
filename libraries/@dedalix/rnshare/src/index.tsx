// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {NativeModules, Platform} from 'react-native';

import type {Spec, SharedItem as Item, ShareExtensionDataToSend as DataToSend} from './NativeDedalixShare';

const LINKING_ERROR =
  'The package \'mattermost-share\' doesn\'t seem to be linked. Make sure: \n\n' +
  Platform.select({ios: "- You have run 'pod install'\n", default: ''}) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

// @ts-expect-error global
const isTurboModuleEnabled = global.__turboModuleProxy != null;

const DedalixShareModule: Spec = isTurboModuleEnabled ? require('./NativeDedalixShare').default : NativeModules.DedalixShare;

const DedalixShare = DedalixShareModule || new Proxy(
    {},
    {
        get() {
            throw new Error(LINKING_ERROR);
        },
    },
);

export type SharedItem = Item;
export type ShareExtensionDataToSend = DataToSend;

export default DedalixShare;

