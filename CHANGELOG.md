# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.2] - 2023-05-04

### Updated

- Dependency updates

## [2.5.1] - 2023-03-06

### Updated

- Dependency updates
- Optimize duplicateStopsForDifferentArrivalDeparture

## [2.5.0] - 2022-12-31

### Updated

- Updated to node-gtfs v4
- Dependency updates

## [2.4.4] - 2022-12-22

### Updated

- Use adjacent duplicate stoptimes as arrival/depart if different times
- Updates to gtfstohtml.com documentation website dependencies
- Dependency updates

## [2.4.3] - 2022-11-10

### Updated

- Initialize Map with bounds padding
- Omit unneeded fields from geojson
- Remove adjacent stoptimes with the same stop_id
- Dependency updates

## [2.4.2] - 2022-07-26

### Updated

- Dependency updates

### Fixed

- Moved tailwindcss include to header

## [2.4.1] - 2022-07-10

### Updated

- Update Dockerfile to node 16
- Dependency updates
- Use yoctocolors instead of chalk

## [2.4.0] - 2022-06-07

### Updated

- Dependency updates
- Add route labels and stops to system map
- Turn off points of interest labels on all maps
- Better map data styles
- Improved system map route and stop highlighting
- Updated to tailwindcss 3

## [2.3.5] - 2022-04-26

### Updated

- Dependency updates

## [2.3.4] - 2022-04-09

### Updated

- Remove route info from map geojson
- Dependency updates

## [2.3.3] - 2022-01-21

### Updated

- Dependency updates

## [2.3.2] - 2021-12-28

### Updated

- Dependency updates
- Updated docs info on multi-route timetables

## [2.3.1] - 2021-11-26

### Updated

- Dependency updates
- Better trip names for CSV export

## [2.3.0] - 2021-11-05

### Added

- Support for exporting timetables in CSV format

### Updated

- Update route color swatch styles to support longer names
- Dependency updates

## [2.2.1] - 2021-10-17

### Added

- Added release-it info to package.json

## [2.2.0] - 2021-10-14

- Dependency updates (9adae81)
- Support for showStoptimesForRequestStops config variable (5790d9d)
- Documentation updates (6ba6b13)

## [2.1.9] - 2021-10-11

### Fixed

- Better warning if directory is not writable

### Updated

- Dependency updates

## [2.1.8] - 2021-09-30

### Fixed

- Add support for custom config in demo app
- Correct argument usage feedback

### Updated

- Dependency updates

## [2.1.7] - 2021-09-25

### Added

- Dockerfile and instructions for using docker

### Updated

- Dependency updates

## [2.1.6] - 2021-08-21

### Changed

- Better command line warnings and progressbar

### Updated

- Dependency updates

## [2.1.5] - 2021-08-02

### Fixed

- Handle timetables with no routes

### Updated

- Dependency updates
- Speed up database import

## [2.1.4] - 2021-07-18

### Fixed

- Show all stops on route maps

### Updated

- Dependency updates

## [2.1.3] - 2021-07-14

### Fixed

- Copy js to zipped output

### Updated

- Dependency updates

## [2.1.2] - 2021-07-09

### Changed

- Hide timetable service_notes div if empty
- Fall back to "beginning" sorting algorithm if no common stop

## [2.1.1] - 2021-07-09

### Fixed

- Fix for showRouteTitle config

## [2.3.1] - 2021-11-26

### Added

- Husky and Prettier

### Updated

- Dependency updates

## [2.1.0] - 2021-07-08

### Changed

- Improved trip sorting algorithm

### Updated

- Updated documentation on trip sorting options
- Dependency updates

## [2.0.4] - 2021-06-23

### Fixed

- Filtering stops used when start_time/end_time filters for timetables are present
- Geojson generation for timetables when start_time/end_time filters for timetables are present

### Updated

- Dependency updates

## [2.0.3] - 2021-06-18

### Fixed

- noHead config option

### Updated

- Dependency updates

## [2.0.2] - 2021-06-15

### Updated

- Dependency updates
- Use eslint instead of xo

## [2.0.1] - 2021-05-15

### Fixed

- Fix for default template path
- Fix for copying css/js folders

### Updated

- Documentation updates
- Dependency updates

## [2.0.0] - 2021-05-13

### Breaking Changes

- Converted to ES6 Module

## [1.4.16] - 2021-05-07

### Changed

- Move directionNames logic to template

### Updated

- Dependency updates
- Updates README.md

## [1.4.15] - 2021-04-20

### Updated

- Better error logging
- Readme updates
- Dependency updates

## [1.4.14] - 2021-03-24

### Updated

- Filter out trips with < 2 stoptimes
- Dependency updates

## [1.4.13] - 2021-03-17

### Updated

- Put route lines below street name labels on all maps
- Updated demo app library versions
- Dependency updates

### Fixed

- Fix for timepoint determination function

## [1.4.12] - 2021-03-02

### Updated

- Dependency updates (pug security update)

## [1.4.11] - 2021-02-17

### Fixed

- zipOutput fix

### Updated

- Dependency updates

## [1.4.10] - 2021-02-02

### Updated

- Dependency updates
- Documentation improvements

## [1.4.9] - 2020-12-31

### Updated

- Optimize convertRoutesToTimetablePages
- Dependency updates

### Fixed

- Fix to handle GTFS with over 1000 calendars

## [1.4.8] - 2020-12-21

### Updated

- Better error messages
- Dependency updates

## [1.4.7] - 2020-12-18

### Updated

- Better map stop styles
- Better route short name circles

### Fixed

- Use correct color on map for multi-route timetables

## [1.4.6] - 2020-12-13

### Updated

- Better default GTFS in sample
- Improvements to timetable map popups

### Fixed

- Hide progress bar when verbose = false
- Detect TTY and use \n if not

## [1.4.5] - 2020-12-09

### Updated

- Mapbox GL 2.0
- Timetable map style improvements
- Better timetablepage default name
- Change path to default template

### Fixed

- Don't copy static assets if noHead=true
- Handle routes with no agency_id

## [1.4.4] - 2020-12-08

### Updated

- Improved route and overview maps

## [1.4.3] - 2020-12-07

### Added

- Add `debug` config option for profiling database queries

### Changed

- Work on optimizing database queries

## [1.4.2] - 2020-12-03

### Updated

- Group routes by agency on overview page

## [1.4.1] - 2020-11-27

### Updated

- Support for importing multiple GTFS files at a time.

## [1.4.0] - 2020-11-19

### Fixed

- Better sort order for timetable_pages

### Updated

- Switch to tailwindcss for default template styling.
- Simplify site styles and js CDN includes

## [1.3.2] - 2020-11-18

### Updated

- Dependency updates

### Fixed

- Fix for duplicate stops on loop trips

## [1.3.1] - 2020-11-11

### Updated

- Documentation

### Fixed

- Timetable generation with no timetables.txt and no calendar_dates.txt

## [1.3.0] - 2020-11-10

### Added

- Timetable notes

## [1.2.2] - 2020-11-10

### Updated

- Link symbols to notes
- Updated readme

### Fixed

- Fix for generation without timetables.txt

## [1.2.1] - 2020-10-30

### Fixed

- Fix for trips with null direction

## [1.2.0] - 2020-10-30

### Added

- `allowEmptyTimetables` config option

### Updated

- Improved warning output
- Dependency updates

## [1.1.1] - 2020-10-22

### Updated

- Reorganized template functions

### Fixed

- Better geojson simplification
- Fix for finding common stop id

## [1.1.0] - 2020-10-17

### Added

- Use directed graph topology sort to determine stop order by default

### Fixed

- Default route color on maps

## [1.0.12] - 2020-10-14

### Updated

- Improved warning output
- Dependency updates

## [1.0.11] - 2020-10-13

### Added

- Support for extended GTFS route types

## [1.0.10] - 2020-10-13

### Updated

- Dependency updates
- Better error logging

## [1.0.9] - 2020-10-02

### Fixed

- Fix for frequencies

## [1.0.8] - 2020-09-28

### Fixed

- Fixes for time of day timetable filters
- Removed unused template files

### Updated

- Updated bootstrap version used in template
- Dependency updates
- Documentation updates

## [1.0.7] - 2020-09-14

### Fixed

- Fixes for overview page null vs undefined

### Updated

- Better error for invalid stop_id
- Dependency updates

## [1.0.6] - 2020-09-13

### Fixed

- Fixed truncated text on progress bar
- Fixes for timetable generation without timetables.txt files

## [1.0.5] - 2020-09-12

### Fixed

- Filter out invalid characters from html ids

### Updated

- Cleanup timetable map and system map js

## [1.0.4] - 2020-09-12

### Fixed

- Fix for showOnlyTimepoint filter

## [1.0.3] - 2020-09-09

### Fixed

- Fix for timetable_sequence sorting

## [1.0.2] - 2020-09-06

### Fixed

- Fix for route_short_name for multiroute timetables

### Changed

- Updated config sample sqlitePath
- Dependency updates

## [1.0.1] - 2020-08-23

### Changed

- Improvements to geoJSON creation

## [1.0.0] - 2020-08-20

### Changed

- Use node-gtfs 2.0.0 with SQLite
- Remove mongoDB
- Documentation updates
- Map style improvements

## [0.21.1] - 2020-08-14

### Changed

- Show route short name for multiroute timetables
- Menu padding in default template
- Always show stop times for stops with pickup_type or drop_off_type greater than zero

## [0.21.0] - 2020-07-28

### Added

- Support for `start_time` and `end_time` fields in `timetables.txt`

### Fixed

- Documentation improvements

## [0.20.1] - 2020-07-15

### Added

- Prettier error handling
- Documentation website
- Documentation improvements

### Fixed

- Correct output path for zip files
- Warning info

## [0.20.0] - 2020-06-20

### Added

- Added support for timetables that include more than one route.

## [0.19.1] - 2020-06-04

### Changed

- Use turf.js for geojson simplification.

## [0.19.0] - 2020-05-01

### Added

- Added support for `useParentStation` config variable.

## [0.18.1] - 2019-09-25

### Fixed

- Fixed paths when running as installed `gtfs-to-html` command

## [0.18.0] - 2019-09-25

### Added

- PDF export support using `outputFormat` config option

## [0.17.9] - 2019-08-12

### Updated

- Handle GTFS with no calendars.txt

## Fixed

- Logging when running in app mode
- GTFS with no timetablepages

## [0.17.8] - 2019-08-09

### Updated

- node-gtfs library
- dependencies and node version

## [0.17.7] - 2019-08-06

### Added

- `dataExpireAfterSeconds` config option

### Fixed

- Hide summarty table if using custom logging function

## [0.17.6] - 2019-08-06

### Added

- Config option for custom logging function

## [0.17.5] - 2019-07-19

### Added

- Support for `showStopCity` in vertical orientation timetables.

## [0.17.4] - 2019-07-11

### Added

- Support HTML in `formatted_time` config

### Fixed

- Capitalize days of the week by default
- Don't require a direction_id field to exist in trips.txt

## [0.17.3] - 2019-06-07

### Changed

- Updates to mongo connection code

### Fixed

- Handle timetables with no matching calendars

## [0.17.2] - 2019-05-20

### Added

- Add GTFS-to-HTML version to log.txt
- Add version and date to timetable HTML as comment

### Changed

- Use config defaults when running as npm module
- Style improvements for views without maps

### Fixed

- fix for convertRouteToTimetablePage
- fix for log output

## [0.17.1] - 2019-05-17

### Changed

- Update .gitignore

## [0.17.0] - 2019-05-17

### Added

- More sorting algorithms (`sortingAlgorithm` config variable)
- Both arrival and departure shown if difference specified (`showArrivalOnDifference` config variable)
- Default timetable orientation (`defaultOrientation` config variable)
- Configurable day strings (`daysStrings` and `daysShortStrings` config variables)
- Configurable date and time formatting (`dateFormat` and `timeFormat` config variables)

## [0.16.3] - 2019-04-09

### Changed

- Updated node-gtfs library to 1.8.5 to avoid query timeout on long imports

## [0.16.2] - 2019-03-12

### Changed

- Added support for "Continues From" trips.
- Improvements to "Continues As" logic.
- Changed config option `show_continues_as` to `show_trip_continuation`.

## [0.16.1] - 2019-03-07

### Changed

- Added ability to hide specific symbols, such as `requestDropoffSymbol` by setting value to `null`.
- Better color swatch use on route labels

## [0.16.0] - 2019-03-01

### Changed

- Added automatic support for showing stops with different arrival and departure times as two separate stops.

## [0.15.1] - 2019-02-28

### Added

- Changelog

### Changed

- Updated dependencies to fix issue with geojson consolidation
