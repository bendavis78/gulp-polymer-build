'use strict';
const fs = require("fs");
const logging = require('./logging');
const logger = logging.getLogger('polymer-build.load-config');

/**
 * Loads service worker config
 * @param {string} configFile config file path
 * @return {void}
 */
function loadServiceWorkerConfig(configFile) {
  return new Promise(resolve => {
    fs.stat(configFile, statError => {
      let config = null;
      // only log if the config file exists at all
      if (!statError) {
        try {
          config = require(configFile);
        } catch (loadError) {
          logger.warn(`${configFile} file was found but could not be loaded`, {loadError});
        }
      }
      resolve(config);
    });
  });
}
exports.loadServiceWorkerConfig = loadServiceWorkerConfig;
