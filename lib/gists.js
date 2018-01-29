const Promise = require('bluebird');

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const frontMatter = require('hexo-front-matter');
const GistsApi = require('./gists-api');

module.exports.init = function (hexo) {
    var log = hexo.log;

    hexo.extend.migrator.register('gists', function (args, callback) {
        var options = {

            /** Default username. */
            username: args._.shift() || _.get(hexo, 'config.gists_user'),

            /** Force update all gists. */
            force: !!(args['f'] || args['force'])
        };

        Promise.resolve(inquirer.prompt([{
            type: 'input',
            name: 'username',
            message: 'Your github gist id:',
            when: !options.username,
            filter: function (username) {
                return _.trim(username)
            },
            validate: function (username) {
                return !!username || 'Please input your github gist id...';
            }
        }, {
            type: 'password',
            name: 'password',
            message: function (answers) {
                return "Enter password for user '" + answers.username + "':\n";
            }
        }])).then(function (answers) {
            options = _.merge(options, answers);

            var gistsApi = new GistsApi({
                userAgent: 'hexo-migrator-gists',
                username: options.username,
                password: options.password
            });

            return getLocalPosts(hexo)
                .tap(function () {
                    return gistsApi.getRateLimit().then(function (data) {
                        log['i']('Remaining rate limit: ' + _.get(data, 'resources.core.remaining'));
                    })
                })
                .then(function (locals) {
                    log['i']("Fetching " + options.username + "'s gists list...");

                    return gistsApi.list(options.username).then(function (remotes) {
                        return [locals, remotes];
                    });
                })
                .spread(function (locals, remotes) {
                    var info = {
                        created: [],
                        updated: [],
                        deleted: []
                    };

                    _.each(remotes, function (remote) {
                        var files = _.filter(_.values(remote.files), gistsApi.utils.isMarkdown);
                        if (files.length !== 1) {
                            return; // return immediately, a valid post should contain one and only one markdown file.
                        }

                        var local = locals[remote.id];
                        if (local) {
                            local._gist_available = true;

                            if (options.force || remote['updated_at'] !== local['gist_updated_at']) {
                                remote.forked = local['gist_forked'];

                                info.updated.push({local: local, remote: remote});
                            }
                        } else {
                            info.created.push({remote: remote});
                        }
                    });

                    _.each(locals, function (local) {
                        if (!local._gist_available) {
                            info.deleted.push({local: local});
                        }
                    });

                    return Promise.each(info.created, function (created) {
                        log['i']("Fetching gist details: " + created.remote.description || created.remote.id);

                        // get the gist details to check whether it is a forked gist.
                        return gistsApi.getGist(created.remote.id).then(function (gist) {
                            created.forked = !!gist['fork_of'];
                        });
                    }).then(function () {
                        return Promise.each([info.created, info.updated], function (gists) {
                            return Promise.each(gists, function (gist) {
                                var raw = _.find(_.values(gist.remote.files), gistsApi.utils.isMarkdown)['raw_url'];

                                log['i']("Fetching gist content: " + raw);

                                return gistsApi.request(raw).then(function (content) {
                                    var fm;
                                    try {
                                        fm = frontMatter.parse(content);
                                    } catch (ignored) {
                                    }

                                    gist.data = _.merge(_.pickBy(fm, function (value, name) {
                                        return !_.startsWith(name, '_');
                                    }), {
                                        title: gist.remote.description || ('gist_' + gist.remote.id),
                                        date: gist.remote['created_at'],
                                        content: fm ? fm._content : content,
                                        gist_id: gist.remote.id,
                                        gist_forked: !!gist.remote.forked,
                                        gist_created_at: gist.remote['created_at'],
                                        gist_updated_at: gist.remote['updated_at'],
                                        gist_url_api: gist.remote['url'],
                                        gist_url_html: gist.remote['html_url'],
                                        gist_url_forks: gist.remote['forks_url'],
                                        gist_url_comments: gist.remote['comments_url']
                                    });

                                    if (gist.remote.forked) {
                                        gist.data.path = 'gists-forked/' + gist.remote.id;

                                        addValues(gist.data, 'tags', 'gist-forked');
                                        addValues(gist.data, 'categories', 'gist-forked');
                                    } else {
                                        gist.data.path = 'gists/' + gist.remote.id;
                                    }

                                    addValues(gist.data, 'tags', 'gist');
                                    addValues(gist.data, 'categories', 'gist');
                                });
                            });
                        });
                    }).then(function () { // info is inflated.
                        return Promise.each(info.created, function (created) {
                            return hexo.post.create(created.data, true).then(function (post) {
                                log['i']("Create post: " + post.path);
                            });
                        }).then(function () {
                            return Promise.each(info.updated, function (updated) {
                                return hexo.post.create(updated.data, true).then(function (post) {
                                    log['i']("Update post: " + post.path);
                                });
                            });
                        }).then(function () {
                            var unlink = Promise.promisify(fs.unlink);

                            return Promise.each(info.deleted, function (deleted) {
                                var file = path.join(hexo['source_dir'], deleted.local.source);

                                return unlink(file).then(function () {
                                    log['i']("Delete post: " + file);
                                });
                            });
                        });
                    }).thenReturn(info);
                });
        }).then(function (info) {
            log['i']([
                'Migrate succeed:',
                'created - ' + info.created.length,
                'updated - ' + info.updated.length,
                'deleted - ' + info.deleted.length
            ].join('\n      '));
        }).catch(function (err) {
            log['e']('Failed to migrate gists...');
            log['e'](err);
        }).finally(callback);
    });
};

function getLocalPosts(base) {
    var Hexo = require('hexo');
    var hexo = new Hexo(base['base_dir'], {});

    return hexo.init()
        .then(function () {
            return hexo.load();
        }).then(function () {
            var Post = hexo['model']('Post');

            return _.keyBy(Post.find({gist_id: {$exist: true}}, {lean: true}), 'gist_id');
        });
}

function addValues(data, field) {
    var list = data[field] || (data[field] = []);

    for (var i = 2; i < arguments.length; i++) {
        var value = arguments[i];
        if (_.indexOf(list, value) === -1) {
            list.push(value);
        }
    }
}