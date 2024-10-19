---
id: configuration
title: Configuration Options
---

GTFS-to-HTML reads its configuration from a JSON file. To get started, copy `config-sample.json` to `config.json` and add your project's configuration. An example `config-sample-full.json` file includes a full list of all configuration options while `config-sample.json` only includes a few of the most commonly used options.

    cp config-sample.json config.json

Ensure that your config.json is [valid JSON](https://jsonformatter.curiousconcept.com) before proceeding.

:::note
All files starting with `config*.json` are .gitignored - so you can create multiple configuration files such as `config-caltrain.json`. Use the --configPath option when running GTFS-to-HTML.
:::

| option                                                          | type             | description                                                                                      |
| --------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| [`agencies`](#agencies)                                         | array            | An array of GTFS and GTFS-realtime URLs to be imported.                                                           |
| [`allowEmptyTimetables`](#allowemptytimetables)                 | boolean          | Whether or not to generate timetables that have no trips.                                        |
| [`beautify`](#beautify)                                         | boolean          | Whether or not to beautify the HTML output.                                                      |
| [`coordinatePrecision`](#coordinateprecision)                   | integer          | Number of decimal places to include when rendering geoJSON map output.                                       |
| [`dateFormat`](#dateformat)                                     | string           | A string defining date format in moment.js style.                                                |
| [`dayShortStrings`](#dayshortstrings)                           | array of strings | An array defining contractions of weekdays names from Monday to Sunday.                          |
| [`dayStrings`](#daystrings)                                     | array of strings | An array defining weekdays names from Monday to Sunday.                                          |
| [`debug`](#debug)                                               | boolean          | Enable logging of SQL queries and other info.                                                    |
| [`defaultOrientation`](#defaultorientation)                     | string           | Specify timetable orientation, when not specified in `timetables.txt`.                           |
| [`effectiveDate`](#effectivedate)                               | string           | A date to print at the top of the timetable.                                                     |
| [`endDate`](#enddate)                                        | string           | A date in ISO 8601 format to use to control which calendars are used for the timetables.                |
| [`interpolatedStopSymbol`](#interpolatedstopsymbol)             | string           | The symbol used to indicate that a timepoint isn't fixed, but just interpolated.                 |
| [`interpolatedStopText`](#interpolatedstoptext)                 | string           | The text used to describe a timepoint isn't fixed, but just interpolated.                        |
| [`linkStopUrls`](#linkStopurls)                                 | boolean          | Whether or not to hyperlink timetable stop names to the `stop_url` defined in `stops.txt`.       |
| [`logFunction`](#logfunction)                                   | function         | A custom logging function for handling output of logs.                                           |
| [`mapStyleUrl`](#mapstyleurl)                       | string           | The URL to a MapLibre style to use for maps.                                |
| [`menuType`](#menutype)                                         | string           | The type of menu to use for selecting timetables on a timetable page.                            |
| [`noDropoffSymbol`](#nodropoffsymbol)                           | string           | The symbol used to indicate ta stop where no drop off is available.                              |
| [`noDropoffText`](#nodropofftext)                               | string           | The text used to describe a stop where no drop off is available.                                 |
| [`noHead`](#nohead)                                             | boolean          | Whether or not to skip the header and footer of the HTML document.                               |
| [`noServiceSymbol`](#noservicesymbol)                           | string           | The symbol used when a specific trip does not serve a specified stop.                            |
| [`noServiceText`](#noservicetext)                               | string           | The text used to describe a stop which is not served by a specific trip.                         |
| [`outputFormat`](#outputformat)                                 | string           | The file format of the timetables generated. Either `html`, `pdf` or `csv`.                      |
| [`outputPath`](#outputpath)                                     | string           | The path to write the timetables to. Optional, defaults to `html/<agencyKey>`.  |
| [`overwriteExistingFiles`](#overwriteexistingfiles)             | boolean          | Whether or not to overwrite existing files in the `outputPath` directory.                               |
| [`noPickupSymbol`](#nopickupsymbol)                             | string           | The symbol used to indicate a stop where no pickup is available.                                 |
| [`noPickupText`](#nopickuptext)                                 | string           | The text used to describe a stop where no pickup is available.                                   |
| [`requestDropoffSymbol`](#requestdropoffsymbol)                 | string           | The symbol used to indicate a stop where riders must request a drop off.                         |
| [`requestDropoffText`](#requestdropofftext)                     | string           | The text used to describe a stop where riders must request a drop off.                           |
| [`requestPickupSymbol`](#requestpickupsymbol)                   | string           | The symbol used to indicate a stop where riders must request a pickup.                           |
| [`requestPickupText`](#requestpickuptext)                       | string           | The text used to describe a stop where riders must request a pickup.                             |
| [`serviceNotProvidedOnText`](#servicenotprovidedontext)         | string           | The text used to label days where service is not provided.                                       |
| [`serviceProvidedOnText`](#serviceprovidedontext)               | string           | The text used to label days where service is provided.                                           |
| [`showArrivalOnDifference`](#showarrivalondifference)           | float            | Defines a difference between departure and arrival, on which arrival column/row will be shown.   |
| [`showCalendarExceptions`](#showcalendarexecptions)             | boolean          | Whether or not to show a list of calendar exceptions below each timetable. |
| [`showMap`](#showmap)                                           | boolean          | Whether or not to show a map of the route on the timetable.                                      |
| [`showOnlyTimepoint`](#showonlytimepoint)                       | boolean          | Whether or not all stops should be shown, or only stops with a `timepoint` value in `stops.txt`. |
| [`showRouteTitle`](#showroutetitle)                             | boolean          | Whether or not to show the route title at the top of the timetable page.                         |
| [`showStopCity`](#showstopcity)                                 | boolean          | Whether or not to show each stop's city.                                                         |
| [`showStopDescription`](#showstopdescription)                   | boolean          | Whether or not to show a stop description.                                                       |
| [`showStoptimesForRequestStops`](#showstoptimesforrequeststops) | boolean          | Whether or not to show times for stops that require a request for pickup or dropoff.             |
| [`skipImport`](#skipimport)                                     | boolean          | Whether or not to skip importing GTFS data into SQLite.                                          |
| [`sortingAlgorithm`](#sortingalgorithm)                         | string           | Defines the trip-sorting algorithm.                                                              |
| [`sqlitePath`](#sqlitepath)                                     | string           | A path to an SQLite database. Optional, defaults to using an in-memory database.                 |
| [`startDate`](#startdate)                                     | string           | A date in ISO 8601 format to use to control which calendars are used for the timetables.                |
| [`templatePath`](#templatepath)                                 | string           | Path to custom pug template for rendering timetable.                                             |
| [`timeFormat`](#timeformat)                                     | string           | A string defining time format in moment.js style.                                                |
| [`useParentStation`](#useparentstation)                         | boolean          | Whether or not to use a stop's `parent_station`.                                                 |
| [`verbose`](#verbose)                                           | boolean          | Whether or not to print output to the console.                                                   |
| [`zipOutput`](#zipoutput)                                       | boolean          | Whether or not to zip the output into one zip file.                                              |

### agencies

{Array} Specify the GTFS to be imported in an `agencies` array. GTFS files can be imported via a `url` or a local `path`. GTFS-Realtime URLs can be specified using `realtimeTripUpdates` and `realtimeVehiclePositions` to support showing realtime vehicle positions and trip updates on a map.

Each GTFS needs an `agencyKey`, a short name you create that is specific to that GTFS file.

- Specify a download URL:

```json
{
  "agencies": [
    {
      "agencyKey": "county-connection",
      "url": "https://countyconnection.com/GTFS/google_transit.zip"
    }
  ]
}
```

- Specify a path to a zipped GTFS file:

```json
{
  "agencies": [
    {
      "agencyKey": "myAgency",
      "path": "/path/to/the/gtfs.zip"
    }
  ]
}
```

- Specify a path to an unzipped GTFS file:

```json
{
  "agencies": [
    {
      "agencyKey": "myAgency",
      "path": "/path/to/the/unzipped/gtfs/"
    }
  ]
}
```

- Add GTFS-Realtime urls to enable vehicle positions on the route map. Each GTFS-Realtime field accepts an object with a `url` field and optional `headers` field to specify HTTP headers to include with the request, usually for authorization purposes.

```json
{
  "agencies": [
    {
      "agencyKey": "marintransit",
      "url": "https://marintransit.org/data/google_transit.zip",
      "realtimeAlerts": {
        "url": "https://api.marintransit.org/alerts",
        "headers": {
          "Authorization": "bearer 123456780"
        }
      },
      "realtimeTripUpdates": {
        "url": "https://api.marintransit.org/tripupdates",
        "headers": {
          "Authorization": "bearer 123456780"
        }
      },
      "realtimeVehiclePositions": {
        "url": "https://api.marintransit.org/vehiclepositions",
        "headers": {
          "Authorization": "bearer 123456780"
        }
      }
    }
  ]
}
```

- Exclude files - if you don't want all GTFS files to be imported, you can specify an array of files to exclude.

```json
{
  "agencies": [
    {
      "agencyKey": "myAgency",
      "path": "/path/to/the/unzipped/gtfs/",
      "exclude": [
        "shapes",
        "stops"
      ]
    }
  ]
}
```

- Optionally specify a proj4 projection string to correct poorly formed coordinates in the GTFS file

```json
{
  "agencies": [
    {
      "agencyKey": "myAgency",
      "path": "/path/to/the/unzipped/gtfs/",
      "proj": "+proj=lcc +lat_1=46.8 +lat_0=46.8 +lon_0=0 +k_0=0.99987742 +x_0=600000 +y_0=2200000 +a=6378249.2 +b=6356515 +towgs84=-168,-60,320,0,0,0,0 +pm=paris +units=m +no_defs"
    }
  ]
}
```

- Specify multiple agencies to be imported. Note that it is often better to have one configuration file per agency and call gtfs-to-html multiple times rather than have two different agencies in the same config file. If agencies have conflicting ids for routes, stops, calendars or more, GTFS-to-HTML will fail.

```json
{
  "agencies": [
    {
      "agencyKey": "myAgency",
      "path": "/path/to/the/gtfs.zip"
    },
    {
      "agencyKey": "otherAgency",
      "path": "/path/to/the/othergtfs.zip"
    }
  ]
}
```

### allowEmptyTimetables

\{Boolean\} Whether or not to generate empty timetables that have no trips. Defaults to `false`.

```json
"allowEmptyTimetables": false
```

### beautify

\{Boolean\} Whether or not to beautify the HTML output. Defaults to `false`.

```json
"beautify": false
```

### coordinatePrecision

\{Integer\} The number of decimal places to include in the latitude and longitude of coordinates in GeoJSON used in maps. Omit to avoid any rounding. `5` is a reasonable value (about 1.1 meters).

```json
"coordinatePrecision": 5
```

### dateFormat

\{String\} A string defining date format using moment.js tokens. [See full list of formatting options](https://momentjs.com/docs/#/displaying/format/). Defaults to `MMM D. YYYY` which yields "Apr 5, 2022".

```json
"dateFormat": "MMM D, YYYY"
```

### daysShortStrings

\{Array [String]\} An array of strings defining contractions of weekday names. Specify from Monday to Sunday.

```json
"daysShortStrings": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
```

### daysStrings

\{Array [String]\} An array of strings defining contractions of weekday names. Specify from Monday to Sunday.

```json
"daysStrings": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
```

### debug

\{Boolean\} Whether or not to enable loggin of SQL queries and other info. Defaults to false.

```json
"debug": false
```

### defaultOrientation

\{String\} Specifies timetable orientation, when not mentioned in `timetables.txt`. Valid options are `vertical`, `horizontal` or `hourly`. For details, see [`timetables.txt` `orientation` specification](https://gtfstohtml.com/docs/timetables).

```json
"defaultOrientation": "vertical"
```

### effectiveDate

\{String\} This is printed at the top of the timetable.

```json
"effectiveDate": "July 8, 2015"
```

### endDate

\{String\} A date in `YYYYMMDD` format to use to control which calendars are used for the timetables. Can be used with [startDate](#startdate) configuration options.

Optional, defaults to using all available calendars if not defined. Overridden by `start_date` and `end_date` defined in `timetables.txt`.

```json
"endDate": "2024-04-01"
```

### interpolatedStopSymbol

\{String\} The symbol used to indicate that a timepoint isn't fixed, but just interpolated. Defaults to `•`. To avoid having this symbol used in timetables, set it to `null`.

```json
"interpolatedStopSymbol": "•"
```

### interpolatedStopText

\{String\} The text used to describe that a timepoint isn't fixed, but just interpolated. Defaults to `Estimated time of arrival`.

```json
"interpolatedStopText": "Estimated time of arrival"
```

### linkStopUrls

\{Boolean\} Whether or not to hyperlink timetable stop names to the `stop_url` defined in `stops.txt`. If no `stop_url` is defined for a stop, no link will be created. Defaults to `false`.

```json
"linkStopUrls": false
```

### logFunction

\{Function\} If you want to route logs to a custom function, you can pass a function that takes a single `text` argument as `logFunction`. This can't be used when running GTFS-to-HTML as a command-line utility, only when included as part of a node.js app and passed in a config object to `gtfsToHtml()`. For example:

```javascript
import gtfsToHtml from 'gtfs-to-html';

const config = {
  agencies: [
    {
      agencyKey: 'county-connection',
      url: 'https://countyconnection.com/GTFS/google_transit.zip',
      exclude: ['shapes'],
    },
  ],
  logFunction: function (text) {
    // Do something with the logs here, like save it or send it somewhere
    console.log(text);
  },
};

gtfsToHtml(config);
```

### mapStyleUrl

\{String\} The URL to a [MapLibre JSON style](https://maplibre.org/maplibre-style-spec/). Optional, defaults to [https://tiles.openfreemap.org/styles/liberty](https://tiles.openfreemap.org/styles/liberty). Customize your own map style using [Maputnik](https://maputnik.github.io).

```json
"mapStyleUrl": "https://tiles.openfreemap.org/styles/bright"
```

### menuType

\{String\} The type of menu to use for selecting or navigating to timetables on timetable pages with multiple timetables. Valid choices are `none`, `simple`, `jump` and `radio`. Defaults to `simple`.

```json
"menuType": "jump"
```

### noDropoffSymbol

\{String\} The symbol used to indicate that no drop off is available at a stop. Defaults to `‡`. To avoid having this symbol used in timetables, set it to `null`.

```json
"noDropoffSymbol": "‡"
```

### noDropoffText

\{String\} The text used to describe that no drop off is available at a stop. Defaults to `No drop off available`.

```json
"noDropoffText": "No drop off available"
```

### noHead

\{Boolean\} Whether or not to skip the HTML head and footer when generating the HTML. This is useful for creating embeddable HTML without `<html>`, `<head>` or `<body>` tags. Defaults to `false`. Ignored if `outputFormat` is set to `pdf` or `csv`.

```json
"noHead": false
```

### noPickupSymbol

\{String\} The symbol used to indicate that no pickup is available at a stop. Defaults to `**`. To avoid having this symbol used in timetables, set it to `null`.

```json
"noPickupSymbol": "**"
```

### noPickupText

\{String\} The text used to describe that no pickup is available at a stop. Defaults to `No pickup available`.

```json
"noPickupText": "No pickup available"
```

### noServiceSymbol

\{String\} The symbol used when a specific trip does not serve a specified stop. Defaults to `-`. To avoid having this symbol used in timetables, set it to `null`.

```json
"noServiceSymbol": "-"
```

### noServiceText

\{String\} The text used to describe when a specific trip does not serve a specified stop. Defaults to `No service at this stop`.

```json
"noServiceText": "No service at this stop"
```

### outputFormat

\{String\} The file format of the timetables generated. Either `html`, `pdf` or `csv`. Defaults to `html`.

```json
"outputFormat": "html"
```

### outputPath

\{String\} The path to write the HTML, CSV or PDF timetables to. If `zipOutput` is true, a zip file of all tuimetables will be written to the `outputPath`. Optional, defaults to a folder named `html/<agencyKey>` in the current directory.

```json
"outputPath": "/path/to/output/timetables"
```

### overwriteExistingFiles

\{Boolean\} Whether or not to overwrite existing files in the `outputPath` folder. Optional, defaults to `true`.

```json
"overwriteExistingFiles": true

### requestDropoffSymbol

\{String\} The symbol used to indicate that riders must request to be dropped off at a stop. Defaults to `†`. To avoid having this symbol used in timetables, set it to `null`.

```json
"requestDropoffSymbol": "†"
```

### requestDropoffText

\{String\} The text used to describe that riders must request to be dropped off at a stop. Defaults to `Must request drop off`.

```json
"requestDropoffText": "Must request drop off"
```

### requestPickupSymbol

\{String\} The symbol used to indicate that riders must request pickup at a stop. Defaults to `***`. To avoid having this symbol used in timetables, set it to `null`.

```json
"requestPickupSymbol": "***"
```

### requestPickupText

\{String\} The text used to describe that riders must request pickup at a stop. Defaults to `Request stop - call for pickup`.

```json
"requestPickupText": "Request stop - call for pickup"
```

### serviceNotProvidedOnText

\{String\} The text used to label days where service is not provided. Defaults to `Service not provided on`.

```json
"serviceNotProvidedOnText": "Service not provided on"
```

### serviceProvidedOnText

\{String\} The text used to label days where service is provided. Defaults to `Service provided on`.

```json
"serviceProvidedOnText": "Service provided on"
```

### showArrivalOnDifference

\{Float\} Whether or not to show an arrival column/row in the timetable. It means, that if on at least one stop difference (stay on that stop) is **equal or greater** than specified here, the arrival time will be shown. Use `0` to show on each stop or `null` to skip showing an additional column for arrival.

```json
"showArrivalOnDifference": 0.2
```

### showCalendarExceptions

\{Boolean\} Whether or not to show a list of calendar exceptions below each timetable. Uses dates defined in calendar_dates.txt. Defaults to `true`.

```json
"showCalendarExceptions": true
```

### showMap

\{Boolean\} Whether or not to show a map of the route on the timetable. Defaults to `false`.

If you'd rather just get all stops and route info as geoJSON, see [gtfs-to-geojson](https://github.com/blinktaginc/gtfs-to-geojson).

```json
"showMap": false
```

### showOnlyTimepoint

\{Boolean\} Whether or not all stops should be shown, or only stops with a `timepoint` value in [stop_times.txt](https://developers.google.com/transit/gtfs/reference?hl=en#stop_times_fields) that is considered exact (i.e. empty or `1`). Defaults to `false`, all stops shown.

```json
"showOnlyTimepoint": false
```

### showRouteTitle

\{Boolean\} Whether or not to show the route title and effective date at the top of the timetable page and the timetable label and notes before each timetable. Defaults to `true`, showing the route title and timetable labels and notes.

```json
"showRouteTitle": true
```

### showStopCity

\{Boolean\} Whether or not to show the city for each stop. City is determined by the `stop_city` field in the non-standard `stop_attributes.txt`. Only has an effect when the timetable's `orientation` is `horizontal` or `hourly`. Defaults to `false`.

```json
"showStopCity": false
```

### showStopDescription

\{Boolean\} Whether or not to show a stop description for each stop. Stop description is taken from the `stop_desc` field in`stops.txt`. Defaults to `false`.

```json
"showStopDescription": false
```

### showStoptimesForRequestStops

\{Boolean\} Whether or not to show times for stops that require a request for pickup or dropoff. Some agencies prefer to hide the actual stoptimes from stops that require a quest and instead just show the request pickup or dropoff symbols. See [`requestDropoffSymbol`](#requestdropoffsymbol) and [`requestPickupSymbol`](#requestpickupsymbol) for how to customize appearance. Defaults to `true`.

```json
"showStoptimesForRequestStops": true
```

### skipImport

\{Boolean\} Whether or not to skip importing from GTFS into SQLite. Useful for re-running the script if the GTFS data has not changed. If you use this option and the GTFS file hasn't been imported or you don't have an `sqlitePath` to a non-in-memory database specified, you'll get an error. Defaults to `false`.

```json
"skipImport": false
```

### sortingAlgorithm

\{String\} Defines trip-sorting algorithm used to determine the order that trips are shown in timetables.

- `common` finds a common stop used by all trips and sorts by stoptimes at that stop. If there is no common stop for all trips, then `beginning` algorithm is used.
- `beginning` uses the first stoptime of each trip, which can be from different stops if not all trips have the same first stop. If a multiple trips have identical first stoptimes, the trip with the earlier last stoptimes comes first.
- `end` uses the last stoptime of each trip, which can be from different stops if not all trips have the same last stop. If a multiple trips have identical last stoptimes, the trip with the earlier first stoptimes comes first.
- `first` uses the first stop of the longest trip and sorts by stoptimes at that stop.
- `last` uses the last stop of the longest trip and sorts by stoptimes at that stop.

The default trip-sorting algorithm is `common`.

```json
"sortingAlgorithm": "common"
```

### sqlitePath

\{String\} A path to an SQLite database. Optional, defaults to using an in-memory database with a value of `:memory:`. If you want the data imported to persist, you need to specify a value for `sqlitePath`. Supports tilde as part of the path, like `~/Documents/gtfs`.

```json
"sqlitePath": "/tmp/gtfs"
```

### startDate

\{String\} A date in `YYYYMMDD` format to use to control which calendars are used for the timetables. Can be used with [endDate](#enddate) configuration options.

Optional, defaults to using all available calendars if not defined. Overridden by `start_date` and `end_date` defined in `timetables.txt`.

```json
"startDate": "2024-03-01"
```

### templatePath

\{String\} Path to a folder containing (pug)[https://pugjs.org/] template for rendering timetables. This is optional. Defaults to using the templates provided in `views/default`. All files within the `/views/custom` folder will be .gitignored, so you can copy the `views/default` folder to `views/custom/myagency` and make any modifications needed. Any custom views folder should contain pug templates called `timetablepage.pug`, `timetablepage_full.pug`, `overview.pug`, and `overview_full.pug`.

```json
"templatePath": "views/custom/my-agency/"
```

### timeFormat

\{String\} A string defining time format using moment.js tokens. [See full list of formatting options](https://momentjs.com/docs/#/displaying/format/). Defaults to `h:mma` which yields "8:36pm".

```json
"timeFormat": "h:mma"
```

### useParentStation

\{Boolean\} Whether or not to use the `parent_station` of a stop, if specified instead of the platform or boarding area. Useful if different trips for the same route have different platforms that you want to show up in the timetable as separate stops. Defaults to `true`.

```json
"useParentStation": true
```

### verbose

\{Boolean\} If you don't want the import script to print any output to the console, you can set `verbose` to `false`. Defaults to `true`.

```json
"verbose": false
```

### zipOutput

\{Boolean\} Whether or not to zip the output into one zip file named `timetables.zip`. Defaults to `false`.

```json
"zipOutput": false
```
