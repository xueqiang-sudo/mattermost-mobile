// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Screens} from '@constants';

export type AppsStackParamList = {
    [Screens.APPS_HOME]: undefined;
    [Screens.APPS_WEBVIEW]: {
        appKey: string;
        title: string;
    };
    [Screens.APPS_MES]: undefined;
    [Screens.APPS_PROMOTION]: undefined;
    [Screens.APPS_ROLE_MANAGEMENT]: undefined;
    [Screens.APPS_PRICE_LIST]: undefined;
    [Screens.APPS_CLOUD_DRIVE]: undefined;
    [Screens.APPS_KNOWLEDGE_BASE]: undefined;
    [Screens.KB_DETAIL]: {
        docId: string;
        docTitle?: string;
        onDocUpdated?: () => void;
    };
    [Screens.KB_ADD]: {
        teamId: string;
        onDocAdded?: () => void;
    };
    [Screens.KB_EDIT]: {
        doc: any;
        onDocUpdated?: () => void;
    };
    [Screens.APPS_NOTEBOOK]: undefined;
    [Screens.NOTE_DETAIL]: {
        noteId: string;
        noteTitle: string;
        teamId: string;
        scope: string;
        title: string;
    };
    [Screens.NOTE_ADD]: {
        teamId: string;
        scope: string;
        title: string;
        onNoteAdded?: () => void;
    };
    [Screens.APPS_CONVERSATIONS]: undefined;
    [Screens.APPS_APPROVALS]: undefined;
    [Screens.APPS_FINANCE]: undefined;
    [Screens.APPS_HOT_PRODUCTS]: undefined;
    [Screens.APPS_INVENTORY]: undefined;
    [Screens.APPS_SALES]: undefined;
    [Screens.APPS_WAREHOUSE_INOUT]: {initialScanType?: 'stock_in' | 'stock_out'; scanResult?: string} | undefined;
};
