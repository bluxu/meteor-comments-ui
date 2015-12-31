(function () {
  var defaultCommentHelpers = {
      take: function (params) {
        var content = Comments.session.get('content');

        if (content[params.hash.key]) {
          return content[params.hash.key];
        }

        return params.hash.default;
      },
      templateIs: function (name) {
        return name === Comments.ui.config().template;
      },
      hasMoreComments: function () {
        if (!Template.currentData().news)
          return Comments.get(this.id).count() < Comments.session.get(this.id + '_count');
        return Comments.getAll().count() < Comments.session.get('news_count');
      },
      textarea: function () {
        return Template.commentsTextarea;
      },
      commentId: function () {
        return this._id || this.replyId;
      }
    },
    handles = {};

  /*
   * Comments Textarea
   */
  Template.commentsTextarea.helpers(_.extend(defaultCommentHelpers, {
    addButtonKey: function () {
      return this.reply ? 'add-button-reply' : 'add-button';
    },
    addButtonText: function () {
      return this.reply ? 'Add Reply' : 'Add Comment';
    }
  }));

  /*
   * Single Comment View
   */
  Template.commentsSingleComment.helpers(_.extend(defaultCommentHelpers, {
    hasLiked: function () {
      return this.likes.indexOf(Meteor.userId()) > -1;
    },
    isOwnComment: function () {
      return this.userId === Meteor.userId();
    },
    canRemove: function() {
      // You can remove posts on your on profile!
      return this.userId === Meteor.userId() || this.referenceId === Meteor.userId();
    },
    loginAction: function () {
      return Comments.session.get('loginAction');
    },
    addReply: function () {
      // To do - add appropriate logic to prevent replies unless you're a follower
      var id = this._id || this.replyId;
      return Comments.session.get('replyTo') === id;
    },
    isEditable: function () {
      var id = this._id || this.replyId;
      return Comments.session.get('editingDocument') === id;
    },
    reply: function () {
      if (_.isFunction(this.enhancedReplies)) {
        return this.enhancedReplies();
      } else if (_.isArray(this.enhancedReplies)) {
        return this.enhancedReplies;
      }
    },
    avatarUrl: function() {
      var user = Meteor.users.findOne(this.userId);
      return Avatar.getUrl(user);
    },
    toUserName: function() {
      var user = Meteor.users.findOne(this.referenceId);
      if (user)
        return user.profile.fullName;
    },
    isNewsAndConversation: function() {
      return Template.parentData(1).news && this.userId != this.referenceId;
    }
  }));

  /*
   * Comments Box
   */

  Template.commentsBox.rendered = function () {
    var tplScope = this,
        limit = Comments.ui.config().limit;

    // The news is a single universal stream at present
    if (tplScope.data.news) {
      tplScope.data.id = 'news';
    }

    // To do - need checks in case the id is not yet defined...
    // otherwise we end up with exceptions...
    if (!handles[tplScope.data.id]) {
      Comments.session.set(tplScope.data.id + '_currentLimit', limit);
      if (tplScope.data.news)
        handles[tplScope.data.id] = Meteor.subscribe('comments/all', limit);
      else
        handles[tplScope.data.id] = Meteor.subscribe('comments/reference', tplScope.data.id, limit);
    }

    if (tplScope.data.news) {
      Meteor.call('comments/countAll', function (err, count) {
        Comments.session.set(tplScope.data.id + '_count', count);
      });
    }
    else {
      Meteor.call('comments/count', tplScope.data.id, function (err, count) {
        Comments.session.set(tplScope.data.id + '_count', count);
      });
    }
  };

  Template.commentsBox.destroyed = function () {
    if (handles[this.data.id]) {
      handles[this.data.id].stop();
      handles[this.data.id] = null;
    }
  };

  Template.commentsBox.helpers(_.extend(defaultCommentHelpers, {
    comment: function (hello) {
      if (!Template.currentData().news)
        return Comments.get(this.id);
      return Comments.getAll();
    },
    customTpl: function () {
      if (_.isString(this.customTemplate)) {
        Template[this.customTemplate].inheritsHelpersFrom("commentsBox");
        return Template[this.customTemplate];
      }
    }
  }));

  Template.commentsBox.events({
    'submit .comment-form, keydown .create-comment' : function (e) {
      var eventScope = this;

      if ((e.originalEvent instanceof KeyboardEvent && e.keyCode === 13 && e.ctrlKey) || "submit" === e.type) {
        e.preventDefault();

        Comments.ui.callIfLoggedIn('add posts.', function () {
          var textarea = $(e.target).parent().find('.create-comment'),
              value = textarea.val().trim();

          if (value) {
            Comments.add(eventScope.id, value);
            textarea.val('');
          }
        });
      }
    },
    'submit .reply-form' : function (e) {
      var eventScope = this;

      if ((e.originalEvent instanceof KeyboardEvent && e.keyCode === 13 && e.ctrlKey) || "submit" === e.type) {
        e.preventDefault();

        if (this.scope) {
          eventScope = this.scope;
        }

        Comments.ui.callIfLoggedIn('add replies.', function () {
          var id = eventScope._id || eventScope.documentId,
              textarea = $(e.target).parent().find('.create-reply'),
              value = textarea.val().trim();

          if (value) {
            Comments.reply(id, eventScope, value);
            Comments.session.set('replyTo', null);
          }
        });
      }
    },
    'click .like-action' : function () {
      var eventScope = this;

      Comments.ui.callIfLoggedIn('like posts.', function () {
        if (eventScope._id) {
          Comments.like(eventScope._id);
        } else if (eventScope.replyId) {
          Comments.likeReply(eventScope.documentId, eventScope);
        }
      });
    },
    'click .remove-action' : function () {
      var tplScope = Template.currentData(),
        eventScope = this;

      Comments.ui.callIfLoggedIn('remove posts.', function () {
        if (eventScope._id) {
          Comments.remove(eventScope._id);
          Comments.session.set(tplScope.id + '_count', (Comments.session.get(tplScope.id + '_count') - 1));
        } else if (eventScope.replyId) {
          Comments.removeReply(eventScope.documentId, eventScope);
        }
      });
    },
    'click .reply-action': function () {
      var id = this._id || this.replyId;
      Comments.session.set('replyTo', id);
    },
    'click .edit-action' : function (e) {
      var id = this._id || this.replyId;

      $('.comment-content').attr('contenteditable', false);
      $(e.target).closest('.comment').find('.comment-content[data-id="' + id + '"]').attr('contenteditable', true);
      Comments.session.set('editingDocument', id);
    },
    'click .save-action' : function (e) {
      var id = this._id || this.replyId,
        contentBox = $(e.target).closest('.comment').find('.comment-content[data-id="' + id + '"]'),
        newContent = contentBox.text().trim();

      if (!newContent) {
        return;
      }

      contentBox.attr('contenteditable', false);
      Comments.session.set('editingDocument', '');

      if (this.content !== newContent) {
        contentBox.html('');
        if (this._id) {
          Comments.edit(id, newContent);
        } else if (this.replyId) {
          Comments.editReply(this.documentId, this, newContent);
        }
      }
    },
    'click .loadmore-action' : function () {
      // To do - this is probably not the ideal pattern, we should let the subscribes
      // and calls do more of the work
      // Plus we need to put the pesky news string into some protected global namespace
      var tplScope = this, handle, currentLimit;
      if (Template.currentData().news) {
        tplScope.id = 'news';
      }
      handle = handles[tplScope.id];
      currentLimit = Comments.session.get(tplScope.id + '_currentLimit') + Comments.ui.config().loadMoreCount;
      if (Template.currentData().news) {
        Meteor.call('comments/countAll', function (err, count) {
          Comments.session.set(tplScope.id + '_count', count);
        });
      }
      else {
        Meteor.call('comments/count', tplScope.id, function (err, count) {
          Comments.session.set(tplScope.id + '_count', count);
        });
      }
      Comments.session.set(tplScope.id + '_currentLimit', currentLimit);
      if (Template.currentData().news) {
        handles[tplScope.id] = Meteor.subscribe('comments/all', currentLimit);
      }
      else {
        handles[tplScope.id] = Meteor.subscribe('comments/reference', tplScope.id, currentLimit);
      }
      handle && handle.stop();
    },
    'click .author': function() {
      profileId = $(event.target).closest('a').attr('data-user-id');
      Session.set('currentProfileId', profileId);
      $('button#profile').tab('show');
      if (!$('#profileModal').hasClass('in'))
        Modal.show('profileModal');
    }
  });
})();
