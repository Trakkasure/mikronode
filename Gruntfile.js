/**
 * http://gruntjs.com/configuring-tasks
 */
module.exports = function(grunt) {
	var path = require('path');
	var DOC_PATH = 'doc';
	grunt.initConfig({
		pkg : grunt.file.readJSON('package.json'),

		clean : {
			docs : {
				src : DOC_PATH
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
	[ 'grunt-contrib-clean', 'grunt-jsdoc', ].forEach(function(taskName) {
		grunt.loadNpmTasks(taskName);
	});

	grunt.registerTask('docs', 'Create documentation for mikronode', [ 'clean:docs', 'jsdoc:docs' ]);
	grunt.registerTask('default', 'Default', [ 'docs' ]);
};
