/*
 * This node module contains some helper function for gulp
 */

var fs = require('fs');
var Path = require('path');
var Stream = require("stream");
var through = require('through');
//var through2 = require('through2');

var gulp = require('gulp');
var gutil = require('gulp-util');


var toFileList = function () {
    var firstFile = null;
    var fileList = [];
    function write(file) {
        if (file.isStream()) return this.emit('error', new PluginError('toFileList', 'Streaming not supported'));
        if (!firstFile) firstFile = file;
        fileList.push(file.relative);
        //console.dir(file);
    }
    function end() {
        if (firstFile) {
            firstFile.contents = new Buffer(fileList.join(',') + ',');
        }
        else {
            firstFile = new gutil.File({
                contents: new Buffer(0),
            });
        }
        this.emit('data', firstFile);
        this.emit('end');
    }
    return through(write, end);
};

var generateRunner = (function () {

    var _trySortByDepends = function (fileList, srcList) {
        var indexInSrc = function (filePath) {
            function matchName(srcName, basename, i) {
                srcName = srcName.toLowerCase();
                basename = basename.toLowerCase();
                //console.log(srcName + ' ' + basename + ' ' + i);
                var filename = Path.basename(basename, Path.extname(basename));
                if (srcName === basename) {
                    return i;
                }
                // 按名字相近的模块匹配顺序
                if (srcName.substring(0, filename.length) === filename) {
                    return i + 0.5;
                }
                var srcFileName = Path.basename(srcName, Path.extname(srcName));
                if (filename.substring(0, srcFileName.length) === srcFileName) {
                    return i + 0.6;
                }
                return -1;
            }
            //console.log('filePath ' + filePath);
            // test basename (with ext)
            var basename = Path.basename(filePath);
            // test filename (without ext)
            for (var i = 0; i < srcList.length; i++) {
                var srcName = Path.basename(srcList[i]);
                var index = matchName(srcName, basename, i);
                if (index === -1) {
                    index = matchName('test' + srcName, basename, i);
                }
                if (index !== -1) {
                    return index;
                }
            }
            return -1;
        };
        fileList.sort(function (lhs, rhs) {
            return indexInSrc(lhs) - indexInSrc(rhs);
        });
    }

    var _generateRunnerContents = function (template, fileList, dest, title) {
        var scriptElements = '';
        for (var i = 0; i < fileList.length; i++) {
            if (fileList[i]) {
                if (i > 0) {
                    scriptElements += '\r\n    ';
                }
                scriptElements += ('<script src="' + Path.relative(dest, fileList[i]) + '"></script>');
            }
        }
        var data = { file: null, title: title, scripts: scriptElements };
        return new Buffer(gutil.template(template, data));
    };

    return function (templatePath, dest, title, lib_min, lib_dev, srcList) {
        var template = fs.readFileSync(templatePath);

        function write(file) {
            var fileList = file.contents.toString().split(',');
            _trySortByDepends(fileList, srcList);
            // runner.html
            file.contents = _generateRunnerContents(template, lib_min.concat(fileList), dest, title);
            file.path = Path.join(file.base, Path.basename(templatePath));
            this.emit('data', file);
            // runner.dev.html
            var ext = Path.extname(file.path);
            var filename = Path.basename(file.path, ext) + '.dev' + ext;
            this.emit('data', new gutil.File({
                contents: _generateRunnerContents(template, lib_dev.concat(fileList), dest, title),
                base: file.base,
                path: Path.join(file.base, filename)
            }));

            this.emit('end');
        }
        return through(write);
    };
})();

var generateReference = function (files, destPath) {
    var destDir = Path.dirname(destPath);
    return gulp.src(files, { read: false, base: './' })
                .pipe(toFileList())
                .pipe(through(function (file) {
                    function generateContents(fileList) {
                        var scriptElements = '';
                        for (var i = 0; i < fileList.length; i++) {
                            if (fileList[i]) {
                                scriptElements += ('/// <reference path="' + Path.relative(destDir, fileList[i]) + '" />\r\n');
                            }
                        }
                        return new Buffer(scriptElements);
                    }
                    var fileList = file.contents.toString().split(',');
                    file.contents = generateContents(fileList);
                    file.base = destDir;
                    file.path = destPath;
                    this.emit('data', file);
                    this.emit('end');
                }))
                .pipe(gulp.dest(destDir));
};

module.exports = {
    toFileList: toFileList,
    generateRunner: generateRunner,
    generateReference: generateReference,
    callback: (function (callback) {
        var stream = new Stream.Transform({ objectMode: true });
        stream._transform = function (file, unused, cb) {
            callback()
            cb(null, file);
        }
        return stream;
    }),
};
