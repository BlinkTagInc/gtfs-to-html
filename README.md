# GTFS to HTML

This package generates transit timetables in HTML format from GTFS.

## Setup

### Install dependencies

    npm install

### Configure

Add an agency to the `agenices` array in `config.js`.  This can be an object containing an `agency_key` and `url` pointing to a GTFS file or just the `dataexchange_id` from [gtfs-data-exchange.com](http://gtfs-data-exchange.com).  See the [full list of agencies availale on GTFS data exchange](http://www.gtfs-data-exchange.com/api/agencies).

    // specifying a GTFS URL
    agencies: [
      {
        agency_key: 'eldoradotransit-ca-us',
        url: 'http://data.trilliumtransit.com/gtfs/eldoradotransit-ca-us/eldoradotransit-ca-us.zip'
      }
    ]

or

    // specify a gtfs-data-exchange `dataexchange_id`
    agencies: [
      'caltrain'
    ]

## Running

Ensure than mongodb is running locally.

    mongod

To generate HTML timetables, run the 'gtfs-to-html' script.

    npm run gtfs-to-html

This will download the GTFS file specified in `config.js` and then build the HTML timetables and save them in `html/:agency_key`.


## Testing

After an initial run of the `gtfs-to-html` script, the GTFS data will be downloaded and loaded into mongo.

You can view an individual route HTML on demand by running the included express app:

    DEBUG=gtfs-to-html npm start

With this running, you can open HTML `http://localhost:3000` in your browser and browser timetables.  Note that this only works after GTFS has been imported to mongodb and mongodb is running locally.
