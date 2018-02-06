'use strict';
/**
 * Waits for the given ReadableStream
 */
function waitFor(stream) {
  return new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}
exports.waitFor = waitFor;
/**
 * pipeStreams() takes in a collection streams and pipes them together,
 * returning the last stream in the pipeline. Each element in the `streams`
 * array must be either a stream, or an array of streams (see PipeStream).
 * pipeStreams() will then flatten this array before piping them all together.
 */
function pipeStreams(streams) {
    return Array.prototype.concat.apply([], streams)
        .reduce((a, b) => {
        return a.pipe(b);
    });
}
exports.pipeStreams = pipeStreams;
