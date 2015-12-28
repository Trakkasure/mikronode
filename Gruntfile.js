/**
 * http://gruntjs.com/configuring-tasks
 */
module.exports = function(grunt) {
	var path = require('path');
	var DOC_PATH = 'doc';
	var git_branch = '';

	grunt.initConfig({
		pkg : grunt.file.readJSON('package.json'),

		clean : {
			docs : {
				src : DOC_PATH
			},
			'gh-pages' : {
				src : '.grunt/grunt-gh-pages'
			}
		},
		copy : {
			docs : {
				src : 'Readme.md',
				dest : 'doc/'
			}
		},

		shell : {
			'get-branch' : {
				command : 'git rev-parse --abbrev-ref HEAD',
				options : {
					stdout : false,
					callback : function(err, stdout, stderr, cb) {
						git_branch = stdout.trim();
						cb();
					}
				}
			}
		},

		jsdoc : {
			docs : {
				src : [ 'lib/**/*.js', 'Readme.md' ],
				options : {
					verbose : true,
					destination : DOC_PATH,
					configure : 'conf.json',
					template : 'node_modules/jaguarjs-jsdoc',
					'private' : false
				}
			}
		},

		'gh-pages' : {
			options : {
				push : false,
			},
			'docs' : {
				options : {
					base : 'doc',
				},
				src : [ '**/*', '../Readme.md' ]
			},
		}

	});

	// Load task libraries
	[ 'grunt-contrib-clean', 'grunt-jsdoc', 'grunt-gh-pages', 'grunt-contrib-copy', 'grunt-shell' ].forEach(function(
			taskName) {
		grunt.loadNpmTasks(taskName);
	});

	grunt.registerTask('fail-branch', function() {
		if (!git_branch.startsWith('v')) {
			grunt.log.writeln('Branch ' + git_branch + ' is not a release branch');
			return false;
		}
	});

	grunt.registerTask('docs', 'Create documentation for mikronode', [ 'clean:docs', 'copy:docs', 'jsdoc:docs' ]);
	grunt.registerTask('pages', 'Create gh-pages', [ 'check-release-branch', 'clean:gh-pages', 'gh-pages:docs' ]);
	grunt.registerTask('check-release-branch', [ 'shell:get-branch', 'fail-branch' ]);
	grunt.registerTask('default', 'Default', [ 'docs' ]);
};
