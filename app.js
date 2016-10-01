const express = require('express');
const path = require('path');
const logger = require('morgan');
const bodyParser = require('body-parser');

const routes = require('./routes/index');

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);

// error handlers

// 404 error handler
app.use((req, res, next) => {
  const err = {
    message: 'Not Found',
    status: 404
  };
  res.status(404);
  if (req.xhr) {
    res.send({
      message: err.message,
      error: err,
    });
  } else {
    res.render('error', {
      message: err.message,
      error: err,
    });
  }
});

// development error handler
// will print stacktrace
if (process.env.NODE_ENV === 'development') {
  app.use((err, req, res) => {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use((err, req, res) => {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

module.exports = app;
