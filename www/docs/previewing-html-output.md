---
id: previewing-html-output
title: Previewing HTML output
---

## Previewing HTML output

It can be useful to run the example Express application included in the `app` folder as a way to quickly preview all routes or see changes you are making to custom template.

After an initial run of `gtfs-to-html`, the GTFS data will be downloaded and loaded into SQLite.

You can view an individual route HTML on demand by running the included Express app:

    node app

By default, `gtfs-to-html` will look for a `config.json` file in the project root. To specify a different path for the configuration file:

    node app --configPath /path/to/your/custom-config.json

Once running, you can view the HTML in your browser at [localhost:3000](http://localhost:3000)
