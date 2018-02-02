const _ = require('lodash');
const frontMatter = require('hexo-front-matter');

function GistsBuilder(data) {
    this.data = data;
}

GistsBuilder.prototype.build = function () {
    this._applyFrontMatter();
    this._applyAnnotations();

    return this.data;
};

GistsBuilder.prototype._applyFrontMatter = function () {
    var data;
    try {
        data = frontMatter.parse(this.data.content);
    } catch (ignored) {
    }

    if (data) {
        this.data.content = data['_content'];

        _.each(this.data, function (value, name) {
            if (_.isArray(value)) {
                data[name] = _.uniq(data[name] ? _.chain(data[name]).castArray().concat(value).value() : value);
            }
        });

        _.merge(this.data, _.pickBy(data, function (value, name) {
            return !_.startsWith(name, '_');
        }));
    }
};

GistsBuilder.prototype._applyAnnotations = function () {
    var processor = new GistAnnotationProcessor();
    _.each(_.split(this.data.content, '\n'), function (line) {
        processor.process(line);
    });

    processor.finish(this.data);
};

// ---------------------------------------------------------------------------------------------------------------------
// Annotation
// ---------------------------------------------------------------------------------------------------------------------

function GistAnnotationProcessor() {
    this.data = {};
    this.lines = [];
    this.pendingMethods = {};
}

/**
 * For example: '<!-- @Gist(hide) -->', '<!-- @Gist(excerpt) -->'
 */
GistAnnotationProcessor.ANNOTATION_REG = /^\s*<!--+\s*@Gist\(([_a-zA-Z0-9]+)\)\s*--+>\s*$/ig;

GistAnnotationProcessor.match = function (line) {
    var match = GistAnnotationProcessor.ANNOTATION_REG.exec(line);
    if (match && match.length > 1) {
        return match[1];
    }
};

GistAnnotationProcessor.prototype.process = function (line) {
    var method = GistAnnotationProcessor.match(line);
    if (method) {
        method = _.toLower(method);

        var pending = this.pendingMethods[method];
        if (pending) {
            if (pending.finish) {
                pending.finish(this.data);
            }

            return (delete this.pendingMethods[method]);
        }

        return this.pendingMethods[method] = method === 'hide'
            ? new HideMethod()
            : new BlockMethod(method);
    }

    var show = true;

    _.each(this.pendingMethods, function (method) {
        if (method) {
            if (method.process(line) === false) {
                show = false;
            }
        }
    });

    if (show) {
        this.lines.push(line);
    }
};

GistAnnotationProcessor.prototype.finish = function (data) {
    data.content = this.lines.join('\n');

    _.defaults(data, this.data);
};

function HideMethod() {
    this.process = function () {
        return false;
    };
}

function BlockMethod(name) {
    this.lines = [];

    this.process = function (line) {
        this.lines.push(line);
    };

    this.finish = function (data) {
        if (this.lines.length) {
            data[name] = this.lines.join('\n');
        }
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------------------------------

module.exports = GistsBuilder;