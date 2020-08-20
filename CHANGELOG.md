# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
