---
id: introduction
title: Introduction
slug: /
---

GTFS-to-HTML creates human-readable, user-friendly transit timetables in HTML, PDF or CSV format directly from [GTFS transit data](https://developers.google.com/transit/gtfs/). Most transit agencies have schedule data in GTFS format but need to show each route's schedule to users on a website. This project automates the process of creating nicely formatted HTML timetables for inclusion on a transit agency website. This makes it easy to keep timetables up to date and accurate when schedule changes happen and reduces the likelihood of errors.

## Configurable and customizable

GTFS-to-HTML has many options that configure how timetables are presented. It also allows using a completely custom template which makes it easy to build chunks of HTML that will fit perfectly into any website using any HTML structure and classes that you'd like. Or, create printable PDF versions or CSV exports of timetables using the `outputFormat` config option.

## Accessibility for all

GTFS-to-HTML properly formats timetables to ensure they are screen-reader accessible and WCAG 2.0 compliant.

## Mobile responsiveness built in

Built-in styling makes GTFS-to-HTML timetables ready to size and scroll easily on mobile phones and tablets.

## Schedule changes? A cinch.

By generating future timetables and including dates in table metadata, your timetables can appear in advance of a schedule change, and you can validate that your new timetables and GTFS are correct.

## Notes

Custom notes, like "No express service during a full moon" can be programatically attached to stops, trips, timepoints or routes can be added using [additional files](/docs/additional-files).

## Auto-generated maps

GTFS-to-HTML can also generate a map for each route that can be included with the schedule page. The map shows all stops for the route and lists all routes that serve each stop. See the `showMap` configuration option below.

Note: If you only want maps of GTFS data, use the [gtfs-to-geojson](https://github.com/blinktaginc/gtfs-to-geojson) package instead and skip making timetables entirely. If offers many different formats of GeoJSON for routes and stops.

GTFS-to-HTML uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data.

## GTFS-to-HTML on the web

If you'd like to try out GTFS-to-HTML, you can do so entirely in your browser. [run.gtfstohtml.com](https://run.gtfstohtml.com) provides a web based interface for finding GTFS feeds, setting configuration and then generating downloadable sets of timetables. Use GTFS-to-HTML without actually downloading any code or doing any configuration!
