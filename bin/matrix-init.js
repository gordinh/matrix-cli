require('colors');

debugLog = require('debug');
var debug = debugLog('cli');
var async = require('async');

showTheHelp = (process.argv.indexOf('--help') > -1);

Matrix = {};
Matrix.version = require('../package.json').version;
Matrix.config = require('../config/index');
Matrix.api = require('matrix-node-sdk');
_ = require('lodash');

var program = require('commander');
program.parse(process.argv);
Matrix.pkgs = program.args;
Matrix.localization = require('../lib/localization');
Matrix.localesFolder = __dirname + '/../config/locales';
Matrix.config.locale = 'en'; // set default locale
t = Matrix.localization.get; // international translator


Matrix.helpers = require('../lib/helpers');
//sets Matrix.config with local variables
Matrix.config = _.assign(Matrix.config, Matrix.helpers.getConfig());
//set default locale
//Use this to validate for user and display messages accordingly
Matrix.validate = require('./matrix-validate');

// do user monitoring
if (_.has(Matrix.config, 'user.trackOk') && Matrix.config.user.trackOk === true) {
  process.env.TRACKOK = 'true';
}

// These are used to override if there is no environment set in config
var options = {
  clientId: 'AdMobilizeAPIDev',
  clientSecret: 'AdMobilizeAPIDevSecret',
  apiUrl: process.env['MATRIX_API_SERVER'] || 'https://rc-api.admobilize.com',
  mxssUrl: process.env['MATRIX_STREAMING_SERVER'] || 'https://rc-mxss.admobilize.com',
  appsBucket: process.env['MATRIX_APPS_BUCKET'] || 'admobilize-matrix-apps'
};

// neeed the async to ensure config file is saved before continuing
async.series([
  function(cb) {
    if (_.has(Matrix.config.environment, 'name')) {
      debug('Env: ', Matrix.config.environment.name);
      options.apiUrl = Matrix.config.environment.api;
      options.mxssUrl = Matrix.config.environment.mxss;
      options.appsBucket = Matrix.config.environment.appsBucket;
    }
    cb();
  },
  function(cb) {
    if (!_.has(Matrix.config.environment, 'name')) {
      debug('No env set, using rc default');
      Matrix.config.environment = {
        name: process.env.NODE_ENV || 'rc',
        api: options.apiUrl,
        mxss: options.mxssUrl,
        appsBucket: options.appsBucket
      };
      Matrix.helpers.saveConfig(cb);
    } else {
      cb();
    }
  }
], function continueInit(err) {
  if (err) console.error(err);



  if (Matrix.config.environment.name === 'rc' || Matrix.config.environment.name === 'production') {
    options.clientId = 'AdMobilizeClientID'
    options.clientSecret = 'AdMobilizeClientSecret'
  }

  // strip out
  Matrix.options = options;

  Matrix.api.makeUrls(options.apiUrl, options.mxssUrl);

  // to make user / device / etc available to sdk
  Matrix.api.setConfig(Matrix.config);

  //Loader, currently using the default braille spinner
  Matrix.loader = require('../lib/loader');
  Matrix.loader.type('braille'); //Types: braille, matrix

  Matrix.firebase = require('matrix-firebase');
  Matrix.firebaseInit = function(cb) {
    var currentDevice = (!_.isEmpty(Matrix.config.device) && !_.isEmpty(Matrix.config.device.identifier)) ? Matrix.config.device.identifier : '';
    debug('Firebase Init', Matrix.config.user.id, currentDevice );
    Matrix.firebase.init(
      Matrix.config.user.id,
      currentDevice,
      Matrix.config.user.token,
      Matrix.config.environment.name,
      function(err) {
        if (err) { debug( 'firebase error', err)}
        var errorCode = Matrix.validate.firebaseError(err);
        if (errorCode != 0) {
          if (errorCode == 1) {
            //TODO try to refresh token before failing
            Matrix.loader.stop();
            console.log('Invalid user, log in again'.yellow);
            Matrix.helpers.logout(function() {
              process.exit();
            });
          } else if (errorCode == 4) {
            console.log('Network timeout, please check your connection and try again'.yellow);
          } else {
            console.error('Error initializing Firebase: '.yellow, err.message.red);

            // specific info on how to resolve
            if (err.code === 'auth/custom-token-mismatch') {
              console.error('Server environments may be incongruent.',
                'Rerun `%s` and login again to reset your configuration', 'matrix set env <dev/production>'.yellow
              );
            }
          }
          process.exit();
        }
        return cb();
      });
  }


})