# GTFS to HTML

Generate HTML transit timetables in from [GTFS](https://developers.google.com/transit/gtfs/).

<img width="1265" src="https://cloud.githubusercontent.com/assets/96217/10262598/87674f70-6983-11e5-8150-15b6372c989c.png">

## Setup

### Install dependencies

    npm install

### Configure

Copy `config-sample.js` to `config.js`.

    cp config-sample.js config.js

Before you can use gtfs-to-html you must specify the transit agencies you'd like to use.

You can specify agencies using their [GTFS Data Exchange](http://www.gtfs-data-exchange.com/) `dataexchange_id`, a `url` to the GTFS file or a local `path`.

* Put agency_key names from [gtfs-data-exchange.com](http://gtfs-data-exchange.com). See the [full list of agencies availale on GTFS data exchange](http://www.gtfs-data-exchange.com/api/agencies).:
```
    'bay-area-rapid-transit'
```

* Specify a download URL:
```
{
    agency_key: 'caltrain',
    url: 'http://www.gtfs-data-exchange.com/agency/caltrain/latest.zip'
}
```

* Specify a path to a zipped GTFS file:
```
{
    agency_key: 'localAgency',
    path: '/path/to/the/gtfs.zip'
}
```
* Specify a path to an unzipped GTFS file:
```
{
    agency_key: 'localAgency',
    path: '/path/to/the/unzipped/gtfs/'
}
```

The mongodb URI should also be configured in `config.js`. The default database URI is:
`mongodb://localhost:27017/gtfs`

#### Formatting Options

The following items can be added to the configuration object:

##### `effectiveDate`

{String} This is printed at the top of the timetable.

```
    effectiveDate: 'July 8, 2015'
```

##### `noServiceSymbol`

{String} The symbol to be used when a specific trip does not serve a specified stop.

```
    noServiceSymbol: '—'
```

##### `requestStopSymbol`

{String} The symbol to be used to indicate that riders must request a stop.

```
    requestStopSymbol: '***'
```

##### `showMap`

{Boolean} Whether or not to show a map of the route on the timetable.

```
    showMap: false
```

## Running

Ensure than mongodb is running locally.

    mongod

To generate HTML timetables, run the 'gtfs-to-html' script.

    npm run gtfs-to-html

This will download the GTFS file specified in `config.js` .  Then, it will build the HTML timetables and save them in `html/:agency_key`.

### Options

Note the use of two sets of `--` when running commands with arguments from npm.

`nohead`

    npm run gtfs-to-html -- --nohead

This will generate embeddable HTML without an `<html>`, `<head>` or `<body>` tag.


## Testing

After an initial run of the `gtfs-to-html` script, the GTFS data will be downloaded and loaded into mongo.

You can view an individual route HTML on demand by running the included express app:

    DEBUG=gtfs-to-html npm start

With this running, you can open [http://localhost:3000](http://localhost:3000) in your browser and view all timetables.  Note that this only works after GTFS has been imported to mongodb and mongodb is running locally.
