// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
//
// *******************************************************************
// - [#] indicates a test step (e.g. # Go to a screen)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element testID when selecting an element. Create one if none.
// *******************************************************************

import {Channel, Post, Setup, Team, User} from '@support/server_api';
import {
    ChannelListScreen,
    ChannelScreen,
    HomeScreen,
    LoginScreen,
    PermalinkScreen,
    PostOptionsScreen,
    ServerScreen,
    UserProfileScreen,
} from '@support/ui/screen';
import {serverOneUrl, siteOneUrl} from '@support/test_config';
import {getRandomId, isIos} from '@support/utils';
import {expect} from 'detox';

describe('Messaging - Recall / Re-edit / Quote chain', () => {
    const serverOneDisplayName = 'Server 1';
    const channelsCategory = 'channels';
    let testChannel: any;
    let testTeam: any;
    let testUser: any;
    let testOtherUser: any;

    it('MM-T-recall-1 - should verify withdraw, re-edit, mention, and quote jump', async () => {
        // # Create channel content for: current user plain, other user plain, and a reply thread
        const ownPlainMessage = `Own plain ${getRandomId()}`;
        const otherPlainMessage = `Other plain ${getRandomId()}`;
        const rootMessage = `Root ${getRandomId()} - quote jump`;
        const replyMessage = `Reply ${getRandomId()} - recall`;

        await ChannelScreen.open(channelsCategory, testChannel.name);

        // Ensure current user's ordinary message exists in the channel.
        await ChannelScreen.postMessage(ownPlainMessage);
        const {post: ownPlainPost} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(ownPlainPost.id, ownPlainMessage);

        // Create other user's ordinary message (plain text).
        const {post: otherPlainPost} = await Post.apiCreatePost(siteOneUrl, {
            channelId: testChannel.id,
            message: otherPlainMessage,
            userId: testOtherUser.id,
        });
        await ChannelScreen.hasPostMessage(otherPlainPost.id, otherPlainMessage);

        // Create a thread root post by other user, and a reply by current user.
        const {post: rootPost} = await Post.apiCreatePost(siteOneUrl, {
            channelId: testChannel.id,
            message: rootMessage,
            userId: testOtherUser.id,
        });
        const {post: replyPost} = await Post.apiCreatePost(siteOneUrl, {
            channelId: testChannel.id,
            message: replyMessage,
            userId: testUser.id,
            rootId: rootPost.id,
        });

        // * Verify reply thread root and reply are visible on channel screen.
        const {postListPostItem: rootPostListPostItem} = ChannelScreen.getPostListPostItem(rootPost.id, rootMessage);
        await expect(rootPostListPostItem).toBeVisible();
        const {postListPostItem: replyPostListPostItem} = ChannelScreen.getPostListPostItem(replyPost.id, replyMessage);
        await expect(replyPostListPostItem).toBeVisible();

        // Step 2: long press own reply message to open menu and recall within 2 minutes.
        await ChannelScreen.openPostOptionsFor(replyPost.id, replyMessage);

        // * Verify expected menu items exist.
        await expect(PostOptionsScreen.replyPostOption).toBeVisible(); // 引用
        await expect(PostOptionsScreen.editPostOption).toBeVisible(); // 编辑
        await expect(PostOptionsScreen.deletePostOption).toBeVisible(); // 撤回
        await expect(PostOptionsScreen.copyTextOption).toBeVisible(); // 复制文字

        // * Verify unexpected items do not exist.
        await expect(PostOptionsScreen.savePostOption).not.toExist(); // 保存
        await expect(PostOptionsScreen.markAsUnreadOption).not.toExist(); // 标记未读
        await expect(element(by.text('删除'))).not.toExist();
        await expect(element(by.text('撤回').withAncestor(by.id('post_options.screen')))).toBeVisible();

        // # Confirm recall
        await PostOptionsScreen.deletePost({confirm: true});

        // Step 2 evidence: recalled UI replaces original message body.
        await expect(element(by.text('你撤回了一条消息'))).toBeVisible();
        await expect(element(by.text(replyMessage))).not.toExist();

        // Step 3: long press the recalled message to re-edit it.
        await ChannelScreen.openPostOptionsFor(replyPost.id, '');

        // * Verify re-edit menu item exists, but withdraw/edit are gone.
        await expect(PostOptionsScreen.recallEditOption).toBeVisible(); // 重新编辑
        await expect(PostOptionsScreen.deletePostOption).not.toExist(); // 撤回
        await expect(PostOptionsScreen.editPostOption).not.toExist(); // 编辑

        await PostOptionsScreen.recallEditOption.tap();

        // Step 3 evidence: input refilled, and quote preview is shown.
        if (isIos()) {
            await expect(ChannelScreen.postInput).toHaveValue(replyMessage);
        } else {
            await expect(ChannelScreen.postInput).toHaveText(replyMessage);
        }

        await expect(element(by.id('post_draft.quote.close.button'))).toBeVisible();
        await expect(element(by.id('post_draft.quote.jump_area'))).toBeVisible();

        // Step 5: long press the other user's avatar (root author) to insert @mention.
        const {postItemProfilePicture: otherAvatar} = ChannelScreen.getPostListPostItem(replyPost.id, '', {userId: testOtherUser.id});
        await expect(otherAvatar).toBeVisible();
        await otherAvatar.longPress();

        // Verify: mention was inserted into composer input.
        const mentionText = `@${testOtherUser.username}`;
        const postInputAttributes = await ChannelScreen.postInput.getAttributes();
        const postInputText = postInputAttributes.text ?? postInputAttributes.value ?? '';
        expect(postInputText).toContain(mentionText);

        // Verify: should not open user profile.
        await expect(UserProfileScreen.userProfileScreen).not.toExist();

        // Step 6: quote preview jump area should open Permalink and show the original root post.
        await element(by.id('post_draft.quote.jump_area')).tap();
        await PermalinkScreen.toBeVisible();
        const {postListPostItem: permalinkRootPostItem} = PermalinkScreen.getPostListPostItem(rootPost.id, rootMessage);
        await expect(permalinkRootPostItem).toBeVisible();

        // Return to channel and ensure draft/quote preview still exists.
        await PermalinkScreen.jumpToRecentMessages();
        await ChannelScreen.toBeVisible();
        await expect(element(by.id('post_draft.quote.close.button'))).toBeVisible();

        // Step 4: switch to other user to validate recalled message label.
        await HomeScreen.logout(serverOneDisplayName);
        await LoginScreen.login(testOtherUser);
        await ChannelScreen.open(channelsCategory, testChannel.name);

        const recalledOtherText = `@${testUser.username}撤回了一条消息`;
        await expect(element(by.text(recalledOtherText))).toBeVisible();
    });

    beforeAll(async () => {
        const {channel, team, user} = await Setup.apiInit(siteOneUrl);
        testChannel = channel;
        testTeam = team;
        testUser = user;

        // Patch both users to zh-CN to make string assertions deterministic.
        await User.apiPatchUser(siteOneUrl, testUser.id, {locale: 'zh-CN'});

        ({user: testOtherUser} = await User.apiCreateUser(siteOneUrl, {prefix: 'other'}));
        await Team.apiAddUserToTeam(siteOneUrl, testOtherUser.id, testTeam.id);
        await Channel.apiAddUserToChannel(siteOneUrl, testOtherUser.id, testChannel.id);
        await User.apiPatchUser(siteOneUrl, testOtherUser.id, {locale: 'zh-CN'});

        // Login as current user.
        await ServerScreen.connectToServer(serverOneUrl, serverOneDisplayName);
        await LoginScreen.login(testUser);
    });

    beforeEach(async () => {
        await ChannelListScreen.toBeVisible();
    });

    afterAll(async () => {
        await HomeScreen.logout();
    });
});

