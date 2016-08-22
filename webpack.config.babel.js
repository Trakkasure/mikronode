var webpack = require("webpack");

module.exports = {
    entry: {mikronode:'./src/index.js'},
    target: 'node',
    module: {
      loaders: [
        {
            test: /\.[ej]s6?$/
          , exclude: /node_modules/
          , loader: 'babel-loader'
          , query: {
                "presets": ['es2015','stage-1']
              , "plugins": [
                    ["transform-replace-object-assign", "simple-assign"]
                  , ["transform-runtime", {
                        "polyfill": false
                      , "regenerator": true
                    }]
                  , "transform-dev-warning"
                  , "add-module-exports"
                  , "transform-decorators-legacy"
                  , "transform-private-properties"
                ]
            }
        }
      ]
    },
    output: {
      libraryTarget: 'umd',
      library: 'MikroNode',
      path: 'dist',
      filename: '[name].js'
    },
    resolve: {
      extensions: ['', '.js','.es6']
    },
    plugins: [
      // new webpack.optimize.OccurenceOrderPlugin(),
      new webpack.NoErrorsPlugin(),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production')
      })
    ]
}
