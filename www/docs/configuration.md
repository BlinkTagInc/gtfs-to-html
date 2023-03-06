---
id: configuration
title: Configuration Options
---

GTFS-to-HTML reads its configuration from a JSON file. To get started, copy `config-sample.json` to `config.json` and then add your project's configuration to `config.json`.

    cp config-sample.json config.json

Ensure that your config.json is [valid JSON](https://jsonformatter.curiousconcept.com) before proceeding.

:::note
All files starting with `config*.json` are .gitignored - so you can create multiple configuration files such as `config-caltrain.json`.
:::

| option                                                          | type             | description                                                                                      |
| --------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| [`agencies`](#agencies)                                         | array            | An array of GTFS files to be imported.                                                           |
| [`allowEmptyTimetables`](#allowemptytimetables)                 | boolean          | Whether or not to generate timetables that have no trips.                                        |
| [`beautify`](#beautify)                                         | boolean          | Whether or not to beautify the HTML output.                                                      |
| [`coordinatePrecision`](#coordinateprecision)                   | integer          | Number of decimal places to include in geoJSON map output.                                       |
| [`dateFormat`](#dateformat)                                     | string           | A string defining date format in moment.js style.                                                |
| [`dayShortStrings`](#dayshortstrings)                           | array of strings | An array defining contractions of weekdays names from Monday to Sunday.                          |
| [`dayStrings`](#daystrings)                                     | array of strings | An array defining weekdays names from Monday to Sunday.                                          |
| [`debug`](#debug)                                               | boolean          | Enable logging of SQL queries and other info.                                                    |
| [`defaultOrientation`](#defaultorientation)                     | string           | Specify timetable orientation, when not specified in `timetables.txt`.                           |
| [`effectiveDate`](#effectivedate)                               | string           | A date to print at the top of the timetable.                                                     |
| [`interpolatedStopSymbol`](#interpolatedstopsymbol)             | string           | The symbol used to indicate that a timepoint isn't fixed, but just interpolated.                 |
| [`interpolatedStopText`](#interpolatedstoptext)                 | string           | The text used to describe a timepoint isn't fixed, but just interpolated.                        |
| [`linkStopUrls`](#linkStopurls)                                 | boolean          | Whether or not to hyperlink timetable stop names to the `stop_url` defined in `stops.txt`.       |
| [`logFunction`](#logfunction)                                   | function         | A custom logging function for handling output of logs.                                           |
| [`mapboxAccessToken`](#mapboxaccesstoken)                       | string           | The Mapbox access token for generating a map of the route.                                       |
| [`menuType`](#menutype)                                         | string           | The type of menu to use for selecting timetables on a timetable page.                            |
| [`noDropoffSymbol`](#nodropoffsymbol)                           | string           | The symbol used to indicate ta stop where no drop off is available.                              |
| [`noDropoffText`](#nodropofftext)                               | string           | The text used to describe a stop where no drop off is available.                                 |
| [`noHead`](#nohead)                                             | boolean          | Whether or not to skip the header and footer of the HTML document.                               |
| [`noServiceSymbol`](#noservicesymbol)                           | string           | The symbol used when a specific trip does not serve a specified stop.                            |
| [`noServiceText`](#noservicetext)                               | string           | The text used to describe a stop which is not served by a specific trip.                         |
| [`outputFormat`](#outputformat)                                 | string           | The file format of the timetables generated. Either `html`, `pdf` or `csv`.                      |
| [`noPickupSymbol`](#nopickupsymbol)                             | string           | The symbol used to indicate a stop where no pickup is available.                                 |
| [`noPickupText`](#nopickuptext)                                 | string           | The text used to describe a stop where no pickup is available.                                   |
| [`requestDropoffSymbol`](#requestdropoffsymbol)                 | string           | The symbol used to indicate a stop where riders must request a drop off.                         |
| [`requestDropoffText`](#requestdropofftext)                     | string           | The text used to describe a stop where riders must request a drop off.                           |
| [`requestPickupSymbol`](#requestpickupsymbol)                   | string           | The symbol used to indicate a stop where riders must request a pickup.                           |
| [`requestPickupText`](#requestpickuptext)                       | string           | The text used to describe a stop where riders must request a pickup.                             |
| [`serviceNotProvidedOnText`](#servicenotprovidedontext)         | string           | The text used to label days where service is not provided.                                       |
| [`serviceProvidedOnText`](#serviceprovidedontext)               | string           | The text used to label days where service is provided.                                           |
| [`showArrivalOnDifference`](#showarrivalondifference)           | float            | Defines a difference between departure and arrival, on which arrival column/row will be shown.   |
| [`showMap`](#showmap)                                           | boolean          | Whether or not to show a map of the route on the timetable.                                      |
| [`showOnlyTimepoint`](#showonlytimepoint)                       | boolean          | Whether or not all stops should be shown, or only stops with a `timepoint` value in `stops.txt`. |
| [`showRouteTitle`](#showroutetitle)                             | boolean          | Whether or not to show the route title at the top of the timetable page.                         |
| [`showStopCity`](#showstopcity)                                 | boolean          | Whether or not to show each stop's city.                                                         |
| [`showStopDescription`](#showstopdescription)                   | boolean          | Whether or not to show a stop description.                                                       |
| [`showStoptimesForRequestStops`](#showstoptimesforrequeststops) | boolean          | Whether or not to show times for stops that require a request for pickup or dropoff.             |
| [`skipImport`](#skipimport)                                     | boolean          | Whether or not to skip importing GTFS data into SQLite.                                          |
| [`sortingAlgorithm`](#sortingalgorithm)                         | string           | Defines the trip-sorting algorithm.                                                              |
| [`sqlitePath`](#sqlitepath)                                     | string           | A path to an SQLite database. Optional, defaults to using an in-memory database.                 |
| [`templatePath`](#templatepath)                                 | string           | Path to custom pug template for rendering timetable.                                             |
| [`timeFormat`](#timeformat)                                     | string           | A string defining time format in moment.js style.                                                |
| [`useParentStation`](#useparentstation)                         | boolean          | Whether or not to use a stop's `parent_station`.                                                 |
| [`verbose`](#verbose)                                           | boolean          | Whether or not to print output to the console.                                                   |
| [`zipOutput`](#zipoutput)                                       | boolean          | Whether or not to zip the output into one zip file.                                              |

### agencies

{Array} Specify the GTFS files to be imported in an `agencies` array. GTFS files can be imported via a `url` or a local `path`.

Each file needs an `agency_key`, a short name you create that is specific to that GTFS file. For GTFS files that contain more than one agency, you only need to list each GTFS file once in the `agencies` array, not once per agency that it contains.

To find an agency's GTFS file, visit [transitfeeds.com](http://transitfeeds.com). You can use the
URL from the agency's website or you can use a URL generated from the transitfeeds.com
API along with your API token.

- Specify a download URL:

```
{
  "agencies": [
    {
      "agency_key": "county-connection",
      "url": "http://cccta.org/GTFS/google_transit.zip"
    }
  ]
}
```

- Specify a path to a zipped GTFS file:

```
{
  "agencies": [
    {
      "agency_key": "myAgency",
      "path": "/path/to/the/gtfs.zip"
    }
  ]
}
```

- Specify a path to an unzipped GTFS file:

```
{
  "agencies": [
    {
      "agency_key": "myAgency",
      "path": "/path/to/the/unzipped/gtfs/"
    }
  ]
}
```

- Exclude files - if you don't want all GTFS files to be imported, you can specify an array of files to exclude.

```
{
  "agencies": [
    {
      "agency_key": "myAgency",
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

```
{
  "agencies": [
    {
      "agency_key": "myAgency",
      "path": "/path/to/the/unzipped/gtfs/",
      "proj": "+proj=lcc +lat_1=46.8 +lat_0=46.8 +lon_0=0 +k_0=0.99987742 +x_0=600000 +y_0=2200000 +a=6378249.2 +b=6356515 +towgs84=-168,-60,320,0,0,0,0 +pm=paris +units=m +no_defs"
    }
  ]
}
```

- Specify multiple agencies to be imported. Note that it is often better to have one configuration file per agency and call gtfs-to-html multiple times rather than have two different agencies in the same config file. If agencies have conflicting ids for routes, stops, calendars or more, GTFS-to-HTML will fail.

```
{
  "agencies": [
    {
      "agency_key": "myAgency",
      "path": "/path/to/the/gtfs.zip"
    },
    {
      "agency_key": "otherAgency",
      "path": "/path/to/the/othergtfs.zip"
    }
  ]
}
```

### allowEmptyTimetables

{Boolean} Whether or not to generate empty timetables that have no trips. Defaults to `false`.

```
    "allowEmptyTimetables": false
```

### beautify

{Boolean} Whether or not to beautify the HTML output. Defaults to `false`.

```
    "beautify": false
```

### coordinatePrecision

{Integer} The number of decimal places to include in the latitude and longitude of coordinates in GeoJSON used in maps. Omit to avoid any rounding. `5` is a reasonable value (about 1.1 meters).

```
    "coordinatePrecision": 5
```

### dateFormat

{String} A string defining date format using moment.js tokens. [See full list of formatting options](https://momentjs.com/docs/#/displaying/format/). Defaults to `MMM D. YYYY` which yields "Apr 5, 2022".

```
    "dateFormat": "MMM D, YYYY"
```

### daysShortStrings

{Array \[String\]} An array of strings defining contractions of weekday names. Specify from Monday to Sunday.

```
    "daysShortStrings": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
```

### daysStrings

{Array \[String\]} An array of strings defining contractions of weekday names. Specify from Monday to Sunday.

```
    "daysStrings": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
```

### debug

{Boolean} Whether or not to enable loggin of SQL queries and other info. Defaults to false.

```
    "debug": false
```

### defaultOrientation

{String} Specifies timetable orientation, when not mentioned in `timetables.txt`. Valid options are `vertical`, `horizontal` or `hourly`. For details, see [`timetables.txt` `orientation` specification](https://gtfstohtml.com/docs/timetables).

```
    "defaultOrientation": "vertical"
```

### effectiveDate

{String} This is printed at the top of the timetable.

```
    "effectiveDate": "July 8, 2015"
```

### interpolatedStopSymbol

{String} The symbol used to indicate that a timepoint isn't fixed, but just interpolated. Defaults to `•`. To avoid having this symbol used in timetables, set it to `null`.

```
    "interpolatedStopSymbol": "•"
```

### interpolatedStopText

{String} The text used to describe that a timepoint isn't fixed, but just interpolated. Defaults to `Estimated time of arrival`.

```
    "interpolatedStopText": "Estimated time of arrival"
```

### linkStopUrls

{Boolean} Whether or not to hyperlink timetable stop names to the `stop_url` defined in `stops.txt`. If no `stop_url` is defined for a stop, no link will be created. Defaults to `false`.

```
    "linkStopUrls": false
```

### logFunction

{Function} If you want to route logs to a custom function, you can pass a function that takes a single `text` argument as `logFunction`. This can't be used when running GTFS-to-HTML as a command-line utility, only when included as part of a node.js app and passed in a config object to `gtfsToHtml()`. For example:

```javascript
import gtfsToHtml from 'gtfs-to-html';

const config = {
  agencies: [
    {
      agency_key: 'county-connection',
      url: 'http://countyconnection.com/GTFS/google_transit.zip',
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

### mapboxAccessToken

{String} The [Mapbox access token](https://www.mapbox.com/help/define-access-token/) for generating a map of the route.

```
    "mapboxAccessToken": "pk.eyXaX5F8oCJSYedim3yCnTGsVBfnRjsoXdy4Ej7ZZZydrCn2WMDXha5bPj5.bPj5xsBo8u8N8GJqJh"
```

### menuType

{String} The type of menu to use for selecting or navigating to timetables on timetable pages with multiple timetables. Valid choices are `none`, `simple`, `jump` and `radio`. Defaults to `simple`.

```
    "menuType": "jump"
```

### noDropoffSymbol

{String} The symbol used to indicate that no drop off is available at a stop. Defaults to `‡`. To avoid having this symbol used in timetables, set it to `null`.

```
    "noDropoffSymbol": "‡"
```

### noDropoffText

{String} The text used to describe that no drop off is available at a stop. Defaults to `No drop off available`.

```
    "noDropoffText": "No drop off available"
```

### noHead

{Boolean} Whether or not to skip the HTML head and footer when generating the HTML. This is useful for creating embeddable HTML without `<html>`, `<head>` or `<body>` tags. Defaults to `false`. Ignored if `outputFormat` is set to `pdf` or `csv`.

```
    "noHead": false
```

### noPickupSymbol

{String} The symbol used to indicate that no pickup is available at a stop. Defaults to `**`. To avoid having this symbol used in timetables, set it to `null`.

```
    "noPickupSymbol": "**"
```

### noPickupText

{String} The text used to describe that no pickup is available at a stop. Defaults to `No pickup available`.

```
    "noPickupText": "No pickup available"
```

### noServiceSymbol

{String} The symbol used when a specific trip does not serve a specified stop. Defaults to `-`. To avoid having this symbol used in timetables, set it to `null`.

```
    "noServiceSymbol": "-"
```

### noServiceText

{String} The text used to describe when a specific trip does not serve a specified stop. Defaults to `No service at this stop`.

```
    "noServiceText": "No service at this stop"
```

### outputFormat

{String} The file format of the timetables generated. Either `html`, `pdf` or `csv`. Defaults to `html`.

```
    "outputFormat": "html"
```

### requestDropoffSymbol

{String} The symbol used to indicate that riders must request to be dropped off at a stop. Defaults to `†`. To avoid having this symbol used in timetables, set it to `null`.

```
    "requestDropoffSymbol": "†"
```

### requestDropoffText

{String} The text used to describe that riders must request to be dropped off at a stop. Defaults to `Must request drop off`.

```
    "requestDropoffText": "Must request drop off"
```

### requestPickupSymbol

{String} The symbol used to indicate that riders must request pickup at a stop. Defaults to `***`. To avoid having this symbol used in timetables, set it to `null`.

```
    "requestPickupSymbol": "***"
```

### requestPickupText

{String} The text used to describe that riders must request pickup at a stop. Defaults to `Request stop - call for pickup`.

```
    "requestPickupText": "Request stop - call for pickup"
```

### serviceNotProvidedOnText

{String} The text used to label days where service is not provided. Defaults to `Service not provided on`.

```
    "serviceNotProvidedOnText": "Service not provided on"
```

### serviceProvidedOnText

{String} The text used to label days where service is provided. Defaults to `Service provided on`.

```
    "serviceProvidedOnText": "Service provided on"
```

### showArrivalOnDifference

{Float} Whether or not to show an arrival column/row in the timetable. It means, that if on at least one stop difference (stay on that stop) is **equal or greater** than specified here, the arrival time will be shown. Use `0` to show on each stop or `null` to skip showing an additional column for arrival.

```
    "showArrivalOnDifference": 0.2
```

### showMap

{Boolean} Whether or not to show a map of the route on the timetable. Defaults to `false`.

If you'd rather just get all stops and route info as geoJSON, see [gtfs-to-geojson](https://github.com/blinktaginc/gtfs-to-geojson).

```
    "showMap": false
```

### showOnlyTimepoint

{Boolean} Whether or not all stops should be shown, or only stops with a `timepoint` value in [stop_times.txt](https://developers.google.com/transit/gtfs/reference?hl=en#stop_times_fields) that is considered exact (i.e. empty or `1`). Defaults to `false`, all stops shown.

```
    "showOnlyTimepoint": false
```

### showRouteTitle

{Boolean} Whether or not to show the route title and effective date at the top of the timetable page and the timetable label and notes before each timetable. Defaults to `true`, showing the route title and timetable labels and notes.

```
    "showRouteTitle": true
```

### showStopCity

{Boolean} Whether or not to show the city for each stop. City is determined by the `stop_city` field in the non-standard `stop_attributes.txt`. Only has an effect when the timetable's `orientation` is `horizontal` or `hourly`. Defaults to `false`.

```
    "showStopCity": false
```

### showStopDescription

{Boolean} Whether or not to show a stop description for each stop. Stop description is taken from the `stop_desc` field in`stops.txt`. Defaults to `false`.

```
    "showStopDescription": false
```

### showStoptimesForRequestStops

{Boolean} Whether or not to show times for stops that require a request for pickup or dropoff. Some agencies prefer to hide the actual stoptimes from stops that require a quest and instead just show the request pickup or dropoff symbols. See [`requestDropoffSymbol`](#requestdropoffsymbol) and [`requestPickupSymbol`](#requestpickupsymbol) for how to customize appearance. Defaults to `true`.

```
    "showStoptimesForRequestStops": true
```

### skipImport

{Boolean} Whether or not to skip importing from GTFS into SQLite. Useful for re-running the script if the GTFS data has not changed. If you use this option and the GTFS file hasn't been imported or you don't have an `sqlitePath` to a non-in-memory database specified, you'll get an error. Defaults to `false`.

```
    "skipImport": false
```

### sortingAlgorithm

{String} Defines trip-sorting algorithm used to determine the order that trips are shown in timetables.

- `common` finds a common stop used by all trips and sorts by stoptimes at that stop. If there is no common stop for all trips, then `beginning` algorithm is used.
- `beginning` uses the first stoptime of each trip, which can be from different stops if not all trips have the same first stop. If a multiple trips have identical first stoptimes, the trip with the earlier last stoptimes comes first.
- `end` uses the last stoptime of each trip, which can be from different stops if not all trips have the same last stop. If a multiple trips have identical last stoptimes, the trip with the earlier first stoptimes comes first.
- `first` uses the first stop of the longest trip and sorts by stoptimes at that stop.
- `last` uses the last stop of the longest trip and sorts by stoptimes at that stop.

The default trip-sorting algorithm is `common`.

```
    "sortingAlgorithm": "common"
```

### sqlitePath

{String} A path to an SQLite database. Optional, defaults to using an in-memory database with a value of `:memory:`. If you want the data imported to persist, you need to specify a value for `sqlitePath`. Supports tilde as part of the path, like `~/Documents/gtfs`.

```
    "sqlitePath": "/tmp/gtfs"
```

### templatePath

{String} Path to a folder containing (pug)[https://pugjs.org/] template for rendering timetables. This is optional. Defaults to using the templates provided in `views/default`. All files within the `/views/custom` folder will be .gitignored, so you can copy the `views/default` folder to `views/custom/myagency` and make any modifications needed. Any custom views folder should contain pug templates called `timetablepage.pug`, `timetablepage_full.pug`, `overview.pug`, and `overview_full.pug`.

```
    "templatePath": "views/custom/my-agency/"
```

### timeFormat

{String} A string defining time format using moment.js tokens. [See full list of formatting options](https://momentjs.com/docs/#/displaying/format/). Defaults to `h:mma` which yields "8:36pm".

```
    "timeFormat": "h:mma"
```

### useParentStation

{Boolean} Whether or not to use the `parent_station` of a stop, if specified instead of the platform or boarding area. Useful if different trips for the same route have different platforms that you want to show up in the timetable as separate stops. Defaults to `true`.

```
    "useParentStation": true
```

### verbose

{Boolean} If you don't want the import script to print any output to the console, you can set `verbose` to `false`. Defaults to `true`.

```
    "verbose": false
```

### zipOutput

{Boolean} Whether or not to zip the output into one zip file named `timetables.zip`. Defaults to `false`.

```
    "zipOutput": false
```
