// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export type Announcement = {
    id: string;
    title: string;
    content: string;
    author_id: string;
    author_name: string;
    priority: 'normal' | 'important' | 'urgent';
    is_pinned: boolean;
    created_at: number;
    updated_at: number;
};

export type AnnouncementFormData = {
    title: string;
    content: string;
    priority: 'normal' | 'important' | 'urgent';
    is_pinned: boolean;
};
