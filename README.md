
# GTFS to HTML

[![NPM version](https://img.shields.io/npm/v/gtfs-to-html.svg?style=flat)](https://www.npmjs.com/package/gtfs-to-html)
[![David](https://img.shields.io/david/blinktaginc/gtfs-to-html.svg)]()
[![npm](https://img.shields.io/npm/dm/gtfs-to-html.svg?style=flat)]()
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

[![NPM](https://nodei.co/npm/gtfs-to-html.png?downloads=true)](https://nodei.co/npm/gtfs-to-html/)

 See [gtfstohtml.com](https://gtfstohtml.com) for full documentation.

`gtfs-to-html` creates human-readable, user-friendly transit timetables in HTML and PDF format directly from [GTFS transit data](https://developers.google.com/transit/gtfs/). Most transit agencies have schedule data in GTFS format but need to show each route's schedule to users on a website. This project automates the process of creating nicely formatted HTML timetables for inclusion on a transit agency website. This makes it easy to keep timetables up to date and accurate when schedule changes happen and reduces the likelihood of errors.

<img width="1265" src="https://user-images.githubusercontent.com/96217/28296063-aed45568-6b1a-11e7-9794-94b3d915d668.png">

## Features

### Configurable and customizable
`gtfs-to-html` has many options that configure how timetables are presented. It also allows using a completely custom template which makes it easy to build chunks of HTML that will fit perfectly into any website using any HTML structure and classes that you'd like. Or, create printable PDF versions of timetables using the `outputFormat` config option.

### Accessibility for all
`gtfs-to-html` properly formats timetables to ensure they are screen-reader accessible and WCAG 2.0 compliant.

### Mobile responsiveness built in
Built-in styling makes `gtfs-to-html` timetables ready to size and scroll easily on mobile phones and tablets.

### Schedule changes? A cinch.
By generating future timetables and including dates in table metadata, your timetables can appear in advance of a schedule change, and you can validate that your new timetables and GTFS are correct.

### Auto-generated maps
`gtfs-to-html` can also generate a map for each route that can be included with the schedule page. The map shows all stops for the route and lists all routes that serve each stop. See the `showMap` configuration option below. 

Note: If you only want maps of GTFS data, use the [gtfs-to-geojson](https://github.com/blinktaginc/gtfs-to-geojson) package instead and skip making timetables entirely. If offers many different formats of GeoJSON for routes and stops.

`gtfs-to-html` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data.

## GTFS-to-HTML on the web

You can now use `gtfs-to-html` without actually downloading any code or doing any configuration. [run.gtfstohtml.com](https://run.gtfstohtml.com) provides a web based interface for finding GTFS feeds for agencies, setting configuration and then generates a previewable and downloadable set of timetables.

## Current Usage
Many transit agencies use `gtfs-to-html` to generate the schedule pages used on their websites, including:

* [Advance Transit](https://advancetransit.com/)
* [Brockton Area Transit Authority](https://ridebat.com/)
* [Capital Transit (Helena, Montana)](http://www.ridethecapitalt.org/)
* [Capital Transit (Juneau, Alaska)](https://juneaucapitaltransit.org/)
* [County Connection (Contra Costa County, California)](https://countyconnection.com)
* [El Dorado Transit](http://eldoradotransit.com/)
* [Greater Attleboro-Taunton Regional Transit Authority](https://www.gatra.org/)
* [Humboldt Transit Authority](http://hta.org/)
* [Kings Area Rural Transit (KART)](https://www.kartbus.org/)
* [Madera County Connection](http://mcctransit.com/)
* [Marin Transit](https://marintransit.org/)
* [Morongo Basin Transit Authority](https://mbtabus.com/)
* [Mountain Transit](http://mountaintransit.org/)
* [MVgo (Mountain View, CA)](https://mvgo.org/)
* [NW Connector (Oregon)](http://www.nworegontransit.org/)
* [Palo Verde Valley Transit Agency](http://pvvta.com/)
* [Petaluma Transit](http://transit.cityofpetaluma.net/)
* [RTC Washoe (Reno, NV)](https://www.rtcwashoe.com/)
* [Santa Barbara Metropolitan Transit District](https://sbmtd.gov)
* [Sonoma County Transit](http://sctransit.com/)
* [Tahoe Truckee Area Regional Transit](https://tahoetruckeetransit.com/)
* [Tulare County Area Transit](https://ridetcat.org/)
* [Victor Valley Transit](https://vvta.org/)
* [Worcester Regional Transit Authority](https://therta.com/)

Are you using `gtfs-to-html`? Let us know via email (brendan@blinktag.com) or via opening a github issue or pull request if your agency is using this library.

`gtfs-to-html` is used as an integral part of [`transit-custom-posts`](https://trilliumtransit.github.io/transit-custom-posts/) - a GTFS-optimized Wordpress plugin for transit websites.

<img width="1265" src="https://user-images.githubusercontent.com/96217/28296063-aed45568-6b1a-11e7-9794-94b3d915d668.png">

<img width="1265" src="https://user-images.githubusercontent.com/96217/29205138-dd3ee5c6-7e2f-11e7-9d86-f17cebd5f118.png">

## Installation, Configuration and Usage documentation

[See GTFS-to-HTML Documentation](https://gtfstohtml.com)

## Changelog

[See Changelog](https://github.com/blinktaginc/gtfs-to-html/blob/master/CHANGELOG.md)

## Contributing

Pull requests are welcome, as well as [feedback and reporting issues](https://github.com/blinktaginc/gtfs-to-html/issues).

## Tests

    npm test
