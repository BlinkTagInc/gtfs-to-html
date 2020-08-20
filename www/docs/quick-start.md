---
id: quick-start
title: Quick Start
---

## Command Line Usage

The `gtfs-to-html` command-line utility will download the GTFS file specified in `config.js` and then build the HTML timetables and save them in `html/:agency_key`.

If you would like to use this library as a command-line utility, you can install it globally directly from [npm](https://npmjs.org):

    npm install gtfs-to-html -g

Then you can run `gtfs-to-html`.

    gtfs-to-html

### Command-line options

`configPath`

Allows specifying a path to a configuration json file. By default, `gtfs-to-html` will look for a `config.json` file in the directory it is being run from.

    gtfs-to-html --configPath /path/to/your/custom-config.json

`skipImport`

Skips importing GTFS into SQLite. Useful if you are rerunning with an unchanged GTFS file. If you use this option and the GTFS file hasn't been imported, you'll get an error.

    gtfs-to-html --skipImport


### Processing very large GTFS files.

By default, node has a memory limit of 512 MB or 1 GB. If you have a very large GTFS file and want to use the option `showOnlyTimepoint` = `false` you may need to allocate more memory. Use the `max-old-space-size` option. For example to allocate 2 GB:

    node --max-old-space-size=2000 /usr/local/bin/gtfs-to-html

## Usage as a node module

If you are using this as a node module as part of an application, you can include it in your project's `package.json` file.

### Code example

```javascript
    const gtfsToHTML = require('gtfs-to-html');
    const config = require('config.json');

    gtfsToHTML(config)
    .then(() => {
      console.log('HTML Generation Successful');
      process.exit();
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
```

### Example Application
An example Express application that uses `gtfs-to-html` is included in the `app` folder. After an initial run of `gtfs-to-html`, the GTFS data will be downloaded and loaded into SQLite.

You can view an individual route HTML on demand by running the included Express app:

    node app

By default, `gtfs-to-html` will look for a `config.json` file in the project root. To specify a different path for the configuration file:

    node app --configPath /path/to/your/custom-config.json

Once running, you can view the HTML in your browser at [localhost:3000](http://localhost:3000)


## Usage as a hosted web app

A [hosted version of GTFS-to-HTML as a service](https://run.gtfstohtml.com) allows you to use it entirely within your browser - no downloads or command line necessary.

It provides:

* a web-based interface for finding GTFS feeds or ability to enter your own URL
* support for adding [custom configuration](/docs/configuration) as JSON
* creation of HTML timetables as a downloadable .zip file
* a preview of all timetables generated directly in your browser

[run.gtfstohtml.com](https://run.gtfstohtml.com)

Currently, it is limited to relatively small GTFS files and doesn't offer support for [Custom Templates](/docs/custom-templates).
