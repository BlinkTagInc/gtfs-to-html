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
router.get('/', async (req, res, next) => {
  try {
    const agencies = await gtfs.getAgencies();
    const sortedAgencies = _.sortBy(agencies, 'agency_name');
    return res.render('app/agencies', {agencies: sortedAgencies});
  } catch (err) {
    next(err);
  }
});

/*
 * Show all timetable pages for an agency
 */
router.get('/timetable/:agencyKey', async (req, res, next) => {
  const agencyKey = req.params.agencyKey;

  if (!agencyKey) {
    return next(new Error('No agencyKey provided'));
  }
  try {
    const timetablePages = await utils.getTimetablePages(agencyKey);
    const sortedTimetablePages = _.sortBy(timetablePages, 'timetable_page_label');
    res.render('app/timetablepages', {agencyKey, timetablePages: sortedTimetablePages});
  } catch (err) {
    next(err);
  }
});

/*
 * Show a specific timetable page
 */
router.get('/timetable/:agencyKey/:timetablePageId', async (req, res, next) => {
  const agencyKey = req.params.agencyKey;
  const timetablePageId = req.params.timetablePageId;

  if (!agencyKey) {
    return next(new Error('No agencyKey provided'));
  }

  if (!timetablePageId) {
    return next(new Error('No timetablePageId provided'));
  }
  try {
    const timetablePage = await utils.getTimetablePage(agencyKey, timetablePageId);
    const results = await utils.generateHTML(timetablePage, config);
    res.send(results.html);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
