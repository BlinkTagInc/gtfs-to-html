const { map, sortBy } = require('lodash');
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

gtfs.openDb(config);

/*
 * Show all timetable pages
 */
router.get('/', async (request, response, next) => {
  try {
    const timetablePages = [];
    const timetablePageIds = map(await utils.getTimetablePages(config), 'timetable_page_id');

    for (const timetablePageId of timetablePageIds) {
      // eslint-disable-next-line no-await-in-loop
      const timetablePage = await utils.getFormattedTimetablePage(timetablePageId, config);

      if (!timetablePage.consolidatedTimetables || timetablePage.consolidatedTimetables.length === 0) {
        console.error(`No timetables found for timetable_page_id=${timetablePage.timetable_page_id}`);
      }

      timetablePage.relativePath = `/timetables/${timetablePage.timetable_page_id}`;
      for (const timetable of timetablePage.consolidatedTimetables) {
        timetable.timetable_label = formatters.formatTimetableLabel(timetable);
      }

      timetablePages.push(timetablePage);
    }

    const sortedTimetablePages = sortBy(timetablePages, timetablePage => {
      if (timetablePage.timetable_page_label !== '' && timetablePage.timetable_page_label !== null) {
        return timetablePage.timetable_page_label;
      }

      // Get route info from first timetable
      return timetablePage.consolidatedTimetables[0].timetable_label;
    });

    const html = await utils.generateOverviewHTML(sortedTimetablePages, config);
    response.send(html);
  } catch (error) {
    next(error);
  }
});

/*
 * Show a specific timetable page
 */
router.get('/timetables/:timetablePageId', async (request, response, next) => {
  const { timetablePageId } = request.params;

  if (!timetablePageId) {
    return next(new Error('No timetablePageId provided'));
  }

  try {
    const timetablePage = await utils.getFormattedTimetablePage(timetablePageId, config);

    const results = await utils.generateHTML(timetablePage, config);
    response.send(results.html);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
