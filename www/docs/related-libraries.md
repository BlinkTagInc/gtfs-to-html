---
id: related-libraries
title: Related Libraries
---

## `node-gtfs`

`gtfs-to-html` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data. It provides methods for loading transit data in GTFS format into a SQLite database and methods to query for agencies, routes, stops, times, fares, calendars and other GTFS data. It also offers spatial queries to find nearby stops, routes and agencies and can convert stops and shapes to geoJSON format.

[`https://github.com/blinktaginc/node-gtfs`](https://github.com/blinktaginc/node-gtfs)

## `gtfs-to-geojson`

[`gtfs-to-geojson`](https://github.com/blinktaginc/gtfs-to-geojson) converts transit data in GTFS format into geoJSON. This includes both shapes and stops. It can be configured to generate one geoJSON file per route or a single file which contains all routes for an agency. This is useful for creating maps of transit routes.

[`https://github.com/blinktaginc/gtfs-to-geojson`](https://github.com/blinktaginc/gtfs-to-geojson)

## `gtfs-to-chart`

[`gtfs-to-chart`](https://github.com/blinktaginc/gtfs-to-chart) generates a stringline chart in D3 using data from an agency's GTFS. This chart shows all trips for a specific route as they travel through space over a single day.

[`https://github.com/blinktaginc/gtfs-to-chart`](https://github.com/blinktaginc/gtfs-to-chart)
