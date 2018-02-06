gulp-polymer-config-build
=========================

Use this gulp plugin to easily replace polymer-cli build command. This
will still use your build configs from your polymer.json, so setup is
quick and easy.

The `createBuildStreams` function returns a javascript object for each
build, with the key being the build name and the value a vinyl stream
that can be piped using gulp.

You can override the source stream by supplying `source` in the
`opts` argument. By default, `polymerProject.sources()` is used.

# Basic Example

```javascript
'use strict';

const del = require('del');
const path = require('path');
const gulp = require('gulp');
const polymerBuild = require('polymer-build');
const polymerConfigBuild = require('gulp-polymer-config-build');
const buildDirectory = 'build';

// get a PolymerProject object based on your polymer.json
const polymerProject = new polymerBuild.PolymerProject(require('./polymer.json'));

gulp.task('build', () => {
  console.log(`Deleting ${buildDirectory} directory...`);
  del([buildDirectory]).then(() => {
    const builds = polymerConfigBuild.createBuildStreams(polymerProject);

    for (let name in builds) {
      let dir = path.join(buildDirectory, name);
      builds[name].pipe(gulp.dest(dir));
    }
  });
});
```

# Overriding sources stream
```javascript
    const opts = {};
    opts.sources = polymerProject.sources()
        .pipe(myCustomPipe);
    const builds = polymerConfigBuild.createBuildStreams(polymerProject, opts);
```
