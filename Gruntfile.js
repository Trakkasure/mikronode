/**
 * http://gruntjs.com/configuring-tasks
 */
module.exports = function(grunt) {
	var path = require('path');
	var DOC_PATH = 'doc';
	var git_branch = '';
	grunt.initConfig({

		clean : {
			docs : {
				src : DOC_PATH
			},
			'gh-pages' : {
				src : [ 'fonts', 'scripts', 'styles', 'Readme.md', '*.html' ]
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
			},
			'pull-docs' : {
				command : [ 'git archive --format=tar ' + grunt.option('tag') + ' doc | tar -x --strip-components=1',
						'git archive --format=tar ' + grunt.option('tag') + ' Readme.md package.json | tar -x ' ].join(' ; ')
			}
		},

		gitadd : {
			'gh-pages' : {
				src : [ '*.html', 'Readme.md', 'package.json', 'jshintrc', 'Gruntfile.js', 'fonts', 'styles', 'scripts' ]
			}
		},

		gitcommit : {
			'gh-pages' : {
				options : {
					message : (grunt.option('tag').startsWith('v') ? grunt.option('tag') : 'v' + grunt.option('tag'))
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
	});

	// Load task libraries
	[ 'grunt-contrib-clean', 'grunt-jsdoc', 'grunt-git', 'grunt-contrib-copy', 'grunt-shell' ]
			.forEach(function(taskName) {
				grunt.loadNpmTasks(taskName);
			});

	grunt.registerTask('fail-if-not-gh-pages', function() {
		grunt.task.requires('shell:get-branch');
		if (git_branch !== 'gh-pages') {
			grunt.log.writeln('This task is only valid in the gh-pages branch');
			return false;
		}
	});
	grunt.registerTask('check-branch-is-gh-pages', [ 'shell:get-branch', 'fail-if-not-gh-pages' ]);
	grunt.registerTask('fail-if-gh-pages', function() {
		grunt.task.requires('shell:get-branch');
		if (git_branch === 'gh-pages') {
			grunt.log.writeln('This task is not valid in the gh-pages branch');
			return false;
		}
	});
	grunt.registerTask('check-branch-is-not-gh-pages', [ 'shell:get-branch', 'fail-if-gh-pages' ]);

	grunt.registerTask('pages', function() {
		if (!grunt.option('tag')) {
			grunt.log.writeln('No --tag= option specified as the documentation source tag/branch');
			return false;
		}
		grunt.task.run([ 'check-branch-is-gh-pages', 'clean:gh-pages', 'shell:pull-docs', 'gitadd:gh-pages',
				'gitcommit:gh-pages' ]);
	});

	grunt.registerTask('docs', 'Create documentation for mikronode', [ 'check-branch-is-not-gh-pages', 'clean:docs',
			'copy:docs', 'jsdoc:docs' ]);
};
