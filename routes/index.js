var gtfs = require('gtfs');
var router = require('express').Router();
var utils = require('../lib/utils');


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
    res.render('routes', {routes: routes, agencyKey: agencyKey});
  });
});


router.get('/timetable', function(req, res, next) {
  // /timetable?agency_key=eldoradotransit-ca-us&route_id=1970&direction_id=1

  var agencyKey = req.query.agency_key;
  var routeId = req.query.route_id;
  var directionId = req.query.direction_id;

  utils.generateHTML(agencyKey, routeId, directionId, function(e, html) {
    if(e) return next(e);

    res.send(html);
  });
});


module.exports = router;
