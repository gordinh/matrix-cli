#!/usr/bin/env node

require('./matrix-init');
var prompt = require('prompt');
var debug = debugLog('register');

Matrix.localization.init(Matrix.localesFolder, Matrix.config.locale, function () {
  if (Matrix.pkgs.length > 0) {
    var command = Matrix.pkgs[0];
    if (command !== 'device') {
      console.warn('matrix register', command, 'is not a valid command');
      process.exit(1);
    } else {
      Matrix.validate.user(); //Make sure the user has logged in
      console.log(t('matrix.register.creating_device'))
      Matrix.loader.start();
      // do device Registration
      var deviceSchema = {
        properties: {
          name: {
            required: true,
            description: 'device name'
          },
          description: {
            description: 'device description'
          }
          // for when this is ready
          // serial: {
          //   required: true
          //   description: 'serial number'
          // }
        }
      };
      Matrix.loader.stop();
      prompt.delimiter = '';
      prompt.message = 'Device Registration -- ';
      prompt.start();

      //TODO: Async this cascade
      prompt.get(deviceSchema, function (err, result) {
        Matrix.loader.start();
        // all of the below is untested - next line = matrix use
        // Matrix.config.device.identifier = result.deviceId;

        Matrix.helpers.saveConfig(function () {

          Matrix.firebaseInit(function () {
            debug('Firebase init passed');

            Matrix.firebase.user.getAllDevices(function (devices) {

              var deviceIds = _.keys(devices);
              debug('Existing Device Ids', deviceIds)

              var events = {
                error: function (err) {
                  if (err.hasOwnProperty('state') && err.state == 'device-provisioning-in-progress') {
                    debug('Provisioning device step... ignore this')
                  } else {
                    Matrix.loader.stop();
                    console.log('Error creating device '.red + deviceObj.name.yellow + ': '.red, err);
                    process.exit();
                  }
                },
                finished: function () {
                  Matrix.loader.stop();
                  console.log('Device registered successfully');
                },
                start: function () {
                  Matrix.loader.stop();
                  console.log('Device registration request formed...');
                  Matrix.loader.start();
                },
                progress: function () {
                  Matrix.loader.stop();
                  console.log('Registering device...');
                  Matrix.loader.start();
                }
              };

              var deviceObj = {
                type: 'matrix',
                osVersion: '0',
                version: require(__dirname + '/../package.json').version,
                name: result.name,
                description: result.description,
              };

              async.waterfall([
                function(callback) {
                  var duplicateDevice = [];

                  Matrix.firebase.device.list(function(ds) {
                    duplicateDevice = _.values(ds).filter(function(d) {
                      return d.name === result.name;
                    });
                    callback(null, duplicateDevice);
                  });
                },
                function(duplicate, callback) {
                  if(duplicate.length === 0 ) {
                    // fire off worker
                    Matrix.firebase.device.add(deviceObj, events)

                    // wrap this up
                    Matrix.firebase.user.watchForDeviceAdd(function(d){
                      var deviceId = d.key;

                      if ( !_.isEmpty(deviceId) && deviceIds.indexOf(deviceId) === -1 ){
                        debug('new device on user record!');
                        Matrix.loader.stop();
                        console.log('New Device'.green, deviceId);
                        Matrix.helpers.trackEvent('device-register', { did: deviceId });

                        // // add to local ref
                        // Matrix.config.device.deviceMap = _.merge({}, Matrix.config.device.appMap, d.val() );
                        // Matrix.helpers.saveConfig();


                        // fetch secret
                        // this part will be automated in the future. idk how.
                        Matrix.loader.start();
                        Matrix.api.device.getSecret(deviceId, function (err, secret) {
                          Matrix.loader.stop();
                          if (err) callback('Secret Error: ' + err);
                          else if (_.isUndefined(secret)) callback('No secret found: ' + secret);

                          // return the secret
                          console.log('\nSave your *device id* and *device secret*'.green)
                          console.log('You will not be able to see the secret for this device again'.grey)

                          console.log('\nSave the following to ~/.envrc on your Pi\n'.grey)
                          console.log('export MATRIX_DEVICE_ID='+ deviceId);
                          console.log('export MATRIX_DEVICE_SECRET='+ secret.results.deviceSecret )

                          console.log();
                          console.log('Make these available by running `source ~/.envrc` before running MATRIX OS'.grey );
                          console.log('\nSet up `matrix` CLI to target this device\n'.grey);
                          console.log('matrix use', deviceId);
                          console.log('or'.grey)
                          console.log('matrix use', result.name);
                          console.log();
                          Matrix.helpers.refreshDeviceMap(process.exit)
                        })
                      }


                    })
                    // #watchDeviceAdd
                    //
                  } else callback('Device name should be unique!'); //#duplicateDevice
                }
              ], function(err){
                if (err) {
                  Matrix.loader.stop();
                  console.error(err);
                  process.exit(1);
                }
              });
            });
            // #getAllDevices
            //
          })
          // ##firebaseInit
        });
      })
      // # prompt
    }
  } else {

    processPromptData(function (err, userData) {
      if (err) {
        console.log('Error: ', err);
        process.exit();
      }
      if (userData.password !== userData.confirmPassword) {
        return console.error('Passwords didn\'t match');
      }
      /** set the creds **/
      Matrix.config.user = {
        username: userData.username,
        password: userData.password
      };

      Matrix.config.user.jwt_token = true;

      Matrix.config.client = {};
      debug('Client', Matrix.options);

      Matrix.loader.start();
      Matrix.api.register.user(userData.username, userData.password, Matrix.options.clientId, function (err, out) {
        /*500 server died
        400 bad request
          user exists
          missing parameter
        401*/
        if (err) {
          Matrix.loader.stop();
          if (err.hasOwnProperty('status_code')) {
            if (err.status_code === 500) {
              console.log('Server unavailable, please try again later');
            } else if (err.status_code === 400) {
              console.log('Unable to create user ' + userData.username + ', user already exists');
            } else {
              console.log('Unknown error (' + err.status_code + '): ', err);
            }
          } else {
            if (err.hasOwnProperty('code') && err.code == 'ENOTFOUND') {
              console.error('Unable to reach server, please try again later');
            } else {
              console.error('Unknown error: ', err);
            }
          }
          process.exit();
        } else {
          var userOptions = {
            username: userData.username,
            password: userData.password,
            trackOk: userData.profile.trackOk
          }
          Matrix.helpers.login(userOptions, function (err) {
            if (err) {
              Matrix.loader.stop();
              console.log('Unable to login, your account was created but the profile info couldn\'t be updated'.red);
              process.exit(1);
            }

            Matrix.helpers.profile.update(userData.profile, function (err) {
              Matrix.loader.stop();
              debug('User', Matrix.config.user, out);
              if (err) {
                console.log('Unable to update profile, your account was created but the profile information couldn\'t be updated'.yellow);
                process.exit(1);
              }
              console.log('User ' + userData.username + ' successfully created');
              process.exit();
            });
          });
        }
      });
    });
  }
});

function processPromptData(cb) {
  Matrix.helpers.profile.prompt(function (err, profile) {
    var schema = {
      properties: {
        username: {
          required: true,
          pattern: /\S+@\S+\.\S+/,
          message: 'Username must be a valid email',
          description: 'Username: '
        },
        password: {
          required: true,
          pattern: /^(?=.*?[a-zA-Z])(?=.*?[0-9]).{6,}/,
          message: 'Password must be at least 6 characters long and should contain a lower case letter and a number',
          hidden: true,
          description: 'Password: '
        },
        confirmPassword: {
          hidden: true,
          description: 'Confirm Password: '
        }
      }
    };

    prompt.delimiter = '';
    prompt.message = 'User -- ';
    prompt.start();
    prompt.get(schema, function (err, result) {
      /*if (err && err.toString().indexOf('canceled') > 0) {
        err = new Error('User registration cancelled');
      } */
      result.profile = profile;
      cb(err, result);
    });
  });
}
