'use strict';
const add = require('gulp-add');
const polymerBuild = require('polymer-build');
const path = require('path');
const mergeStream = require('merge-stream');
const logging = require('./logging');
const optimizeStreams = require('./optimize-streams');
const streams = require('./streams');
const loadConfig = require("./load-config");

const logger = logging.getLogger('polymer-build');

/**
 * Creates a single buildstream
 * @param {PolymerProject} polymerProject a PolymerProject instance
 * @param {Object} buildOpts build options object
 * @param {Object} opts plugin options
 * @return {Stream} the final build stream
 */
function createBuildStream(polymerProject, buildOpts, opts) {
  return new Promise(resolve => {
    const buildName = buildOpts.name || 'default';
    const optimizeOptions = {css: buildOpts.css, js: buildOpts.js, html: buildOpts.html};
    // If no name is provided, write directly to the build/ directory.
    // If a build name is provided, write to that subdirectory.
    opts.buildDirectory = opts.buildDirectory || 'build';
    const buildDirectory = path.join(opts.buildDirectory, buildName);
    logger.debug(`"${buildDirectory}": Building with buildOpts:`, buildOpts);

    // Fork the two streams to guarentee we are working with clean copies of each
    // file and not sharing object references with other builds.
    const sources = opts.sources || polymerProject.sources();
    const sourcesStream = polymerBuild.forkStream(sources);

    const depsStream = polymerBuild.forkStream(polymerProject.dependencies());
    const htmlSplitter = new polymerBuild.HtmlSplitter();
    let buildStream = streams.pipeStreams([
      mergeStream(sourcesStream, depsStream),
      htmlSplitter.split(),
      optimizeStreams.getOptimizeStreams(optimizeOptions),
      htmlSplitter.rejoin()
    ]);
    const compiledToES5 = Boolean(optimizeOptions.js && optimizeOptions.js.compile);
    if (compiledToES5) {
      buildStream = buildStream.pipe(polymerProject.addBabelHelpersInEntrypoint())
        .pipe(polymerProject.addCustomElementsEs5Adapter());
    }
    const bundled = Boolean(buildOpts.bundle);
    if (bundled) {
      const bundlerOptions = {
        rewriteUrlsInTemplates: true
      };
      if (typeof buildOpts.bundle === 'object') {
        Object.assign(bundlerOptions, buildOpts.bundle);
      }
      buildStream = buildStream.pipe(polymerProject.bundler(bundlerOptions));
    }
    if (buildOpts.insertPrefetchLinks) {
      buildStream = buildStream.pipe(polymerProject.addPrefetchLinks());
    }
    buildStream.once('data', () => {
      logger.info(`(${buildName}) Building...`);
    });
    if (buildOpts.basePath) {
      let basePath = buildOpts.basePath === true ? buildName : buildOpts.basePath;
      if (!basePath.startsWith('/')) {
        basePath = '/' + basePath;
      }
      if (!basePath.endsWith('/')) {
        basePath += '/';
      }
      buildStream = buildStream.pipe(polymerProject.updateBaseTag(basePath));
    }
    if (buildOpts.addPushManifest) {
      buildStream = buildStream.pipe(polymerProject.addPushManifest());
    }

    // If a service worker was requested, parse the service worker config file
    // while the build is in progress. Loading the config file during the build
    // saves the user ~300ms vs. loading it afterwards.
    const swPrecacheConfigPath = path.resolve(
      polymerProject.config.root, buildOpts.swPrecacheConfig || 'sw-precache-config.js');

    if (buildOpts.addServiceWorker) {
      loadConfig.loadServiceWorkerConfig(swPrecacheConfigPath)
        .then(swConfig => {
          logger.debug(`Generating service worker...`);
          if (swConfig) {
            logger.debug(`Service worker config found`, swConfig);
          } else {
            logger.debug(`No service worker configuration found at ` +
                `${swPrecacheConfigPath}, continuing with defaults`);
          }

          return polymerBuild.generateServiceWorker({
            buildRoot: buildDirectory,
            project: polymerProject,
            swPrecacheConfig: swConfig || undefined,
            bundled: bundled
          }).then(contents => {
            contents = contents.toString('utf8');
            buildStream = buildStream.pipe(add('service-worker.js', contents));
            resolve(buildStream);
          });
        });
    } else {
      resolve(buildStream);
    }
  });
}

/**
 * Creates forked build streams based on polymer.json build config
 * @param {PolymerProject} polymerProject a PolymerProject instance
 * @param {Obejct} opts plugin options
 * @return {Object} an object literal containing streams for each build
 */
function createBuildStreams(polymerProject, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    // TODO: validate build config
    const buildStreams = {};
    const builds = polymerProject.config.builds;

    const promises = [];
    for (let buildOptions of builds) {
      let name = buildOptions.name;
      promises.push(createBuildStream(polymerProject, buildOptions, opts)
        .then(buildStream => {
          buildStreams[name] = buildStream;
        })
      );
    }

    Promise.all(promises).then(() => {
      resolve(buildStreams);
    });
  });
}

module.exports.createBuildStreams = createBuildStreams;
module.exports.waitFor = streams.waitFor;
