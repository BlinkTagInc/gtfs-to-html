const _ = require('underscore');
const gtfs = require('gtfs');
const router = require('express').Router();

const config = require('../config');
const utils = require('../lib/utils');

router.get('/', (req, res) => {
  // show all agencies
  gtfs.agencies((e, agencies) => {
    res.render('agencies', { agencies });
  });
});

router.get('/routes', (req, res, next) => {
  // show all routes
  const agencyKey = req.query.agency_key;

  gtfs.getRoutesByAgency(agencyKey, (err, routes) => {
    if (err) return next(err);
    gtfs.getTimetablesByAgency(agencyKey, (err, timetables) => {
      if (err) return next(err);
      const timetablesByRoute = _.groupBy(timetables, 'route_id');
      routes = _.sortBy(routes.map((route) => {
        route = route.toObject();
        route.timetables = _.sortBy(timetablesByRoute[route.route_id], 'direction_id') || [];
        return route;
      }), (route) => {
        return parseInt(route.route_id, 10);
      });
      res.render('routes', { routes, agencyKey });
    });
  });
});

router.get('/timetable', (req, res, next) => {
  const agencyKey = req.query.agency_key;
  const timetableId = req.query.timetable_id;

  utils.generateHTML(agencyKey, timetableId, config, (err, html) => {
    if (err) return next(err);
    res.send(html);
  });
});

module.exports = router;
