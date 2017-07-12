const _ = require('lodash');
const gtfs = require('gtfs');
const router = require('express').Router();

const utils = require('../lib/utils');

const selectedConfig = require('../config');

const config = utils.setDefaultConfig(selectedConfig);
// Override noHead config option so full HTML pages are generated
config.noHead = false;
config.assetPath = '';

/*
 * Show all agencies
 */
router.get('/', (req, res, next) => {
  gtfs.agencies().then(agencies => {
    const sortedAgencies = _.sortBy(agencies, 'agency_name');
    return res.render('app/agencies', {agencies: sortedAgencies});
  }, next);
});

/*
 * Show all timetable pages for an agency
 */
router.get('/timetable/:agencyKey', (req, res, next) => {
  const agencyKey = req.params.agencyKey;

  if (!agencyKey) {
    return next(new Error('No agencyKey provided'));
  }

  utils.getTimetablePages(agencyKey).then(timetablePages => {
    const sortedTimetablePages = _.sortBy(timetablePages, 'timetable_page_label');
    res.render('app/timetablepages', {agencyKey, timetablePages: sortedTimetablePages});
  }, next);
});

/*
 * Show a specific timetable page
 */
router.get('/timetable/:agencyKey/:timetablePageId', (req, res, next) => {
  const agencyKey = req.params.agencyKey;
  const timetablePageId = req.params.timetablePageId;

  if (!agencyKey) {
    return next(new Error('No agencyKey provided'));
  }

  if (!timetablePageId) {
    return next(new Error('No timetablePageId provided'));
  }

  utils.getTimetablePage(agencyKey, timetablePageId)
  .then(timetablePage => utils.generateHTML(agencyKey, timetablePage, config))
  .then(results => {
    res.send(results.html);
  })
  .catch(next);
});

module.exports = router;
