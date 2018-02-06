'use strict';
const polymerBuild = require('polymer-build');
const ProjectConfig = require('polymer-project-config').ProjectConfig;
const path = require('path');
const logging = require('plylog');
const vinylFs = require('vinyl-fs');
const mergeStream = require('merge-stream');
const optimizeStreams = require('./optimize-streams');
const streams = require('./streams');
const loadConfig = require("./load-config");
const logger = logging.getLogger('cli.build.build');

function createBuildStream(polymerProject, buildOpts, opts) {
	const buildName = buildOpts.name || 'default';
	const optimizeOptions = { css: buildOpts.css, js: buildOpts.js, html: buildOpts.html };
	// If no name is provided, write directly to the build/ directory.
	// If a build name is provided, write to that subdirectory.
  opts.buildDirectory = opts.buildDirectory || 'build';
	const buildDirectory = path.join(opts.buildDirectory, buildName);
	logger.debug(`"${buildDirectory}": Building with buildOpts:`, buildOpts);

	// Fork the two streams to guarentee we are working with clean copies of each
	// file and not sharing object references with other builds.
  const sources = opts.sources || polymerProject.sources()
	const sourcesStream = polymerBuild.forkStream(sources);

	const depsStream = polymerBuild.forkStream(polymerProject.dependencies());
	const htmlSplitter = new polymerBuild.HtmlSplitter();
	let buildStream = streams.pipeStreams([
		mergeStream(sourcesStream, depsStream),
		htmlSplitter.split(),
		optimizeStreams.getOptimizeStreams(optimizeOptions),
		htmlSplitter.rejoin()
	]);
	const compiledToES5 = !!(optimizeOptions.js && optimizeOptions.js.compile);
	if (compiledToES5) {
		buildStream = buildStream.pipe(polymerProject.addBabelHelpersInEntrypoint())
			.pipe(polymerProject.addCustomElementsEs5Adapter());
	}
	const bundled = !!(buildOpts.bundle);
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
			basePath = basePath + '/';
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

  let loadSwConfig;

	if (buildOpts.addServiceWorker) {
		loadSwConfig = loadConfig.loadServiceWorkerConfig(swPrecacheConfigPath);
  } else {
    loadSwConfig = Promise.resolve(undefined);
  }

  loadSwConfig.then(swConfig => {
    // There is nothing left to do, so wait for the build stream to complete.
    streams.waitFor(buildStream).then(() => {
      if (buildOpts.addServiceWorker) {
        logger.debug(`Generating service worker...`);
        if (swConfig) {
          logger.debug(`Service worker config found`, swConfig);
        }
        else {
          logger.debug(`No service worker configuration found at ` +
              `${swPrecacheConfigPath}, continuing with defaults`);
        }
        return polymerBuild.addServiceWorker({
          buildRoot: buildDirectory,
          project: polymerProject,
          swPrecacheConfig: swConfig || undefined,
          bundled: bundled,
        });
      }
    }).then(() => {
      buildStream.emit('done');
    });
  });

	return buildStream;
}

function createBuildStreams(polymerProject, opts) {
  opts = opts || {};

  // TODO validate build config
  const buildStreams = {};
  const builds = polymerProject.config.builds; 

  for (let buildOptions of builds) {
    let name = buildOptions.name;
    buildStreams[name] = createBuildStream(polymerProject, buildOptions, opts);
  }

  return buildStreams;
}

module.exports.createBuildStreams = createBuildStreams;
