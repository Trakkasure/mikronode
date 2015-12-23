/**
 * http://gruntjs.com/configuring-tasks
 */
module.exports = function(grunt) {
	var path = require('path');
	var DOC_PATH = 'dist';
	var SOURCE_PATH = 'lib';
	grunt.initConfig({
		pkg : grunt.file.readJSON('package.json'),

		connect : {
			options : {
				hostname : '*'
			},
			docs : {
				options : {
					port : 8000,
					base : DOC_PATH,
					middleware : function(connect, options) {
						return [ require('connect-livereload')(), connect.static(path.resolve(options.base)) ];
					}
				}
			}
		},

		clean : {
			docs : {
				src : DOC_PATH
			}
		},

		jsdoc : {
			docs : {
				src : [ SOURCE_PATH + '/**/*.js',

				// You can add README.md file for index page at documentations.
				'Readme.md' ],
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
	[ 'grunt-contrib-clean', 'grunt-jsdoc', ].forEach(function(taskName) {
		grunt.loadNpmTasks(taskName);
	});

	grunt.registerTask('docs', 'Create documentation for mikronode', [ 'clean:docs', 'jsdoc:docs' ]);
};
