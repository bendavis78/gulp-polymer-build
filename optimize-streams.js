'use strict';
const babel = require('babel-core');
const cssSlam = require('css-slam');
const gulpif = require('gulp-if');
const htmlMinifier = require('html-minifier');
const stream = require('stream');
const babelPresetES2015 = require('babel-preset-es2015');
const babiliPreset = require('babel-preset-babili');
const babelPresetES2015NoModules = babelPresetES2015.buildPreset({}, {modules: false});
const externalHelpersPlugin = require('babel-plugin-external-helpers');
const logging = require('./logging');

const logger = logging.getLogger('polymer-build.optimize-streams');

/**
 * GenericOptimizeTransform is a generic optimization stream. It can be extended
 * to create a new kind of specific file-type optimizer, or it can be used
 * directly to create an ad-hoc optimization stream for different libraries.
 * If the transform library throws an exception when run, the file will pass
 * through unaffected.
 */
class GenericOptimizeTransform extends stream.Transform {
  constructor(optimizerName, optimizer, optimizerOptions) {
    super({objectMode: true});
    this.optimizer = optimizer;
    this.optimizerName = optimizerName;
    this.optimizerOptions = optimizerOptions || {};
  }
  _transform(file, _encoding, callback) {
    // TODO(fks) 03-07-2017: This is a quick fix to make sure that
    // 'webcomponentsjs' files aren't compiled down to ES5, because they contain
    // an important ES6 shim to make custom elements possible. Remove/refactor
    // when we have a better plan for excluding some files from optimization.
    if (!file.path || file.path.indexOf('webcomponentsjs/') >= 0 ||
      file.path.indexOf('webcomponentsjs\\') >= 0) {
      callback(null, file);
      return;
    }
    if (file.contents) {
      try {
        let contents = file.contents.toString();
        contents = this.optimizer(contents, this.optimizerOptions);
        file.contents = new Buffer(contents);
      } catch (error) {
        logger.warn(
          `${this.optimizerName}: Unable to optimize ${file.path}`,
          {err: error.message || error});
      }
    }
    callback(null, file);
  }
}
exports.GenericOptimizeTransform = GenericOptimizeTransform;
/**
 * JSBabelTransform uses babel to transpile Javascript, most often rewriting
 * newer ECMAScript features to only use language features available in major
 * browsers. If no options are given to the constructor, JSBabelTransform will
 * use
 * a babel's default 'ES6 -> ES5' preset.
 */
class JSBabelTransform extends GenericOptimizeTransform {
  constructor(config) {
    const transform = (contents, options) => {
      return babel.transform(contents, options).code;
    };
    super('.js', transform, config);
  }
}
/**
 * A convenient stream that wraps JSBabelTransform in our default 'compile'
 * options.
 */
class JSDefaultCompileTransform extends JSBabelTransform {
  constructor() {
    super({
      presets: [babelPresetES2015NoModules],
      plugins: [externalHelpersPlugin]
    });
  }
}
exports.JSDefaultCompileTransform = JSDefaultCompileTransform;
/**
 * A convenient stream that wraps JSBabelTransform in our default 'minify'
 * options. Yes, it's strange to use babel for minification, but our minifier
 * babili is actually just a plugin for babel.
 * simplyComparisons plugin is disabled
 * (https://github.com/Polymer/polymer-cli/issues/689)
 */
class JSDefaultMinifyTransform extends JSBabelTransform {
  constructor() {
    super({
      presets: [babiliPreset(null, {unsafe: {simplifyComparisons: false}})]
    });
  }
}
exports.JSDefaultMinifyTransform = JSDefaultMinifyTransform;
/**
 * CSSMinifyTransform minifies CSS that pass through it (via css-slam).
 */
class CSSMinifyTransform extends GenericOptimizeTransform {
  constructor(options) {
    super('css-slam', cssSlam.css, options);
  }
  _transform(file, encoding, callback) {
    // css-slam will only be run if the `stripWhitespace` option is true.
    // Because css-slam itself doesn't accept any options, we handle the
    // option here before transforming.
    if (this.optimizerOptions.stripWhitespace) {
      super._transform(file, encoding, callback);
    }
  }
}
exports.CSSMinifyTransform = CSSMinifyTransform;
/**
 * InlineCSSOptimizeTransform minifies inlined CSS (found in HTML files) that
 * passes through it (via css-slam).
 */
class InlineCSSOptimizeTransform extends GenericOptimizeTransform {
  constructor(options) {
    super('css-slam', cssSlam.html, options);
  }
  _transform(file, encoding, callback) {
    // css-slam will only be run if the `stripWhitespace` option is true.
    // Because css-slam itself doesn't accept any options, we handle the
    // option here before transforming.
    if (this.optimizerOptions.stripWhitespace) {
      super._transform(file, encoding, callback);
    }
  }
}
exports.InlineCSSOptimizeTransform = InlineCSSOptimizeTransform;
/**
 * HTMLOptimizeTransform minifies HTML files that pass through it
 * (via html-minifier).
 */
class HTMLOptimizeTransform extends GenericOptimizeTransform {
  constructor(options) {
    super('html-minify', htmlMinifier.minify, options);
  }
}
exports.HTMLOptimizeTransform = HTMLOptimizeTransform;
/**
 * Returns an array of optimization streams to use in your build, based on the
 * OptimizeOptions given.
 * @param {Object} options optimize options
 * @return {Array} an array of streams
 */
function getOptimizeStreams(options) {
  options = options || {};
  const streams = [];
  // compile ES6 JavaScript using babel
  if (options.js && options.js.compile) {
    streams.push(gulpif(/\.js$/, new JSDefaultCompileTransform()));
  }
  // minify code (minify should always be the last transform)
  if (options.html && options.html.minify) {
    streams.push(gulpif(/\.html$/, new HTMLOptimizeTransform({
      collapseWhitespace: true,
      removeComments: true
    })));
  }
  if (options.css && options.css.minify) {
    streams.push(gulpif(/\.css$/, new CSSMinifyTransform({stripWhitespace: true})));
    // TODO(fks): Remove this InlineCSSOptimizeTransform stream once CSS
    // is properly being isolated by splitHtml() & rejoinHtml().
    streams.push(gulpif(/\.html$/, new InlineCSSOptimizeTransform({stripWhitespace: true})));
  }
  if (options.js && options.js.minify) {
    streams.push(gulpif(/\.js$/, new JSDefaultMinifyTransform()));
  }
  return streams;
}
exports.getOptimizeStreams = getOptimizeStreams;
