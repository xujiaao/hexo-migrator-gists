const Promise = require('bluebird');

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const GistsApi = require('./gists-api');
const GistsBuilder = require('./gists-builder');

const GISTS_FORMAT = '1.0.0';

module.exports.init = function (hexo) {
    var log = hexo.log;

    function syncGists(args, callback) {

        /**
         * Default username.
         */
        var username = args._.shift() || _.get(hexo, 'config.gists_user');

        /**
         * Force update all gists.
         */
        var forceUpdate = !!(args['f'] || args['force']);

        /**
         * Skip forked gists.
         */
        var skipForked = _.get(hexo, 'config.gists_skip_forked') !== false;

        Promise.resolve(inquirer.prompt([{
            type: 'input',
            name: 'username',
            message: 'Your github gist id:',
            when: !username,
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
                return "Enter password for user '" + (username || answers.username) + "':\n";
            }
        }])).then(function (answers) {
            if (!username) {
                username = answers.username;
            }

            var gistsApi = new GistsApi({
                userAgent: 'hexo-migrator-gists',
                username: username,
                password: answers.password
            });

            return getLocalPosts(hexo)
                .tap(function () {
                    return gistsApi.getRateLimit().then(function (data) {
                        log['i']('Remaining rate limit: ' + _.get(data, 'resources.core.remaining'));
                    })
                })
                .then(function (locals) {
                    log['i']("Fetching " + username + "'s gists list...");

                    return gistsApi.list(username).then(function (remotes) {
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

                            if (forceUpdate
                                || _.get(local, 'gist.format') !== GISTS_FORMAT
                                || _.get(local, 'gist.updated_at') !== remote['updated_at']) {
                                remote._forked = _.get(local, 'gist.forked');

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
                        log['i']('Fetching gist details: ' + created.remote.description || created.remote.id);

                        // get the gist details to check whether it is a forked gist.
                        return gistsApi.getGist(created.remote.id).then(function (gist) {
                            created.remote._forked = !!gist['fork_of'];
                        });
                    }).then(function () {
                        if (skipForked) {
                            var removed = _.remove(info.created, function (gist) {
                                return gist.remote._forked;
                            });

                            log['i']('Skip forked gist: ' + removed.length);
                        }

                        return Promise.each([info.created, info.updated], function (gists) {
                            return Promise.each(gists, function (gist) {
                                var raw = _.find(_.values(gist.remote.files), gistsApi.utils.isMarkdown)['raw_url'];

                                log['i']('Fetching gist content: ' + raw);

                                return gistsApi.request(raw).then(function (content) {
                                    var category = gist.remote._forked ? 'gists-forked' : 'gists';

                                    gist.data = new GistsBuilder({
                                        path: category + '/' + gist.remote.id,
                                        date: gist.remote['created_at'],
                                        title: gist.remote.description || ('gist_' + gist.remote.id),
                                        content: content,
                                        categories: [category],
                                        gist: {
                                            id: gist.remote.id,
                                            format: GISTS_FORMAT,
                                            forked: !!gist.remote._forked,
                                            created_at: gist.remote['created_at'],
                                            updated_at: gist.remote['updated_at'],
                                            url_api: gist.remote['url'],
                                            url_html: gist.remote['html_url'],
                                            url_forks: gist.remote['forks_url'],
                                            url_comments: gist.remote['comments_url']
                                        }
                                    }).build();
                                });
                            });
                        });
                    }).then(function () { // info is inflated.
                        return Promise.each(info.created, function (created) {
                            return hexo.post.create(created.data, true).then(function (post) {
                                log['i']('Create post: ' + post.path);
                            });
                        }).then(function () {
                            return Promise.each(info.updated, function (updated) {
                                return hexo.post.create(updated.data, true).then(function (post) {
                                    log['i']('Update post: ' + post.path);
                                });
                            });
                        }).then(function () {
                            var unlink = Promise.promisify(fs.unlink);

                            return Promise.each(info.deleted, function (deleted) {
                                var file = path.join(hexo['source_dir'], deleted.local.source);

                                return unlink(file).then(function () {
                                    log['i']('Delete post: ' + file);
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
        }).finally(function () {
            if (_.isFunction(callback)) {
                callback();
            }
        });
    }

    // Hexo migrator.
    hexo.extend.migrator.register('gists', syncGists);

    // Hexo console.
    hexo.extend.console.register('gists', 'Sync Github Gists', syncGists);
};

function getLocalPosts(base) {
    var Hexo = require('hexo');
    var hexo = new Hexo(base['base_dir'], {});

    return hexo.init()
        .then(function () {
            return hexo.load();
        }).then(function () {
            var Post = hexo['model']('Post');

            return _.keyBy(Post.find({gist: {$exist: true}}, {lean: true}), 'gist.id');
        });
}