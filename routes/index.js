const _ = require('lodash');
const gtfs = require('gtfs');
const router = require('express').Router();

const config = require('../config');
const utils = require('../lib/utils');


/*
 * Show all agencies
 */
router.get('/', (req, res, next) => {
  gtfs.agencies((err, agencies) => {
    if (err) return next(err);

    return res.render('agencies', { agencies: _.sortBy(agencies, 'agency_name') });
  });
});


/*
 * Show all timetable pages for an agency
 */
router.get('/timetablepages', (req, res, next) => {
  const agencyKey = req.query.agency_key;

  utils.getTimetablePages(agencyKey, (err, timetablePages) => {
    if (err) return next(err);

    return res.render('timetablepages', { agencyKey, timetablePages });
  });
});


/*
 * Show a specific timetable page
 */
router.get('/timetablepage', (req, res, next) => {
  const agencyKey = req.query.agency_key;
  const timetablePageId = req.query.timetable_page_id;

  utils.getTimetablePage(agencyKey, timetablePageId, (err, timetablePage) => {
    if (err) return next(err);
    utils.generateHTML(agencyKey, timetablePage, config, (err, html) => {
      if (err) return next(err);
      res.send(html);
    });
  });
});

module.exports = router;
