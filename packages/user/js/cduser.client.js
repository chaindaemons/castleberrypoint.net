CDUser.user = function(id) {
    if (!id) {
        id = this.id();
    }
    return this.users.findOne(id);
};

CDUser.preparing = function() {
    return (!this.id() || !this.token()) && (localStorage.getItem('user.id') && localStorage.getItem('user.token'));
}

CDUser.id = function(id) {
    if (id) {
        Session.set('user.id', id);
        localStorage.setItem('user.id', id);
    } else {
        return Session.get('user.id');
    }
};

CDUser.token = function(token) {
    if (token) {
        Session.set('user.token', token);
        localStorage.setItem('user.token', token);
    } else {
        return Session.get('user.token');
    }
};

CDUser.getFieldValue = function() {
    if (this.type === 'file') {
        return;
    }
    var user = CDUser.user();
    if (!user) {
        return;
    }
    return user[this.name];
};

CDUser.getFieldType = function() {
    if (this.type) {
        return this.type;
    } else {
        return 'text';
    }
};

CDUser.isFieldFile = function() {
    return this.type === 'file';
};

CDUser.process = function(form, fields) {

    var errors = {};
    var user = {};
    // loop over all defined fields and compare to inputs
    fields.forEach(function(field) {

        // get input from field
        var input = $(form).find('input[name=' + field.name + ']');
        var value = input.val();

        // check for required
        if (field.required && ((input.length === 0) || (value === ''))) {
            // if the same is also empty, we are good
            if (!field.same || (user[field.same] !== '')) {
                errors[field.name] = field.placeholder + ' required';
                return;
            }
        }

        // check for same value in user object
        if (field.same) {
            if (user[field.same] !== value) {
                errors[field.name] = field.placeholder + ' does not match';
            }
            return;
        }

        if (field.type === 'file') {
            value = Session.get('user.' + field.name);
        }

        user[field.name] = value;

    });

    return {
        errors: errors,
        user: user
    };

};

CDUser.login = function(user, fail) {
    var that = this;
    Meteor.call('CDUser.login', user, function(error, result) {
        if (!error) {
            that.id(result.id);
            that.token(result.token);
            FlowRouter.go(CDUser.forms.login.completePath);
        } else {
            fail(error);
        }
    });
};

CDUser.join = function(user, fail) {
    var that = this;
    Meteor.call('CDUser.join', user, function(error, result) {
        if (!error) {
            that.id(result.id);
            that.token(result.token);
            FlowRouter.go(CDUser.forms.join.completePath);
        } else {
            fail(error);
        }
    });
};

CDUser.modify = function(user, fail) {
    var that = this;
    Meteor.call('CDUser.modify', that.token(), user, function(error) {
        if (!error) {
            FlowRouter.go(CDUser.forms.modify.completePath);
        } else {
            fail(error);
        }
    });
};

CDUser.logout = function() {
    Session.set('user.id', null);
    Session.set('user.token', null)
    localStorage.removeItem('user.id');
    localStorage.removeItem('user.token');
};

CDUser.administrate = function(id) {
    Meteor.call('CDUser.administrate', this.token(), id, function (error) {
        if (error) {
            alert(error.reason);
        }
    });
};

CDUser.upload = function() {

    var input = $(document.createElement('input'));
    input.attr("type", "file");
    $(input).on('change', function(event) {
        var file = event.target.files[0]; //assuming 1 file only
        if (!file) { return; }
        processImage(file, 100, 100, function(data) {
            Session.set('user.image', data);
        });
    });

    input.trigger('click');

};

CDUser.getUserSnapImageSrc = function() {
    var image = Session.get('user.image');
    if (!image) {
        return '/images/anon.jpg';
    }
    return image;
};

CDUser.getUserImageSrc = function(id) {
    var user = CDUser.user(id);
    if (!user || !user.image) {
        return '/images/anon.jpg';
    }
    return user.image;
};

Template.registerHelper('currentUser', function () {
    return CDUser.user();
});