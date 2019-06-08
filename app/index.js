const path = require('path');

const express = require('express');
const logger = require('morgan');
const mongoose = require('mongoose');

// eslint-disable-next-line prefer-destructuring
const argv = require('yargs')
  .usage('Usage: $0 --config ./config.json')
  .help()
  .option('c', {
    alias: 'configPath',
    describe: 'Path to config file',
    default: './config.json',
    type: 'string'
  })
  .argv;

const routes = require('./routes');

const configPath = path.join(process.cwd(), argv.configPath);
const config = require(configPath);

mongoose.Promise = global.Promise;
mongoose.connect(config.mongoUrl, { useNewUrlParser: true, useCreateIndex: true });

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', routes);

// Error handlers

// 404 error handler
app.use((req, res) => {
  const err = {
    message: 'Not Found',
    status: 404
  };
  res.status(404);
  if (req.xhr) {
    res.send({
      message: err.message,
      error: err
    });
  } else {
    res.render('error', {
      message: err.message,
      error: err
    });
  }
});

// Development error handler: will print stacktrace
if (process.env.NODE_ENV === 'development') {
  app.use((err, req, res) => {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// Production error handler: no stacktraces leaked to user
app.use((err, req, res) => {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

app.set('port', process.env.PORT || 3000);

const server = app.listen(app.get('port'), () => {
  console.log(`Express server listening on port ${server.address().port}`);
});
