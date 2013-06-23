/*###############################################################################
#
#             _ __ _____  __   Welcome to the      _
#            | '__/ _ \ \/ / ___ __ ___ ____  _ __| |_ ___ _ __
#            | | |  __/>  < / -_) _/ _ (_-< || (_-<  _/ -_) '  \
#            |_|  \___/_/\_\\___\__\___/__/\_, /__/\__\___|_|_|_|
#                                          |__/
#
# The rex-* ecosystem is a collection of like-minded modules for Node.js/NPM
#   that allow developers to reduce their time spent developing by a wide margin.
#
#   Header File Version: 0.0.1, 06/08/2013
#
# The MIT License (MIT)
#
# Copyright (c) 2013 Pierce Moore <me@prex.io>
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#
#######*/
var cli = require('rex-shell')
  , exec = require('rex-exec')
  , utils = require('rex-utils')
  , _ = require('rex-utils')._
  , git = require('rex-git')
  , npm = require('npm')
  , async = require('async')
  , fs = require('fs')
  , path = require('path')
  , package = require('../package')
  , verbose

cli.config.appName(package.name)

exports.version = package.version
exports.package = package

var AppData = function() {
  var rexfile = _.rexfile()
  return {
    rexfile : rexfile,
    InstallRoot : _.osPath(rexfile.app.root),
    InstallDest : _.osPath(rexfile.app.root+"/"+rexfile.app.name.replace(/\s/g,'_').replace(/\W/g,''))
  }
}


exports.install = install = function() {
  var App = AppData()
  var rexfile = App.rexfile

  cli("Installing '"+ rexfile.app.name +"' to '"+ App.InstallRoot +"'.")

  async.series([
    function(FileSystemComplete) {
      verbose && cli.success("Preparing the Installation Directory...")
      fs.exists(App.InstallRoot, function(exists) {
        if(!exists) {
          FileSystemComplete("Installation root directory '"+ App.InstallRoot +"' does not exist. Please create it and try again!", 'File System Check')
        } else {
          fs.exists( App.InstallDest, function(exists) {
            if(exists) {
              FileSystemComplete("The application appears to already be installed in the intended destination directory. Go fix it and try this again.", 'File System Check')
            } else {
              fs.mkdir( App.InstallDest, function(err) {
                if(err)
                  FileSystemComplete(err, 'File System Check')
                else
                  FileSystemComplete(null, 'File System Check')
              })
            }
          })
        }
      })
    },
    function(GitReposCloned) {
      verbose && cli.success("File system check complete, assembling application files...")

      var after = _.after(rexfile.git.length, function() {
        GitReposCloned(null, 'Clone Git Repositories')
      })

      _.each(rexfile.git, function(repo) {
        var current = path.basename(repo,'.git')
        exec(App.InstallDest, "git clone "+ repo +" && cd "+ current +" && git submodule init && git submodule update", function(stderr, stdout) {
          if(stderr) {
            GitReposCloned(stderr, 'Clone Git Repos')
          } else {
            verbose && cli.success("Repository Cloned: "+ current)
            after()
          }
        })
      })

    },
    function(NPMGlobalInstalled) {
      verbose && cli.success("Application files assembled, installing any global NPM modules")
      if(_.has(rexfile,'npm') && rexfile.npm.length) {
        npm.load({ global : true, loglevel : "silent" }, function(er) {
          if(er) throw er
          npm.commands.install( rexfile.npm, function(err) {
            if(!err)
              verbose && cli.success("Global NPM Install Complete!")
            NPMGlobalInstalled(err, 'Install Global NPM Modules')
          })
        })
      }
    },
    function(AllNPMInstalled) {
      verbose && cli.success('Global NPM Modules installed, installing all local modules')

      fs.readdir(App.InstallDest, function(err, files) {
        var after = _.after(files.length, function() {
          verbose && cli.success("All Node Module Installs Complete!")
          AllNPMInstalled(null, "Install Local NPM Modules")
        })
        _.each(files, function(file) {
          verbose && cli("Processing file: "+ file)
          var filePath = _.osPath(App.InstallDest+"/"+file)
          var jsonPath = _.osPath(App.InstallDest+"/"+file+"/package.json")

          fs.exists(jsonPath, function(exists) {
            if(exists) {
              exec(filePath, "npm install --silent", function(stderr, stdout) {
                after()
              })
            } else {
              after()
            }
          })
        })
      })

    },
    function(ForemanSetupComplete) {
      verbose && cli.success("Foreman Setup Complete!")
      ForemanSetupComplete(null, 'Configure Foreman')
    },
    function(BundleComplete) {
      verbose && cli.success("Bundle Setup Complete!")
      BundleComplete(null, 'Configure Bundle')
    },
    function(MongoComplete) {
      verbose && cli.success("Mongo Setup Complete!")
      MongoComplete(null, 'Configure Mongo')
    }
  ], function(err, results) {
    if(err) {
      cli.error(err)
      process.exit(1)
    }

    if(results) {
      cli.success("Application successfully installed! Run 'rex-app start' to see it in action!")
      _.each(results, function(result) {
        console.log(" ✓ "+ cli.$$.g(result))
      })
    }
  })

}

exports.update = update = function() {
  var App = AppData()
  var rexfile = App.rexfile

  async.series([
    function(GitCurrent) {
      git.pull(App.InstallDest, function(err, success) {
        GitCurrent(null, success)
      })
    },
    function(NPMCurrent) {
      fs.readdir(App.InstallDest, function(err, files) {
        verbose && cli("Updating NPM in "+ _.size(files) +" repos")

        var afterNPM = _.after( _.size(files), function() {
          verbose && cli.success("Local NPM modules updated!")
          NPMCurrent(null, 'Update local NPM modules')
        })
        _.each(files, function(file) {
          fs.exists(_.osPath(App.InstallDest+"/"+file+"/package.json"), function(exists) {
            if(exists) {
              verbose && cli("package.json found, updating npm in "+ _.osPath(App.InstallDest+"/"+file))
              exec( _.osPath(App.InstallDest+"/"+file), "npm update", function(stderr, stdout) {
                if(stdout)
                  afterNPM()
              })
            } else {
              afterNPM()
            }
          })
        })

      })
    }
  ], function(err, results) {
    if(err)
      throw err
    else
      cli.success( App.rexfile.app.name +" has been updated!")
  })

}

exports.start = start = function() {
  //
}

exports.stop = stop = function() {
  //
}

exports.show = show = function() {
  //
}

exports.uninstall = uninstall = function() {
  //
}

exports.init = function() {
  var operation = process.argv[2] || 'help'

  if(_.contains(process.argv, 'verbose') || _.contains(process.argv,'-v')) {
    verbose = true
  }

  switch(operation) {
    case 'version':
      npm.load(function(er) {
        npm.commands.ls([], true, function(err, full, lite) {
          _.displayVersion(package, _.dependencyVersions(lite.dependencies))
        })
      })
      break;
    case 'install':
      install()
      break;
    case 'update':
      update()
      break;
    case 'show':
      show()
      break;
    case 'start':
    case 'go':
    case 'run':
    case 'init':
      start()
      break;
    case 'stop':
    case 'end':
    case 'kill':
    case 'die':
      stop()
      break;
    case 'help':
    default:
      _.showHelp(package)   
  }
}
