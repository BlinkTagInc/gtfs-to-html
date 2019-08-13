const _ = require('lodash');
const gtfs = require('gtfs');
const express = require('express');

const formatters = require('../lib/formatters');
const utils = require('../lib/utils');

const selectedConfig = require('../config');

const config = utils.setDefaultConfig(selectedConfig);
// Override noHead config option so full HTML pages are generated
config.noHead = false;
config.assetPath = '/';
config.log = console.log;
config.logWarning = console.warn;
config.logError = console.error;

const router = new express.Router();

/*
 * Show all agencies
 */
router.get('/', async (req, res, next) => {
  try {
    const agencies = await gtfs.getAgencies();
    const sortedAgencies = _.sortBy(agencies, 'agency_name');
    return res.render('agencies', {agencies: sortedAgencies});
  } catch (error) {
    next(error);
  }
});

/*
 * Show all timetable pages for an agency
 */
router.get('/timetable/:agencyKey', async (req, res, next) => {
  const {agencyKey} = req.params;

  if (!agencyKey) {
    return next(new Error('No agencyKey provided'));
  }

  try {
    const timetablePages = [];
    const timetablePageIds = _.map(await utils.getTimetablePages(agencyKey, config), 'timetable_page_id');

    for (const timetablePageId of timetablePageIds) {
      const timetablePage = await utils.getFormattedTimetablePage(agencyKey, timetablePageId, config);

      if (!timetablePage.consolidatedTimetables || timetablePage.consolidatedTimetables.length === 0) {
        console.error(`No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`);
      }

      timetablePage.relativePath = `/timetable/${agencyKey}/${timetablePage.timetable_page_id}`;
      for (const timetable of timetablePage.consolidatedTimetables) {
        timetable.timetable_label = formatters.formatTimetableLabel(timetable);
      }
      timetablePages.push(timetablePage);
    }

    const sortedTimetablePages = _.sortBy(timetablePages, timetablePage => {
      if (timetablePage.timetable_page_label !== '' && timetablePage.timetable_page_label !== undefined) {
        return timetablePage.timetable_page_label;
      }

      // Get route info from first timetable
      return timetablePage.consolidatedTimetables[0].timetable_label;
    });

    const html = await utils.generateOverviewHTML(agencyKey, sortedTimetablePages, config);
    res.send(html);
  } catch (error) {
    next(error);
  }
});

/*
 * Show a specific timetable page
 */
router.get('/timetable/:agencyKey/:timetablePageId', async (req, res, next) => {
  const {agencyKey, timetablePageId} = req.params;

  if (!agencyKey) {
    return next(new Error('No agencyKey provided'));
  }

  if (!timetablePageId) {
    return next(new Error('No timetablePageId provided'));
  }

  try {
    const timetablePage = await utils.getFormattedTimetablePage(agencyKey, timetablePageId, config);

    const results = await utils.generateHTML(timetablePage, config);
    res.send(results.html);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
