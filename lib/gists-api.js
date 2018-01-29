const _ = require('lodash');
const rp = require('request-promise');
const parseLinkHeader = require('parse-link-header');

function GistsApi(options) {
    this.username = options.username;

    this.headers = {
        'User-Agent': options.userAgent
    };

    if (options.password) {
        this.headers['Authorization'] = 'Basic ' +
            new Buffer(options.username + ':' + options.password).toString('base64');
    }
}

GistsApi.prototype.request = function (uri, options) {
    if (_.startsWith(uri, '/')) {
        uri = 'https://api.github.com' + uri;
    }

    return rp(_.merge(options, {
        uri: uri,
        headers: this.headers
    }));
};

/**
 * Get the rate limit.
 */
GistsApi.prototype.getRateLimit = function () {
    return this.request('/rate_limit', {
        json: true
    });
};

/**
 * List all public gists for the user.
 */
GistsApi.prototype.list = function () {
    var self = this;
    var list = null;

    function doListGists(uri) {
        return self.request(uri, {
            json: true,
            resolveWithFullResponse: true
        }).then(function (res) {
            list = list ? list.concat(res.body) : res.body;

            var linkHeader = res.headers['link'];
            if (linkHeader) {
                linkHeader = parseLinkHeader(linkHeader);

                if (linkHeader && linkHeader.next && linkHeader.next.url) {
                    return doListGists(linkHeader.next.url);
                }
            }
        });
    }

    return doListGists('/users/' + this.username + '/gists?per_page=1')
        .then(function () {
            return list;
        });
};

/**
 * Get a single gist.
 */
GistsApi.prototype.getGist = function (id) {
    return this.request('/gists/' + id, {
        json: true
    });
};

/**
 * Utils.
 */
GistsApi.prototype.utils = {

    isMarkdown: function (file) {
        return file.language === 'Markdown';
    }
};

// ---------------------------------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------------------------------

module.exports = GistsApi;