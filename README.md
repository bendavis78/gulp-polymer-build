gulp-polymer-build
=========================

Use this gulp plugin to easily extend the `polymer-cli build` command.
This will still use your build configs from your polymer.json, so setup
is quick and easy.

The `createBuildStreams` function returns a promise that resolves to a
javascript object for each build, with the key being the build name and
the value a vinyl stream that can be piped using gulp.

You can override the source stream by supplying `source` in the
`opts` argument. By default, `polymerProject.sources()` is used.

## Basic Example

```javascript
'use strict';

const del = require('del');
const path = require('path');
const gulp = require('gulp');
const polymerBuild = require('polymer-build');
const configBuild = require('gulp-polymer-build');
const buildDirectory = 'build';

// promise that waits for stream to end
function waitFor(stream) {
  return new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

// get a PolymerProject object based on your polymer.json
const polymerProject = new polymerBuild.PolymerProject(require('./polymer.json'));

gulp.task('build', () => {
  console.log(`Deleting ${buildDirectory} directory...`);
  del.sync([buildDirectory]);
  return configBuild.createBuildStreams(polymerProject).then(builds => {
    let promises = [];

    for (let name in builds) {
      let dir = path.join(buildDirectory, name);
      builds[name].pipe(gulp.dest(dir));
      // more post-processing pipes can be added here

      promises.push(waitFor(builds[name]));
    }

    // ensure gulp waits for all streams to end
    return Promise.all(promises);
  });
});
```

## Overriding the sources stream
```javascript
    const opts = {};
    opts.sources = polymerProject.sources()
        .pipe(myCustomPipe);
    const builds = configBuild.createBuildStreams(polymerProject, opts);
```
