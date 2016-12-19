# GTFS to HTML

[![NPM version](https://img.shields.io/npm/v/gtfs-to-html.svg?style=flat)](https://www.npmjs.com/package/gtfs-to-html)
[![David](https://img.shields.io/david/brendannee/gtfs-to-html.svg)]()
[![npm](https://img.shields.io/npm/dm/gtfs-to-html.svg?style=flat)]()

`gtfs-to-html` converts transit data in [GTFS format](https://developers.google.com/transit/gtfs/) into user-friendly HTML schedules. Many transit agencies have schedule data in GTFS format but need to show each route's schedule to users on a website. This project aims to automate the process of creating these schedules. Automating HTML schedule generation makes it easy to keep schedules up to date when data changes and reduces the likelihood of errors.

`gtfs-to-html` uses the [`node-gtfs`](https://github.com/brendannee/node-gtfs) library to handle importing and querying GTFS data.

`gtfs-to-html` is currently used by [Sonoma Country Transit](http://sctransit.com/) to generate schedule pages for each route.

<img width="1265" src="https://cloud.githubusercontent.com/assets/96217/10262598/87674f70-6983-11e5-8150-15b6372c989c.png">

## Installation

Install `gtfs-to-html` directly from [npm](https://npmjs.org):

    npm install mongoose gtfs-to-html -g

## Command-line example

    gtfs-to-html --configPath /path/to/your/custom-config.json

## Code example

    const gtfsToHTML = require('gtfs-to-html');
    const config = require('config.json');

    gtfsToHTML(config, (err) => {
      if (err) return console.error(err);

      console.log('HTML Generation Successful')
    });

## Configuration

Copy `config-sample.json` to `config.json` and then add your projects configuration to `config.json`.

    cp config-sample.json config.json

| option | type | description |
| ------ | ---- | ----------- |
| [`agencies`](#agencies) | array | An array of GTFS files to be imported. |
| [`effectiveDate`](#effectivedate) | string | A date to print at the top of the timetable |
| [`mongoUrl`](#mongoUrl) | string | The URL of the MongoDB database to import to. |
| [`noHead`](#noHead) | boolean | Whether or not to skip the header and footer of the HTML document. |
| [`noServiceSymbol`](#noservicesymbol) | string | The symbol to be used when a specific trip does not serve a specified stop. |
| [`requestStopSymbol`](#requeststopsymbol) | string | The symbol to be used to indicate that riders must request a stop. |
| [`showMap`](#showmap) | boolean | Whether or not to show a map of the route on the timetable. |
| [`showOnlyTimepoint`](#showonlytimepoint) | boolean | Whether or not all stops should be shown, or only stops with a `timepoint` value in `stops.txt`. |
| [`showStopCity`](#showstopcity) | boolean | Whether or not to show each stop's city. |
| [`verbose`](#verbose) | boolean | Whether or not to print output to the console. |
| [`zipOutput`](#zipoutput) | boolean | Whether or not to zip the output into one zip file. |

### agencies

{Array} Specify the GTFS files to be imported in an `agencies` array. GTFS files can be imported via a `url` or a local `path`.

Each file needs an `agency_key`, a short name you create that is specific to that GTFS file. For GTFS files that contain more than one agency, you only need to list each GTFS file once in the `agencies` array, not once per agency that it contains.

To find an agency's GTFS file, visit [transitfeeds.com](http://transitfeeds.com). You can use the
URL from the agency's website or you can use a URL generated from the transitfeeds.com
API along with your API token.

* Specify a download URL:
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

* Specify a path to a zipped GTFS file:
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
* Specify a path to an unzipped GTFS file:
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

* Exclude files - if you don't want all GTFS files to be imported, you can specify an array of files to exclude.

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

* Optionally specify a proj4 projection string to correct poorly formed coordinates in the GTFS file

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

### effectiveDate

{String} This is printed at the top of the timetable.

```
    "effectiveDate": "July 8, 2015"
```

### mongoUrl

{String} The MongoDB URI use. When running locally, you may want to use `mongodb://localhost:27017/gtfs`.

```
{
  "mongoUrl": "mongodb://localhost:27017/gtfs",
  "agencies": [
    {
      "agency_key": "myAgency",
      "path": "/path/to/the/unzipped/gtfs/"
    }
  ]
}
```

### noHead

{Boolean} Whether or not to skip the HTML head and footer when generating the HTML. Defaults to `false`.

```
    "noHead": false
```

### noServiceSymbol

{String} The symbol to be used when a specific trip does not serve a specified stop. Defaults to `-`.

```
    "noServiceSymbol": "-"
```

### requestStopSymbol

{String} The symbol to be used to indicate that riders must request a stop. Defaults to `***`.

```
    "requestStopSymbol": "***"
```

### showMap

{Boolean} Whether or not to show a map of the route on the timetable. Defaults to `false`.

```
    "showMap": false
```

### showOnlyTimepoint

{Boolean} Whether or not all stops should be shown, or only stops with a `timepoint` value in [stop_times.txt](https://developers.google.com/transit/gtfs/reference?hl=en#stop_times_fields) that is considered exact (i.e. empty or `1`). Defaults to `false`, all stops shown.

```
    "showOnlyTimepoint": false
```

### showStopCity

{Boolean} Whether or not to show the city for each stop. City is determined by the `stop_city` field in the non-standard `stop_attributes.txt`. Only has an effect when the timetable's `orientation` is `horizontal`. Defaults to `false`.

```
    "showStopCity": false
```

### verbose

{Boolean} If you don't want the import script to print any output to the console, you can set `verbose` to `false`. Defaults to `true`.

```
    "verbose": false
```

### zipOutput

{Boolean} Whether or not to zip the output into one zip file. Defaults to `false`.

```
    "zipOutput": false
```

## Build `timetables.txt`

This project requires that an additional file `timetables.txt` be added to an agencies GTFS. This file specifies which HTML timetables should be built.

An example of this file is located in [examples/timetables.txt](examples/timetables.txt). The format of this file is:

| column name | description |
| ----------- | ----------- |
| `timetable_id` | A unique ID for the timetable |
| `route_id` | The ID of the route the timetable is for from `routes.txt`. |
| `direction_id` | The `direction_id` from `trips.txt` for the timetable. This can be blank. |
| `start_date` | The start date for this timetable in `YYYY-MM-DD` format. |
| `end_date` | The end date for this timetable in `YYYY-MM-DD` format. |
| `monday` | A binary value that indicates whether this timetable should include service on Mondays.  Valid options are `0` and `1`. |
| `tuesday` | A binary value that indicates whether this timetable should include service on Tuesdays.  Valid options are `0` and `1`. |
| `wednesday` | A binary value that indicates whether this timetable should include service on Wednesdays.  Valid options are `0` and `1`. |
| `thursday` | A binary value that indicates whether this timetable should include service on Thursdays.  Valid options are `0` and `1`. |
| `friday` | A binary value that indicates whether this timetable should include service on Fridays.  Valid options are `0` and `1`. |
| `saturday` | A binary value that indicates whether this timetable should include service on Saturdays.  Valid options are `0` and `1`. |
| `sunday` | A binary value that indicates whether this timetable should include service on Sundays.  Valid options are `0` and `1`. |
| `route_label` | A short text label describing the route, for instance "4". |
| `service_notes` | Text shown on the timetable about the service represented, for instance "Mon-Fri". |
| `orientation` | Determines if the top row should be a list of trips or stops. Valid options are `vertical` and `horizontal`. `vertical` shows stops across the top row with each row being a list of stop times for each trip. `horizontal` shows trips across the top row with each row being stop times for a specific stop.  `horizontal` orientation is best for routes with lots of stops and fewer trips while `vertical` orientation is best for routes with lots of trips and a smaller number of stops. |

### Multi-route Timetables

To allow creating a single timetable for multiple routes that overlap, you can have multiple entries in `timetables.txt` for the same `timetable_id`. These multi-route entries should have the same values `timetable_id`, `start_date`, `end_date`, calendar date, `service_notes` and `orientation` fields and should have different values for the `route_id` and `route_label` fields.

### Build `timetable_stop_order.txt`

This is an optional file that can specify stop order for a particular timetable. It is useful when generating combined timetables for multiple overlapping routes, or exerting fine-grained control on stop order.

An example of this file is located in [examples/timetable_stop_order.txt](examples/timetable_stop_order.txt). The format of this file is:

| column name | description |
| ----------- | ----------- |
| `timetable_id` | The ID of the timetable from `timetables.txt` |
| `stop_id` | The ID of the stop from `stops.txt`. |
| `stop_sequence` | An assigned integer identifying the order of stops to be presented in the timetable. The values for `stop_sequence` must be non-negative integers, and they must increase along the trip. This value does not need to match the `stop_sequence` found in `stop_times.txt`. |

## Running

Ensure than mongodb is running locally.

    mongod

To generate HTML timetables, run `gtfs-to-html`.

    gtfs-to-html

By default, `gtfs-to-html` will look for a `config.json` file in the project root. To specify a different path for the configuration file:

    gtfs-to-html --configPath /path/to/your/custom-config.json

This will download the GTFS file specified in `config.js` .  Then, `gtfs-to-html` will build the HTML timetables and save them in `html/:agency_key`.

### Options

`configPath`

    gtfs-to-html --configPath /path/to/your/custom-config.json

`noHead`

    gtfs-to-html --noHead

This will generate embeddable HTML without an `<html>`, `<head>` or `<body>` tag.

## Processing very large GTFS files.

By default, node has a memory limit of 512 MB or 1 GB. If you have a very large GTFS file and want to use the option `showOnlyTimepoint` = `false` you may need to allocate more memory. Use the `max-old-space-size` option. For example to allocate 2 GB:

    node --max-old-space-size=2000 /usr/local/bin/gtfs-to-html

## Quick preview of generated HTML

After an initial run of `gtfs-to-html`, the GTFS data will be downloaded and loaded into mongo.

You can view an individual route HTML on demand by running the included express app:

    node app.js

By default, `gtfs-to-html` will look for a `config.json` file in the project root. To specify a different path for the configuration file:

    node app.js --configPath /path/to/your/custom-config.json

Once running, you can view the HTML in your browser at [localhost:3000](http://localhost:3000)

## Contributing

Pull requests are welcome, as is feedback and [reporting issues](https://github.com/brendannee/gtfs-to-html/issues).

With this running, you can open [http://localhost:3000](http://localhost:3000) in your browser and view all timetables.  Note that this only works after GTFS has been imported to mongodb and mongodb is running locally.

### Linting

    npm run lint
