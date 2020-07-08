---
id: related-libraries
title: Related Libraries
---

## `node-gtfs`

`gtfs-to-html` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data. It provides methos for laoding transit data in GTFS format into a MongoDB database and methods to query for agencies, routes, stops, times, fares, calendars and other GTFS data. It also offers spatial queries to find nearby stops, routes and agencies and can convert stops and shapes to geoJSON format.

[`https://github.com/blinktaginc/node-gtfs`](https://github.com/blinktaginc/node-gtfs)

## `gtfs-to-geojson`

[`gtfs-to-geojson`](https://github.com/blinktaginc/gtfs-to-geojson) converts transit data in GTFS format into geoJSON. This includes both shapes and stops. It can be configured to generate one geoJSON file per route or a single file which contains all routes for an agency. This is useful for creating maps of transit routes.

[`https://github.com/blinktaginc/gtfs-to-geojson`](https://github.com/blinktaginc/gtfs-to-geojson)
