#!/usr/bin/env node

require('./matrix-init');
var debug = debugLog('account');
var async = require('async');

Matrix.localization.init(Matrix.localesFolder, Matrix.config.locale, function () {

  Matrix.validate.user();
  Matrix.loader.start();
  var target = Matrix.pkgs[0];

  if (Matrix.pkgs.length > 1) { //If more than one arg, incorrect format
    displayHelp();
  } else {
    Matrix.firebaseInit(function () {
      if (Matrix.pkgs.length === 1 && target === 'profile') { //If asking for profile specifically
        async.waterfall([
          Matrix.helpers.profile.get,
          function (profile, next) {
            Matrix.helpers.profile.show(profile, function (err) { next(err, profile); });
          },
          Matrix.helpers.profile.prompt,
          Matrix.helpers.profile.update
        ], function (err) {
          if (err) console.log(err);
          else {
            Matrix.loader.stop();
            console.log('Update completed succesfully');
          }
          process.exit();
        });
      } else {
        async.waterfall([
          Matrix.helpers.profile.get,
          Matrix.helpers.profile.show
        ], function(){
          process.exit();
        });
      }
    });
  }

  function displayHelp() {
    Matrix.loader.stop();
    console.log('\n> matrix account ¬\n');
    console.log('\t    matrix account profile -', t('matrix.help_account_profile').grey)
    console.log('\n')
    process.exit(1);
  }
});
