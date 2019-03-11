# GTFS to HTML

[![NPM version](https://img.shields.io/npm/v/gtfs-to-html.svg?style=flat)](https://www.npmjs.com/package/gtfs-to-html)
[![David](https://img.shields.io/david/blinktaginc/gtfs-to-html.svg)]()
[![npm](https://img.shields.io/npm/dm/gtfs-to-html.svg?style=flat)]()
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

[![NPM](https://nodei.co/npm/gtfs-to-html.png?downloads=true)](https://nodei.co/npm/gtfs-to-html/)

`gtfs-to-html` creates human-readable, user-friendly transit timetables in HTML format directly from [GTFS transit data](https://developers.google.com/transit/gtfs/). Most transit agencies have schedule data in GTFS format but need to show each route's schedule to users on a website. This project automates the process of creating nicely formatted HTML timetables for inclusion on a transit agency website. This makes it easy to keep timetables up to date and accurate when schedule changes happen and reduces the likelihood of errors.


### Configurable and customizable
`gtfs-to-html` has many options that configure how timetables are presented. It also allows using a completely custom template which makes it easy to build chunks of HTML that will fit perfectly into any website using any HTML structure and classes that you'd like.

### Accessibility for all
`gtfs-to-html` properly formats timetables to ensure they are screen-reader accessible and WCAG 2.0 compliant.

### Mobile responsiveness built in
Built-in styling makes `gtfs-to-html` timetables ready to size and scroll easily on mobile phones and tablets.

### Schedule changes? A cinch.
By generating future timetables and including dates in table metadata, your timetables can appear in advance of a schedule change, and you can validate that your new timetables and GTFS are correct.

## Auto-generated maps
`gtfs-to-html` can also generate a map for each route that can be included with the schedule page. The map shows all stops for the route and lists all routes that serve each stop. See the `showMap` configuration option below. If you'd rather just get all stops and route info as geoJSON, check out the  [gtfs-to-geojson](https://github.com/blinktaginc/gtfs-to-geojson) package.

`gtfs-to-html` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data.

## Current Usage
Many transit agencies use `gtfs-to-html` to generate the schedule pages used on their websites, including:

* [Advance Transit](https://advancetransit.com/)
* [Capital Transit (Juneau)](https://juneaucapitaltransit.org/)
* [County Connection (Contra Costa County, California)](https://countyconnection.com)
* [El Dorado County](http://eldoradotransit.com/)
* [Humboldt Transit Authority](http://hta.org/)
* [Kings Area Rural Transit (KART)](http://mykartbus.com/)
* [Madera County Connection](http://mcctransit.com/)
* [Marin Transit](https://marintransit.org/)
* [Mountain Transit](http://mountaintransit.org/)
* [NW Connector (Oregon)](http://www.nworegontransit.org/)
* [Palo Verde Valley Transit Agency](http://pvvta.com/)
* [Petaluma Transit](http://transit.cityofpetaluma.net/)
* [Sonoma Country Transit](http://sctransit.com/)

Are you using `gtfs-to-html`? Let us know via opening a github issue or pull request if your agency is using this library.

`gtfs-to-html` is used as an integral part of [`transit-custom-posts`](https://trilliumtransit.github.io/transit-custom-posts/) - a GTFS-optimized Wordpress plugin for transit websites.

<img width="1265" src="https://user-images.githubusercontent.com/96217/28296063-aed45568-6b1a-11e7-9794-94b3d915d668.png">

<img width="1265" src="https://user-images.githubusercontent.com/96217/29205138-dd3ee5c6-7e2f-11e7-9d86-f17cebd5f118.png">

## Installation

If you would like to use this library as a command-line utility, you can install it globally directly from [npm](https://npmjs.org):

    npm install gtfs-to-html -g

If you are using this as a node module as part of an application, you can include it in your project's `package.json` file.

## Command-line example

    gtfs-to-html --configPath /path/to/your/custom-config.json

## Code example

    const gtfsToHTML = require('gtfs-to-html');
    const mongoose = require('mongoose');
    const config = require('config.json');

    mongoose.Promise = global.Promise;
    mongoose.connect(config.mongoUrl, {useNewUrlParser: true});

    gtfsToHTML(config)
    .then(() => {
      console.log('HTML Generation Successful');
    })
    .catch(err => {
      console.error(err);
    });

## Configuration

Copy `config-sample.json` to `config.json` and then add your projects configuration to `config.json`.

    cp config-sample.json config.json

All files starting with `config*.json` are .gitignored - so you can create multiple configuration files such as `config-caltrain.json`.

| option | type | description |
| ------ | ---- | ----------- |
| [`agencies`](#agencies) | array | An array of GTFS files to be imported. |
| [`beautify`](#beautify) | boolean | Whether or not to beautify the HTML output. |
| [`coordinatePrecision`](#coordinateprecision) | integer | Number of decimal places to include in geoJSON map output. |
| [`effectiveDate`](#effectivedate) | string | A date to print at the top of the timetable |
| [`linkStopUrls`](#linkStopUrls) | boolean | Whether or not to hyperlink timetable stop names to the `stop_url` defined in `stops.txt`. |
| [`mapboxAccessToken`](#mapboxaccesstoken) | string | The Mapbox access token for generating a map of the route. |
| [`menuType`](#menuType) | string | The type of menu to use for selecting timetables on a timetable page. |
| [`mongoUrl`](#mongoUrl) | string | The URL of the MongoDB database to import to. |
| [`noHead`](#noHead) | boolean | Whether or not to skip the header and footer of the HTML document. |
| [`noServiceSymbol`](#noservicesymbol) | string | The symbol used when a specific trip does not serve a specified stop. |
| [`requestDropoffSymbol`](#requestdropoffsymbol) | string | The symbol used to indicate that riders must request a drop off at a stop. |
| [`noDropoffSymbol`](#nodropoffsymbol) | string | The symbol used to indicate that no drop off is available at a stop. |
| [`requestPickupSymbol`](#requestpickupsymbol) | string | The symbol used to indicate that riders must request a pickup at a stop. |
| [`noPickupSymbol`](#nopickupsymbol) | string | The symbol used to indicate that no pickup is available at a stop. |
| [`interpolatedStopSymbol`](#interpolatedStopSymbol) | string | The symbol used to indicate that a timepoint isn't fixed, but just interpolated. |
| [`showMap`](#showmap) | boolean | Whether or not to show a map of the route on the timetable. |
| [`showOnlyTimepoint`](#showonlytimepoint) | boolean | Whether or not all stops should be shown, or only stops with a `timepoint` value in `stops.txt`. |
| [`showRouteTitle`](#showroutetitle) | boolean | Whether or not to show the route title at the top of the timetable page. |
| [`showStopCity`](#showstopcity) | boolean | Whether or not to show each stop's city. |
| [`showStopDescription`](#showstopdescription) | boolean | Whether or not to show a stop description. |
| [`templatePath`](#templatepath) | string | Path to custom pug template for rendering timetable. |
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

### effectiveDate

{String} This is printed at the top of the timetable.

```
    "effectiveDate": "July 8, 2015"
```

### linkStopUrls

{Boolean} Whether or not to hyperlink timetable stop names to the `stop_url` defined in `stops.txt`. If no `stop_url` is defined for a stop, no link will be created. Defaults to `false`.

```
    "linkStopUrls": false
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

{Boolean} Whether or not to skip the HTML head and footer when generating the HTML. This is useful for creating embeddable HTML without `<html>`, `<head>` or `<body>` tags. Defaults to `false`.

```
    "noHead": false
```

### noServiceSymbol

{String} The symbol used when a specific trip does not serve a specified stop. Defaults to `-`. To avoid having this symbol used in timetables, set it to `null`.

```
    "noServiceSymbol": "-"
```

### requestDropoffSymbol

{String} The symbol used to indicate that riders must request to be dropped off at a stop. Defaults to `†`. To avoid having this symbol used in timetables, set it to `null`.

```
    "requestDropoffSymbol": "†"
```

### noDropoffSymbol

{String} The symbol used to indicate that no drop off is available at a stop. Defaults to `‡`. To avoid having this symbol used in timetables, set it to `null`.

```
    "noDropoffSymbol": "‡"
```

### requestPickupSymbol

{String} The symbol used to indicate that riders must request pickup at a stop. Defaults to `***`. To avoid having this symbol used in timetables, set it to `null`.

```
    "requestPickupSymbol": "***"
```

### noPickupSymbol

{String} The symbol used to indicate that no pickup is available at a stop. Defaults to `**`. To avoid having this symbol used in timetables, set it to `null`.

```
    "requestPickupSymbol": "**"
```

### interpolatedStopSymbol

{String} The symbol used to indicate that a timepoint isn't fixed, but just interpolated. Defaults to `•`. To avoid having this symbol used in timetables, set it to `null`.

```
    "interpolatedStopSymbol": "•"
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

{Boolean} Whether or not to show the route title at the top of the timetable page. Defaults to `true`, showing the route title.

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

### templatePath

{String} Path to a folder containing (pug)[https://pugjs.org/] template for rendering timetables. This is optional. Defaults to using the templates provided in `views/timetable`. All files within the `/views/custom` folder will be .gitignored, so you can copy the `views/timetable` folder to `views/custom/myagency` and make any modifications needed. Any custom views folder should conatain pug templates called `timetablepage.pug`, `timetablepage_full.pug`,  `overview.pug`, and `overview_full.pug`.

```
    "templatePath": 'views/custom/my-agency/'
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

## Build `timetables.txt`

This project supports an additional non-standard file `timetables.txt` which can be included in an agency's GTFS. This file specifies to GTFS-to-HTML which HTML timetables should be built.

An example of this file is located in [examples/timetables.txt](examples/timetables.txt). The format of this file is:

| column name | description |
| ----------- | ----------- |
| `timetable_id` | A unique ID for the timetable |
| `route_id` | The ID of the route the timetable is for from `routes.txt`. |
| `direction_id` | The `direction_id` from `trips.txt` for the timetable. This can be blank. |
| `start_date` | The start date for this timetable in `YYYY-MM-DD` format. |
| `end_date` | The end date for this timetable in `YYYY-MM-DD` format. |
| `monday` | A binary value that indicates whether this timetable should include service on Mondays. Valid options are `0` and `1`. |
| `tuesday` | A binary value that indicates whether this timetable should include service on Tuesdays. Valid options are `0` and `1`. |
| `wednesday` | A binary value that indicates whether this timetable should include service on Wednesdays. Valid options are `0` and `1`. |
| `thursday` | A binary value that indicates whether this timetable should include service on Thursdays. Valid options are `0` and `1`. |
| `friday` | A binary value that indicates whether this timetable should include service on Fridays. Valid options are `0` and `1`. |
| `saturday` | A binary value that indicates whether this timetable should include service on Saturdays. Valid options are `0` and `1`. |
| `sunday` | A binary value that indicates whether this timetable should include service on Sundays. Valid options are `0` and `1`. |
| `include_exceptions` | A binary value that indicates whether or not to include exceptions of type `1` from `calendar_dates.txt`, such as holiday service on a weekday. Valid options are `0` and `1`. Optional, defaults to `0` (exceptions are not included by default). |
| `timetable_label` | A short text label describing the timetable, for instance "Route 4 Northbound Mon-Fri". Optional, defaults to route name and first and last stops. |
| `service_notes` | Text shown on the timetable about the service represented. Optional. |
| `orientation` | Determines if the top row should be a list of trips or stops. Valid options are `vertical`, `horizontal` or `hourly`. `vertical` shows stops across the top row with each row being a list of stop times for each trip. `horizontal` shows trips across the top row with each row being stop times for a specific stop. `hourly` is for routes that run the same time each hour and will print a simplified schedule showing minutes after the hour for each stop. `horizontal` orientation is best for routes with lots of stops and fewer trips while `vertical` orientation is best for routes with lots of trips and a smaller number of stops. Default is `vertical` |
| `timetable_page_id` | The timetable page to include this timetable on |
| `timetable_sequence` | The order that this timetable should appear on the timetable page |
| `direction_name` | The human readable name of the direction of the timetable, such as "Southbound" |
| `show_continues_as` | A binary value that indicates whether this timetable should show an additional column or row indicating which trips continue on as a different route. This is calculated by trips that share the same `block_id` in `trips.txt`. Valid options are `0` and `1`.  Optional, defaults to `0`. |


### Multi-route Timetables

To allow creating a single timetable for multiple routes that overlap, you can have multiple entries in `timetables.txt` for the same `timetable_id`. These multi-route entries should have the same values `timetable_id`, `start_date`, `end_date`, calendar date, `service_notes` and `orientation` fields and should have different values for the `route_id` and `timetable_label` fields.

### Build `timetable_stop_order.txt`

This is an optional file that can specify stop order for a particular timetable. It is useful when generating combined timetables for multiple overlapping routes, or exerting fine-grained control on stop order.

An example of this file is located in [examples/timetable_stop_order.txt](examples/timetable_stop_order.txt). The format of this file is:

| column name | description |
| ----------- | ----------- |
| `timetable_id` | The ID of the timetable from `timetables.txt` |
| `stop_id` | The ID of the stop from `stops.txt`. |
| `stop_sequence` | An assigned integer identifying the order of stops to be presented in the timetable. The values for `stop_sequence` must be non-negative integers, and they must increase along the trip. This value does not need to match the `stop_sequence` found in `stop_times.txt`. |

#### Stops with different arrival and departure times

Stoptimes with different arrival and departure times will be shown twice in a row and labeled as "(arrival)" and "(departure)".

## Build `timetable_pages.txt`

This project supports an additional non-standard file `timetable_pages.txt` which can be included in an agency's GTFS. This file specifies which HTML timetable to group together into a single HTML page.

An example of this file is located in [examples/timetable_pages.txt](examples/timetable_pages.txt). The format of this file is:

| column name | description |
| ----------- | ----------- |
| `timetable_page_id` | A unique ID for the timetable page |
| `timetable_page_label` | A label that will show up on the top of the page. Optional, defaults to using route name. |
| `filename` | The filename to use for the generated HTML file. Optional, defaults to `timetable_page_id` with file extension `.html`, for example `1.html`. |

## Build `stop_attributes.txt`

This is an optional file which can be included in an agency's GTFS to include additional information about specific stops. This can be used when styling timetables to add additional useful information not included in GTFS, such as the city that the stop is in

An example of this file is located in [examples/stop_attributes.txt](examples/stop_attributes.txt). This feature is in development and additional fields may be added or changes to the way this works could happen in the future.

The format of this file is:

| column name | description |
| ----------- | ----------- |
| `stop_id` | A `stop_id` from `stops.txt` |
| `stop_city` | The name of the city or region that the stop is in. |

## Running

Ensure than MongoDB is running locally.

    mongod

To generate HTML timetables, run `gtfs-to-html`.

    gtfs-to-html

By default, `gtfs-to-html` will look for a `config.json` file in the project root. To specify a different path for the configuration file:

    gtfs-to-html --configPath /path/to/your/custom-config.json

This will download the GTFS file specified in `config.js` .  Then, `gtfs-to-html` will build the HTML timetables and save them in `html/:agency_key`.

### Options

`configPath`

Allows specifying a configuration json file. Defaults to config.json in the current directory.

    gtfs-to-html --configPath /path/to/your/custom-config.json

`skipImport`

Skips importing GTFS into MongoDB. Useful if you are rerunning with an unchanged GTFS file. If you use this option and the GTFS file hasn't been imported, you'll get an error.

    gtfs-to-html --skipImport

## Processing very large GTFS files.

By default, node has a memory limit of 512 MB or 1 GB. If you have a very large GTFS file and want to use the option `showOnlyTimepoint` = `false` you may need to allocate more memory. Use the `max-old-space-size` option. For example to allocate 2 GB:

    node --max-old-space-size=2000 /usr/local/bin/gtfs-to-html

## Example Application / Previewing generated HTML

An example Express application that uses `gtfs-to-html` is included in the `app` folder.

After an initial run of `gtfs-to-html`, the GTFS data will be downloaded and loaded into MongoDB.

You can view an individual route HTML on demand by running the included Express app:

    node app

By default, `gtfs-to-html` will look for a `config.json` file in the project root. To specify a different path for the configuration file:

    node app --configPath /path/to/your/custom-config.json

Once running, you can view the HTML in your browser at [localhost:3000](http://localhost:3000)

## Reviewing changes in HTML timetables

When an agency releases an updated GTFS file, it can be useful to review what has changed when generating HTML timetables. Use `diff2html` to easily compare two folders of html timetables.

First generate two folders of `gtfs-to-html` output to compare. To make it easy to see what has changed, set the `beautify` option to `true` in the config file for both sets of output.

Then, install diff2html:

    npm install -g diff2html-cli

Use the `diff` command and pipe the output to `diff2html` to get a nicely formatted list of the differences between two folders of html files.

    diff -bur html/folder1 html/folder2 |  diff2html -i stdin

## Contributing

Pull requests are welcome, as is feedback and [reporting issues](https://github.com/blinktaginc/gtfs-to-html/issues).

### Tests

    npm test
