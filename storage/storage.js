/**
 * Copyright 2017 University of Castilla - La Mancha
 */
var zerorpc = require('zerorpc');
var async = require('async');
var fs = require('fs');
var du = require('du');
var path = require('path');
var exec = require('child_process').exec;
var mongo = require('mongodb').MongoClient;
var utils = require('../overlord/utils');
var logger = utils.logger;

/***********************************************************
 * --------------------------------------------------------
 * MODULE NAME
 * --------------------------------------------------------
 ***********************************************************/
var MODULE_NAME = "ST";

/***********************************************************
 * --------------------------------------------------------
 * GLOBAL VARS
 * --------------------------------------------------------
 ***********************************************************/
var cfg = process.argv[2];
var constants = {};
var db = null;
var zserver = null;

// Application locks
var _app_lock = {};

/***********************************************************
 * --------------------------------------------------------
 * STORAGE FUNCTIONS
 * --------------------------------------------------------
 ***********************************************************/

/**
 * Copy application data to storage.
 */
var copyApplication = function(app_id, src_path, cb){
   // Wait for the lock
   if(_app_lock[app_id]){
      return setTimeout(copyApplication, 1000, app_id, src_path, cb);
   }
   // Set lock
   _app_lock[app_id] = true;

   // Get destination path
   var dst_path = constants.appstorage+path.sep+app_id;

   async.waterfall([
      // Check source path exists
      function(wfcb){
         fs.access(src_path, function(error){
            return wfcb(error);
         });
      },
      // Check destination path does not exist
      function(wfcb){
         fs.access(dst_path, function(error){
            if(error) return wfcb(null);
            else return wfcb(new Error('ID "'+app_id+'" already exists in storage.'))
         });
      },
      // Copy application data to storage
      function(wfcb){
         exec('rsync -r -q --exclude=".git" '+src_path+'/ '+dst_path, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Create input data folder
      function(wfcb){
         fs.mkdir(constants.inputstorage+path.sep+app_id, function(error){
            return wfcb(error);
         });
      },
      // Create repository
      function(wfcb){
         exec('git init && git add * && git commit -q -m "Application created" && touch .git/git-daemon-export-ok',{
            cwd: dst_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      }
   ],
   function(error){
      // Remove lock
      _app_lock[app_id] = false;
      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+app_id+'] Application copied to storage.');
      return cb(null);
   });
}

/**
 * Create experiment data
 */
var copyExperiment = function(exp_id, app_id, cb){
   // Wait for the lock
   if(_app_lock[app_id]){
      return setTimeout(copyExperiment, 1000, exp_id, app_id, cb);
   }
   // Set lock
   _app_lock[app_id] = true;

   // Get paths
   var repo_path = constants.appstorage+path.sep+app_id+path.sep;
   var app_input = constants.inputstorage+path.sep+app_id+path.sep;
   var exp_input = constants.inputstorage+path.sep+exp_id+path.sep;

   async.waterfall([
      // Check paths existence
      function(wfcb){
         fs.access(repo_path, function(error){
            if(error) return wfcb(error);
            fs.access(app_input, function(error){
               return wfcb(error);
            });
         });
      },
      // Remove previous branch
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exp_id+'] Creating experiment branch...');
         exec('git branch -D '+exp_id,{
            cwd: repo_path
         }, function(error, stdout, stderr){
            return wfcb(null);
         });
      },
      // Create experiment branch
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exp_id+'] Creating experiment branch...');
         exec('git checkout master && git branch '+exp_id,{
            cwd: repo_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Clone inputs
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exp_id+'] Cloning inputs...');
         exec('cp -as '+app_input+' '+exp_input,{
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      }
   ],
   function(error){
      // Remove lock
      _app_lock[app_id] = false;

      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exp_id+'] Experiment storage created.');
      return cb(null);
   });
}

/**
 * Discover labels in application or experiment.
 */
var discoverMetadata = function(app_id, exp_id, cb){
   // Wait for the lock
   if(_app_lock[app_id]){
      return setTimeout(discoverMetadata, 1000, app_id, exp_id, cb);
   }
   // Set lock
   _app_lock[app_id] = true;

   // Get paths
   var app_path = constants.appstorage+path.sep+app_id;
   var meta_labels_file = app_path+path.sep+'LABELS.meta';
   var meta_logs_file = app_path+path.sep+'LOGS.meta';

   var id = exp_id ? exp_id : app_id;

   var labels = {};
   var logs_meta = {};

   async.waterfall([
      // Checkout application or experiment
      function(wfcb){
         var tag = exp_id ? exp_id : "master";
         exec('git checkout '+tag,{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Get metadata file for logs
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+id+'] Searching logs metadata...');
         fs.access(meta_logs_file, function(error){
            if(error){
               // File does not exist
               logger.info('['+MODULE_NAME+']['+id+'] No LOGS.meta file.');
               return wfcb(null);
            } else {
               // File exists, read it
               logger.info('['+MODULE_NAME+']['+id+'] Reading metadata file: LOGS.meta.');
               fs.readFile(meta_logs_file, {encoding: 'utf8', flag: 'r'}, function(error, fcontent){
                  if(error) return wfcb(error);

                  // Parse JSON
                  try {
                     logs_meta = JSON.parse(fcontent);
                  } catch (e) {
                     return wfcb(e);
                  }
                  return wfcb(null);
               });
            }
         });
      },
      // Get metadata file
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+id+'] Searching labels metadata...');
         fs.access(meta_labels_file, function(error){
            if(error){
               // File does not exist
               logger.info('['+MODULE_NAME+']['+id+'] No LABELS.meta file.');
               return wfcb(null);
            } else {
               // File exists, read it
               logger.info('['+MODULE_NAME+']['+id+'] Reading metadata file: LABELS.meta.');
               fs.readFile(meta_labels_file, {encoding: 'utf8', flag: 'r'}, function(error, fcontent){
                  if(error) return wfcb(error);

                  // Parse JSON
                  try {
                     labels = JSON.parse(fcontent);
                  } catch (e) {
                     return wfcb(e);
                  }

                  // Convert defaults into arrays
                  for(var label in labels){
                     if(labels[label].default_value instanceof Array){
                        labels[label].default_value = labels[label].default_value.join('\n');
                     }
                  }
                  return wfcb(null);
               });
            }
         });
      },
      // Discover additional labels
      function(wfcb){
         // Get list of files/folders
         var files = fs.readdirSync(app_path);
         // Ignore hidden, i.e. starting with dot
         files = files.filter(item => !(/(^|\/)\.[^\/\.]/g).test(item));
         // Iterate
         for(var f in files){
            var full_path = app_path + path.sep + files[f];
            if(fs.statSync(full_path).isFile()){
               // Get labels in this file
               _getLabelsInFileSync(full_path, labels);
            }
         }
         return wfcb(null);
      },
      // Checkout master again
      function(wfcb){
         exec('git checkout master',{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      }
   ],
   function(error){
      // Remove lock
      _app_lock[app_id] = false;
      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+id+'] Successful metadata discovering.');
      return cb(null, {labels: labels, logs_meta: logs_meta});
   });
}

/**
 * Retrieve output data to local storage.
 */
var retrieveExperimentOutput = function(exp_id, src_path, cb){
   // Wait for the lock
   if(_app_lock[exp_id]){
      return setTimeout(retrieveExperimentOutput, 1000, exp_id, src_path, cb);
   }
   // Set lock
   _app_lock[exp_id] = true;

   // Get experiment output storage path
   var dst_path = constants.outputstorage+path.sep+exp_id+path.sep;

   async.waterfall([
      // Check paths existence
      function(wfcb){
         fs.access(dst_path, function(error){
            return wfcb(error);
         });
      },
      // Copy data
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exp_id+'] Copy output to storage...');
         exec('scp '+src_path+' '+dst_path,{
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      }
   ],
   function(error){
      // Remove lock
      _app_lock[exp_id] = false;

      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exp_id+'] Output retrieved.');
      return cb(null);
   });
}

/**
 * Prepare execution
 */
var prepareExecution = function(app_id, exp_id, exec_id, labels, cb){
   // Wait for the lock
   if(_app_lock[app_id]){
      return setTimeout(prepareExecution, 1000, app_id, exp_id, exec_id, labels, cb);
   }
   // Set lock
   _app_lock[app_id] = true;

   // Get application storage path
   var app_path = constants.appstorage+path.sep+app_id+path.sep;

   async.waterfall([
      // Check paths existence
      function(wfcb){
         fs.access(app_path, function(error){
            return wfcb(error);
         });
      },
      // Create execution branch
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exec_id+'] Creating execution branch...');
         exec('git checkout '+exp_id+' && git checkout -B '+exec_id,{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Apply labels
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exec_id+'] Applying labels...');
         _applyExperimentLabels(app_id, exp_id, exec_id, labels, wfcb);
      },
      // Commit changes and checkout master
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exec_id+'] Commiting changes...');
         var msg = 'Launched execution '+exec_id;
         exec('git add * && git commit -m "'+msg+'" && git checkout master',{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Create output data folder
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exec_id+'] Creating output folder...');
         fs.mkdir(constants.outputstorage+path.sep+exec_id, function(error){
            if(error && error.code === 'EEXIST') return wfcb(null);
            return wfcb(error);
         });
      }
   ],
   function(error){
      // Remove lock
      _app_lock[app_id] = false;

      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exp_id+'] Output retrieved.');
      return cb(null);
   });
}

/**
 * Remove experiment
 */
var removeExperiment = function(app_id, exp_id, cb){
   // Wait for the lock
   if(_app_lock[app_id]){
      return setTimeout(removeExperiment, 1000, app_id, exp_id, cb);
   }
   // Set lock
   _app_lock[app_id] = true;

   // Get application storage path
   var app_path = constants.appstorage+path.sep+app_id+path.sep;
   var input_path = constants.inputstorage+path.sep+exp_id+path.sep;

   async.waterfall([
      // Remove input path
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exp_id+'] Removing input path...');
         exec('rm -rf '+input_path,{
         }, function(error, stdout, stderr){
            if(error) logger.error('['+MODULE_NAME+']['+exp_id+'] Experiment input path does not exist: '+input_path);
            return wfcb(null);
         });
      },
      // Remove experiment branch
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exp_id+'] Removing experiment branch...');
         exec('git branch -D '+exp_id,{
            cwd: app_path
         }, function(error, stdout, stderr){
            if(error) logger.error('['+MODULE_NAME+']['+exp_id+'] Failed to remove experiment branch: '+error.message);
            return wfcb(null);
         });
      }
   ],
   function(error){
      // Remove lock
      _app_lock[app_id] = false;

      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exp_id+'] Experiment removed.');
      return cb(null);
   });
}

/**
 * Get application URL
 */
var getApplicationURL = function(app_id, cb){
   return cb(null, 'git://'+constants.public_url+':'+constants.git_port+'/'+app_id);
}

/**
 * Get execution output URL.
 */
var getExecutionOutputURL = function(exec_id, cb){
   return cb(null, 'rsync://'+exec_id+'@'+constants.public_url+':'+constants.rsync_port+'/'+exec_id+'_output');
}

/**
 * Get execution input URL.
 */
var getExecutionInputURL = function(exec_id, cb){
   return cb(null, 'rsync://'+exec_id+'@'+constants.public_url+':'+constants.rsync_port+'/'+exec_id+'_input');
}

/**
 * Get experiment code.
 */
var getExperimentCode = function(exp_id, app_id, fpath, cb){
   // Check fpath not null
   if(!fpath) return cb(new Error('File path cannot be null'));

   // Check absolute paths
   if(path.isAbsolute(fpath)) return cb(new Error('Absolute paths are not supported: '+fpath));

   // Get application storage path
   var app_path = constants.appstorage+path.sep+app_id+path.sep;

   // Get file contents
   exec('git show '+exp_id+':'+fpath,{
      cwd: app_path
   }, function(error, stdout, stderr){
      if(error) return cb(new Error('Error reading file "'+fpath+'": '+error));
      return cb(null, stdout);
   });
}

/**
 * Update experiment code
 */
var putExperimentCode = function(exp_id, app_id, fpath, fcontent, cb){
   // Check fpath not null
   if(!fpath) return cb(new Error('File path cannot be null'));

   // Check absolute paths
   if(path.isAbsolute(fpath)) return cb(new Error('Absolute paths are not supported: '+fpath));

   // Wait for the lock
   if(_app_lock[app_id]){
      return setTimeout(putExperimentCode, 1000, exp_id, app_id, fpath, fcontent, cb);
   }
   // Set lock
   _app_lock[app_id] = true;

   // Get application storage path
   var app_path = constants.appstorage+path.sep+app_id;

   async.waterfall([
      // Check path existence
      function(wfcb){
         fs.access(app_path, function(error){
            return wfcb(error);
         });
      },
      // Checkout experiment code
      function(wfcb){
         exec('git checkout '+exp_id,{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Create path
      function(wfcb){
         var dir_path = fpath;
         if(fcontent) dir_path = path.dirname(fpath);
         exec('mkdir -p '+dir_path,{
            cwd: app_path
         }, function(error, stdout, stderr){
            if(error) return wfcb(error);
            // Add .gitkeep if folder creation
            if(!fcontent){
               var gitkeep = dir_path+path.sep+'.gitkeep';
               exec('touch '+gitkeep+' && git add '+gitkeep,{
                  cwd: app_path
               }, function(error, stdout, stderr){
                  return wfcb(error);
               });
            } else {
               return wfcb(null);
            }
         });
      },
      // Write file
      function(wfcb){
         if(fcontent){
            fs.writeFile(app_path+path.sep+fpath, fcontent, 'utf8', wfcb);
         } else {
            return wfcb(null);
         }
      },
      // Add file
      function(wfcb){
         exec('git add '+fpath+' && git commit -m "Modified file '+fpath+'"',{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Checkout master
      function(wfcb){
         exec('git checkout master',{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      }
   ],
   function(error){
      // Remove lock
      _app_lock[app_id] = false;

      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exp_id+'] Updated file "'+fpath+'".');
      return cb(null);
   });
}

/**
 * Update experiment input
 */
var putExperimentInput = function(exp_id, app_id, fpath, src_path, cb){
   // Check fpath not null
   if(!fpath) return cb(new Error('File path cannot be null'));

   // Check absolute paths
   if(path.isAbsolute(fpath)) return cb(new Error('Absolute paths are not supported: '+fpath));

   // Wait for the lock
   if(_app_lock[exp_id]){
      return setTimeout(putExperimentCode, 1000, exp_id, app_id, fpath, src_path, cb);
   }
   // Set lock
   _app_lock[exp_id] = true;

   // Get experiment input storage path
   var exp_path = constants.inputstorage+path.sep+exp_id+path.sep;

   async.waterfall([
      // Check path existence
      function(wfcb){
         fs.access(exp_path, function(error){
            return wfcb(error);
         });
      },
      // Create path
      function(wfcb){
         var dir_path = fpath;
         // File or folder?
         if(src_path) dir_path = path.dirname(fpath);
         exec('mkdir -p '+dir_path,{
            cwd: exp_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Copy file
      function(wfcb){
         if(src_path){
            exec('scp '+src_path+' '+fpath,{
               cwd: exp_path
            }, function(error, stdout, stderr){
               return wfcb(error);
            });
         } else {
            return wfcb(null);
         }
      }
   ],
   function(error){
      // Remove lock
      _app_lock[exp_id] = false;

      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exp_id+'] Updated file "'+fpath+'".');
      return cb(null);
   });
}

/**
 * Delete experiment code
 */
var deleteExperimentCode = function(exp_id, app_id, fpath, cb){
   // Check absolute paths
   if(fpath && path.isAbsolute(fpath)) return cb(new Error('Absolute paths are not supported: '+fpath));

   // Wait for the lock
   if(_app_lock[app_id]){
      return setTimeout(deleteExperimentCode, 1000, exp_id, app_id, fpath, cb);
   }
   // Set lock
   _app_lock[app_id] = true;

   // Get application storage path
   var app_path = constants.appstorage+path.sep+app_id+path.sep;

   async.waterfall([
      // Check path existence
      function(wfcb){
         fs.access(app_path, function(error){
            return wfcb(error);
         });
      },
      // Checkout experiment code
      function(wfcb){
         exec('git checkout '+exp_id,{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Remove fpath
      function(wfcb){
         if(fpath){
            exec('rm -rf '+fpath, {
            }, function(error, stdout, stderr){
               return wfcb(error);
            });
         } else {
            return wfcb(null);
         }
      },
      // Remove in git
      function(wfcb){
         exec('git rm -r '+fpath+' && git commit -m "Removed '+fpath+'"',{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Checkout master
      function(wfcb){
         exec('git checkout master',{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      }
   ],
   function(error){
      // Remove lock
      _app_lock[app_id] = false;

      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exp_id+'] Updated file "'+fpath+'".');
      return cb(null);
   });
}

/**
 * Delete experiment input
 */
var deleteExperimentInput = function(exp_id, app_id, fpath, cb){
   // Check absolute paths
   if(fpath && path.isAbsolute(fpath)) return cb(new Error('Absolute paths are not supported: '+fpath));

   // Wait for the lock
   if(_app_lock[exp_id]){
      return setTimeout(deleteExperimentInput, 1000, exp_id, app_id, fpath, cb);
   }
   // Set lock
   _app_lock[exp_id] = true;

   // Get experiment input storage path
   var exp_path = constants.inputstorage+path.sep+exp_id+path.sep;

   async.waterfall([
      // Check path existence
      function(wfcb){
         fs.access(exp_path, function(error){
            return wfcb(error);
         });
      },
      // Remove fpath
      function(wfcb){
         if(fpath){
            exec('rm -rf '+fpath, {
               cwd: exp_path
            }, function(error, stdout, stderr){
               return wfcb(error);
            });
         } else {
            exec('rm -rf '+exp_path,{
            }, function(error, stdout, stderr){
               if(error) logger.error('['+MODULE_NAME+']['+exp_id+'] Experiment input path does not exist: '+exp_path);
               return wfcb(null);
            });
         }
      }
   ],
   function(error){
      // Remove lock
      _app_lock[exp_id] = false;

      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exp_id+'] Deleted file "'+fpath+'".');
      return cb(null);
   });
}

/**
 * Get output from execution
 */
var getExecutionOutputFile = function(exp_id, fpath, cb){
   if(!fpath) fpath = 'output.tar.gz';

   // Check absolute paths
   if(path.isAbsolute(fpath)) return cb(new Error('Absolute paths are not supported: '+fpath));

   // Get experiment input storage path
   var exp_path = constants.outputstorage+path.sep+exp_id+path.sep+fpath;

   // Check file
   fs.stat(exp_path, function(error, stats){
      if(error || !stats.isFile()) return cb(new Error('Output data "'+fpath+'" does not exist for experiment: '+exp_id));
      return cb(null, exp_path);
   });
}

/**
 * Delete execution output.
 * Public interface.
 */
var deleteExecutionOutput = function(exec_id, fpath, cb){
   // Wait for the lock
   if(_app_lock[exec_id]){
      return setTimeout(deleteExecutionOutput, 1000, exec_id, fpath, cb);
   }
   // Set lock
   _app_lock[exec_id] = true;

   // Private function
   _deleteExecutionOutput(exec_id, fpath, function(error){
      // Remove lock
      _app_lock[exec_id] = false;
      cb(error);
   });
}

/**
 * Delete execution output
 */
var _deleteExecutionOutput = function(exec_id, fpath, cb){
   // Check absolute paths
   if(fpath && path.isAbsolute(fpath)) return cb(new Error('Absolute paths are not supported: '+fpath));

   // Get experiment output storage path
   var exec_path = constants.outputstorage+path.sep+exec_id;

   async.waterfall([
      // Remove fpath
      function(wfcb){
         if(fpath){
            exec('rm -rf '+fpath, {
               cwd: exec_path
            }, function(error, stdout, stderr){
               return wfcb(error);
            });
         } else {
            exec('rm -rf '+exec_path,{
            }, function(error, stdout, stderr){
               if(error) logger.error('['+MODULE_NAME+']['+exec_id+'] Execution output path does not exist: '+exec_path);
               return wfcb(null);
            });
         }
      }
   ],
   function(error){
      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exec_id+'] Deleted file "'+fpath+'".');
      return cb(null);
   });
}

/**
 * Delete all execution data
 */
var deleteExecution = function(app_id, exec_id, cb){
   // Wait for the lock
   if(_app_lock[exec_id]){
      return setTimeout(deleteExecution, 1000, exec_id, cb);
   }
   // Set lock
   _app_lock[exec_id] = true;

   // Get execution storage path
   var app_path = constants.appstorage+path.sep+app_id+path.sep;

   async.waterfall([
      // Remove output
      function(wfcb){
         _deleteExecutionOutput(exec_id, null, wfcb);
      },
      // Remove branch
      function(wfcb){
         if(app_id){
            exec('git branch -D '+exec_id,{
               cwd: app_path
            }, function(error, stdout, stderr){
               return wfcb(null);
            });
         } else {
            wfcb(null);
         }
      }
   ],
   function(error){
      // Remove lock
      _app_lock[exec_id] = false;

      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exec_id+'] Deleted execution.');
      return cb(null);
   });
}

/**
 * Retrieve output folder disk usage
 */
var getOutputFolderUsage = function(id, cb){
   // Wait for the lock
   if(_app_lock[id]){
      return setTimeout(getOutputFolderUsage, 1000, id, cb);
   }
   // Set lock
   _app_lock[id] = true;

   // Get experiment input storage path
   var id_path = constants.outputstorage+path.sep+id;

   // Get folder size
   du(id_path, function(error, size){
      // Remove lock
      _app_lock[id] = false;
      return cb(error, size);
   });
}

/**
 * Get IDs in input folder
 */
var getInputIDs = function(cb){
   fs.readdir(constants.inputstorage, cb);
}

/**
 * Get IDs in output folder
 */
var getOutputIDs = function(cb){
   fs.readdir(constants.outputstorage, cb);
}

/**
 * Get output folder tree
 */
var getOutputFolderTree = function(id, cb){
   // Get path
   var id_path = constants.outputstorage+path.sep+id;

   // Check path existence
   fs.access(id_path, function(error){
      if(error) return cb(error);
      return cb(null, _fillFolderTreeSync(id_path, ""));
   });
}

/**
 * Get input folder tree
 */
var getInputFolderTree = function(id, cb){
   // Get path
   var id_path = constants.inputstorage+path.sep+id;

   // Check path existence
   fs.access(id_path, function(error){
      if(error) return cb(error);
      return cb(null, _fillFolderTreeSync(id_path, ""));
   });
}

/**
 * Get experiment source folder tree
 */
var getExperimentSrcFolderTree = function(exp_id, app_id, cb){
   // Wait for the lock
   if(_app_lock[app_id]){
      return setTimeout(getExperimentSrcFolderTree, 1000, exp_id, app_id, cb);
   }
   // Set lock
   _app_lock[app_id] = true;

   // Get experiment input storage path
   var app_path = constants.appstorage+path.sep+app_id;

   async.waterfall([
      // Check path existence
      function(wfcb){
         fs.access(app_path, function(error){
            return wfcb(error);
         });
      },
      // Checkout experiment code
      function(wfcb){
         exec('git checkout '+exp_id,{
            cwd: app_path
         }, function(error, stdout, stderr){
            return wfcb(error);
         });
      },
      // Get tree
      function(wfcb){
         return wfcb(null, _fillFolderTreeSync(app_path, ""));
      },
      // Checkout master
      function(tree, wfcb){
         exec('git checkout master',{
            cwd: app_path
         }, function(error){
            return wfcb(error, tree);
         });
      }
   ],
   function(error, tree){
      // Remove lock
      _app_lock[app_id] = false;

      if(error) return cb(error);
      return cb(null, tree);
   });
}

/**
 * Allow input data FS from Rsync
 */
var getExecutionInputPass = function(exp_id, exec_id, cb){
   // Get path
   var id_path = constants.inputstorage+path.sep+exp_id;

   // Get rsync file path
   var rsync_path = constants.rsync_folder;
   var rsync_file_path = rsync_path+path.sep+exec_id+"_i.conf";
   var rsync_file_secret_path = rsync_path+path.sep+exec_id+"_i.conf.secrets";

   // Password
   var password = utils.generateUUID();

   async.waterfall([
      // Check paths existence
      function(wfcb){
         fs.access(id_path, function(error){
            return wfcb(error);
         });
      },
      function(wfcb){
         fs.access(rsync_path, function(error){
            return wfcb(error);
         });
      },
      // Create input data module in Rsync
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exec_id+'] Allowing input rsync...');

	 // Define file content of rsync
	 var file_content = '['+exec_id+'_input]\n' +
		 'path = '+constants.inputstorage+path.sep+exp_id+'\n' +
		 'auth users = *\n' +
		 'read only = true\n' +
		 'secrets file = '+rsync_file_secret_path+'\n';

	 // (Over)write
         fs.writeFile(rsync_file_path, file_content, "utf8", function(error){
            return wfcb(error);
         });
      },
      // Create input data module secrets file
      function(wfcb){
	 // Define file content of secrets file
	 var file_content = ''+exec_id+':'+password+'\n';

	 // (Over)write (384 => 0o600
         fs.writeFile(rsync_file_secret_path, file_content, { mode: 384 }, "utf8", function(error){ 
            return wfcb(error);
         });
      }
   ],
   function(error){
      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exec_id+'] Rsync input allowed.');
      return cb(null, password);
   });
}

/**
 * Allow output data FS from Rsync
 */
var getExecutionOutputPass = function(exec_id, cb){
   // Get path
   var id_path = constants.outputstorage+path.sep+exec_id;

   // Get rsync file path
   var rsync_path = constants.rsync_folder;
   var rsync_file_path = rsync_path+path.sep+exec_id+"_o.conf";
   var rsync_file_secret_path = rsync_path+path.sep+exec_id+"_o.conf.secrets";

   // Password
   var password = utils.generateUUID();

   async.waterfall([
      // Check paths existence
      function(wfcb){
         fs.access(id_path, function(error){
            return wfcb(error);
         });
      },
      function(wfcb){
         fs.access(rsync_path, function(error){
            return wfcb(error);
         });
      },
      // Create output data module in Rsync
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exec_id+'] Allowing output rsync...');

	 // Define file content of rsync
	 var file_content = '['+exec_id+'_output]\n' +
		 'path = '+constants.outputstorage+path.sep+exec_id+'\n' +
		 'auth users = *\n' +
		 'read only = false\n' +
		 'secrets file = '+rsync_file_secret_path+'\n';

	 // (Over)write
         fs.writeFile(rsync_file_path, file_content, "utf8", function(error){
            return wfcb(error);
         });
      },
      // Create output data module secrets file
      function(wfcb){
	 // Define file content of secrets file
	 var file_content = ''+exec_id+':'+password+'\n';

	 // (Over)write (384 => 0o600
         fs.writeFile(rsync_file_secret_path, file_content, { mode: 384 }, "utf8", function(error){ 
            return wfcb(error);
         });
      }
   ],
   function(error){
      logger.info('['+MODULE_NAME+']['+exec_id+'] Rsync output error:'+error);
      if(error) return cb(error);
      logger.info('['+MODULE_NAME+']['+exec_id+'] Rsync output allowed.');
      return cb(null, password);
   });
}

/**
 * Disable input data FS from Rsync
 */
var releaseExecutionInputPass = function(exec_id, cb){

   // Get rsync file path
   var rsync_path = constants.rsync_folder;
   var rsync_file_path = rsync_path+path.sep+exec_id+"_i.conf";
   var rsync_file_secret_path = rsync_path+path.sep+exec_id+"_i.conf.secrets";

   async.waterfall([
      // Check paths existence
      function(wfcb){
         fs.access(rsync_path, function(error){
            return wfcb(error);
         });
      },
      // Remove .conf file
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exec_id+'] Removing input module...');
         exec('rm -f '+rsync_file_path,{
         }, function(error, stdout, stderr){
            if(error) logger.info('['+MODULE_NAME+']['+exp_id+'] Rsync module file does not exist: '+rsync_file_path);
            return wfcb(null);
         });
      },
      // Remove .conf.secrets file
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exec_id+'] Removing input module secrets...');
         exec('rm -f '+rsync_file_secret_path,{
         }, function(error, stdout, stderr){
            if(error) logger.info('['+MODULE_NAME+']['+exec_id+'] Rsync secrets file does not exist: '+rsync_file_secrets_path);
            return wfcb(null);
         });
      }
   ],
   function(error){
      logger.info('['+MODULE_NAME+']['+exec_id+'] Rsync input disabled.');
      return cb(null);
   });
}

/**
 * Disable output data FS from Rsync
 */
var releaseExecutionOutputPass = function(exec_id, cb){

   // Get rsync file path
   var rsync_path = constants.rsync_folder;
   var rsync_file_path = rsync_path+path.sep+exec_id+"_o.conf";
   var rsync_file_secret_path = rsync_path+path.sep+exec_id+"_o.conf.secrets";

   async.waterfall([
      // Check paths existence
      function(wfcb){
         fs.access(rsync_path, function(error){
            return wfcb(error);
         });
      },
      // Remove .conf file
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exec_id+'] Removing output module...');
         exec('rm -f '+rsync_file_path,{
         }, function(error, stdout, stderr){
            if(error) logger.info('['+MODULE_NAME+']['+exp_id+'] Rsync module file does not exist: '+rsync_file_path);
            return wfcb(null);
         });
      },
      // Remove .conf.secrets file
      function(wfcb){
         logger.info('['+MODULE_NAME+']['+exec_id+'] Removing output module secrets...');
         exec('rm -f '+rsync_file_secret_path,{
         }, function(error, stdout, stderr){
            if(error) logger.info('['+MODULE_NAME+']['+exec_id+'] Rsync secrets file does not exist: '+rsync_file_secrets_path);
            return wfcb(null);
         });
      }
   ],
   function(error){
      logger.info('['+MODULE_NAME+']['+exec_id+'] Rsync output disabled.');
      return cb(null);
   });
}

/**
 * Get module name.
 * For testing purposes.
 */
var getModuleName = function(cb){
   return cb(null, MODULE_NAME);
}

/**
 * Update repository and restart process.
 */
var autoupdate = function(cb){
   logger.info('['+MODULE_NAME+'] Autoupdate: Begin.');
   async.waterfall([
      // Check configuration
      function(wfcb){
         if(!constants.AUTOUPDATE){
            return wfcb(new Error('Autoupdate is not enabled.'));
         }
         return wfcb(null);
      },
      // Update repository
      function(wfcb){
         exec('git pull origin '+constants.AUTOUPDATE, function(error, stdout, stderr){
            return wfcb(error);
         });
      }
   ],
   function(error){
      if(error){
         // Error trying to checkpoint execution
         logger.debug('['+MODULE_NAME+'] Autoupdate: Error.');
         cb(error);
      } else {
         logger.debug('['+MODULE_NAME+'] Autoupdate: Done, resetting...');
         // Callback before exit
         cb(null);
         // Exit from Node, forever will restart the service.
         process.exit(1);
      }
   });
}

/***********************************************************
 * --------------------------------------------------------
 * PRIVATE FUNCTIONS
 * --------------------------------------------------------
 ***********************************************************/

/**
 * Get folder tree recursively.
 */
var _fillFolderTreeSync = function(root, rel_path){
   // Get current dir
   var dir = path.normalize(path.join(root, rel_path));

   // Output
   var tree = [];

   // Read directory
   var files = fs.readdirSync(dir)

   // Ignore hidden, i.e. starting with dot
   files = files.filter(item => !(/(^|\/)\.[^\/\.]/g).test(item));

   // Iterate
   for(var f in files){
      var file = files[f];
      var full_filepath = path.join(dir, file);
      var rel_filepath = path.join(rel_path, file);
      if(fs.statSync(full_filepath).isFile()){
         // Add leaf
         tree.push({
            label: file,
            id: rel_filepath,
            size: fs.statSync(full_filepath)['size'],
            children: []
         });
      } else {
         // Add subtree
         tree.push({
            label: file,
            id: rel_filepath+path.sep,
            children: _fillFolderTreeSync(root, rel_filepath)
         });
      }
   }
   return tree;
}

var _getLabelsInFileSync = function(fpath, labels){
   var fcontent = null;

   // Read file
   try {
      fcontent = fs.readFileSync(fpath, {encoding: 'utf8', flag: 'r'});
   } catch (e) {
      return logger.info('['+MODULE_NAME+'] Error reading file "'+fpath+'": '+error);
   }

   // Get labels list
   var regex = /\[\[\[(\w+)\]\]\]/g;
   var label_list = [];
   var match = regex.exec(fcontent);
   while(match){
      label_list.push(match[1]);
      match = regex.exec(fcontent);
   }

   // Iterate labels and add it to dict
   for(l in label_list){
      // Add only if not already in dict
      if(!labels[label_list[l]]){
         labels[label_list[l]] = {
            type: "TEXT",
            category: null,
            default_value: null
         };
      }
   }
   if(label_list) logger.info('['+MODULE_NAME+'] Found in "'+fpath+'": '+label_list);
}

var _applyExperimentLabels = function(app_id, exp_id, exec_id, labels, cb){
   // Get application storage path
   var app_path = constants.appstorage+path.sep+app_id+path.sep;

   async.waterfall([
      // Check paths existence
      function(wfcb){
         fs.access(app_path, function(error){
            return wfcb(error);
         });
      },
      // Iterate files
      function(wfcb){
         fs.readdir(app_path, function(error, files){
            if(error) return wfcb(error);
            // Ignore hidden, i.e. starting with dot
            files = files.filter(item => !(/(^|\/)\.[^\/\.]/g).test(item));
            // Replace labels in every file
            var tasks = [];
            for(var f in files){
               // Replace this file
               (function(file){
                  tasks.push(function(taskcb){
                     // Get full path
                     var full_path = path.join(app_path, file);
                     try{
                        // Check if it is a file
                        var stat = fs.statSync(full_path);
                        if(stat.isFile()) return _replaceLabelsInFile(app_path+path.sep+file, labels, taskcb);
                        else return taskcb(null);
                     } catch(error) {
                        // End
                        taskcb(null);
                     }
                  });
               })(files[f]);
            }
            // Execute tasks
            async.parallel(tasks, function(error){
               return wfcb(error);
            });
         });
      }
   ],
   function(error){
      if(error) return cb(error);
      return cb(null);
   });
}

/**
 * Replace labels for their values in a file.
 */
var _replaceLabelsInFile = function(file, labels, cb){
   // Read file
   fs.readFile(file, {encoding: 'utf8', flag: 'r'}, function(error, fcontent){
      if(error){
         logger.error('['+MODULE_NAME+'] Failed to read file "'+file+'": '+error.message);
         return cb(null);
      }

      // Iterate labels
      for(var label in labels){
         if(!labels[label].value) labels[label].value = "";
         // Avoid special characters
         re_label = label.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
         // Replace label in file
         fcontent = fcontent.replace(new RegExp('\\[\\[\\['+re_label+'\\]\\]\\]', 'g'), labels[label].value);
      }

      // Write file
      fs.writeFile(file, fcontent, 'utf8', function(error){
         return cb(error);
      });
   });
}

/**
 * Load configuration file and initialize DB and RPC.
 */
var _loadConfig = function(config, loadCallback){
   // Check parameters in config file
   if(!config.appstorage) return loadCallback(new Error('No "appstorage" field in CFG.'));
   if(!config.inputstorage) return loadCallback(new Error('No "inputstorage" field in CFG.'));
   if(!config.outputstorage) return loadCallback(new Error('No "outputstorage" field in CFG.'));
   if(!config.rsync_folder) return loadCallback(new Error('No "rsync_folder" field in CFG.'));
   if(!config.public_url) return loadCallback(new Error('No "public_url" field in CFG.'));
   if(!config.git_port) return loadCallback(new Error('No "git_port" field in CFG.'));
   if(!config.listen) return loadCallback(new Error('No "listen" field in CFG.'));
   if(!config.db) return loadCallback(new Error('No "db" field in CFG.'));

   // Setup constants
   constants = config;

   async.waterfall([
      // Connect to MongoDB
      function(wfcb){
         // Connect to database
         logger.info('['+MODULE_NAME+'] Connecting to MongoDB: '+config.db);
         mongo.connect(config.db, function(error, database){
            if(error) throw error;
            logger.info('['+MODULE_NAME+'] Successfull connection to DB');

            // Set global var
            db = database;

            // Next
            wfcb(null);
         });
      },
      // Check app folder
      function(wfcb){
         fs.stat(config.appstorage, function(error, stats){
            if(error) return wfcb(error);
            if(!stats.isDirectory()) return wfcb(new Error('Folder "'+config.appstorage+'" is not a directory.'));
            return wfcb(null);
         });
      },
      // Check input folder
      function(wfcb){
         fs.stat(config.inputstorage, function(error, stats){
            if(error) return wfcb(error);
            if(!stats.isDirectory()) return wfcb(new Error('Folder "'+config.inputstorage+'" is not a directory.'));
            return wfcb(null);
         });
      },
      // Check output folder
      function(wfcb){
         fs.stat(config.outputstorage, function(error, stats){
            if(error) return wfcb(error);
            if(!stats.isDirectory()) return wfcb(new Error('Folder "'+config.outputstorage+'" is not a directory.'));
            return wfcb(null);
         });
      },
      // Check rsync folder
      function(wfcb){
         fs.stat(config.rsync_folder, function(error, stats){
            if(error) return wfcb(error);
            if(!stats.isDirectory()) return wfcb(new Error('Folder "'+config.rsync_folder+'" is not a directory.'));
            return wfcb(null);
         });
      },
      // Load Apps from storage
      function(wfcb){
         // Projection
         var projection = {
            _id: 0,
            id: 1,
            name: 1
         };

         // Retrieve applications
         db.collection('applications').find({}, projection).toArray(function(error, apps){
            if(error) return wfcb(error);
            if(apps.length == 0){
               logger.info('['+MODULE_NAME+'] No Apps found.');
               return wfcb(null);
            }

            var count = apps.length;
            logger.info('['+MODULE_NAME+'] Loading '+count+' apps...');

            // Iterate apps
            for(var a = 0; a < apps.length; a++){
               // Check folder existence for this app
               (function(app){
                  fs.stat(config.appstorage+path.sep+app.id, function(error, stats){
                     if(error || !stats.isDirectory()){
                        // No data stored for this app, remove it
                        logger.info('['+MODULE_NAME+'] App "'+app.name+'" - "'+app.id+'" not found, removing from DB...');
                        db.collection('applications').remove({id: app.id});
                     }
                     // Finished?
                     count--;
                     if(count == 0) return wfcb(null);
                  });
               })(apps[a]);
            };
         });
      },
      // Setup RPC
      function(wfcb){
         // Setup server
         zserver = new zerorpc.Server({
            autoupdate: autoupdate,
            copyApplication: copyApplication,
            copyExperiment: copyExperiment,
            discoverMetadata: discoverMetadata,
            retrieveExperimentOutput: retrieveExperimentOutput,
            prepareExecution: prepareExecution,
            removeExperiment: removeExperiment,
            getApplicationURL: getApplicationURL,
            getExecutionOutputURL: getExecutionOutputURL,
            getExecutionInputURL: getExecutionInputURL,
            getExperimentCode: getExperimentCode,
            putExperimentCode: putExperimentCode,
            deleteExperimentCode: deleteExperimentCode,
            putExperimentInput: putExperimentInput,
            deleteExperimentInput: deleteExperimentInput,
            getExecutionOutputFile: getExecutionOutputFile,
            deleteExecutionOutput: deleteExecutionOutput,
            deleteExecution: deleteExecution,
            getOutputFolderUsage: getOutputFolderUsage,
            getInputIDs: getInputIDs,
            getOutputIDs: getOutputIDs,
            getOutputFolderTree: getOutputFolderTree,
            getInputFolderTree: getInputFolderTree,
            getExperimentSrcFolderTree: getExperimentSrcFolderTree,
	    getExecutionInputPass: getExecutionInputPass,
	    getExecutionOutputPass: getExecutionOutputPass,
	    releaseExecutionInputPass: releaseExecutionInputPass,
	    releaseExecutionOutputPass: releaseExecutionOutputPass,
            getModuleName: getModuleName
         }, 30000);

         // Listen
         zserver.bind(config.listen);
         logger.info('['+MODULE_NAME+'] Storage is listening on '+config.listen);

         // RPC error handling
         zserver.on("error", function(error){
            logger.error('['+MODULE_NAME+'] RPC server error: '+error);
         });

         // Next
         wfcb(null);
      },
      // Create DB indices
      function(wfcb){
         // TODO: Setup indices
         wfcb(null);
      }
   ],
   function(error){
      if(error) return loadCallback(error);
      logger.info('['+MODULE_NAME+'] Config loaded.');
      loadCallback(null);
   });
}

/***********************************************************
 * --------------------------------------------------------
 * INITIALIZATION
 * --------------------------------------------------------
 ***********************************************************/

// Get config file
if(!cfg) throw new Error("No CFG file has been provided.");

// Steps
async.waterfall([
   // Read config file
   function(wfcb){
      logger.info('['+MODULE_NAME+'] Reading config file: '+cfg);
      fs.readFile(cfg, {encoding: 'utf8', flag: 'r'}, function(error, fcontent){
         if(error) return wfcb(error);
         wfcb(null, fcontent);
      });
   },
   // Load cfg
   function(fcontent, wfcb){
      logger.info('['+MODULE_NAME+'] Loading config file...');

      // Parse cfg
      cfg = JSON.parse(fcontent);

      // Loading
      _loadConfig(cfg, function(error){
         if(error) return wfcb(error);
         wfcb(null);
      });
   }
],
function(error){
   if(error) throw error;
   logger.info('['+MODULE_NAME+'] Initialization completed.');
});
