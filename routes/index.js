var _ = require('underscore');
var gtfs = require('../gtfs');
var router = require('express').Router();
var utils = require('../lib/utils');
var config = require('../config');


router.get('/', function(req, res, next) {
  // show all agencies
  gtfs.agencies(function(e, agencies) {
    res.render('agencies', {agencies: agencies});
  });
});


router.get('/routes', function(req, res, next) {
  // show all routes
  var agencyKey = req.query.agency_key;

  gtfs.getRoutesByAgency(agencyKey, function(e, routes) {
    gtfs.getTimetablesByAgency(agencyKey, function(e, timetables) {
      var timetablesByRoute = _.groupBy(timetables, 'route_id');
      routes = routes.map(function(route) {
        route = route.toObject();
        route.timetables = _.sortBy(timetablesByRoute[route.route_id], 'direction_id') || [];
        return route;
      });
      res.render('routes', {routes: routes, agencyKey: agencyKey});
    });
  });
});


router.get('/timetable', function(req, res, next) {
  var agencyKey = req.query.agency_key;
  var timetableId = req.query.timetable_id;

  utils.generateHTML(agencyKey, timetableId, config, function(e, html) {
    if(e) return next(e);
    res.send(html);
  });
});


module.exports = router;
