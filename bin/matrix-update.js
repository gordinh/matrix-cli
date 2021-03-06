#!/usr/bin/env node

require('./matrix-init');
var debug = debugLog('update');

Matrix.localization.init(Matrix.localesFolder, Matrix.config.locale, function () {

  if (!Matrix.pkgs.length || showTheHelp) {
    return displayHelp();
  }

  //Make sure the user has logged in
  Matrix.validate.user();
  Matrix.validate.device();

  var appName = Matrix.pkgs[0];

  console.log('____ | ' + t('matrix.update.upgrading_to') + ':' + t('matrix.update.latest_version')+ ' ', appName, ' ==> '.yellow, Matrix.config.device.identifier);

  Matrix.loader.start();

  Matrix.firebaseInit(function () {

    Matrix.firebase.app.search(appName, function (result) {

      debug(result)

      if (_.isUndefined(result)) {
        Matrix.loader.stop();
        console.log(t('matrix.update.app_undefined', { app: appName.yellow }));
        return process.exit();
      }

      var versionId = result.meta.currentVersion;

      debug('VERSION: '.blue, versionId, 'APP: '.blue, appId);

      var options = {
        policy: result.versions[versionId].policy,
        name: appName,
        id: appId,
        versionId: versionId
      }

      Matrix.helpers.installApp(options, function (err) {
        Matrix.loader.stop();
        if (err) {
          console.log(err);
          process.exit(1);
        }

        console.log(t('matrix.update.app_update_successfully').green);
        process.exit(0);
      });

    });
  });


  function displayHelp() {
    console.log('\n> matrix update ¬ \n');
    console.log('\t                 matrix update -', t('matrix.update.help_update').grey)
    console.log('\t           matrix update <app> -', t('matrix.update.help_update_app').grey)
    console.log('\t matrix update <app> <version> -', t('matrix.update.help_update_app_version').grey)
    console.log('\n')
    process.exit();
  }
});
