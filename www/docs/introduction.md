---
id: introduction
title: Introduction
---

`GTFS-to-HTML` creates human-readable, user-friendly transit timetables in HTML and PDF format directly from [GTFS transit data](https://developers.google.com/transit/gtfs/). Most transit agencies have schedule data in GTFS format but need to show each route's schedule to users on a website. This project automates the process of creating nicely formatted HTML timetables for inclusion on a transit agency website. This makes it easy to keep timetables up to date and accurate when schedule changes happen and reduces the likelihood of errors.


## Configurable and customizable
`gtfs-to-html` has many options that configure how timetables are presented. It also allows using a completely custom template which makes it easy to build chunks of HTML that will fit perfectly into any website using any HTML structure and classes that you'd like. Or, create printable PDF versions of timetables using the `outputFormat` config option.

## Accessibility for all
`gtfs-to-html` properly formats timetables to ensure they are screen-reader accessible and WCAG 2.0 compliant.

## Mobile responsiveness built in
Built-in styling makes `gtfs-to-html` timetables ready to size and scroll easily on mobile phones and tablets.

## Schedule changes? A cinch.
By generating future timetables and including dates in table metadata, your timetables can appear in advance of a schedule change, and you can validate that your new timetables and GTFS are correct.

## Auto-generated maps
`gtfs-to-html` can also generate a map for each route that can be included with the schedule page. The map shows all stops for the route and lists all routes that serve each stop. See the `showMap` configuration option below. If you'd rather just get all stops and route info as geoJSON, check out the  [gtfs-to-geojson](https://github.com/blinktaginc/gtfs-to-geojson) package.

`gtfs-to-html` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data.

## GTFS-to-HTML on the web

You can now use `gtfs-to-html` without actually downloading any code or doing any configuration. [gtfstohtml.com](https://gtfstohtml.com) provides a web based interface for finding GTFS feeds for agenices, setting configuration and then generates a previewable and downloadable set of timetables.


