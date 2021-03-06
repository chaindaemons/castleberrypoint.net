CDCommunity.post = function(token, post) {

    var userId = CDUser.id(token);
    if (!userId)
        throw new Meteor.Error(401, "You need to login to post new stories");
    if (!post.title)
        throw new Meteor.Error(422, 'Please fill in a headline');

    // populate post object
    post.authorId = userId;
    post.created = Date.now();
    post.pinned = false;

    notifyRelevantPostUsers(token, post);

    var postId = CDCommunity.posts.insert(post);

    // associate images with post
    CDCommunity.images.update({
        uploaderId: CDUser.id(token),
        postId: { $exists: false }
    }, {$set: {postId: postId}}, {multi: 1});

};

CDCommunity.like = function(token, id) {
    var increment = CDUser.react(token, 'post', id, 'like');
    if (increment != 0) {
        CDCommunity.posts.update(id, {$inc: {likes: increment}});
    }
};

CDCommunity.comment = function(token, post) {
    var userId = CDUser.id(token);
    if (!userId)
        throw new Meteor.Error(401, "You need to login to comment");
    post.authorId = userId;
    post.created = Date.now();
    var postId = CDCommunity.posts.insert(post);

    notifyRelevantPostUsers(token, post);

    return postId;
};

CDCommunity.pin = function(token, id) {
    var admin = CDUser.user(token);
    if (!admin)
        throw new Meteor.Error(401, "You need to login to administrate users");
    if (!admin.admin)
        throw new Meteor.Error(401, "You need to be an admin to administrate");
    var post = CDCommunity.posts.findOne(id);
    if (!post)
        throw new Meteor.Error(401, "Post not found");
    CDCommunity.posts.update(id, {$set: {pinned: !post.pinned}});
};

CDCommunity.uploadImage = function(token, image) {

    var userId = CDUser.id(token);
    if (!userId)
        throw new Meteor.Error(401, "You need to login to upload images");

    image.order = 0;
    var lastImage;
    // find max sort
    if (image.postId) {
        lastImage = CDCommunity.images.findOne({
                postId: image.postId
            },
            {sort: {order: -1}, fields: {order: 1}}
        );
    } else {
        lastImage = CDCommunity.images.findOne({
                uploaderId: CDUser.id(token),
                postId: { $exists: false }
            },
            {sort: {order: -1}, fields: {order: 1}}
        );
    }

    if (lastImage) {
        image.order = lastImage.order + 1;
    }

    image.uploaderId = userId;
    image.uploaded = Date.now();
    var imageId = CDCommunity.images.insert(image);
    return imageId;

};

CDCommunity.deleteImage = function(token, id) {

    var userId = CDUser.id(token);
    if (!userId)
        throw new Meteor.Error(401, "You need to login to delete images");

    // find the image
    var image = CDCommunity.images.findOne(id, {fields: {order: 1, postId: 1}});
    // decrement successive image orders
    if (image.postId) {
        CDCommunity.images.update({
            postId: image.postId,
            order: { $gt: image.order }
        }, {$inc: {order: -1}}, {multi: 1});
    } else {
        CDCommunity.images.update({
            uploaderId: CDUser.id(token),
            postId: { $exists: false },
            order: { $gt: image.order }
        }, {$inc: {order: -1}}, {multi: 1});
    }

    // delete the image
    CDCommunity.images.remove(id);

};

CDCommunity.upImage = function(token, id) {

    var userId = CDUser.id(token);
    if (!userId)
        throw new Meteor.Error(401, "You need to login to up images");

    // get the image
    var image = CDCommunity.images.findOne(id, {fields: {order: 1, postId: 1}});

    var nextImage;
    // get the image above us
    if (image.postId) {
        nextImage = CDCommunity.images.findOne({
            postId: image.postId,
            order: image.order + 1
        },
            {fields: {order: 1}}
        );
    } else {
        nextImage = CDCommunity.images.findOne({
            uploaderId: CDUser.id(token),
            postId: { $exists: false },
            order: image.order + 1
        },
            {fields: {order: 1}}
        );
    }

    if (!nextImage) {
        return;
    }

    // swap orders
    CDCommunity.images.update(image._id, {$inc: {order: 1}});
    CDCommunity.images.update(nextImage._id, {$inc: {order: -1}});

};

CDCommunity.downImage = function(token, id) {

    var userId = CDUser.id(token);
    if (!userId)
        throw new Meteor.Error(401, "You need to login to up images");

    // get the image
    var image = CDCommunity.images.findOne(id, {fields: {order: 1, postId: 1}});
    // if we are at zero, done
    if (image.order == 0) {
        return;
    }

    var previousImage;
    // get the image below us
    if (image.postId) {
        previousImage = CDCommunity.images.findOne({
                postId: image.postId,
                order: image.order - 1
            },
            {fields: {order: 1}}
        );
    } else {
        previousImage = CDCommunity.images.findOne({
                uploaderId: CDUser.id(token),
                postId: { $exists: false },
                order: image.order - 1
            },
            {fields: {order: 1}}
        );
    }

    if (!previousImage) {
        return;
    }

    // swap orders
    CDCommunity.images.update(image._id, {$inc: {order: -1}});
    CDCommunity.images.update(previousImage._id, {$inc: {order: 1}});

};

CDCommunity.cancel = function(token) {
    var userId = CDUser.id(token);
    if (!userId)
        throw new Meteor.Error(401, "You need to login to upload images");
    CDCommunity.images.remove({ uploaderId: userId, postId: { $exists: false }});
};

function notifyRelevantPostUsers(token, post, success) {

    var notification = {
        recipientIds: [],
        message: post.content,
        routeName: 'community'
    };

    if (!post.postId) {

        // set the notification header to the post title
        notification.header = post.title;

        // for a new post, notify everyone except us
        var allReceipientIds = CDUser.users.find({
            _id: {$ne: post.authorId}
        }, {_id : 1}).map(function(user) {
            return user._id;
        });

        notification.recipientIds = _.union(notification.recipientIds, allReceipientIds);

    } else {

        // put the parent post title in the notification
        var parentPost = CDCommunity.posts.findOne({_id: post.postId}, {title: 1});
        notification.header = 'Re: ' + parentPost.title;

        // set the reply to message id to the parent post's notification message id
        var parentNotification = CDNotifications.notifications.findOne({_id: parentPost.notificationId}, {messageId: 1});
        notification.replyToMessageId = parentNotification.messageId;

        // add the parent author if not us
        if (parentPost.authorId !== post.authorId) {
            notification.recipientIds.push(parentPost.authorId);
        }

        // for an old post, get all user ids that commented
        // on this post that aren't us
        var commentedRecipientIds = CDCommunity.posts.find({
            postId: post.postId,
            authorId: {$ne: post.authorId}
        }, {authorId : 1}).map(function(post) {
            return post.authorId;
        });

        notification.recipientIds = _.union(notification.recipientIds, commentedRecipientIds);

        // additionally, get all user ids that liked this post
        // that are not us
        var reactingRecipientIds = CDUser.reactions.find({
            postId: post.postId,
            userId: {$ne: post.authorId}
        }, {userId : 1}).map(function(reaction) {
            return reaction.userId;
        });

        notification.recipientIds = _.union(notification.recipientIds, reactingRecipientIds);

    }

    // set the initial notification id on our post
    post.notificationId = CDNotifications.notify(token, notification);

}
