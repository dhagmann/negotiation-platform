require('dotenv').config();

module.exports = {
    module: {
    rules: [
      {
        test: /\.md$/i,
        use: [
          {
            loader: 'raw-loader',
            options: {
              esModule: false
            }
          }
        ]
      }
    ]
  }
};