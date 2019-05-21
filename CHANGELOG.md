# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
